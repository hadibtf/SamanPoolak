import { useApiQuery, liveRows, upsertRow } from '../hooks/useApiQuery';
import ApiReadStatus from '../components/ApiReadStatus';
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import JalaliDatePicker from '../components/JalaliDatePicker';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { jalaliDateKey, newUid } from '../domain';
import { peopleApi, ordersApi, ApiError } from '../api/client';
import PersonFormSheet from '../components/PersonFormSheet';
import SegmentedTabs from '../components/SegmentedTabs';
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

const normalizeLocalizedDigits = (value) => String(value ?? '')
  .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
  .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const normalizeQuantityDigits = (value) => normalizeLocalizedDigits(value).replace(/\D/g, '');

const formatQuantityInput = (value) => normalizeQuantityDigits(value)
  .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const normalizePriceInput = (value) => {
  const normalized = normalizeLocalizedDigits(value)
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, ',')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '');
  const decimalIndex = normalized.indexOf('.');
  if (decimalIndex === -1) return normalized;

  const integer = normalized.slice(0, decimalIndex).replace(/\D/g, '') || '0';
  const fraction = normalized.slice(decimalIndex + 1).replace(/\D/g, '');
  return `${integer}.${fraction}`;
};

const formatPriceInput = (value) => {
  const normalized = normalizePriceInput(value);
  if (!normalized) return '';
  const [integer, fraction] = normalized.split('.');
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? groupedInteger : `${groupedInteger}.${fraction}`;
};

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
    inputMode="decimal"
    step="0.1"
    dir="ltr"
    className="ltr-num"
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={label}
  />
);

