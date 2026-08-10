function filterByPeriod(items, period, from, to) {
  if (!period || period === 'all') return items;

  if (period === 'custom') {
    if (!from) return items;
    const start = new Date(`${from}T00:00:00`);
    const end = to ? new Date(`${to}T23:59:59`) : new Date();
    return items.filter((item) => {
      const d = new Date(item.created_at);
      return d >= start && d <= end;
    });
  }

  const now = new Date();
  const start = new Date(now);

  switch (period) {
    case '1d':
      start.setDate(start.getDate() - 1);
      break;
    case '1w':
      start.setDate(start.getDate() - 7);
      break;
    case '1m':
      start.setMonth(start.getMonth() - 1);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      return items;
  }

  return items.filter((item) => new Date(item.created_at) >= start);
}

function buildAnalytics(bookings) {
  const all = bookings || [];
  const completadas = all.filter((b) => b.status === 'completada');
  const canceladas = all.filter((b) => b.status === 'cancelada');
  const pendientes = all.filter((b) => b.status === 'pendiente');
  const confirmadas = all.filter((b) => b.status === 'confirmada');

  const ingresosPeriodo = completadas.reduce((sum, b) => sum + Number(b.total), 0);
  const ticketPromedio = completadas.length ? ingresosPeriodo / completadas.length : 0;
  const tasaCancelacion = all.length ? (canceladas.length / all.length) * 100 : 0;

  const serviciosCount = {};
  all.forEach((b) => {
    const name = b.services?.nombre || 'Desconocido';
    serviciosCount[name] = (serviciosCount[name] || 0) + 1;
  });
  const topServicios = Object.entries(serviciosCount)
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const extrasCount = {};
  all.forEach((b) => {
    (b.booking_extras || []).forEach((be) => {
      const name = be.extras?.nombre || 'Extra';
      extrasCount[name] = (extrasCount[name] || 0) + 1;
    });
  });
  const topExtras = Object.entries(extrasCount)
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total);

  const ingresosPorMes = {};
  completadas.forEach((b) => {
    const d = new Date(b.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ingresosPorMes[key] = (ingresosPorMes[key] || 0) + Number(b.total);
  });
  const ingresosMensuales = Object.entries(ingresosPorMes)
    .map(([mes, total]) => ({ mes, total }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-12);

  const cancelacionesPorMes = {};
  canceladas.forEach((b) => {
    const d = new Date(b.cancelled_at || b.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    cancelacionesPorMes[key] = (cancelacionesPorMes[key] || 0) + 1;
  });
  const cancelacionesMensuales = Object.entries(cancelacionesPorMes)
    .map(([mes, total]) => ({ mes, total }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-12);

  return {
    kpis: {
      totalCitas: all.length,
      ingresosMes: Math.round(ingresosPeriodo),
      ingresosTotal: Math.round(ingresosPeriodo),
      ticketPromedio: Math.round(ticketPromedio),
      tasaCancelacion: Math.round(tasaCancelacion * 10) / 10,
      pendientes: pendientes.length,
      canceladas: canceladas.length,
      completadas: completadas.length,
    },
    topServicios,
    topExtras,
    ingresosMensuales,
    cancelacionesMensuales,
    statusBreakdown: {
      pendiente: pendientes.length,
      confirmada: confirmadas.length,
      completada: completadas.length,
      cancelada: canceladas.length,
    },
  };
}

module.exports = { filterByPeriod, buildAnalytics };
