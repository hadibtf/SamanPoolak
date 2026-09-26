import React, { useState } from 'react';
import { productionBarHeight } from '../productionStatistics';
import './ProductionBarChart.css';

const fa = (value) => Number(value || 0).toLocaleString('fa-IR');

export default function ProductionBarChart({ days, selectedDate, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(1, ...days.map((day) => Number(day.quantity || 0)));

  return <div className="production-chart" aria-label="نمودار تولید روزانه">
    <div className="chart-y-label">تعداد تولید</div>
    <div className="chart-viewport">
      <div className="chart-scale" aria-hidden="true"><span>{fa(max)}</span><span>{fa(max / 2)}</span></div>
      <div className="chart-scroll">
        <div className="chart-grid" style={{ '--day-count': days.length }}>
          <div className="chart-guide chart-guide-top" />
          <div className="chart-guide chart-guide-mid" />
          <div className="chart-bars">
            {days.map((day) => {
              const active = day.date === selectedDate;
              const showTip = hovered === day.date || (!hovered && active);
              const height = productionBarHeight(day.quantity, max);
              return <button key={day.date} type="button" className={`chart-bar ${active ? 'selected' : ''}`} style={{ '--bar-height': `${height}px` }} onClick={() => onSelect(day)} onMouseEnter={() => setHovered(day.date)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(day.date)} onBlur={() => setHovered(null)} aria-label={`${day.label}: ${fa(day.quantity)} عدد`}>
                {showTip && <span className="chart-tooltip" aria-hidden="true">{fa(day.quantity)} عدد</span>}
                <span className="chart-bar-fill" />
                <span className="chart-day">{fa(day.day)}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>
    <div className="chart-x-label">روز ماه</div>
  </div>;
}