// One editable product block.
const ItemEditor = ({ item, index, canRemove, onChange, onRemove, currency, onCurrencyChange }) => {
  const { currencyLabel } = useSettings();
  const [isAdditionalOpen, setIsAdditionalOpen] = useState(() => Boolean(
    (item.salePrice !== '' && item.salePrice != null)
    || item.description
    || item.isHardened
    || item.material === 'STEEL'
  ));
  const additionalId = `item-additional-${item.uid}`;
  const set = (patch) => onChange(index, patch);
  const handleQuantityChange = (event) => {
    const input = event.currentTarget;
    const cursor = input.selectionStart ?? input.value.length;
    const digitsBeforeCursor = normalizeQuantityDigits(input.value.slice(0, cursor)).length;
    const quantity = formatQuantityInput(input.value);
    set({ quantity });

    window.requestAnimationFrame(() => {
      if (!input.isConnected || document.activeElement !== input) return;
      let nextCursor = 0;
      let digitsPlaced = 0;
      while (nextCursor < quantity.length && digitsPlaced < digitsBeforeCursor) {
        if (quantity[nextCursor] >= '0' && quantity[nextCursor] <= '9') digitsPlaced += 1;
        nextCursor += 1;
      }
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };
  const handlePriceChange = (field, event) => {
    const input = event.currentTarget;
    const cursor = input.selectionStart ?? input.value.length;
    const tokensBeforeCursor = normalizePriceInput(input.value.slice(0, cursor)).length;
    const value = formatPriceInput(input.value);
    set({ [field]: value });

    window.requestAnimationFrame(() => {
      if (!input.isConnected || document.activeElement !== input) return;
      let nextCursor = 0;
      let tokensPlaced = 0;
      while (nextCursor < value.length && tokensPlaced < tokensBeforeCursor) {
        const character = value[nextCursor];
        if ((character >= '0' && character <= '9') || character === '.') tokensPlaced += 1;
        nextCursor += 1;
      }
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };
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

        <div className="order-measurements span-2">
          <div className="dimension-custom-fields">
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

          <div className="form-group">
            <input
              aria-label="تعداد"
              type="text"
              inputMode="numeric"
              dir="ltr"
              className="ltr-num"
              value={item.quantity}
              onChange={handleQuantityChange}
              placeholder="تعداد"
              required
            />
          </div>
        </div>
      </div>

      <div className="form-group plating-field">
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
          <div className={`order-price-row ${index === 0 ? 'with-currency' : ''}`}>
            {index === 0 && (
              <SegmentedTabs
                role="group"
                label="واحد ورود قیمت"
                value={currency}
                onChange={onCurrencyChange}
                items={[
                  { value: 'RIAL', label: 'ریال' },
                  { value: 'TOMAN', label: 'تومان' },
                ]}
                style={{ '--tabs-width': '260px', '--tabs-margin': '0' }}
              />
            )}
            <div className="form-group">
              <input
                aria-label={`قیمت فروش هر عدد (${currencyLabel})`}
                type="text" inputMode="numeric" dir="ltr" className="ltr-num"
                value={item.salePrice}
                onChange={(event) => handlePriceChange('salePrice', event)}
                placeholder={`قیمت (${currencyLabel})`}
              />
            </div>
          </div>

          <div className="form-grid">
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

  const { currency, setCurrency, toRial, fromRial } = useSettings();

  const orderQuery = useApiQuery(async () => editId == null ? null : (await ordersApi.get(editId)).order, [editId]);
  const { data: existingOrder } = orderQuery;
  const peopleQuery = useApiQuery(async () => liveRows((await peopleApi.list()).people));
  const customers = peopleQuery.data || [];

  const [orderDate, setOrderDate] = useState(todayJalaliDate);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false);
  const [items, setItems] = useState([blankItem()]);

  const [prefilled, setPrefilled] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { setPrefilled(false); }, [editId]);

  // Prefill when editing.
  useEffect(() => {
    if (!isEdit || prefilled || !existingOrder || !peopleQuery.data) return;
    let cancelled = false;

    (async () => {
      const o = existingOrder;
      if (Array.isArray(o.items) && o.items.length) {
        setItems(o.items.map((it) => ({
          uid: it.uid || newUid(),
          productName: it.productName || '',
          quantity: formatQuantityInput(it.quantity),
          material: it.material === 'STEEL' ? 'STEEL' : 'IRON',
          thickness: it.thickness ?? '',
          diameter: it.diameter ?? '',
          markingId: it.markingId ?? null,
          platingColor: it.platingColor || 'NONE',
          isHardened: !!it.isHardened,
          hardeningIntensity: it.hardeningIntensity || '',
          description: it.description || '',
          salePrice: it.salePrice != null ? formatPriceInput(fromRial(it.salePrice)) : '',
          unitCost: it.unitCost != null ? formatPriceInput(fromRial(it.unitCost)) : '',
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

      const person = customers.find((person) => person.id === o.customerId);
      if (!cancelled && person) {
        setSelectedCustomer(person);
        setCustomerSearch(getCustomerDisplayName(person));
      }
      if (!cancelled) setPrefilled(true);
    })();

    return () => { cancelled = true; };
  }, [isEdit, prefilled, existingOrder, fromRial, peopleQuery.data]);

  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const matchedCustomers = customers.filter((person) => {
    if (!normalizedCustomerSearch || person.category !== 'CUSTOMER') return false;
    const fullName = `${person.firstName || ''} ${person.lastName || ''}`.toLowerCase();
    const companyName = (person.companyName || '').toLowerCase();
    return fullName.includes(normalizedCustomerSearch) || companyName.includes(normalizedCustomerSearch);
  });

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
  const handleCurrencyChange = (nextCurrency) => {
    if (nextCurrency === currency) return;
    const toNextCurrency = (value) => {
      if (value === '' || value == null) return '';
      const rialAmount = toRial(Number(normalizePriceInput(value)) || 0);
      return formatPriceInput(nextCurrency === 'TOMAN' ? rialAmount / 10 : rialAmount);
    };
    setItems((prev) => prev.map((item) => ({
      ...item,
      salePrice: toNextCurrency(item.salePrice),
      unitCost: toNextCurrency(item.unitCost),
    })));
    setCurrency(nextCurrency);
  };
  const addItem = () => setItems((prev) => [...prev, blankItem()]);
  const removeItem = (index) => setItems((prev) => prev.filter((_, i) => i !== index));

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isEdit && (!prefilled || orderQuery.error || orderQuery.loading)) return;

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
        quantity: Number(normalizeQuantityDigits(it.quantity)) || 0,
        material: it.material === 'STEEL' ? 'STEEL' : 'IRON',
        thickness: num(it.thickness),
        diameter: num(it.diameter),
        platingColor: it.platingColor,
        isHardened: it.isHardened,
        hardeningIntensity: it.isHardened ? it.hardeningIntensity.trim() : '',
        description: it.description.trim(),
        salePrice: it.salePrice === '' || it.salePrice == null ? null : toRial(Number(normalizePriceInput(it.salePrice)) || 0),
        unitCost: it.unitCost === '' || it.unitCost == null ? null : toRial(Number(normalizePriceInput(it.unitCost)) || 0),
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
    <div className={`${managementRootClass} submit-order page-content-fit`}>
      <ApiReadStatus queries={[orderQuery, peopleQuery]} />
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
              currency={currency}
              onCurrencyChange={handleCurrencyChange}
            />
          </div>
        ))}

        <button type="button" className="add-item-btn" onClick={addItem}>
          <i className="fa-solid fa-plus"></i> افزودن محصول
        </button>

        <button type="submit" className="primary-btn" disabled={isEdit && (!prefilled || orderQuery.loading || Boolean(orderQuery.error))}>
          {isEdit ? 'ذخیره تغییرات' : 'ثبت سفارش'}
        </button>
      </form>

      {isCustomerSheetOpen && (
        <PersonFormSheet
          initialCategory="CUSTOMER"
          showCategorySelector={false}
          onClose={() => setIsCustomerSheetOpen(false)}
          onSaved={(customer) => {
            peopleQuery.setData((rows) => upsertRow(rows, customer));
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
