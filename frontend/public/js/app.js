let SERVICIOS = [];
let EXTRAS = [];
let selExtras = {};

async function initApp() {
  try {
    const data = await apiGet('/api/services');
    SERVICIOS = data.services;
    EXTRAS = data.extras;
    populateServiceSelect();
    renderServicios('todos');
    renderExtras();
    recalc();
  } catch (err) {
    console.error(err);
    document.getElementById('svGrid').innerHTML =
      '<p style="grid-column:1/-1;text-align:center;color:#ef4444;">No se pudieron cargar los servicios. ¿Está el servidor corriendo?</p>';
  }

  const hoy = new Date().toISOString().split('T')[0];
  const fechaEl = document.getElementById('fecha');
  fechaEl.setAttribute('min', hoy);
  fechaEl.addEventListener('change', loadSlots);
  document.getElementById('servicio').addEventListener('change', () => {
    recalc();
    loadSlots();
  });

  // Prefill from Google session if present
  if (typeof getCustomer === 'function') {
    const c = getCustomer();
    if (c) {
      const nom = document.getElementById('nombre');
      const mail = document.getElementById('correo');
      if (nom && !nom.value) nom.value = c.nombre || '';
      if (mail && !mail.value) mail.value = c.email || '';
    }
  }
}

function populateServiceSelect() {
  const sel = document.getElementById('servicio');
  sel.innerHTML = SERVICIOS.map((s) =>
    `<option value="${s.precio}" data-id="${s.id}" data-n="${s.nom}" data-dur="${s.durationMinutes || 30}">${s.nom} — $${s.precio.toLocaleString('es-MX')} (${s.durationMinutes || 30} min)</option>`
  ).join('');
}

function renderServicios(cat) {
  const grid = document.getElementById('svGrid');
  const lista = cat === 'todos' ? SERVICIOS : SERVICIOS.filter((s) => s.cat === cat);
  grid.innerHTML = lista.map((s) => `
    <div class="sv-card" onclick="elegirServicio('${s.id}',${s.precio},'${escapeAttr(s.nom)}',this)">
      <div class="sv-check"><div class="check-tick"></div></div>
      <div class="sv-etiqueta${s.pop ? ' pop' : ''}">
        ${s.pop ? '★ Más solicitado' : s.cat === 'basico' ? 'Básico' : s.cat === 'detallado' ? 'Detallado' : 'Especial'}
      </div>
      <h3>${s.nom}</h3>
      <p>${s.desc}</p>
      <ul class="sv-items">${(s.items || []).map((i) => `<li>${i}</li>`).join('')}</ul>
      <div class="sv-precio">$${s.precio.toLocaleString('es-MX')}<small> MXN</small></div>
      <div style="margin-top:0.4rem;font-size:0.75rem;color:var(--gris);">⏱ ~${s.durationMinutes || 30} min</div>
    </div>
  `).join('');
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'");
}

function filtrar(cat, btn) {
  document.querySelectorAll('.filtro-btn').forEach((b) => b.classList.remove('activo'));
  btn.classList.add('activo');
  renderServicios(cat);
}

function elegirServicio(serviceId, precio, nombre, card) {
  document.querySelectorAll('.sv-card').forEach((c) => c.classList.remove('elegida'));
  card.classList.add('elegida');
  const sel = document.getElementById('servicio');
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].dataset.n === nombre) {
      sel.selectedIndex = i;
      break;
    }
  }
  recalc();
  loadSlots();
  document.getElementById('cotizar').scrollIntoView({ behavior: 'smooth' });
}

function renderExtras() {
  document.getElementById('extrasGrid').innerHTML = EXTRAS.map((e) => `
    <button class="extra-btn" id="ex-${e.id}" onclick="toggleExtra('${e.id}','${e.extraId}',${e.p},this)">
      <div class="extra-caja"><div class="extra-v"></div></div>
      <span class="extra-nom">${e.nom}</span>
      <span class="extra-p">+$${e.p}</span>
    </button>
  `).join('');
}

function toggleExtra(slug, extraId, p, btn) {
  if (selExtras[slug]) {
    delete selExtras[slug];
    btn.classList.remove('on');
  } else {
    selExtras[slug] = { extraId, precio: p, nom: EXTRAS.find((e) => e.id === slug)?.nom };
    btn.classList.add('on');
  }
  recalc();
}

function recalc() {
  const sel = document.getElementById('servicio');
  const veh = document.getElementById('vehiculo');
  const tap = document.getElementById('tapiceria');
  const base = parseInt(sel.value, 10) || 0;
  const vPlus = parseInt(veh.value, 10) || 0;
  const tPlus = parseInt(tap.value, 10) || 0;
  const extTotal = Object.values(selExtras).reduce((a, e) => a + e.precio, 0);
  const total = base + vPlus + tPlus + extTotal;

  document.getElementById('r-serv').textContent = sel.options[sel.selectedIndex]?.dataset.n || '—';
  document.getElementById('r-veh').textContent = veh.options[veh.selectedIndex].text.split(' (')[0];
  document.getElementById('r-tap').textContent = tap.options[tap.selectedIndex].text.split(' (')[0];
  document.getElementById('r-total').innerHTML = '$' + total.toLocaleString('es-MX') + '<small>MXN</small>';

  const extL = document.getElementById('r-ext-linea');
  if (extTotal > 0) {
    extL.style.display = 'flex';
    document.getElementById('r-ext').textContent = '+$' + extTotal.toLocaleString('es-MX');
  } else {
    extL.style.display = 'none';
  }
}

