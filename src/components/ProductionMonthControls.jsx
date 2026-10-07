import React from 'react';
import { PRODUCTION_MONTHS, PRODUCTION_YEARS, productionFaYear } from '../productionStatistics';

export default function ProductionMonthControls({ year, month, onYearChange, onMonthChange, onView, loading, children, yearOnly = false, yearOptions = PRODUCTION_YEARS }) {
  return <section className={`statistics-controls glass-card${yearOnly ? ' statistics-controls-year-only' : ''}`}>
    {children}
    <label>سال<select value={year} onChange={(event) => onYearChange(Number(event.target.value))}>{yearOptions.map((item) => <option key={item} value={item}>{productionFaYear(item)}</option>)}</select></label>
    {!yearOnly && <label>ماه<select value={month} onChange={(event) => onMonthChange(Number(event.target.value))}>{PRODUCTION_MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>}
    <button type="button" onClick={() => onView()} disabled={loading}>{loading ? 'در حال دریافت...' : 'نمایش آمار'}</button>
  </section>;
}
