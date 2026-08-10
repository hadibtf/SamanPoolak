// Iranian (Jalali) public-holiday support — manual, file-fed (no network API).
//
// The owner uploads one YEAR.json per year from Settings (same shape the device
// calendar exports / the persian-calendar style file):
//   { data: [ { shamsiDate: "1405/01/01", isHoliday: true, holidayDesription }, … ] }
// We keep the holiday YYYYMMDD keys cached per year in localStorage, so it is
// entered ONCE and survives every launch/refresh — no re-upload needed until a
// new year. Fridays are always treated as holidays locally (the file lists
// official events only).
//
//   isHoliday("14050101")  -> true | false   (sync: cached holiday OR Friday)
//   importHolidayJson(json) -> { years, count }   (call from the Settings upload)
//   useHolidays()           -> { isHoliday, version }   (re-renders on import)
//   holidayStatus()         -> year-end reminder info for the Settings banner

import { useEffect, useState } from 'react';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const PREFIX = 'ir_holidays_';
const cacheKey = (year) => `${PREFIX}${year}`;

// In-memory set of holiday YYYYMMDD keys, merged across all loaded years.
const loadedKeys = new Set();
const loadedYears = new Set();

// Subscribers (pickers, attendance) re-render when holiday data changes.
const listeners = new Set();
let version = 0;
const notify = () => {
  version += 1;
  listeners.forEach((fn) => fn(version));
};

/** "1404/01/01" -> "14040101" (digits only). */
const shamsiToKey = (shamsi) => String(shamsi || '').replace(/[^0-9]/g, '');

// Rebuild the in-memory sets from every ir_holidays_* entry in localStorage.
const rebuildFromCache = () => {
  loadedKeys.clear();
  loadedYears.clear();
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k));
        if (Array.isArray(parsed?.keys)) {
          parsed.keys.forEach((x) => loadedKeys.add(String(x)));
          const y = Number(k.slice(PREFIX.length));
          if (y) loadedYears.add(y);
        }
      } catch {
        /* ignore one corrupt entry */
      }
    }
  } catch {
    /* localStorage unavailable — Fridays still resolve */
  }
};
rebuildFromCache();

/**
 * Parse an uploaded calendar file and cache its holidays per year. Accepts
 * `{ data: [...] }` or a bare array of `{ shamsiDate, isHoliday }`. Replaces any
 * previously stored data for the years present in the file. Throws on an
 * unusable file. Returns `{ years, count }`.
 */
export const importHolidayJson = (payload) => {
  const data = Array.isArray(payload?.data)
    ? payload.data
    : (Array.isArray(payload) ? payload : null);
  if (!data) throw new Error('فایل تقویم معتبر نیست.');

  const byYear = new Map();
  let count = 0;
  for (const row of data) {
    if (!row?.isHoliday) continue;
    const key = shamsiToKey(row.shamsiDate);
    if (key.length !== 8) continue;
    const y = Number(key.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, new Set());
    byYear.get(y).add(key);
    count += 1;
  }
  if (!byYear.size) throw new Error('در این فایل روز تعطیلی یافت نشد.');

  for (const [y, set] of byYear) {
    try {
      localStorage.setItem(
        cacheKey(y),
        JSON.stringify({ importedAt: new Date().toISOString(), keys: [...set] })
      );
    } catch {
      /* storage full — keep whatever else we could write */
    }
  }
  rebuildFromCache();
  notify();
  return { years: [...byYear.keys()].sort((a, b) => a - b), count };
};

/**
 * Replace the per-year localStorage caches from the server holiday mirror
 * (the full db.holidays row set). Called by useSyncEngine after each pull so
 * isHoliday() reflects the host calendar across devices. Rows with deletedAt
 * are ignored. No-op-safe if rows is empty.
 */
export const applyServerHolidays = (rows = []) => {
  const byYear = new Map();
  for (const r of rows) {
    if (!r || r.deletedAt) continue;
    const key = String(r.dateKey || '');
    if (key.length !== 8) continue;
    const y = r.year || key.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, new Set());
    byYear.get(y).add(key);
  }
  if (!byYear.size) return;
  for (const [y, set] of byYear) {
    try {
      localStorage.setItem(
        cacheKey(y),
        JSON.stringify({ importedAt: new Date().toISOString(), keys: [...set] })
      );
    } catch {
      /* storage unavailable */
    }
  }
  rebuildFromCache();
  notify();
};

/** True if the YYYYMMDD Jalali key is a Friday (weekly rest day). */
const isFriday = (dateKey) => {
  if (!dateKey || String(dateKey).length !== 8) return false;
  try {
    const d = new DateObject({
      calendar: persian,
      locale: persian_fa,
      year: Number(dateKey.slice(0, 4)),
      month: Number(dateKey.slice(4, 6)),
      day: Number(dateKey.slice(6, 8)),
    });
    return d.weekDay?.index === 6 || d.weekDay?.name === 'جمعه';
  } catch {
    return false;
  }
};

/**
 * Sync holiday check: a cached official holiday OR a Friday. Safe to call any
 * time — Fridays resolve even before any file is uploaded.
 */
export const isHoliday = (dateKey) => {
  if (!dateKey || String(dateKey).length !== 8) return false;
  return loadedKeys.has(String(dateKey)) || isFriday(dateKey);
};

/** Jalali years that currently have a holiday file loaded (ascending). */
export const loadedHolidayYears = () => [...loadedYears].sort((a, b) => a - b);

/**
 * Year-end reminder info for the Settings banner. Prompts for the *current*
 * Jalali year if it's missing, and for *next* year once we're in month 12.
 */
export const holidayStatus = () => {
  let currentYear = null;
  try {
    currentYear = new DateObject({ calendar: persian, locale: persian_fa }).year;
  } catch {
    currentYear = null;
  }
  const month = (() => {
    try {
      return new DateObject({ calendar: persian, locale: persian_fa }).month.number;
    } catch {
      return 0;
    }
  })();
  const nextYear = currentYear ? currentYear + 1 : null;
  return {
    currentYear,
    nextYear,
    years: loadedHolidayYears(),
    missingCurrent: currentYear ? !loadedYears.has(currentYear) : false,
    // Near year-end (Esfand) and next year not loaded yet.
    missingNext: month === 12 && nextYear ? !loadedYears.has(nextYear) : false,
  };
};

/**
 * Expose the sync `isHoliday` and a `version` that bumps whenever a file is
 * imported — include it in downstream useMemo deps so derived values recompute.
 */
export const useHolidays = () => {
  const [v, setV] = useState(version);
  useEffect(() => {
    const fn = (nv) => setV(nv);
    listeners.add(fn);
    // Catch any import that happened between render and effect.
    if (v !== version) setV(version);
    return () => listeners.delete(fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { isHoliday, version: v };
};
