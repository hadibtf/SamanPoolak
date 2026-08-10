// Shared date picker for the whole app. Wraps react-multi-date-picker with the
// Jalali calendar defaults and paints official holidays + Fridays red via
// `mapDays` (className "rmdp-holiday", styled in index.css). Holiday data loads
// lazily and the picker re-highlights once it arrives.
//
// Drop-in for <DatePicker …>: every prop is forwarded unchanged. A caller's own
// `mapDays` is composed with (not replaced by) the holiday highlighter.

import React from 'react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { useHolidays } from '../holidays';

// Build a YYYYMMDD key from a mapDays DateObject (already in the picker calendar).
const keyOf = (dateObj) => {
  if (!dateObj) return '';
  const y = dateObj.year;
  const m = String(dateObj.month?.number ?? '').padStart(2, '0');
  const d = String(dateObj.day ?? '').padStart(2, '0');
  return `${y}${m}${d}`;
};

const JalaliDatePicker = ({
  calendar = persian,
  locale = persian_fa,
  mapDays: callerMapDays,
  ...rest
}) => {
  // Re-renders when a calendar file is imported, so highlighting updates live.
  const { isHoliday } = useHolidays();

  const mapDays = (props) => {
    const fromCaller = typeof callerMapDays === 'function' ? callerMapDays(props) : null;
    if (!isHoliday(keyOf(props.date))) return fromCaller || undefined;
    const className = [fromCaller?.className, 'rmdp-holiday'].filter(Boolean).join(' ');
    return { ...(fromCaller || {}), className };
  };

  return (
    <DatePicker calendar={calendar} locale={locale} mapDays={mapDays} {...rest} />
  );
};

export default JalaliDatePicker;
