import React, { useMemo, useState } from 'react';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import ProductionBarChart from '../components/ProductionBarChart';
import { productionApi, ApiError } from '../api/client';
import './EmployeeStatistics.css';

const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const YEARS = Array.from({ length: 95 }, (_, index) => 1405 + index);
const fa = (value) => Number(value || 0).toLocaleString('fa-IR');
const statusLabel = (status) => ({ ASSIGNED: 'تخصیص داده شده', IN_PROGRESS: 'در حال تولید', COMPLETED: 'تکمیل شده' }[status] || status);

export default function EmployeeStatistics() {
  const current = new DateObject({ calendar: persian, locale: persian_fa });
  const [year, setYear] = useState(Math.min(1499, Math.max(1405, current.year)));
  const [month, setMonth] = useState(current.month.number);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const days = useMemo(() => {
    const length = new DateObject({ calendar: persian, locale: persian_fa, year: Number(year), month: Number(month), day: 1 }).month.length;
    const totals = new Map((stats?.daily || []).map((row) => [row.date, Number(row.quantity || 0)]));
    return Array.from({ length }, (_, index) => {
      const day = index + 1;
      const date = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
      return { day, date, quantity: totals.get(date) || 0, label: `${fa(day)} ${MONTHS[month - 1]} ${fa(year)}` };
    });
  }, [year, month, stats]);

  const loadMonth = async () => {
    setLoading(true); setError(''); setSelectedDate(''); setDetails(null);
    try { setStats(await productionApi.employeeMonthStatistics(year, month)); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'دریافت آمار تولید انجام نشد.'); setStats(null); }
    finally { setLoading(false); }
  };

  const selectDay = async (day) => {
    setSelectedDate(day.date); setDetails(null); setDetailsLoading(true); setDetailsError('');
    try { setDetails(await productionApi.employeeDayStatistics(day.date)); }
    catch (err) { setDetailsError(err instanceof ApiError ? err.message : 'دریافت جزئیات روز انجام نشد.'); }
    finally { setDetailsLoading(false); }
  };

  return <div className="employee-statistics">
    <header><div><span>گزارش عملکرد</span><h1>آمار تولید ماهانه</h1></div>{stats && <strong>{fa(stats.total)} <small>عدد</small></strong>}</header>
    <section className="statistics-controls glass-card">
      <label>سال<select value={year} onChange={(e) => setYear(Number(e.target.value))}>{YEARS.map((item) => <option key={item} value={item}>{fa(item)}</option>)}</select></label>
      <label>ماه<select value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
      <button type="button" onClick={loadMonth} disabled={loading}>{loading ? 'در حال دریافت...' : 'نمایش آمار'}</button>
    </section>
    {error && <div className="statistics-message error">{error}</div>}
    {!stats && !loading && !error && <div className="statistics-message"><i className="fa-solid fa-chart-column" /><p>سال و ماه را انتخاب کنید و آمار را نمایش دهید.</p></div>}
    {loading && <div className="statistics-message"><i className="fa-solid fa-spinner fa-spin" /><p>در حال محاسبه آمار...</p></div>}
    {stats && <section className="statistics-chart-card glass-card"><div className="statistics-card-title"><div><h2>{MONTHS[month - 1]} {fa(year)}</h2><p>برای دیدن جزئیات، یک ستون را لمس کنید.</p></div><b>{fa(stats.total)} عدد</b></div><ProductionBarChart days={days} selectedDate={selectedDate} onSelect={selectDay} /></section>}
    {selectedDate && <section className="statistics-details glass-card"><div className="statistics-card-title"><div><h2>تولید روز {selectedDate.slice(6,8).replace(/^0/, '').replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[digit])} {MONTHS[Number(selectedDate.slice(4,6)) - 1]}</h2><p>{selectedDate.slice(0,4)}/{selectedDate.slice(4,6)}/{selectedDate.slice(6,8)}</p></div>{details && <b>{fa(details.total)} عدد</b>}</div>
      {detailsLoading && <div className="detail-state">در حال دریافت جزئیات...</div>}
      {detailsError && <div className="detail-state error">{detailsError}</div>}
      {details && details.records.length === 0 && <div className="detail-state">در این روز تولیدی ثبت نشده است.</div>}
      {details?.records.map((record) => <article key={record.id}><div><h3>{record.productName}</h3><p>سفارش {record.orderNumber} · وظیفه {fa(record.taskId)}</p></div><strong>{fa(record.quantity)} عدد</strong><dl><div><dt>وضعیت وظیفه</dt><dd>{statusLabel(record.taskStatus)}</dd></div><div><dt>مقدار تخصیص</dt><dd>{fa(record.taskRequiredQuantity)}</dd></div><div><dt>ابعاد</dt><dd>{record.thickness ?? '—'} × {record.diameter ?? '—'} میلی‌متر</dd></div><div><dt>زمان ثبت</dt><dd>{record.createdAt ? new Date(record.createdAt).toLocaleString('fa-IR') : '—'}</dd></div></dl></article>)}
    </section>}
  </div>;
}
