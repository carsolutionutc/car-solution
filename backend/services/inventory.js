const getSupabase = require('../db/supabase');

/** Deduct expected materials when a booking is completed */
async function applyServiceConsumption(bookingId, serviceId) {
  const supabase = getSupabase();

  const { data: materials, error } = await supabase
    .from('service_materials')
    .select('item_id, cantidad, inventory_items ( id, stock_teorico )')
    .eq('service_id', serviceId);

  if (error) throw error;
  if (!materials?.length) return { deducted: [] };

  const deducted = [];

  for (const row of materials) {
    const qty = Number(row.cantidad);
    const item = row.inventory_items;
    if (!item) continue;

    const newStock = Number(item.stock_teorico) - qty;

    const { error: upErr } = await supabase
      .from('inventory_items')
      .update({ stock_teorico: newStock })
      .eq('id', row.item_id);

    if (upErr) throw upErr;

    await supabase.from('inventory_usage_log').insert({
      booking_id: bookingId,
      origen: 'servicio',
      item_id: row.item_id,
      cantidad: qty,
    });

    deducted.push({ itemId: row.item_id, cantidad: qty, stockTeorico: newStock });
  }

  return { deducted };
}

async function listInventory() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, slug, nombre, unidad, stock_teorico, precio, vendible, pack_cantidad, descripcion, activo')
    .eq('activo', true)
    .order('nombre');

  if (error) throw error;
  return data || [];
}

/** Inventory with which services consume each item */
async function listInventoryOverview() {
  const supabase = getSupabase();
  const items = await listInventory();

  const { data: mats, error } = await supabase
    .from('service_materials')
    .select('item_id, cantidad, services ( nombre, slug )');

  if (error) throw error;

  const byItem = {};
  (mats || []).forEach((m) => {
    if (!byItem[m.item_id]) byItem[m.item_id] = [];
    byItem[m.item_id].push({
      servicio: m.services?.nombre || 'Servicio',
      cantidad: Number(m.cantidad),
    });
  });

  return items.map((i) => ({
    id: i.id,
    slug: i.slug,
    nombre: i.nombre,
    unidad: i.unidad,
    stockTeorico: Number(i.stock_teorico),
    precio: Number(i.precio) || 0,
    vendible: i.vendible !== false,
    packCantidad: Number(i.pack_cantidad) || 1,
    descripcion: i.descripcion || '',
    descuentos: byItem[i.id] || [],
  }));
}

