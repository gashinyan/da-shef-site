import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access, chmod, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)));
const SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];
const PERSONAL_DATA_VERSION = "DA-CHEF-PD-2026-07-18";
const MARKETING_VERSION = "DA-CHEF-MARKETING-2026-07-18";
const ORDER_STATUSES = new Set(["new", "confirmed", "in_progress", "completed", "cancelled"]);
const CATALOG = new Map([
  ["edge", { name: "EDGE", price: 6000, sizes: SIZES, colors: { white: "Белый", navy: null, black: "Черный" } }],
  ["daily", { name: "DAILY", price: 5000, sizes: SIZES, colors: { white: "Белый", navy: null, black: "Черный" } }],
  ["line", { name: "LINE", price: 4000, sizes: SIZES, colors: { white: "Белый", navy: null, black: "Черный" } }],
  ["apron", { name: "ФАРТУК", price: 2000, sizes: SIZES, colors: { white: "Белый", blue: "Синий", black: "Черный" } }],
  ["pants", { name: "ПОВАРСКИЕ БРЮКИ", price: 2500, sizes: SIZES, colors: { black: "Черный" } }],
  [
    "docker",
    {
      name: "ДОКЕР",
      price: 1000,
      sizes: ["Универсальный"],
      colors: { milk: "Молочный", khaki: "Хаки", blue: "Синий", black: "Черный" },
    },
  ],
]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; upgrade-insecure-requests",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function envBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
}

function createConfig(overrides = {}) {
  return {
    port: Number(process.env.PORT || 3000),
    publicDir: resolve(process.env.PUBLIC_DIR || ROOT_DIR),
    dataDir: resolve(process.env.DATA_DIR || resolve(ROOT_DIR, "data")),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "https://dachef.shop",
    orderEnabled: envBoolean(process.env.ORDER_API_ENABLED, false),
    trustProxy: envBoolean(process.env.TRUST_PROXY, true),
    adminUsername: process.env.ADMIN_USERNAME || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
    maxBodyBytes: 32 * 1024,
    maxOrdersPerHour: 20,
    ...overrides,
  };
}

function applyHeaders(response, extra = {}) {
  for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...extra })) {
    response.setHeader(name, value);
  }
}

function sendJson(response, status, body) {
  applyHeaders(response, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

function sendHtml(response, status, html) {
  applyHeaders(response, { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" });
  response.writeHead(status);
  response.end(html);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function isAdmin(request, config) {
  if (!config.adminPassword) return false;
  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return (
      safeEqual(decoded.slice(0, separator), config.adminUsername) &&
      safeEqual(decoded.slice(separator + 1), config.adminPassword)
    );
  } catch {
    return false;
  }
}

function requireAdmin(request, response, config) {
  if (!config.adminPassword) {
    sendHtml(response, 503, adminShell("Реестр недоступен", "<p>Пароль администратора ещё не настроен.</p>"));
    return false;
  }
  if (isAdmin(request, config)) return true;
  applyHeaders(response, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="DA CHEF orders", charset="UTF-8"',
  });
  response.writeHead(401);
  response.end("Требуется авторизация");
  return false;
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Слишком большой запрос");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(request, limit) {
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Ожидается JSON");
  }
  try {
    return JSON.parse(await readBody(request, limit));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Некорректный JSON");
  }
}

function cleanString(value, { name, max, required = false } = {}) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new HttpError(422, `Заполните поле «${name}»`);
  if (result.length > max) throw new HttpError(422, `Поле «${name}» слишком длинное`);
  return result;
}

function validateCustomer(input = {}) {
  const customer = {
    name: cleanString(input.name, { name: "Имя", max: 100, required: true }),
    phone: cleanString(input.phone, { name: "Телефон", max: 40, required: true }),
    email: cleanString(input.email, { name: "Email", max: 160 }),
    birthday: cleanString(input.birthday, { name: "Дата рождения", max: 10 }),
    messenger: cleanString(input.messenger, { name: "Мессенджер", max: 160 }),
    city: cleanString(input.city, { name: "Город", max: 120, required: true }),
    comment: cleanString(input.comment, { name: "Комментарий", max: 1500 }),
  };
  const digits = customer.phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) throw new HttpError(422, "Проверьте номер телефона");
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    throw new HttpError(422, "Проверьте email");
  }
  if (customer.birthday) {
    const birthday = new Date(`${customer.birthday}T00:00:00Z`);
    if (Number.isNaN(birthday.getTime()) || birthday > new Date()) {
      throw new HttpError(422, "Проверьте дату рождения");
    }
  }
  return customer;
}

