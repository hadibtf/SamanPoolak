import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import JalaliDatePicker from '../components/JalaliDatePicker';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { db, jalaliDateKey, newUid } from '../db';
import { ordersApi, ApiError } from '../api/client';
import PersonFormSheet from '../components/PersonFormSheet';
import { useSettings } from '../context/SettingsContext';
import { MATERIAL_LABELS, PLATING_OPTIONS, INITIAL_ORDER_STATE } from '../constants';
import styles from './Management.module.css';

const managementRootClass = styles.root;
void styles;

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
  productionStopped: false,
});

const getCustomerDisplayName = (customer) => (
  `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.companyName || ''
);

const todayJalaliDate = () => new DateObject({ calendar: persian, locale: persian_fa });

const COMMON_DIMENSION_PRESETS = [
  { diameter: '32.5', thickness: '2.5', label: '32.5 × 2.5' },
  { diameter: '32.5', thickness: '2', label: '32.5 × 2' },
  { diameter: '32', thickness: '2.5', label: '32 × 2.5' },
  { diameter: '32', thickness: '2', label: '32 × 2' },
  { diameter: '31.5', thickness: '2.5', label: '31.5 × 2.5' },
  { diameter: '31.5', thickness: '2', label: '31.5 × 2' },
  { diameter: '28.5', thickness: '2', label: '28.5 × 2' },
  { diameter: '28', thickness: '2', label: '28 × 2' },
  { diameter: '27.8', thickness: '2', label: '27.8 × 2' },
];

const DimensionInput = ({ label, value, onChange }) => (
  <input
    aria-label={`${label} (میلی‌متر)`}
    type="number"
    step="0.1"
    dir="ltr"
    className="ltr-num"
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={label}
  />
);

// One editable product block.
const ItemEditor = ({ item, index, canRemove, onChange, onRemove }) => {
  const { currencyLabel } = useSettings();
  const [isAdditionalOpen, setIsAdditionalOpen] = useState(() => Boolean(
    (item.salePrice !== '' && item.salePrice != null)
    || (item.unitCost !== '' && item.unitCost != null)
    || item.description
    || item.isHardened
    || item.material === 'STEEL'
  ));
  const additionalId = `item-additional-${item.uid}`;
  const set = (patch) => onChange(index, patch);
  const hasSelectedPreset = COMMON_DIMENSION_PRESETS.some((preset) => (
    Number(item.diameter) === Number(preset.diameter)
      && Number(item.thickness) === Number(preset.thickness)
  ));
  return (
    <div className="item-editor">
      <div className="item-editor-head">
        <div className="dimension-presets-wrap">
          <div className="dimension-presets" role="group" aria-label="انتخاب اندازه">
            {COMMON_DIMENSION_PRESETS.map((preset) => {
              const isSelected = Number(item.diameter) === Number(preset.diameter)
                && Number(item.thickness) === Number(preset.thickness);
              return (
                <button
                  type="button"
                  key={`${preset.diameter}-${preset.thickness}`}
                  className={`dimension-preset ${isSelected ? 'active' : ''}`}
                  aria-label={`قطر ${preset.diameter} و ضخامت ${preset.thickness} میلی‌متر`}
                  aria-pressed={isSelected}
                  onClick={() => set({ diameter: preset.diameter, thickness: preset.thickness })}
                >
                  <bdi dir="ltr" className="dimension-preset-label">{preset.label}</bdi>
                </button>
              );
            })}
            <button
              type="button"
              className={`dimension-preset dimension-preset-custom ${hasSelectedPreset ? '' : 'active'}`}
              aria-label="ابعاد دلخواه"
              aria-pressed={!hasSelectedPreset}
              onClick={() => {
                if (hasSelectedPreset) set({ diameter: '', thickness: '' });
              }}
            >
              <span className="dimension-preset-label">دلخواه</span>
            </button>
          </div>
        </div>
        {canRemove && (
          <button type="button" className="link-btn danger" onClick={() => onRemove(index)}>
            <i className="fa-solid fa-trash"></i> حذف
          </button>
        )}
      </div>

      <div className="form-grid item-primary-grid">
        <div className="form-group span-2">
          <input
            aria-label="نام محصول"
            value={item.productName}
            onChange={(e) => set({ productName: e.target.value })}
            placeholder="نام محصول"
            required
          />
        </div>

        {!hasSelectedPreset && (
          <div className="dimension-custom-fields span-2">
            <DimensionInput
              label="قطر"
              value={item.diameter}
              onChange={(value) => set({ diameter: value })}
            />
            <DimensionInput
              label="ضخامت"
              value={item.thickness}
              onChange={(value) => set({ thickness: value })}
            />
          </div>
        )}

        <div className="form-group">
          <input
            aria-label="تعداد"
            type="number"
            min="0"
            dir="ltr"
            className="ltr-num"
            value={item.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            placeholder="تعداد"
            required
          />
        </div>

        <div className="form-group">
          <div className="segmented-control inline" role="group" aria-label="رنگ آبکاری">
            {PLATING_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                className={`segment plating-${opt.value.toLowerCase()} ${item.platingColor === opt.value ? 'active' : ''}`}
                aria-pressed={item.platingColor === opt.value}
                onClick={() => set({ platingColor: opt.value })}
              >
                {opt.label}
                {item.platingColor === opt.value && <span className="plating-checkmark" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="order-additional-toggle"
        aria-expanded={isAdditionalOpen}
        aria-controls={additionalId}
        onClick={() => setIsAdditionalOpen((open) => !open)}
      >
        <span>اطلاعات تکمیلی</span>
        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
      </button>

      <div
        id={additionalId}
        className={`order-additional-panel ${isAdditionalOpen ? 'open' : ''}`}
        aria-hidden={!isAdditionalOpen}
      >
        <div className="order-additional-inner" inert={!isAdditionalOpen}>
          <div className="form-grid">
            <div className="form-group">
              <input
                aria-label="قیمت فروش هر عدد"
                type="number" min="0" dir="ltr" className="ltr-num"
                value={item.salePrice}
                onChange={(e) => set({ salePrice: e.target.value })}
                placeholder="قیمت"
              />
            </div>

            <div className="form-group">
              <input
                aria-label="بهای تمام‌شده هر عدد"
                type="number" min="0" dir="ltr" className="ltr-num"
                value={item.unitCost}
                onChange={(e) => set({ unitCost: e.target.value })}
                placeholder="بهای تمام شده"
              />
            </div>

            <div className="form-group span-2">
              <textarea
                aria-label="توضیحات"
                value={item.description}
                onChange={(e) => set({ description: e.target.value })}
                rows="2"
                placeholder="توضیحات"
              />
            </div>

          </div>

          <div className="order-item-footer">
            <div className="order-feature-switches">
              <div className="toggle-row">
                <span>سخت‌کاری</span>
                <button
                  type="button"
                  role="switch"
                  aria-label="سخت‌کاری"
                  aria-checked={item.isHardened}
                  className={`ios-switch ${item.isHardened ? 'on' : ''}`}
                  onClick={() => set({ isHardened: !item.isHardened })}
                >
                  <span className="knob" />
                </button>
              </div>
              <div className="toggle-row">
                <span>{MATERIAL_LABELS.STEEL}</span>
                <button
                  type="button"
                  role="switch"
                  aria-label={MATERIAL_LABELS.STEEL}
                  aria-checked={item.material === 'STEEL'}
                  className={`ios-switch ${item.material === 'STEEL' ? 'on' : ''}`}
                  onClick={() => set({ material: item.material === 'STEEL' ? 'IRON' : 'STEEL' })}
                >
                  <span className="knob" />
                </button>
              </div>
            </div>
            {item.isHardened && (
              <div className="form-group order-hardening-field">
                <input
                  aria-label="میزان سختی"
                  value={item.hardeningIntensity}
                  onChange={(e) => set({ hardeningIntensity: e.target.value })}
                  placeholder="میزان سختی؛ مثال: ۴۵ راکول"
                />
              </div>
            )}
          </div>
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

  const [orderDate, setOrderDate] = useState(todayJalaliDate);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false);
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
          material: it.material === 'STEEL' ? 'STEEL' : 'IRON',
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
          productionStopped: Boolean(it.productionStopped),
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
        setCustomerSearch(getCustomerDisplayName(person));
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

  const dateKey = useMemo(() => jalaliDateKey(orderDate), [orderDate]);

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(getCustomerDisplayName(customer));
    setIsEditingCustomer(false);
    setShowDropdown(false);
  };

  const handleEditCustomer = () => {
    setCustomerSearch(getCustomerDisplayName(selectedCustomer));
    setIsEditingCustomer(true);
    setShowDropdown(false);
  };

  const handleCustomerSearchKeyDown = (event) => {
    if (event.key === 'Escape' && selectedCustomer) {
      setCustomerSearch(getCustomerDisplayName(selectedCustomer));
      setIsEditingCustomer(false);
      setShowDropdown(false);
    }
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
    if (!selectedCustomer || isEditingCustomer) { showToast('لطفاً مشتری را انتخاب کنید.', 'error'); return; }
    if (!items.length) { showToast('حداقل یک محصول لازم است.', 'error'); return; }
    if (items.some((it) => !it.productName.trim())) {
      showToast('نام همهٔ محصولات را وارد کنید.', 'error'); return;
    }

    const storedItems = items.map((it) => {
      const isNew = !it.state;
      const initialState = INITIAL_ORDER_STATE;
      const num = (v) => (v === '' || v == null ? null : Number(v));
      return {
        uid: it.uid || newUid(),
        productName: it.productName.trim(),
        quantity: Number(it.quantity) || 0,
        material: it.material === 'STEEL' ? 'STEEL' : 'IRON',
        thickness: num(it.thickness),
        diameter: num(it.diameter),
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
        productionStopped: Boolean(it.productionStopped),
      };
    });

    const header = {
      date: finalDateKey,
      dateText: finalDateText,
      customerId: selectedCustomer.id,
      customerName: getCustomerDisplayName(selectedCustomer),
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

  return (
    <div className={`${managementRootClass} submit-order`}>
      {isEdit && (
        <div className="page-back">
          <button type="button" className="back-btn" onClick={() => navigate(-1)}>
            <i className="fa-solid fa-chevron-left"></i><span>بازگشت</span>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Items */}
        {items.map((item, index) => (
          <div className="glass-card order-item-card" key={item.uid}>
            {index === 0 && (
              <header className="order-meta-header">
                <div className="customer-field">
                  {selectedCustomer && !isEditingCustomer ? (
                    <button
                      type="button"
                      className="customer-name-button"
                      onClick={handleEditCustomer}
                      aria-label={`تغییر مشتری: ${getCustomerDisplayName(selectedCustomer)}`}
                    >
                      <strong>{getCustomerDisplayName(selectedCustomer)}</strong>
                      <span className="muted"> ({selectedCustomer.id})</span>
                    </button>
                  ) : (
                    <>
                      <div className="customer-search-row">
                        <input
                          value={customerSearch}
                          onChange={(e) => { setCustomerSearch(e.target.value); setShowDropdown(true); }}
                          onKeyDown={handleCustomerSearchKeyDown}
                          onFocus={(event) => { if (isEditingCustomer) event.target.select(); }}
                          autoFocus={isEditingCustomer}
                          placeholder="مشتری"
                          aria-label="جستجوی نام مشتری"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="add-btn customer-add-btn"
                          onClick={() => setIsCustomerSheetOpen(true)}
                          aria-label="افزودن مشتری جدید"
                          title="افزودن مشتری جدید"
                        >
                          +
                        </button>
                      </div>
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

                <div className="order-date-inline">
                  <JalaliDatePicker
                    value={orderDate}
                    onChange={setOrderDate}
                    calendar={persian}
                    locale={persian_fa}
                    weekDays={weekDays}
                    format="YYYY/MM/DD"
                    aria-label="تاریخ سفارش"
                    calendarPosition="bottom-left"
                    inputClass="rmdp-input order-date-inline-input"
                    portal
                  />
                </div>
              </header>
            )}
            <ItemEditor
              item={item}
              index={index}
              canRemove={items.length > 1}
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

      {isCustomerSheetOpen && (
        <PersonFormSheet
          initialCategory="CUSTOMER"
          showCategorySelector={false}
          onClose={() => setIsCustomerSheetOpen(false)}
          onSaved={(customer) => {
            handleSelectCustomer(customer);
            showToast('مشتری ثبت شد.');
          }}
          onError={(error, message) => {
            if (error) console.error('Customer creation failed:', error);
            showToast(message, 'error');
          }}
        />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default SubmitOrder;
