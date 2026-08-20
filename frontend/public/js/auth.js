const CUSTOMER_TOKEN_KEY = 'car_solution_customer_token';
const CUSTOMER_KEY = 'car_solution_customer';
const CART_KEY = 'car_solution_cart';

function getCustomerToken() {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

function getCustomer() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null');
  } catch {
    return null;
  }
}

function setCustomerSession(token, customer) {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
}

function clearCustomerSession() {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

function cartCount() {
  return getCart().reduce((n, i) => n + Number(i.cantidad || 0), 0);
}

function updateCartBadge() {
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    const n = cartCount();
    el.textContent = String(n);
    el.classList.toggle('hidden', n === 0);
  });
}

function addToCart(product, cantidad = 1) {
  const cart = getCart();
  const existing = cart.find((i) => i.itemId === product.id);
  if (existing) existing.cantidad += cantidad;
  else {
    cart.push({
      itemId: product.id,
      nombre: product.nombre,
      precio: product.precio,
      unidad: product.unidad,
      packCantidad: product.packCantidad,
      cantidad,
    });
  }
  saveCart(cart);
}

function setCartQty(itemId, cantidad) {
  let cart = getCart();
  if (cantidad <= 0) cart = cart.filter((i) => i.itemId !== itemId);
  else {
    const row = cart.find((i) => i.itemId === itemId);
    if (row) row.cantidad = cantidad;
  }
  saveCart(cart);
}

function removeFromCart(itemId) {
  saveCart(getCart().filter((i) => i.itemId !== itemId));
}

function clearCart() {
  saveCart([]);
}

function cartTotal() {
  return getCart().reduce((sum, i) => sum + i.precio * i.cantidad, 0);
}

async function handleGoogleCredential(response) {
  const data = await apiPost('/api/auth/google', { credential: response.credential });
  setCustomerSession(data.token, data.customer);
  window.dispatchEvent(new CustomEvent('customer-login', { detail: data.customer }));
  return data.customer;
}

function customerLogout() {
  clearCustomerSession();
  window.dispatchEvent(new Event('customer-logout'));
}

async function initGoogleButton(containerId, options = {}) {
  const cfg = await apiGet('/api/auth/config');
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!cfg.enabled || !cfg.googleClientId) {
    el.innerHTML = '<p class="auth-hint">Inicio con Google no configurado (falta GOOGLE_CLIENT_ID).</p>';
    return;
  }

  await new Promise((resolve) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    document.head.appendChild(s);
  });

  window.google.accounts.id.initialize({
    client_id: cfg.googleClientId,
    callback: async (resp) => {
      try {
        await handleGoogleCredential(resp);
        if (typeof options.onSuccess === 'function') options.onSuccess();
      } catch (err) {
        alert(err.message || 'No se pudo iniciar sesión');
      }
    },
  });

  el.innerHTML = '';
  window.google.accounts.id.renderButton(el, {
    theme: 'outline',
    size: options.size || 'large',
    text: options.text || 'continue_with',
    shape: 'pill',
    width: options.width || 280,
  });
}

function renderNavAuth(slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const customer = getCustomer();
  if (customer) {
    slot.innerHTML = `
      <a href="/cuenta" class="nav-user">
        ${customer.fotoUrl ? `<img src="${customer.fotoUrl}" alt="" class="nav-avatar">` : ''}
        <span>${customer.nombre?.split(' ')[0] || 'Mi cuenta'}</span>
      </a>
      <a href="/productos" class="nav-cart-link">Carrito <span class="cart-badge" data-cart-count></span></a>
    `;
  } else {
    slot.innerHTML = `
      <a href="/cuenta">Entrar</a>
      <a href="/productos" class="nav-cart-link">Carrito <span class="cart-badge hidden" data-cart-count></span></a>
    `;
  }
  updateCartBadge();
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
window.addEventListener('customer-login', updateCartBadge);
window.addEventListener('customer-logout', updateCartBadge);
