/**
 * Working days with history.
 *
 * A session stores its current `workingDays` plus `workingDaysHistory`:
 *   [{ days: ['monday', …], effectiveFrom: 'YYYY-MM-DD' }, …]
 * Each entry applies from its date until the next entry starts, so changing the
 * working days never rewrites past attendance — a date is always judged by the rule
 * that was in force on that date.
 *
 * Sessions without history (created before this existed) use `workingDays` for every date.
 */
const WEEK_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DEFAULT_WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** Effective date of the rule that was in force before the first recorded change. */
const BEGINNING = '1970-01-01';

function weekdayOfYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function normalizeDays(days) {
  const set = new Set((days || []).map((d) => String(d).toLowerCase()));
  return WEEK_ORDER.filter((d) => set.has(d));
}

function sortedHistory(session) {
  return (session?.workingDaysHistory || [])
    .filter((h) => h && Array.isArray(h.days) && h.days.length && h.effectiveFrom)
    .map((h) => ({ days: normalizeDays(h.days), effectiveFrom: String(h.effectiveFrom).slice(0, 10) }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** The session's working days that applied on `ymd` (YYYY-MM-DD). */
function workingDaysOn(session, ymd) {
  const history = sortedHistory(session);
  if (history.length && ymd) {
    let pick = history[0];
    history.forEach((h) => {
      if (h.effectiveFrom <= ymd) pick = h;
    });
    return pick.days;
  }
  return session?.workingDays?.length ? normalizeDays(session.workingDays) : DEFAULT_WORKING_DAYS;
}

function isWorkingDayOn(session, ymd) {
  return workingDaysOn(session, ymd).includes(weekdayOfYmd(ymd));
}

/**
 * New history after changing the working days to `days` from `effectiveFrom` onward.
 * Later changes that start on/after `effectiveFrom` are replaced by this one.
 */
function applyWorkingDaysChange(session, days, effectiveFrom) {
  const next = normalizeDays(days);
  let history = sortedHistory(session);
  if (!history.length) {
    // First change: what was configured until now applied to every earlier date.
    const before = session?.workingDays?.length ? normalizeDays(session.workingDays) : DEFAULT_WORKING_DAYS;
    history = [{ days: before, effectiveFrom: BEGINNING }];
  }
  history = history.filter((h) => h.effectiveFrom < effectiveFrom);
  history.push({ days: next, effectiveFrom });
  // Drop entries that repeat the rule before them.
  const compact = history.filter(
    (h, i) => i === 0 || h.days.join(',') !== history[i - 1].days.join(',')
  );
  return { workingDays: next, workingDaysHistory: compact };
}

module.exports = {
  DEFAULT_WORKING_DAYS,
  BEGINNING,
  weekdayOfYmd,
  workingDaysOn,
  isWorkingDayOn,
  applyWorkingDaysChange,
};
