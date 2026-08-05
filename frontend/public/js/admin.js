const TOKEN_KEY = 'car_solution_admin_token';
let charts = {};

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

function renderKPIs(kpis) {
  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-card ok">
      <div class="kpi-label">Ingresos del mes</div>
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
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gris);">No hay citas registradas aún</td></tr>';
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
      <td>
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

async function loadDashboard() {
  const token = getToken();
  if (!token) return showLogin();

  try {
    const [analytics, bookings] = await Promise.all([
      adminGet('/api/admin/analytics', token),
      adminGet('/api/admin/bookings', token),
    ]);

    renderKPIs(analytics.kpis);
    renderCharts(analytics);
    renderBookings(bookings);
    showDashboard();
  } catch (err) {
    clearToken();
    showLogin();
  }
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

document.addEventListener('DOMContentLoaded', loadDashboard);
