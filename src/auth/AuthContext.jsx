import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, getToken, setToken, onUnauthorized } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: validate any stored token against the server.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user: me } = await authApi.me();
        if (!cancelled) setUser(me);
      } catch {
        setToken(null); // invalid/expired token
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Any 401 anywhere forces a logout.
    const unsub = onUnauthorized(() => setUser(null));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const login = async (username, password) => {
    const { token, user: me } = await authApi.login(username, password);
    setToken(token);
    setUser(me);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore network/serverside errors on logout
    }
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
