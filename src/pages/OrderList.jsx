import { useApiQuery, liveRows, newestFirst } from '../hooks/useApiQuery';
import ApiReadStatus from '../components/ApiReadStatus';
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import JalaliDatePicker from '../components/JalaliDatePicker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { jalaliDateKey, deriveOrderStatus } from '../domain';
import { peopleApi, ordersApi, ApiError } from '../api/client';
import { PLATING_LABELS } from '../constants';
import MetallicText from '../components/MetallicText';
import styles from './Management.module.css';
import SegmentedTabs from '../components/SegmentedTabs';
import ImageGlassSurface from '../components/ImageGlassSurface';

const READY_OR_LATER_ITEM_STATES = new Set([
  'READY',
  'PACKAGED',
  'SENT_FREIGHT',
  'DELIVERED_WORKSHOP',
  'DELIVERED_PLATING',
]);
const SEMI_READY_ITEM_STATES = new Set([
  'MINTING',
  'RETURN_PLATING',
  'RETURN_HARDENING',
  'SENT_HARDENING',
  'SENT_PLATING',
  'PRODUCTION_COMPLETE',
]);
const latestOrderItemStatus = (item) => {
  const history = item?.stateHistory || [];
  const latest = history[history.length - 1];
  return latest?.event || latest?.state || item?.state;
};

const orderItemStageClass = (item) => {
  const status = latestOrderItemStatus(item);
  if (READY_OR_LATER_ITEM_STATES.has(status)) return 'is-ready';
  if (SEMI_READY_ITEM_STATES.has(status)) return 'is-semi-ready';
  return '';
};

const toEnglishDigits = (value) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const renderTextWithEnglishDigits = (value) => toEnglishDigits(value)
  .split(/(\d+(?:[.,]\d+)*)/g)
  .map((part, index) => /^\d/.test(part)
    ? <bdi className="order-list-numeric" dir="ltr" key={`${index}-${part}`}>{part}</bdi>
    : part);

const formatNumericValue = (value) => {
  const normalized = toEnglishDigits(value);
  if (!normalized.trim()) return '';
  const number = Number(normalized);
  return Number.isFinite(number)
    ? number.toLocaleString('en-US', { maximumFractionDigits: 3, useGrouping: false })
    : normalized;
};

const formatCountValue = (value) => {
  const number = Number(toEnglishDigits(value));
  const count = Number.isFinite(number) ? number : 0;
  return count.toLocaleString('fa-IR', { maximumFractionDigits: 3, useGrouping: true });
};

const formatItemNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  return formatNumericValue(value);
};

