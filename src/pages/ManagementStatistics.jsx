import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProductionBarChart from '../components/ProductionBarChart';
import ProductionDayDetails from '../components/ProductionDayDetails';
import ProductionMonthControls from '../components/ProductionMonthControls';
import { productionApi, ApiError } from '../api/client';
import { currentProductionDate, currentProductionMonth, productionFa as fa, productionFaYear, productionMonthDays, PRODUCTION_MONTHS } from '../productionStatistics';
import employeeStatisticsStyles from './EmployeeStatistics.module.css';
import styles from './ManagementStatistics.module.css';

const defaultProductionDay = (monthStats) => {
  const today = currentProductionDate();
  if (Number(today.slice(0, 4)) === Number(monthStats.year) && Number(today.slice(4, 6)) === Number(monthStats.month)) return today;

  const latestRecordedDay = (monthStats.daily || [])
    .filter((day) => Number(day.quantity) > 0)
    .map((day) => day.date)
    .sort()
    .slice(-1)[0];
  return latestRecordedDay || productionMonthDays(monthStats.year, monthStats.month, monthStats.daily)[0]?.date || '';
};

export default function ManagementStatistics() {
  const [{ year: initialYear, month: initialMonth }] = useState(currentProductionMonth);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [view, setView] = useState('day');
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

  const loadDayDetails = useCallback(async (date) => {
    const requestId = ++detailsRequestId.current;
    setDetails(null); setDetailsLoading(true); setDetailsError('');
    try {
      const result = await productionApi.managementDayStatistics(date, null);
      if (requestId === detailsRequestId.current) setDetails(result);
    } catch (err) {
      if (requestId === detailsRequestId.current) setDetailsError(err instanceof ApiError ? err.message : 'دریافت جزئیات روز انجام نشد.');
    } finally {
      if (requestId === detailsRequestId.current) setDetailsLoading(false);
    }
  }, []);

  const loadMonth = useCallback(async (selectDefaultDay = false) => {
    const requestId = ++monthRequestId.current;
    detailsRequestId.current += 1;
    setLoading(true); setError(''); setSelectedDate(''); setDetails(null); setDetailsLoading(false); setDetailsError(''); setStats(null);
    try {
      const monthStats = await productionApi.managementMonthStatistics(year, month);
      if (requestId !== monthRequestId.current) return;
      setStats(monthStats);
      if (selectDefaultDay) {
        const date = defaultProductionDay(monthStats);
        setSelectedDate(date);
        if (date) await loadDayDetails(date);
      }
    } catch (err) {
      if (requestId === monthRequestId.current) setError(err instanceof ApiError ? err.message : 'دریافت آمار تولید انجام نشد.');
    } finally {
      if (requestId === monthRequestId.current) setLoading(false);
    }
  }, [loadDayDetails, month, year]);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    loadMonth(true);
  }, [loadMonth]);

  useEffect(() => {
    if (detailsNavigationId > 0) detailsPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [detailsNavigationId]);

  const selectDay = (day) => {
    setSelectedDate(day.date);
    setDetailsNavigationId((current) => current + 1);
    loadDayDetails(day.date);
  };

  const changeView = (nextView) => {
    if (nextView === view) return;
    setView(nextView);
    if (nextView !== 'day') return;

    const loadedMonthMatches = stats && Number(stats.year) === Number(year) && Number(stats.month) === Number(month);
    if (!loadedMonthMatches) {
      loadMonth(true);
      return;
    }
    const date = defaultProductionDay(stats);
    setSelectedDate(date);
    if (date) loadDayDetails(date);
  };

  return <div className={`${employeeStatisticsStyles.root} ${styles.root} employee-statistics`}>
    <header className={styles.pageHeader}><h1>آمار تولید</h1></header>
    <div className={styles.viewTabs} role="tablist" aria-label="بازه آمار تولید" dir="rtl">
      <button id="management-statistics-day-tab" type="button" role="tab" aria-selected={view === 'day'} aria-controls="management-statistics-panel" className={`${styles.viewTab} ${view === 'day' ? styles.active : ''}`} onClick={() => changeView('day')}>روز</button>
      <button id="management-statistics-month-tab" type="button" role="tab" aria-selected={view === 'month'} aria-controls="management-statistics-panel" className={`${styles.viewTab} ${view === 'month' ? styles.active : ''}`} onClick={() => changeView('month')}>کل</button>
    </div>

    <div id="management-statistics-panel" className={styles.panel} role="tabpanel" aria-labelledby={`management-statistics-${view}-tab`}>
      {view === 'month' && <ProductionMonthControls year={year} month={month} onYearChange={setYear} onMonthChange={setMonth} onView={() => loadMonth(false)} loading={loading} />}
      {error && <div className="statistics-message error">{error}</div>}
      {!stats && !loading && !error && <div className="statistics-message"><i className="fa-solid fa-chart-column" /><p>آماری برای نمایش وجود ندارد.</p></div>}
      {loading && <div className="statistics-message"><i className="fa-solid fa-spinner fa-spin" /><p>در حال محاسبه آمار...</p></div>}

      {stats && view === 'day' && <>
        <section className="statistics-chart-card glass-card"><ProductionBarChart days={days} selectedDate={selectedDate} onSelect={selectDay} /></section>
        <div ref={detailsPanelRef}><ProductionDayDetails date={selectedDate} details={details} loading={detailsLoading} error={detailsError} showEmployee /></div>
      </>}

      {stats && view === 'month' && <>
        <section className={`${styles.monthTotal} glass-card`}>
          <div><h2>{PRODUCTION_MONTHS[stats.month - 1]} {productionFaYear(stats.year)}</h2><p>جمع تولید ثبت‌شده در این ماه</p></div>
          <strong>{fa(stats.total)} <small>عدد</small></strong>
        </section>
        <section className="statistics-comparison glass-card">
          <div className="statistics-card-title"><div><h2>تولید هر کارمند</h2><p>جمع تولید هر کارمند در این ماه</p></div></div>
          {stats.byEmployee.length ? stats.byEmployee.map((row) => <div className="statistics-employee-row" key={row.employeeUserId}>
            <span>{row.employeeName}</span>
            <div className="statistics-employee-meter"><span style={{ width: `${stats.total ? row.quantity / stats.total * 100 : 0}%` }} /></div>
            <strong>{fa(row.quantity)} عدد</strong>
          </div>) : <p className="statistics-no-production">در این ماه تولیدی ثبت نشده است.</p>}
        </section>
      </>}
    </div>
  </div>;
}
