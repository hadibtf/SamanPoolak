import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProductionBarChart from '../components/ProductionBarChart';
import ProductionDayDetails from '../components/ProductionDayDetails';
import { productionApi, ApiError } from '../api/client';
import { currentProductionDate, currentProductionMonth, productionFa as fa, productionMonthDays } from '../productionStatistics';
import employeeStatisticsStyles from './EmployeeStatistics.module.css';
import styles from './ManagementStatistics.module.css';

export default function ManagementStatistics() {
  const [{ year, month }] = useState(currentProductionMonth);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsNavigationId, setDetailsNavigationId] = useState(0);
  const initialLoadStarted = useRef(false);
  const monthRequestId = useRef(0);
  const detailsRequestId = useRef(0);
  const detailsPanelRef = useRef(null);

  const days = useMemo(() => stats ? productionMonthDays(stats.year, stats.month, stats.daily) : [], [stats]);

  const loadDayDetails = useCallback(async (date, employeeIdForRequest) => {
    const requestId = ++detailsRequestId.current;
    setDetails(null); setDetailsLoading(true); setDetailsError('');
    try {
      const result = await productionApi.managementDayStatistics(date, employeeIdForRequest);
      if (requestId === detailsRequestId.current) setDetails(result);
    } catch (err) {
      if (requestId === detailsRequestId.current) setDetailsError(err instanceof ApiError ? err.message : 'دریافت جزئیات روز انجام نشد.');
    } finally {
      if (requestId === detailsRequestId.current) setDetailsLoading(false);
    }
  }, []);

  const loadMonth = useCallback(async () => {
    const requestId = ++monthRequestId.current;
    detailsRequestId.current += 1;
    const today = currentProductionDate();
    const todayIsInSelectedMonth = Number(today.slice(0, 4)) === Number(year) && Number(today.slice(4, 6)) === Number(month);
    const dateToSelect = todayIsInSelectedMonth ? today : '';
    setLoading(true); setError(''); setSelectedDate(''); setDetails(null); setDetailsLoading(false); setDetailsError(''); setStats(null);
    try {
      const monthStats = await productionApi.managementMonthStatistics(year, month);
      if (requestId !== monthRequestId.current) return;
      setStats(monthStats);
      if (dateToSelect) {
        setSelectedDate(dateToSelect);
        await loadDayDetails(dateToSelect, null);
      }
    }
    catch (err) { if (requestId === monthRequestId.current) setError(err instanceof ApiError ? err.message : 'دریافت آمار تولید انجام نشد.'); }
    finally { if (requestId === monthRequestId.current) setLoading(false); }
  }, [loadDayDetails, month, year]);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    if (detailsNavigationId > 0) detailsPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [detailsNavigationId]);

  const selectDay = (day) => {
    setSelectedDate(day.date);
    setDetailsNavigationId((current) => current + 1);
    loadDayDetails(day.date, null);
  };

  return <div className={`${employeeStatisticsStyles.root} ${styles.root} employee-statistics`}>
    {error && <div className="statistics-message error">{error}</div>}
    {!stats && !loading && !error && <div className="statistics-message"><i className="fa-solid fa-chart-column" /><p>آماری برای نمایش وجود ندارد.</p></div>}
    {loading && <div className="statistics-message"><i className="fa-solid fa-spinner fa-spin" /><p>در حال محاسبه آمار...</p></div>}
    {stats && <>
      <section className="statistics-chart-card glass-card"><ProductionBarChart days={days} selectedDate={selectedDate} onSelect={selectDay} /></section>
      <section className="statistics-comparison glass-card"><div className="statistics-card-title"><div><h2>تولید هر کارمند</h2><p>جمع تولید ثبت‌شده در این ماه</p></div></div>{stats.byEmployee.length ? stats.byEmployee.map((row) => <div className="statistics-employee-row" key={row.employeeUserId}><span>{row.employeeName}</span><div className="statistics-employee-meter"><span style={{ width: `${stats.total ? row.quantity / stats.total * 100 : 0}%` }} /></div><strong>{fa(row.quantity)} عدد</strong></div>) : <p className="statistics-no-production">در این ماه تولیدی ثبت نشده است.</p>}</section>
      <div ref={detailsPanelRef}><ProductionDayDetails date={selectedDate} details={details} loading={detailsLoading} error={detailsError} showEmployee /></div>
    </>}
  </div>;
}
