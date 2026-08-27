const express = require('express');
const getSupabase = require('../db/supabase');
const { sendBookingReceipt } = require('../services/gmail');
const { optionalCustomer } = require('../middleware/auth');
const {
  isValidFixedSlot,
  getServiceDuration,
  findAvailableBay,
  getAvailableSlots,
  filterPastSlotsToday,
  isSunday,
  isPastDate,
  BAY_COUNT,
  MAX_BOOKINGS_PER_ACCOUNT_PER_DAY,
  TOLERANCE_MINUTES,
  TURNOVER_BUFFER_MINUTES,
} = require('../utils/scheduling');

const router = express.Router();

async function generateFolio() {
  const supabase = getSupabase();
  const today = new Date();
  const prefix = `CIT-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const { count, error } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString().split('T')[0]);

  if (error) throw error;
  const seq = String((count || 0) + 1).padStart(4, '0');
  return `${prefix}-${seq}`;
}

async function loadDayBookings(fecha) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, hora, status, bay_number, duration_minutes, service_id,
      services ( slug, categoria, duration_minutes )
    `)
    .eq('fecha', fecha)
    .neq('status', 'cancelada');

  if (error) throw error;

  return (data || []).map((b) => ({
    ...b,
    duration_minutes: b.duration_minutes || getServiceDuration(b.services),
    slug: b.services?.slug,
    categoria: b.services?.categoria,
  }));
}

function validateBooking(body) {
  const required = ['nombre', 'email', 'telefono', 'serviceId', 'fecha', 'hora', 'total'];
  for (const field of required) {
    if (!body[field] && body[field] !== 0) {
      return `Campo requerido: ${field}`;
    }
  }

  if (!isValidFixedSlot(body.hora)) {
    return 'La hora debe ser en intervalos de 15 minutos (XX:00, XX:15, XX:30, XX:45) entre 8:00 y 17:45';
  }

  if (isSunday(body.fecha)) {
    return 'No trabajamos domingos';
  }

  if (isPastDate(body.fecha)) {
    return 'La fecha no puede ser en el pasado';
  }

  return null;
}

function startOfTodayMexicoIso() {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return `${ymd}T00:00:00.000-06:00`;
}

async function countAccountBookings(supabase, { customerId, email, sinceIso, fecha }) {
  const ids = new Set();
  const lookups = [];
  if (customerId) lookups.push({ col: 'customer_id', val: customerId, mode: 'eq' });
  if (email) lookups.push({ col: 'email', val: String(email).trim(), mode: 'ilike' });
  if (!lookups.length) return 0;

  for (const { col, val, mode } of lookups) {
    let q = supabase.from('bookings').select('id').neq('status', 'cancelada');
    q = mode === 'ilike' ? q.ilike(col, val) : q.eq(col, val);
    if (sinceIso) q = q.gte('created_at', sinceIso);
    if (fecha) q = q.eq('fecha', fecha);
    const { data, error } = await q;
    if (error) throw error;
    (data || []).forEach((row) => ids.add(row.id));
  }

  return ids.size;
}

const DAILY_LIMIT_MESSAGE =
  'Ya alcanzaste el límite de 2 citas por día en tu cuenta. No puedes agendar otra cita hasta el día siguiente.';

async function assertAccountDailyLimit(supabase, { customerId, email, fecha }) {
  const identity = { customerId: customerId || null, email: email || null };
  if (!identity.customerId && !identity.email) return;

  const createdToday = await countAccountBookings(supabase, {
    ...identity,
    sinceIso: startOfTodayMexicoIso(),
  });
  if (createdToday >= MAX_BOOKINGS_PER_ACCOUNT_PER_DAY) {
    const err = new Error(DAILY_LIMIT_MESSAGE);
    err.status = 409;
    err.code = 'DAILY_LIMIT';
    err.bookedToday = createdToday;
    throw err;
  }

  if (fecha) {
    const sameDay = await countAccountBookings(supabase, { ...identity, fecha });
    if (sameDay >= MAX_BOOKINGS_PER_ACCOUNT_PER_DAY) {
      const err = new Error(
        'Ya tienes 2 citas para esa fecha. Una cuenta puede agendar máximo 2 citas el mismo día. Elige otro día o espera al día siguiente.'
      );
      err.status = 409;
      err.code = 'DAILY_LIMIT';
      err.bookedOnFecha = sameDay;
      throw err;
    }
  }
}

function slotsMeta(extra = {}) {
  return {
    bayCount: BAY_COUNT,
    maxBookingsPerDay: MAX_BOOKINGS_PER_ACCOUNT_PER_DAY,
    toleranceMinutes: TOLERANCE_MINUTES,
    bufferMinutes: TURNOVER_BUFFER_MINUTES,
    ...extra,
  };
}

