import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { usersApi, adminApi, holidaysApi, ApiError } from '../api/client';
import { loadedHolidayYears, holidayStatus } from '../holidays';
import { requestSync } from '../syncBus';
import People from './People';
import './SettingsInfo.css';

const toFaDigits = (val) => String(val ?? '').replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

const SettingsInfo = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, currency, setCurrency } = useSettings();
  const isAdmin = user?.role === 'admin';
  const restoreInputRef = useRef(null);
  const [restoring, setRestoring] = useState(false);
  const calendarInputRef = useRef(null);
  const [calYears, setCalYears] = useState(loadedHolidayYears());
  const [calStatus, setCalStatus] = useState(holidayStatus());

  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('settings');
  const [syncing, setSyncing] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { users: list } = await usersApi.list();
      setUsers(list || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, [isAdmin]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleField = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.username.trim() || !form.password) {
      setError('شناسه و رمز عبور الزامی است.');
      return;
    }
    setBusy(true);
    try {
      const displayName = `${form.firstName} ${form.lastName}`.trim() || form.username.trim();
      await usersApi.create({
        username: form.username.trim(),
        password: form.password,
        displayName,
      });
      setForm({ firstName: '', lastName: '', username: '', password: '' });
      await loadUsers();
      showToast('کاربر اضافه شد.');
    } catch (err) {
      console.error('Failed to add user:', err);
      if (err instanceof ApiError && err.status === 0) {
        setError('برای افزودن کاربر نیاز به اتصال اینترنت دارید.');
      } else {
        setError(err instanceof ApiError ? err.message : 'خطا در افزودن کاربر.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`حذف کاربر «${u.displayName || u.username}»؟`)) return;
    try {
      await usersApi.remove(u.id);
      await loadUsers();
      showToast('کاربر حذف شد.');
    } catch (err) {
      console.error('Failed to delete user:', err);
      showToast(err instanceof ApiError ? err.message : 'خطا در حذف کاربر.', 'error');
    }
  };

  const handleBackup = async () => {
    try {
      const data = await adminApi.backup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `saman-poolak-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('فایل پشتیبان دانلود شد.');
    } catch (err) {
      console.error('Backup failed:', err);
      showToast('خطا در تهیه پشتیبان.', 'error');
    }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('بازگردانی، همهٔ سفارش‌ها، افراد و مارک‌ها را با محتوای فایل پشتیبان جایگزین می‌کند. این عمل برگشت‌پذیر نیست. ادامه می‌دهید؟')) return;
    setRestoring(true);
    try {
      const data = JSON.parse(await file.text());
      await adminApi.restore(data);
      // Force a fresh full re-sync of local mirrors, then reload.
      ['signit_people_synced_at', 'signit_orders_synced_at', 'signit_markings_synced_at']
        .forEach((k) => localStorage.removeItem(k));
      showToast('بازگردانی انجام شد. بارگذاری مجدد...');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error('Restore failed:', err);
      showToast(err instanceof ApiError ? err.message : 'خطا در بازگردانی (فایل نامعتبر؟).', 'error');
      setRestoring(false);
    }
  };

  const handleCalendarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      // Host-first: upload to the server so the calendar is GLOBAL. Every device
      // (including this one) then reads it from the host via sync — nothing is
      // stored client-side except the usual synced mirror.
      const res = await holidaysApi.import({ data: Array.isArray(data?.data) ? data.data : data });
      requestSync(); // pull the new rows into the mirror now
      // Give the sync a moment, then refresh the UI counters from the mirror.
      setTimeout(() => { setCalYears(loadedHolidayYears()); setCalStatus(holidayStatus()); }, 1500);
      const yearsFa = (res?.years || []).map(toFaDigits).join('، ');
      const count = res?.count ?? 0;
      showToast(`تقویم سال ${yearsFa} با ${toFaDigits(count)} روز تعطیل روی سرور ثبت شد.`);
    } catch (err) {
      console.error('Calendar import failed:', err);
      const msg = err instanceof ApiError
        ? (err.status === 0 ? 'برای بارگذاری تقویم نیاز به اتصال اینترنت دارید.' : err.message)
        : (err?.message || 'فایل تقویم نامعتبر است.');
      showToast(msg, 'error');
    }
  };

  const handleFullSync = async () => {
    if (!navigator.onLine) {
      showToast('برای همگام‌سازی به اتصال اینترنت نیاز دارید.', 'error');
      return;
    }
    setSyncing(true);
    try {
      [
        'signit_people_synced_at', 'signit_orders_synced_at',
        'signit_markings_synced_at', 'signit_expenses_synced_at',
        'signit_issue_notes_synced_at', 'signit_attendance_synced_at',
        'signit_holidays_synced_at',
      ].forEach((key) => localStorage.removeItem(key));
      await requestSync();
      showToast('داده‌های دستگاه با سرور همگام‌سازی شد.');
    } catch (err) {
      console.error('Full sync failed:', err);
      showToast('خطا در همگام‌سازی داده‌ها.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={`settings-page ${activeTab === 'people' ? 'settings-page-wide' : ''}`}>
      <h1>تنظیمات و اطلاعات</h1>

      <div className="settings-tabs" role="tablist" aria-label="بخش‌های تنظیمات">
        <button type="button" role="tab" aria-selected={activeTab === 'settings'} className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>عمومی</button>
        <button type="button" role="tab" aria-selected={activeTab === 'people'} className={activeTab === 'people' ? 'active' : ''} onClick={() => setActiveTab('people')}>افراد</button>
      </div>

      {activeTab === 'people' ? <People /> : <>

      <div className="settings-card glass-card">
        <div className="settings-user">
          <div className="settings-avatar"><i className="fa-solid fa-user"></i></div>
          <div className="settings-user-info">
            <strong>{user?.displayName || user?.username}</strong>
            <span className="muted">{user?.username}{isAdmin ? ' · مدیر' : ''}</span>
          </div>
        </div>

        <button className="logout-btn" onClick={logout}>
          <i className="fa-solid fa-arrow-right-from-bracket"></i> خروج از حساب
        </button>
      </div>

      {/* Appearance: theme + currency (everyone) */}
      <div className="settings-card glass-card">
        <h2 className="settings-section-title">
          <i className="fa-solid fa-sliders"></i> نمایش
        </h2>

        <div className="setting-row">
          <span>حالت تیره</span>
          <button
            type="button"
            role="switch"
            aria-checked={theme === 'dark'}
            className={`ios-switch ${theme === 'dark' ? 'on' : ''}`}
            onClick={toggleTheme}
          >
            <span className="knob" />
          </button>
        </div>

        <div className="setting-row">
          <span>واحد پول</span>
          <div className="segmented-control inline currency-seg">
            <button
              type="button"
              className={`segment ${currency === 'RIAL' ? 'active' : ''}`}
              onClick={() => setCurrency('RIAL')}
            >
              ریال
            </button>
            <button
              type="button"
              className={`segment ${currency === 'TOMAN' ? 'active' : ''}`}
              onClick={() => setCurrency('TOMAN')}
            >
              تومان
            </button>
          </div>
        </div>
      </div>

      <div className="settings-card glass-card">
        <h2 className="settings-section-title">
          <i className="fa-solid fa-rotate"></i> همگام‌سازی داده‌ها
        </h2>
        <p className="muted settings-hint">
          فهرست افراد، سفارش‌ها، هزینه‌ها و سایر داده‌های این دستگاه را دوباره از سرور دریافت می‌کند.
        </p>
        <button type="button" className="primary-btn" disabled={syncing} onClick={handleFullSync}>
          <i className={`fa-solid fa-rotate ${syncing ? 'fa-spin' : ''}`}></i> {syncing ? 'در حال همگام‌سازی...' : 'همگام‌سازی با سرور'}
        </button>
      </div>

      {/* Holiday calendar: upload one YEAR.json per year (kept across launches). */}
      <div className="settings-card glass-card">
        <h2 className="settings-section-title">
          <i className="fa-solid fa-calendar-day"></i> تقویم تعطیلات
        </h2>
      

        {calStatus.missingCurrent && calStatus.currentYear && (
          <div className="inline-error">
            تقویم سال جاری ({toFaDigits(calStatus.currentYear)}) بارگذاری نشده است.
          </div>
        )}
        {calStatus.missingNext && calStatus.nextYear && (
          <div className="inline-error">
            سال جدید نزدیک است — تقویم سال {toFaDigits(calStatus.nextYear)} را بارگذاری کنید.
          </div>
        )}

        <p className="muted settings-hint">
          {calYears.length
            ? `سال‌های بارگذاری‌شده: ${calYears.map(toFaDigits).join('، ')}`
            : 'هنوز تقویمی بارگذاری نشده است (فعلاً فقط جمعه‌ها تعطیل محسوب می‌شوند).'}
        </p>

        <button
          type="button"
          className="primary-btn"
          onClick={() => calendarInputRef.current?.click()}
        >
          <i className="fa-solid fa-upload"></i> بارگذاری / به‌روزرسانی تقویم
        </button>
        <input
          ref={calendarInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={handleCalendarFile}
        />
      </div>

      {isAdmin && (
        <div className="settings-card glass-card">
          <h2 className="settings-section-title">
            <i className="fa-solid fa-database"></i> پشتیبان‌گیری
          </h2>
          <p className="muted settings-hint">
            دانلود یک فایل پشتیبان از همهٔ داده‌ها، یا بازگردانی از یک فایل پشتیبان.
          </p>
          <div className="backup-actions">
            <button type="button" className="primary-btn" onClick={handleBackup}>
              <i className="fa-solid fa-download"></i> دانلود پشتیبان
            </button>
            <button
              type="button"
              className="restore-btn"
              disabled={restoring}
              onClick={() => restoreInputRef.current?.click()}
            >
              <i className="fa-solid fa-upload"></i> {restoring ? 'در حال بازگردانی...' : 'بازگردانی از فایل'}
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={handleRestoreFile}
            />
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="settings-card glass-card">
          <h2 className="settings-section-title">
            <i className="fa-solid fa-users-gear"></i> مدیریت کاربران
          </h2>

          <form className="user-form" onSubmit={handleAddUser}>
            <div className="user-form-grid">
              <div className="form-group">
                <label>نام</label>
                <input name="firstName" value={form.firstName} onChange={handleField} placeholder="نام" />
              </div>
              <div className="form-group">
                <label>نام خانوادگی</label>
                <input name="lastName" value={form.lastName} onChange={handleField} placeholder="نام خانوادگی" />
              </div>
              <div className="form-group">
                <label>شناسه (نام کاربری)</label>
                <input name="username" value={form.username} onChange={handleField} placeholder="مثال: ali" autoComplete="off" />
              </div>
              <div className="form-group">
                <label>رمز عبور</label>
                <input name="password" type="text" value={form.password} onChange={handleField} placeholder="رمز عبور" autoComplete="new-password" />
              </div>
            </div>
            {error && <div className="inline-error">{error}</div>}
            <button type="submit" className="primary-btn" disabled={busy}>
              {busy ? 'در حال افزودن...' : 'افزودن کاربر'}
            </button>
          </form>

          <div className="users-list">
            {users.map((u) => (
              <div key={u.id} className="user-row">
                <div className="user-row-info">
                  <strong>{u.displayName || u.username}</strong>
                  <span className="muted">
                    {u.username}{u.role === 'admin' ? ' · مدیر' : ''}
                  </span>
                </div>
                {u.id !== user?.id && (
                  <button className="action-btn delete" title="حذف" onClick={() => handleDeleteUser(u)}>
                    <i className="fa-solid fa-trash"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      </>}
    </div>
  );
};

export default SettingsInfo;
