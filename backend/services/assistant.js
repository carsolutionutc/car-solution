const getSupabase = require('../db/supabase');

const ASSISTANT_NAME = 'Iris';
const ASSISTANT_MEANING =
  'En la mitología griega, Iris es la mensajera de los dioses y la diosa del arcoíris: agua y luz juntas, como un auto recién lavado. Aquí es la secretaria operativa de Car Solution.';

function mexicoYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDaysYmd(ymd, delta) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function ymdFromIso(iso) {
  if (!iso) return null;
  return mexicoYmd(new Date(iso));
}

function money(n) {
  return Math.round(Number(n) || 0);
}

function getLlmConfig() {
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      provider: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    };
  }
  return null;
}

function detectPeriodFromText(text) {
  const t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const isoPair = t.match(/(\d{4}-\d{2}-\d{2}).{0,24}(\d{4}-\d{2}-\d{2})/);
  if (isoPair) return { period: 'custom', from: isoPair[1], to: isoPair[2] };

  if (/\bnovedad/.test(t) && /\bmes\b/.test(t)) return { period: '1m' };
  if (/\bhoy\b|\bel dia de hoy\b|\bde hoy\b/.test(t)) return { period: 'today' };
  if (/\bayer\b/.test(t)) return { period: 'yesterday' };
  if (/\besta semana\b|\bultimos? 7\b|\bultima semana\b/.test(t)) return { period: '1w' };
  if (/\beste mes\b|\bultim[oa] mes\b/.test(t)) return { period: '1m' };
  if (/\beste ano\b|\bultim[oa] ano\b/.test(t)) return { period: '1y' };
  if (/\btodo\b|\bhistorico\b|\bsiempre\b|\bdesde el inicio\b/.test(t)) return { period: 'all' };
  return null;
}

function resolveRange({ period, from, to }) {
  const today = mexicoYmd();
  const key = period || 'all';

  if (key === 'today') {
    return { from: today, to: today, label: `hoy (${today})`, key };
  }
  if (key === 'yesterday') {
    const y = addDaysYmd(today, -1);
    return { from: y, to: y, label: `ayer (${y})`, key };
  }
  if (key === 'custom' && from) {
    const end = to || today;
    return { from, to: end, label: `${from} → ${end}`, key };
  }
  if (key === '1d') {
    return { from: today, to: today, label: `hoy (${today})`, key: 'today' };
  }
  if (key === '1w') {
    const start = addDaysYmd(today, -6);
    return { from: start, to: today, label: `últimos 7 días (${start} → ${today})`, key };
  }
  if (key === '1m') {
    const start = `${today.slice(0, 7)}-01`;
    return { from: start, to: today, label: `este mes (${start} → ${today})`, key };
  }
  if (key === '1y') {
    const start = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
    return { from: start, to: today, label: `últimos 12 meses (${start} → ${today})`, key };
  }
  return { from: null, to: null, label: 'todo el historial', key: 'all' };
}

function bookingFecha(b) {
  return String(b?.fecha || '').slice(0, 10);
}

function bookingStatus(b) {
  const s = String(b?.status || '').trim().toLowerCase();
  if (['pendiente', 'confirmada', 'completada', 'cancelada'].includes(s)) return s;
  return s || 'desconocido';
}

