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

module.exports = router;
