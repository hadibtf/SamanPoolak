import React from 'react';
import { Outlet } from 'react-router-dom';
import SegmentedTabs from '../components/SegmentedTabs';
import styles from './Management.module.css';

const Management = () => {
  return (
    <div className={`${styles.root} orders-container`}>
      <div className="orders-header">
        <h1>مدیریت</h1>
        <SegmentedTabs className={styles.mainTabs} role="navigation" label="بخش‌های مدیریت" items={[
          { value: 'new', label: 'ثبت سفارش', icon: 'fa-solid fa-circle-plus', to: '/orders', end: true },
          { value: 'orders', label: 'سفارشات', icon: 'fa-solid fa-box', to: '/orders/list' },
          { value: 'inquiries', label: 'درخواست‌ها', icon: 'fa-solid fa-inbox', to: '/orders/inquiries' },
          { value: 'issue-notes', label: 'برگه خروج', icon: 'fa-solid fa-file-export', to: '/orders/issue-notes' },
        ]} />
      </div>

      <div className="orders-body">
        <Outlet />
      </div>
    </div>
  );
};

export default Management;
