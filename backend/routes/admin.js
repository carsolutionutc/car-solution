const express = require('express');
const jwt = require('jsonwebtoken');
const getSupabase = require('../db/supabase');
const { requireAdmin } = require('../middleware/auth');
const { filterByPeriod, buildAnalytics } = require('../utils/analytics');
const { applyServiceConsumption, applyOrderConsumption } = require('../services/inventory');
const { sendBookingReceipt } = require('../services/gmail');
const {
  isValidFixedSlot,
  getServiceDuration,
  findAvailableBay,
  getAvailableSlots,
  filterPastSlotsToday,
  suggestNextSlot,
  isSunday,
  isPastDate,
  minutesToTime,
  parseTimeToMinutes,
  TOLERANCE_MINUTES,
} = require('../utils/scheduling');

const router = express.Router();

async function generateAdminFolio() {
  const supabase = getSupabase();
  const today = new Date();
  const prefix = `CIT-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const { count, error } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString().split('T')[0]);
  if (error) throw error;
  return `${prefix}-${String((count || 0) + 1).padStart(4, '0')}`;
}

async function loadDayBookingsAdmin(fecha) {
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
  }));
}

function roundUpToSlot(mins) {
  const step = 15;
  return Math.ceil(mins / step) * step;
}

const BOOKING_SELECT = `
  id, folio, nombre, email, telefono, fecha, hora, total, status,
  vehiculo_tipo, vehiculo_extra, tapiceria, tapiceria_extra,
  created_at, cancelled_at, cancellation_reason,
  bay_number, checked_in_at, completed_at, duration_minutes,
  services ( id, nombre, categoria ),
  booking_extras ( precio, extras ( nombre ) )
`;

router.post('/login', (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ error: 'JWT_SECRET no configurado en .env' });
  }

  const { email, password } = req.body;

  if (
    email !== process.env.ADMIN_EMAIL ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = jwt.sign(
    { email, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, email });
});

router.get('/bookings', requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { status, folio, period = 'all', from, to } = req.query;

    let query = supabase
      .from('bookings')
      .select(`
        id, folio, nombre, email, telefono, fecha, hora, total, status,
        vehiculo_tipo, tapiceria, created_at, cancelled_at, cancellation_reason,
        bay_number, checked_in_at, completed_at, duration_minutes,
        services ( nombre, categoria )
      `)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false });

    if (status && status !== 'todos') query = query.eq('status', status);
    if (folio) query = query.ilike('folio', `%${folio.trim()}%`);

    const { data, error } = await query.limit(500);
    if (error) throw error;

    // Same period filter as charts (by appointment fecha for operational view)
    const filtered = filterByPeriod(data || [], period, from, to, 'fecha');
    res.json(filtered);
  } catch (err) {
    console.error('GET admin/bookings:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudieron cargar las citas' });
  }
});

router.get('/bookings/:id', requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    res.json(data);
  } catch (err) {
    console.error('GET booking detail:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo cargar la cita' });
  }
});

/**
 * QR scan flow:
 * - CIT-… bookings: pendiente → confirmada → completada (+ inventario servicio)
 * - ORD-… pedidos: pendiente → entregado (+ inventario productos)
 */
router.post('/scan', requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const folio = String(req.body.folio || '').trim().toUpperCase();
    if (!folio) return res.status(400).json({ error: 'Folio requerido' });

    // Pedidos de tienda
    if (folio.startsWith('ORD-')) {
      const { data: order, error: ordErr } = await supabase
        .from('product_orders')
        .select('id, folio, nombre, status, total')
        .eq('folio', folio)
        .single();

      if (ordErr || !order) {
        return res.status(404).json({ error: 'Pedido no encontrado' });
      }
      if (order.status === 'cancelada') {
        return res.status(400).json({ error: 'Este pedido está cancelado', folio, status: order.status });
      }
      if (order.status === 'entregado') {
        return res.status(400).json({ error: 'Este pedido ya fue entregado', folio, status: order.status });
      }

      await applyOrderConsumption(order.id);

      const now = new Date().toISOString();
      const { data, error: upErr } = await supabase
        .from('product_orders')
        .update({ status: 'entregado', picked_up_at: now })
        .eq('id', order.id)
        .eq('status', 'pendiente')
        .select('id, folio, status, picked_up_at')
        .single();

      if (upErr || !data) throw upErr || new Error('No se pudo confirmar la entrega');

      return res.json({
        action: 'order_pickup',
        type: 'order',
        message: `Pedido entregado — ${order.nombre}. Inventario descontado.`,
        folio: data.folio,
        status: data.status,
        previousStatus: 'pendiente',
        total: Number(order.total),
        cliente: order.nombre,
      });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, folio, nombre, status, service_id, fecha, hora, bay_number, services(nombre)')
      .eq('folio', folio)
      .single();

    if (error || !booking) {
      return res.status(404).json({ error: 'Folio no encontrado' });
    }

    if (booking.status === 'cancelada') {
      return res.status(400).json({ error: 'Esta cita está cancelada', folio, status: booking.status });
    }
    if (booking.status === 'completada') {
      return res.status(400).json({ error: 'Esta cita ya está completada', folio, status: booking.status });
    }

    const now = new Date().toISOString();

    if (booking.status === 'pendiente') {
      const { data, error: upErr } = await supabase
        .from('bookings')
        .update({ status: 'confirmada', checked_in_at: now })
        .eq('id', booking.id)
        .eq('status', 'pendiente')
        .select('id, folio, status, checked_in_at, bay_number')
        .single();

      if (upErr || !data) throw upErr || new Error('No se pudo confirmar');

      return res.json({
        action: 'check_in',
        type: 'booking',
        message: `Check-in OK — ${booking.nombre}. Cita confirmada.`,
        folio: data.folio,
        status: data.status,
        previousStatus: 'pendiente',
        bayNumber: data.bay_number,
        servicio: booking.services?.nombre,
        cliente: booking.nombre,
      });
    }

    if (booking.status === 'confirmada') {
      const { data, error: upErr } = await supabase
        .from('bookings')
        .update({ status: 'completada', completed_at: now })
        .eq('id', booking.id)
        .eq('status', 'confirmada')
        .select('id, folio, status, completed_at, bay_number')
        .single();

      if (upErr || !data) throw upErr || new Error('No se pudo completar');

      try {
        await applyServiceConsumption(booking.id, booking.service_id);
      } catch (invErr) {
        console.error('Inventario al completar:', invErr.message);
      }

      return res.json({
        action: 'complete',
        type: 'booking',
        message: `Servicio finalizado — ${booking.nombre}. Cita completada e insumos descontados.`,
        folio: data.folio,
        status: data.status,
        previousStatus: 'confirmada',
        bayNumber: data.bay_number,
        servicio: booking.services?.nombre,
        cliente: booking.nombre,
      });
    }

    return res.status(400).json({ error: `Estado no procesable: ${booking.status}` });
  } catch (err) {
    console.error('POST admin/scan:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo procesar el QR' });
  }
});

/**
 * Walk-in / cita en el momento: admin agenda ya (hoy u otra fecha).
 * Si walkIn=true y no hay hora, usa el siguiente slot libre.
 * Si checkInNow=true, deja la cita en confirmada (cliente ya en local).
 */
router.post('/bookings', requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const {
      nombre,
      telefono,
      email,
      serviceId,
      fecha: fechaIn,
      hora: horaIn,
      vehiculoTipo = 'Auto / Sedan',
      tapiceria = 'Tela',
      total,
      walkIn = true,
      checkInNow = true,
      sendEmail = false,
    } = req.body;

    if (!nombre?.trim() || !telefono?.trim() || !serviceId) {
      return res.status(400).json({ error: 'Nombre, teléfono y servicio son obligatorios' });
    }

    const hoy = new Date();
    const fecha =
      fechaIn ||
      `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    if (isSunday(fecha)) {
      return res.status(400).json({ error: 'No se agenda en domingo' });
    }
    if (isPastDate(fecha)) {
      return res.status(400).json({ error: 'La fecha no puede ser en el pasado' });
    }

    const { data: service, error: svcErr } = await supabase
      .from('services')
      .select('id, nombre, slug, categoria, duration_minutes, precio_base')
      .eq('id', serviceId)
      .single();

    if (svcErr || !service) {
      return res.status(400).json({ error: 'Servicio no válido' });
    }

    const duration = getServiceDuration(service);
    const existing = await loadDayBookingsAdmin(fecha);
    const available = filterPastSlotsToday(fecha, getAvailableSlots(existing, duration));

    let hora = horaIn ? String(horaIn).slice(0, 5) : null;
    if (!hora && walkIn) {
      const nowMins = hoy.getHours() * 60 + hoy.getMinutes();
      const preferred = minutesToTime(roundUpToSlot(nowMins));
      hora = available.find((h) => parseTimeToMinutes(h) >= parseTimeToMinutes(preferred)) || available[0] || null;
      if (!hora) {
        hora = suggestNextSlot(existing, duration, preferred);
      }
    }

    if (!hora || !isValidFixedSlot(hora)) {
      return res.status(409).json({
        error: 'No hay horario disponible. Elige otra hora o fecha.',
        availableSlots: available,
        suggestedHora: available[0] || null,
      });
    }

    const bay = findAvailableBay(existing, hora, duration);
    if (!bay) {
      const suggestedHora = available.find((h) => h > hora) || available[0] || null;
      return res.status(409).json({
        error: suggestedHora
          ? `Ese horario está ocupado. El siguiente libre es ${suggestedHora}.`
          : 'Sin bahías libres en ese horario.',
        suggestedHora,
        availableSlots: available,
      });
    }

    const folio = await generateAdminFolio();
    const mail = (email && String(email).trim()) || `walkin+${folio.toLowerCase()}@carsolution.local`;
    const status = checkInNow ? 'confirmada' : 'pendiente';
    const precio = total != null ? Number(total) : Number(service.precio_base) || 0;

    const insertRow = {
      folio,
      nombre: nombre.trim(),
      email: mail,
      telefono: telefono.trim(),
      service_id: serviceId,
      vehiculo_tipo: vehiculoTipo,
      vehiculo_extra: 0,
      tapiceria,
      tapiceria_extra: 0,
      fecha,
      hora,
      total: precio,
      status,
      bay_number: bay,
      duration_minutes: duration,
    };
    if (checkInNow) {
      insertRow.checked_in_at = new Date().toISOString();
    }

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .insert(insertRow)
      .select('id, folio, nombre, email, telefono, fecha, hora, total, status, bay_number, duration_minutes')
      .single();

    if (bookErr) throw bookErr;

    let emailResult = { sent: false, reason: 'skipped' };
    if (sendEmail && email && String(email).includes('@') && !String(email).includes('@carsolution.local')) {
      emailResult = await sendBookingReceipt({
        folio: booking.folio,
        nombre: booking.nombre,
        email: booking.email,
        telefono: booking.telefono,
        servicio: service.nombre,
        vehiculoTipo,
        tapiceria,
        extrasNombres: [],
        fecha: booking.fecha,
        hora: String(booking.hora).slice(0, 5),
        total: Number(booking.total),
        bayNumber: bay,
        durationMinutes: duration,
        toleranceMinutes: TOLERANCE_MINUTES,
      });
    }

    res.status(201).json({
      ...booking,
      hora: String(booking.hora).slice(0, 5),
      servicio: service.nombre,
      emailSent: emailResult.sent,
      emailReason: emailResult.reason || null,
      walkIn: Boolean(walkIn),
    });
  } catch (err) {
    console.error('POST admin/bookings:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo crear la cita walk-in' });
  }
});

