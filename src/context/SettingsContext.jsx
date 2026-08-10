import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// App-wide preferences: theme (light/dark) and display currency (Rial/Toman).
// Both persist in localStorage. Money is always STORED in Rial everywhere;
// the currency setting only changes how amounts are displayed and entered.

const SettingsContext = createContext(null);

const THEME_KEY = 'signit_theme';
const CURRENCY_KEY = 'signit_currency';

const faNum = (n) => Math.round(Number(n) || 0).toLocaleString('fa-IR');

export function SettingsProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [currency, setCurrencyState] = useState(() => localStorage.getItem(CURRENCY_KEY) || 'RIAL');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(CURRENCY_KEY, currency);
  }, [currency]);

  const setTheme = useCallback((t) => setThemeState(t === 'dark' ? 'dark' : 'light'), []);
  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const setCurrency = useCallback((c) => setCurrencyState(c === 'TOMAN' ? 'TOMAN' : 'RIAL'), []);

  const isToman = currency === 'TOMAN';
  const currencyLabel = isToman ? 'تومان' : 'ریال';

  // Rial (canonical) -> displayed amount in the active currency.
  const fromRial = useCallback((rial) => {
    const v = Number(rial) || 0;
    return isToman ? v / 10 : v;
  }, [isToman]);

  // A value entered in the active currency -> Rial for storage/compute.
  const toRial = useCallback((value) => {
    const v = Number(value) || 0;
    return isToman ? v * 10 : v;
  }, [isToman]);

  // Format a Rial amount for display in the active currency (with unit label).
  const formatMoney = useCallback((rial, { unit = true } = {}) => {
    const s = faNum(fromRial(rial));
    return unit ? `${s} ${currencyLabel}` : s;
  }, [fromRial, currencyLabel]);

  const value = {
    theme, setTheme, toggleTheme,
    currency, setCurrency, isToman, currencyLabel,
    fromRial, toRial, formatMoney,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
