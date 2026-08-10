import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { inquiriesApi, ApiError } from '../api/client';
import './Inquiries.css';

const sourceLabel = {
  direct: 'ثبت مستقیم',
  whatsapp: 'واتساپ',
  telegram: 'تلگرام',
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const Inquiries = () => {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { inquiries: list } = await inquiriesApi.list();
      setInquiries(list || []);
    } catch (err) {
      console.error('Failed to load inquiries:', err);
      showToast(
        err instanceof ApiError && err.status === 0
          ? 'برای دریافت درخواست‌ها اتصال اینترنت لازم است.'
          : 'خطا در دریافت درخواست‌ها.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim();
    return inquiries.filter((item) => {
      if (filter === 'open' && item.handledAt) return false;
      if (filter === 'done' && !item.handledAt) return false;
      if (!term) return true;
      return `${item.name} ${item.phone} ${item.product} ${item.quantity} ${item.note}`.includes(term);
    });
  }, [inquiries, filter, search]);

  const openCount = inquiries.filter((item) => !item.handledAt).length;

  const toggleHandled = async (item) => {
    try {
      const { inquiry } = await inquiriesApi.update(item.id, { handled: !item.handledAt });
      setInquiries((list) => list.map((x) => (x.id === inquiry.id ? inquiry : x)));
      showToast(inquiry.handledAt ? 'درخواست انجام‌شده شد.' : 'درخواست دوباره باز شد.');
    } catch (err) {
      console.error('Inquiry update failed:', err);
      showToast('خطا در تغییر وضعیت درخواست.', 'error');
    }
  };

  return (
    <div className="inquiries-page">
      <div className="inquiries-header">
        <div>
          <h1>درخواست‌ها</h1>
          <p>{openCount.toLocaleString('fa-IR')} درخواست باز از لندینگ</p>
        </div>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`}></i>
          تازه‌سازی
        </button>
      </div>

      <div className="glass-card inquiry-filters">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو در نام، شماره، محصول یا توضیحات..."
        />
        <div className="filter-tabs">
          <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>باز</button>
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>همه</button>
          <button className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>انجام‌شده</button>
        </div>
      </div>

      <div className="inquiries-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-inbox"></i>
            <p>{loading ? 'در حال دریافت درخواست‌ها...' : 'درخواستی با این فیلترها پیدا نشد.'}</p>
          </div>
        ) : (
          filtered.map((item) => (
            <article key={item.id} className={`inquiry-card ${item.handledAt ? 'handled' : ''}`}>
              <div className="inquiry-main">
                <div className="inquiry-top">
                  <h3>{item.name || 'بدون نام'}</h3>
                  <span className="inquiry-state">{item.handledAt ? 'انجام‌شده' : 'باز'}</span>
                </div>
                <div className="inquiry-meta">
                  <a href={`tel:${item.phone}`} dir="ltr"><i className="fa-solid fa-phone"></i>{item.phone}</a>
                  <span><i className="fa-solid fa-box"></i>{item.product}</span>
                  {item.quantity && <span><i className="fa-solid fa-layer-group"></i>{item.quantity}</span>}
                  <span><i className="fa-solid fa-paper-plane"></i>{sourceLabel[item.source] || item.source}</span>
                  <span><i className="fa-solid fa-clock"></i>{formatDateTime(item.createdAt)}</span>
                </div>
                {item.note && <p className="inquiry-note">{item.note}</p>}
                {item.handledAt && <small className="handled-at">پیگیری‌شده در {formatDateTime(item.handledAt)}</small>}
              </div>
              <button className="status-btn" onClick={() => toggleHandled(item)}>
                <i className={`fa-solid ${item.handledAt ? 'fa-arrow-rotate-left' : 'fa-check'}`}></i>
                {item.handledAt ? 'باز کردن' : 'انجام شد'}
              </button>
            </article>
          ))
        )}
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default Inquiries;
