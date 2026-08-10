import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import JalaliDatePicker from '../components/JalaliDatePicker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { db, jalaliDateKey, deriveOrderStatus } from '../db';
import { ordersApi, ApiError } from '../api/client';
import './Orders.css';

const OrderList = () => {
  const navigate = useNavigate();
  const [fOrderNumber, setFOrderNumber] = useState('');
  const [fCustomer, setFCustomer] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [fFrom, setFFrom] = useState(null);
  const [fTo, setFTo] = useState(null);

  const orders = useLiveQuery(() => db.orders.orderBy('id').reverse().toArray(), []);

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
    <div className="order-list">
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
          <span className="result-count">{filtered.length} سفارش</span>
          {hasFilters && (
            <button type="button" className="clear-btn" onClick={clearFilters}>
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </div>

      <div className="orders-grid">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-box-open"></i>
            <p>
              {orders && orders.length === 0
                ? 'هنوز سفارشی ثبت نشده است.'
                : 'سفارشی با این فیلترها یافت نشد.'}
            </p>
          </div>
        ) : (
          filtered.map((o) => {
            const orderItems = o.items || [];
            const status = deriveOrderStatus(o);
            const names = orderItems.map((it) => it.productName).filter(Boolean);
            return (
              <div
                key={o.id}
                className="order-card clickable"
                onClick={() => navigate(`/orders/view/${o.id}`)}
              >
                <div className="order-card-head">
                  <span className="order-number">#{o.orderNumber}</span>
                  <span className={`state-pill ${status.done ? 'ready' : ''}`}>
                    {status.done
                      ? 'تکمیل شده'
                      : `${status.ready.toLocaleString('fa-IR')}/${status.total.toLocaleString('fa-IR')} آماده`}
                  </span>
                </div>

                <div className="order-card-body">
                  <div className="order-card-main">
                    <h3 className="order-product">
                      {names.length ? names.join('، ') : '—'}
                    </h3>
                    <div className="order-meta">
                      <span><i className="fa-solid fa-user"></i> {o.customerName}</span>
                      <span><i className="fa-solid fa-layer-group"></i> {orderItems.length.toLocaleString('fa-IR')} قلم</span>
                      <span><i className="fa-solid fa-calendar"></i> {formatDate(o.date)}</span>
                      {o.createdByName && <span><i className="fa-solid fa-user-pen"></i> {o.createdByName}</span>}
                    </div>
                  </div>
                </div>

                <div className="card-actions">
                  <button className="icon-btn" onClick={(e) => handleEdit(e, o)} title="ویرایش">
                    <i className="fa-solid fa-pen-to-square"></i>
                  </button>
                  <button className="icon-btn danger" onClick={(e) => handleDelete(e, o)} title="حذف">
                    <i className="fa-solid fa-trash"></i>
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
