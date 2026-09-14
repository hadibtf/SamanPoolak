import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import JalaliDatePicker from '../components/JalaliDatePicker';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { db, jalaliDateKey, yymmPrefix, getCustomerMarkings, newUid } from '../db';
import { ordersApi, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import { MATERIAL_OPTIONS, PLATING_OPTIONS, ORDER_STATES } from '../constants';
import './Management.css';

const blankItem = () => ({
  uid: newUid(),
  productName: '',
  quantity: '',
  material: 'IRON',
  thickness: '',
  diameter: '',
  markingId: null,
  platingColor: 'NONE',
  isHardened: false,
  hardeningIntensity: '',
  description: '',
  salePrice: '',
  unitCost: '',
  // carried through on edit so a progressed item keeps its workflow
  state: null,
  stateHistory: null,
  weightOf10: null,
  producedTotalWeight: null,
});

// One editable product block.
const ItemEditor = ({ item, index, canRemove, markings, onChange, onRemove }) => {
  const { currencyLabel } = useSettings();
  const set = (patch) => onChange(index, patch);
  return (
    <div className="item-editor">
      <div className="item-editor-head">
        <span className="item-badge">محصول {(index + 1).toLocaleString('fa-IR')}</span>
        {canRemove && (
          <button type="button" className="link-btn danger" onClick={() => onRemove(index)}>
            <i className="fa-solid fa-trash"></i> حذف
          </button>
        )}
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>نام محصول</label>
          <input
            value={item.productName}
            onChange={(e) => set({ productName: e.target.value })}
            placeholder="نام کالا یا خدمت"
            required
          />
        </div>
        <div className="form-group">
          <label>تعداد</label>
          <input
            type="number"
            min="0"
            value={item.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            placeholder="۰"
            required
          />
        </div>

        <div className="form-group span-2">
          <label>جنس</label>
          <div className="segmented-control inline">
            {MATERIAL_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                className={`segment ${item.material === opt.value ? 'active' : ''}`}
                onClick={() => set({ material: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>ضخامت (میلی‌متر)</label>
          <input
            type="number" step="0.1" dir="ltr" className="ltr-num"
            value={item.thickness}
            onChange={(e) => set({ thickness: e.target.value })}
            placeholder="0.0"
          />
        </div>
        <div className="form-group">
          <label>قطر (میلی‌متر)</label>
          <input
            type="number" step="0.1" dir="ltr" className="ltr-num"
            value={item.diameter}
            onChange={(e) => set({ diameter: e.target.value })}
            placeholder="0.0"
          />
        </div>

        <div className="form-group span-2">
          <label>مارک / حکاکی</label>
          {markings === null ? (
            <p className="hint-text">ابتدا مشتری را انتخاب کنید.</p>
          ) : markings?.length ? (
            <div className="marking-picker">
              {markings.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`marking-chip ${item.markingId === m.id ? 'active' : ''}`}
                  onClick={() => set({ markingId: item.markingId === m.id ? null : m.id })}
                  title={m.name}
                >
                  {m.src ? <img src={m.src} alt={m.name} /> : <i className="fa-solid fa-stamp"></i>}
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="hint-text">این مشتری مارکی ندارد. از صفحه «افراد» مارک اضافه کنید.</p>
          )}
        </div>

        <div className="form-group span-2">
          <label>رنگ آبکاری</label>
          <div className="segmented-control inline">
            {PLATING_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                className={`segment ${item.platingColor === opt.value ? 'active' : ''}`}
                onClick={() => set({ platingColor: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group span-2">
          <div className="toggle-row">
            <span>سخت‌کاری</span>
            <button
              type="button"
              role="switch"
              aria-checked={item.isHardened}
              className={`ios-switch ${item.isHardened ? 'on' : ''}`}
              onClick={() => set({ isHardened: !item.isHardened })}
            >
              <span className="knob" />
            </button>
          </div>
        </div>

        {item.isHardened && (
          <div className="form-group span-2">
            <label>میزان سختی</label>
            <input
              value={item.hardeningIntensity}
              onChange={(e) => set({ hardeningIntensity: e.target.value })}
              placeholder="مثال: ۴۵ راکول"
            />
          </div>
        )}

        <div className="form-group">
          <label>قیمت فروش هر عدد ({currencyLabel})</label>
          <input
            type="number" min="0" dir="ltr" className="ltr-num"
            value={item.salePrice}
            onChange={(e) => set({ salePrice: e.target.value })}
            placeholder="0"
          />
        </div>
        <div className="form-group">
          <label>بهای تمام‌شده هر عدد ({currencyLabel} - اختیاری)</label>
          <input
            type="number" min="0" dir="ltr" className="ltr-num"
            value={item.unitCost}
            onChange={(e) => set({ unitCost: e.target.value })}
            placeholder="0"
          />
        </div>

        <div className="form-group span-2">
          <label>توضیحات</label>
          <textarea
            value={item.description}
            onChange={(e) => set({ description: e.target.value })}
            rows="2"
            placeholder="توضیحات اختیاری (در فاکتور نمایش داده می‌شود)"
          />
        </div>
      </div>
    </div>
  );
};

const SubmitOrder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const editId = id ? Number(id) : null;

  const { toRial, fromRial } = useSettings();

  const existingOrder = useLiveQuery(
    () => (editId != null ? db.orders.get(editId) : undefined),
    [editId]
  );

  const [orderDate, setOrderDate] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [items, setItems] = useState([blankItem()]);

  const [prefilled, setPrefilled] = useState(false);
  const [toast, setToast] = useState(null);

  // Prefill when editing.
  useEffect(() => {
    if (!isEdit || prefilled || !existingOrder) return;
    let cancelled = false;

    (async () => {
      const o = existingOrder;
      if (Array.isArray(o.items) && o.items.length) {
        setItems(o.items.map((it) => ({
          uid: it.uid || newUid(),
          productName: it.productName || '',
          quantity: it.quantity ?? '',
          material: it.material || 'IRON',
          thickness: it.thickness ?? '',
          diameter: it.diameter ?? '',
          markingId: it.markingId ?? null,
          platingColor: it.platingColor || 'NONE',
          isHardened: !!it.isHardened,
          hardeningIntensity: it.hardeningIntensity || '',
          description: it.description || '',
          salePrice: it.salePrice != null ? fromRial(it.salePrice) : '',
          unitCost: it.unitCost != null ? fromRial(it.unitCost) : '',
          // carried through unchanged
          state: it.state || null,
          stateHistory: it.stateHistory || null,
          weightOf10: it.weightOf10 ?? null,
          producedTotalWeight: it.producedTotalWeight ?? null,
        })));
      }

      if (o.date && o.date.length === 8) {
        setOrderDate(new DateObject({
          calendar: persian,
          locale: persian_fa,
          year: Number(o.date.slice(0, 4)),
          month: Number(o.date.slice(4, 6)),
          day: Number(o.date.slice(6, 8)),
        }));
      }

      const person = await db.people.get(o.customerId);
      if (!cancelled && person) {
        setSelectedCustomer(person);
        setCustomerSearch(`${person.firstName} ${person.lastName}`);
      }
      if (!cancelled) setPrefilled(true);
    })();

    return () => { cancelled = true; };
  }, [isEdit, prefilled, existingOrder, fromRial]);

  const matchedCustomers = useLiveQuery(
    () => {
      const term = customerSearch.trim();
      if (!term) return [];
      return db.people
        .where('category')
        .equals('CUSTOMER')
        .filter(
          (p) =>
            `${p.firstName} ${p.lastName}`.includes(term) ||
            (p.companyName && p.companyName.includes(term))
        )
        .toArray();
    },
    [customerSearch]
  );

  // The selected customer's marking directory (shared by all items).
  const customerMarkings = useLiveQuery(
    () => (selectedCustomer ? getCustomerMarkings(selectedCustomer.id) : []),
    [selectedCustomer?.id]
  );
  const markingsForItems = selectedCustomer ? (customerMarkings || []) : null;

  const dateKey = useMemo(() => jalaliDateKey(orderDate), [orderDate]);

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(`${customer.firstName} ${customer.lastName}`);
    setShowDropdown(false);
    // marks are customer-specific — clear any selected mark on every item
    setItems((prev) => prev.map((it) => ({ ...it, markingId: null })));
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setItems((prev) => prev.map((it) => ({ ...it, markingId: null })));
  };

  const updateItem = (index, patch) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, blankItem()]);
  const removeItem = (index) => setItems((prev) => prev.filter((_, i) => i !== index));

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const hasDateObj = orderDate && orderDate.year;
    const finalDateKey = hasDateObj ? dateKey : isEdit ? existingOrder?.date : '';
    const finalDateText = hasDateObj ? orderDate.toString() : isEdit ? existingOrder?.dateText : '';

    if (!finalDateKey) { showToast('لطفاً تاریخ سفارش را انتخاب کنید.', 'error'); return; }
    if (!selectedCustomer) { showToast('لطفاً مشتری را انتخاب کنید.', 'error'); return; }
    if (!items.length) { showToast('حداقل یک محصول لازم است.', 'error'); return; }
    if (items.some((it) => !it.productName.trim())) {
      showToast('نام همهٔ محصولات را وارد کنید.', 'error'); return;
    }

    const marksById = {};
    (customerMarkings || []).forEach((m) => { marksById[m.id] = m; });

    const storedItems = items.map((it) => {
      const isNew = !it.state;
      const initialState = ORDER_STATES[0].value;
      const num = (v) => (v === '' || v == null ? null : Number(v));
      return {
        uid: it.uid || newUid(),
        productName: it.productName.trim(),
        quantity: Number(it.quantity) || 0,
        material: it.material,
        thickness: num(it.thickness),
        diameter: num(it.diameter),
        markingId: it.markingId ?? null,
        markingName: it.markingId != null ? (marksById[it.markingId]?.name || '') : '',
        platingColor: it.platingColor,
        isHardened: it.isHardened,
        hardeningIntensity: it.isHardened ? it.hardeningIntensity.trim() : '',
        description: it.description.trim(),
        salePrice: it.salePrice === '' || it.salePrice == null ? null : toRial(it.salePrice),
        unitCost: it.unitCost === '' || it.unitCost == null ? null : toRial(it.unitCost),
        state: isNew ? initialState : it.state,
        stateHistory: isNew
          ? [{ state: initialState, date: Date.now(), totalWeight: null }]
          : it.stateHistory,
        weightOf10: it.weightOf10 ?? null,
        producedTotalWeight: it.producedTotalWeight ?? null,
      };
    });

    const header = {
      date: finalDateKey,
      dateText: finalDateText,
      customerId: selectedCustomer.id,
      customerName: `${selectedCustomer.firstName} ${selectedCustomer.lastName}`,
      items: storedItems,
    };

    try {
      // Server is the source of truth: it assigns the id + order number.
      let order;
      if (isEdit) {
        ({ order } = await ordersApi.update(editId, header));
      } else {
        ({ order } = await ordersApi.create(header));
      }
      await db.orders.put(order); // update the local mirror immediately
      showToast(isEdit ? 'سفارش ویرایش شد.' : `سفارش ${order.orderNumber} ثبت شد.`);
      navigate(`/orders/view/${order.id}`);
    } catch (error) {
      console.error('Failed to save order:', error);
      if (error instanceof ApiError && error.status === 0) {
        showToast('برای ذخیره نیاز به اتصال اینترنت دارید.', 'error');
      } else {
        showToast('خطا در ذخیره سفارش.', 'error');
      }
    }
  };

  const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const previewNumber = isEdit
    ? existingOrder?.orderNumber || '—'
    : dateKey ? `${yymmPrefix(dateKey)}…` : 'پس از انتخاب تاریخ';

  return (
    <div className="submit-order">
      {isEdit && (
        <div className="page-back">
          <button type="button" className="back-btn" onClick={() => navigate(-1)}>
            <i className="fa-solid fa-chevron-right"></i> بازگشت
          </button>
          <h2>ویرایش سفارش</h2>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Order header */}
        <div className="glass-card">
          <div className="form-grid">
            <div className="form-group span-2 customer-field">
              <label>مشتری</label>
              {selectedCustomer ? (
                <div className="selected-badge">
                  <span>
                    👤 <strong>{selectedCustomer.firstName} {selectedCustomer.lastName}</strong>
                    <span className="muted"> ({selectedCustomer.id})</span>
                  </span>
                  <button type="button" className="clear-btn" onClick={handleClearCustomer}>تغییر</button>
                </div>
              ) : (
                <>
                  <input
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowDropdown(true); }}
                    placeholder="جستجوی نام مشتری..."
                    autoComplete="off"
                  />
                  {showDropdown && matchedCustomers?.length > 0 && (
                    <div className="search-dropdown">
                      {matchedCustomers.map((c) => (
                        <div key={c.id} className="dropdown-item" onClick={() => handleSelectCustomer(c)}>
                          {c.firstName} {c.lastName}
                          {c.companyName && <span className="muted"> — {c.companyName}</span>}
                          <span className="muted"> ({c.id})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {showDropdown && customerSearch.trim() && matchedCustomers?.length === 0 && (
                    <div className="search-dropdown empty">مشتری‌ای یافت نشد</div>
                  )}
                </>
              )}
            </div>

            <div className="form-group">
              <label>تاریخ سفارش</label>
              <JalaliDatePicker
                value={orderDate}
                onChange={setOrderDate}
                calendar={persian}
                locale={persian_fa}
                weekDays={weekDays}
                placeholder="انتخاب تاریخ"
                calendarPosition="bottom-right"
                inputClass="rmdp-input"
                portal
              />
            </div>
            <div className="form-group">
              <label>شماره سفارش</label>
              <input className="readonly-field" value={previewNumber} readOnly tabIndex={-1} />
            </div>
          </div>
        </div>

        {/* Items */}
        {items.map((item, index) => (
          <div className="glass-card" key={item.uid}>
            <ItemEditor
              item={item}
              index={index}
              canRemove={items.length > 1}
              markings={markingsForItems}
              onChange={updateItem}
              onRemove={removeItem}
            />
          </div>
        ))}

        <button type="button" className="add-item-btn" onClick={addItem}>
          <i className="fa-solid fa-plus"></i> افزودن محصول
        </button>

        <button type="submit" className="primary-btn">
          {isEdit ? 'ذخیره تغییرات' : 'ثبت سفارش'}
        </button>
      </form>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default SubmitOrder;
