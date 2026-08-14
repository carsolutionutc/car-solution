const express = require('express');
const getSupabase = require('../db/supabase');
const { requireAdmin } = require('../middleware/auth');
const {
  listInventory,
  saveInventoryAudit,
  listAudits,
  restockItem,
} = require('../services/inventory');

const router = express.Router();

router.get('/items', requireAdmin, async (_req, res) => {
  try {
    const items = await listInventory();
    res.json(items.map((i) => ({
      id: i.id,
      slug: i.slug,
      nombre: i.nombre,
      unidad: i.unidad,
      stockTeorico: Number(i.stock_teorico),
    })));
  } catch (err) {
    console.error('GET inventory/items:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo cargar el inventario' });
  }
});

router.post('/audit', requireAdmin, async (req, res) => {
  try {
    const { medidas, notas, syncStock = true } = req.body;
    if (!medidas || typeof medidas !== 'object') {
      return res.status(400).json({ error: 'Envía las medidas de cada insumo' });
    }

    const result = await saveInventoryAudit({
      medidas,
      notas,
      syncStock: syncStock !== false,
      createdBy: req.admin?.email || 'admin',
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('POST inventory/audit:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo guardar la consulta' });
  }
});

router.get('/audits', requireAdmin, async (_req, res) => {
  try {
    const audits = await listAudits(30);
    res.json(audits.map((a) => ({
      id: a.id,
      notas: a.notas,
      createdAt: a.created_at,
      createdBy: a.created_by,
      lines: (a.inventory_audit_lines || []).map((l) => ({
        nombre: l.inventory_items?.nombre,
        unidad: l.inventory_items?.unidad,
        stockTeorico: Number(l.stock_teorico),
        cantidadMedida: Number(l.cantidad_medida),
        diferencia: Number(l.diferencia),
        resultado: Number(l.diferencia) < 0 ? 'perdida' : Number(l.diferencia) > 0 ? 'sobrante' : 'exacto',
      })),
    })));
  } catch (err) {
    console.error('GET inventory/audits:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo cargar el historial' });
  }
});

router.post('/restock', requireAdmin, async (req, res) => {
  try {
    const { itemId, cantidad } = req.body;
    if (!itemId || cantidad == null || Number(cantidad) <= 0) {
      return res.status(400).json({ error: 'Indica itemId y cantidad positiva a agregar' });
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
