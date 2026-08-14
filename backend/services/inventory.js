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
    .select('id, slug, nombre, unidad, stock_teorico, activo')
    .eq('activo', true)
    .order('nombre');

  if (error) throw error;
  return data || [];
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
  listInventory,
  saveInventoryAudit,
  listAudits,
  restockItem,
};
