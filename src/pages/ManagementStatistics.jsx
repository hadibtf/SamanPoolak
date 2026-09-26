import React, { useEffect, useMemo, useState } from 'react';
import ProductionBarChart from '../components/ProductionBarChart';
import ProductionMonthControls from '../components/ProductionMonthControls';
import ProductionDayDetails from '../components/ProductionDayDetails';
import { productionApi, ApiError } from '../api/client';
import { PRODUCTION_MONTHS, currentProductionMonth, productionFa as fa, productionFaYear as faYear, productionMonthDays } from '../productionStatistics';
import './EmployeeStatistics.css';
import './ManagementStatistics.css';

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

  useEffect(() => {
    let active = true;
    productionApi.managementStatisticsEmployees()
      .then(({ employees: list }) => { if (active) setEmployees(list || []); })
      .catch(() => { if (active) setEmployeesError('فهرست کارکنان دریافت نشد. صفحه را دوباره باز کنید.'); });
    return () => { active = false; };
  }, []);

  const days = useMemo(() => stats ? productionMonthDays(stats.year, stats.month, stats.daily) : [], [stats]);
  const selectedEmployeeId = mode === 'employee' ? employeeId : null;
  const selectedEmployee = employees.find((employee) => String(employee.userId) === employeeId);

  const clearResults = () => { setStats(null); setSelectedDate(''); setDetails(null); setError(''); };
  const changeMode = (value) => { setMode(value); clearResults(); };
  const changeEmployee = (value) => { setEmployeeId(value); clearResults(); };
  const changeYear = (value) => { setYear(value); clearResults(); };
  const changeMonth = (value) => { setMonth(value); clearResults(); };

  const loadMonth = async () => {
    if (mode === 'employee' && !employeeId) { setError('ابتدا یک کارمند انتخاب کنید.'); return; }
    setLoading(true); setError(''); setSelectedDate(''); setDetails(null); setStats(null);
    try { setStats(await productionApi.managementMonthStatistics(year, month, selectedEmployeeId)); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'دریافت آمار تولید انجام نشد.'); }
    finally { setLoading(false); }
  };

  const selectDay = async (day) => {
    setSelectedDate(day.date); setDetails(null); setDetailsLoading(true); setDetailsError('');
    try { setDetails(await productionApi.managementDayStatistics(day.date, stats.employeeUserId)); }
    catch (err) { setDetailsError(err instanceof ApiError ? err.message : 'دریافت جزئیات روز انجام نشد.'); }
    finally { setDetailsLoading(false); }
  };

  return <div className="employee-statistics management-statistics">
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
    {!stats && !loading && !error && <div className="statistics-message"><i className="fa-solid fa-chart-column" /><p>بازه و نوع گزارش را انتخاب کنید، سپس «نمایش آمار» را بزنید.</p></div>}
    {loading && <div className="statistics-message"><i className="fa-solid fa-spinner fa-spin" /><p>در حال محاسبه آمار...</p></div>}
    {stats && <>
      <section className="statistics-chart-card glass-card"><div className="statistics-card-title"><div><h2>{mode === 'employee' ? `${selectedEmployee?.name || 'کارمند'} · ` : ''}{PRODUCTION_MONTHS[stats.month - 1]} {faYear(stats.year)}</h2><p>برای دیدن ریز تولید، یک ستون را لمس کنید.</p></div><b>{fa(stats.total)} عدد</b></div><ProductionBarChart days={days} selectedDate={selectedDate} onSelect={selectDay} /></section>
      {mode === 'all' && <section className="statistics-comparison glass-card"><div className="statistics-card-title"><div><h2>تولید هر کارمند</h2><p>جمع تولید ثبت‌شده در این ماه</p></div></div>{stats.byEmployee.length ? stats.byEmployee.map((row) => <div className="statistics-employee-row" key={row.employeeUserId}><span>{row.employeeName}</span><div className="statistics-employee-meter"><span style={{ width: `${stats.total ? row.quantity / stats.total * 100 : 0}%` }} /></div><strong>{fa(row.quantity)} عدد</strong></div>) : <p className="statistics-no-production">در این ماه تولیدی ثبت نشده است.</p>}</section>}
    </>}
    <ProductionDayDetails date={selectedDate} details={details} loading={detailsLoading} error={detailsError} showEmployee={mode === 'all'} />
  </div>;
}
