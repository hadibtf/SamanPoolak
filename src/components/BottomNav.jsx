import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import '@fortawesome/fontawesome-free/css/all.min.css';

const BottomNav = () => {
  const { user } = useAuth();
  const navItems = [
    { to: '/payroll', label: 'منابع انسانی', icon: 'fa-calculator' },
    { to: '/expenses', label: 'هزینه‌ها', icon: 'fa-wallet' },
    { to: '/orders', label: 'مدیریت', icon: 'fa-box-open' },
    ...(user?.role === 'admin' ? [{ to: '/statistics', label: 'آمار تولید', icon: 'fa-chart-column' }] : []),
    { to: '/settings', label: user?.role === 'admin' ? 'تنظیمات' : 'تنظیمات و اطلاعات', icon: 'fa-gear' },
  ];

  return (
    <nav className="glass-nav">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <i className={`fa-solid ${item.icon}`}></i>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default BottomNav;
