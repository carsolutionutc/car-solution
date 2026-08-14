const express = require('express');
const getSupabase = require('../db/supabase');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const supabase = getSupabase();
    const [servicesRes, extrasRes] = await Promise.all([
      supabase.from('services').select('*').eq('activo', true).order('precio_base'),
      supabase.from('extras').select('*').eq('activo', true).order('precio'),
    ]);

    if (servicesRes.error) throw servicesRes.error;
    if (extrasRes.error) throw extrasRes.error;

    res.json({
      services: servicesRes.data.map(mapService),
      extras: extrasRes.data.map(mapExtra),
    });
  } catch (err) {
    console.error('GET /api/services:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudieron cargar los servicios' });
  }
});

function mapService(s) {
  return {
    id: s.id,
    slug: s.slug,
    cat: s.categoria,
    nom: s.nombre,
    desc: s.descripcion,
    precio: Number(s.precio_base),
    items: s.items || [],
    pop: s.popular,
    durationMinutes: Number(s.duration_minutes) || 30,
  };
}

function mapExtra(e) {
  return {
    id: e.slug,
    extraId: e.id,
    nom: e.nombre,
    p: Number(e.precio),
  };
}

module.exports = router;
