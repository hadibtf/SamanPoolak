import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider, useSettings } from './SettingsContext';

function ThemeProbe() {
  const { theme, toggleTheme } = useSettings();
  return <button type="button" onClick={toggleTheme}>{theme}</button>;
}

describe('theme behavior after the Vite migration', () => {
  afterEach(() => {
    localStorage.removeItem('signit_theme');
    document.documentElement.removeAttribute('data-theme');
  });

  test('restores the saved dark theme and applies it to the document', async () => {
    localStorage.setItem('signit_theme', 'dark');
    render(<SettingsProvider><ThemeProbe /></SettingsProvider>);

    expect(screen.getByRole('button')).toHaveTextContent('dark');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));

    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    expect(localStorage.getItem('signit_theme')).toBe('light');
  });
});