async function loadSlots() {
  const fecha = document.getElementById('fecha').value;
  const sel = document.getElementById('servicio');
  const serviceId = sel.options[sel.selectedIndex]?.dataset.id;
  const horaSel = document.getElementById('hora');
  const hint = document.getElementById('slotsHint');

  if (!fecha || !serviceId) {
    horaSel.innerHTML = '<option value="">Selecciona fecha y servicio</option>';
    hint.textContent = '';
    return;
  }

  const day = new Date(fecha + 'T12:00:00').getDay();
  if (day === 0) {
    horaSel.innerHTML = '<option value="">No hay horarios (domingo)</option>';
    hint.textContent = 'No trabajamos los domingos.';
    return;
  }

  horaSel.innerHTML = '<option value="">Cargando horarios...</option>';
  hint.textContent = '';

  try {
    const data = await apiGet(`/api/bookings/slots?fecha=${encodeURIComponent(fecha)}&serviceId=${encodeURIComponent(serviceId)}`);
    if (!data.slots?.length) {
      horaSel.innerHTML = '<option value="">Sin horarios disponibles</option>';
      hint.textContent = 'No hay bahías libres para la duración de este servicio ese día.';
      return;
    }

    horaSel.innerHTML = '<option value="">Elige una hora</option>' +
      data.slots.map((h) => `<option value="${h}">${h}</option>`).join('');

    hint.textContent = `Duración ~${data.durationMinutes} min · 4 espacios · colchón ${data.meta?.bufferMinutes || 15} min entre citas · tolerancia llegada ${data.meta?.toleranceMinutes || 15} min`;
  } catch (err) {
    horaSel.innerHTML = '<option value="">Error al cargar horarios</option>';
    hint.textContent = err.message || 'Error';
  }
}

async function enviarCita() {
  const nombre = document.getElementById('nombre').value.trim();
  const correo = document.getElementById('correo').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const fecha = document.getElementById('fecha').value;
  const hora = document.getElementById('hora').value;

  if (!nombre || !correo || !telefono || !fecha || !hora) {
    alert('Por favor completa todos los campos obligatorios (*).');
    return;
  }

  const sel = document.getElementById('servicio');
  const serviceId = sel.options[sel.selectedIndex]?.dataset.id;
  if (!serviceId) {
    alert('Selecciona un servicio válido.');
    return;
  }

  const veh = document.getElementById('vehiculo');
  const tap = document.getElementById('tapiceria');
  const base = parseInt(sel.value, 10) || 0;
  const vPlus = parseInt(veh.value, 10) || 0;
  const tPlus = parseInt(tap.value, 10) || 0;
  const extTotal = Object.values(selExtras).reduce((a, e) => a + e.precio, 0);
  const total = base + vPlus + tPlus + extTotal;

  const extrasPayload = Object.entries(selExtras).map(([slug, e]) => ({
    slug,
    extraId: e.extraId,
    precio: e.precio,
  }));

  const extrasNombres = Object.values(selExtras).map((e) => e.nom).filter(Boolean);

  const btn = document.getElementById('btnEnviar');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const booking = await apiPost('/api/bookings', {
      nombre,
      email: correo,
      telefono,
      serviceId,
      vehiculoTipo: veh.options[veh.selectedIndex].text.split(' (')[0],
      vehiculoExtra: vPlus,
      tapiceria: tap.options[tap.selectedIndex].text.split(' (')[0],
      tapiceriaExtra: tPlus,
      fecha,
      hora,
      total,
      extras: extrasPayload,
      extrasNombres,
    }, typeof getCustomerToken === 'function' ? getCustomerToken() : null);

    document.getElementById('modalOkText').textContent = booking.emailSent
      ? 'Tu cita quedó registrada. Revisa tu correo — te enviamos el recibo con folio y código QR.'
      : 'Tu cita quedó registrada. Guarda tu folio de confirmación.';

    document.getElementById('modalDetalles').innerHTML = `
      <div class="modal-linea"><span>Folio</span><span>${booking.folio}</span></div>
      <div class="modal-linea"><span>Cliente</span><span>${nombre}</span></div>
      <div class="modal-linea"><span>Correo</span><span>${correo}</span></div>
      <div class="modal-linea"><span>Servicio</span><span>${booking.servicio}</span></div>
      <div class="modal-linea"><span>Fecha</span><span>${fecha}</span></div>
      <div class="modal-linea"><span>Hora</span><span>${hora}</span></div>
      <div class="modal-linea"><span>Bahía</span><span>${booking.bayNumber || '—'}</span></div>
      <div class="modal-linea"><span>Total</span><span>$${total.toLocaleString('es-MX')} MXN</span></div>
    `;
    document.getElementById('modalOk').classList.add('show');
    loadSlots();
  } catch (err) {
    alert(err.message || 'Error al agendar la cita');
    document.getElementById('modalErr').classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar y Enviar Cita →';
  }
}

function cerrar(id) {
  document.getElementById(id).classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof renderNavAuth === 'function') renderNavAuth('navAuthSlot');
  initApp();
});
