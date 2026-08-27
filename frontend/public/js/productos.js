let PRODUCTS = [];
let CATEGORIES = [];
let activeCategory = 'todos';

function money(n) {
  return '$' + Number(n).toLocaleString('es-MX');
}

function renderCategoryFilters() {
  const box = document.getElementById('categoryFilters');
  if (!box) return;
  const cats = [{ id: 'todos', label: 'Todos' }, ...CATEGORIES];
  box.innerHTML = cats.map((c) => `
    <button type="button" class="filtro-btn${c.id === activeCategory ? ' activo' : ''}" data-cat="${c.id}">
      ${c.label}
    </button>
  `).join('');

  box.querySelectorAll('[data-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      renderCategoryFilters();
      renderProducts();
    });
  });
}

function productImageHtml(p) {
  const src = p.imagen || `/img/products/${p.slug}.jpg`;
  return `
    <div class="product-media">
      <img src="${src}" alt="${p.nombre}" loading="lazy"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <div class="product-img-placeholder" style="display:none;">
        <span>${p.categoriaLabel || 'Producto'}</span>
        <small>Coloca: ${src.replace('/img/', '')}</small>
      </div>
    </div>`;
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const list = activeCategory === 'todos'
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.categoria === activeCategory);

  if (!list.length) {
    grid.innerHTML = '<p style="color:var(--gris);">No hay productos en esta categoría.</p>';
    return;
  }

  grid.innerHTML = list.map((p, idx) => `
    <article class="product-card" style="animation-delay:${idx * 0.04}s">
      ${productImageHtml(p)}
      <div class="product-card-top">
        <div class="product-badges">
          <div class="product-badge">${p.categoriaLabel || p.categoria}</div>
          <div class="product-badge product-badge-soft">${p.unidad}</div>
        </div>
        <h3>${p.nombre}</h3>
      </div>
      <div class="product-card-body">
        <p>${p.descripcion || 'Insumo automotriz de marca.'}</p>
        <div class="product-meta">
          <span class="product-price">${money(p.precio)}</span>
          <small>Pack ${p.packCantidad} ${p.unidad} · Disponibles: ${p.packsDisponibles}</small>
        </div>
        <button class="store-btn store-btn-card" data-add="${p.id}" ${p.packsDisponibles < 1 ? 'disabled' : ''}>
          ${p.packsDisponibles < 1 ? 'Agotado' : 'Agregar al carrito'}
        </button>
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prod = PRODUCTS.find((p) => p.id === btn.dataset.add);
      if (!prod) return;
      addToCart(prod, 1);
      renderCart();
      const panel = document.querySelector('.store-shop-cart .cart-panel');
      if (panel) {
        panel.classList.add('cart-pulse');
        setTimeout(() => panel.classList.remove('cart-pulse'), 450);
      }
      const prev = btn.textContent;
      btn.textContent = '✓ Agregado';
      setTimeout(() => { btn.textContent = prev; }, 900);
    });
  });
}

function renderCart() {
  const box = document.getElementById('cartItems');
  const hint = document.getElementById('cartHint');
  const btn = document.getElementById('btnCheckout');
  const totalEl = document.getElementById('cartTotal');
  if (!box || !btn || !totalEl) return;

  const cart = getCart();
  totalEl.textContent = money(cartTotal());
  updateCartBadge();

  if (!cart.length) {
    box.innerHTML = `
      <div class="cart-empty">
        <p>Tu carrito está vacío.</p>
        <small>Agrega productos desde el catálogo.</small>
      </div>`;
    btn.disabled = true;
    if (hint) hint.textContent = '';
    return;
  }

  box.innerHTML = cart.map((i) => `
    <div class="cart-page-row shop-cart-row">
      <div>
        <strong>${i.nombre}</strong>
        <small>${money(i.precio)} c/u · pack ${i.packCantidad} ${i.unidad}</small>
      </div>
      <div class="cart-qty">
        <button type="button" data-dec="${i.itemId}">−</button>
        <span>${i.cantidad}</span>
        <button type="button" data-inc="${i.itemId}">+</button>
        <button type="button" class="cart-remove" data-rm="${i.itemId}">✕</button>
      </div>
      <div class="cart-line-total">${money(i.precio * i.cantidad)}</div>
    </div>
  `).join('');

  box.querySelectorAll('[data-inc]').forEach((b) => {
    b.addEventListener('click', () => {
      const row = getCart().find((x) => x.itemId === b.dataset.inc);
      setCartQty(b.dataset.inc, (row?.cantidad || 0) + 1);
      renderCart();
    });
  });
  box.querySelectorAll('[data-dec]').forEach((b) => {
    b.addEventListener('click', () => {
      const row = getCart().find((x) => x.itemId === b.dataset.dec);
      setCartQty(b.dataset.dec, (row?.cantidad || 0) - 1);
      renderCart();
    });
  });
  box.querySelectorAll('[data-rm]').forEach((b) => {
    b.addEventListener('click', () => {
      removeFromCart(b.dataset.rm);
      renderCart();
    });
  });

  const logged = Boolean(getCustomerToken());
  btn.disabled = !logged;
  if (hint) {
    hint.textContent = logged
      ? 'Al comprar recibirás un correo con QR para recoger. La compra se verá en Gestión de inmediato.'
      : 'Inicia sesión con Google para comprar.';
  }
}

async function checkout() {
  const token = getCustomerToken();
  if (!token) {
    alert('Inicia sesión con Google para comprar');
    return;
  }
  const cart = getCart();
  if (!cart.length) return;

  const btn = document.getElementById('btnCheckout');
  btn.disabled = true;
  btn.textContent = 'Procesando...';

  try {
    const order = await apiPost('/api/products/checkout', {
      items: cart.map((i) => ({ itemId: i.itemId, cantidad: i.cantidad })),
    }, token);

    clearCart();
    renderCart();

    document.getElementById('orderModalText').textContent = order.emailSent
      ? 'Revisa tu correo — te enviamos el QR para recoger tus productos.'
      : (order.emailReason
        ? `Pedido registrado. El correo no se envió (${order.emailReason}). Guarda tu folio.`
        : 'Pedido registrado. Guarda tu folio para recoger en el local.');

    document.getElementById('orderModalDetails').innerHTML = `
      <div class="modal-linea"><span>Folio</span><span>${order.folio}</span></div>
      <div class="modal-linea"><span>Total</span><span>${money(order.total)}</span></div>
      ${(order.items || []).map((i) => `<div class="modal-linea"><span>${i.nombre} × ${i.cantidad}</span><span>${money(i.subtotal)}</span></div>`).join('')}
    `;
    document.getElementById('orderModal').classList.add('show');
  } catch (err) {
    alert(err.message || 'No se pudo completar la compra');
  } finally {
    btn.textContent = 'Realizar compra';
    renderCart();
  }
}

async function initGoogleCheckout() {
  const box = document.getElementById('checkoutGoogle');
  if (!box) return;
  if (getCustomerToken()) {
    box.innerHTML = '';
    return;
  }
  await initGoogleButton('checkoutGoogle', {
    width: 240,
    onSuccess: () => {
      renderNavAuth('navAuthSlot');
      renderCart();
      document.getElementById('checkoutGoogle').innerHTML = '';
    },
  });
}

async function init() {
  renderNavAuth('navAuthSlot');
  renderCart();
  await initGoogleCheckout();

  try {
    const data = await apiGet('/api/products');
    PRODUCTS = Array.isArray(data) ? data : (data.products || []);
    CATEGORIES = data.categories || [];
    renderCategoryFilters();
    renderProducts();
  } catch (err) {
    document.getElementById('productsGrid').innerHTML =
      `<p style="color:#ef4444;">${err.message}</p>`;
  }

  document.getElementById('btnCheckout').addEventListener('click', checkout);
  document.getElementById('btnClearCart').addEventListener('click', () => {
    if (confirm('¿Vaciar el carrito?')) {
      clearCart();
      renderCart();
    }
  });
  document.getElementById('btnCloseOrderModal').addEventListener('click', () => {
    document.getElementById('orderModal').classList.remove('show');
  });

  window.addEventListener('customer-login', () => {
    renderNavAuth('navAuthSlot');
    renderCart();
    const g = document.getElementById('checkoutGoogle');
    if (g) g.innerHTML = '';
  });
  window.addEventListener('cart-updated', renderCart);
}

document.addEventListener('DOMContentLoaded', init);
