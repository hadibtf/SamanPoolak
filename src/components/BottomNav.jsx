import React, { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import styles from './FloatingNav.module.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

const BottomNav = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navRef = useRef(null);
  const [indicator, setIndicator] = useState(null);
  const navItems = [
    { to: '/payroll', label: 'منابع انسانی', icon: 'fa-calculator' },
    { to: '/expenses', label: 'هزینه‌ها', icon: 'fa-wallet' },
    { to: '/orders', label: 'مدیریت', icon: 'fa-box-open' },
    ...(user?.role === 'admin' ? [{ to: '/statistics', label: 'آمار تولید', icon: 'fa-chart-column' }] : []),
    { to: '/settings', label: user?.role === 'admin' ? 'تنظیمات' : 'تنظیمات و اطلاعات', icon: 'fa-gear' },
  ];

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;

    const activeLink = nav.querySelector('[aria-current="page"]');
    if (!activeLink) {
      setIndicator(null);
      return undefined;
    }

    const updateIndicator = () => {
      const navRect = nav.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();
      setIndicator({
        left: linkRect.left - navRect.left,
        top: linkRect.top - navRect.top,
        width: linkRect.width,
        height: linkRect.height,
      });
    };

    updateIndicator();
    const resizeObserver = new ResizeObserver(updateIndicator);
    resizeObserver.observe(nav);
    resizeObserver.observe(activeLink);
    return () => resizeObserver.disconnect();
  }, [location.pathname, user?.role]);

  return (
    <nav
      ref={navRef}
      className={`${styles['floating-nav']} ${styles['management-nav']}`}
      aria-label="ناوبری اصلی"
      dir="rtl"
      style={{ '--nav-count': navItems.length, '--nav-max-width': '1920px' }}
    >
      {indicator && <span className={styles['management-nav-indicator']} style={indicator} aria-hidden="true" />}
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `${styles['floating-nav-item']} ${isActive ? styles.active : ''}`}
          title={item.label}
        >
          <i className={`fa-solid ${item.icon}`} aria-hidden="true"></i>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default BottomNav;
