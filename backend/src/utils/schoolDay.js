/**
 * School-day helpers. Prefer Session.timezone (e.g. Asia/Karachi);
 * fall back to process.env.TZ / Asia/Karachi so UTC hosts don't shift the day.
 */
const DEFAULT_TZ = process.env.ACADEMY_TIMEZONE || process.env.TZ || 'Asia/Karachi';

function resolveTimezone(tz) {
  return (tz && String(tz).trim()) || DEFAULT_TZ;
}

/** Format a Date as YYYY-MM-DD in the given IANA timezone. */
function formatDateInTz(date, timeZone = DEFAULT_TZ) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimezone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${day}`;
}

/** Today as YYYY-MM-DD in academy timezone. */
function todayYmd(timeZone = DEFAULT_TZ) {
  return formatDateInTz(new Date(), timeZone);
}

/**
 * Local midnight..end-of-day for a YYYY-MM-DD school day in timezone.
 * Returns Date objects suitable for Mongo range queries (absolute instants).
 */
function dayBounds(ymd, timeZone = DEFAULT_TZ) {
  const tz = resolveTimezone(timeZone);
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const err = new Error('Invalid date (expected YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }
  const [, y, mo, d] = m;
  // Probe noon UTC then find offset for that calendar day in tz
  const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const offsetPart = fmt.formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const om = offsetPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  let offsetMin = 0;
  if (om) {
    const sign = om[1] === '-' ? -1 : 1;
    offsetMin = sign * (Number(om[2]) * 60 + Number(om[3] || 0));
  }
  // Local midnight = UTC midnight of that YMD minus offset
  const startUtcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), 0, 0, 0) - offsetMin * 60_000;
  const start = new Date(startUtcMs);
  const end = new Date(startUtcMs + 24 * 60 * 60 * 1000 - 1);
  return { start, end, ymd: `${y}-${mo}-${d}`, timeZone: tz };
}

/** Weekday name (monday…sunday) for an instant in timezone. */
function weekdayName(date, timeZone = DEFAULT_TZ) {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimezone(timeZone),
    weekday: 'long',
  })
    .format(date instanceof Date ? date : new Date(date))
    .toLowerCase();
  return name;
}

/** Minutes since local midnight for an instant in timezone. */
function minutesSinceMidnight(date, timeZone = DEFAULT_TZ) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: resolveTimezone(timeZone),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const min = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return h * 60 + min;
}

module.exports = {
  DEFAULT_TZ,
  resolveTimezone,
  formatDateInTz,
  todayYmd,
  dayBounds,
  weekdayName,
  minutesSinceMidnight,
};
