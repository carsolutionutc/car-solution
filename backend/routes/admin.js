const express = require('express');
const jwt = require('jsonwebtoken');
const getSupabase = require('../db/supabase');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

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
    const { status, from, to } = req.query;
    let query = supabase
      .from('bookings')
      .select(`
        id, folio, nombre, email, telefono, fecha, hora, total, status,
        vehiculo_tipo, tapiceria, created_at, cancelled_at,
        services ( nombre, categoria )
      `)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (from) query = query.gte('fecha', from);
    if (to) query = query.lte('fecha', to);

    const { data, error } = await query.limit(200);
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('GET admin/bookings:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudieron cargar las citas' });
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

router.get('/analytics', requireAdmin, async (_req, res) => {
  try {
    const supabase = getSupabase();
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id, total, status, fecha, hora, created_at,
        services ( id, nombre, categoria ),
        booking_extras ( extra_id, precio, extras ( nombre, slug ) )
      `);

    if (error) throw error;

    const all = bookings || [];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const completadas = all.filter((b) => b.status === 'completada');
    const canceladas = all.filter((b) => b.status === 'cancelada');
    const pendientes = all.filter((b) => b.status === 'pendiente');
    const confirmadas = all.filter((b) => b.status === 'confirmada');

    const ingresosMes = completadas
      .filter((b) => {
        const d = new Date(b.created_at);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      })
      .reduce((sum, b) => sum + Number(b.total), 0);

    const ingresosTotal = completadas.reduce((sum, b) => sum + Number(b.total), 0);
    const ticketPromedio = completadas.length
      ? ingresosTotal / completadas.length
      : 0;

    const tasaCancelacion = all.length
      ? (canceladas.length / all.length) * 100
      : 0;

    const serviciosCount = {};
    all.forEach((b) => {
      const name = b.services?.nombre || 'Desconocido';
      serviciosCount[name] = (serviciosCount[name] || 0) + 1;
    });
    const topServicios = Object.entries(serviciosCount)
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const extrasCount = {};
    all.forEach((b) => {
      (b.booking_extras || []).forEach((be) => {
        const name = be.extras?.nombre || 'Extra';
        extrasCount[name] = (extrasCount[name] || 0) + 1;
      });
    });
    const topExtras = Object.entries(extrasCount)
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total);

    const ingresosPorMes = {};
    completadas.forEach((b) => {
      const d = new Date(b.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      ingresosPorMes[key] = (ingresosPorMes[key] || 0) + Number(b.total);
    });
    const ingresosMensuales = Object.entries(ingresosPorMes)
      .map(([mes, total]) => ({ mes, total }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12);

    const cancelacionesPorMes = {};
    canceladas.forEach((b) => {
      const d = new Date(b.cancelled_at || b.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      cancelacionesPorMes[key] = (cancelacionesPorMes[key] || 0) + 1;
    });
    const cancelacionesMensuales = Object.entries(cancelacionesPorMes)
      .map(([mes, total]) => ({ mes, total }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12);

    const statusBreakdown = {
      pendiente: pendientes.length,
      confirmada: confirmadas.length,
      completada: completadas.length,
      cancelada: canceladas.length,
    };

    res.json({
      kpis: {
        totalCitas: all.length,
        ingresosMes: Math.round(ingresosMes),
        ingresosTotal: Math.round(ingresosTotal),
        ticketPromedio: Math.round(ticketPromedio),
        tasaCancelacion: Math.round(tasaCancelacion * 10) / 10,
        pendientes: pendientes.length,
        canceladas: canceladas.length,
        completadas: completadas.length,
      },
      topServicios,
      topExtras,
      ingresosMensuales,
      cancelacionesMensuales,
      statusBreakdown,
    });
  } catch (err) {
    console.error('GET analytics:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudieron cargar las métricas' });
  }
});

module.exports = router;
