const TOKEN_KEY = 'car_solution_admin_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function formatNum(n) {
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
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
  list.innerHTML = items.map((i) => `
    <div class="stock-row">
      <div>
        <strong>${i.nombre}</strong>
        <small>${i.unidad}</small>
      </div>
      <span class="stock-val">${formatNum(i.stockTeorico)}</span>
    </div>
  `).join('');

  const fields = document.getElementById('auditFields');
  fields.innerHTML = items.map((i) => `
    <div class="campo audit-field">
      <label>${i.nombre} <small>(${i.unidad}) — teórico: ${formatNum(i.stockTeorico)}</small></label>
      <input type="number" step="0.01" min="0" data-id="${i.id}" class="medida-input" placeholder="Cantidad medida">
    </div>
  `).join('');

  const sel = document.getElementById('restockItem');
  sel.innerHTML = items.map((i) =>
    `<option value="${i.id}">${i.nombre} (${i.unidad})</option>`
  ).join('');
}

function renderHistory(audits) {
  const box = document.getElementById('auditHistory');
  if (!audits.length) {
    box.innerHTML = '<p style="color:var(--gris);">Aún no hay consultas registradas.</p>';
    return;
  }

  box.innerHTML = audits.map((a) => {
    const when = new Date(a.createdAt).toLocaleString('es-MX');
    const lines = (a.lines || []).map((l) => {
      const cls = l.resultado === 'perdida' ? 'diff-neg' : l.resultado === 'sobrante' ? 'diff-pos' : 'diff-ok';
      const label = l.resultado === 'perdida' ? 'pérdida' : l.resultado === 'sobrante' ? 'sobrante' : 'exacto';
      return `<li class="${cls}"><strong>${l.nombre}</strong>: medido ${formatNum(l.cantidadMedida)} / teórico ${formatNum(l.stockTeorico)} → Δ ${formatNum(l.diferencia)} (${label})</li>`;
    }).join('');

    return `
      <div class="audit-card">
        <div class="audit-card-head">
          <strong>${when}</strong>
          <span>${a.notas || 'Sin notas'}</span>
        </div>
        <ul>${lines}</ul>
      </div>
    `;
  }).join('');
}

async function loadAll() {
  const token = getToken();
  if (!token) return showGate();

  try {
    const [items, audits] = await Promise.all([
      adminGet('/api/admin/inventory/items', token),
      adminGet('/api/admin/inventory/audits', token),
    ]);
    renderStock(items);
    renderHistory(audits);
    showView();
  } catch (err) {
    console.error(err);
    showGate();
  }
}

document.getElementById('auditForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = getToken();
  const medidas = {};
  document.querySelectorAll('.medida-input').forEach((input) => {
    if (input.value !== '') medidas[input.dataset.id] = Number(input.value);
  });

  if (!Object.keys(medidas).length) {
    alert('Ingresa al menos una cantidad medida');
    return;
  }

  try {
    const result = await apiPostAuth('/api/admin/inventory/audit', {
      medidas,
      notas: document.getElementById('auditNotas').value.trim(),
      syncStock: document.getElementById('syncStock').checked,
    }, token);

    const box = document.getElementById('auditResult');
    box.classList.remove('hidden', 'err');
    box.classList.add('ok');
    box.innerHTML = `<strong>Consulta guardada</strong><br>` + result.lines.map((l) => {
      const tag = l.resultado === 'perdida' ? 'pérdida' : l.resultado === 'sobrante' ? 'sobrante' : 'exacto';
      return `${l.nombre}: Δ ${formatNum(l.diferencia)} (${tag})`;
    }).join(' · ');

    document.getElementById('auditNotas').value = '';
    await loadAll();
  } catch (err) {
    const box = document.getElementById('auditResult');
    box.classList.remove('hidden', 'ok');
    box.classList.add('err');
    box.textContent = err.message;
  }
});

document.getElementById('btnRestock').addEventListener('click', async () => {
  const token = getToken();
  const itemId = document.getElementById('restockItem').value;
  const cantidad = Number(document.getElementById('restockQty').value);
  if (!itemId || !(cantidad > 0)) {
    alert('Selecciona insumo y cantidad positiva');
    return;
  }
  try {
    await apiPostAuth('/api/admin/inventory/restock', { itemId, cantidad }, token);
    document.getElementById('restockQty').value = '';
    await loadAll();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('btnReloadInv').addEventListener('click', loadAll);
document.getElementById('btnLogout').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/admin';
});

document.addEventListener('DOMContentLoaded', loadAll);
