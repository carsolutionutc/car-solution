const TOKEN_KEY = 'car_solution_admin_token';
let ITEMS = [];

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function formatNum(n) {
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function showGate() {
  document.getElementById('loginGate').classList.remove('hidden');
  document.getElementById('gestionView').classList.add('hidden');
}

function showView() {
  document.getElementById('loginGate').classList.add('hidden');
  document.getElementById('gestionView').classList.remove('hidden');
}

function renderStock(items) {
  const list = document.getElementById('stockList');
  if (!items.length) {
    list.innerHTML = '<p class="hint-text">No hay productos en inventario.</p>';
    return;
  }

  list.innerHTML = items.map((i) => `
    <div class="stock-row">
      <div>
        <strong>${i.nombre}</strong>
        <small>${i.unidad}${i.vendible ? ` · venta $${formatNum(i.precio)}` : ''}</small>
        ${(i.descuentos || []).length
          ? `<div class="stock-uses">${i.descuentos.map((d) =>
              `${d.servicio}: ${formatNum(d.cantidad)} ${i.unidad}`
            ).join(' · ')}</div>`
          : ''}
      </div>
      <span class="stock-val">${formatNum(i.stockTeorico)}</span>
    </div>
  `).join('');

  const sel = document.getElementById('addItemSelect');
  sel.innerHTML = items.map((i) =>
    `<option value="${i.id}" data-unidad="${i.unidad}">${i.nombre} (${i.unidad}) — ${formatNum(i.stockTeorico)}</option>`
  ).join('');
  updateAddLabel();
}

function renderConsumption(rows) {
  const box = document.getElementById('consumptionList');
  if (!rows.length) {
    box.innerHTML = '<p class="hint-text">Aún no hay consumos registrados.</p>';
    return;
  }

  box.innerHTML = rows.map((r) => `
    <div class="consumption-row">
      <div class="consumption-top">
        <span class="consumo-tag ${r.tipo === 'venta' ? 'tag-venta' : 'tag-servicio'}">${r.tipo === 'venta' ? 'Venta' : 'Servicio'}</span>
        <small>${formatWhen(r.createdAt)}</small>
      </div>
      <strong class="consumption-ref">${r.referencia}</strong>
      <div class="consumption-prod">
        −${formatNum(r.cantidad)} ${r.unidad}
        <span>${r.producto}</span>
      </div>
    </div>
  `).join('');
}

function updateAddLabel() {
  const sel = document.getElementById('addItemSelect');
  const opt = sel.options[sel.selectedIndex];
  const unidad = opt?.dataset.unidad || 'unidades';
  document.getElementById('addQtyLabel').textContent = `Cantidad a agregar (${unidad})`;
  document.getElementById('addQty').placeholder = `Ej. 100 ${unidad}`;
}

async function loadAll() {
  const token = getToken();
  if (!token) return showGate();

  try {
    const [items, consumption] = await Promise.all([
      adminGet('/api/admin/inventory/items', token),
      adminGet('/api/admin/inventory/consumption', token),
    ]);
    ITEMS = items;
    renderStock(items);
    renderConsumption(consumption);
    showView();
  } catch (err) {
    console.error(err);
    showGate();
  }
}

function openAddModal() {
  document.getElementById('addResult').classList.add('hidden');
  document.getElementById('addQty').value = '';
  updateAddLabel();
  document.getElementById('addStockModal').classList.add('show');
}

function closeAddModal() {
  document.getElementById('addStockModal').classList.remove('show');
}

document.getElementById('btnOpenAdd').addEventListener('click', openAddModal);
document.getElementById('btnCloseAdd').addEventListener('click', closeAddModal);
document.getElementById('addStockModal').addEventListener('click', (e) => {
  if (e.target.id === 'addStockModal') closeAddModal();
});
document.getElementById('addItemSelect').addEventListener('change', updateAddLabel);

document.getElementById('btnConfirmAdd').addEventListener('click', async () => {
  const token = getToken();
  const itemId = document.getElementById('addItemSelect').value;
  const cantidad = Number(document.getElementById('addQty').value);
  const box = document.getElementById('addResult');

  if (!itemId || !(cantidad > 0)) {
    box.classList.remove('hidden', 'ok');
    box.classList.add('err');
    box.textContent = 'Selecciona producto y una cantidad positiva';
    return;
  }

  try {
    const item = await apiPostAuth('/api/admin/inventory/restock', { itemId, cantidad }, token);
    box.classList.remove('hidden', 'err');
    box.classList.add('ok');
    box.innerHTML = `<strong>Stock actualizado</strong><br>${item.nombre}: ahora ${formatNum(item.stockTeorico)} ${item.unidad}`;
    document.getElementById('addQty').value = '';
    await loadAll();
  } catch (err) {
    box.classList.remove('hidden', 'ok');
    box.classList.add('err');
    box.textContent = err.message;
  }
});

document.getElementById('btnReloadInv').addEventListener('click', loadAll);
document.getElementById('btnLogout').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/admin';
});

document.addEventListener('DOMContentLoaded', loadAll);
