const express = require('express');
const getSupabase = require('../db/supabase');
const { requireCustomer } = require('../middleware/auth');
const { sendOrderReceipt } = require('../services/gmail');

const router = express.Router();

const CATEGORY_LABELS = {
  lavado: 'Lavado',
  proteccion: 'Protección / Brillo',
  interiores: 'Interiores',
  limpieza: 'Limpieza profunda',
  accesorios: 'Accesorios',
  general: 'General',
};

/** Fallback image path by slug if DB column imagen is empty */
const SLUG_IMAGES = {
  shampoo: 'products/armor-all-ultra-shine.jpg',
  cera: 'products/turtle-wax-super-hard-shell.jpg',
  trapos: 'products/autozone-trapos-microfibra.jpg',
  polish: 'products/meguiars-ultimate-polish.jpg',
  almorol: 'products/armor-all-protectant.jpg',
  aromatizante: 'products/little-trees-black-ice.jpg',
  cepillos: 'products/armor-all-cepillo-detalle.jpg',
  desengrasante: 'products/turtle-wax-bug-tar.jpg',
  microfibra: 'products/autozone-panos-microfibra.jpg',
};

function mapProduct(i) {
  const imagen = i.imagen || SLUG_IMAGES[i.slug] || `products/${i.slug}.jpg`;
  return {
    id: i.id,
    slug: i.slug,
    nombre: i.nombre,
    unidad: i.unidad,
    descripcion: i.descripcion || '',
    categoria: i.categoria || 'general',
    categoriaLabel: CATEGORY_LABELS[i.categoria] || CATEGORY_LABELS.general,
    imagen: `/img/${imagen.replace(/^\/?img\//, '')}`,
    precio: Number(i.precio) || 0,
    packCantidad: Number(i.pack_cantidad) || 1,
    stockDisponible: Number(i.stock_teorico) || 0,
    packsDisponibles: Math.floor((Number(i.stock_teorico) || 0) / (Number(i.pack_cantidad) || 1)),
  };
}

/** Public catalog of sellable products */
router.get('/', async (_req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, slug, nombre, unidad, descripcion, categoria, imagen, precio, pack_cantidad, stock_teorico, vendible, activo')
      .eq('activo', true)
      .eq('vendible', true)
      .order('categoria')
      .order('nombre');

    if (error) throw error;
    const products = (data || []).filter((i) => Number(i.precio) > 0).map(mapProduct);
    const categories = [...new Set(products.map((p) => p.categoria))].map((c) => ({
      id: c,
      label: CATEGORY_LABELS[c] || c,
    }));
    res.json({ products, categories });
  } catch (err) {
    console.error('GET /products:', err.message);
    // Fallback if categoria/imagen columns missing
    if (/categoria|imagen/i.test(err.message)) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('inventory_items')
          .select('id, slug, nombre, unidad, descripcion, precio, pack_cantidad, stock_teorico, vendible, activo')
          .eq('activo', true)
          .eq('vendible', true)
          .order('nombre');
        const products = (data || []).filter((i) => Number(i.precio) > 0).map((i) => mapProduct({ ...i, categoria: 'general' }));
        return res.json({ products, categories: [{ id: 'general', label: 'General' }] });
      } catch (e2) {
        return res.status(500).json({ error: e2.message });
      }
    }
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
      emailReason: emailResult.reason || null,
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
