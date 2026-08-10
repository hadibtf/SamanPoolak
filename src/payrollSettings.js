// Editable, locally-stored payroll/attendance settings — the SINGLE SOURCE for
// rates used by BOTH the salary calculator and the attendance work-time calc.
// Stored in localStorage (this whole attendance feature is device-local for now);
// defaults come from src/constants.js so behaviour is unchanged until edited.

import { useState, useEffect } from 'react';
import { PAYROLL_RATES, SHIFT_HOURS, OVERTIME_FACTOR } from './constants';

const KEY = 'attendance_payroll_settings';
export const SETTINGS_EVENT = 'payroll-settings-changed';

export const DEFAULT_SETTINGS = {
  // Wage + allowances (Rial)
  dailyWage: PAYROLL_RATES.DAILY_WAGE,
  childAllowance: PAYROLL_RATES.CHILD_ALLOWANCE,
  maskan: PAYROLL_RATES.MASKAN,
  bon: PAYROLL_RATES.BON,
  tahahol: PAYROLL_RATES.TAHAHOL,
  // Coefficients
  shiftHours: SHIFT_HOURS,         // wage-hour divisor (7.33 = 7h20m)
  overtimeFactor: OVERTIME_FACTOR, // 1.4
  // Shift window + unpaid breaks (minutes). Blank/0 break = not deducted.
  shiftStart: '07:00',
  shiftEnd: '17:00',
  breakfastMin: 20,
  lunchMin: 40,
};

export const loadSettings = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (next) => {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
};

// Rial per hour for overtime AND deduction (same value): (dailyWage / 7.33) * 1.4
export const hourlyAdjustRate = (s) =>
  (Number(s.dailyWage) / (Number(s.shiftHours) || 7.33)) * (Number(s.overtimeFactor) || 1.4);

// React hook: re-renders when settings change (in this or another tab).
export const usePayrollSettings = () => {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => {
    const handler = () => setSettings(loadSettings());
    window.addEventListener(SETTINGS_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  return settings;
};
