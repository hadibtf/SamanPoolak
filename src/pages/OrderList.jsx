import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import JalaliDatePicker from '../components/JalaliDatePicker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { db, jalaliDateKey, deriveOrderStatus } from '../db';
import { ordersApi, ApiError } from '../api/client';
import { ORDER_STATES, PLATING_LABELS } from '../constants';
import styles from './Management.module.css';

const READY_STATE_INDEX = ORDER_STATES.findIndex((state) => state.value === 'READY');

const isOrderItemDone = (item) => {
  const stateIndex = ORDER_STATES.findIndex((state) => state.value === item.state);
  return stateIndex >= READY_STATE_INDEX;
};

const formatItemNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('fa-IR') : value;
};

const OrderList = () => {
  const navigate = useNavigate();
  const [fOrderNumber, setFOrderNumber] = useState('');
  const [fCustomer, setFCustomer] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [fFrom, setFFrom] = useState(null);
  const [fTo, setFTo] = useState(null);
  const [statusTab, setStatusTab] = useState('in-progress');

  const orders = useLiveQuery(() => db.orders.orderBy('id').reverse().toArray(), []);
  const people = useLiveQuery(() => db.people.toArray(), []);
  const companyByCustomerId = useMemo(
    () => new Map((people || []).map((person) => [String(person.id), person.companyName?.trim() || ''])),
    [people]
  );

  const fromKey = useMemo(() => jalaliDateKey(fFrom), [fFrom]);
  const toKey = useMemo(() => jalaliDateKey(fTo), [fTo]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    const on = fOrderNumber.trim();
    const cust = fCustomer.trim();
    const prod = fProduct.trim();

    return orders.filter((o) => {
      if (on && !o.orderNumber.includes(on)) return false;
      if (cust && !(o.customerName || '').includes(cust)) return false;
      // product filter matches across any item in the order
      if (prod && !(o.items || []).some((it) => (it.productName || '').includes(prod))) return false;
      // date is the sortable YYYYMMDD string — range compare works lexically.
      if (fromKey && (!o.date || o.date < fromKey)) return false;
      if (toKey && (!o.date || o.date > toKey)) return false;
      return true;
    });
  }, [orders, fOrderNumber, fCustomer, fProduct, fromKey, toKey]);

  const completedOrders = useMemo(() => filtered.filter((order) => deriveOrderStatus(order).done), [filtered]);
  const inProgressOrders = useMemo(() => filtered.filter((order) => !deriveOrderStatus(order).done), [filtered]);
  const visibleOrders = statusTab === 'completed' ? completedOrders : inProgressOrders;

  const hasFilters = fOrderNumber || fCustomer || fProduct || fFrom || fTo;

  const clearFilters = () => {
    setFOrderNumber('');
    setFCustomer('');
    setFProduct('');
    setFFrom(null);
    setFTo(null);
  };

  const formatDate = (dateKey) => {
    if (!dateKey || dateKey.length !== 8) return '—';
    return `${dateKey.slice(0, 4)}/${dateKey.slice(4, 6)}/${dateKey.slice(6, 8)}`;
  };

  const handleDelete = async (e, o) => {
    e.stopPropagation();
    if (!window.confirm(`حذف سفارش #${o.orderNumber}؟`)) return;
    try {
      await ordersApi.remove(o.id);
      await db.orders.delete(o.id);
    } catch (error) {
      console.error('Failed to delete order:', error);
      window.alert(
        error instanceof ApiError && error.status === 0
          ? 'برای حذف نیاز به اتصال اینترنت دارید.'
          : 'خطا در حذف سفارش.'
      );
    }
  };

  const handleEdit = (e, o) => {
    e.stopPropagation();
    navigate(`/orders/edit/${o.id}`);
  };

  const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  return (
    <div className={`${styles.root} order-list`}>
      <div className="glass-card filter-card">
        <div className="filter-grid">
          <div className="form-group">
            <label>شماره سفارش</label>
            <input
              value={fOrderNumber}
              onChange={(e) => setFOrderNumber(e.target.value)}
              placeholder="مثال: 0503"
            />
          </div>
          <div className="form-group">
            <label>نام مشتری</label>
            <input
              value={fCustomer}
              onChange={(e) => setFCustomer(e.target.value)}
              placeholder="جستجوی مشتری..."
            />
          </div>
          <div className="form-group">
            <label>نام محصول</label>
            <input
              value={fProduct}
              onChange={(e) => setFProduct(e.target.value)}
              placeholder="جستجوی محصول..."
            />
          </div>
          <div className="form-group">
            <label>از تاریخ</label>
            <JalaliDatePicker
              value={fFrom}
              onChange={setFFrom}
              calendar={persian}
              locale={persian_fa}
              weekDays={weekDays}
              placeholder="از تاریخ"
              calendarPosition="bottom-right"
              inputClass="rmdp-input"
            />
          </div>
          <div className="form-group">
            <label>تا تاریخ</label>
            <JalaliDatePicker
              value={fTo}
              onChange={setFTo}
              calendar={persian}
              locale={persian_fa}
              weekDays={weekDays}
              placeholder="تا تاریخ"
              calendarPosition="bottom-right"
              inputClass="rmdp-input"
            />
          </div>
        </div>

        <div className="filter-footer">
          <span className="result-count">{visibleOrders.length.toLocaleString('fa-IR')} سفارش</span>
          {hasFilters && (
            <button type="button" className="clear-btn" onClick={clearFilters}>
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </div>

      <div className="order-list-status-tabs" role="group" aria-label="فیلتر وضعیت سفارش">
        <button
          type="button"
          className={statusTab === 'in-progress' ? 'active' : ''}
          aria-pressed={statusTab === 'in-progress'}
          onClick={() => setStatusTab('in-progress')}
        >
          <span>در حال انجام</span><small>{inProgressOrders.length.toLocaleString('fa-IR')}</small>
        </button>
        <button
          type="button"
          className={statusTab === 'completed' ? 'active' : ''}
          aria-pressed={statusTab === 'completed'}
          onClick={() => setStatusTab('completed')}
        >
          <span>تکمیل شده</span><small>{completedOrders.length.toLocaleString('fa-IR')}</small>
        </button>
      </div>

      <div className="orders-grid">
        {visibleOrders.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-box-open"></i>
            <p>
              {orders && orders.length === 0
                ? 'هنوز سفارشی ثبت نشده است.'
                : hasFilters
                  ? 'سفارشی با این فیلترها و وضعیت یافت نشد.'
                  : statusTab === 'completed'
                    ? 'هنوز سفارش تکمیل‌شده‌ای وجود ندارد.'
                    : 'سفارشی در حال انجام نیست.'}
            </p>
          </div>
        ) : (
          visibleOrders.map((o) => {
            const orderItems = o.items || [];
            const companyName = companyByCustomerId.get(String(o.customerId));
            return (
              <div
                key={o.id}
                className="order-card clickable"
                onClick={() => navigate(`/orders/view/${o.id}`)}
              >
                <header className="order-card-summary">
                  <div className="order-summary-parties" dir="rtl">
                    <span className="order-summary-customer" title={o.customerName || 'مشتری نامشخص'}>
                      {o.customerName || 'مشتری نامشخص'}
                    </span>
                    {companyName && (
                      <span className="order-summary-company" title={companyName}>
                        {companyName}
                      </span>
                    )}
                  </div>
                </header>

                <div className="order-card-body">
                  <div className="order-card-main">
                    <ul className="order-items" aria-label="اقلام سفارش">
                      {orderItems.length ? orderItems.map((item, index) => {
                        const done = isOrderItemDone(item);
                        const diameter = formatItemNumber(item.diameter) || '۰';
                        const thickness = formatItemNumber(item.thickness) || '۰';
                        const quantity = formatItemNumber(item.quantity);
                        const platingColor = item.platingColor === 'GOLD' || item.platingColor === 'SILVER'
                          ? item.platingColor
                          : 'NONE';
                        return (
                          <li className={`order-item ${done ? 'is-done' : ''}`} key={item.uid || index}>
                            <span className="order-item-title">{item.productName || 'بدون نام'}</span>
                            <span className="order-item-specs">
                              <bdi className="order-item-dimensions" dir="ltr">{diameter}×{thickness}</bdi>
                              {quantity && <span className="order-item-quantity">{quantity} عدد</span>}
                              <span className={`order-item-plating is-${platingColor.toLowerCase()}`}>{PLATING_LABELS[platingColor]}</span>
                            </span>
                          </li>
                        );
                      }) : (
                        <li className="order-item order-item-empty">—</li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="card-actions">
                  <button type="button" className="order-list-action" onClick={(e) => handleEdit(e, o)}>
                    <i className="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                    <span>ویرایش</span>
                  </button>
                  <button type="button" className="order-list-action danger" onClick={(e) => handleDelete(e, o)}>
                    <i className="fa-solid fa-trash" aria-hidden="true"></i>
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default OrderList;
