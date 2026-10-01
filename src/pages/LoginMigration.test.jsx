import React from 'react';
import { vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import EmployeeLogin from './EmployeeLogin';

const auth = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ login: auth.login }),
}));

async function submitLogin(surface) {
  const username = document.querySelector('input[autocomplete="username"]');
  const password = document.querySelector('input[autocomplete="current-password"]');
  await userEvent.type(username, '  test-user  ');
  await userEvent.type(password, 'test-password');
  await userEvent.click(document.querySelector('button[type="submit"]'));
  await waitFor(() => expect(auth.login).toHaveBeenCalledWith('test-user', 'test-password', surface));
  await waitFor(() => expect(document.querySelector('button[type="submit"]')).not.toBeDisabled());
}

describe('login surfaces after the Vite migration', () => {
  beforeEach(() => {
    auth.login.mockReset();
    auth.login.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 0)));
  });

  test('management login keeps its management surface', async () => {
    render(<Login />);
    await submitLogin('management');
  });

  test('employee login keeps its employee surface', async () => {
    render(<EmployeeLogin />);
    expect(screen.getByText('سامانه آمار تولید کارکنان')).toBeInTheDocument();
    await submitLogin('employee');
  });
});
