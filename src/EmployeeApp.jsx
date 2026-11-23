import React from 'react';
import EmployeeLogin from './pages/EmployeeLogin';
import { useAuth } from './auth/AuthContext';
import styles from './pages/Login.module.css';

export default function EmployeeApp() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="app-splash" />;
  if (!user || user.role !== 'employee') return <EmployeeLogin />;

  return <main className={styles.root} dir="rtl">
    <section className="login-card glass-card">
      <div className="login-brand">
        <img className="login-logo-img" src={`${import.meta.env.BASE_URL}logo192.png`} alt="سامان پولک" />
        <h1>پنل تولید کارکنان غیرفعال است</h1>
        <p>در حال حاضر ثبت یا مشاهده تولید از پنل کارکنان در دسترس نیست.</p>
      </div>
      <button type="button" className="primary-btn" onClick={logout}>خروج</button>
    </section>
  </main>;
}