function validateItems(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) {
    throw new HttpError(422, "Корзина пуста или содержит слишком много позиций");
  }
  const merged = new Map();
  for (const line of input) {
    const product = CATALOG.get(line?.productId);
    if (!product) throw new HttpError(422, "В корзине найден неизвестный товар");
    if (!Object.hasOwn(product.colors, line.colorId)) throw new HttpError(422, "Недоступный цвет товара");
    const colorLabel = product.colors[line.colorId];
    if (!colorLabel) throw new HttpError(422, "Выбранный цвет пока нельзя заказать");
    if (!product.sizes.includes(line.size)) throw new HttpError(422, "Недоступный размер товара");
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100) {
      throw new HttpError(422, "Некорректное количество товара");
    }
    const key = `${line.productId}:${line.colorId}:${line.size}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      if (existing.quantity > 100) throw new HttpError(422, "Слишком большое количество одной позиции");
    } else {
      merged.set(key, {
        productId: line.productId,
        productName: product.name,
        colorId: line.colorId,
        colorLabel,
        size: line.size,
        quantity: line.quantity,
        unitPrice: product.price,
      });
    }
  }
  return [...merged.values()].map((line) => ({ ...line, lineTotal: line.unitPrice * line.quantity }));
}

function calculateSummary(items) {
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = quantity >= 25 ? Math.round(subtotal * 0.15) : 0;
  return {
    quantity,
    subtotal,
    discount,
    total: subtotal - discount,
    embroideryGift: quantity >= 10,
  };
}

function validateOrder(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new HttpError(400, "Некорректная заявка");
  if (payload.website) return { honeypot: true };
  const customer = validateCustomer(payload.customer);
  const personalData = payload.consents?.personalData === true;
  const marketing = payload.consents?.marketing === true;
  if (!personalData) throw new HttpError(422, "Необходимо согласие на обработку персональных данных");
  if (customer.birthday && !marketing) throw new HttpError(422, "Для даты рождения требуется отдельное согласие");
  if (marketing && !customer.birthday) throw new HttpError(422, "Для персональной скидки укажите дату рождения");
  const items = validateItems(payload.items);
  return { customer, items, marketing, summary: calculateSummary(items) };
}

function createOrderId(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `DC-${date}-${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;
}

function orderFile(dataDir, id) {
  if (!/^DC-\d{8}-[A-F0-9]{6}$/.test(id)) throw new HttpError(404, "Заявка не найдена");
  return resolve(dataDir, "orders", `${id}.json`);
}

async function ensureOrderDirectory(dataDir) {
  const directory = resolve(dataDir, "orders");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  return directory;
}

