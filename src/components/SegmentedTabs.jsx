import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './SegmentedTabs.module.css';

/** Items: { value, label, icon?, to?, end?, badge?, id?, controls? }. */
export default function SegmentedTabs({ items, value, onChange, label, className = '', role = 'tablist', style }) {
  return (
    <div className={`${styles.root} ${className}`} role={role} aria-label={label} dir="rtl" style={style}>
      {items.map((item) => {
        const content = <>{item.icon && <i className={`${styles.icon} ${item.icon}`} aria-hidden="true" />}<span>{item.label}</span>{item.badge != null && <small className={styles.badge}>{item.badge}</small>}</>;
        if (item.to) return (
          <NavLink key={item.value} to={item.to} end={item.end} className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}>
            {content}
          </NavLink>
        );
        const active = item.value === value;
        return (
          <button key={item.value} id={item.id} type="button" role={role === 'tablist' ? 'tab' : undefined}
            aria-selected={role === 'tablist' ? active : undefined} aria-pressed={role === 'group' ? active : undefined}
            aria-controls={item.controls} className={`${styles.tab} ${active ? styles.active : ''}`}
            onClick={() => onChange(item.value)}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
