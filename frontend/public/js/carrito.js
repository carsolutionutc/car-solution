function money(n) {
  return '$' + Number(n).toLocaleString('es-MX');
}

function renderCart() {
  const box = document.getElementById('cartItems');
  const cart = getCart();
  const hint = document.getElementById('cartHint');
  const btn = document.getElementById('btnCheckout');
  document.getElementById('cartTotal').textContent = money(cartTotal());
  updateCartBadge();

  if (!cart.length) {
    box.innerHTML = `
      <div class="cart-empty">
        <p>Tu carrito está vacío.</p>
        <a href="/productos" class="store-btn store-btn-primary" style="margin-top:1rem;">Explorar productos</a>
      </div>`;
    btn.disabled = true;
    hint.textContent = '';
    return;
  }

  box.innerHTML = cart.map((i) => `
    <div class="cart-page-row">
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
  hint.textContent = logged
    ? 'Al comprar recibirás un correo con QR para recoger. La compra se verá en Gestión de inmediato.'
    : 'Inicia sesión con Google para comprar.';
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
      : 'Pedido registrado. Guarda tu folio para recoger en el local.';

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

async function init() {
  renderNavAuth('navAuthSlot');
  renderCart();

  if (!getCustomerToken()) {
    await initGoogleButton('checkoutGoogle', {
      onSuccess: () => {
        renderNavAuth('navAuthSlot');
        renderCart();
        document.getElementById('checkoutGoogle').innerHTML = '';
      },
    });
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
    document.getElementById('checkoutGoogle').innerHTML = '';
  });
}

document.addEventListener('DOMContentLoaded', init);