async function saveNewOrder(dataDir, order) {
  await ensureOrderDirectory(dataDir);
  await writeFile(orderFile(dataDir, order.id), `${JSON.stringify(order, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

async function readOrder(dataDir, id) {
  try {
    return JSON.parse(await readFile(orderFile(dataDir, id), "utf8"));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.code === "ENOENT") throw new HttpError(404, "Заявка не найдена");
    throw error;
  }
}

async function listOrders(dataDir) {
  const directory = await ensureOrderDirectory(dataDir);
  const files = (await readdir(directory)).filter((name) => /^DC-\d{8}-[A-F0-9]{6}\.json$/.test(name));
  const orders = await Promise.all(
    files.map(async (name) => {
      try {
        return JSON.parse(await readFile(resolve(directory, name), "utf8"));
      } catch {
        return null;
      }
    })
  );
  return orders.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function updateOrderStatus(dataDir, id, status) {
  if (!ORDER_STATUSES.has(status)) throw new HttpError(422, "Неизвестный статус");
  const order = await readOrder(dataDir, id);
  order.status = status;
  order.updatedAt = new Date().toISOString();
  const target = orderFile(dataDir, id);
  const temporary = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(order, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
  return order;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function adminShell(title, content) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · DA CHEF</title><style>
  :root{color-scheme:dark;font-family:Arial,sans-serif;background:#0c0d0e;color:#f5f5f2}*{box-sizing:border-box}body{margin:0}a{color:inherit}header,main{width:min(1180px,calc(100% - 32px));margin:auto}header{display:flex;justify-content:space-between;align-items:center;padding:24px 0;border-bottom:1px solid #333}main{padding:28px 0 60px}.muted{color:#aaa}.grid{display:grid;gap:14px}.card{background:#17191a;border:1px solid #303335;border-radius:14px;padding:18px}.order-head{display:flex;gap:18px;justify-content:space-between;align-items:start}.pill{display:inline-block;padding:5px 9px;border:1px solid #555;border-radius:99px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #333;vertical-align:top}input,select,button{font:inherit;padding:9px;border:1px solid #555;border-radius:8px;background:#101112;color:#fff}button{cursor:pointer;background:#eee;color:#111;font-weight:700}.contact{display:grid;gap:7px}.items{margin:12px 0;padding-left:20px}@media(max-width:700px){table,.table-wrap{font-size:13px}.table-wrap{overflow:auto}.order-head{display:block}.order-head form{margin-top:12px}}
  </style></head><body><header><strong>DA CHEF · заявки</strong><nav><a href="/admin/orders">Все заявки</a> · <a href="/admin/orders.csv">CSV</a> · <a href="/">Сайт</a></nav></header><main>${content}</main></body></html>`;
}

function statusOptions(selected) {
  const labels = { new: "Новая", confirmed: "Подтверждена", in_progress: "В работе", completed: "Завершена", cancelled: "Отменена" };
  return Object.entries(labels)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function adminOrderCard(order, detailed = false) {
  const items = order.items
    .map(
      (item) =>
        `<li>${escapeHtml(item.productName)} / ${escapeHtml(item.colorLabel)} / ${escapeHtml(item.size)} × ${item.quantity} — ${money(item.lineTotal)}</li>`
    )
    .join("");
  const details = detailed
    ? `<div class="contact"><span>Телефон: <a href="tel:${escapeHtml(order.customer.phone)}">${escapeHtml(order.customer.phone)}</a></span><span>Email: ${escapeHtml(order.customer.email || "не указан")}</span><span>Мессенджер: ${escapeHtml(order.customer.messenger || "не указан")}</span><span>Город: ${escapeHtml(order.customer.city)}</span><span>Дата рождения: ${escapeHtml(order.customer.birthday || "не указана")}</span><span>Комментарий: ${escapeHtml(order.customer.comment || "нет")}</span><span>Маркетинговое согласие: ${order.consents.marketing ? escapeHtml(order.consents.marketingVersion) : "нет"}</span></div>`
    : `<p class="muted">${escapeHtml(order.customer.city)} · ${escapeHtml(order.customer.phone)}</p>`;
  return `<article class="card"><div class="order-head"><div><a href="/admin/orders/${encodeURIComponent(order.id)}"><strong>${escapeHtml(order.id)}</strong></a><p>${escapeHtml(order.customer.name)} · ${new Date(order.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}</p><span class="pill">${escapeHtml(order.status)}</span></div><form method="post" action="/admin/orders/${encodeURIComponent(order.id)}/status"><select name="status">${statusOptions(order.status)}</select> <button type="submit">Сохранить</button></form></div><ul class="items">${items}</ul><p><strong>Итого: ${money(order.summary.total)}</strong>${order.summary.discount ? ` · скидка ${money(order.summary.discount)}` : ""}</p>${details}</article>`;
}

function ordersCsv(orders) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["Номер", "Дата", "Статус", "Имя", "Телефон", "Email", "Мессенджер", "Город", "Дата рождения", "Состав", "Итого"]];
  for (const order of orders) {
    rows.push([
      order.id,
      order.createdAt,
      order.status,
      order.customer.name,
      order.customer.phone,
      order.customer.email,
      order.customer.messenger,
      order.customer.city,
      order.customer.birthday,
      order.items.map((item) => `${item.productName}/${item.colorLabel}/${item.size} x${item.quantity}`).join("; "),
      order.summary.total,
    ]);
  }
  return `\uFEFF${rows.map((row) => row.map(quote).join(";")).join("\r\n")}\r\n`;
}

