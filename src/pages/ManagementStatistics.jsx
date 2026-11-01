import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ProductionBarChart from '../components/ProductionBarChart';
import ProductionMonthChart from '../components/ProductionMonthChart';
import ProductionYearChart from '../components/ProductionYearChart';
import { EmployeeProductionRecord } from '../components/ProductionDayDetails';
import ProductionMonthControls from '../components/ProductionMonthControls';
import { productionApi, ApiError } from '../api/client';
import { currentProductionDate, currentProductionMonth, productionFa as fa, productionFaYear, productionMonthDays, PRODUCTION_CHART_YEARS, PRODUCTION_MONTHS } from '../productionStatistics';
import employeeStatisticsStyles from './EmployeeStatistics.module.css';
import styles from './ManagementStatistics.module.css';
import SegmentedTabs from '../components/SegmentedTabs';

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

const employeeIdentityKey = (employee) => {
  if (employee.employeePersonId != null && employee.employeePersonId !== '') return `person:${employee.employeePersonId}`;
  if (employee.employeeUserId != null) return `user:${employee.employeeUserId}`;
  return `name:${employee.employeeName || '—'}`;
};

const productionEmployeeTotals = (employees = []) => {
  const totals = new Map();
  employees.forEach((employee) => {
    const quantity = Number(employee.quantity) || 0;
    if (quantity <= 0) return;
    const employeeKey = employeeIdentityKey(employee);
    const existing = totals.get(employeeKey);
    if (existing) existing.quantity += quantity;
    else totals.set(employeeKey, { ...employee, employeeKey, quantity });
  });
  return [...totals.values()].sort((a, b) => b.quantity - a.quantity);
};

const recordsForEmployee = (records, employeeKey) => (records || [])
  .filter((record) => employeeIdentityKey(record) === employeeKey);

function StatisticsSummaryCard({ title, total }) {
  return <section className={`${styles.monthTotal} glass-card`} aria-label="خلاصه تولید">
    <div className={styles.summaryPeriod}>
      <span className={styles.summaryIcon} aria-hidden="true"><i className="fa-regular fa-calendar" /></span>
      <h2>{title}</h2>
    </div>
    <div className={styles.summaryQuantity}>
      <span className={styles.summaryIcon} aria-hidden="true"><i className="fa-solid fa-cube" /></span>
      <span className={styles.summaryValue}>
        <small>تعداد کل</small>
        <strong>{fa(total)} <small>عدد</small></strong>
      </span>
    </div>
  </section>;
}

