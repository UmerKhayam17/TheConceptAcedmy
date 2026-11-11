/**
 * Pakistan public-holiday drafts for one academic session.
 * Fixed dates are confirmed. Islamic dates are civil-Hijri estimates and stay pending
 * until an admin confirms them after the government announcement.
 */

const FIXED_HOLIDAYS = [
  { code: 'kashmir-day', name: 'Kashmir Day', shortName: 'Kashmir Day', month: 2, day: 5 },
  { code: 'pakistan-day', name: 'Pakistan Day', shortName: 'Pakistan Day', month: 3, day: 23 },
  { code: 'labour-day', name: 'Labour Day', shortName: 'Labour Day', month: 5, day: 1 },
  { code: 'youm-e-takbeer', name: 'Youm-e-Takbeer', shortName: 'Youm-e-Takbeer', month: 5, day: 28 },
  { code: 'independence-day', name: 'Independence Day', shortName: 'Independence Day', month: 8, day: 14 },
  { code: 'iqbal-day', name: 'Iqbal Day', shortName: 'Iqbal Day', month: 11, day: 9 },
  { code: 'quaid-e-azam-day', name: 'Quaid-e-Azam Day', shortName: 'Quaid Day', month: 12, day: 25 },
];

/** month is the civil Hijri month (1 Muharram … 12 Dhul Hijjah). length is consecutive days. */
const ISLAMIC_HOLIDAYS = [
  { code: 'eid-ul-fitr', name: 'Eid ul Fitr', shortName: 'Eid ul Fitr', month: 10, day: 1, length: 3 },
  { code: 'eid-ul-adha', name: 'Eid ul Adha', shortName: 'Eid ul Adha', month: 12, day: 10, length: 3 },
  { code: 'ashura', name: 'Ashura', shortName: 'Ashura', month: 1, day: 9, length: 2 },
  { code: 'eid-milad', name: 'Eid Milad-un-Nabi', shortName: 'Eid Milad', month: 3, day: 12, length: 1 },
];

const HIJRI_NOTE =
  'Estimated from the civil Hijri calendar. Confirm the date after the government announcement.';

const hijriFormat = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function pad(n) {
  return String(n).padStart(2, '0');
}

function addDays(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function hijriOfYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = hijriFormat.formatToParts(date);
  const num = (type) => Number(String(parts.find((p) => p.type === type)?.value || '').replace(/[^\d]/g, ''));
  return { year: num('year'), month: num('month'), day: num('day') };
}

function appliesToAll() {
  return { students: true, teachers: true, staff: true };
}

/**
 * @param {string} sessionStart YYYY-MM-DD
 * @param {string} sessionEnd YYYY-MM-DD
 */
function buildHolidayDrafts(sessionStart, sessionEnd) {
  const start = String(sessionStart || '').slice(0, 10);
  const end = String(sessionEnd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return [];
  }

  const drafts = [];
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));

  for (let year = startYear; year <= endYear; year += 1) {
    FIXED_HOLIDAYS.forEach((holiday) => {
      const ymd = `${year}-${pad(holiday.month)}-${pad(holiday.day)}`;
      if (ymd < start || ymd > end) return;
      drafts.push({
        code: `${holiday.code}-${year}`,
        name: holiday.name,
        shortName: holiday.shortName,
        category: 'public',
        source: 'builtin',
        startDate: ymd,
        endDate: ymd,
        status: 'approved',
        appliesTo: appliesToAll(),
        estimated: false,
        notes: '',
        approvedAt: new Date(),
      });
    });
  }

  const scanFrom = addDays(start, -4);
  for (let ymd = scanFrom; ymd <= end; ymd = addDays(ymd, 1)) {
    const hijri = hijriOfYmd(ymd);
    if (!hijri.year || !hijri.month || !hijri.day) continue;
    ISLAMIC_HOLIDAYS.forEach((holiday) => {
      if (hijri.month !== holiday.month || hijri.day !== holiday.day) return;
      let rangeStart = ymd;
      let rangeEnd = addDays(ymd, holiday.length - 1);
      if (rangeEnd < start || rangeStart > end) return;
      if (rangeStart < start) rangeStart = start;
      if (rangeEnd > end) rangeEnd = end;
      drafts.push({
        code: `${holiday.code}-${hijri.year}`,
        name: holiday.name,
        shortName: holiday.shortName,
        category: 'islamic',
        source: 'hijri',
        startDate: rangeStart,
        endDate: rangeEnd,
        status: 'pending',
        appliesTo: appliesToAll(),
        estimated: true,
        notes: HIJRI_NOTE,
      });
    });
  }

  return drafts;
}

module.exports = {
  FIXED_HOLIDAYS,
  ISLAMIC_HOLIDAYS,
  buildHolidayDrafts,
  addDays,
};
