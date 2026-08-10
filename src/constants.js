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
  GOLD: 'آبکاری زرد',
  SILVER: 'آبکاری سفید',
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
export const ORDER_STATES = [
  { value: 'REGISTERED', label: 'ثبت شده' },
  { value: 'MINTING', label: 'درحال ضرب' },
  { value: 'SENT_HARDENING', label: 'ارسال به سختکاری' },
  { value: 'RETURN_HARDENING', label: 'بازگشت از سختکاری' },
  { value: 'SENT_PLATING', label: 'ارسال به آبکاری' },
  { value: 'RETURN_PLATING', label: 'بازگشت از آبکاری' },
  { value: 'READY', label: 'آماده تحویل' },
  { value: 'PACKAGED', label: 'بسته‌بندی شده' },
  { value: 'SENT_FREIGHT', label: 'تحویل به باربری' },
  { value: 'DELIVERED_WORKSHOP', label: 'تحویل به مشتری از کارگاه' },
  { value: 'DELIVERED_PLATING', label: 'تحویل به مشتری از آبکاری' },
];

export const ORDER_STATE_LABELS = ORDER_STATES.reduce((acc, s) => {
  acc[s.value] = s.label;
  return acc;
}, {});

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
