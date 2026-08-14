/** Scheduling helpers: 4 bays, fixed 15-min slots, durations + turnover buffer */

const BAY_COUNT = 4;
const TOLERANCE_MINUTES = 15;
const TURNOVER_BUFFER_MINUTES = 15;
const OPEN_MINUTES = 8 * 60;   // 08:00
const CLOSE_MINUTES = 18 * 60; // 18:00
const SLOT_STEP = 15;

/** Default durations (minutes) by service slug — used if DB column missing */
const DEFAULT_DURATIONS = {
  'basico-express': 25,
  'basico-interior': 30,
  intermedio: 45,
  premium: 50,
  'suv-camioneta': 45,
  'detallado-simple': 180,
  'detallado-premium': 200,
  'detallado-diamante': 210,
  'restauracion-faros': 40,
  'hidratacion-piel': 45,
};

function parseTimeToMinutes(hora) {
  const [h, m] = String(hora).slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isValidFixedSlot(hora) {
  const mins = parseTimeToMinutes(hora);
  if (mins < OPEN_MINUTES || mins >= CLOSE_MINUTES) return false;
  return mins % SLOT_STEP === 0;
}

function getServiceDuration(service) {
  if (service?.duration_minutes) return Number(service.duration_minutes);
  if (service?.slug && DEFAULT_DURATIONS[service.slug]) return DEFAULT_DURATIONS[service.slug];
  if (service?.categoria === 'detallado') return 180;
  if (service?.categoria === 'especial') return 45;
  return 30;
}

function occupancyEnd(startMins, durationMins) {
  return startMins + durationMins + TURNOVER_BUFFER_MINUTES;
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function generateDaySlots() {
  const slots = [];
  for (let m = OPEN_MINUTES; m < CLOSE_MINUTES; m += SLOT_STEP) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

/**
 * Assign a free bay (1..4) for a proposed booking, or null if none.
 * existing: [{ hora, duration_minutes, bay_number, status }]
 */
function findAvailableBay(existing, startHora, durationMins) {
  const start = parseTimeToMinutes(startHora);
  const end = occupancyEnd(start, durationMins);

  if (start < OPEN_MINUTES || start + durationMins > CLOSE_MINUTES) {
    return null;
  }

  const active = (existing || []).filter(
    (b) => b.status !== 'cancelada' && b.status !== 'completada'
  );

  for (let bay = 1; bay <= BAY_COUNT; bay++) {
    const bayBookings = active.filter((b) => Number(b.bay_number) === bay);
    const conflict = bayBookings.some((b) => {
      const bStart = parseTimeToMinutes(b.hora);
      const bDur = Number(b.duration_minutes) || getServiceDuration(b);
      const bEnd = occupancyEnd(bStart, bDur);
      return intervalsOverlap(start, end, bStart, bEnd);
    });
    if (!conflict) return bay;
  }

  // Fallback: if bay_number missing on old rows, count overlapping occupancy
  const overlapping = active.filter((b) => {
    const bStart = parseTimeToMinutes(b.hora);
    const bDur = Number(b.duration_minutes) || getServiceDuration(b);
    const bEnd = occupancyEnd(bStart, bDur);
    return intervalsOverlap(start, end, bStart, bEnd);
  });

  if (overlapping.length < BAY_COUNT) {
    const used = new Set(overlapping.map((b) => Number(b.bay_number)).filter(Boolean));
    for (let bay = 1; bay <= BAY_COUNT; bay++) {
      if (!used.has(bay)) return bay;
    }
    return overlapping.length + 1;
  }

  return null;
}

function getAvailableSlots(existing, durationMins) {
  return generateDaySlots().filter((hora) => {
    const start = parseTimeToMinutes(hora);
    if (start + durationMins > CLOSE_MINUTES) return false;
    return findAvailableBay(existing, hora, durationMins) != null;
  });
}

function isSunday(fechaStr) {
  const d = new Date(`${fechaStr}T12:00:00`);
  return d.getDay() === 0;
}

function isPastDate(fechaStr) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(`${fechaStr}T12:00:00`);
  fecha.setHours(0, 0, 0, 0);
  return fecha < hoy;
}

/** Appointment deadline for check-in (fecha + hora + tolerance) as Date in local time */
function checkInDeadline(fecha, hora) {
  const [y, mo, d] = String(fecha).split('-').map(Number);
  const mins = parseTimeToMinutes(hora) + TOLERANCE_MINUTES;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

module.exports = {
  BAY_COUNT,
  TOLERANCE_MINUTES,
  TURNOVER_BUFFER_MINUTES,
  OPEN_MINUTES,
  CLOSE_MINUTES,
  DEFAULT_DURATIONS,
  parseTimeToMinutes,
  minutesToTime,
  isValidFixedSlot,
  getServiceDuration,
  findAvailableBay,
  getAvailableSlots,
  generateDaySlots,
  isSunday,
  isPastDate,
  checkInDeadline,
};
