const express = require('express');
const getSupabase = require('../db/supabase');
const { requireCustomer } = require('../middleware/auth');
const { sendOrderReceipt } = require('../services/gmail');

const router = express.Router();

function mapProduct(i) {
  return {
    id: i.id,
    slug: i.slug,
    nombre: i.nombre,
    unidad: i.unidad,
    descripcion: i.descripcion || '',
    precio: Number(i.precio) || 0,
    packCantidad: Number(i.pack_cantidad) || 1,
    stockDisponible: Number(i.stock_teorico) || 0,
    // how many "packs" can still be sold
    packsDisponibles: Math.floor((Number(i.stock_teorico) || 0) / (Number(i.pack_cantidad) || 1)),
  };
}

/** Public catalog of sellable products */
router.get('/', async (_req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, slug, nombre, unidad, descripcion, precio, pack_cantidad, stock_teorico, vendible, activo')
      .eq('activo', true)
      .eq('vendible', true)
      .order('nombre');

    if (error) throw error;
    res.json((data || []).filter((i) => Number(i.precio) > 0).map(mapProduct));
  } catch (err) {
    console.error('GET /products:', err.message);
    res.status(500).json({ error: err.message || 'No se pudieron cargar los productos' });
  }
});

async function generateOrderFolio() {
  const supabase = getSupabase();
  const today = new Date();
  const prefix = `ORD-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const { count, error } = await supabase
    .from('product_orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString().split('T')[0]);

  if (error) throw error;
  return `${prefix}-${String((count || 0) + 1).padStart(4, '0')}`;
}

/**
 * Checkout: body { items: [{ itemId, cantidad }] }
 * cantidad = number of packs/units to buy
 */
router.post('/checkout', requireCustomer, async (req, res) => {
  try {
    const supabase = getSupabase();
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'El carrito está vacío' });
    }

    const ids = items.map((i) => i.itemId);
    const { data: catalog, error: catErr } = await supabase
      .from('inventory_items')
      .select('id, slug, nombre, unidad, precio, pack_cantidad, stock_teorico, vendible, activo')
      .in('id', ids);

    if (catErr) throw catErr;

    const byId = Object.fromEntries((catalog || []).map((c) => [c.id, c]));
    const lines = [];
    let total = 0;

    for (const row of items) {
      const prod = byId[row.itemId];
      const qty = Number(row.cantidad);
      if (!prod || !prod.activo || !prod.vendible) {
        return res.status(400).json({ error: 'Producto no válido en el carrito' });
      }
      if (!qty || qty <= 0) {
        return res.status(400).json({ error: `Cantidad inválida para ${prod.nombre}` });
      }

      const pack = Number(prod.pack_cantidad) || 1;
      const needed = qty * pack;
      const stock = Number(prod.stock_teorico) || 0;
      if (needed > stock) {
        return res.status(409).json({
          error: `Stock insuficiente de ${prod.nombre}. Disponible aprox. ${Math.floor(stock / pack)} unidad(es).`,
        });
      }

      const precio = Number(prod.precio) || 0;
      const subtotal = precio * qty;
      total += subtotal;
      lines.push({
        item_id: prod.id,
        nombre: prod.nombre,
        cantidad: qty,
        pack_cantidad: pack,
        precio_unitario: precio,
        subtotal,
      });
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, nombre, email')
      .eq('id', req.customer.customerId)
      .single();

    const folio = await generateOrderFolio();

    const { data: order, error: ordErr } = await supabase
      .from('product_orders')
      .insert({
        folio,
        customer_id: req.customer.customerId,
        nombre: customer?.nombre || req.customer.nombre || 'Cliente',
        email: customer?.email || req.customer.email,
        total,
        status: 'pendiente',
      })
      .select('id, folio, total, status, email, nombre')
      .single();

    if (ordErr) throw ordErr;

    const { error: linesErr } = await supabase.from('product_order_items').insert(
      lines.map((l) => ({ ...l, order_id: order.id }))
    );
    if (linesErr) throw linesErr;

    const emailResult = await sendOrderReceipt({
      folio: order.folio,
      nombre: order.nombre,
      email: order.email,
      total: Number(order.total),
      items: lines.map((l) => ({
        nombre: l.nombre,
        cantidad: l.cantidad,
        subtotal: l.subtotal,
      })),
    });

    res.status(201).json({
      id: order.id,
      folio: order.folio,
      total: Number(order.total),
      status: order.status,
      emailSent: emailResult.sent,
      items: lines.map((l) => ({
        nombre: l.nombre,
        cantidad: l.cantidad,
        subtotal: l.subtotal,
      })),
    });
  } catch (err) {
    console.error('POST /products/checkout:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo completar la compra' });
  }
});

module.exports = router;
