import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './payrollSettings';

const KEY = 'attendance_payroll_settings';

beforeEach(() => localStorage.clear());

test('new settings default Thursday to three hours before the regular end', () => {
  expect(DEFAULT_SETTINGS.shiftEnd).toBe('17:00');
  expect(DEFAULT_SETTINGS.thursdayShiftEnd).toBe('14:00');
  expect(loadSettings().thursdayShiftEnd).toBe('14:00');
});

test('legacy settings derive Thursday end from their saved regular end', () => {
  localStorage.setItem(KEY, JSON.stringify({ shiftEnd: '18:30' }));

  expect(loadSettings().thursdayShiftEnd).toBe('15:30');
});

test('an independently saved Thursday end is preserved', () => {
  localStorage.setItem(KEY, JSON.stringify({ shiftEnd: '18:30', thursdayShiftEnd: '14:15' }));

  expect(loadSettings().thursdayShiftEnd).toBe('14:15');
});

test('saving and resetting defaults keep the Thursday field available', () => {
  saveSettings({ ...DEFAULT_SETTINGS, thursdayShiftEnd: '13:30' });
  expect(loadSettings().thursdayShiftEnd).toBe('13:30');

  saveSettings({ ...DEFAULT_SETTINGS });
  expect(loadSettings().thursdayShiftEnd).toBe('14:00');
});
