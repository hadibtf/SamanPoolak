import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './Orders.css';

const Orders = () => {
  return (
    <div className="orders-container">
      <div className="orders-header">
        <h1>سفارشات</h1>
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
            لیست سفارشات
          </NavLink>
        </div>
      </div>

      <div className="orders-body">
        <Outlet />
      </div>
    </div>
  );
};

export default Orders;
