const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const getSupabase = require('../db/supabase');
const { requireCustomer } = require('../middleware/auth');

const router = express.Router();

function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID || '';
}

router.get('/config', (_req, res) => {
  const clientId = getGoogleClientId();
  res.json({
    googleClientId: clientId || null,
    enabled: Boolean(clientId),
  });
});

router.post('/google', async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ error: 'JWT_SECRET no configurado' });
    }

    const clientId = getGoogleClientId();
    if (!clientId) {
      return res.status(503).json({ error: 'GOOGLE_CLIENT_ID no configurado' });
    }

    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Falta credential de Google' });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      return res.status(401).json({ error: 'Token de Google inválido' });
    }

    const supabase = getSupabase();
    const profile = {
      google_sub: payload.sub,
      email: payload.email,
      nombre: payload.name || payload.email.split('@')[0],
      foto_url: payload.picture || null,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('google_sub', payload.sub)
      .maybeSingle();

    let customer;
    if (existing?.id) {
      const { data, error } = await supabase
        .from('customers')
        .update(profile)
        .eq('id', existing.id)
        .select('id, email, nombre, foto_url')
        .single();
      if (error) throw error;
      customer = data;
    } else {
      const { data, error } = await supabase
        .from('customers')
        .insert(profile)
        .select('id, email, nombre, foto_url')
        .single();
      if (error) throw error;
      customer = data;
    }

    const token = jwt.sign(
      {
        role: 'customer',
        customerId: customer.id,
        email: customer.email,
        nombre: customer.nombre,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      customer: {
        id: customer.id,
        email: customer.email,
        nombre: customer.nombre,
        fotoUrl: customer.foto_url,
      },
    });
  } catch (err) {
    console.error('POST /auth/google:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo iniciar sesión con Google' });
  }
});

router.get('/me', requireCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('customers')
      .select('id, email, nombre, foto_url, created_at')
      .eq('id', req.customer.customerId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({
      id: data.id,
      email: data.email,
      nombre: data.nombre,
      fotoUrl: data.foto_url,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bookings', requireCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const email = req.customer.email;

    const [byCustomer, byEmail] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id, folio, fecha, hora, total, status, bay_number, duration_minutes, created_at, customer_id, email,
          services ( nombre )
        `)
        .eq('customer_id', req.customer.customerId)
        .order('fecha', { ascending: false })
        .limit(100),
      supabase
        .from('bookings')
        .select(`
          id, folio, fecha, hora, total, status, bay_number, duration_minutes, created_at, customer_id, email,
          services ( nombre )
        `)
        .eq('email', email)
        .order('fecha', { ascending: false })
        .limit(100),
    ]);

    if (byCustomer.error) throw byCustomer.error;
    if (byEmail.error) throw byEmail.error;

    const map = new Map();
    [...(byCustomer.data || []), ...(byEmail.data || [])].forEach((b) => map.set(b.id, b));
    const data = Array.from(map.values()).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    res.json(data.map((b) => ({
      id: b.id,
      folio: b.folio,
      fecha: b.fecha,
      hora: String(b.hora).slice(0, 5),
      total: Number(b.total),
      status: b.status,
      bayNumber: b.bay_number,
      durationMinutes: b.duration_minutes,
      servicio: b.services?.nombre,
      createdAt: b.created_at,
    })));
  } catch (err) {
    console.error('GET /auth/bookings:', err.message);
    res.status(500).json({ error: err.message || 'No se pudieron cargar tus citas' });
  }
});

/** Detalle de una cita propia (ficha) */
router.get('/bookings/:id', requireCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const email = (req.customer.email || '').toLowerCase();

    const { data: b, error } = await supabase
      .from('bookings')
      .select(`
        id, folio, nombre, email, telefono, fecha, hora, total, status,
        vehiculo_tipo, tapiceria, bay_number, duration_minutes,
        created_at, cancelled_at, cancellation_reason, checked_in_at, completed_at,
        customer_id,
        services ( nombre ),
        booking_extras ( precio, extras ( nombre ) )
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !b) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const owns =
      b.customer_id === req.customer.customerId ||
      (b.email || '').toLowerCase() === email;
    if (!owns) {
      return res.status(403).json({ error: 'No puedes ver esta cita' });
    }

    res.json({
      id: b.id,
      folio: b.folio,
      nombre: b.nombre,
      email: b.email,
      telefono: b.telefono,
      fecha: b.fecha,
      hora: String(b.hora).slice(0, 5),
      total: Number(b.total),
      status: b.status,
      vehiculoTipo: b.vehiculo_tipo,
      tapiceria: b.tapiceria,
      bayNumber: b.bay_number,
      durationMinutes: b.duration_minutes,
      servicio: b.services?.nombre,
      extras: (b.booking_extras || []).map((e) => ({
        nombre: e.extras?.nombre,
        precio: Number(e.precio),
      })),
      createdAt: b.created_at,
      cancelledAt: b.cancelled_at,
      cancellationReason: b.cancellation_reason,
      checkedInAt: b.checked_in_at,
      completedAt: b.completed_at,
      canCancel: b.status === 'pendiente' || b.status === 'confirmada',
    });
  } catch (err) {
    console.error('GET /auth/bookings/:id:', err.message);
    res.status(500).json({ error: err.message || 'No se pudo cargar la cita' });
  }
});

