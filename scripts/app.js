(function () {
  "use strict";

  const products = window.DA_CHEF_PRODUCTS;
  const terms = window.DA_CHEF_TERMS;
  const config = window.DA_CHEF_CONFIG;
  const storageKey = "da-chef-cart-v1";

  const grid = document.querySelector("[data-product-grid]");
  const filters = document.querySelector("[data-filters]");
  const offers = document.querySelector("[data-offers]");
  const cartDrawer = document.querySelector("[data-cart-drawer]");
  const cartLines = document.querySelector("[data-cart-lines]");
  const cartSummary = document.querySelector("[data-cart-summary]");
  const overlay = document.querySelector("[data-overlay]");
  const checkoutModal = document.querySelector("[data-checkout-modal]");
  const checkoutForm = document.querySelector("[data-checkout-form]");
  const checkoutSuccess = document.querySelector("[data-checkout-success]");
  const orderPreview = document.querySelector("[data-order-preview]");
  const toast = document.querySelector("[data-toast]");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");

  const state = {
    filter: "jackets",
    cart: loadCart(),
    selections: Object.fromEntries(
      products.map((product) => [
        product.id,
        {
          color: (product.colors.find((color) => !color.comingSoon) || product.colors[0]).id,
          size: product.sizes.length === 1 ? product.sizes[0] : "",
          quantity: 1,
          image: 0,
          invalid: false,
          added: false,
        },
      ])
    ),
  };

  function money(value) {
    return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
  }

  function productById(id) {
    return products.find((product) => product.id === id);
  }

  function colorById(product, id) {
    return product.colors.find((color) => color.id === id) || product.colors[0];
  }

  function loadCart() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (!Array.isArray(stored)) {
        return [];
      }
      return stored.filter((line) => {
        const product = productById(line.productId);
        return (
          product &&
          product.colors.some((color) => color.id === line.colorId && !color.comingSoon) &&
          product.sizes.includes(line.size) &&
          line.quantity > 0
        );
      });
    } catch (_error) {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(storageKey, JSON.stringify(state.cart));
    renderCart();
  }

  function calculateSummary() {
    const quantity = state.cart.reduce((total, line) => total + line.quantity, 0);
    const subtotal = state.cart.reduce((total, line) => {
      const product = productById(line.productId);
      return total + product.price * line.quantity;
    }, 0);
    const isDiscountEligible = quantity >= config.discountThreshold;
    const discount = isDiscountEligible ? Math.round(subtotal * config.discountRate) : 0;
    return {
      quantity,
      subtotal,
      discount,
      total: subtotal - discount,
      isDiscountEligible,
      hasEmbroideryGift: quantity >= config.embroideryGiftThreshold,
    };
  }

  function productPromo(quantity) {
    if (quantity >= config.discountThreshold) {
      return "Скидка до 15% будет учтена в корзине.";
    }
    if (quantity >= config.embroideryGiftThreshold) {
      return "Именная вышивка в подарок.";
    }
    return "";
  }

  function renderOffers() {
    offers.innerHTML = terms
      .map(
        (term) => `
          <article class="offer-card">
            <h3>${term.title}</h3>
            <p>${term.text}</p>
          </article>
        `
      )
      .join("");
  }

  function productCard(product) {
    const choice = state.selections[product.id];
    const color = colorById(product, choice.color);
    const promo = productPromo(choice.quantity);
    const sizes = product.sizes
      .map(
        (size) => `
          <button
            class="size-chip ${choice.size === size ? "active" : ""}"
            type="button"
            data-action="size"
            data-product="${product.id}"
            data-size="${size}"
            aria-pressed="${choice.size === size}"
          >${size}</button>
        `
      )
      .join("");
    const colors = product.colors
      .map(
        (variant) => {
          const disabled = Boolean(variant.comingSoon);
          return `
          <button
            class="swatch ${choice.color === variant.id ? "active" : ""} ${disabled ? "coming-soon" : ""}"
            type="button"
            data-action="color"
            data-product="${product.id}"
            data-color="${variant.id}"
            aria-label="${variant.label}${disabled ? " — Coming soon" : ""}"
            aria-pressed="${choice.color === variant.id}"
            ${disabled ? "disabled" : ""}
          >
            <span class="swatch-dot" style="background:${variant.hex}"></span>
            ${variant.label}
            ${disabled ? '<span class="soon-label">Coming soon</span>' : ""}
          </button>
        `;
        }
      )
      .join("");
    const thumbs = color.images
      .map(
        (source, index) => `
          <button
            class="thumb ${choice.image === index ? "active" : ""}"
            type="button"
            data-action="image"
            data-product="${product.id}"
            data-image="${index}"
            aria-label="Ракурс ${index + 1}"
          ><img src="${source}" alt="" loading="lazy"></button>
        `
      )
      .join("");

    return `
      <article class="product-card" data-card="${product.id}">
        <div class="product-gallery">
          <img
            class="product-main-image"
            src="${color.images[choice.image]}"
            alt="${product.name}, цвет ${color.label}"
            loading="lazy"
          >
          <span class="product-category">${product.categoryLabel}</span>
          <div class="thumbnails">${thumbs}</div>
        </div>
        <div class="product-body">
          <div class="product-heading">
            <div>
              <h3>${product.name}</h3>
              <p class="product-subtitle">${product.subtitle}</p>
            </div>
            <p class="product-price">${money(product.price)}</p>
          </div>
          <p class="product-description">${product.description}</p>
          <div class="choice-group">
            <span class="choice-label">Цвет: ${color.label}</span>
            <div class="swatches">${colors}</div>
          </div>
          <div class="choice-group ${choice.invalid ? "size-error" : ""}">
            <span class="choice-label">${choice.invalid ? "Выберите размер" : "Размер"}</span>
            <div class="sizes-list">${sizes}</div>
          </div>
          <p class="product-meta">
            <span>${product.fabric}</span>
            <span>${product.features.join(" · ")}</span>
          </p>
          <div class="buy-row">
            <div class="quantity" aria-label="Количество">
              <button type="button" data-action="minus" data-product="${product.id}" aria-label="Уменьшить">−</button>
              <output>${choice.quantity}</output>
              <button type="button" data-action="plus" data-product="${product.id}" aria-label="Увеличить">+</button>
            </div>
            <button class="button add-button" type="button" data-action="add" data-product="${product.id}">
              В корзину
            </button>
          </div>
          <p class="added-note">${choice.added ? "Добавлено в корзину" : promo}</p>
        </div>
      </article>
    `;
  }

  function renderProducts() {
    const visible = products.filter((product) => state.filter === "all" || product.category === state.filter);
    grid.innerHTML = visible.map(productCard).join("");
    filters.querySelectorAll("[data-filter]").forEach((button) => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function addLine(productId) {
    const product = productById(productId);
    const choice = state.selections[productId];
    const color = colorById(product, choice.color);
    if (color.comingSoon) {
      showToast("Синий цвет скоро появится");
      return;
    }
    if (!choice.size) {
      choice.invalid = true;
      renderProducts();
      showToast("Сначала выберите размер");
      return;
    }
    const existing = state.cart.find(
      (line) => line.productId === product.id && line.colorId === choice.color && line.size === choice.size
    );
    if (existing) {
      existing.quantity += choice.quantity;
    } else {
      state.cart.push({
        productId: product.id,
        colorId: choice.color,
        size: choice.size,
        quantity: choice.quantity,
      });
    }
    choice.added = true;
    choice.invalid = false;
    saveCart();
    renderProducts();
    showToast(`${product.name} добавлен в корзину`);
  }

  function mergeCartLines() {
    const merged = [];
    state.cart.forEach((line) => {
      const existing = merged.find(
        (candidate) =>
          candidate.productId === line.productId && candidate.colorId === line.colorId && candidate.size === line.size
      );
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        merged.push(line);
      }
    });
    state.cart = merged.filter((line) => line.quantity > 0);
  }

  function cartLine(line, index) {
    const product = productById(line.productId);
    const color = colorById(product, line.colorId);
    const colorOptions = product.colors
      .map(
        (variant) =>
          `<option value="${variant.id}" ${variant.id === line.colorId ? "selected" : ""} ${
            variant.comingSoon ? "disabled" : ""
          }>${variant.label}${variant.comingSoon ? " — Coming soon" : ""}</option>`
      )
      .join("");
    const sizeOptions = product.sizes
      .map((size) => `<option value="${size}" ${size === line.size ? "selected" : ""}>${size}</option>`)
      .join("");
    return `
      <article class="cart-line">
        <img src="${color.images[0]}" alt="${product.name}, ${color.label}">
        <div>
          <div class="cart-line-head">
            <h3>${product.name}</h3>
            <button class="remove" type="button" data-cart-action="remove" data-index="${index}">Удалить</button>
          </div>
          <div class="cart-variants">
            <select data-cart-action="color" data-index="${index}" aria-label="Цвет">${colorOptions}</select>
            <select data-cart-action="size" data-index="${index}" aria-label="Размер">${sizeOptions}</select>
          </div>
          <div class="cart-line-footer">
            <div class="mini-quantity">
              <button type="button" data-cart-action="minus" data-index="${index}" aria-label="Уменьшить">−</button>
              <span>${line.quantity}</span>
              <button type="button" data-cart-action="plus" data-index="${index}" aria-label="Увеличить">+</button>
            </div>
            <p class="line-total">${money(product.price * line.quantity)}</p>
          </div>
        </div>
      </article>
    `;
  }

  function renderCart() {
    const summary = calculateSummary();
    document.querySelectorAll("[data-cart-count]").forEach((badge) => {
      badge.textContent = summary.quantity;
    });
    cartLines.innerHTML = state.cart.length
      ? state.cart.map(cartLine).join("")
      : '<p class="cart-empty">Корзина пока пуста. Выберите китель, цвет и размер в каталоге.</p>';

    const promo = summary.hasEmbroideryGift
      ? '<p class="cart-promo">Именная вышивка в подарок: условие от 10 комплектов выполнено.</p>'
      : "";
    cartSummary.innerHTML = `
      <p class="summary-row"><span>Товары, ${summary.quantity} шт.</span><span>${money(summary.subtotal)}</span></p>
      ${
        summary.isDiscountEligible
          ? `<p class="summary-row discount"><span>Скидка 15%*</span><span>− ${money(summary.discount)}</span></p>`
          : ""
      }
      <p class="summary-row total"><span>Итого</span><span>${money(summary.total)}</span></p>
      ${promo}
      ${
        summary.isDiscountEligible
          ? '<p class="summary-note">* Рассчитана максимальная скидка из каталога; итог подтверждает менеджер.</p>'
          : ""
      }
    `;
    document.querySelector("[data-checkout]").disabled = state.cart.length === 0;
    renderOrderPreview();
  }

  function renderOrderPreview() {
    if (!state.cart.length) {
      orderPreview.innerHTML = "";
      return;
    }
    const summary = calculateSummary();
    const lines = state.cart
      .map((line) => {
        const product = productById(line.productId);
        const color = colorById(product, line.colorId);
        return `${product.name} / ${color.label} / ${line.size} × ${line.quantity} — ${money(product.price * line.quantity)}`;
      })
      .join("<br>");
    orderPreview.innerHTML = `<strong>Состав заказа</strong><br>${lines}<br><strong>Итого: ${money(summary.total)}</strong>`;
  }

  function openCart() {
    cartDrawer.classList.add("open");
    cartDrawer.setAttribute("aria-hidden", "false");
    overlay.hidden = false;
    document.body.classList.add("locked");
  }

  function closeCart() {
    cartDrawer.classList.remove("open");
    cartDrawer.setAttribute("aria-hidden", "true");
    if (checkoutModal.hidden) {
      overlay.hidden = true;
      document.body.classList.remove("locked");
    }
  }

  function openCheckout() {
    if (!state.cart.length) {
      showToast("Добавьте товар в корзину");
      return;
    }
    checkoutSuccess.hidden = true;
    checkoutForm.hidden = false;
    checkoutModal.hidden = false;
    checkoutModal.setAttribute("aria-hidden", "false");
    overlay.hidden = false;
    document.body.classList.add("locked");
  }

  function closeCheckout() {
    checkoutModal.hidden = true;
    checkoutModal.setAttribute("aria-hidden", "true");
    if (!cartDrawer.classList.contains("open")) {
      overlay.hidden = true;
      document.body.classList.remove("locked");
    }
  }

  function buildEmailBody(formData) {
    const summary = calculateSummary();
    const lines = state.cart.map((line) => {
      const product = productById(line.productId);
      const color = colorById(product, line.colorId);
      return `- ${product.name}; цвет: ${color.label}; размер: ${line.size}; кол-во: ${line.quantity}; сумма: ${money(
        product.price * line.quantity
      )}`;
    });
    const city = formData.get("city").trim();
    const deliveryNote =
      /ростов/i.test(city) && summary.quantity >= config.rostovDeliveryThreshold
        ? "Условие бесплатной доставки по Ростову-на-Дону выполнено."
        : "Условия доставки требуется подтвердить.";
    return [
      "Новая заявка DA CHEF",
      "",
      `Имя: ${formData.get("name").trim()}`,
      `Телефон: ${formData.get("phone").trim()}`,
      `Email: ${formData.get("email").trim() || "не указан"}`,
      `Дата рождения: ${formData.get("birthday").trim() || "не указана"}`,
      `Telegram / WhatsApp: ${formData.get("messenger").trim() || "не указан"}`,
      `Город: ${city}`,
      `Комментарий: ${formData.get("comment").trim() || "нет"}`,
      "",
      "Состав заказа:",
      ...lines,
      "",
      `Подытог: ${money(summary.subtotal)}`,
      summary.discount ? `Расчетная скидка до 15%: -${money(summary.discount)}` : "",
      `Итого: ${money(summary.total)}`,
      summary.hasEmbroideryGift ? "Именная вышивка: подарок от 10 комплектов." : "",
      deliveryNote,
      "",
      "Пожалуйста, подтвердите наличие, условия скидки, вышивку и доставку.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function buildMailto(formData) {
    const name = formData.get("name").trim();
    const subject = encodeURIComponent(`Заявка DA CHEF — ${name}`);
    const body = encodeURIComponent(buildEmailBody(formData));
    return `mailto:${config.orderEmail}?subject=${subject}&body=${body}`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2300);
  }

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }
    state.filter = button.dataset.filter;
    renderProducts();
  });

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }
    const productId = button.dataset.product;
    const choice = state.selections[productId];
    choice.added = false;
    switch (button.dataset.action) {
      case "color":
        choice.color = button.dataset.color;
        choice.image = 0;
        break;
      case "image":
        choice.image = Number(button.dataset.image);
        break;
      case "size":
        choice.size = button.dataset.size;
        choice.invalid = false;
        break;
      case "minus":
        choice.quantity = Math.max(1, choice.quantity - 1);
        break;
      case "plus":
        choice.quantity += 1;
        break;
      case "add":
        addLine(productId);
        return;
      default:
        return;
    }
    renderProducts();
  });

  cartLines.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (!button || button.matches("select")) {
      return;
    }
    const index = Number(button.dataset.index);
    const line = state.cart[index];
    if (!line) {
      return;
    }
    if (button.dataset.cartAction === "remove") {
      state.cart.splice(index, 1);
    }
    if (button.dataset.cartAction === "minus") {
      line.quantity -= 1;
    }
    if (button.dataset.cartAction === "plus") {
      line.quantity += 1;
    }
    mergeCartLines();
    saveCart();
  });

  cartLines.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-cart-action]");
    if (!select) {
      return;
    }
    const line = state.cart[Number(select.dataset.index)];
    if (!line) {
      return;
    }
    if (select.dataset.cartAction === "color") {
      const product = productById(line.productId);
      const nextColor = colorById(product, select.value);
      if (nextColor.comingSoon) {
        select.value = line.colorId;
        showToast("Синий цвет скоро появится");
        return;
      }
      line.colorId = select.value;
    }
    if (select.dataset.cartAction === "size") {
      line.size = select.value;
    }
    mergeCartLines();
    saveCart();
  });

  document.querySelectorAll("[data-open-cart]").forEach((button) => button.addEventListener("click", openCart));
  document.querySelector("[data-close-cart]").addEventListener("click", closeCart);
  document.querySelector("[data-checkout]").addEventListener("click", openCheckout);
  document.querySelectorAll("[data-close-checkout]").forEach((button) => button.addEventListener("click", closeCheckout));

  overlay.addEventListener("click", () => {
    if (!checkoutModal.hidden) {
      closeCheckout();
      return;
    }
    closeCart();
  });

  checkoutForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (config.demoMode) {
      checkoutForm.hidden = true;
      checkoutSuccess.hidden = false;
      return;
    }
    const formData = new FormData(checkoutForm);
    // TODO: Replace this mailto handoff with POST to config.orderEndpoint when the order API is ready.
    const href = buildMailto(formData);
    checkoutForm.hidden = true;
    checkoutSuccess.hidden = false;
    window.location.href = href;
  });

  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    mobileMenu.hidden = expanded;
  });

  mobileMenu.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      menuToggle.setAttribute("aria-expanded", "false");
      mobileMenu.hidden = true;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!checkoutModal.hidden) {
      closeCheckout();
    } else if (cartDrawer.classList.contains("open")) {
      closeCart();
    } else {
      menuToggle.setAttribute("aria-expanded", "false");
      mobileMenu.hidden = true;
    }
  });

  window.DaChefShop = { calculateSummary, buildMailto };

  renderOffers();
  renderProducts();
  renderCart();
})();
