let PRODUCTS = [];

function money(n) {
  return '$' + Number(n).toLocaleString('es-MX');
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!PRODUCTS.length) {
    grid.innerHTML = '<p style="color:var(--gris);">No hay productos disponibles por ahora.</p>';
    return;
  }

  grid.innerHTML = PRODUCTS.map((p) => `
    <article class="product-card">
      <div class="product-badge">${p.unidad}</div>
      <h3>${p.nombre}</h3>
      <p>${p.descripcion || 'Insumo automotriz'}</p>
      <div class="product-meta">
        <span>${money(p.precio)} / unidad</span>
        <small>Contenido: ${p.packCantidad} ${p.unidad} · Disp.: ${p.packsDisponibles}</small>
      </div>
      <button class="btn-admin" data-add="${p.id}" ${p.packsDisponibles < 1 ? 'disabled' : ''}>
        ${p.packsDisponibles < 1 ? 'Agotado' : 'Agregar al carrito'}
      </button>
    </article>
  `).join('');

  grid.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prod = PRODUCTS.find((p) => p.id === btn.dataset.add);
      if (!prod) return;
      addToCart(prod, 1);
      btn.textContent = '✓ Agregado';
      setTimeout(() => {
        btn.textContent = 'Agregar al carrito';
      }, 900);
    });
  });
}

async function init() {
  renderNavAuth('navAuthSlot');
  updateCartBadge();

  try {
    PRODUCTS = await apiGet('/api/products');
    renderProducts();
  } catch (err) {
    document.getElementById('productsGrid').innerHTML =
      `<p style="color:#ef4444;">${err.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
