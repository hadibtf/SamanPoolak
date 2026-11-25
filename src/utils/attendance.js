// Pure helpers for attendance (حضور و غیاب) calculations. No I/O — fed scans
// (each: { id?, cardNo, dateKey, time: "HH:mm", source }) and returns per-day
// summaries. Used by the PayrollAttendance screen.

import { SHIFT_MINUTES, WORK_BREAK_MINUTES } from '../constants';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

/** Latin digits -> Persian digits. */
export const toFa = (val) => String(val ?? '').replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/** Minutes since midnight for an "HH:mm" string (NaN-safe -> null). */
export const toMinutes = (time) => {
  if (!time || typeof time !== 'string') return null;
  const m = /^(\d{1,2}):(\d{1,2})/.exec(time.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Difference in minutes between two "HH:mm" strings (b - a). */
export const minutesBetween = (a, b) => {
  const ma = toMinutes(a);
  const mb = toMinutes(b);
  if (ma == null || mb == null) return null;
  return mb - ma;
};

/** Persian weekday name for a Jalali YYYYMMDD date key. */
export const weekdayOfDateKey = (dateKey) => {
  if (!/^\d{8}$/.test(String(dateKey || ''))) return '';
  try {
    const d = new DateObject({
      calendar: persian,
      locale: persian_fa,
      year: Number(dateKey.slice(0, 4)),
      month: Number(dateKey.slice(4, 6)),
      day: Number(dateKey.slice(6, 8)),
    });
    return d.weekDay?.name || '';
  } catch {
    return '';
  }
};

/** "8 ساعت و 53 دقیقه" from a minute count. */
export const formatDuration = (minutes) => {
  if (minutes == null || minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [];
  if (h > 0) parts.push(`${toFa(h)} ساعت`);
  if (m > 0) parts.push(`${toFa(m)} دقیقه`);
  return parts.join(' و ') || '۰ دقیقه';
};

/** "14050106" -> "۱۴۰۵/۰۱/۰۶" (Persian digits) */
export const formatDateKey = (key) =>
  key && String(key).length === 8
    ? toFa(`${key.slice(0, 4)}/${key.slice(4, 6)}/${key.slice(6, 8)}`)
    : String(key || '—');

/**
 * Group scans by dateKey, each day's scans sorted by time ascending.
 * Returns an array of { dateKey, scans } sorted by date ascending.
 */
export const groupByDay = (scans) => {
  const byDay = new Map();
  for (const s of scans) {
    if (!byDay.has(s.dateKey)) byDay.set(s.dateKey, []);
    byDay.get(s.dateKey).push(s);
  }
  const days = [];
  for (const [dateKey, list] of byDay) {
    list.sort((a, b) => (toMinutes(a.time) ?? 0) - (toMinutes(b.time) ?? 0));
    days.push({ dateKey, scans: list });
  }
  days.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return days;
};

const dateKeyOf = (date) =>
  `${date.year}${String(date.month.number).padStart(2, '0')}${String(date.day).padStart(2, '0')}`;

const dateFromKey = (dateKey) => new DateObject({
  calendar: persian,
  locale: persian_fa,
  year: Number(dateKey.slice(0, 4)),
  month: Number(dateKey.slice(4, 6)),
  day: Number(dateKey.slice(6, 8)),
});

/** List recognized holiday keys in an inclusive Jalali date range. */
const holidayKeysInRange = (fromKey, toKey, isHolidayForDate) => {
  const from = String(fromKey || '');
  const to = String(toKey || '');
  if (!/^\d{8}$/.test(from) || !/^\d{8}$/.test(to) || from > to) {
    return [];
  }

  const cursor = dateFromKey(from);
  const end = dateFromKey(to);
  if (!cursor.isValid || !end.isValid || dateKeyOf(cursor) !== from || dateKeyOf(end) !== to) return [];

  const keys = [];
  let key = dateKeyOf(cursor);
  while (key <= to) {
    if (isHolidayForDate(key)) keys.push(key);
    if (key === to) break;
    cursor.add(1, 'day');
    const nextKey = dateKeyOf(cursor);
    if (nextKey <= key) break;
    key = nextKey;
  }
  return keys;
};

/**
 * Compute a single day's summary from its (time-sorted) scans.
 * - duration = lastOut - firstIn (first-in→last-out; mid-day scans ignored).
 * - flags.missingExit: odd number of scans (forgot to clock out).
 * - flags.duplicates: indexes of adjacent pairs closer than doubleScanMinutes.
 */
export const computeDay = (scans, options = {}) => {
  const {
    doubleScanMinutes = 10,
    breakMin,
    breakfastMin,
    lunchMin,
    shiftWindowMin,
    shiftStart,
    shiftEnd,
    thursdayShiftEnd,
    dateKey,
    isHoliday = false,
  } = options;
  const sorted = [...scans].sort((a, b) => (toMinutes(a.time) ?? 0) - (toMinutes(b.time) ?? 0));
  const firstIn = sorted[0]?.time || null;
  const lastOut = sorted.length > 1 ? sorted[sorted.length - 1].time : null;

  const hasSeparateBreakSettings = breakfastMin !== undefined || lunchMin !== undefined;
  const breakfast = Math.max(0, Number(breakfastMin) || 0);
  const lunch = Math.max(0, Number(lunchMin) || 0);
  const standardBreakMin = Math.max(0, Number(
    breakMin ?? (hasSeparateBreakSettings ? breakfast + lunch : WORK_BREAK_MINUTES)
  ) || 0);
  const startMin = toMinutes(shiftStart);
  const regularEndMin = toMinutes(shiftEnd);
  const hasConfiguredShiftTimes = shiftStart !== undefined || shiftEnd !== undefined;
  const regularWindowMin = hasConfiguredShiftTimes
    ? Math.max(0, (regularEndMin ?? 0) - (startMin ?? 0))
    : Math.max(0, Number(shiftWindowMin ?? SHIFT_MINUTES) || 0);
  const thursdayEndMin = toMinutes(thursdayShiftEnd) ?? regularEndMin;
  const isThursday = weekdayOfDateKey(dateKey) === 'پنجشنبه';
  const dayWindowMin = isThursday && hasConfiguredShiftTimes
    ? Math.max(0, (thursdayEndMin ?? 0) - (startMin ?? 0))
    : regularWindowMin;

  // Thursday lunch is unpaid only when the employee stays past 15:00. The
  // expected schedule uses the configured end time to determine whether lunch
  // belongs in that day's target.
  const actualBreakMin = isThursday && hasSeparateBreakSettings
    ? breakfast + ((toMinutes(lastOut) ?? 0) > 15 * 60 ? lunch : 0)
    : standardBreakMin;
  const scheduledBreakMin = isThursday && hasSeparateBreakSettings
    ? breakfast + ((thursdayEndMin ?? 0) > 15 * 60 ? lunch : 0)
    : standardBreakMin;

  // Gross presence (first-in -> last-out). Worked and expected minutes each
  // exclude the breaks that apply to the actual attendance and schedule.
  const durationMin = sorted.length > 1 ? minutesBetween(firstIn, lastOut) : null;
  const workedMin = durationMin == null ? null : Math.max(0, durationMin - actualBreakMin);
  const expectedMin = Math.max(0, dayWindowMin - scheduledBreakMin);
  // A holiday earns its scheduled shift credit; any actual presence is
  // additional credited time and also counts entirely as overtime.
  const creditedWorkedMin = isHoliday
    ? expectedMin + (workedMin ?? 0)
    : workedMin;
  const balanceMin = isHoliday
    ? (workedMin == null ? 0 : workedMin)
    : (workedMin == null ? null : workedMin - expectedMin);

  const duplicates = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = minutesBetween(sorted[i - 1].time, sorted[i].time);
    if (gap != null && gap < doubleScanMinutes) {
      duplicates.push({ first: sorted[i - 1], second: sorted[i], gap });
    }
  }

  return {
    firstIn,
    lastOut,
    expectedMin,
    durationMin,   // gross presence (last-out − first-in)
    workedMin,     // durationMin − unpaid breaks, clamped at 0
    creditedWorkedMin, // actual worked time plus scheduled holiday credit
    balanceMin,    // holiday actual time or regular schedule deviation
    isHoliday,
    scans: sorted,
    flags: {
      missingExit: sorted.length % 2 === 1,
      duplicates,
    },
  };
};

/**
 * Compute daily summaries and payroll worktime totals from a scan list.
 * When `dateRange` is supplied, recognized holidays in its inclusive Jalali
 * range are added to the result and receive their configured shift credit.
 */
export const summarizeAttendance = (scans, settings = {}, isHolidayForDate = () => false, dateRange = null) => {
  const scanDays = groupByDay(scans || []);
  const scansByDay = new Map(scanDays.map(({ dateKey, scans: dayScans }) => [dateKey, dayScans]));
  const includeHolidayCredits = Boolean(
    dateRange?.from && dateRange?.to && dateRange.from <= dateRange.to
  );

  if (includeHolidayCredits) {
    holidayKeysInRange(dateRange.from, dateRange.to, isHolidayForDate).forEach((dateKey) => {
      if (!scansByDay.has(dateKey)) scansByDay.set(dateKey, []);
    });
  }

  const days = [...scansByDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, dayScans]) => ({
      dateKey,
      scans: dayScans,
      summary: computeDay(dayScans, {
        ...settings,
        dateKey,
        isHoliday: isHolidayForDate(dateKey),
      }),
    }));

  let workedMin = 0;
  let overtimeMinutes = 0;
  let deductionMinutes = 0;
  let completeDays = 0;

  for (const { summary } of days) {
    const dayWorkedMin = includeHolidayCredits && summary.isHoliday
      ? summary.creditedWorkedMin
      : summary.workedMin;
    if (dayWorkedMin != null) {
      workedMin += dayWorkedMin;
      completeDays += 1;
    }
    if (summary.workedMin == null) continue;
    if (summary.balanceMin > 0) overtimeMinutes += summary.balanceMin;
    else deductionMinutes += -summary.balanceMin;
  }

  return { days, workedMin, overtimeMinutes, deductionMinutes, completeDays };
};

/** Signed "+۱:۴۰" / "−۰:۴۰" balance label (Persian digits). */
export const formatBalance = (minutes) => {
  if (minutes == null) return '—';
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${toFa(h)}:${toFa(String(m).padStart(2, '0'))}`;
};
