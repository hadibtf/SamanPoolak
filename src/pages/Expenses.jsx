import React, { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import JalaliDatePicker from '../components/JalaliDatePicker';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { db, jalaliDateKey } from '../db';
import { expensesApi, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import { EXPENSE_CATEGORIES } from '../constants';
import styles from './Expenses.module.css';

const CUSTOM = '__custom__';

const formatDate = (key) =>
  key && key.length === 8 ? `${key.slice(0, 4)}/${key.slice(4, 6)}/${key.slice(6, 8)}` : '—';

const dateObjFromKey = (key) =>
  key && key.length === 8
    ? new DateObject({
        calendar: persian,
        locale: persian_fa,
        year: Number(key.slice(0, 4)),
        month: Number(key.slice(4, 6)),
        day: Number(key.slice(6, 8)),
      })
    : null;

const Expenses = () => {
  const { formatMoney, currencyLabel, toRial, fromRial } = useSettings();

  const expenses = useLiveQuery(() => db.expenses.orderBy('id').reverse().toArray());

  // Filters
  const [fText, setFText] = useState('');
  const [fCategory, setFCategory] = useState('ALL');
  const [fFrom, setFFrom] = useState(null);
  const [fTo, setFTo] = useState(null);

  // Modal form
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [date, setDate] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fromKey = useMemo(() => jalaliDateKey(fFrom), [fFrom]);
  const toKey = useMemo(() => jalaliDateKey(fTo), [fTo]);

  const filtered = useMemo(() => {
    if (!expenses) return [];
    const text = fText.trim();
    return expenses.filter((e) => {
      if (text && !(`${e.title} ${e.paidTo || ''} ${e.description || ''}`.includes(text))) return false;
      if (fCategory !== 'ALL' && e.category !== fCategory) return false;
      if (fromKey && (!e.date || e.date < fromKey)) return false;
      if (toKey && (!e.date || e.date > toKey)) return false;
      return true;
    });
  }, [expenses, fText, fCategory, fromKey, toKey]);

  const total = useMemo(
    () => filtered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filtered]
  );

  const openModal = (expense = null) => {
    if (expense) {
      setEditing(expense);
      setDate(dateObjFromKey(expense.date));
      setTitle(expense.title || '');
      if (EXPENSE_CATEGORIES.includes(expense.category)) {
        setCategory(expense.category);
        setCustomCategory('');
      } else {
        setCategory(CUSTOM);
        setCustomCategory(expense.category || '');
      }
      setAmount(expense.amount ? String(fromRial(expense.amount)) : '');
      setPaidTo(expense.paidTo || '');
      setDescription(expense.description || '');
    } else {
      setEditing(null);
      setDate(null);
      setTitle('');
      setCategory(EXPENSE_CATEGORIES[0]);
      setCustomCategory('');
      setAmount('');
      setPaidTo('');
      setDescription('');
    }
    setIsOpen(true);
  };

  const closeModal = () => setIsOpen(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!title.trim()) { showToast('عنوان هزینه را وارد کنید.', 'error'); return; }
    const finalCategory = category === CUSTOM ? customCategory.trim() : category;

    const hasDate = date && date.year;
    const payload = {
      date: hasDate ? jalaliDateKey(date) : (editing?.date || ''),
      dateText: hasDate ? date.toString() : (editing?.dateText || ''),
      title: title.trim(),
      category: finalCategory,
      amount: toRial(amount), // entered in the active currency -> stored Rial
      paidTo: paidTo.trim(),
      description: description.trim(),
    };

    setSaving(true);
    try {
      let expense;
      if (editing) {
        ({ expense } = await expensesApi.update(editing.id, payload));
      } else {
        ({ expense } = await expensesApi.create(payload));
      }
      await db.expenses.put(expense);
      closeModal();
      showToast(editing ? 'هزینه ویرایش شد.' : 'هزینه ثبت شد.');
    } catch (err) {
      console.error('Expense save failed:', err);
      showToast(err instanceof ApiError && err.status === 0
        ? 'برای ذخیره نیاز به اتصال اینترنت دارید.'
        : 'خطا در ذخیره هزینه.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (expense) => {
    if (!window.confirm(`حذف هزینه «${expense.title}»؟`)) return;
    try {
      await expensesApi.remove(expense.id);
      await db.expenses.delete(expense.id);
      showToast('هزینه حذف شد.');
    } catch (err) {
      console.error('Expense delete failed:', err);
      showToast('خطا در حذف هزینه.', 'error');
    }
  };

  const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const hasFilters = fText || fCategory !== 'ALL' || fFrom || fTo;

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
    <div className={styles['expenses-page']}>
      <div className={styles['expenses-header']}>
        <h1>هزینه‌ها</h1>
        <Dialog.Trigger asChild>
        <button className="add-btn" onClick={() => openModal()}>
          <i className="fa-solid fa-plus"></i> افزودن هزینه
        </button>
        </Dialog.Trigger>
      </div>

      <div className={`glass-card ${styles.filterCard}`}>
        <div className={styles['exp-filter-grid']}>
          <div className={styles.filterGroup}>
            <label>جستجو</label>
            <input value={fText} onChange={(e) => setFText(e.target.value)} placeholder="عنوان، طرف حساب..." />
          </div>
          <div className={styles.filterGroup}>
            <label>دسته</label>
            <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
              <option value="ALL">همه</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>از تاریخ</label>
            <JalaliDatePicker value={fFrom} onChange={setFFrom} calendar={persian} locale={persian_fa}
              weekDays={weekDays} placeholder="از تاریخ" calendarPosition="bottom-right" inputClass="rmdp-input" />
          </div>
          <div className={styles.filterGroup}>
            <label>تا تاریخ</label>
            <JalaliDatePicker value={fTo} onChange={setFTo} calendar={persian} locale={persian_fa}
              weekDays={weekDays} placeholder="تا تاریخ" calendarPosition="bottom-right" inputClass="rmdp-input" />
          </div>
        </div>
        <div className={styles.filterFooter}>
          <span className="result-count">{filtered.length.toLocaleString('fa-IR')} هزینه · جمع: {formatMoney(total)}</span>
          {hasFilters && (
            <button className="clear-btn" onClick={() => { setFText(''); setFCategory('ALL'); setFFrom(null); setFTo(null); }}>
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </div>

      <div className={styles['expenses-list']}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-wallet"></i>
            <p>{expenses && expenses.length === 0 ? 'هنوز هزینه‌ای ثبت نشده است.' : 'هزینه‌ای با این فیلترها یافت نشد.'}</p>
          </div>
        ) : (
          filtered.map((e) => (
            <div key={e.id} className={styles['expense-card']}>
              <div className={styles['expense-main']}>
                <div className={styles['expense-top']}>
                  <h3>{e.title}</h3>
                  <span className={styles['expense-amount']}>{formatMoney(e.amount)}</span>
                </div>
                <div className={styles['expense-meta']}>
                  {e.category && <span className="chip">{e.category}</span>}
                  <span><i className="fa-solid fa-calendar"></i> {formatDate(e.date)}</span>
                  {e.paidTo && <span><i className="fa-solid fa-user"></i> {e.paidTo}</span>}
                  {e.createdByName && <span><i className="fa-solid fa-user-pen"></i> {e.createdByName}</span>}
                </div>
                {e.description && <p className={styles['expense-desc']}>{e.description}</p>}
              </div>
              <div className={styles['expense-actions']}>
                <button className="icon-btn" title="ویرایش" onClick={() => openModal(e)}>
                  <i className="fa-solid fa-pen-to-square"></i>
                </button>
                <button className="icon-btn danger" title="حذف" onClick={() => handleDelete(e)}>
                  <i className="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isOpen && (
          <Dialog.Portal>
            <Dialog.Overlay
              className={styles.modalOverlay}
              onClick={(event) => { if (event.target === event.currentTarget) closeModal(); }}
            >
              <Dialog.Content className={styles.modalContent} dir="rtl" aria-describedby={undefined}>
                <Dialog.Title asChild>
                  <h2 style={{ marginBottom: '18px' }}>{editing ? 'ویرایش هزینه' : 'افزودن هزینه'}</h2>
                </Dialog.Title>
                <form onSubmit={handleSubmit}>
                  <div className={styles.expenseFormGrid}>
                <div className="form-group full-width">
                  <label>عنوان</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: خرید مواد اولیه" required />
                </div>
                <div className="form-group">
                  <label>دسته</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value={CUSTOM}>سایر (دلخواه)…</option>
                  </select>
                </div>
                {category === CUSTOM && (
                  <div className="form-group">
                    <label>دستهٔ دلخواه</label>
                    <input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="نام دسته" />
                  </div>
                )}
                <div className="form-group">
                  <label>مبلغ ({currencyLabel})</label>
                  <input type="number" min="0" dir="ltr" className="ltr-num" value={amount}
                    onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>تاریخ</label>
                  <JalaliDatePicker value={date} onChange={setDate} calendar={persian} locale={persian_fa}
                    weekDays={weekDays} placeholder="انتخاب تاریخ" calendarPosition="bottom-right" inputClass="rmdp-input" />
                </div>
                <div className="form-group">
                  <label>طرف حساب / پرداخت به (اختیاری)</label>
                  <input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="نام شخص یا شرکت" />
                </div>
                <div className="form-group full-width">
                  <label>توضیحات</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows="2" />
                </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="submit-btn" disabled={saving}>
                      {saving ? 'در حال ذخیره...' : 'ذخیره'}
                    </button>
                    <Dialog.Close asChild>
                      <button type="button" className="cancel-btn">انصراف</button>
                    </Dialog.Close>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Overlay>
          </Dialog.Portal>
        )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
    </Dialog.Root>
  );
};

export default Expenses;