/** Recent consumption: servicios + compras (pendientes y entregadas) */
async function listConsumptionLog(limit = 80) {
  const supabase = getSupabase();

  const [{ data: usage, error: usageErr }, { data: orders, error: ordersErr }] = await Promise.all([
    supabase
      .from('inventory_usage_log')
      .select(`
        id, cantidad, created_at, booking_id, order_id, origen,
        inventory_items ( nombre, unidad, slug )
      `)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('product_orders')
      .select(`
        id, folio, nombre, status, total, created_at, picked_up_at,
        product_order_items ( nombre, cantidad, subtotal )
      `)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  if (usageErr) throw usageErr;
  if (ordersErr) throw ordersErr;

  const bookingIds = [...new Set((usage || []).map((u) => u.booking_id).filter(Boolean))];
  let bookingMap = {};
  if (bookingIds.length) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, folio, services ( nombre )')
      .in('id', bookingIds);
    bookingMap = Object.fromEntries((bookings || []).map((b) => [b.id, b]));
  }

  const orderIds = [...new Set((usage || []).map((u) => u.order_id).filter(Boolean))];
  let orderMap = {};
  if (orderIds.length) {
    const { data: ordRows } = await supabase
      .from('product_orders')
      .select('id, folio, nombre')
      .in('id', orderIds);
    orderMap = Object.fromEntries((ordRows || []).map((o) => [o.id, o]));
  }

  const rows = [];

  // Compras registradas (aunque aún no se hayan entregado / descontado)
  (orders || []).forEach((o) => {
    const itemsLabel = (o.product_order_items || [])
      .map((i) => `${i.nombre}×${i.cantidad}`)
      .join(', ');
    rows.push({
      id: `order-${o.id}`,
      cantidad: Number(o.total),
      createdAt: o.picked_up_at || o.created_at,
      producto: itemsLabel || 'Pedido de productos',
      unidad: 'MXN',
      tipo: 'venta',
      estado: o.status,
      referencia: o.status === 'entregado'
        ? `Compra entregada ${o.folio} — ${o.nombre}`
        : o.status === 'cancelada'
          ? `Compra cancelada ${o.folio}`
          : `Compra registrada ${o.folio} — ${o.nombre} (pendiente de recoger)`,
    });
  });

  (usage || []).forEach((row) => {
    const isOrder = Boolean(row.order_id) || row.origen === 'venta';
    // Evitar duplicar pedidos ya listados arriba cuando es venta
    if (isOrder) return;

    const booking = row.booking_id ? bookingMap[row.booking_id] : null;
    const servicio = booking?.services?.nombre;
    const folio = booking?.folio;

    rows.push({
      id: row.id,
      cantidad: Number(row.cantidad),
      createdAt: row.created_at,
      producto: row.inventory_items?.nombre || 'Producto',
      unidad: row.inventory_items?.unidad || '',
      tipo: 'servicio',
      estado: 'completada',
      referencia: (servicio ? `Servicio: ${servicio}` : 'Servicio completado') + (folio ? ` (${folio})` : ''),
    });
  });

  // También agregar líneas de descuento por entrega (detalle por producto)
  (usage || []).forEach((row) => {
    const isOrder = Boolean(row.order_id) || row.origen === 'venta';
    if (!isOrder) return;
    const ord = row.order_id ? orderMap[row.order_id] : null;
    rows.push({
      id: `usage-${row.id}`,
      cantidad: Number(row.cantidad),
      createdAt: row.created_at,
      producto: row.inventory_items?.nombre || 'Producto',
      unidad: row.inventory_items?.unidad || '',
      tipo: 'venta',
      estado: 'entregado',
      referencia: `Descuento por entrega ${ord?.folio || ''}`.trim(),
    });
  });

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return rows.slice(0, limit);
}

/** Deduct stock when a product order is picked up */
async function applyOrderConsumption(orderId) {
  const supabase = getSupabase();
  const { data: lines, error } = await supabase
    .from('product_order_items')
    .select('item_id, cantidad, pack_cantidad, inventory_items ( id, stock_teorico, nombre )')
    .eq('order_id', orderId);

  if (error) throw error;
  if (!lines?.length) return { deducted: [] };

  const deducted = [];

  for (const row of lines) {
    const packs = Number(row.cantidad);
    const packSize = Number(row.pack_cantidad) || 1;
    const qty = packs * packSize;
    const item = row.inventory_items;
    if (!item) continue;

    const newStock = Number(item.stock_teorico) - qty;
    if (newStock < -0.0001) {
      throw Object.assign(
        new Error(`Stock insuficiente de ${item.nombre} al entregar el pedido`),
        { status: 409 }
      );
    }

    const { error: upErr } = await supabase
      .from('inventory_items')
      .update({ stock_teorico: Math.max(0, newStock) })
      .eq('id', row.item_id);

    if (upErr) throw upErr;

    await supabase.from('inventory_usage_log').insert({
      booking_id: null,
      order_id: orderId,
      origen: 'venta',
      item_id: row.item_id,
      cantidad: qty,
    });

    deducted.push({ itemId: row.item_id, cantidad: qty, stockTeorico: newStock });
  }

  return { deducted };
}

/**
 * Save an inventory check: measured quantities vs theoretical stock.
 * medida > teorico => sobrante; medida < teorico => pérdida (se usó de más)
 * Optionally sync stock_teorico to measured values.
 */
async function saveInventoryAudit({ medidas, notas, syncStock = true, createdBy = 'admin' }) {
  const supabase = getSupabase();
  const items = await listInventory();

  const { data: audit, error: auditErr } = await supabase
    .from('inventory_audits')
    .insert({ notas: notas || null, created_by: createdBy })
    .select('id, created_at')
    .single();

  if (auditErr) throw auditErr;

  const lines = [];

  for (const item of items) {
    const raw = medidas[item.id] ?? medidas[item.slug];
    if (raw === undefined || raw === null || raw === '') continue;

    const medida = Number(raw);
    if (Number.isNaN(medida)) continue;

    const teorico = Number(item.stock_teorico);
    const diferencia = medida - teorico;

    lines.push({
      audit_id: audit.id,
      item_id: item.id,
      stock_teorico: teorico,
      cantidad_medida: medida,
      diferencia,
    });

    if (syncStock) {
      await supabase
        .from('inventory_items')
        .update({ stock_teorico: medida })
        .eq('id', item.id);
    }
  }

  if (lines.length) {
    const { error: linesErr } = await supabase.from('inventory_audit_lines').insert(lines);
    if (linesErr) throw linesErr;
  }

  return {
    auditId: audit.id,
    createdAt: audit.created_at,
    lines: lines.map((l) => {
      const item = items.find((i) => i.id === l.item_id);
      return {
        itemId: l.item_id,
        nombre: item?.nombre,
        unidad: item?.unidad,
        stockTeorico: l.stock_teorico,
        cantidadMedida: l.cantidad_medida,
        diferencia: l.diferencia,
        resultado: l.diferencia < 0 ? 'perdida' : l.diferencia > 0 ? 'sobrante' : 'exacto',
      };
    }),
  };
}

async function listAudits(limit = 20) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('inventory_audits')
    .select(`
      id, notas, created_at, created_by,
      inventory_audit_lines (
        stock_teorico, cantidad_medida, diferencia,
        inventory_items ( nombre, unidad, slug )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function restockItem(itemId, cantidad) {
  const supabase = getSupabase();
  const { data: item, error } = await supabase
    .from('inventory_items')
    .select('id, stock_teorico')
    .eq('id', itemId)
    .single();

  if (error || !item) throw Object.assign(new Error('Insumo no encontrado'), { status: 404 });

  const newStock = Number(item.stock_teorico) + Number(cantidad);
  const { data, error: upErr } = await supabase
    .from('inventory_items')
    .update({ stock_teorico: newStock })
    .eq('id', itemId)
    .select('id, slug, nombre, unidad, stock_teorico')
    .single();

  if (upErr) throw upErr;
  return data;
}

module.exports = {
  applyServiceConsumption,
  applyOrderConsumption,
  listInventory,
  listInventoryOverview,
  listConsumptionLog,
  saveInventoryAudit,
  listAudits,
  restockItem,
};
