import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { peopleApi, attendanceApi } from '../api/client';
import { saveSettings } from '../payrollSettings';
import HumanResources from './HumanResources';

vi.mock('../api/client', () => ({
  peopleApi: { list: vi.fn() },
  attendanceApi: { list: vi.fn() },
}));
vi.mock('../components/JalaliDatePicker', () => ({
  default: ({ placeholder, onChange }) => {
    const date = {
      year: 1405,
      month: { number: 7, name: 'مهر' },
      day: 2,
      toDate: () => new Date(2026, 8, 24),
    };
    return <button type="button" onClick={() => onChange(date)}>{placeholder}</button>;
  },
}));
vi.mock('../components/PersonFormSheet', () => ({ default: () => null }));
vi.mock('../holidays', () => ({ useHolidays: () => ({ isHoliday: () => false, version: 0 }) }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ isToman: false, currencyLabel: 'ریال' }) }));
vi.mock('./PayrollAttendance', () => ({ default: () => null }));
vi.mock('./PayrollSettings', () => ({ default: () => null }));
vi.mock('./JobApplications', () => ({ default: () => null }));

const defaultSettings = {
  dailyWage: 5541850,
  childAllowance: 16625550,
  maskan: 30000000,
  bon: 22000000,
  tahahol: 5000000,
  shiftHours: 7.33,
  overtimeFactor: 1.4,
  shiftStart: '07:00',
  shiftEnd: '17:00',
  thursdayShiftEnd: '14:00',
  breakfastMin: 20,
  lunchMin: 40,
};

beforeEach(() => {
  localStorage.clear();
  peopleApi.list.mockResolvedValue({ people: [
    { id: '0-1', category: 'EMPLOYEE', firstName: 'علی', lastName: 'احمدی', cardNo: '42' },
  ] });
  attendanceApi.list.mockResolvedValue({ attendance: [
    { id: 1, cardNo: '42', dateKey: '14050702', time: '07:00' },
    { id: 2, cardNo: '42', dateKey: '14050702', time: '14:30' },
  ] });
});

test('settings refresh attendance-derived payroll values without replacing manual edits', async () => {
  render(<HumanResources />);
  await userEvent.click(screen.getByRole('button', { name: 'از تاریخ' }));
  await userEvent.click(screen.getByRole('button', { name: 'تا تاریخ' }));
  await userEvent.type(screen.getByPlaceholderText('جستجو'), 'علی');
  await userEvent.click(await screen.findByText('علی احمدی (0-1)'));

  const overtime = screen.getByLabelText('ساعت اضافه‌کاری');
  const deduction = screen.getByLabelText('ساعت کسری کار');
  await waitFor(() => {
    expect(overtime).toHaveValue(0.5);
    expect(deduction).toHaveValue(0);
  });

  act(() => saveSettings({ ...defaultSettings, thursdayShiftEnd: '15:00' }));
  await waitFor(() => {
    expect(overtime).toHaveValue(0);
    expect(deduction).toHaveValue(0.5);
  });

  fireEvent.change(overtime, { target: { value: '1.25' } });
  act(() => saveSettings({ ...defaultSettings, thursdayShiftEnd: '14:00' }));
  await waitFor(() => {
    expect(overtime).toHaveValue(1.25);
    expect(deduction).toHaveValue(0);
  });
});
