import {
  computeDay,
  summarizeAttendance,
  weekdayOfDateKey,
} from './attendance';

const settings = {
  shiftStart: '07:00',
  shiftEnd: '17:00',
  thursdayShiftEnd: '14:00',
  breakfastMin: 20,
  lunchMin: 40,
};

const scans = (dateKey, end) => [
  { id: 1, dateKey, time: '07:00' },
  { id: 2, dateKey, time: end },
];

test('Jalali date keys identify Thursday and Friday correctly', () => {
  expect(weekdayOfDateKey('14050702')).toBe('پنجشنبه');
  expect(weekdayOfDateKey('14050703')).toBe('جمعه');
  expect(weekdayOfDateKey('bad-date')).toBe('');
});

test('Thursday uses its shorter expected shift and only breakfast through 15:00', () => {
  const summary = computeDay(scans('14050702', '14:00'), { ...settings, dateKey: '14050702' });

  expect(summary.workedMin).toBe(400);
  expect(summary.expectedMin).toBe(400);
  expect(summary.balanceMin).toBe(0);
});

test('Thursday deducts lunch after 15:00 but not at exactly 15:00', () => {
  const exactlyAtCutoff = computeDay(scans('14050702', '15:00'), { ...settings, dateKey: '14050702' });
  const afterCutoff = computeDay(scans('14050702', '16:00'), { ...settings, dateKey: '14050702' });

  expect(exactlyAtCutoff.workedMin).toBe(460);
  expect(exactlyAtCutoff.balanceMin).toBe(60);
  expect(afterCutoff.workedMin).toBe(480);
  expect(afterCutoff.balanceMin).toBe(80);
});

test('a Thursday scheduled past 15:00 includes lunch in the expected target', () => {
  const summary = computeDay(scans('14050702', '15:00'), {
    ...settings,
    thursdayShiftEnd: '16:00',
    dateKey: '14050702',
  });

  expect(summary.expectedMin).toBe(480);
  expect(summary.workedMin).toBe(460);
  expect(summary.balanceMin).toBe(-20);
});

test('non-Thursday schedules and Friday holiday overtime retain existing behavior', () => {
  const regular = computeDay(scans('14050701', '17:00'), { ...settings, dateKey: '14050701' });
  const fridayHoliday = computeDay(scans('14050703', '09:00'), {
    ...settings,
    dateKey: '14050703',
    isHoliday: true,
  });

  expect(regular.workedMin).toBe(540);
  expect(regular.expectedMin).toBe(540);
  expect(regular.balanceMin).toBe(0);
  expect(fridayHoliday.balanceMin).toBe(60);
});

test('attendance summary and payroll adjustments share Thursday results', () => {
  const summary = summarizeAttendance([
    ...scans('14050702', '16:00'),
    ...scans('14050701', '17:00').map((scan) => ({ ...scan, id: scan.id + 2 })),
  ], settings);

  expect(summary.days.map((day) => day.summary.balanceMin)).toEqual([0, 80]);
  expect(summary.workedMin).toBe(1020);
  expect(summary.overtimeMinutes).toBe(80);
  expect(summary.deductionMinutes).toBe(0);
  expect(summary.completeDays).toBe(2);
});