function ManagementEmployeeRow({ employee, maxProduction, records = [], expanded, onToggle, rank = 0 }) {
  const detailsId = `statistics-employee-details-${useId()}`;
  const hasDetails = records.length > 0;
  const percentage = maxProduction ? Math.min(100, Math.round(employee.quantity / maxProduction * 100)) : 0;
  const content = <>
    <span className={styles.employeeIdentity}>
      <span className={styles.employeeIcon} aria-hidden="true"><i className={rank === 0 ? 'fa-solid fa-bullseye' : 'fa-regular fa-user'} /></span>
      <span className={styles.employeeName}>{employee.employeeName}</span>
    </span>
    <span className={styles.employeeProgress}>
      <span className="statistics-employee-meter" role="progressbar" aria-label={`تولید ${employee.employeeName} نسبت به بیشترین تولید این بازه`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentage}>
        <span style={{ width: `${percentage}%` }} />
      </span>
    </span>
    <span className={styles.employeeCount}><strong>{fa(employee.quantity)}</strong><small>عدد</small></span>
  </>;

  return <div className="statistics-employee-entry">
    {hasDetails ? <button
      type="button"
      className="statistics-employee-row"
      aria-expanded={expanded}
      aria-controls={detailsId}
      onClick={onToggle}
    >
      {content}
      <span className={styles.employeeToggle} aria-hidden="true"><i className="fa-solid fa-chevron-down" /></span>
    </button> : <div className="statistics-employee-row statistics-employee-row-static">{content}</div>}
    {hasDetails && <div
      id={detailsId}
      className={`statistics-employee-panel${expanded ? ' open' : ''}`}
      aria-hidden={!expanded}
    >
      <div className="statistics-employee-panel-inner" inert={!expanded}>
        <div className="statistics-details statistics-employee-records">
          {records.map((record) => <EmployeeProductionRecord key={record.id} record={record} linkToOrder showStatus showItemIcon />)}
        </div>
      </div>
    </div>}
  </div>;
}

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
  const [expandedEmployeeKey, setExpandedEmployeeKey] = useState(null);
  const initialLoadStarted = useRef(false);
  const monthRequestId = useRef(0);
  const detailsRequestId = useRef(0);
  const detailsPanelRef = useRef(null);
  const monthTabsRef = useRef(null);
  const monthTabsDragRef = useRef(null);
  const suppressMonthClickRef = useRef(false);

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
  const dailyEmployeeTotals = useMemo(() => productionEmployeeTotals(details?.records || []), [details]);
  const dailyMaxProduction = dailyEmployeeTotals.reduce((max, employee) => Math.max(max, employee.quantity), 0);
  const monthlyEmployeeTotals = useMemo(() => productionEmployeeTotals(stats?.byEmployee || []), [stats]);
  const monthlyMaxProduction = monthlyEmployeeTotals.reduce((max, employee) => Math.max(max, Number(employee.quantity) || 0), 0);
  const yearlyEmployeeTotals = useMemo(() => productionEmployeeTotals(stats?.yearByEmployee || []), [stats]);
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
    setExpandedEmployeeKey(null);
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
    if (detailsNavigationId > 0 && (details || detailsError)) {
      detailsPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }, [detailsNavigationId, details, detailsError]);

  useEffect(() => {
    if (view !== 'day') return;
    monthTabsRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [view]);

  const selectDay = (day) => {
    setSelectedDate(day.date);
    setExpandedEmployeeKey(null);
    setDetailsNavigationId((current) => current + 1);
    loadDayDetails(day.date);
  };

  const selectDayMonth = (nextMonth) => {
    const selectedMonth = Number(nextMonth);
    if (selectedMonth === Number(month)) return;
    setDetailsNavigationId(0);
    setMonth(selectedMonth);
    loadMonth(true, selectedMonth, year);
  };

  const startMonthTabsDrag = (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    suppressMonthClickRef.current = false;
    monthTabsDragRef.current = { pointerId: event.pointerId, startX: event.clientX, lastX: event.clientX, moved: false };
    event.target.setPointerCapture?.(event.pointerId);
  };

  const moveMonthTabsDrag = (event) => {
    const drag = monthTabsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const monthTabs = monthTabsRef.current?.querySelector('[role="group"]');
    if (!monthTabs) return;
    if (!drag.moved && Math.abs(event.clientX - drag.startX) <= 4) return;
    drag.moved = true;
    const deltaX = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    if (deltaX) monthTabs.scrollBy({ left: deltaX });
    monthTabs.classList.add(styles.monthTabsDragging);
    event.preventDefault();
  };

  const finishMonthTabsDrag = (event, suppressClick = true) => {
    const drag = monthTabsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved && suppressClick) suppressMonthClickRef.current = true;
    monthTabsDragRef.current = null;
    monthTabsRef.current?.querySelector('[role="group"]')?.classList.remove(styles.monthTabsDragging);
  };

  const cancelMonthTabsDrag = (event) => finishMonthTabsDrag(event, false);

  const suppressDraggedMonthClick = (event) => {
    if (!suppressMonthClickRef.current) return;
    suppressMonthClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const selectMonth = (monthBar) => {
    setExpandedEmployeeKey(null);
    setMonth(monthBar.month);
    setView('month');
    loadMonth(false, monthBar.month);
  };

  const selectYear = (yearBar) => {
    setExpandedEmployeeKey(null);
    setYear(yearBar.year);
    loadMonth(false, month, yearBar.year);
  };

  const changeView = (nextView) => {
    if (nextView === view) return;
    setExpandedEmployeeKey(null);
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
    <SegmentedTabs className={styles.viewTabs} label="بازه آمار تولید" value={view} onChange={changeView} items={[
      { value: 'day', label: 'روز', icon: 'fa-solid fa-calendar-day', id: 'management-statistics-day-tab', controls: 'management-statistics-panel' },
      { value: 'month', label: 'ماه', icon: 'fa-solid fa-calendar', id: 'management-statistics-month-tab', controls: 'management-statistics-panel' },
      { value: 'year', label: 'سال', icon: 'fa-solid fa-calendar-days', id: 'management-statistics-year-tab', controls: 'management-statistics-panel' },
    ]} />

    <div id="management-statistics-panel" className={styles.panel} role="tabpanel" aria-labelledby={`management-statistics-${view}-tab`}>
      {view === 'month' && <ProductionMonthControls year={year} month={month} onYearChange={setYear} onMonthChange={setMonth} onView={() => loadMonth(false)} loading={loading} />}
      {view === 'year' && <ProductionMonthControls year={year} month={month} onYearChange={setYear} onMonthChange={setMonth} onView={() => loadMonth(false)} loading={loading} yearOnly yearOptions={PRODUCTION_CHART_YEARS} />}
      {view === 'day' && <div
        ref={monthTabsRef}
        onPointerDown={startMonthTabsDrag}
        onPointerMove={moveMonthTabsDrag}
        onPointerUp={finishMonthTabsDrag}
        onPointerCancel={cancelMonthTabsDrag}
        onClickCapture={suppressDraggedMonthClick}
      >
        <SegmentedTabs
          className={styles.monthTabs}
          role="group"
          label="ماه آمار تولید"
          value={month}
          onChange={selectDayMonth}
          items={PRODUCTION_MONTHS.map((name, index) => ({ value: index + 1, label: name }))}
        />
      </div>}
      {error && <div className="statistics-message error">{error}</div>}
      {!statsMatchSelection && !loading && !error && <div className="statistics-message"><i className="fa-solid fa-chart-column" /><p>برای نمایش آمار، بازه را انتخاب کنید.</p></div>}
      {loading && <div className="statistics-message"><i className="fa-solid fa-spinner fa-spin" /><p>در حال محاسبه آمار...</p></div>}

      {statsMatchSelection && view === 'day' && <>
        <section className="statistics-chart-card glass-chart-card glass-card"><ProductionBarChart days={days} selectedDate={selectedDate} onSelect={selectDay} /></section>
        {selectedDate && details &&
          <StatisticsSummaryCard title={`تولید روز ${fa(Number(selectedDate.slice(6, 8)))} ${PRODUCTION_MONTHS[Number(selectedDate.slice(4, 6)) - 1]} ${productionFaYear(selectedDate.slice(0, 4))}`} total={details.total} />
        }
        {selectedDate && <section ref={detailsPanelRef} className="statistics-comparison glass-card">
          {detailsLoading && <div className="detail-state">در حال دریافت جزئیات تولید...</div>}
          {detailsError && <div className="detail-state error">{detailsError}</div>}
          {details && dailyEmployeeTotals.length ? dailyEmployeeTotals.map((employee, index) => <ManagementEmployeeRow
            key={employee.employeeKey}
            rank={index}
            employee={employee}
            maxProduction={dailyMaxProduction}
            records={recordsForEmployee(details.records, employee.employeeKey)}
            expanded={expandedEmployeeKey === employee.employeeKey}
            onToggle={() => setExpandedEmployeeKey((current) => current === employee.employeeKey ? null : employee.employeeKey)}
          />) : details && <p className="statistics-no-production">در این روز تولیدی ثبت نشده است.</p>}
        </section>}
      </>}

      {statsMatchSelection && view === 'month' && <>
        <section className="statistics-chart-card glass-chart-card glass-card"><ProductionMonthChart months={monthlyBars} selectedMonth={stats.month} onSelect={selectMonth} /></section>
        <StatisticsSummaryCard title={`تولید ${PRODUCTION_MONTHS[stats.month - 1]} ${productionFaYear(stats.year)}`} total={stats.total} />
        <section className="statistics-comparison glass-card">
          {monthlyEmployeeTotals.length ? monthlyEmployeeTotals.map((employee, index) => <ManagementEmployeeRow
            key={employee.employeeKey}
            rank={index}
            employee={employee}
            maxProduction={monthlyMaxProduction}
            records={recordsForEmployee(stats.records, employee.employeeKey)}
            expanded={expandedEmployeeKey === employee.employeeKey}
            onToggle={() => setExpandedEmployeeKey((current) => current === employee.employeeKey ? null : employee.employeeKey)}
          />) : <p className="statistics-no-production">در این ماه تولیدی ثبت نشده است.</p>}
        </section>
      </>}

      {statsMatchSelection && view === 'year' && <>
        <section className="statistics-chart-card glass-chart-card glass-card"><ProductionYearChart years={yearlyBars} selectedYear={stats.year} onSelect={selectYear} /></section>
        <StatisticsSummaryCard title={`تولید سال ${productionFaYear(stats.year)}`} total={yearlyTotal} />
        <section className="statistics-comparison glass-card">
          {yearlyEmployeeTotals.length ? yearlyEmployeeTotals.map((employee, index) => <ManagementEmployeeRow
            key={employee.employeeKey}
            rank={index}
            employee={employee}
            maxProduction={yearlyMaxProduction}
          />) : <p className="statistics-no-production">در این سال تولیدی ثبت نشده است.</p>}
        </section>
      </>}
    </div>
  </div>;
}
