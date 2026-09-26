import React, { useState } from 'react';
import './ProductionBarChart.css';

const fa = (value) => Number(value || 0).toLocaleString('fa-IR');

export default function ProductionBarChart({ days, selectedDate, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(1, ...days.map((day) => Number(day.quantity || 0)));
  const tooltipDay = days.find((day) => day.date === hovered) || days.find((day) => day.date === selectedDate);

  return <div className="production-chart" aria-label="نمودار تولید روزانه">
    <div className="chart-y-label">تعداد تولید</div>
    {tooltipDay && <div className="chart-tooltip" role="status"><b>{tooltipDay.label}</b><span>{fa(tooltipDay.quantity)} عدد</span></div>}
    <div className="chart-scroll">
      <div className="chart-grid" style={{ '--day-count': days.length }}>
        <div className="chart-guide chart-guide-top"><span>{fa(max)}</span></div>
        <div className="chart-guide chart-guide-mid"><span>{fa(max / 2)}</span></div>
        <div className="chart-bars">
          {days.map((day) => {
            const active = day.date === selectedDate;
            const height = day.quantity ? Math.max(5, (day.quantity / max) * 100) : 2;
            return <button key={day.date} type="button" className={`chart-bar ${active ? 'selected' : ''}`} onClick={() => onSelect(day)} onMouseEnter={() => setHovered(day.date)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(day.date)} onBlur={() => setHovered(null)} aria-label={`${day.label}: ${fa(day.quantity)} عدد`}>
              <span className="chart-bar-fill" style={{ height: `${height}%` }} />
              <span className="chart-day">{fa(day.day)}</span>
            </button>;
          })}
        </div>
      </div>
    </div>
    <div className="chart-x-label">روز ماه</div>
  </div>;
}