router.get('/quota', optionalCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const email = (req.query.email || req.customer?.email || '').trim();
    const customerId = req.customer?.customerId || null;
    if (!customerId && !email) {
      return res.json({
        maxPerDay: MAX_BOOKINGS_PER_ACCOUNT_PER_DAY,
        bookedToday: 0,
        remaining: MAX_BOOKINGS_PER_ACCOUNT_PER_DAY,
        limited: false,
      });
    }

    const bookedToday = await countAccountBookings(supabase, {
      customerId,
      email,
      sinceIso: startOfTodayMexicoIso(),
    });
    const remaining = Math.max(0, MAX_BOOKINGS_PER_ACCOUNT_PER_DAY - bookedToday);
    res.json({
      maxPerDay: MAX_BOOKINGS_PER_ACCOUNT_PER_DAY,
      bookedToday,
      remaining,
      limited: remaining <= 0,
      message: remaining <= 0 ? DAILY_LIMIT_MESSAGE : null,
    });
  } catch (err) {
    console.error('GET quota:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo consultar el límite de citas' });
  }
});

/** Available slots for a date + service (respects 1 bay + duration + buffer) */
router.get('/slots', optionalCustomer, async (req, res) => {
  try {
    const { fecha, serviceId } = req.query;
    if (!fecha || !serviceId) {
      return res.status(400).json({ error: 'Indica fecha y serviceId' });
    }
    if (isSunday(fecha)) {
      return res.json({
        slots: [],
        meta: slotsMeta({ reason: 'domingo' }),
      });
    }

    const supabase = getSupabase();
    const { data: service, error: svcErr } = await supabase
      .from('services')
      .select('id, slug, categoria, duration_minutes, nombre')
      .eq('id', serviceId)
      .single();

    if (svcErr || !service) {
      return res.status(400).json({ error: 'Servicio no válido' });
    }

    const duration = getServiceDuration(service);
    const existing = await loadDayBookings(fecha);
    let slots = filterPastSlotsToday(fecha, getAvailableSlots(existing, duration));
    const preferred = req.query.preferredHora || null;
    const suggestedHora = preferred
      ? (slots.find((h) => h >= String(preferred).slice(0, 5)) || slots[0] || null)
      : (slots[0] || null);

    const email = (req.query.email || req.customer?.email || '').trim();
    const customerId = req.customer?.customerId || null;
    let quota = null;
    if (customerId || email) {
      const bookedToday = await countAccountBookings(supabase, {
        customerId,
        email,
        sinceIso: startOfTodayMexicoIso(),
      });
      const remaining = Math.max(0, MAX_BOOKINGS_PER_ACCOUNT_PER_DAY - bookedToday);
      quota = {
        maxPerDay: MAX_BOOKINGS_PER_ACCOUNT_PER_DAY,
        bookedToday,
        remaining,
        limited: remaining <= 0,
        message: remaining <= 0 ? DAILY_LIMIT_MESSAGE : null,
      };
    }

    res.json({
      slots,
      suggestedHora,
      durationMinutes: duration,
      quota,
      meta: slotsMeta({ service: service.nombre }),
    });
  } catch (err) {
    console.error('GET slots:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudieron cargar los horarios' });
  }
});

