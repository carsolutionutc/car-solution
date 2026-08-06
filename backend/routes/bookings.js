const express = require('express');
const getSupabase = require('../db/supabase');
const { sendBookingReceipt } = require('../services/gmail');

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

function validateBooking(body) {
  const required = ['nombre', 'email', 'telefono', 'serviceId', 'fecha', 'hora', 'total'];
  for (const field of required) {
    if (!body[field] && body[field] !== 0) {
      return `Campo requerido: ${field}`;
    }
  }

  const horaNum = parseInt(String(body.hora).split(':')[0], 10);
  if (horaNum < 8 || horaNum >= 18) {
    return 'El horario de atención es de 8:00 AM a 6:00 PM';
  }

  const fecha = new Date(body.fecha + 'T12:00:00');
  if (fecha.getDay() === 0) {
    return 'No trabajamos domingos';
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fecha < hoy) {
    return 'La fecha no puede ser en el pasado';
  }

  return null;
}

router.post('/', async (req, res) => {
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
      .select('id, nombre')
      .eq('id', serviceId)
      .single();

    if (svcErr || !service) {
      return res.status(400).json({ error: 'Servicio no válido' });
    }

    const folio = await generateFolio();

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .insert({
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
      })
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
      emailSent: emailResult.sent,
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
