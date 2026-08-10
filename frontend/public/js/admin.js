const TOKEN_KEY = 'car_solution_admin_token';
let charts = {};
let currentPeriod = 'all';
let customFrom = '';
let customTo = '';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function showLogin() {
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('btnLogout').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('dashboardView').classList.remove('hidden');
  document.getElementById('btnLogout').classList.remove('hidden');
}

function formatMoney(n) {
  return '$' + Number(n).toLocaleString('es-MX');
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function analyticsQuery() {
  const params = new URLSearchParams({ period: currentPeriod });
  if (currentPeriod === 'custom') {
    if (customFrom) params.set('from', customFrom);
    if (customTo) params.set('to', customTo);
  }
  return `/api/admin/analytics?${params}`;
}

function bookingsQuery() {
  const folio = document.getElementById('searchFolio').value.trim();
  const status = document.getElementById('filterStatus').value;
  const params = new URLSearchParams();
  if (folio) params.set('folio', folio);
  if (status && status !== 'todos') params.set('status', status);
  const qs = params.toString();
  return `/api/admin/bookings${qs ? `?${qs}` : ''}`;
}

function renderKPIs(kpis, period) {
  const periodLabel = {
    '1d': 'último día',
    '1w': 'última semana',
    '1m': 'último mes',
    '1y': 'último año',
    all: 'total',
    custom: 'periodo seleccionado',
  }[period] || 'periodo';

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-card ok">
      <div class="kpi-label">Ingresos (${periodLabel})</div>
      <div class="kpi-value">${formatMoney(kpis.ingresosMes)}</div>
      <div class="kpi-sub">Citas completadas</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total citas</div>
      <div class="kpi-value">${kpis.totalCitas}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Ticket promedio</div>
      <div class="kpi-value">${formatMoney(kpis.ticketPromedio)}</div>
    </div>
    <div class="kpi-card warn">
      <div class="kpi-label">Cancelaciones</div>
      <div class="kpi-value">${kpis.canceladas}</div>
      <div class="kpi-sub">${kpis.tasaCancelacion}% del total</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Pendientes</div>
      <div class="kpi-value">${kpis.pendientes}</div>
    </div>
    <div class="kpi-card ok">
      <div class="kpi-label">Completadas</div>
      <div class="kpi-value">${kpis.completadas}</div>
    </div>
  `;
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function renderCharts(data) {
  const blue = '#0d47a1';
  const accent = '#42a5f5';

  destroyChart('servicios');
  charts.servicios = new Chart(document.getElementById('chartServicios'), {
    type: 'bar',
    data: {
      labels: data.topServicios.map((s) => s.nombre),
      datasets: [{
        label: 'Citas',
        data: data.topServicios.map((s) => s.total),
        backgroundColor: accent,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });

  const sb = data.statusBreakdown;
  destroyChart('status');
  charts.status = new Chart(document.getElementById('chartStatus'), {
    type: 'doughnut',
    data: {
      labels: ['Pendiente', 'Confirmada', 'Completada', 'Cancelada'],
      datasets: [{
        data: [sb.pendiente, sb.confirmada, sb.completada, sb.cancelada],
        backgroundColor: ['#fbbf24', '#60a5fa', '#22c55e', '#ef4444'],
      }],
    },
    options: { responsive: true },
  });

  destroyChart('ingresos');
  charts.ingresos = new Chart(document.getElementById('chartIngresos'), {
    type: 'line',
    data: {
      labels: data.ingresosMensuales.map((m) => m.mes),
      datasets: [{
        label: 'Ingresos MXN',
        data: data.ingresosMensuales.map((m) => m.total),
        borderColor: blue,
        backgroundColor: 'rgba(13,71,161,0.1)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: { responsive: true },
  });

  destroyChart('cancelaciones');
  charts.cancelaciones = new Chart(document.getElementById('chartCancelaciones'), {
    type: 'bar',
    data: {
      labels: data.cancelacionesMensuales.map((m) => m.mes),
      datasets: [{
        label: 'Canceladas',
        data: data.cancelacionesMensuales.map((m) => m.total),
        backgroundColor: '#ef4444',
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function renderBookings(bookings) {
  const tbody = document.getElementById('bookingsBody');
  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gris);">No hay citas con esos filtros</td></tr>';
    return;
  }

  tbody.innerHTML = bookings.map((b) => `
    <tr>
      <td><strong>${b.folio}</strong></td>
      <td>${b.nombre}<br><small style="color:var(--gris)">${b.email}</small></td>
      <td>${b.services?.nombre || '—'}</td>
      <td>${b.fecha} ${String(b.hora).slice(0, 5)}</td>
      <td>${formatMoney(b.total)}</td>
      <td><span class="status-badge status-${b.status}">${b.status}</span></td>
      <td class="actions-cell">
        <button class="btn-view" onclick="verCita('${b.id}')">Ver cita</button>
        <select class="status-select" data-id="${b.id}" onchange="cambiarEstado(this)">
          <option value="pendiente" ${b.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="confirmada" ${b.status === 'confirmada' ? 'selected' : ''}>Confirmada</option>
          <option value="completada" ${b.status === 'completada' ? 'selected' : ''}>Completada</option>
          <option value="cancelada" ${b.status === 'cancelada' ? 'selected' : ''}>Cancelada</option>
        </select>
      </td>
    </tr>
  `).join('');
}

async function loadBookingsTable() {
  const token = getToken();
  if (!token) return;
  try {
    const bookings = await adminGet(bookingsQuery(), token);
    renderBookings(bookings);
  } catch (err) {
    console.error(err);
  }
}

async function loadDashboard() {
  const token = getToken();
  if (!token) return showLogin();

  try {
    const [analytics, bookings] = await Promise.all([
      adminGet(analyticsQuery(), token),
      adminGet(bookingsQuery(), token),
    ]);

    renderKPIs(analytics.kpis, currentPeriod);
    renderCharts(analytics);
    renderBookings(bookings);
    showDashboard();
  } catch (err) {
    clearToken();
    showLogin();
  }
}

async function verCita(id) {
  const token = getToken();
  try {
    const b = await adminGet(`/api/admin/bookings/${id}`, token);
    const extras = (b.booking_extras || [])
      .map((e) => `${e.extras?.nombre} (+$${Number(e.precio).toLocaleString('es-MX')})`)
      .join(', ') || 'Ninguno';

    let html = `
      <div class="modal-linea"><span>Folio</span><span>${b.folio}</span></div>
      <div class="modal-linea"><span>Cliente</span><span>${b.nombre}</span></div>
      <div class="modal-linea"><span>Correo</span><span>${b.email}</span></div>
      <div class="modal-linea"><span>Teléfono</span><span>${b.telefono}</span></div>
      <div class="modal-linea"><span>Servicio</span><span>${b.services?.nombre || '—'}</span></div>
      <div class="modal-linea"><span>Vehículo</span><span>${b.vehiculo_tipo}</span></div>
      <div class="modal-linea"><span>Tapicería</span><span>${b.tapiceria}</span></div>
      <div class="modal-linea"><span>Extras</span><span>${extras}</span></div>
      <div class="modal-linea"><span>Fecha cita</span><span>${b.fecha} ${String(b.hora).slice(0, 5)}</span></div>
      <div class="modal-linea"><span>Registrada</span><span>${formatDateTime(b.created_at)}</span></div>
      <div class="modal-linea"><span>Total</span><span>${formatMoney(b.total)} MXN</span></div>
      <div class="modal-linea"><span>Estado</span><span>${b.status}</span></div>
    `;

    if (b.status === 'cancelada') {
      html += `
        <div class="modal-linea"><span>Cancelada</span><span>${formatDateTime(b.cancelled_at)}</span></div>
        <div class="modal-linea modal-motivo"><span>Motivo</span><span>${b.cancellation_reason || 'Sin motivo registrado'}</span></div>
      `;
    }

    document.getElementById('bookingModalBody').innerHTML = html;
    document.getElementById('bookingModal').classList.add('show');
  } catch (err) {
    alert(err.message);
  }
}

function cerrarModal() {
  document.getElementById('bookingModal').classList.remove('show');
}

async function cambiarEstado(select) {
  const token = getToken();
  const id = select.dataset.id;
  const status = select.value;

  try {
    await apiPatch(`/api/admin/bookings/${id}/status`, { status }, token);
    await loadDashboard();
  } catch (err) {
    alert(err.message);
    await loadDashboard();
  }
}

function setPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  document.getElementById('customRange').classList.toggle('hidden', period !== 'custom');
  if (period !== 'custom') loadDashboard();
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');

  try {
    const { token } = await adminLogin(email, password);
    setToken(token);
    await loadDashboard();
  } catch (err) {
    errEl.textContent = err.message || 'Credenciales incorrectas';
    errEl.classList.remove('hidden');
  }
}

function handleLogout() {
  clearToken();
  showLogin();
}

document.getElementById('btnLogin').addEventListener('click', handleLogin);
document.getElementById('loginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});
document.getElementById('btnLogout').addEventListener('click', (e) => { e.preventDefault(); handleLogout(); });
document.getElementById('btnLogout2').addEventListener('click', handleLogout);
document.getElementById('btnRefresh').addEventListener('click', loadDashboard);

let folioDebounce;
document.getElementById('searchFolio').addEventListener('input', () => {
  clearTimeout(folioDebounce);
  folioDebounce = setTimeout(loadBookingsTable, 300);
});
document.getElementById('filterStatus').addEventListener('change', loadBookingsTable);
document.getElementById('btnCloseModal').addEventListener('click', cerrarModal);
document.getElementById('bookingModal').addEventListener('click', (e) => {
  if (e.target.id === 'bookingModal') cerrarModal();
});

document.querySelectorAll('.period-btn').forEach((btn) => {
  btn.addEventListener('click', () => setPeriod(btn.dataset.period));
});

document.getElementById('btnApplyRange').addEventListener('click', () => {
  customFrom = document.getElementById('dateFrom').value;
  customTo = document.getElementById('dateTo').value;
  if (!customFrom) {
    alert('Selecciona al menos la fecha de inicio');
    return;
  }
  loadDashboard();
});

document.addEventListener('DOMContentLoaded', loadDashboard);
