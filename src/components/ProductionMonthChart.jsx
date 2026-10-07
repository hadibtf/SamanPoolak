import React, { useEffect, useRef, useState } from 'react';
import { productionBarHeight, productionFa, productionFaYear } from '../productionStatistics';
import styles from './ProductionBarChart.module.css';

export default function ProductionMonthChart({ months, selectedMonth, onSelect }) {
  const [hoveredMonth, setHoveredMonth] = useState(null);
  const selectedBarRef = useRef(null);
  const max = Math.max(1, ...months.map((month) => Number(month.quantity || 0)));

  useEffect(() => {
    selectedBarRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [months, selectedMonth]);

  return <div className={styles['production-chart']} aria-label="نمودار تولید ماهانه">
    <div className={styles['chart-y-label']}>تعداد</div>
    <div className={styles['chart-viewport']}>
      <div className={styles['chart-scale']} aria-hidden="true"><span>{productionFa(max)}</span><span>{productionFa(max / 2)}</span></div>
      <div className={styles['chart-scroll']}>
        <div className={`${styles['chart-grid']} ${styles['month-chart-grid']}`} style={{ '--month-count': months.length }}>
          <div className={`${styles['chart-guide']} ${styles['chart-guide-top']}`} />
          <div className={`${styles['chart-guide']} ${styles['chart-guide-mid']}`} />
          <div className={`${styles['chart-bars']} ${styles['month-chart-bars']}`}>
            {months.map((month) => {
              const active = Number(month.month) === Number(selectedMonth);
              const showTip = hoveredMonth === month.month || (!hoveredMonth && active);
              const height = productionBarHeight(month.quantity, max);
              const label = `${month.name} ${productionFaYear(month.year)}`;
              return <button
                key={month.month}
                ref={active ? selectedBarRef : null}
                type="button"
                className={`${styles['chart-bar']} ${active ? styles.selected : ''}`}
                style={{ '--bar-height': `${height}px` }}
                onClick={() => onSelect(month)}
                onMouseEnter={() => setHoveredMonth(month.month)}
                onMouseLeave={() => setHoveredMonth(null)}
                onFocus={() => setHoveredMonth(month.month)}
                onBlur={() => setHoveredMonth(null)}
                aria-label={`${label}: ${productionFa(month.quantity)} عدد`}
              >
                {showTip && <span className={styles['chart-tooltip']} aria-hidden="true">{productionFa(month.quantity)} عدد</span>}
                <span className={styles['chart-bar-fill']} />
                <span className={styles['chart-month']}>{month.name}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>
    <div className={styles['chart-x-label']}>ماه‌های سال</div>
  </div>;
}
