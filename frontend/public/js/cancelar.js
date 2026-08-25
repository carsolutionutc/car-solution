let currentRecord = null; // { type: 'booking'|'order', ... }

function showMsg(id, text) {
  ['cancelError', 'cancelSuccess'].forEach((el) => {
    document.getElementById(el).classList.add('hidden');
  });
  if (!id) return;
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.remove('hidden');
}

function isOrderFolio(folio) {
  return String(folio || '').toUpperCase().startsWith('ORD-');
}

function money(n) {
  return '$' + Number(n).toLocaleString('es-MX') + ' MXN';
}

function renderRecordInfo(data) {
  const title = document.getElementById('confirmTitle');
  const btn = document.getElementById('btnCancelar');

  if (data.type === 'order') {
    title.textContent = 'Confirma que es tu pedido';
    btn.textContent = 'Cancelar pedido';
    const items = (data.items || [])
      .map((i) => `${i.nombre} × ${i.cantidad}`)
      .join(', ') || '—';
    document.getElementById('bookingDetails').innerHTML = `
      <div class="info-line"><span>Tipo</span><span>Pedido de productos</span></div>
      <div class="info-line"><span>Folio</span><span>${data.folio}</span></div>
      <div class="info-line"><span>Cliente</span><span>${data.nombre}</span></div>
      <div class="info-line"><span>Correo</span><span>${data.email}</span></div>
      <div class="info-line"><span>Productos</span><span>${items}</span></div>
      <div class="info-line"><span>Total</span><span>${money(data.total)}</span></div>
      <div class="info-line"><span>Estado</span><span>${data.status}</span></div>
    `;
  } else {
    title.textContent = 'Confirma que es tu cita';
    btn.textContent = 'Cancelar cita';
    document.getElementById('bookingDetails').innerHTML = `
      <div class="info-line"><span>Tipo</span><span>Cita de servicio</span></div>
      <div class="info-line"><span>Folio</span><span>${data.folio}</span></div>
      <div class="info-line"><span>Cliente</span><span>${data.nombre}</span></div>
      <div class="info-line"><span>Correo</span><span>${data.email}</span></div>
      <div class="info-line"><span>Servicio</span><span>${data.servicio || '—'}</span></div>
      <div class="info-line"><span>Fecha</span><span>${data.fecha} ${data.hora}</span></div>
      <div class="info-line"><span>Total</span><span>${money(data.total)}</span></div>
      <div class="info-line"><span>Estado</span><span>${data.status}</span></div>
    `;
  }

  document.getElementById('bookingInfo').classList.remove('hidden');
}

async function buscarFolio() {
  const folio = document.getElementById('folioInput').value.trim().toUpperCase();
  if (!folio) {
    showMsg('cancelError', 'Ingresa tu folio de cita o pedido.');
    return;
  }

  document.getElementById('bookingInfo').classList.add('hidden');
  currentRecord = null;

  try {
    let data;
    if (isOrderFolio(folio)) {
      data = await apiGet(`/api/products/folio/${encodeURIComponent(folio)}`);
      data.type = 'order';
    } else {
      data = await apiGet(`/api/bookings/folio/${encodeURIComponent(folio)}`);
      data.type = 'booking';
    }
    currentRecord = data;
    showMsg(null);
    renderRecordInfo(data);
  } catch (err) {
    showMsg('cancelError', err.message || 'Folio no encontrado');
  }
}

async function confirmarCancelacion() {
  if (!currentRecord) return;

  const motivo = document.getElementById('motivoInput').value.trim();
  if (motivo.length < 5) {
    showMsg('cancelError', 'El motivo de cancelación es obligatorio (mínimo 5 caracteres).');
    return;
  }

  const btn = document.getElementById('btnCancelar');
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'Cancelando...';

  try {
    const path = currentRecord.type === 'order'
      ? '/api/products/cancelar'
      : '/api/bookings/cancelar';

    await apiPost(path, {
      folio: currentRecord.folio,
      motivo,
    });

    const label = currentRecord.type === 'order' ? 'pedido' : 'cita';
    showMsg('cancelSuccess', `Tu ${label} ${currentRecord.folio} fue cancelado correctamente.`);
    document.getElementById('bookingInfo').classList.add('hidden');
    document.getElementById('motivoInput').value = '';
    currentRecord = null;
  } catch (err) {
    showMsg('cancelError', err.message || 'No se pudo cancelar');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

document.getElementById('btnBuscar').addEventListener('click', buscarFolio);
document.getElementById('btnCancelar').addEventListener('click', confirmarCancelacion);
document.getElementById('folioInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') buscarFolio();
});

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const folio = params.get('folio');
  if (folio) {
    document.getElementById('folioInput').value = folio;
    buscarFolio();
  }
});
