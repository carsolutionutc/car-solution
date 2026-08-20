const express = require('express');
const getSupabase = require('../db/supabase');
const { requireAdmin } = require('../middleware/auth');
const {
  listInventoryOverview,
  listConsumptionLog,
  restockItem,
} = require('../services/inventory');

const router = express.Router();

router.get('/items', requireAdmin, async (_req, res) => {
  try {
    const items = await listInventoryOverview();
    res.json(items);
  } catch (err) {
    console.error('GET inventory/items:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo cargar el inventario' });
  }
});

router.get('/consumption', requireAdmin, async (_req, res) => {
  try {
    const rows = await listConsumptionLog(100);
    res.json(rows);
  } catch (err) {
    console.error('GET inventory/consumption:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo cargar el consumo' });
  }
});

router.post('/restock', requireAdmin, async (req, res) => {
  try {
    const { itemId, cantidad } = req.body;
    if (!itemId || cantidad == null || Number(cantidad) <= 0) {
      return res.status(400).json({ error: 'Indica producto y cantidad positiva a agregar' });
    }
    const item = await restockItem(itemId, cantidad);
    res.json({
      id: item.id,
      slug: item.slug,
      nombre: item.nombre,
      unidad: item.unidad,
      stockTeorico: Number(item.stock_teorico),
    });
  } catch (err) {
    console.error('POST inventory/restock:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo reabastecer' });
  }
});

/** Expected materials for a service (reference) */
router.get('/service-materials/:serviceId', requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('service_materials')
      .select('cantidad, inventory_items ( slug, nombre, unidad )')
      .eq('service_id', req.params.serviceId);

    if (error) throw error;
    res.json((data || []).map((r) => ({
      nombre: r.inventory_items?.nombre,
      unidad: r.inventory_items?.unidad,
      cantidad: Number(r.cantidad),
    })));
  } catch (err) {
    console.error('GET service-materials:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo cargar' });
  }
});

module.exports = router;
