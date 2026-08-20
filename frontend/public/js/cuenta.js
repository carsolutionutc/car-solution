function money(n) {
  return '$' + Number(n).toLocaleString('es-MX');
}

function statusLabel(s) {
  return s || '—';
}

function renderAccountHero(customer) {
  const actions = document.getElementById('cuentaHeroActions');
  const panel = document.getElementById('cuentaHeroPanel');
  if (!customer) {
    actions.innerHTML = '';
    panel.innerHTML = `
      <div class="hero-stat-block">
        <strong>Acceso seguro</strong>
        <span>Google Sign-In para citas y pedidos</span>
      </div>`;
    return;
  }

  actions.innerHTML = `
    <a href="/productos" class="store-btn store-btn-primary">Ir a tienda</a>
    <a href="/#cotizar" class="store-btn store-btn-ghost">Nueva cita</a>
  `;
  panel.innerHTML = `
    <div class="profile-mini">
      ${customer.fotoUrl
        ? `<img src="${customer.fotoUrl}" alt="">`
        : `<span class="nav-avatar-fallback">${(customer.nombre || 'C').charAt(0).toUpperCase()}</span>`}
      <div>
        <strong>${customer.nombre || 'Cliente'}</strong>
        <span>${customer.email || ''}</span>
      </div>
    </div>
  `;
}

async function loadAccountData() {
  const token = getCustomerToken();
  const customer = getCustomer();
  if (!token || !customer) {
    document.getElementById('loginBox').classList.remove('hidden');
    document.getElementById('accountView').classList.add('hidden');
    document.getElementById('cuentaTitle').textContent = 'Mi cuenta';
    document.getElementById('cuentaSub').textContent = 'Inicia sesión con Google para ver tus citas y pedidos.';
    renderAccountHero(null);
    await initGoogleButton('googleBtn', { onSuccess: afterLogin });
    return;
  }

  document.getElementById('loginBox').classList.add('hidden');
  document.getElementById('accountView').classList.remove('hidden');
  document.getElementById('cuentaTitle').textContent = `Hola, ${customer.nombre?.split(' ')[0] || 'cliente'}`;
  document.getElementById('cuentaSub').textContent = 'Aquí tienes el historial de tus citas y compras.';
  renderAccountHero(customer);

  try {
    const [bookings, orders] = await Promise.all([
      apiGet('/api/auth/bookings', token),
      apiGet('/api/auth/orders', token),
    ]);

    const bBox = document.getElementById('myBookings');
    if (!bookings.length) {
      bBox.innerHTML = '<p class="hint-text">Aún no tienes citas. <a href="/#cotizar">Agenda una</a>.</p>';
    } else {
      bBox.innerHTML = bookings.map((b) => `
        <div class="cuenta-row">
          <div>
            <strong>${b.folio}</strong>
            <small>${b.servicio || 'Servicio'} · ${b.fecha} ${b.hora}</small>
          </div>
          <span class="status-badge status-${b.status}">${statusLabel(b.status)}</span>
          <div class="cuenta-amt">${money(b.total)}</div>
        </div>
      `).join('');
    }

    const oBox = document.getElementById('myOrders');
    if (!orders.length) {
      oBox.innerHTML = '<p class="hint-text">Sin pedidos todavía. <a href="/productos">Ver productos</a>.</p>';
    } else {
      oBox.innerHTML = orders.map((o) => `
        <div class="cuenta-row">
          <div>
            <strong>${o.folio}</strong>
            <small>${(o.items || []).map((i) => `${i.nombre}×${i.cantidad}`).join(', ')}</small>
          </div>
          <span class="status-badge status-${o.status === 'entregado' ? 'completada' : o.status === 'pendiente' ? 'pendiente' : 'cancelada'}">${o.status}</span>
          <div class="cuenta-amt">${money(o.total)}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    if (/sesión|token|401|expir/i.test(err.message)) {
      customerLogout();
      return loadAccountData();
    }
    document.getElementById('myBookings').innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
  }
}

async function afterLogin() {
  renderNavAuth('navAuthSlot');
  await loadAccountData();
}

document.addEventListener('DOMContentLoaded', async () => {
  renderNavAuth('navAuthSlot');
  document.getElementById('btnLogoutCustomer')?.addEventListener('click', () => {
    customerLogout();
    loadAccountData();
    renderNavAuth('navAuthSlot');
  });
  await loadAccountData();
});