router.get('/orders', requireCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('product_orders')
      .select(`
        id, folio, total, status, created_at, picked_up_at,
        product_order_items ( nombre, cantidad, precio_unitario, subtotal )
      `)
      .eq('customer_id', req.customer.customerId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json((data || []).map((o) => ({
      id: o.id,
      folio: o.folio,
      total: Number(o.total),
      status: o.status,
      createdAt: o.created_at,
      pickedUpAt: o.picked_up_at,
      items: (o.product_order_items || []).map((i) => ({
        nombre: i.nombre,
        cantidad: Number(i.cantidad),
        precioUnitario: Number(i.precio_unitario),
        subtotal: Number(i.subtotal),
      })),
    })));
  } catch (err) {
    console.error('GET /auth/orders:', err.message);
    res.status(500).json({ error: err.message || 'No se pudieron cargar tus pedidos' });
  }
});

/** Detalle de un pedido propio (ficha) */
router.get('/orders/:id', requireCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: o, error } = await supabase
      .from('product_orders')
      .select(`
        id, folio, nombre, email, total, status, created_at, picked_up_at,
        cancelled_at, cancellation_reason, customer_id,
        product_order_items ( nombre, cantidad, precio_unitario, subtotal )
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !o) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    if (o.customer_id !== req.customer.customerId) {
      return res.status(403).json({ error: 'No puedes ver este pedido' });
    }

    res.json({
      id: o.id,
      folio: o.folio,
      nombre: o.nombre,
      email: o.email,
      total: Number(o.total),
      status: o.status,
      createdAt: o.created_at,
      pickedUpAt: o.picked_up_at,
      cancelledAt: o.cancelled_at,
      cancellationReason: o.cancellation_reason,
      items: (o.product_order_items || []).map((i) => ({
        nombre: i.nombre,
        cantidad: Number(i.cantidad),
        precioUnitario: Number(i.precio_unitario),
        subtotal: Number(i.subtotal),
      })),
      canCancel: o.status === 'pendiente',
    });
  } catch (err) {
    console.error('GET /auth/orders/:id:', err.message);
    res.status(500).json({ error: err.message || 'No se pudo cargar el pedido' });
  }
});

/** Cancel own booking from account */
router.post('/bookings/:id/cancel', requireCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const motivo = String(req.body.motivo || '').trim();
    if (motivo.length < 5) {
      return res.status(400).json({ error: 'El motivo de cancelación es obligatorio (mínimo 5 caracteres)' });
    }

    const email = (req.customer.email || '').toLowerCase();
    const { data: booking, error: findErr } = await supabase
      .from('bookings')
      .select('id, folio, status, customer_id, email')
      .eq('id', req.params.id)
      .single();

    if (findErr || !booking) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const owns =
      booking.customer_id === req.customer.customerId ||
      (booking.email || '').toLowerCase() === email;
    if (!owns) {
      return res.status(403).json({ error: 'No puedes cancelar esta cita' });
    }
    if (booking.status === 'cancelada') {
      return res.status(400).json({ error: 'Esta cita ya fue cancelada' });
    }
    if (booking.status === 'completada') {
      return res.status(400).json({ error: 'Esta cita ya fue completada y no puede cancelarse' });
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelada',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: motivo,
      })
      .eq('id', booking.id)
      .select('folio, status')
      .single();

    if (error) throw error;
    res.json({ message: 'Cita cancelada', folio: data.folio, status: data.status });
  } catch (err) {
    console.error('POST /auth/bookings/:id/cancel:', err.message);
    res.status(500).json({ error: err.message || 'No se pudo cancelar la cita' });
  }
});

/** Cancel own product order from account */
router.post('/orders/:id/cancel', requireCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const motivo = String(req.body.motivo || '').trim();
    if (motivo.length < 5) {
      return res.status(400).json({ error: 'El motivo de cancelación es obligatorio (mínimo 5 caracteres)' });
    }

    const { data: order, error: findErr } = await supabase
      .from('product_orders')
      .select('id, folio, status, customer_id')
      .eq('id', req.params.id)
      .single();

    if (findErr || !order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    if (order.customer_id !== req.customer.customerId) {
      return res.status(403).json({ error: 'No puedes cancelar este pedido' });
    }
    if (order.status === 'cancelada') {
      return res.status(400).json({ error: 'Este pedido ya fue cancelado' });
    }
    if (order.status === 'entregado') {
      return res.status(400).json({ error: 'Este pedido ya fue entregado y no puede cancelarse' });
    }

    const update = {
      status: 'cancelada',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: motivo,
    };

    let { data, error } = await supabase
      .from('product_orders')
      .update(update)
      .eq('id', order.id)
      .select('folio, status')
      .single();

    if (error && /cancellation_reason/i.test(error.message)) {
      delete update.cancellation_reason;
      ({ data, error } = await supabase
        .from('product_orders')
        .update(update)
        .eq('id', order.id)
        .select('folio, status')
        .single());
    }

    if (error) throw error;
    res.json({ message: 'Pedido cancelado', folio: data.folio, status: data.status });
  } catch (err) {
    console.error('POST /auth/orders/:id/cancel:', err.message);
    res.status(500).json({ error: err.message || 'No se pudo cancelar el pedido' });
  }
});

module.exports = router;
