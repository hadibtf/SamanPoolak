import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './Management.css';

const Management = () => {
  return (
    <div className="orders-container">
      <div className="orders-header">
        <h1>مدیریت</h1>
        <div className="segmented-control">
          <NavLink
            to="/orders"
            end
            className={({ isActive }) => `segment ${isActive ? 'active' : ''}`}
          >
            ثبت سفارش
          </NavLink>
          <NavLink
            to="/orders/list"
            className={({ isActive }) => `segment ${isActive ? 'active' : ''}`}
          >
            سفارشات
          </NavLink>
          <NavLink
            to="/orders/inquiries"
            className={({ isActive }) => `segment ${isActive ? 'active' : ''}`}
          >
            درخواست‌ها
          </NavLink>
          <NavLink to="/orders/issue-notes" className={({ isActive }) => `segment ${isActive ? 'active' : ''}`}>
            برگه خروج
          </NavLink>
        </div>
      </div>

      <div className="orders-body">
        <Outlet />
      </div>
    </div>
  );
};

export default Management;
