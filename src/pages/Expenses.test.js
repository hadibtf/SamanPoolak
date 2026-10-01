import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Expenses from './Expenses';

jest.mock('dexie-react-hooks', () => ({ useLiveQuery: () => [] }));
jest.mock('../db', () => ({ db: {}, jalaliDateKey: jest.fn() }));
jest.mock('../components/JalaliDatePicker', () => () => <input aria-label="تاریخ" />);
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    formatMoney: (value) => String(value),
    currencyLabel: 'ریال',
    toRial: Number,
    fromRial: Number,
  }),
}));
jest.mock('../api/client', () => ({
  expensesApi: {},
  ApiError: class ApiError extends Error {},
}));

describe('Expenses dialog', () => {
  test('contains keyboard focus, closes on Escape, restores focus, and is RTL', async () => {
    render(<Expenses />);
    const trigger = screen.getByRole('button', { name: /افزودن هزینه/ });
    await userEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'افزودن هزینه' });
    expect(dialog).toHaveAttribute('dir', 'rtl');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  test('closes on backdrop click but not clicks inside the dialog', async () => {
    render(<Expenses />);
    await userEvent.click(screen.getByRole('button', { name: /افزودن هزینه/ }));
    const dialog = screen.getByRole('dialog', { name: 'افزودن هزینه' });

    await userEvent.click(dialog);
    expect(screen.getByRole('dialog', { name: 'افزودن هزینه' })).toBeInTheDocument();

    await userEvent.click(dialog.parentElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

});
