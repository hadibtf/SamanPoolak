import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

export const PRODUCTION_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const PRODUCTION_YEARS = Array.from({ length: 95 }, (_, index) => 1405 + index);
export const productionFa = (value) => Number(value || 0).toLocaleString('fa-IR');
export const productionFaYear = (value) => String(value).replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[digit]);
export const productionStatusLabel = (status) => ({ ASSIGNED: 'تخصیص داده شده', IN_PROGRESS: 'در حال تولید', COMPLETED: 'تکمیل شده' }[status] || status);

// Use numeric DateObject fields rather than locale-dependent format() output.
export function productionDateKey(date) {
  if (!date?.isValid) return '';
  return `${date.year}${String(date.month.number).padStart(2, '0')}${String(date.day).padStart(2, '0')}`;
}

export function productionPiecesFromWeight(weightKg, weightOf10Grams) {
  const kg = Number(weightKg);
  const gramsPerTen = Number(weightOf10Grams);
  return kg > 0 && gramsPerTen > 0 ? Math.round(kg * 1000 * 10 / gramsPerTen) : 0;
}

export function currentProductionMonth() {
  const date = new DateObject({ calendar: persian, locale: persian_fa });
  return { year: Math.min(1499, Math.max(1405, date.year)), month: date.month.number };
}

export function productionMonthDays(year, month, daily = []) {
  const length = new DateObject({ calendar: persian, locale: persian_fa, year: Number(year), month: Number(month), day: 1 }).month.length;
  const totals = new Map(daily.map((row) => [row.date, Number(row.quantity || 0)]));
  return Array.from({ length }, (_, index) => {
    const day = index + 1;
    const date = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
    return { day, date, quantity: totals.get(date) || 0, label: `${productionFa(day)} ${PRODUCTION_MONTHS[month - 1]} ${productionFaYear(year)}` };
  });
}
