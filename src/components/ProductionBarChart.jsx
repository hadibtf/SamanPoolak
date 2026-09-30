import React, { useState } from 'react';
import { productionBarHeight } from '../productionStatistics';
import styles from './ProductionBarChart.module.css';

const fa = (value) => Number(value || 0).toLocaleString('fa-IR');

export default function ProductionBarChart({ days, selectedDate, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(1, ...days.map((day) => Number(day.quantity || 0)));

  return <div className={styles["production-chart"]} aria-label="نمودار تولید روزانه">
    <div className={styles["chart-y-label"]}>تعداد تولید</div>
    <div className={styles["chart-viewport"]}>
      <div className={styles["chart-scale"]} aria-hidden="true"><span>{fa(max)}</span><span>{fa(max / 2)}</span></div>
      <div className={styles["chart-scroll"]}>
        <div className={styles["chart-grid"]} style={{ '--day-count': days.length }}>
          <div className={`${styles["chart-guide"]} ${styles["chart-guide-top"]}`} />
          <div className={`${styles["chart-guide"]} ${styles["chart-guide-mid"]}`} />
          <div className={styles["chart-bars"]}>
            {days.map((day) => {
              const active = day.date === selectedDate;
              const showTip = hovered === day.date || (!hovered && active);
              const height = productionBarHeight(day.quantity, max);
              return <button key={day.date} type="button" className={`${styles["chart-bar"]} ${active ? styles.selected : ""}`} style={{ '--bar-height': `${height}px` }} onClick={() => onSelect(day)} onMouseEnter={() => setHovered(day.date)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(day.date)} onBlur={() => setHovered(null)} aria-label={`${day.label}: ${fa(day.quantity)} عدد`}>
                {showTip && <span className={styles["chart-tooltip"]} aria-hidden="true">{fa(day.quantity)} عدد</span>}
                <span className={styles["chart-bar-fill"]} />
                <span className={styles["chart-day"]}>{fa(day.day)}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>
    <div className={styles["chart-x-label"]}>روز ماه</div>
  </div>;
}
