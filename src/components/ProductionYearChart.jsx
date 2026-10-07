import React, { useEffect, useRef, useState } from 'react';
import { productionBarHeight, productionFa, productionFaYear } from '../productionStatistics';
import styles from './ProductionBarChart.module.css';

export default function ProductionYearChart({ years, selectedYear, onSelect }) {
  const [hoveredYear, setHoveredYear] = useState(null);
  const selectedBarRef = useRef(null);
  const max = Math.max(1, ...years.map((year) => Number(year.quantity) || 0));

  useEffect(() => {
    selectedBarRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [years, selectedYear]);

  return <div className={styles['production-chart']} aria-label="نمودار تولید سالانه">
    <div className={styles['chart-y-label']}>تعداد</div>
    <div className={styles['chart-viewport']}>
      <div className={styles['chart-scale']} aria-hidden="true"><span>{productionFa(max)}</span><span>{productionFa(max / 2)}</span></div>
      <div className={styles['chart-scroll']}>
        <div className={`${styles['chart-grid']} ${styles['year-chart-grid']}`} style={{ '--year-count': years.length }}>
          <div className={`${styles['chart-guide']} ${styles['chart-guide-top']}`} />
          <div className={`${styles['chart-guide']} ${styles['chart-guide-mid']}`} />
          <div className={`${styles['chart-bars']} ${styles['year-chart-bars']}`}>
            {years.map((year) => {
              const active = Number(year.year) === Number(selectedYear);
              const hovered = Number(year.year) === Number(hoveredYear);
              const showTip = hovered || (!hoveredYear && active);
              const height = productionBarHeight(year.quantity, max);
              const label = productionFaYear(year.year);
              return <button
                key={year.year}
                ref={active ? selectedBarRef : null}
                type="button"
                className={`${styles['chart-bar']} ${styles['year-chart-bar']} ${active ? styles.selected : ''}`}
                style={{ '--bar-height': `${height}px` }}
                onClick={() => onSelect(year)}
                onMouseEnter={() => setHoveredYear(year.year)}
                onMouseLeave={() => setHoveredYear(null)}
                onFocus={() => setHoveredYear(year.year)}
                onBlur={() => setHoveredYear(null)}
                aria-label={`${label}: ${productionFa(year.quantity)} عدد`}
              >
                {showTip && <span className={styles['chart-tooltip']} aria-hidden="true">{productionFa(year.quantity)} عدد</span>}
                <span className={`${styles['chart-bar-fill']} ${styles['year-chart-fill']}`} />
                <span className={styles['year-chart-label']}>{label}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>
    <div className={styles['chart-x-label']}>سال‌های تولید</div>
  </div>;
}
