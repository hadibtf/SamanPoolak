import React from 'react';
import { vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';

const auth = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ login: auth.login }),
}));

async function submitLogin() {
  const username = document.querySelector('input[autocomplete="username"]');
  const password = document.querySelector('input[autocomplete="current-password"]');
  await userEvent.type(username, '  test-user  ');
  await userEvent.type(password, 'test-password');
  await userEvent.click(document.querySelector('button[type="submit"]'));
  await waitFor(() => expect(auth.login).toHaveBeenCalledWith('test-user', 'test-password'));
  await waitFor(() => expect(document.querySelector('button[type="submit"]')).not.toBeDisabled());
}

describe('management login', () => {
  beforeEach(() => {
    auth.login.mockReset();
    auth.login.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 0)));
  });

  test('submits the normalized credentials to management authentication', async () => {
    render(<Login />);
    await submitLogin();
  });
});
