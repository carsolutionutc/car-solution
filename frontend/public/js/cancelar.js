let currentBooking = null;

function showMsg(id, text) {
  ['cancelError', 'cancelSuccess'].forEach((el) => {
    document.getElementById(el).classList.add('hidden');
  });
  if (!id) return;
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.remove('hidden');
}

function renderBookingInfo(data) {
  document.getElementById('bookingDetails').innerHTML = `
    <div class="info-line"><span>Folio</span><span>${data.folio}</span></div>
    <div class="info-line"><span>Cliente</span><span>${data.nombre}</span></div>
    <div class="info-line"><span>Correo</span><span>${data.email}</span></div>
    <div class="info-line"><span>Servicio</span><span>${data.servicio || '—'}</span></div>
    <div class="info-line"><span>Fecha</span><span>${data.fecha} ${data.hora}</span></div>
    <div class="info-line"><span>Total</span><span>$${Number(data.total).toLocaleString('es-MX')} MXN</span></div>
    <div class="info-line"><span>Estado</span><span>${data.status}</span></div>
  `;
  document.getElementById('bookingInfo').classList.remove('hidden');
}

async function buscarFolio() {
  const folio = document.getElementById('folioInput').value.trim().toUpperCase();
  if (!folio) {
    showMsg('cancelError', 'Ingresa tu folio de cita.');
    return;
  }

  document.getElementById('bookingInfo').classList.add('hidden');
  currentBooking = null;

  try {
    const data = await apiGet(`/api/bookings/folio/${encodeURIComponent(folio)}`);
    currentBooking = data;
    showMsg(null);
    renderBookingInfo(data);
  } catch (err) {
    showMsg('cancelError', err.message || 'Folio no encontrado');
  }
}

async function cancelarCita() {
  if (!currentBooking) return;

  const motivo = document.getElementById('motivoInput').value.trim();
  if (motivo.length < 5) {
    showMsg('cancelError', 'El motivo de cancelación es obligatorio (mínimo 5 caracteres).');
    return;
  }

  const btn = document.getElementById('btnCancelar');
  btn.disabled = true;
  btn.textContent = 'Cancelando...';

  try {
    await apiPost('/api/bookings/cancelar', {
      folio: currentBooking.folio,
      motivo,
    });

    showMsg('cancelSuccess', `Tu cita ${currentBooking.folio} fue cancelada correctamente.`);
    document.getElementById('bookingInfo').classList.add('hidden');
    document.getElementById('motivoInput').value = '';
    currentBooking = null;
  } catch (err) {
    showMsg('cancelError', err.message || 'No se pudo cancelar la cita');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Cancelar cita';
  }
}

document.getElementById('btnBuscar').addEventListener('click', buscarFolio);
document.getElementById('btnCancelar').addEventListener('click', cancelarCita);
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
