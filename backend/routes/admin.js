const express = require('express');
const jwt = require('jsonwebtoken');
const getSupabase = require('../db/supabase');
const { requireAdmin } = require('../middleware/auth');
const { filterByPeriod, buildAnalytics } = require('../utils/analytics');

const router = express.Router();

const BOOKING_SELECT = `
  id, folio, nombre, email, telefono, fecha, hora, total, status,
  vehiculo_tipo, vehiculo_extra, tapiceria, tapiceria_extra,
  created_at, cancelled_at, cancellation_reason,
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
    const { status, folio } = req.query;

    let query = supabase
      .from('bookings')
      .select(`
        id, folio, nombre, email, telefono, fecha, hora, total, status,
        vehiculo_tipo, tapiceria, created_at, cancelled_at, cancellation_reason,
        services ( nombre, categoria )
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'todos') query = query.eq('status', status);
    if (folio) query = query.ilike('folio', `%${folio.trim()}%`);

    const { data, error } = await query.limit(300);
    if (error) throw error;

    res.json(data);
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

router.patch('/bookings/:id/status', requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { status } = req.body;
    const valid = ['pendiente', 'confirmada', 'completada', 'cancelada'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    const update = { status };
    if (status === 'cancelada') {
      update.cancelled_at = new Date().toISOString();
      if (!req.body.cancellation_reason) {
        update.cancellation_reason = 'Cancelada por administrador';
      }
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

    const filtered = filterByPeriod(bookings || [], period, from, to);
    res.json(buildAnalytics(filtered));
  } catch (err) {
    console.error('GET analytics:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudieron cargar las métricas' });
  }
});

module.exports = router;
