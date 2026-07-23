import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createShopServer } from "../server.mjs";

const validPayload = {
  website: "",
  customer: {
    name: "Тестовый покупатель",
    phone: "+7 918 000-00-00",
    email: "buyer@example.com",
    birthday: "",
    messenger: "@buyer",
    city: "Ростов-на-Дону",
    comment: "Позвонить после 12:00",
  },
  items: [{ productId: "edge", colorId: "black", size: "M", quantity: 2 }],
  consents: { personalData: true, marketing: false },
};

async function start(overrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "da-chef-test-"));
  const { server } = createShopServer({
    dataDir,
    publicDir: resolve(import.meta.dirname, ".."),
    orderEnabled: true,
    trustProxy: false,
    adminUsername: "admin",
    adminPassword: "test-password",
    publicBaseUrl: "http://127.0.0.1",
    maxOrdersPerHour: 100,
    ...overrides,
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  return {
    dataDir,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise((resolveClose) => server.close(resolveClose));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

function basicAuth() {
  return `Basic ${Buffer.from("admin:test-password").toString("base64")}`;
}

test("creates, persists and manages an order", async (t) => {
  const app = await start();
  t.after(app.close);

  const health = await fetch(`${app.baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, ordersEnabled: true });

  const response = await fetch(`${app.baseUrl}/api/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.match(result.orderId, /^DC-\d{8}-[A-F0-9]{6}$/);

  const files = await readdir(join(app.dataDir, "orders"));
  assert.deepEqual(files, [`${result.orderId}.json`]);
  const stored = JSON.parse(await readFile(join(app.dataDir, "orders", files[0]), "utf8"));
  assert.equal(stored.summary.subtotal, 12000);
  assert.equal(stored.summary.discount, 0);
  assert.equal(stored.summary.total, 12000);
  assert.equal(stored.consents.personalDataVersion, "DA-CHEF-PD-2026-07-18");

  const unauthorized = await fetch(`${app.baseUrl}/admin/orders`);
  assert.equal(unauthorized.status, 401);

  const admin = await fetch(`${app.baseUrl}/admin/orders`, { headers: { Authorization: basicAuth() } });
  assert.equal(admin.status, 200);
  assert.match(await admin.text(), new RegExp(result.orderId));

  const status = await fetch(`${app.baseUrl}/admin/orders/${result.orderId}/status`, {
    method: "POST",
    redirect: "manual",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: "status=confirmed",
  });
  assert.equal(status.status, 303);
  const updated = JSON.parse(await readFile(join(app.dataDir, "orders", files[0]), "utf8"));
  assert.equal(updated.status, "confirmed");
});

test("rejects coming-soon products and inconsistent birthday consent", async (t) => {
  const app = await start();
  t.after(app.close);

  const comingSoon = structuredClone(validPayload);
  comingSoon.items[0].colorId = "navy";
  const colorResponse = await fetch(`${app.baseUrl}/api/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(comingSoon),
  });
  assert.equal(colorResponse.status, 422);
  assert.match((await colorResponse.json()).error, /пока нельзя заказать/);

  const birthday = structuredClone(validPayload);
  birthday.customer.birthday = "1990-05-10";
  const birthdayResponse = await fetch(`${app.baseUrl}/api/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(birthday),
  });
  assert.equal(birthdayResponse.status, 422);
  assert.match((await birthdayResponse.json()).error, /отдельное согласие/);
});

test("does not store honeypot submissions", async (t) => {
  const app = await start();
  t.after(app.close);
  const spam = structuredClone(validPayload);
  spam.website = "https://spam.example";
  const response = await fetch(`${app.baseUrl}/api/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spam),
  });
  assert.equal(response.status, 202);
  const files = await readdir(join(app.dataDir, "orders")).catch(() => []);
  assert.equal(files.length, 0);
});

test("keeps order intake disabled by default", async (t) => {
  const app = await start({ orderEnabled: false });
  t.after(app.close);
  const response = await fetch(`${app.baseUrl}/api/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  assert.equal(response.status, 503);
});

test("accepts the proxied www host and rejects foreign origins", async (t) => {
  const app = await start({ publicBaseUrl: "https://dachef.shop", trustProxy: true });
  t.after(app.close);
  const proxyHeaders = {
    "Content-Type": "application/json",
    Origin: "https://www.dachef.shop",
    "X-Forwarded-Host": "www.dachef.shop",
    "X-Forwarded-Proto": "https",
  };
  const accepted = await fetch(`${app.baseUrl}/api/order`, {
    method: "POST",
    headers: proxyHeaders,
    body: JSON.stringify(validPayload),
  });
  assert.equal(accepted.status, 201);

  const rejected = await fetch(`${app.baseUrl}/api/order`, {
    method: "POST",
    headers: { ...proxyHeaders, Origin: "https://example.com" },
    body: JSON.stringify(validPayload),
  });
  assert.equal(rejected.status, 403);
});
