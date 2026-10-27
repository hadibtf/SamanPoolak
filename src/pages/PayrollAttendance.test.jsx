import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PayrollAttendance from './PayrollAttendance';
import { attendanceApi } from '../api/client';

vi.mock('../api/client', () => ({
  peopleApi: { list: vi.fn().mockResolvedValue({ people: [{ id: '0-1', category: 'EMPLOYEE', firstName: 'علی', lastName: 'احمدی', cardNo: '42' }] }) },
  attendanceApi: { list: vi.fn(), import: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));
vi.mock('../components/JalaliDatePicker', () => ({ default: () => <input aria-label="تاریخ" /> }));
vi.mock('../holidays', () => ({ useHolidays: () => ({ isHoliday: () => false, version: 0 }) }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ formatMoney: String }) }));

beforeEach(() => {
  vi.clearAllMocks();
  attendanceApi.list.mockImplementation(async (query) => query.countOnly ? { count: 1 } : {
    attendance: [{ id: 1, cardNo: '42', dateKey: '14050101', time: '07:00', source: 'device' }],
  });
});

test('failed attendance import reports failure and leaves the server-backed count unchanged', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  attendanceApi.import.mockRejectedValueOnce(new Error('offline'));
  const { container } = render(<PayrollAttendance />);
  await screen.findByText('۱ رکورد');
  const file = new File([], 'attendance.json', { type: 'application/json' });
  file.text = async () => JSON.stringify({ records: [{ cardNo: '42', dateKey: '14050101', time: '07:00' }] });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  await screen.findByText(/ورود ناموفق بود/);
  expect(screen.getByText('۱ رکورد')).toBeInTheDocument();
  expect(attendanceApi.import).toHaveBeenCalledOnce();
  expect(attendanceApi.list).toHaveBeenCalledTimes(1);
});

test('manual scans use the API response, preserve failed input, and delete only on success', async () => {
  render(<PayrollAttendance />);
  await userEvent.click(await screen.findByRole('button', { name: /علی احمدی/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'نمایش جزئیات روز' }));
  const input = screen.getByPlaceholderText('12:00');
  await userEvent.type(input, '17:00');
  attendanceApi.create.mockRejectedValueOnce(new Error('offline'));
  await userEvent.click(screen.getByRole('button', { name: 'افزودن' }));
  await screen.findByText(/عملیات ناموفق بود/);
  expect(input).toHaveValue('17:00');
  attendanceApi.create.mockResolvedValueOnce({ attendance: { id: 2, cardNo: '42', dateKey: '14050101', time: '17:00', source: 'manual' } });
  await userEvent.click(screen.getByRole('button', { name: 'افزودن' }));
  await screen.findByTitle('حذف ثبت دستی');
  attendanceApi.remove.mockRejectedValueOnce(new Error('offline'));
  await userEvent.click(screen.getByTitle('حذف ثبت دستی'));
  await waitFor(() => expect(attendanceApi.remove).toHaveBeenCalledWith(2));
  expect(screen.getByTitle('حذف ثبت دستی')).toBeInTheDocument();
  attendanceApi.remove.mockResolvedValueOnce({ ok: true });
  await userEvent.click(screen.getByTitle('حذف ثبت دستی'));
  await waitFor(() => expect(screen.queryByTitle('حذف ثبت دستی')).not.toBeInTheDocument());
  expect(attendanceApi.list.mock.calls.some(([query]) => query.cardNo === '42' && query.from && query.to)).toBe(true);
});
