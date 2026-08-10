import React, { useState } from 'react';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../payrollSettings';
import './PayrollSettings.css';

// All amounts are Rial (canonical). Breaks/shift in minutes / HH:MM.
const PayrollSettings = () => {
  const [form, setForm] = useState(loadSettings);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const setField = (name, value) => setForm((p) => ({ ...p, [name]: value }));

  const handleSave = (e) => {
    e.preventDefault();
    saveSettings(form);
    showToast('تنظیمات ذخیره شد.');
  };

  const handleReset = () => {
    setForm({ ...DEFAULT_SETTINGS });
    saveSettings({ ...DEFAULT_SETTINGS });
    showToast('به مقادیر پیش‌فرض بازگشت.');
  };

  const numField = (name, label, suffix) => (
    <div className="form-group">
      <label>{label}{suffix ? ` (${suffix})` : ''}</label>
      <input
        type="number"
        value={form[name]}
        onChange={(e) => setField(name, e.target.value)}
        dir="ltr"
      />
    </div>
  );

  return (
    <form className="card payroll-settings" onSubmit={handleSave}>
      <h2 className="ps-title">شیفت و تنفس</h2>
      <p className="ps-hint">
        شیفت کاری شامل ساعت شروع و پایان و زمان تنفس‌هاست. هر تنفسی که مقدارش
        صفر/خالی باشد از زمان کار کسر نمی‌شود.
      </p>
      <div className="grid-form">
        <div className="form-group">
          <label>ساعت شروع شیفت</label>
          <input type="time" value={form.shiftStart} onChange={(e) => setField('shiftStart', e.target.value)} dir="ltr" />
        </div>
        <div className="form-group">
          <label>ساعت پایان شیفت</label>
          <input type="time" value={form.shiftEnd} onChange={(e) => setField('shiftEnd', e.target.value)} dir="ltr" />
        </div>
        {numField('breakfastMin', 'زمان صبحانه', 'دقیقه')}
        {numField('lunchMin', 'زمان ناهار', 'دقیقه')}
      </div>

      <h2 className="ps-title">دستمزد و مزایا</h2>
      <div className="grid-form">
        {numField('dailyWage', 'دستمزد روزانه', 'ریال')}
        {numField('childAllowance', 'حق اولاد (ماهانه)', 'ریال')}
        {numField('maskan', 'بن مسکن (ماهانه)', 'ریال')}
        {numField('bon', 'بن کارگری (ماهانه)', 'ریال')}
        {numField('tahahol', 'حق تأهل (ماهانه)', 'ریال')}
      </div>

      <h2 className="ps-title">ضرایب</h2>
      
      <div className="grid-form">
        {numField('shiftHours', 'ساعت کاری مبنا (روز)', 'ساعت')}
        {numField('overtimeFactor', 'ضریب اضافه‌کاری/کسری')}
      </div>

      <div className="ps-actions">
        <button type="submit" className="btn-calc">ذخیره تنظیمات</button>
        <button type="button" className="ps-reset" onClick={handleReset}>بازگشت به پیش‌فرض</button>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </form>
  );
};

export default PayrollSettings;
