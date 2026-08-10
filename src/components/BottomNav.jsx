import React from 'react';
import { NavLink } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';

const BottomNav = () => {
  const navItems = [
    { to: '/payroll', label: 'حقوق', icon: 'fa-calculator' },
    { to: '/expenses', label: 'هزینه‌ها', icon: 'fa-wallet' },
    { to: '/orders', label: 'سفارشات', icon: 'fa-box-open' },
    { to: '/people', label: 'افراد', icon: 'fa-users' },
    { to: '/inquiries', label: 'درخواست‌ها', icon: 'fa-inbox' },
    { to: '/job-applications', label: 'استخدام', icon: 'fa-id-card-clip' },
    { to: '/settings', label: 'تنظیمات', icon: 'fa-gear' },
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
