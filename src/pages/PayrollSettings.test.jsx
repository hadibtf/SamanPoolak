import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PayrollSettings from './PayrollSettings';

beforeEach(() => localStorage.clear());

test('Thursday end-time setting can be saved and reset in the settings form', () => {
  render(<PayrollSettings />);
  const thursdayEnd = screen.getByLabelText('ساعت پایان شیفت پنجشنبه');

  expect(thursdayEnd).toHaveValue('14:00');
  fireEvent.change(thursdayEnd, { target: { value: '13:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'ذخیره تنظیمات' }));
  expect(JSON.parse(localStorage.getItem('attendance_payroll_settings')).thursdayShiftEnd).toBe('13:30');

  fireEvent.click(screen.getByRole('button', { name: 'بازگشت به پیش‌فرض' }));
  expect(thursdayEnd).toHaveValue('14:00');
  expect(JSON.parse(localStorage.getItem('attendance_payroll_settings')).thursdayShiftEnd).toBe('14:00');
});
