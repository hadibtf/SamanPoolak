import { productionMonthDays, productionFaYear } from './productionStatistics';

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
