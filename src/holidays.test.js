import { holidaysApi } from './api/client';
import { refreshHolidays, isHoliday, loadedHolidayYears } from './holidays';

vi.mock('./api/client', () => ({ holidaysApi: { list: vi.fn() } }));
afterEach(() => localStorage.clear());

test('canonical calendar reads replace cached holidays, including deletions after restore', async () => {
  holidaysApi.list.mockResolvedValueOnce({ holidays: [{ year: 1405, dateKey: '14050101' }] });
  await refreshHolidays();
  expect(isHoliday('14050101')).toBe(true);
  expect(loadedHolidayYears()).toEqual([1405]);
  holidaysApi.list.mockResolvedValueOnce({ holidays: [] });
  await refreshHolidays();
  expect(loadedHolidayYears()).toEqual([]);
  expect(localStorage.getItem('ir_holidays_1405')).toBeNull();
});

test('failed or malformed holiday responses do not erase the existing calendar', async () => {
  holidaysApi.list.mockResolvedValueOnce({ holidays: [{ year: 1405, dateKey: '14050101' }] });
  await refreshHolidays();
  holidaysApi.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
  await expect(refreshHolidays()).rejects.toThrow('offline');
  await expect(refreshHolidays()).rejects.toThrow('Invalid holiday response');
  expect(isHoliday('14050101')).toBe(true);
});
