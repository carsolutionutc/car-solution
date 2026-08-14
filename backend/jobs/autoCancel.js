const getSupabase = require('../db/supabase');
const { checkInDeadline } = require('../utils/scheduling');

let timer = null;

/**
 * Auto-cancel bookings still in "pendiente" after appointment time + 15 min tolerance
 * (QR never scanned for check-in).
 */
async function runAutoCancel() {
  try {
    const supabase = getSupabase();
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const { data: pending, error } = await supabase
      .from('bookings')
      .select('id, folio, fecha, hora, status')
      .eq('status', 'pendiente')
      .lte('fecha', ymd);

    if (error) {
      console.error('[auto-cancel] query:', error.message);
      return;
    }

    const now = new Date();
    const toCancel = (pending || []).filter((b) => {
      try {
        return now > checkInDeadline(b.fecha, b.hora);
      } catch {
        return false;
      }
    });

    for (const b of toCancel) {
      const { error: upErr } = await supabase
        .from('bookings')
        .update({
          status: 'cancelada',
          cancelled_at: now.toISOString(),
          cancellation_reason: 'Cancelada automáticamente: no se presentó dentro de la tolerancia de 15 minutos',
        })
        .eq('id', b.id)
        .eq('status', 'pendiente');

      if (upErr) {
        console.error(`[auto-cancel] ${b.folio}:`, upErr.message);
      } else {
        console.log(`[auto-cancel] Folio ${b.folio} cancelado por no-show`);
      }
    }
  } catch (err) {
    console.error('[auto-cancel]', err.message);
  }
}

function startAutoCancelJob(intervalMs = 60_000) {
  if (timer) return;
  runAutoCancel();
  timer = setInterval(runAutoCancel, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  console.log('⏱️  Auto-cancel job activo (cada 60s, tolerancia 15 min)');
}

module.exports = { runAutoCancel, startAutoCancelJob };
