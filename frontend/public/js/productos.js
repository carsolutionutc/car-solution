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
      const prev = btn.textContent;
      btn.textContent = '✓ Agregado';
      setTimeout(() => { btn.textContent = prev; }, 900);
    });
  });
}

async function init() {
  renderNavAuth('navAuthSlot');
  updateCartBadge();

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
}

document.addEventListener('DOMContentLoaded', init);
