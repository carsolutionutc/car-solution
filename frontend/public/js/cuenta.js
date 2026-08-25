let fichaActual = null; // { type: 'booking'|'order', id, folio }

function money(n) {
  return '$' + Number(n).toLocaleString('es-MX');
}

function statusLabel(s) {
  return s || '—';
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function cerrarFicha() {
  document.getElementById('fichaModal').classList.remove('show');
  document.getElementById('fichaCancelBox').classList.add('hidden');
  document.getElementById('fichaError').classList.add('hidden');
  document.getElementById('fichaMotivo').value = '';
  fichaActual = null;
}

function showFichaError(msg) {
  const el = document.getElementById('fichaError');
  el.textContent = msg;
  el.classList.remove('hidden');
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

function openFichaModal(title, html, canCancel, meta) {
  fichaActual = meta;
  document.getElementById('fichaTitle').textContent = title;
  document.getElementById('fichaBody').innerHTML = html;
  document.getElementById('fichaError').classList.add('hidden');
  document.getElementById('fichaMotivo').value = '';

  const cancelBox = document.getElementById('fichaCancelBox');
  if (canCancel) {
    cancelBox.classList.remove('hidden');
    document.getElementById('btnFichaCancel').textContent =
      meta.type === 'order' ? 'Cancelar este pedido' : 'Cancelar esta cita';
  } else {
    cancelBox.classList.add('hidden');
  }

  document.getElementById('fichaModal').classList.add('show');
}

async function verFichaCita(id) {
  const token = getCustomerToken();
  try {
    const b = await apiGet(`/api/auth/bookings/${id}`, token);
    const extras = (b.extras || [])
      .map((e) => `${e.nombre || 'Extra'} (+${money(e.precio)})`)
      .join(', ') || 'Ninguno';

    let html = `
      <div class="modal-linea"><span>Folio</span><span>${b.folio}</span></div>
      <div class="modal-linea"><span>Cliente</span><span>${b.nombre}</span></div>
      <div class="modal-linea"><span>Correo</span><span>${b.email}</span></div>
      <div class="modal-linea"><span>Teléfono</span><span>${b.telefono || '—'}</span></div>
      <div class="modal-linea"><span>Servicio</span><span>${b.servicio || '—'}</span></div>
      <div class="modal-linea"><span>Vehículo</span><span>${b.vehiculoTipo || '—'}</span></div>
      <div class="modal-linea"><span>Tapicería</span><span>${b.tapiceria || '—'}</span></div>
      <div class="modal-linea"><span>Extras</span><span>${extras}</span></div>
      <div class="modal-linea"><span>Fecha</span><span>${b.fecha} ${b.hora}</span></div>
      <div class="modal-linea"><span>Bahía</span><span>${b.bayNumber || '—'}</span></div>
      <div class="modal-linea"><span>Duración</span><span>${b.durationMinutes ? b.durationMinutes + ' min' : '—'}</span></div>
      <div class="modal-linea"><span>Registrada</span><span>${formatDateTime(b.createdAt)}</span></div>
      <div class="modal-linea"><span>Total</span><span>${money(b.total)} MXN</span></div>
      <div class="modal-linea"><span>Estado</span><span>${b.status}</span></div>
    `;

    if (b.status === 'cancelada') {
      html += `
        <div class="modal-linea"><span>Cancelada</span><span>${formatDateTime(b.cancelledAt)}</span></div>
        <div class="modal-linea modal-motivo"><span>Motivo</span><span>${b.cancellationReason || 'Sin motivo'}</span></div>
      `;
    }

    openFichaModal(`Cita ${b.folio}`, html, Boolean(b.canCancel), {
      type: 'booking',
      id: b.id,
      folio: b.folio,
    });
  } catch (err) {
    alert(err.message || 'No se pudo abrir la ficha');
  }
}

async function verFichaPedido(id) {
  const token = getCustomerToken();
  try {
    const o = await apiGet(`/api/auth/orders/${id}`, token);
    const itemsHtml = (o.items || []).map((i) => `
      <div class="modal-linea">
        <span>${i.nombre} × ${i.cantidad}</span>
        <span>${money(i.subtotal)}</span>
      </div>
    `).join('') || '<div class="modal-linea"><span>Items</span><span>—</span></div>';

    let html = `
      <div class="modal-linea"><span>Folio</span><span>${o.folio}</span></div>
      <div class="modal-linea"><span>Cliente</span><span>${o.nombre}</span></div>
      <div class="modal-linea"><span>Correo</span><span>${o.email}</span></div>
      <div class="modal-linea"><span>Registrado</span><span>${formatDateTime(o.createdAt)}</span></div>
      <div class="modal-linea"><span>Entrega</span><span>${formatDateTime(o.pickedUpAt)}</span></div>
      <div class="modal-linea"><span>Estado</span><span>${o.status}</span></div>
      <div class="ficha-section-label">Productos</div>
      ${itemsHtml}
      <div class="modal-linea"><span>Total</span><span>${money(o.total)} MXN</span></div>
    `;

    if (o.status === 'cancelada') {
      html += `
        <div class="modal-linea"><span>Cancelado</span><span>${formatDateTime(o.cancelledAt)}</span></div>
        <div class="modal-linea modal-motivo"><span>Motivo</span><span>${o.cancellationReason || 'Sin motivo'}</span></div>
      `;
    }

    openFichaModal(`Pedido ${o.folio}`, html, Boolean(o.canCancel), {
      type: 'order',
      id: o.id,
      folio: o.folio,
    });
  } catch (err) {
    alert(err.message || 'No se pudo abrir la ficha');
  }
}

async function cancelFromFicha() {
  if (!fichaActual) return;
  const motivo = document.getElementById('fichaMotivo').value.trim();
  if (motivo.length < 5) {
    showFichaError('El motivo es obligatorio (mínimo 5 caracteres).');
    return;
  }

  const label = fichaActual.type === 'order' ? 'pedido' : 'cita';
  if (!confirm(`¿Confirmas cancelar este ${label} (${fichaActual.folio})?`)) return;

  const btn = document.getElementById('btnFichaCancel');
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'Cancelando...';

  try {
    const token = getCustomerToken();
    const folio = fichaActual.folio;
    const path = fichaActual.type === 'order'
      ? `/api/auth/orders/${fichaActual.id}/cancel`
      : `/api/auth/bookings/${fichaActual.id}/cancel`;
    await apiPost(path, { motivo }, token);
    cerrarFicha();
    alert(`${label.charAt(0).toUpperCase() + label.slice(1)} ${folio} cancelado.`);
    await loadAccountData();
  } catch (err) {
    showFichaError(err.message || 'No se pudo cancelar');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
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
  document.getElementById('cuentaSub').textContent = 'Abre la ficha de cada cita o pedido para ver el detalle y cancelar si aplica.';
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
          <div class="cuenta-row-end">
            <div class="cuenta-amt">${money(b.total)}</div>
            <button type="button" class="btn-cuenta-ficha" data-ficha-booking="${b.id}">Ver ficha</button>
          </div>
        </div>
      `).join('');

      bBox.querySelectorAll('[data-ficha-booking]').forEach((btn) => {
        btn.addEventListener('click', () => verFichaCita(btn.dataset.fichaBooking));
      });
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
          <div class="cuenta-row-end">
            <div class="cuenta-amt">${money(o.total)}</div>
            <button type="button" class="btn-cuenta-ficha" data-ficha-order="${o.id}">Ver ficha</button>
          </div>
        </div>
      `).join('');

      oBox.querySelectorAll('[data-ficha-order]').forEach((btn) => {
        btn.addEventListener('click', () => verFichaPedido(btn.dataset.fichaOrder));
      });
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
  document.getElementById('btnCloseFicha')?.addEventListener('click', cerrarFicha);
  document.getElementById('btnFichaCancel')?.addEventListener('click', cancelFromFicha);
  document.getElementById('fichaModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'fichaModal') cerrarFicha();
  });
  await loadAccountData();
});