router.patch('/bookings/:id/status', requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { status } = req.body;
    const valid = ['pendiente', 'confirmada', 'completada', 'cancelada'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    const { data: current } = await supabase
      .from('bookings')
      .select('id, status, service_id')
      .eq('id', req.params.id)
      .single();

    const update = { status };
    if (status === 'cancelada') {
      update.cancelled_at = new Date().toISOString();
      if (!req.body.cancellation_reason) {
        update.cancellation_reason = 'Cancelada por administrador';
      }
    }
    if (status === 'confirmada' && current?.status === 'pendiente') {
      update.checked_in_at = new Date().toISOString();
    }
    if (status === 'completada' && current?.status !== 'completada') {
      update.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('bookings')
      .update(update)
      .eq('id', req.params.id)
      .select('id, folio, status')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    if (status === 'completada' && current?.status !== 'completada' && current?.service_id) {
      try {
        await applyServiceConsumption(current.id, current.service_id);
      } catch (invErr) {
        console.error('Inventario al completar (manual):', invErr.message);
      }
    }

    res.json(data);
  } catch (err) {
    console.error('PATCH status:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo actualizar el estado' });
  }
});

router.get('/analytics', requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { period = 'all', from, to } = req.query;

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id, total, status, fecha, hora, created_at, cancelled_at,
        services ( id, nombre, categoria ),
        booking_extras ( extra_id, precio, extras ( nombre, slug ) )
      `);

    if (error) throw error;

    const filtered = filterByPeriod(bookings || [], period, from, to, 'fecha');
    res.json(buildAnalytics(filtered));
  } catch (err) {
    console.error('GET analytics:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudieron cargar las métricas' });
  }
});

module.exports = router;
