import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProductionBarChart from '../components/ProductionBarChart';
import ProductionMonthControls from '../components/ProductionMonthControls';
import ProductionDayDetails from '../components/ProductionDayDetails';
import { productionApi, ApiError } from '../api/client';
import { currentProductionDate, currentProductionMonth, productionFa as fa, productionMonthDays } from '../productionStatistics';
import employeeStatisticsStyles from './EmployeeStatistics.module.css';
import styles from './ManagementStatistics.module.css';

export default function ManagementStatistics() {
  const [{ year: initialYear, month: initialMonth }] = useState(currentProductionMonth);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [mode, setMode] = useState('all');
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeesError, setEmployeesError] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsNavigationId, setDetailsNavigationId] = useState(0);
  const autoLoadRequested = useRef(true);
  const monthRequestId = useRef(0);
  const detailsRequestId = useRef(0);
  const detailsPanelRef = useRef(null);

  useEffect(() => {
    let active = true;
    productionApi.managementStatisticsEmployees()
      .then(({ employees: list }) => { if (active) setEmployees(list || []); })
      .catch(() => { if (active) setEmployeesError('فهرست کارکنان دریافت نشد. صفحه را دوباره باز کنید.'); });
    return () => { active = false; };
  }, []);

  const days = useMemo(() => stats ? productionMonthDays(stats.year, stats.month, stats.daily) : [], [stats]);
  const selectedEmployeeId = mode === 'employee' ? employeeId : null;

  const clearResults = () => {
    monthRequestId.current += 1;
    detailsRequestId.current += 1;
    setStats(null); setSelectedDate(''); setDetails(null); setDetailsLoading(false); setDetailsError(''); setError(''); setLoading(false);
  };
  const changeMode = (value) => { if (value === mode) return; autoLoadRequested.current = true; setMode(value); clearResults(); };
  const changeEmployee = (value) => { if (value === employeeId) return; autoLoadRequested.current = true; setEmployeeId(value); clearResults(); };
  const changeYear = (value) => { setYear(value); clearResults(); };
  const changeMonth = (value) => { setMonth(value); clearResults(); };

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
    if (mode === 'employee' && !employeeId) { setError('ابتدا یک کارمند انتخاب کنید.'); return; }
    const requestId = ++monthRequestId.current;
    detailsRequestId.current += 1;
    const today = currentProductionDate();
    const todayIsInSelectedMonth = Number(today.slice(0, 4)) === Number(year) && Number(today.slice(4, 6)) === Number(month);
    const dateToSelect = todayIsInSelectedMonth ? today : '';
    setLoading(true); setError(''); setSelectedDate(''); setDetails(null); setDetailsLoading(false); setDetailsError(''); setStats(null);
    try {
      const monthStats = await productionApi.managementMonthStatistics(year, month, selectedEmployeeId);
      if (requestId !== monthRequestId.current) return;
      setStats(monthStats);
      if (dateToSelect) {
        setSelectedDate(dateToSelect);
        await loadDayDetails(dateToSelect, selectedEmployeeId);
      }
    }
    catch (err) { if (requestId === monthRequestId.current) setError(err instanceof ApiError ? err.message : 'دریافت آمار تولید انجام نشد.'); }
    finally { if (requestId === monthRequestId.current) setLoading(false); }
  }, [employeeId, loadDayDetails, mode, month, selectedEmployeeId, year]);

  useEffect(() => {
    if (!autoLoadRequested.current) return;
    autoLoadRequested.current = false;
    if (mode === 'employee' && !employeeId) return;
    loadMonth();
  }, [employeeId, loadMonth, mode]);

  useEffect(() => {
    if (detailsNavigationId > 0) detailsPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [detailsNavigationId]);

  const selectDay = (day) => {
    setSelectedDate(day.date);
    setDetailsNavigationId((current) => current + 1);
    loadDayDetails(day.date, selectedEmployeeId);
  };

  return <div className={`${employeeStatisticsStyles.root} ${styles.root} employee-statistics`}>
    <header><div><span>گزارش تولید کارکنان</span><h1>آمار تولید</h1></div>{stats && <strong>{fa(stats.total)} <small>عدد</small></strong>}</header>
    <div className="statistics-mode" role="group" aria-label="نمایش آمار">
      <button type="button" className={mode === 'all' ? 'active' : ''} onClick={() => changeMode('all')}>همه کارکنان</button>
      <button type="button" className={mode === 'employee' ? 'active' : ''} onClick={() => changeMode('employee')}>یک کارمند</button>
    </div>
    <ProductionMonthControls year={year} month={month} onYearChange={changeYear} onMonthChange={changeMonth} onView={loadMonth} loading={loading}>
      {mode === 'employee' && <label className="statistics-employee-select">کارمند<select value={employeeId} onChange={(event) => changeEmployee(event.target.value)}><option value="">انتخاب کارمند...</option>{employees.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.name}{employee.disabled ? ' (غیرفعال)' : ''}</option>)}</select></label>}
    </ProductionMonthControls>
    {employeesError && <div className="statistics-message error">{employeesError}</div>}
    {error && <div className="statistics-message error">{error}</div>}
    {!stats && !loading && !error && <div className="statistics-message"><i className="fa-solid fa-chart-column" /><p>{mode === 'employee' && !employeeId ? 'برای دیدن آمار، یک کارمند را انتخاب کنید.' : 'بازه گزارش را انتخاب کنید، سپس «نمایش آمار» را بزنید.'}</p></div>}
    {loading && <div className="statistics-message"><i className="fa-solid fa-spinner fa-spin" /><p>در حال محاسبه آمار...</p></div>}
    {stats && <>
      <section className="statistics-chart-card glass-card"><ProductionBarChart days={days} selectedDate={selectedDate} onSelect={selectDay} /></section>
      {mode === 'all' && <section className="statistics-comparison glass-card"><div className="statistics-card-title"><div><h2>تولید هر کارمند</h2><p>جمع تولید ثبت‌شده در این ماه</p></div></div>{stats.byEmployee.length ? stats.byEmployee.map((row) => <div className="statistics-employee-row" key={row.employeeUserId}><span>{row.employeeName}</span><div className="statistics-employee-meter"><span style={{ width: `${stats.total ? row.quantity / stats.total * 100 : 0}%` }} /></div><strong>{fa(row.quantity)} عدد</strong></div>) : <p className="statistics-no-production">در این ماه تولیدی ثبت نشده است.</p>}</section>}
      <div ref={detailsPanelRef}><ProductionDayDetails date={selectedDate} details={details} loading={detailsLoading} error={detailsError} showEmployee={mode === 'all'} /></div>
    </>}
  </div>;
}
