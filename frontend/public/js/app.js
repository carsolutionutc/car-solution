let SERVICIOS = [];
let EXTRAS = [];
let selExtras = {};

const EMAILJS = {
  publicKey: '',
  serviceId: '',
  templateId: '',
};

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
  document.getElementById('fecha').setAttribute('min', hoy);
}

function populateServiceSelect() {
  const sel = document.getElementById('servicio');
  sel.innerHTML = SERVICIOS.map((s) =>
    `<option value="${s.precio}" data-id="${s.id}" data-n="${s.nom}">${s.nom} — $${s.precio.toLocaleString('es-MX')}</option>`
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
    selExtras[slug] = { extraId, precio: p };
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
    });

    await sendEmailNotification(booking, correo, telefono, veh, tap, extTotal);

    document.getElementById('modalDetalles').innerHTML = `
      <div class="modal-linea"><span>Folio</span><span>${booking.folio}</span></div>
      <div class="modal-linea"><span>Cliente</span><span>${nombre}</span></div>
      <div class="modal-linea"><span>Correo</span><span>${correo}</span></div>
      <div class="modal-linea"><span>Servicio</span><span>${booking.servicio}</span></div>
      <div class="modal-linea"><span>Fecha</span><span>${fecha}</span></div>
      <div class="modal-linea"><span>Hora</span><span>${hora}</span></div>
      <div class="modal-linea"><span>Total</span><span>$${total.toLocaleString('es-MX')} MXN</span></div>
    `;
    document.getElementById('modalOk').classList.add('show');
  } catch (err) {
    alert(err.message || 'Error al agendar la cita');
    document.getElementById('modalErr').classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar y Enviar Cita →';
  }
}

async function sendEmailNotification(booking, correo, telefono, veh, tap, extTotal) {
  if (!window.emailjs || !EMAILJS.publicKey || EMAILJS.publicKey === 'TU_PUBLIC_KEY') return;

  const extrasNombres = Object.keys(selExtras)
    .map((id) => EXTRAS.find((e) => e.id === id)?.nom)
    .filter(Boolean)
    .join(', ') || 'Ninguno';

  try {
    await emailjs.send(EMAILJS.serviceId, EMAILJS.templateId, {
      nombre: booking.nombre,
      correo,
      telefono,
      servicio: booking.servicio,
      vehiculo: veh.options[veh.selectedIndex].text.split(' (')[0],
      tapiceria: tap.options[tap.selectedIndex].text.split(' (')[0],
      extras: extrasNombres,
      fecha: booking.fecha,
      hora: booking.hora,
      total: '$' + booking.total.toLocaleString('es-MX') + ' MXN',
      folio: booking.folio,
    });
  } catch (e) {
    console.warn('EmailJS no configurado o falló:', e);
  }
}

function cerrar(id) {
  document.getElementById(id).classList.remove('show');
}

document.addEventListener('DOMContentLoaded', initApp);