async function notifyTelegram(order, config) {
  if (!config.telegramBotToken || !config.telegramChatId) return;
  const adminUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/admin/orders/${encodeURIComponent(order.id)}`;
  const text = [`Новая заявка DA CHEF`, `№ ${order.id}`, `Позиций: ${order.summary.quantity}`, `Сумма: ${money(order.summary.total)}`, adminUrl].join("\n");
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegramChatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error(`Telegram notification failed with status ${response.status}`);
  } catch (error) {
    console.error(`Telegram notification failed: ${error.message}`);
  }
}

function clientKey(request, config) {
  if (config.trustProxy && request.headers["x-forwarded-for"]) return String(request.headers["x-forwarded-for"]).split(",")[0].trim();
  return request.socket.remoteAddress || "unknown";
}

function createRateLimiter(config) {
  const clients = new Map();
  return (request) => {
    const now = Date.now();
    const key = clientKey(request, config);
    const recent = (clients.get(key) || []).filter((timestamp) => now - timestamp < 60 * 60 * 1000);
    if (recent.length >= config.maxOrdersPerHour) throw new HttpError(429, "Слишком много попыток. Попробуйте позже");
    recent.push(now);
    clients.set(key, recent);
    if (clients.size > 10000) clients.clear();
  };
}

function isAllowedStaticPath(pathname) {
  return (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/styles.css" ||
    pathname === "/privacy.html" ||
    pathname === "/personal-data-consent.html" ||
    pathname === "/marketing-consent.html" ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/scripts/")
  );
}

async function serveStatic(request, response, pathname, config) {
  if (!isAllowedStaticPath(pathname) || pathname.includes("\0")) throw new HttpError(404, "Страница не найдена");
  const relative = pathname === "/" ? "/index.html" : pathname;
  const file = resolve(config.publicDir, `.${relative}`);
  if (file !== config.publicDir && !file.startsWith(`${config.publicDir}${sep}`)) throw new HttpError(404, "Страница не найдена");
  await access(file);
  const fileStat = await stat(file);
  if (!fileStat.isFile()) throw new HttpError(404, "Страница не найдена");
  const extension = extname(file).toLowerCase();
  const cache = relative.startsWith("/assets/") ? "public, max-age=604800" : "no-cache";
  applyHeaders(response, {
    "Cache-Control": cache,
    "Content-Length": fileStat.size,
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Last-Modified": fileStat.mtime.toUTCString(),
  });
  response.writeHead(200);
  if (request.method === "HEAD") return response.end();
  createReadStream(file).pipe(response);
}

function sameOrigin(request, config) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const allowedOrigins = new Set([new URL(config.publicBaseUrl).origin]);
    const forwardedHost = config.trustProxy
      ? String(request.headers["x-forwarded-host"] || "").split(",")[0].trim()
      : "";
    const host = forwardedHost || request.headers.host;
    if (host) {
      const forwardedProtocol = config.trustProxy
        ? String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim()
        : "";
      const protocol = forwardedProtocol || (request.socket.encrypted ? "https" : "http");
      allowedOrigins.add(new URL(`${protocol}://${host}`).origin);
    }
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function createShopServer(overrides = {}) {
  const config = createConfig(overrides);
  const limitOrder = createRateLimiter(config);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const pathname = decodeURIComponent(url.pathname);

      if (request.method === "GET" && pathname === "/api/health") {
        return sendJson(response, 200, { ok: true, ordersEnabled: config.orderEnabled });
      }

      if (request.method === "POST" && pathname === "/api/order") {
        if (!config.orderEnabled) throw new HttpError(503, "Приём заявок временно недоступен");
        if (!sameOrigin(request, config)) throw new HttpError(403, "Недопустимый источник запроса");
        limitOrder(request);
        const validated = validateOrder(await readJson(request, config.maxBodyBytes));
        if (validated.honeypot) return sendJson(response, 202, { ok: true, orderId: createOrderId() });
        const now = new Date();
        const order = {
          id: createOrderId(now),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          status: "new",
          customer: validated.customer,
          items: validated.items,
          summary: validated.summary,
          consents: {
            personalData: true,
            personalDataVersion: PERSONAL_DATA_VERSION,
            marketing: validated.marketing,
            marketingVersion: validated.marketing ? MARKETING_VERSION : null,
          },
        };
        await saveNewOrder(config.dataDir, order);
        void notifyTelegram(order, config);
        return sendJson(response, 201, { ok: true, orderId: order.id });
      }

      if (pathname.startsWith("/admin/orders")) {
        if (!requireAdmin(request, response, config)) return;
        if (request.method === "GET" && pathname === "/admin/orders") {
          const orders = await listOrders(config.dataDir);
          return sendHtml(
            response,
            200,
            adminShell("Заявки", `<h1>Заявки <span class="muted">${orders.length}</span></h1><div class="grid">${orders.length ? orders.map((order) => adminOrderCard(order)).join("") : '<p class="muted">Заявок пока нет.</p>'}</div>`)
          );
        }
        if (request.method === "GET" && pathname === "/admin/orders.csv") {
          const csv = ordersCsv(await listOrders(config.dataDir));
          applyHeaders(response, {
            "Cache-Control": "no-store",
            "Content-Disposition": 'attachment; filename="da-chef-orders.csv"',
            "Content-Type": "text/csv; charset=utf-8",
          });
          response.writeHead(200);
          return response.end(csv);
        }
        const detailMatch = pathname.match(/^\/admin\/orders\/(DC-\d{8}-[A-F0-9]{6})$/);
        if (request.method === "GET" && detailMatch) {
          const order = await readOrder(config.dataDir, detailMatch[1]);
          return sendHtml(response, 200, adminShell(order.id, `<h1>${escapeHtml(order.id)}</h1>${adminOrderCard(order, true)}`));
        }
        const statusMatch = pathname.match(/^\/admin\/orders\/(DC-\d{8}-[A-F0-9]{6})\/status$/);
        if (request.method === "POST" && statusMatch) {
          if (!sameOrigin(request, config)) throw new HttpError(403, "Недопустимый источник запроса");
          const body = new URLSearchParams(await readBody(request, 1024));
          await updateOrderStatus(config.dataDir, statusMatch[1], body.get("status"));
          response.writeHead(303, { Location: `/admin/orders/${statusMatch[1]}` });
          return response.end();
        }
        throw new HttpError(404, "Страница не найдена");
      }

      if ((request.method === "GET" || request.method === "HEAD") && !pathname.startsWith("/api/")) {
        return await serveStatic(request, response, pathname, config);
      }
      throw new HttpError(404, "Страница не найдена");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error?.code === "ENOENT" ? 404 : 500;
      const message = status === 500 ? "Внутренняя ошибка сервера" : error.message;
      if (status === 500) console.error(error);
      if (String(request.url || "").startsWith("/api/")) return sendJson(response, status, { ok: false, error: message });
      return sendHtml(response, status, adminShell(String(status), `<h1>${status}</h1><p>${escapeHtml(message)}</p>`));
    }
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  return { server, config };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { server, config } = createShopServer();
  await ensureOrderDirectory(config.dataDir);
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`DA CHEF listening on port ${config.port}; orders=${config.orderEnabled ? "enabled" : "disabled"}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
