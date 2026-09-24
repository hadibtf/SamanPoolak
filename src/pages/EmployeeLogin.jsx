import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import './Login.css';

const EmployeeLogin = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('نام کاربری و گذرواژه را وارد کنید.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password, 'employee');
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError('اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.');
      } else {
        setError('نام کاربری یا گذرواژه اشتباه است.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card glass-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <img className="login-logo-img" src={`${process.env.PUBLIC_URL}/logo192.png`} alt="سامان پولک" />
          <h1>سامانه آمار تولید کارکنان</h1>
          <p>برای ادامه وارد حساب کاربری خود شوید</p>
        </div>
        <div className="form-group">
          <label>نام کاربری</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="نام کاربری" autoComplete="username" autoFocus />
        </div>
        <div className="form-group">
          <label>گذرواژه</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="گذرواژه" autoComplete="current-password" />
        </div>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'در حال ورود...' : 'ورود'}</button>
      </form>
    </div>
  );
};

export default EmployeeLogin;
