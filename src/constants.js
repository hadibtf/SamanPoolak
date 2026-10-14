// Shared domain constants for the Order Management module.

export const MATERIAL_OPTIONS = [
  { value: 'IRON', label: 'آهن' },
  { value: 'STEEL', label: 'استیل' },
];

export const MATERIAL_LABELS = {
  IRON: 'آهن',
  STEEL: 'استیل',
};

export const PLATING_OPTIONS = [
  { value: 'GOLD', label: 'زرد' },
  { value: 'SILVER', label: 'سفید' },
  { value: 'NONE', label: 'بدون آبکاری' },
];

export const PLATING_LABELS = {
  GOLD: 'زرد',
  SILVER: 'سفید',
  NONE: 'بدون آبکاری',
};

// Customer-facing wording used on the printed invoice. بدون آبکاری omits the
// plating phrase entirely (empty string).
export const INVOICE_PLATING_LABELS = {
  GOLD: 'پوشش گالوانیزه زرد',
  SILVER: 'پوشش گالوانیزه سفید',
  NONE: '',
};

// The order workflow states, in their natural progression order.
// New orders enter this state automatically; it is not selectable manually.
export const INITIAL_ORDER_STATE = 'REGISTERED';

export const ORDER_STATES = [
  { value: 'DELIVERED_WORKSHOP', label: 'تحویل مشتری' },
  { value: 'SENT_FREIGHT', label: 'تحویل باربری' },
  { value: 'DELIVERED_PLATING', label: 'تحویل از آبکاری' },
  { value: 'READY', label: 'آماده در گونی برنج' },
  { value: 'PACKAGED', label: 'بسته بندی شده' },
  { value: 'MINTING', label: 'درحال ضرب' },
  { value: 'RETURN_PLATING', label: 'بازگشت از آبکاری' },
  { value: 'RETURN_HARDENING', label: 'بازگشت از سختکاری' },
  { value: 'SENT_HARDENING', label: 'ارسال به سختکاری' },
  { value: 'SENT_PLATING', label: 'ارسال به آبکاری' },
  { value: 'PRODUCTION_COMPLETE', label: 'اتمام ضرب' },
  { value: 'REGISTERED', label: 'ثبت شده' },
];

export const ORDER_STATE_LABELS = ORDER_STATES.reduce((acc, s) => {
  acc[s.value] = s.label;
  return acc;
}, {});

// Registered, resumed-production, and minting states stay in history but are
// not selectable from the manual state list. Separators are visual only.
export const ORDER_STATE_CHOICES = [
  { value: 'DELIVERED_WORKSHOP' },
  { separator: true },
  { value: 'DELIVERED_PLATING' },
  { value: 'SENT_FREIGHT' },
  { separator: true },
  { value: 'PACKAGED' },
  { value: 'READY' },
  { separator: true },
  { value: 'PRODUCTION_COMPLETE' },
  { separator: true },
  { value: 'SENT_PLATING' },
  { value: 'RETURN_PLATING' },
  { separator: true },
  { value: 'SENT_HARDENING' },
  { value: 'RETURN_HARDENING' },
];

// ===================== Payroll rates (single source) =====================
// Change a value here and it applies everywhere (the salary calculator AND the
// attendance-based work-time calculation). All amounts are in Rial (canonical).
export const PAYROLL_RATES = {
  DAILY_WAGE: 5541850,
  CHILD_ALLOWANCE: 16625550,
  MASKAN: 30000000,
  BON: 22000000,
  TAHAHOL: 5000000,
};

// Legal shift length set by the work ministry: 7h20m = 7.33h. A worker must put
// in this much to count as a full day; less is a deduction, more is overtime —
// and both are valued at the SAME per-hour rate below.
export const SHIFT_HOURS = 7.33;
export const SHIFT_MINUTES = 7 * 60 + 20; // 440

// Unpaid daily breaks not counted as work time (20m breakfast + 40m lunch).
export const WORK_BREAK_MINUTES = 20 + 40; // 60

// Overtime / deduction multiplier and the resulting Rial-per-hour rate:
//   rate = (DailyWage / 7.33) * 1.4
export const OVERTIME_FACTOR = 1.4;
export const hourlyAdjustRateRial = () =>
  (PAYROLL_RATES.DAILY_WAGE / SHIFT_HOURS) * OVERTIME_FACTOR;

// Fixed expense categories (the UI also allows a free-text "سایر" value).
export const EXPENSE_CATEGORIES = [
  'مواد اولیه',
  'آبکاری',
  'سختکاری',
  'حمل و نقل',
  'اجاره',
  'قبوض',
  'تعمیر و نگهداری',
  'حقوق و دستمزد',
  'متفرقه',
];