async function fetchPaged(buildQuery, pageSize = 1000) {
  const rows = [];
  let offset = 0;
  while (offset < 25000) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function countBookingsExact(supabase, { from, to, status }) {
  let q = supabase.from('bookings').select('id', { count: 'exact', head: true });
  if (from) q = q.gte('fecha', from);
  if (to) q = q.lte('fecha', to);
  if (status) q = q.eq('status', status);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

function inYmdRange(ymd, from, to) {
  if (!ymd) return false;
  if (!from && !to) return true;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

async function buildOperationsBriefing({ period, from, to }) {
  const range = resolveRange({ period, from, to });
  const supabase = getSupabase();
  const bookingSelect = `
    id, folio, nombre, fecha, hora, total, status, cancelled_at, cancellation_reason, created_at,
    services ( nombre )
  `;

  const [bookings, countTotal, countPendiente, countConfirmada, countCompletada, countCancelada, orderRows, usageRows, itemRes] =
    await Promise.all([
      fetchPaged(() => {
        let q = supabase.from('bookings').select(bookingSelect).order('fecha', { ascending: false });
        if (range.from) q = q.gte('fecha', range.from);
        if (range.to) q = q.lte('fecha', range.to);
        return q;
      }),
      countBookingsExact(supabase, { from: range.from, to: range.to }),
      countBookingsExact(supabase, { from: range.from, to: range.to, status: 'pendiente' }),
      countBookingsExact(supabase, { from: range.from, to: range.to, status: 'confirmada' }),
      countBookingsExact(supabase, { from: range.from, to: range.to, status: 'completada' }),
      countBookingsExact(supabase, { from: range.from, to: range.to, status: 'cancelada' }),
      fetchPaged(() =>
        supabase.from('product_orders').select('id, folio, total, status, created_at, picked_up_at').order('created_at', { ascending: false })
      ).catch((err) => {
        console.error('Iris pedidos:', err.message);
        return [];
      }),
      fetchPaged(() =>
        supabase
          .from('inventory_usage_log')
          .select('id, cantidad, created_at, origen, booking_id, order_id, inventory_items ( nombre, unidad, precio, pack_cantidad )')
          .order('created_at', { ascending: false })
      ).catch((err) => {
        console.error('Iris consumo:', err.message);
        return [];
      }),
      supabase
        .from('inventory_items')
        .select('nombre, unidad, stock_teorico, precio, pack_cantidad, vendible, activo')
        .eq('activo', true)
        .order('nombre'),
    ]);

  if (itemRes.error) throw itemRes.error;
  const citas = bookings || [];
  const byStatus = {
    pendiente: countPendiente,
    confirmada: countConfirmada,
    completada: countCompletada,
    cancelada: countCancelada,
  };
  const known = byStatus.pendiente + byStatus.confirmada + byStatus.completada + byStatus.cancelada;
  const otros = Math.max(0, countTotal - known);

  const pedidos = (orderRows || []).filter((o) => {
    const ymd = ymdFromIso(o.picked_up_at || o.created_at);
    return inYmdRange(ymd, range.from, range.to);
  });
  const consumos = (usageRows || []).filter((u) => inYmdRange(ymdFromIso(u.created_at), range.from, range.to));

  const ingresosServicios = citas
    .filter((b) => bookingStatus(b) === 'completada')
    .reduce((sum, b) => sum + Number(b.total || 0), 0);
  const ingresosPedidos = pedidos
    .filter((o) => o.status === 'entregado')
    .reduce((sum, o) => sum + Number(o.total || 0), 0);
  const pedidosPendientes = pedidos
    .filter((o) => o.status === 'pendiente')
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  const serviciosCount = {};
  citas.forEach((b) => {
    const name = b.services?.nombre || 'Sin servicio';
    serviciosCount[name] = (serviciosCount[name] || 0) + 1;
  });
  const topServicios = Object.entries(serviciosCount)
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const motivos = {};
  citas
    .filter((b) => bookingStatus(b) === 'cancelada' && b.cancellation_reason)
    .forEach((b) => {
      const key = String(b.cancellation_reason).trim().slice(0, 80);
      motivos[key] = (motivos[key] || 0) + 1;
    });
  const motivosCancelacion = Object.entries(motivos)
    .map(([motivo, total]) => ({ motivo, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const utensiliosMap = {};
  let costoUtensilios = 0;
  consumos
    .filter((u) => u.origen !== 'venta' && !u.order_id)
    .forEach((u) => {
      const nombre = u.inventory_items?.nombre || 'Insumo';
      const unidad = u.inventory_items?.unidad || '';
      const qty = Number(u.cantidad) || 0;
      const pack = Number(u.inventory_items?.pack_cantidad) || 1;
      const precioPack = Number(u.inventory_items?.precio) || 0;
      const costo = pack > 0 ? (qty / pack) * precioPack : qty * precioPack;
      if (!utensiliosMap[nombre]) utensiliosMap[nombre] = { nombre, unidad, cantidad: 0, costoEstimado: 0 };
      utensiliosMap[nombre].cantidad += qty;
      utensiliosMap[nombre].costoEstimado += costo;
      costoUtensilios += costo;
    });

  const utensilios = Object.values(utensiliosMap)
    .map((u) => ({
      ...u,
      cantidad: Math.round(u.cantidad * 100) / 100,
      costoEstimado: money(u.costoEstimado),
    }))
    .sort((a, b) => b.costoEstimado - a.costoEstimado)
    .slice(0, 12);

  const inventarioBajo = (itemRes.data || [])
    .filter((i) => Number(i.stock_teorico) <= Number(i.pack_cantidad || 1))
    .slice(0, 8)
    .map((i) => ({
      nombre: i.nombre,
      stock: Number(i.stock_teorico),
      unidad: i.unidad,
    }));

  const today = mexicoYmd();
  const agendaHoy = citas
    .filter((b) => bookingFecha(b) === today && bookingStatus(b) !== 'cancelada')
    .sort((a, b) => String(a.hora).localeCompare(String(b.hora)))
    .slice(0, 16)
    .map((b) => ({
      hora: String(b.hora).slice(0, 5),
      folio: b.folio,
      cliente: b.nombre,
      servicio: b.services?.nombre,
      status: bookingStatus(b),
      total: money(b.total),
    }));

  const completadas = byStatus.completada;
  return {
    asistente: ASSISTANT_NAME,
    periodo: range.label,
    citas: {
      total: countTotal,
      pendiente: byStatus.pendiente,
      confirmada: byStatus.confirmada,
      completada: byStatus.completada,
      cancelada: byStatus.cancelada,
      otros,
      tasaCancelacionPct: countTotal ? Math.round((byStatus.cancelada / countTotal) * 1000) / 10 : 0,
    },
    ingresos: {
      serviciosCompletados: money(ingresosServicios),
      pedidosEntregados: money(ingresosPedidos),
      totalCobrado: money(ingresosServicios + ingresosPedidos),
      pedidosPorRecoger: money(pedidosPendientes),
      ticketPromedioServicio: completadas ? money(ingresosServicios / completadas) : 0,
    },
    topServicios,
    cancelaciones: {
      total: byStatus.cancelada,
      motivos: motivosCancelacion,
    },
    utensilios: {
      nota: 'Costo estimado con precio de lista del pack (cantidad consumida / pack × precio).',
      costoEstimadoTotal: money(costoUtensilios),
      detalle: utensilios,
    },
    inventarioBajo,
    agendaHoy,
    pedidosEnPeriodo: {
      total: pedidos.length,
      entregados: pedidos.filter((o) => o.status === 'entregado').length,
      pendientes: pedidos.filter((o) => o.status === 'pendiente').length,
      cancelados: pedidos.filter((o) => o.status === 'cancelada').length,
    },
  };
}

function buildSystemPrompt(briefing) {
  return `Eres ${ASSISTANT_NAME}, secretaria operativa de Car Solution (lavado automotriz en CDMX). Responde en español mexicano, breve y clara. Usa SOLO este JSON; no inventes cifras. Distingue cobrado vs pendiente. Hoy (CDMX): ${mexicoYmd()}.

BRIEFING:
${JSON.stringify(briefing)}`;
}

function mxn(n) {
  return `$${Number(n || 0).toLocaleString('es-MX')} MXN`;
}

function localIrisReply(briefing, userText) {
  const t = String(userText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const c = briefing.citas || {};
  const i = briefing.ingresos || {};
  const u = briefing.utensilios || {};
  const lines = [`Periodo: ${briefing.periodo}.`];

  const wantsMoney = /ingreso|gano|ganado|cobr|venta|dinero|cuanto/.test(t) || !/utensil|insumo|cancel|cita|agenda|inventar/.test(t);
  const wantsCitas = /cita|servicio|agenda|complet|pendient/.test(t) || wantsMoney;
  const wantsCancel = /cancel/.test(t) || wantsCitas;
  const wantsTools = /utensil|insumo|gasto|material|consumo/.test(t);
  const wantsNews = /novedad|resumen|como vamos|ultimo mes|esta semana|hoy/.test(t);
  const wantsStock = /inventar|stock|alerta|cuidar/.test(t);

  if (wantsMoney || wantsNews) {
    lines.push(`Ingresos cobrados: ${mxn(i.totalCobrado)} (servicios ${mxn(i.serviciosCompletados)} + pedidos ${mxn(i.pedidosEntregados)}).`);
    if (i.pedidosPorRecoger) lines.push(`Pedidos por recoger: ${mxn(i.pedidosPorRecoger)}.`);
  }
  if (wantsCitas || wantsNews) {
    lines.push(`Citas: ${c.total || 0} (pendiente ${c.pendiente || 0} · confirmada ${c.confirmada || 0} · completada ${c.completada || 0} · cancelada ${c.cancelada || 0}${c.otros ? ` · otras ${c.otros}` : ''}).`);
  }
  if (wantsCancel || wantsNews) {
    lines.push(`Canceladas: ${c.cancelada || 0} (${c.tasaCancelacionPct || 0}%).`);
  }
  if (wantsTools || wantsNews) {
    lines.push(`Utensilios (estimado): ${mxn(u.costoEstimadoTotal)}.`);
    const top = (u.detalle || []).slice(0, 3).map((x) => x.nombre).filter(Boolean);
    if (top.length) lines.push(`Más usados: ${top.join(', ')}.`);
  }
  if ((wantsNews || /servicio/.test(t)) && briefing.topServicios?.length) {
    lines.push(`Servicios más pedidos: ${briefing.topServicios.slice(0, 3).map((s) => `${s.nombre} (${s.total})`).join(', ')}.`);
  }
  if (wantsStock && briefing.inventarioBajo?.length) {
    lines.push(`Stock bajo: ${briefing.inventarioBajo.map((x) => x.nombre).join(', ')}.`);
  } else if (wantsStock) {
    lines.push('No hay insumos en nivel crítico.');
  }

  return lines.join('\n');
}

function isGeminiDenied(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('denied access') || m.includes('permission_denied');
}

let geminiBlocked = false;

async function callOpenAiCompatible({ apiKey, baseUrl, model, system, messages }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 1100,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || data.error || `Error ${res.status} del modelo`;
    throw new Error(typeof msg === 'string' ? msg : 'No se pudo consultar el modelo');
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('El modelo no devolvió respuesta');
  return text.trim();
}

async function callGemini({ apiKey, model, system, messages }) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.35, maxOutputTokens: 1100 },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || `Error ${res.status} de Gemini`;
    throw new Error(msg);
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text.trim()) throw new Error('Gemini no devolvió respuesta');
  return text.trim();
}

async function chatWithIris({ messages, period, from, to }) {
  const clean = (messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  if (!clean.length || clean[clean.length - 1].role !== 'user') {
    const err = new Error('Escribe una pregunta para Iris');
    err.status = 400;
    throw err;
  }

  const detected = detectPeriodFromText(clean[clean.length - 1].content);
  const rangeInput = detected || { period: period || 'all', from, to };
  const briefing = await buildOperationsBriefing(rangeInput);
  const lastUser = clean[clean.length - 1].content;
  const reply = localIrisReply(briefing, lastUser);

  return {
    name: ASSISTANT_NAME,
    reply,
    periodo: briefing.periodo,
  };
}

module.exports = {
  ASSISTANT_NAME,
  ASSISTANT_MEANING,
  getLlmConfig,
  chatWithIris,
};
