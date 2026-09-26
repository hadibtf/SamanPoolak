import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { productionMonthDays, productionFaYear, productionDateKey, productionPiecesFromWeight } from './productionStatistics';

test('every supported Jalali month has all valid dates and zero-filled days', () => {
  for (let year = 1405; year <= 1499; year++) {
    for (let month = 1; month <= 12; month++) {
      const days = productionMonthDays(year, month, [{ date: `${year}${String(month).padStart(2, '0')}01`, quantity: 2.5 }]);
      if (month <= 11) expect(days.length).toBe(month <= 6 ? 31 : 30);
      else expect([29, 30]).toContain(days.length);
      expect(days[0].quantity).toBe(2.5);
      expect(days.slice(1).every((day) => day.quantity === 0)).toBe(true);
      expect(days.at(-1).date).toBe(`${year}${String(month).padStart(2, '0')}${String(days.length).padStart(2, '0')}`);
    }
  }
});

test('year label is Persian digits without a thousands separator', () => {
  expect(productionFaYear(1405)).toBe('۱۴۰۵');
});

test('an empty month still renders every day with zero production', () => {
  const days = productionMonthDays(1405, 7, []);
  expect(days).toHaveLength(30);
  expect(days.every((day) => day.quantity === 0)).toBe(true);
});

test('Esfand leap years match the server date validator throughout 1405–1499', () => {
  const leapYears = [1408,1412,1416,1420,1424,1428,1432,1436,1441,1445,1449,1453,1457,1461,1465,1469,1473,1478,1482,1486,1490,1494,1498];
  const actual = Array.from({ length: 95 }, (_, index) => index + 1405)
    .filter((year) => productionMonthDays(year, 12).length === 30);
  expect(actual).toEqual(leapYears);
});

test('a past day selected in the Jalali picker keeps its exact API date', () => {
  const selected = new DateObject({ calendar: persian, locale: persian_fa, year: 1405, month: 7, day: 3 });
  expect(productionDateKey(selected)).toBe('14050703');
  expect(productionDateKey(null)).toBe('');
});

test('batch weight in kilograms estimates pieces from ten-piece grams', () => {
  expect(productionPiecesFromWeight(0.3, 300)).toBe(10);
  expect(productionPiecesFromWeight(1.5, 300)).toBe(50);
  expect(productionPiecesFromWeight(10, 300)).toBe(333);
  expect(productionPiecesFromWeight('', 300)).toBe(0);
});