router.get('/folio/:folio', async (req, res) => {
  try {
    const supabase = getSupabase();
    const folio = req.params.folio.trim().toUpperCase();

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        folio, nombre, email, telefono, fecha, hora, total, status,
        vehiculo_tipo, tapiceria, created_at, bay_number,
        services ( nombre )
      `)
      .eq('folio', folio)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Folio no encontrado' });
    }

    if (data.status === 'cancelada') {
      return res.status(400).json({ error: 'Esta cita ya fue cancelada', booking: data });
    }
    if (data.status === 'completada') {
      return res.status(400).json({ error: 'Esta cita ya fue completada y no puede cancelarse', booking: data });
    }

    res.json({
      folio: data.folio,
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      servicio: data.services?.nombre,
      fecha: data.fecha,
      hora: String(data.hora).slice(0, 5),
      total: Number(data.total),
      status: data.status,
      vehiculoTipo: data.vehiculo_tipo,
      tapiceria: data.tapiceria,
      bayNumber: data.bay_number,
    });
  } catch (err) {
    console.error('GET folio:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Error al buscar la cita' });
  }
});

router.post('/cancelar', async (req, res) => {
  try {
    const supabase = getSupabase();
    const folio = (req.body.folio || '').trim().toUpperCase();
    const motivo = (req.body.motivo || '').trim();

    if (!folio) return res.status(400).json({ error: 'Ingresa tu folio de cita' });
    if (!motivo || motivo.length < 5) {
      return res.status(400).json({ error: 'El motivo de cancelación es obligatorio (mínimo 5 caracteres)' });
    }

    const { data: existing, error: findErr } = await supabase
      .from('bookings')
      .select('id, folio, status')
      .eq('folio', folio)
      .single();

    if (findErr || !existing) {
      return res.status(404).json({ error: 'Folio no encontrado' });
    }
    if (existing.status === 'cancelada') {
      return res.status(400).json({ error: 'Esta cita ya fue cancelada' });
    }
    if (existing.status === 'completada') {
      return res.status(400).json({ error: 'Esta cita ya fue completada y no puede cancelarse' });
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelada',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: motivo,
      })
      .eq('id', existing.id)
      .select('folio, status, cancelled_at')
      .single();

    if (error) throw error;

    res.json({ message: 'Cita cancelada correctamente', folio: data.folio, status: data.status });
  } catch (err) {
    console.error('POST cancelar:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo cancelar la cita' });
  }
});

router.post('/', optionalCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const err = validateBooking(req.body);
    if (err) return res.status(400).json({ error: err });

    const {
      nombre, email, telefono, serviceId,
      vehiculoTipo = 'Auto / Sedan', vehiculoExtra = 0,
      tapiceria = 'Tela', tapiceriaExtra = 0,
      fecha, hora, total, extras = [],
    } = req.body;

    const { data: service, error: svcErr } = await supabase
      .from('services')
      .select('id, nombre, slug, categoria, duration_minutes')
      .eq('id', serviceId)
      .single();

    if (svcErr || !service) {
      return res.status(400).json({ error: 'Servicio no válido' });
    }

    const duration = getServiceDuration(service);
    const existing = await loadDayBookings(fecha);
    try {
      await assertAccountDailyLimit(supabase, {
        customerId: req.customer?.customerId || null,
        email,
        fecha,
      });
    } catch (limitErr) {
      if (limitErr.code === 'DAILY_LIMIT') {
        return res.status(409).json({
          error: limitErr.message,
          code: 'DAILY_LIMIT',
        });
      }
      throw limitErr;
    }

    const bay = findAvailableBay(existing, hora, duration);

    if (!bay) {
      const available = filterPastSlotsToday(fecha, getAvailableSlots(existing, duration));
      const suggestedHora = available.find((h) => h > String(hora).slice(0, 5)) || available[0] || null;
      return res.status(409).json({
        error: suggestedHora
          ? `Ese horario no está disponible: la bahía está ocupada a esa hora o durante el servicio. El siguiente libre es ${suggestedHora}.`
          : 'No hay horario disponible: solo hay una bahía y está ocupada durante ese servicio.',
        suggestedHora,
        availableSlots: available,
      });
    }

    const folio = await generateFolio();

    const insertRow = {
      folio,
      nombre: nombre.trim(),
      email: email.trim(),
      telefono: telefono.trim(),
      service_id: serviceId,
      vehiculo_tipo: vehiculoTipo,
      vehiculo_extra: vehiculoExtra,
      tapiceria,
      tapiceria_extra: tapiceriaExtra,
      fecha,
      hora,
      total,
      status: 'pendiente',
      bay_number: bay,
      duration_minutes: duration,
    };
    if (req.customer?.customerId) {
      insertRow.customer_id = req.customer.customerId;
    }

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .insert(insertRow)
      .select('*, services(nombre)')
      .single();

    if (bookErr) throw bookErr;

    if (extras.length > 0) {
      const rows = extras.map((e) => ({
        booking_id: booking.id,
        extra_id: e.extraId,
        precio: e.precio,
      }));
      const { error: extErr } = await supabase.from('booking_extras').insert(rows);
      if (extErr) console.error('booking_extras:', extErr.message);
    }

    const extrasNombres = req.body.extrasNombres || [];

    const emailResult = await sendBookingReceipt({
      folio: booking.folio,
      nombre: booking.nombre,
      email: booking.email,
      telefono: booking.telefono,
      servicio: service.nombre,
      vehiculoTipo,
      tapiceria,
      extrasNombres,
      fecha: booking.fecha,
      hora: String(booking.hora).slice(0, 5),
      total: Number(booking.total),
      bayNumber: bay,
      durationMinutes: duration,
      toleranceMinutes: TOLERANCE_MINUTES,
    });

    res.status(201).json({
      id: booking.id,
      folio: booking.folio,
      nombre: booking.nombre,
      email: booking.email,
      servicio: service.nombre,
      fecha: booking.fecha,
      hora: booking.hora,
      total: Number(booking.total),
      status: booking.status,
      bayNumber: bay,
      durationMinutes: duration,
      emailSent: emailResult.sent,
      emailReason: emailResult.reason || null,
    });
  } catch (err) {
    console.error('POST /api/bookings:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo crear la cita' });
  }
});

router.patch('/:id/cancelar', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelada', cancelled_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .neq('status', 'cancelada')
      .select('folio, status')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Cita no encontrada o ya cancelada' });
    }

    res.json(data);
  } catch (err) {
    console.error('PATCH cancelar:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo cancelar la cita' });
  }
});

module.exports = router;
