import React, { useMemo, useState } from 'react';
import ProductionBarChart from '../components/ProductionBarChart';
import ProductionMonthControls from '../components/ProductionMonthControls';
import ProductionDayDetails from '../components/ProductionDayDetails';
import { PRODUCTION_MONTHS, currentProductionMonth, productionFa as fa, productionFaYear as faYear, productionMonthDays } from '../productionStatistics';
import { productionApi, ApiError } from '../api/client';
import './EmployeeStatistics.css';

export default function EmployeeStatistics() {
  const [{ year: initialYear, month: initialMonth }] = useState(currentProductionMonth);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const days = useMemo(() => productionMonthDays(stats?.year ?? year, stats?.month ?? month, stats?.daily || []), [year, month, stats]);

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
    <ProductionMonthControls year={year} month={month} onYearChange={setYear} onMonthChange={setMonth} onView={loadMonth} loading={loading} />
    {error && <div className="statistics-message error">{error}</div>}
    {!stats && !loading && !error && <div className="statistics-message"><i className="fa-solid fa-chart-column" /><p>سال و ماه را انتخاب کنید و آمار را نمایش دهید.</p></div>}
    {loading && <div className="statistics-message"><i className="fa-solid fa-spinner fa-spin" /><p>در حال محاسبه آمار...</p></div>}
    {stats && <section className="statistics-chart-card glass-card"><div className="statistics-card-title"><div><h2>{PRODUCTION_MONTHS[stats.month - 1]} {faYear(stats.year)}</h2><p>برای دیدن جزئیات، یک ستون را لمس کنید.</p></div><b>{fa(stats.total)} عدد</b></div><ProductionBarChart days={days} selectedDate={selectedDate} onSelect={selectDay} /></section>}
    <ProductionDayDetails date={selectedDate} details={details} loading={detailsLoading} error={detailsError} />
  </div>;
}
