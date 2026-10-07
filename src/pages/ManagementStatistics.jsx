import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProductionBarChart from '../components/ProductionBarChart';
import ProductionMonthChart from '../components/ProductionMonthChart';
import ProductionYearChart from '../components/ProductionYearChart';
import ProductionDayDetails from '../components/ProductionDayDetails';
import ProductionMonthControls from '../components/ProductionMonthControls';
import { productionApi, ApiError } from '../api/client';
import { currentProductionDate, currentProductionMonth, productionFa as fa, productionFaYear, productionMonthDays, PRODUCTION_CHART_YEARS, PRODUCTION_MONTHS } from '../productionStatistics';
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
  const monthlyBars = useMemo(() => {
    const totals = new Map((stats?.monthly || []).map((row) => [Number(row.month), Number(row.quantity) || 0]));
    return PRODUCTION_MONTHS.map((name, index) => ({
      month: index + 1,
      name,
      year: Number(stats?.year ?? year),
      quantity: totals.get(index + 1) || 0,
    }));
  }, [stats, year]);
  const yearlyBars = useMemo(() => {
    const totals = new Map((stats?.yearly || []).map((row) => [Number(row.year), Number(row.quantity) || 0]));
    return PRODUCTION_CHART_YEARS.map((item) => ({ year: item, quantity: totals.get(item) || 0 }));
  }, [stats]);
  const dailyEmployeeTotals = useMemo(() => {
    const totalsByEmployee = new Map();
    (details?.records || []).forEach((record) => {
      const key = String(record.employeeUserId ?? `name:${record.employeeName || '—'}`);
      if (!totalsByEmployee.has(key)) {
        totalsByEmployee.set(key, { employeeUserId: key, employeeName: record.employeeName || '—', quantity: 0 });
      }
      totalsByEmployee.get(key).quantity += Number(record.quantity) || 0;
    });
    return [...totalsByEmployee.values()].sort((a, b) => b.quantity - a.quantity);
  }, [details]);
  const dailyMaxProduction = dailyEmployeeTotals.reduce((max, employee) => Math.max(max, employee.quantity), 0);
  const monthlyEmployeeTotals = (stats?.byEmployee || []).filter((employee) => Number(employee.quantity) > 0);
  const monthlyMaxProduction = monthlyEmployeeTotals.reduce((max, employee) => Math.max(max, Number(employee.quantity) || 0), 0);
  const yearlyEmployeeTotals = (stats?.yearByEmployee || []).filter((employee) => Number(employee.quantity) > 0);
  const yearlyMaxProduction = yearlyEmployeeTotals.reduce((max, employee) => Math.max(max, Number(employee.quantity) || 0), 0);
  const yearlyTotal = yearlyBars.find((item) => item.year === Number(stats?.year))?.quantity || 0;
  const statsMatchSelection = stats
    && Number(stats.year) === Number(year)
    && (view === 'year' || Number(stats.month) === Number(month));

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

  const loadMonth = useCallback(async (selectDefaultDay = false, requestedMonth = month, requestedYear = year) => {
    const requestId = ++monthRequestId.current;
    detailsRequestId.current += 1;
    setLoading(true); setError(''); setSelectedDate(''); setDetails(null); setDetailsLoading(false); setDetailsError(''); setStats(null);
    try {
      const monthStats = await productionApi.managementMonthStatistics(requestedYear, requestedMonth);
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

  const selectMonth = (monthBar) => {
    setMonth(monthBar.month);
    setView('month');
    loadMonth(false, monthBar.month);
  };

  const selectYear = (yearBar) => {
    setYear(yearBar.year);
    loadMonth(false, month, yearBar.year);
  };

  const changeView = (nextView) => {
    if (nextView === view) return;
    setView(nextView);
    const loadedMonthMatches = stats && Number(stats.year) === Number(year) && Number(stats.month) === Number(month);
    const loadedYearMatches = stats && Number(stats.year) === Number(year);
    if (nextView === 'day') {
      if (!loadedMonthMatches) {
        loadMonth(true);
        return;
      }
      const date = defaultProductionDay(stats);
      setSelectedDate(date);
      if (date) loadDayDetails(date);
      return;
    }
    if (nextView === 'month' && !loadedMonthMatches) loadMonth(false);
    if (nextView === 'year' && !loadedYearMatches) loadMonth(false);
  };

  return <div className={`${employeeStatisticsStyles.root} ${styles.root} employee-statistics`}>
    <header className={styles.pageHeader}><h1>آمار تولید</h1></header>
    <div className={styles.viewTabs} role="tablist" aria-label="بازه آمار تولید" dir="rtl">
      <button id="management-statistics-day-tab" type="button" role="tab" aria-selected={view === 'day'} aria-controls="management-statistics-panel" className={`${styles.viewTab} ${view === 'day' ? styles.active : ''}`} onClick={() => changeView('day')}>روز</button>
      <button id="management-statistics-month-tab" type="button" role="tab" aria-selected={view === 'month'} aria-controls="management-statistics-panel" className={`${styles.viewTab} ${view === 'month' ? styles.active : ''}`} onClick={() => changeView('month')}>ماه</button>
      <button id="management-statistics-year-tab" type="button" role="tab" aria-selected={view === 'year'} aria-controls="management-statistics-panel" className={`${styles.viewTab} ${view === 'year' ? styles.active : ''}`} onClick={() => changeView('year')}>سال</button>
    </div>

    <div id="management-statistics-panel" className={styles.panel} role="tabpanel" aria-labelledby={`management-statistics-${view}-tab`}>
      {view === 'month' && <ProductionMonthControls year={year} month={month} onYearChange={setYear} onMonthChange={setMonth} onView={() => loadMonth(false)} loading={loading} />}
      {view === 'year' && <ProductionMonthControls year={year} month={month} onYearChange={setYear} onMonthChange={setMonth} onView={() => loadMonth(false)} loading={loading} yearOnly yearOptions={PRODUCTION_CHART_YEARS} />}
      {error && <div className="statistics-message error">{error}</div>}
      {!statsMatchSelection && !loading && !error && <div className="statistics-message"><i className="fa-solid fa-chart-column" /><p>برای نمایش آمار، بازه را انتخاب کنید.</p></div>}
      {loading && <div className="statistics-message"><i className="fa-solid fa-spinner fa-spin" /><p>در حال محاسبه آمار...</p></div>}

      {statsMatchSelection && view === 'day' && <>
        <section className="statistics-chart-card glass-card"><ProductionBarChart days={days} selectedDate={selectedDate} onSelect={selectDay} /></section>
        {selectedDate && details && <>
          <section className={`${styles.monthTotal} glass-card`}>
            <div><h2>تولید روز {fa(Number(selectedDate.slice(6, 8)))} {PRODUCTION_MONTHS[Number(selectedDate.slice(4, 6)) - 1]} {productionFaYear(selectedDate.slice(0, 4))}</h2></div>
            <strong>{fa(details.total)} <small>عدد</small></strong>
          </section>
          <section className="statistics-comparison glass-card">
            {dailyEmployeeTotals.length ? dailyEmployeeTotals.map((row) => <div className="statistics-employee-row" key={row.employeeUserId}>
              <span>{row.employeeName}</span>
              <div className="statistics-employee-meter"><span style={{ width: `${dailyMaxProduction ? row.quantity / dailyMaxProduction * 100 : 0}%` }} /></div>
              <strong>{fa(row.quantity)}</strong>
            </div>) : <p className="statistics-no-production">در این روز تولیدی ثبت نشده است.</p>}
          </section>
        </>}
        <div ref={detailsPanelRef}><ProductionDayDetails date={selectedDate} details={details} loading={detailsLoading} error={detailsError} showEmployee /></div>
      </>}

      {statsMatchSelection && view === 'month' && <>
        <section className="statistics-chart-card glass-card"><ProductionMonthChart months={monthlyBars} selectedMonth={stats.month} onSelect={selectMonth} /></section>
        <section className={`${styles.monthTotal} glass-card`}>
          <div><h2>تولید {PRODUCTION_MONTHS[stats.month - 1]} {productionFaYear(stats.year)}</h2></div>
          <strong>{fa(stats.total)} <small>عدد</small></strong>
        </section>
        <section className="statistics-comparison glass-card">
          {monthlyEmployeeTotals.length ? monthlyEmployeeTotals.map((row) => <div className="statistics-employee-row" key={row.employeeUserId}>
            <span>{row.employeeName}</span>
            <div className="statistics-employee-meter"><span style={{ width: `${monthlyMaxProduction ? row.quantity / monthlyMaxProduction * 100 : 0}%` }} /></div>
            <strong>{fa(row.quantity)}</strong>
          </div>) : <p className="statistics-no-production">در این ماه تولیدی ثبت نشده است.</p>}
        </section>
        <ProductionDayDetails
          date={`${stats.year}${String(stats.month).padStart(2, '0')}01`}
          details={stats}
          showEmployee
          emptyMessage="در این ماه تولیدی ثبت نشده است."
        />
      </>}

      {statsMatchSelection && view === 'year' && <>
        <section className="statistics-chart-card glass-card"><ProductionYearChart years={yearlyBars} selectedYear={stats.year} onSelect={selectYear} /></section>
        <section className={`${styles.monthTotal} glass-card`}>
          <div><h2>تولید سال {productionFaYear(stats.year)}</h2></div>
          <strong>{fa(yearlyTotal)} <small>عدد</small></strong>
        </section>
        <section className="statistics-comparison glass-card">
          {yearlyEmployeeTotals.length ? yearlyEmployeeTotals.map((row) => <div className="statistics-employee-row" key={row.employeeUserId}>
            <span>{row.employeeName}</span>
            <div className="statistics-employee-meter"><span style={{ width: `${yearlyMaxProduction ? row.quantity / yearlyMaxProduction * 100 : 0}%` }} /></div>
            <strong>{fa(row.quantity)}</strong>
          </div>) : <p className="statistics-no-production">در این سال تولیدی ثبت نشده است.</p>}
        </section>
      </>}
    </div>
  </div>;
}
