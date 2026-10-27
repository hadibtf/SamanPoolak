import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsInfo from './SettingsInfo';
import { adminApi, holidaysApi } from '../api/client';
import { isHoliday, refreshHolidays } from '../holidays';

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin', username: 'manager' }, logout: vi.fn() }) }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ theme: 'light', currency: 'RIAL', toggleTheme: vi.fn(), setCurrency: vi.fn() }) }));
vi.mock('../api/client', () => ({
  usersApi: { list: vi.fn().mockResolvedValue({ users: [] }) },
  adminApi: { backup: vi.fn(), restore: vi.fn() },
  holidaysApi: { list: vi.fn(), import: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

const upload = (input, payload) => {
  const file = new File([], 'data.json', { type: 'application/json' });
  file.text = async () => JSON.stringify(payload);
  fireEvent.change(input, { target: { files: [file] } });
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

test('calendar import immediately fetches canonical server days and updates the visible year', async () => {
  holidaysApi.list.mockResolvedValueOnce({ holidays: [] });
  await refreshHolidays();
  holidaysApi.import.mockResolvedValueOnce({ count: 1, years: [1405] });
  holidaysApi.list.mockResolvedValueOnce({ holidays: [{ year: 1405, dateKey: '14050101' }] });
  const { container } = render(<SettingsInfo />);
  upload(container.querySelectorAll('input[type="file"]')[0], { data: [{ shamsiDate: '1405/01/02', isHoliday: true }] });
  await screen.findByText('سال‌های بارگذاری‌شده: ۱۴۰۵');
  expect(isHoliday('14050101')).toBe(true);
  expect(JSON.parse(localStorage.getItem('ir_holidays_1405')).keys).toEqual(['14050101']);
});

test('backup downloads the API result and confirmed restore reloads without resetting cursors', async () => {
  const backup = { people: [{ id: '0-1' }], orders: [] };
  adminApi.backup.mockResolvedValueOnce(backup);
  adminApi.restore.mockResolvedValueOnce({ ok: true });
  const createObjectURL = vi.fn(() => 'blob:backup');
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const originalTimeout = window.setTimeout;
  const scheduled = vi.spyOn(window, 'setTimeout').mockImplementation((fn, delay, ...args) => delay === 800 ? 1 : originalTimeout(fn, delay, ...args));
  localStorage.setItem('signit_orders_synced_at', 'old-cursor');
  const { container } = render(<SettingsInfo />);
  await userEvent.click(screen.getByRole('button', { name: /دانلود پشتیبان/ }));
  await screen.findByText('فایل پشتیبان دانلود شد.');
  expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
  upload(container.querySelectorAll('input[type="file"]')[1], backup);
  await screen.findByText('بازگردانی انجام شد. بارگذاری مجدد...');
  await waitFor(() => expect(adminApi.restore).toHaveBeenCalledWith(backup));
  expect(localStorage.getItem('signit_orders_synced_at')).toBe('old-cursor');
  expect(scheduled.mock.calls.some(([, delay]) => delay === 800)).toBe(true);
});