const DIGIT_MAP = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const normalizeSearchValue = (value) => String(value ?? '')
  .replace(/[۰-۹٠-٩]/g, (digit) => DIGIT_MAP[digit])
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[×*]/g, 'x')
  .replace(/[\u200c\u200e\u200f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('fa-IR');

const customerKeyForOrder = (order) => order.customerId == null
  ? `name:${normalizeSearchValue(order.customerName)}`
  : String(order.customerId);

const customerDisplayName = (person) =>
  `${person?.firstName || ''} ${person?.lastName || ''}`.trim() || person?.companyName?.trim() || '';

const getCustomerNameParts = (name, companyName) => {
  const owner = name?.trim() || '';
  const company = companyName?.trim() || '';
  const hasSeparateOwner = Boolean(
    owner && company && normalizeSearchValue(owner) !== normalizeSearchValue(company)
  );
  const customerName = hasSeparateOwner ? owner : owner || company || 'مشتری نامشخص';
  const displayedCompany = hasSeparateOwner ? company : '';

  return {
    companyName: displayedCompany,
    customerName,
    label: [displayedCompany, customerName].filter(Boolean).join(' '),
  };
};

const normalizeDimension = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const normalized = normalizeSearchValue(value);
  const number = Number(normalized);
  return Number.isFinite(number) ? String(number) : normalized;
};

const getProductSize = (item) => {
  const diameter = normalizeDimension(item?.diameter);
  const thickness = normalizeDimension(item?.thickness);
  if (!diameter || !thickness) return null;
  return { key: `${diameter}x${thickness}`, label: `${diameter} × ${thickness}` };
};

const OrderList = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fDate, setFDate] = useState(null);
  const [fFrom, setFFrom] = useState(null);
  const [fTo, setFTo] = useState(null);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [fAdvancedOrderNumber, setFAdvancedOrderNumber] = useState('');
  const [statusTab, setStatusTab] = useState('in-progress');

  const ordersQuery = useApiQuery(async () => newestFirst((await ordersApi.list()).orders));
  const peopleQuery = useApiQuery(async () => liveRows((await peopleApi.list()).people));
  const { data: orders, setData: setOrders } = ordersQuery;
  const { data: people } = peopleQuery;
  const personByCustomerId = useMemo(
    () => new Map((people || []).map((person) => [String(person.id), person])),
    [people]
  );
  const companyByCustomerId = useMemo(
    () => new Map((people || []).map((person) => [String(person.id), person.companyName?.trim() || ''])),
    [people]
  );

  const customerOptions = useMemo(() => {
    const options = new Map();
    (people || []).forEach((person) => {
      if (person.category !== 'CUSTOMER') return;
      const value = String(person.id);
      const nameParts = getCustomerNameParts(customerDisplayName(person), person.companyName);
      options.set(value, { value, ...nameParts });
    });
    (orders || []).forEach((order) => {
      const value = customerKeyForOrder(order);
      const person = personByCustomerId.get(String(order.customerId));
      const name = order.customerName?.trim() || customerDisplayName(person);
      const companyName = order.companyName?.trim() || person?.companyName?.trim();
      const nameParts = getCustomerNameParts(name, companyName);
      options.set(value, { value, ...nameParts });
    });
    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, 'fa'));
  }, [people, orders, personByCustomerId]);

  const sizeOptions = useMemo(() => {
    const options = new Map();
    (orders || []).forEach((order) => {
      (order.items || []).forEach((item) => {
        const size = getProductSize(item);
        if (size) options.set(size.key, size);
      });
    });
    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, 'fa', { numeric: true }));
  }, [orders]);

  const dateKey = useMemo(() => jalaliDateKey(fDate), [fDate]);
  const fromKey = useMemo(() => jalaliDateKey(fFrom), [fFrom]);
  const toKey = useMemo(() => jalaliDateKey(fTo), [fTo]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    const query = normalizeSearchValue(searchQuery);
    const orderNumberQuery = normalizeSearchValue(fAdvancedOrderNumber);

    return orders.filter((o) => {
      const person = personByCustomerId.get(String(o.customerId));
      const customerName = o.customerName?.trim() || customerDisplayName(person);
      const companyNames = [
        o.companyName,
        o.customerCompanyName,
        o.customer?.companyName,
        person?.companyName,
        companyByCustomerId.get(String(o.customerId)),
      ].filter((name) => typeof name === 'string' && name.trim());
      const sizes = (o.items || []).map(getProductSize).filter(Boolean);
      const searchableValues = [
        JSON.stringify(o),
        customerName,
        ...companyNames,
        o.date,
        o.date ? `${o.date.slice(0, 4)}/${o.date.slice(4, 6)}/${o.date.slice(6, 8)}` : '',
        ...sizes.flatMap((size) => [size.label, size.key]),
      ].join(' ');
      if (query && !normalizeSearchValue(searchableValues).includes(query)) return false;
      if (orderNumberQuery && !normalizeSearchValue(o.orderNumber).includes(orderNumberQuery)) return false;
      if (selectedCustomers.length && !selectedCustomers.includes(customerKeyForOrder(o))) return false;
      if (selectedSizes.length && !sizes.some((size) => selectedSizes.includes(size.key))) return false;
      if (dateKey && o.date !== dateKey) return false;
      // date is the sortable YYYYMMDD string — range compare works lexically.
      if (fromKey && (!o.date || o.date < fromKey)) return false;
      if (toKey && (!o.date || o.date > toKey)) return false;
      return true;
    });
  }, [orders, searchQuery, fAdvancedOrderNumber, selectedCustomers, selectedSizes, dateKey, fromKey, toKey, personByCustomerId, companyByCustomerId]);

  const completedOrders = useMemo(() => filtered.filter((order) => deriveOrderStatus(order).done), [filtered]);
  const inProgressOrders = useMemo(() => filtered.filter((order) => !deriveOrderStatus(order).done), [filtered]);
  const visibleOrders = statusTab === 'completed' ? completedOrders : inProgressOrders;
  const hasFilters = Boolean(
    searchQuery.trim() || fAdvancedOrderNumber.trim() || fDate || fFrom || fTo
      || selectedCustomers.length || selectedSizes.length
  );
  const activeAdvancedCount = Number(Boolean(fDate))
    + Number(Boolean(fFrom || fTo))
    + Number(selectedCustomers.length > 0)
    + Number(selectedSizes.length > 0)
    + Number(Boolean(fAdvancedOrderNumber.trim()));

  const handleExactDateChange = (value) => {
    setFDate(value);
    if (value) {
      setFFrom(null);
      setFTo(null);
    }
  };

  const handleRangeDateChange = (setter) => (value) => {
    setter(value);
    if (value) setFDate(null);
  };

  const handleRangeStartChange = handleRangeDateChange(setFFrom);
  const handleRangeEndChange = handleRangeDateChange(setFTo);

  const toggleSelection = (setter, value) => {
    setter((current) => current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value]);
  };

  const formatDate = (dateKey) => {
    if (!dateKey || dateKey.length !== 8) return '—';
    return `${dateKey.slice(0, 4)}/${dateKey.slice(4, 6)}/${dateKey.slice(6, 8)}`
      .replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[digit]);
  };

  const handleDelete = async (e, o) => {
    e.stopPropagation();
    if (!window.confirm(`حذف سفارش #${toEnglishDigits(o.orderNumber)}؟`)) return;
    try {
      await ordersApi.remove(o.id);
      setOrders((rows) => rows.filter((row) => row.id !== o.id));
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
      <ApiReadStatus queries={[ordersQuery, peopleQuery]} />
      <div className="glass-card filter-card">
        <div className={styles.searchToolbar}>
          <label className={styles.searchInputWrap}>
            <i className={`fa-solid fa-magnifying-glass ${styles.searchIcon}`} aria-hidden="true"></i>
            <input
              type="search"
              className={styles.searchInput}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="جستجو"
              aria-label="جستجو در همه اطلاعات سفارش‌ها"
            />
          </label>
          <button
            type="button"
            className={styles.advancedToggle}
            aria-expanded={advancedOpen}
            aria-controls="advanced-order-search"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <i className="fa-solid fa-sliders" aria-hidden="true"></i>
            <span>جستجوی پیشرفته</span>
            {activeAdvancedCount > 0 && <small className="order-list-numeric">{formatCountValue(activeAdvancedCount)}</small>}
            <i className={`fa-solid fa-chevron-down ${styles.advancedChevron} ${advancedOpen ? styles.advancedChevronOpen : ''}`} aria-hidden="true"></i>
          </button>
        </div>

        <div
          id="advanced-order-search"
          className={`${styles.advancedPanel} ${advancedOpen ? styles.advancedPanelOpen : ''}`}
          aria-hidden={!advancedOpen}
          inert={!advancedOpen}
        >
          <div className={styles.advancedInner}>
            <div className={styles.advancedSurface}>
              <div className={styles.advancedGrid}>
                <div className={`${styles.advancedField} ${styles.dateField}`} role="group" aria-label="تاریخ">
                  <label className={styles.visuallyHidden} htmlFor="order-search-date">تاریخ</label>
                  <JalaliDatePicker
                    id="order-search-date"
                    value={fDate}
                    onChange={handleExactDateChange}
                    calendar={persian}
                    locale={persian_fa}
                    weekDays={weekDays}
                    placeholder="انتخاب تاریخ"
                    calendarPosition="bottom-right"
                    portal
                    zIndex={1200}
                    inputClass="rmdp-input"
                  />
                </div>

                <div className={`${styles.advancedField} ${styles.dateRangeField}`} role="group" aria-label="بازه تاریخ">
                  <div className={styles.dateRangeInputs}>
                    <div className={styles.dateRangeControl}>
                      <label className={styles.visuallyHidden} htmlFor="order-search-date-from">از تاریخ</label>
                      <JalaliDatePicker
                        id="order-search-date-from"
                        value={fFrom}
                        onChange={handleRangeStartChange}
                        calendar={persian}
                        locale={persian_fa}
                        weekDays={weekDays}
                        placeholder="از تاریخ"
                        calendarPosition="bottom-right"
                        portal
                        zIndex={1200}
                        inputClass="rmdp-input"
                      />
                    </div>
                    <div className={styles.dateRangeControl}>
                      <label className={styles.visuallyHidden} htmlFor="order-search-date-to">تا تاریخ</label>
                      <JalaliDatePicker
                        id="order-search-date-to"
                        value={fTo}
                        onChange={handleRangeEndChange}
                        calendar={persian}
                        locale={persian_fa}
                        weekDays={weekDays}
                        placeholder="تا تاریخ"
                        calendarPosition="bottom-right"
                        portal
                        zIndex={1200}
                        inputClass="rmdp-input"
                      />
                    </div>
                  </div>
                </div>

                <div className={`${styles.advancedField} ${styles.customerField}`} role="group" aria-label="مشتری">
                  <div className={styles.optionList}>
                    {customerOptions.length ? customerOptions.map((option) => (
                      <label className={styles.optionRow} key={option.value}>
                        <input
                          type="checkbox"
                          checked={selectedCustomers.includes(option.value)}
                          onChange={() => toggleSelection(setSelectedCustomers, option.value)}
                        />
                        <span className={styles.customerOptionPair}>
                          {option.companyName && (
                            <bdi dir="auto" className={styles.customerCompanyName}>{option.companyName}</bdi>
                          )}
                          <bdi dir="auto" className={styles.customerOwnerName}>{option.customerName}</bdi>
                        </span>
                      </label>
                    )) : <p className={styles.noOptions}>مشتری‌ای ثبت نشده است.</p>}
                  </div>
                </div>

                <div className={`${styles.advancedField} ${styles.productSizeField}`} role="group" aria-label="ابعاد محصول">
                  <div className={styles.optionList}>
                    {sizeOptions.length ? sizeOptions.map((option) => (
                      <label className={styles.optionRow} key={option.key}>
                        <input
                          type="checkbox"
                          checked={selectedSizes.includes(option.key)}
                          onChange={() => toggleSelection(setSelectedSizes, option.key)}
                        />
                        <bdi dir="ltr">{option.label}</bdi>
                      </label>
                    )) : <p className={styles.noOptions}>ابعادی در سفارش‌ها ثبت نشده است.</p>}
                  </div>
                </div>

                <div className={`${styles.advancedField} ${styles.orderNumberField}`} role="group" aria-label="شماره سفارش">
                  <label className={styles.visuallyHidden} htmlFor="order-search-number">شماره سفارش</label>
                  <input
                    id="order-search-number"
                    value={fAdvancedOrderNumber}
                    onChange={(event) => setFAdvancedOrderNumber(event.target.value)}
                    placeholder="مثال: ۰۵۰۳"
                    inputMode="numeric"
                    dir="rtl"
                    className={styles.orderNumberInput}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <SegmentedTabs className={styles.statusTabs} role="group" label="فیلتر وضعیت سفارش" value={statusTab} onChange={setStatusTab} items={[
        { value: 'in-progress', label: 'در حال انجام', icon: 'fa-solid fa-clock', badge: formatCountValue(inProgressOrders.length) },
        { value: 'completed', label: 'تکمیل شده', icon: 'fa-solid fa-circle-check', badge: formatCountValue(completedOrders.length) },
      ]} />

      <div className="orders-grid">
        {ordersQuery.loading || peopleQuery.loading || ordersQuery.error || peopleQuery.error ? null : visibleOrders.length === 0 ? (
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
            const person = personByCustomerId.get(String(o.customerId));
            const companyName = o.companyName?.trim()
              || person?.companyName?.trim()
              || companyByCustomerId.get(String(o.customerId));
            const customerName = o.customerName?.trim() || customerDisplayName(person);
            const customerParts = getCustomerNameParts(customerName, companyName);
            return (
              <ImageGlassSurface
                as="div"
                key={o.id}
                className="order-card clickable"
                onClick={() => navigate(`/orders/view/${o.id}`)}
              >
                <header className="order-card-summary">
                  <div className="order-summary-parties" dir="rtl">
                    <span className="order-summary-customer" title={toEnglishDigits(customerParts.label)}>
                      {customerParts.companyName ? (
                        <bdi dir="rtl" className={styles.customerNamePair}>
                          <span className={styles.customerCompanyName}>{renderTextWithEnglishDigits(customerParts.companyName)}</span>
                          <span className={styles.customerOwnerName}>{renderTextWithEnglishDigits(customerParts.customerName)}</span>
                        </bdi>
                      ) : <bdi dir="auto">{renderTextWithEnglishDigits(customerParts.customerName)}</bdi>}
                    </span>
                  </div>
                  <span className="order-summary-date" dir="ltr">{formatDate(o.date)}</span>
                </header>

                <div className="order-card-body">
                  <div className="order-card-main">
                    <ul className="order-items" aria-label="اقلام سفارش">
                      {orderItems.length ? orderItems.map((item, index) => {
                        const itemStatus = latestOrderItemStatus(item);
                        const stageClass = orderItemStageClass(item);
                        const parsedOrderedCount = Number(toEnglishDigits(item.quantity));
                        const itemOrderedCount = Number.isFinite(parsedOrderedCount) ? parsedOrderedCount : 0;
                        const diameter = formatItemNumber(item.diameter);
                        const thickness = formatItemNumber(item.thickness);
                        const hasDimensions = diameter !== ''
                          && thickness !== ''
                          && Number(diameter) !== 0
                          && Number(thickness) !== 0;
                        const platingColor = item.platingColor === 'GOLD' || item.platingColor === 'SILVER'
                          ? item.platingColor
                          : 'NONE';
                        const platingTone = platingColor === 'GOLD' ? 'gold' : platingColor === 'SILVER' ? 'silver' : 'matte';
                        return (
                          <li className={`order-item ${stageClass}`} key={item.uid || index}>
                            <span className="order-item-symbol" aria-hidden="true"><i className="fa-solid fa-layer-group" /></span>
                            <div className="order-item-content">
                              <span className="order-item-title">{renderTextWithEnglishDigits(item.productName || 'بدون نام')}</span>
                              <span className="order-item-specs">
                                <bdi className="order-item-dimensions" dir="ltr">
                                  {hasDimensions ? (
                                    <>
                                      <span className="order-list-numeric">{diameter}</span>
                                      <span className="order-item-dimension-multiply">×</span>
                                      <span className="order-list-numeric">{thickness}</span>
                                    </>
                                  ) : (
                                    <span className="order-list-numeric">—</span>
                                  )}
                                </bdi>
                                <MetallicText tone={platingTone}>{PLATING_LABELS[platingColor]}</MetallicText>
                              </span>
                            </div>
                            <span className="order-item-metric order-item-progress-count" dir="rtl" aria-label="تعداد سفارش">
                              <bdi className="order-list-numeric order-item-ordered-count" dir="ltr">{formatCountValue(itemOrderedCount)}</bdi>
                              <i className="fa-solid fa-tag order-item-metric-icon" aria-hidden="true" />
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
              </ImageGlassSurface>
            );
          })
        )}
      </div>
    </div>
  );
};

export default OrderList;
