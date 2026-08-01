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
  const checkoutError = document.querySelector("[data-checkout-error]");
  const orderId = document.querySelector("[data-order-id]");
  const orderPreview = document.querySelector("[data-order-preview]");
  const toast = document.querySelector("[data-toast]");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");
  const birthdayInput = checkoutForm.elements.birthday;
  const marketingConsent = checkoutForm.elements.marketingConsent;

  const state = {
    filter: "jackets",
    cart: loadCart(),
    selections: Object.fromEntries(
      products.map((product) => {
        const variant = product.variants?.[0] || null;
        const colors = variant?.colors || product.colors;
        return [product.id, {
          variant: variant?.id || null,
          color: (colors.find((color) => !color.comingSoon) || colors[0]).id,
          size: product.sizes.length === 1 ? product.sizes[0] : "",
          quantity: 1,
          image: 0,
          invalid: false,
          added: false,
        }];
      })
    ),
  };

  function money(value) {
    return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
  }

  function productById(id) {
    return products.find((product) => product.id === id);
  }

  function variantById(product, id) {
    if (!product.variants) return null;
    return product.variants.find((variant) => variant.id === id) || product.variants[0];
  }

  function colorsFor(product, variantId) {
    return variantById(product, variantId)?.colors || product.colors;
  }

  function colorById(product, id, variantId = null) {
    const colors = colorsFor(product, variantId);
    return colors.find((color) => color.id === id) || colors[0];
  }

  function loadCart() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (!Array.isArray(stored)) {
        return [];
      }
      return stored
        .map((line) => {
          const product = productById(line.productId);
          if (!product) return null;
          const variant = product.variants ? variantById(product, line.variantId) : null;
          return { ...line, variantId: variant?.id || null };
        })
        .filter((line) => {
          if (!line) return false;
          const product = productById(line.productId);
          return (
            colorsFor(product, line.variantId).some(
              (color) => color.id === line.colorId && !color.comingSoon
            ) &&
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
    const selectedVariant = variantById(product, choice.variant);
    const availableColors = colorsFor(product, choice.variant);
    const color = colorById(product, choice.color, choice.variant);
    const promo = productPromo(choice.quantity);
    const variants = product.variants
      ? product.variants
          .map(
            (variant) => `
              <button
                class="sleeve-chip ${choice.variant === variant.id ? "active" : ""}"
                type="button"
                data-action="variant"
                data-product="${product.id}"
                data-variant="${variant.id}"
                aria-pressed="${choice.variant === variant.id}"
              >${variant.label}</button>
            `
          )
          .join("")
      : "";
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
    const colors = availableColors
      .map(
        (colorOption) => {
          const comingSoon = Boolean(colorOption.comingSoon);
          return `
            <button
              class="swatch ${choice.color === colorOption.id ? "active" : ""} ${comingSoon ? "coming-soon" : ""}"
              type="button"
              data-action="color"
              data-product="${product.id}"
              data-color="${colorOption.id}"
              aria-label="${colorOption.label}${comingSoon ? " — скоро в продаже" : ""}"
              aria-pressed="${choice.color === colorOption.id}"
            >
              <span class="swatch-dot" style="background:${colorOption.hex}"></span>
              ${colorOption.label}
              ${comingSoon ? '<span class="soon-label">Coming soon</span>' : ""}
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
            alt="${product.name}${selectedVariant ? `, ${selectedVariant.label.toLowerCase()}` : ""}, цвет ${color.label}"
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
          ${
            variants
              ? `<div class="choice-group">
                  <span class="choice-label">Рукав: ${selectedVariant.label}</span>
                  <div class="sleeve-list">${variants}</div>
                </div>`
              : ""
          }
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
            <button
              class="button add-button"
              type="button"
              data-action="add"
              data-product="${product.id}"
              ${color.comingSoon ? 'disabled aria-disabled="true"' : ""}
            >
              ${color.comingSoon ? "Скоро в продаже" : "В корзину"}
            </button>
          </div>
          <p class="added-note">${
            color.comingSoon
              ? "Цвет доступен для просмотра, заказ пока закрыт"
              : choice.added
                ? "Добавлено в корзину"
                : promo
          }</p>
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
    const color = colorById(product, choice.color, choice.variant);
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
      (line) =>
        line.productId === product.id &&
        line.variantId === choice.variant &&
        line.colorId === choice.color &&
        line.size === choice.size
    );
    if (existing) {
      existing.quantity += choice.quantity;
    } else {
      state.cart.push({
        productId: product.id,
        variantId: choice.variant,
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
          candidate.productId === line.productId &&
          candidate.variantId === line.variantId &&
          candidate.colorId === line.colorId &&
          candidate.size === line.size
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
    const selectedVariant = variantById(product, line.variantId);
    const availableColors = colorsFor(product, line.variantId);
    const color = colorById(product, line.colorId, line.variantId);
    const variantOptions = product.variants
      ? product.variants
          .map(
            (variant) =>
              `<option value="${variant.id}" ${variant.id === line.variantId ? "selected" : ""}>${variant.label}</option>`
          )
          .join("")
      : "";
    const colorOptions = availableColors
      .map(
        (colorOption) =>
          `<option value="${colorOption.id}" ${colorOption.id === line.colorId ? "selected" : ""} ${
            colorOption.comingSoon ? "disabled" : ""
          }>${colorOption.label}${colorOption.comingSoon ? " — Coming soon" : ""}</option>`
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
            ${
              variantOptions
                ? `<select data-cart-action="variant" data-index="${index}" aria-label="Рукав">${variantOptions}</select>`
                : ""
            }
            <select data-cart-action="color" data-index="${index}" aria-label="Цвет">${colorOptions}</select>
            <select data-cart-action="size" data-index="${index}" aria-label="Размер">${sizeOptions}</select>
          </div>
          ${selectedVariant ? `<p class="cart-variant-label">${selectedVariant.label}</p>` : ""}
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
        const variant = variantById(product, line.variantId);
        const color = colorById(product, line.colorId, line.variantId);
        return `${product.name}${variant ? ` / ${variant.label}` : ""} / ${color.label} / ${line.size} × ${line.quantity} — ${money(product.price * line.quantity)}`;
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
    checkoutError.hidden = true;
    checkoutError.textContent = "";
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

  function buildOrderPayload(formData) {
    return {
      website: formData.get("website").trim(),
      customer: {
        name: formData.get("name").trim(),
        phone: formData.get("phone").trim(),
        email: formData.get("email").trim(),
        birthday: formData.get("birthday").trim(),
        messenger: formData.get("messenger").trim(),
        city: formData.get("city").trim(),
        comment: formData.get("comment").trim(),
      },
      items: state.cart.map((line) => ({
        productId: line.productId,
        variantId: line.variantId || undefined,
        colorId: line.colorId,
        size: line.size,
        quantity: line.quantity,
      })),
      consents: {
        personalData: Boolean(formData.get("orderConsent")),
        marketing: Boolean(formData.get("marketingConsent")),
      },
    };
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
      case "variant": {
        choice.variant = button.dataset.variant;
        const colors = colorsFor(productById(productId), choice.variant);
        if (!colors.some((color) => color.id === choice.color)) {
          choice.color = (colors.find((color) => !color.comingSoon) || colors[0]).id;
        }
        choice.image = 0;
        break;
      }
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
      const nextColor = colorById(product, select.value, line.variantId);
      if (nextColor.comingSoon) {
        select.value = line.colorId;
        showToast("Синий цвет скоро появится");
        return;
      }
      line.colorId = select.value;
    }
    if (select.dataset.cartAction === "variant") {
      const product = productById(line.productId);
      const nextVariant = variantById(product, select.value);
      line.variantId = nextVariant.id;
      const colors = colorsFor(product, line.variantId);
      const currentColor = colors.find((color) => color.id === line.colorId && !color.comingSoon);
      line.colorId = currentColor?.id || (colors.find((color) => !color.comingSoon) || colors[0]).id;
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

  function syncBirthdayConsent() {
    const hasBirthday = Boolean(birthdayInput.value);
    const wantsBirthdayOffer = marketingConsent.checked;
    marketingConsent.required = hasBirthday;
    birthdayInput.required = wantsBirthdayOffer;
    marketingConsent.setCustomValidity(
      hasBirthday && !wantsBirthdayOffer
        ? "Подтвердите согласие на поздравление и персональную скидку или очистите дату рождения."
        : ""
    );
    birthdayInput.setCustomValidity(
      wantsBirthdayOffer && !hasBirthday
        ? "Укажите дату рождения или снимите согласие на поздравление и персональную скидку."
        : ""
    );
  }

  birthdayInput.addEventListener("input", syncBirthdayConsent);
  marketingConsent.addEventListener("change", syncBirthdayConsent);
  syncBirthdayConsent();

  overlay.addEventListener("click", () => {
    if (!checkoutModal.hidden) {
      closeCheckout();
      return;
    }
    closeCart();
  });

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(checkoutForm);
    const submitButton = checkoutForm.querySelector('button[type="submit"]');
    const initialText = submitButton.textContent;
    checkoutError.hidden = true;
    checkoutError.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Отправляем...";
    try {
      const response = await fetch(config.orderEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderPayload(formData)),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Не удалось отправить заявку");
      }
      orderId.textContent = result.orderId;
      checkoutForm.hidden = true;
      checkoutSuccess.hidden = false;
    } catch (error) {
      checkoutError.textContent = `${error.message}. Попробуйте ещё раз или свяжитесь с нами по телефону.`;
      checkoutError.hidden = false;
      showToast("Заявка не отправлена");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = initialText;
    }
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

  window.DaChefShop = { calculateSummary, buildOrderPayload };

  renderOffers();
  renderProducts();
  renderCart();
})();
