// Pure helpers for attendance (حضور و غیاب) calculations. No I/O — fed scans
// (each: { id?, cardNo, dateKey, time: "HH:mm", source }) and returns per-day
// summaries. Used by the PayrollAttendance screen.

import { SHIFT_MINUTES, WORK_BREAK_MINUTES } from '../constants';

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

/**
 * Compute a single day's summary from its (time-sorted) scans.
 * - duration = lastOut - firstIn (first-in→last-out; mid-day scans ignored).
 * - flags.missingExit: odd number of scans (forgot to clock out).
 * - flags.duplicates: indexes of adjacent pairs closer than doubleScanMinutes.
 */
export const computeDay = (scans, {
  doubleScanMinutes = 10,
  breakMin = WORK_BREAK_MINUTES,    // mandatory unpaid daily breaks
  shiftWindowMin = SHIFT_MINUTES,
  isHoliday = false,
} = {}) => {
  const sorted = [...scans].sort((a, b) => (toMinutes(a.time) ?? 0) - (toMinutes(b.time) ?? 0));
  const firstIn = sorted[0]?.time || null;
  const lastOut = sorted.length > 1 ? sorted[sorted.length - 1].time : null;
  // Gross presence (first-in -> last-out). Worked = presence − mandatory breaks;
  // expected daily work = shift window − the same breaks; balance = worked −
  // expected (= extra when over the shift, deduction when under).
  const durationMin = sorted.length > 1 ? minutesBetween(firstIn, lastOut) : null;
  const workedMin = durationMin == null ? null : Math.max(0, durationMin - breakMin);
  const expectedMin = Math.max(0, shiftWindowMin - breakMin);
  // On an official holiday a full shift is credited even with no records; any
  // time actually worked counts entirely as overtime.
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
    durationMin,   // gross presence (last-out − first-in)
    workedMin,     // durationMin − unpaid breaks, clamped at 0
    balanceMin,    // workedMin − shift length (+ overtime / − deduction)
    scans: sorted,
    flags: {
      missingExit: sorted.length % 2 === 1,
      duplicates,
    },
  };
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
