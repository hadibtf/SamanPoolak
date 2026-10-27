import { useApiQuery, liveRows } from '../hooks/useApiQuery';
import ApiReadStatus from '../components/ApiReadStatus';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { peopleApi, markingsApi, ordersApi, productionApi, ApiError } from '../api/client';
import JalaliDatePicker from '../components/JalaliDatePicker';
import MetallicText from '../components/MetallicText';
import { productionDateKey } from '../productionStatistics';
import { useAuth } from '../auth/AuthContext';
import { useSettings } from '../context/SettingsContext';
import {
  ORDER_STATES,
  ORDER_STATE_CHOICES,
  ORDER_STATE_LABELS,
  INITIAL_ORDER_STATE,
  MATERIAL_LABELS,
  PLATING_LABELS,
  INVOICE_PLATING_LABELS,
} from '../constants';
import styles from './Management.module.css';
import glassStyles from './OrderViewGlass.module.css';

const managementRootClass = styles.root;
void styles;

const fa = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fa-IR'));
const faDigits = (value) => String(value).replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[digit]);
const RIALS_PER_TOMAN = 10;
const formatInvoiceAmount = (amount, currency) => {
  const rialAmount = Number(amount) || 0;
  const displayAmount = currency === 'toman' ? rialAmount / RIALS_PER_TOMAN : rialAmount;
  return displayAmount.toLocaleString('fa-IR', {
    maximumFractionDigits: currency === 'toman' ? 2 : 0,
  });
};
const formatDimension = (value) => {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : '—';
};
const formatInvoiceDimension = (value) => {
  const formatted = formatDimension(value);
  return formatted === '—' ? formatted : `${formatted} mm`;
};
const formatInvoiceQuantityInput = (value) => {
  const digits = String(value ?? '').replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '';
};
const formatInvoicePriceInput = (value) => {
  const raw = String(value ?? '').replace(/,/g, '');
  if (!raw) return '';
  const formatted = (Number(raw) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
  return raw.endsWith('.') ? `${formatted}.` : formatted;
};
const invoiceItemKey = (item, index) => item.uid || `item-${index}`;
const formatDimensions = (item) => {
  const diameter = Number(item?.diameter);
  const thickness = Number(item?.thickness);
  if (!Number.isFinite(diameter) || diameter <= 0 || !Number.isFinite(thickness) || thickness <= 0) return '—';
  return `${formatDimension(item.diameter)} × ${formatDimension(item.thickness)}`;
};

const formatWeight = (grams) => {
  const g = Number(grams) || 0;
  if (g <= 0) return '—';
  if (g >= 1000) return `${(g / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} کیلوگرم`;
  return `${g.toLocaleString('fa-IR', { maximumFractionDigits: 2 })} گرم`;
};

const formatStamp = (ms) => {
  if (!ms) return '';
  return new DateObject({ date: ms, calendar: persian, locale: persian_fa }).format('YYYY/MM/DD - HH:mm');
};

const historyStateOptions = (entry) => {
  const options = ORDER_STATE_CHOICES
    .filter((choice) => choice.value)
    .map(({ value }) => ({ value, label: ORDER_STATE_LABELS[value] || value }));
  if (entry.event === 'PRODUCTION_RESUMED') {
    options.unshift({ value: 'PRODUCTION_RESUMED', label: 'ادامه تولید' });
  }
  const currentValue = entry.event === 'PRODUCTION_RESUMED' ? 'PRODUCTION_RESUMED' : entry.state;
  if (currentValue && !options.some((option) => option.value === currentValue)) {
    options.unshift({ value: currentValue, label: ORDER_STATE_LABELS[currentValue] || currentValue });
  }
  return options;
};

const formatJalali = (dateKey) => {
  if (!dateKey || dateKey.length !== 8) return '—';
  return faDigits(`${dateKey.slice(0, 4)}/${dateKey.slice(4, 6)}/${dateKey.slice(6, 8)}`);
};

const currentJalaliDateKey = () => productionDateKey(new DateObject({ calendar: persian, locale: persian_fa }));
const managerEmployeeIdentity = (employee) => employee?.personId
  ? { employeePersonId: employee.personId }
  : { employeeUserId: Number(employee?.userId) };
const pickerDateFromKey = (dateKey) => /^\d{8}$/.test(dateKey) ? new DateObject({
  calendar: persian,
  locale: persian_fa,
  year: Number(dateKey.slice(0, 4)),
  month: Number(dateKey.slice(4, 6)),
  day: Number(dateKey.slice(6, 8)),
}) : '';
const submissionKey = () => window.crypto?.randomUUID?.() || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

// Builds the customer-facing invoice description for an item.
const cleanInvoiceProductName = (item, index) => {
  const rowNumber = String(index + 1);
  const productName = String(item.productName || '').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  return productName.replace(new RegExp(`^\\s*${rowNumber}\\s*[-–—:]\\s*`), '');
};

const invoiceDescription = (item, index) => {
  const parts = [cleanInvoiceProductName(item, index)];
  if (item.isHardened) parts.push('سختکاری شده');
  const plating = INVOICE_PLATING_LABELS[item.platingColor] || '';
  if (plating) parts.push(plating);
  let desc = parts.join(' - ');
  if (item.description) desc += ` - ${item.description}`;
  return desc;
};

const invoiceDialogDescription = (item, index) => {
  const productName = cleanInvoiceProductName(item, index);
  const dimensions = formatDimensions(item);
  const plating = INVOICE_PLATING_LABELS[item.platingColor] || '';
  return (
    <>
      {productName}
      {dimensions !== '—' && <> - <bdi dir="ltr">{dimensions} mm</bdi></>}
      {item.isHardened && <> - سختکاری شده</>}
      {plating && <> - {plating}</>}
      {item.description && <> - {item.description}</>}
    </>
  );
};

// ---- One item panel (specs + state machine + weight reconciliation) ----
const ItemPanel = ({ item, index, markingMap, onUpdate, onToast, onProductionSummaryChange, orderId, canAssign, canViewProduction, hidden = false }) => {
  const dimensions = formatDimensions(item);
  const [nextState, setNextState] = useState('');
  const [stageWeight, setStageWeight] = useState('');
  const [stateNote, setStateNote] = useState('');
  const [editingHistoryIndex, setEditingHistoryIndex] = useState(null);
  const [historyEditState, setHistoryEditState] = useState('');
  const [mutatingHistory, setMutatingHistory] = useState(false);
  const [weightOf10Input, setWeightOf10Input] = useState('');
  const [savingWeightOf10, setSavingWeightOf10] = useState(false);
  const [editingWeightOf10, setEditingWeightOf10] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingQuantity, setEditingQuantity] = useState('');
  const [productionSummary, setProductionSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  const [manualDate, setManualDate] = useState(currentJalaliDateKey);
  const [manualWeightKg, setManualWeightKg] = useState('');
  const [manualEmployeeKey, setManualEmployeeKey] = useState('');
  const [savingManualLog, setSavingManualLog] = useState(false);
  const [resumingProduction, setResumingProduction] = useState(false);
  const [editingManagerLogId, setEditingManagerLogId] = useState(null);
  const [managerLogEditDate, setManagerLogEditDate] = useState('');
  const [managerLogEditWeightKg, setManagerLogEditWeightKg] = useState('');
  const [managerLogEditEmployeeKey, setManagerLogEditEmployeeKey] = useState('');
  const [mutatingManagerLogId, setMutatingManagerLogId] = useState(null);
  const [confirmingProductionStop, setConfirmingProductionStop] = useState(false);
  const manualPickerDate = useMemo(() => pickerDateFromKey(manualDate), [manualDate]);
  const managerLogEditPickerDate = useMemo(() => pickerDateFromKey(managerLogEditDate), [managerLogEditDate]);
  const managerDateBounds = useMemo(() => ({
    min: pickerDateFromKey('14050101'),
    max: pickerDateFromKey('14991229'),
  }), []);

  const loadSummary = () => {
    if (!canViewProduction) return;
    return productionApi.itemSummary(orderId, item.uid)
      .then((summary) => { setProductionSummary(summary); onProductionSummaryChange(item.uid, summary); setSummaryError(''); return summary; })
      .catch(() => { setProductionSummary(null); onProductionSummaryChange(item.uid, null); setSummaryError('اطلاعات رکورد دریافت نشد.'); });
  };

  useEffect(() => {
    if (!canAssign) return;
    productionApi.employees().then(({ employees: list }) => setEmployees(list || [])).catch(() => onToast('خطا در دریافت فهرست کارمندان.', 'error'));
  }, [canAssign, onToast]);

  useEffect(() => {
    if (!canViewProduction) return undefined;
    loadSummary();
    const interval = window.setInterval(loadSummary, 15000);
    return () => window.clearInterval(interval);
  }, [canViewProduction, orderId, item.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTaskQuantity = async (taskId) => {
    const value = Number(editingQuantity);
    if (!Number.isFinite(value) || value <= 0) { onToast('تعداد معتبر وارد کنید.', 'error'); return; }
    setAssigning(true);
    try {
      await productionApi.updateTask(taskId, { requiredQuantity: value });
      setEditingTaskId(null); loadSummary(); onToast('تعداد وظیفه به‌روزرسانی شد.');
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'ویرایش وظیفه انجام نشد.', 'error');
    } finally { setAssigning(false); }
  };

  const saveWeightOf10 = async () => {
    const weight = Number(weightOf10Input);
    if (!Number.isInteger(weight) || weight <= 0) { onToast('وزن ۱۰ قطعه را به‌صورت عدد صحیح و به گرم وارد کنید.', 'error'); return; }
    setSavingWeightOf10(true);
    try {
      const saved = await onUpdate(index, { weightOf10: weight });
      if (saved) {
        setEditingWeightOf10(false);
        setWeightOf10Input('');
        onToast(measuredWeightOf10 > 0 ? 'وزن نمونه به‌روزرسانی شد.' : 'وزن نمونه ثبت شد.');
      }
    } finally { setSavingWeightOf10(false); }
  };

  const saveManualProduction = async (event) => {
    event.preventDefault();
    const weightKg = Number(manualWeightKg);
    const employee = employees.find((candidate) => candidate.employeeKey === manualEmployeeKey);
    if (!employee || !manualDate || !Number.isFinite(weightKg) || weightKg <= 0 || savingManualLog) {
      onToast('تاریخ، وزن تولید و کارمند را کامل کنید.', 'error');
      return;
    }
    setSavingManualLog(true);
    try {
      await productionApi.logManagerProduction(orderId, item.uid, {
        ...managerEmployeeIdentity(employee),
        weightKg,
        productionDate: manualDate,
        submissionKey: submissionKey(),
      });
      setManualWeightKg('');
      await loadSummary();
      onToast('ثبت تولید مدیر ذخیره شد.');
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'ثبت تولید مدیر انجام نشد.', 'error');
    } finally { setSavingManualLog(false); }
  };

  const beginManagerLogEdit = (log) => {
    setEditingManagerLogId(log.id);
    setManagerLogEditDate(log.productionDate);
    setManagerLogEditWeightKg(String(Number(log.totalWeightGrams) / 1000));
    const employee = employees.find((candidate) => log.employeePersonId
      ? candidate.personId === log.employeePersonId
      : Number(candidate.userId) === Number(log.employeeUserId));
    setManagerLogEditEmployeeKey(employee?.employeeKey || (log.employeePersonId
      ? `person:${log.employeePersonId}`
      : `user:${log.employeeUserId}`));
  };

  const cancelManagerLogEdit = () => {
    setEditingManagerLogId(null);
    setManagerLogEditDate('');
    setManagerLogEditWeightKg('');
    setManagerLogEditEmployeeKey('');
  };

  const saveManagerLogEdit = async (event, log) => {
    event.preventDefault();
    const weightKg = Number(managerLogEditWeightKg);
    const employee = employees.find((candidate) => candidate.employeeKey === managerLogEditEmployeeKey);
    if (!managerLogEditDate || !employee || !Number.isFinite(weightKg) || weightKg <= 0) {
      onToast('تاریخ، وزن و کارمند را کامل کنید.', 'error');
      return;
    }
    setMutatingManagerLogId(log.id);
    try {
      await productionApi.updateManagerProduction(orderId, item.uid, log.id, {
        ...managerEmployeeIdentity(employee),
        weightKg,
        productionDate: managerLogEditDate,
      });
      cancelManagerLogEdit();
      await loadSummary();
      onToast('ثبت تولید ویرایش شد.');
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'ویرایش ثبت تولید انجام نشد.', 'error');
    } finally { setMutatingManagerLogId(null); }
  };

  const deleteManagerLog = async (log) => {
    if (!window.confirm('این ثبت دستی تولید حذف شود؟')) return;
    setMutatingManagerLogId(log.id);
    try {
      await productionApi.deleteManagerProduction(orderId, item.uid, log.id);
      if (editingManagerLogId === log.id) cancelManagerLogEdit();
      await loadSummary();
      onToast('ثبت تولید حذف شد.');
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'حذف ثبت تولید انجام نشد.', 'error');
    } finally { setMutatingManagerLogId(null); }
  };

  const history = [...(item.stateHistory || [])].reverse();
  const markImg = markingMap[item.markingId]?.src;
  const measuredWeightOf10 = Number(item.weightOf10) || 0;
  const unitWeight = measuredWeightOf10 > 0 ? measuredWeightOf10 / 10 : 0;
  const expectedTotalWeight = unitWeight * (Number(item.quantity) || 0);
  const productionLogs = productionSummary?.logs || [];
  const totalProducedWeight = productionLogs.reduce((sum, log) => sum + (Number(log.totalWeightGrams) || 0), 0);
  const hasUnknownProducedWeight = productionLogs.some((log) => !(Number(log.totalWeightGrams) > 0));
  const producedWeightLabel = !productionSummary ? '—'
    : productionLogs.length === 0 ? '۰ گرم'
      : totalProducedWeight <= 0 ? 'وزن ثبت نشده'
        : `${hasUnknownProducedWeight ? 'حداقل ' : ''}${formatWeight(totalProducedWeight)}`;
  const compactProducedWeightLabel = producedWeightLabel.replace(/ کیلوگرم/g, ' کیلو');
  const totalProducedQuantity = Number(productionSummary?.totalProduced) || 0;
  const orderQuantity = Number(item.quantity) || 0;
  const productionReachedTarget = Boolean(productionSummary) && totalProducedQuantity >= orderQuantity;
  const productionStopped = Boolean(item.productionStopped) || item.state === 'PRODUCTION_COMPLETE';
  const productionCompleteStateIndex = ORDER_STATES.findIndex((state) => state.value === 'PRODUCTION_COMPLETE');
  const itemStateIndex = ORDER_STATES.findIndex((state) => state.value === item.state);
  const workflowAdvancedPastProduction = item.state !== INITIAL_ORDER_STATE
    && itemStateIndex > productionCompleteStateIndex;
  const remainingQuantity = productionSummary ? Math.max(0, orderQuantity - totalProducedQuantity) : null;
  const remainingWeight = remainingQuantity == null ? null : unitWeight * remainingQuantity;
  const orderedProductionLogs = [...productionLogs].sort((a, b) => {
    const dateOrder = String(a.productionDate || '').localeCompare(String(b.productionDate || ''));
    if (dateOrder !== 0) return dateOrder;
    const createdOrder = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    if (createdOrder !== 0) return createdOrder;
    return Number(a.id) - Number(b.id);
  });
  const displayedProductionLogs = [...orderedProductionLogs].reverse();

  const confirmProductionStop = async () => {
    if (confirmingProductionStop) return;
    if (totalProducedQuantity < orderQuantity
      && !window.confirm(`تولید ${fa(totalProducedQuantity)} عدد از ${fa(orderQuantity)} عدد سفارش کمتر است. با تأیید، تولید همین مقدار نهایی می‌شود و ثبت تولید و تخصیص بسته خواهد شد. ادامه می‌دهید؟`)) return;
    setConfirmingProductionStop(true);
    try {
      const completionState = 'PRODUCTION_COMPLETE';
      const stateHistory = item.state === completionState
        ? [...(item.stateHistory || [])]
        : [...(item.stateHistory || []), { state: completionState, date: Date.now(), totalWeight: null }];
      const saved = await onUpdate(index, {
        productionStopped: true,
        state: completionState,
        stateHistory,
      });
      if (saved) onToast('پایان تولید این قلم تأیید شد.');
    } finally {
      setConfirmingProductionStop(false);
    }
  };

  const resumeProduction = async () => {
    if (resumingProduction) return;
    if (!window.confirm('با ادامه تولید، ثبت تولید و تخصیص این قلم دوباره فعال می‌شود. ادامه می‌دهید؟')) return;
    setResumingProduction(true);
    try {
      const stateHistory = (item.stateHistory || []).filter((entry) => entry.state !== 'PRODUCTION_COMPLETE');
      const resumedState = item.state === 'PRODUCTION_COMPLETE'
        ? [...stateHistory].reverse().find((entry) => entry.state)?.state || 'REGISTERED'
        : item.state;
      stateHistory.push({ state: resumedState, event: 'PRODUCTION_RESUMED', date: Date.now(), totalWeight: null });
      const saved = await onUpdate(index, {
        productionStopped: false,
        state: resumedState,
        stateHistory,
      });
      if (saved) {
        setNextState('');
        onToast('تولید ادامه پیدا می‌کند؛ ثبت و تخصیص دوباره فعال شد.');
      }
    } finally {
      setResumingProduction(false);
    }
  };

  const addState = () => {
    if (!nextState) { onToast('یک وضعیت انتخاب کنید.', 'error'); return; }
    if (nextState === 'PRODUCTION_RESUMED') { resumeProduction(); return; }
    const entry = {
      state: nextState,
      date: Date.now(),
      totalWeight: stageWeight === '' ? null : Number(stageWeight) * 1000,
      ...(stateNote.trim() ? { note: stateNote.trim() } : {}),
    };
    const stateHistory = [...(item.stateHistory || []), entry];
    onUpdate(index, { state: nextState, stateHistory });
    setNextState('');
    setStageWeight('');
    setStateNote('');
    onToast('وضعیت ثبت شد.');
  };

  const markDelivered = () => {
    const stateHistory = [
      ...(item.stateHistory || []),
      { state: 'DELIVERED_WORKSHOP', date: Date.now(), totalWeight: null },
    ];
    onUpdate(index, { state: 'DELIVERED_WORKSHOP', stateHistory });
    setNextState('');
    setStageWeight('');
    setStateNote('');
    onToast('تحویل مشتری ثبت شد.');
  };

  const undoLast = () => {
    const stateHistory = [...(item.stateHistory || [])];
    if (stateHistory.length <= 1) { onToast('حذف اولین وضعیت ممکن نیست.', 'error'); return; }
    stateHistory.pop();
    onUpdate(index, { state: stateHistory[stateHistory.length - 1].state, stateHistory });
    setEditingHistoryIndex(null);
    onToast('آخرین وضعیت حذف شد.');
  };

  const beginHistoryEdit = (historyIndex, entry) => {
    setEditingHistoryIndex(historyIndex);
    setHistoryEditState(entry.event === 'PRODUCTION_RESUMED' ? 'PRODUCTION_RESUMED' : entry.state || INITIAL_ORDER_STATE);
  };

  const cancelHistoryEdit = () => {
    setEditingHistoryIndex(null);
    setHistoryEditState('');
  };

  const saveHistoryEdit = async (historyIndex) => {
    if (mutatingHistory) return;
    const stateHistory = [...(item.stateHistory || [])];
    const entry = stateHistory[historyIndex];
    if (!entry || !historyEditState) return;

    const editedEntry = { ...entry };
    if (historyEditState === 'PRODUCTION_RESUMED') {
      if (entry.event !== 'PRODUCTION_RESUMED') return;
    } else {
      editedEntry.state = historyEditState;
      delete editedEntry.event;
    }
    stateHistory[historyIndex] = editedEntry;
    const currentState = stateHistory[stateHistory.length - 1]?.state || INITIAL_ORDER_STATE;

    setMutatingHistory(true);
    try {
      const saved = await onUpdate(index, { state: currentState, stateHistory });
      if (saved) {
        cancelHistoryEdit();
        onToast('وضعیت ویرایش شد.');
      }
    } finally {
      setMutatingHistory(false);
    }
  };

  const deleteHistoryEntry = async (historyIndex, entry) => {
    if (mutatingHistory) return;
    const label = entry.event === 'PRODUCTION_RESUMED'
      ? 'ادامه تولید'
      : (ORDER_STATE_LABELS[entry.state] || entry.state || 'وضعیت');
    if (!window.confirm(`وضعیت «${label}» از تاریخچه حذف شود؟`)) return;

    const stateHistory = [...(item.stateHistory || [])];
    if (!stateHistory[historyIndex]) return;
    stateHistory.splice(historyIndex, 1);
    const currentState = stateHistory[stateHistory.length - 1]?.state || INITIAL_ORDER_STATE;

    setMutatingHistory(true);
    try {
      const saved = await onUpdate(index, { state: currentState, stateHistory });
      if (saved) {
        cancelHistoryEdit();
        onToast('وضعیت از تاریخچه حذف شد.');
      }
    } finally {
      setMutatingHistory(false);
    }
  };

  const platingColor = item.platingColor === 'GOLD' || item.platingColor === 'SILVER'
    ? item.platingColor
    : 'NONE';
  const platingTone = platingColor === 'GOLD' ? 'gold' : platingColor === 'SILVER' ? 'silver' : 'matte';

  return (
    <div hidden={hidden} className={`item-panel ${glassStyles.stack}`}>
      <section className="order-section order-item-details" aria-label={`مشخصات ${item.productName || 'قطعه'}`}>
        <div className="order-details-heading">
          <h4 className="order-section-title">{item.productName || '—'}</h4>
        </div>
        <div className="order-spec-ribbon" aria-label="مشخصات سفارش">
          <div className="order-spec-item" data-kind="quantity">
            <i className="fa-solid fa-layer-group" aria-hidden="true" />
            <small>تعداد</small>
            <strong>{fa(item.quantity)}</strong>
          </div>
          <div className="order-spec-item" data-kind="plating" data-plating={platingColor}>
            <i className="fa-solid fa-droplet" aria-hidden="true" />
            <small>آبکاری</small>
            <MetallicText as="strong" className="order-spec-plating" tone={platingTone}>
              {PLATING_LABELS[platingColor]}
            </MetallicText>
          </div>
          <div className="order-spec-item" data-kind="material">
            <i className="fa-solid fa-circle-dot" aria-hidden="true" />
            <small>جنس ورق</small>
            <strong>{MATERIAL_LABELS[item.material] || '—'}</strong>
          </div>
          <div className="order-spec-item" data-kind="hardening">
            <i className="fa-solid fa-gear" aria-hidden="true" />
            <small>سخت‌کاری</small>
            <strong>{item.isHardened ? `بله${item.hardeningIntensity ? ` · ${item.hardeningIntensity}` : ''}` : 'خیر'}</strong>
          </div>
          <div className="order-spec-item" data-kind="estimated-weight">
            <i className="fa-solid fa-weight-hanging" aria-hidden="true" />
            <small>وزن برآوردی</small>
            <strong>{measuredWeightOf10 > 0 ? formatWeight(expectedTotalWeight) : '—'}</strong>
          </div>
          <div className="order-spec-item" data-kind="unit-weight">
            <i className="fa-solid fa-weight-hanging" aria-hidden="true" />
            <small>وزن واحد</small>
            <span className="order-spec-weight-value">
              {measuredWeightOf10 > 0 ? <button
                type="button"
                className="order-spec-weight-edit"
                aria-label="ویرایش وزن نمونه"
                onClick={() => {
                  setWeightOf10Input(String(measuredWeightOf10));
                  setEditingWeightOf10(true);
                }}
              >{formatWeight(unitWeight)}</button> : <strong>—</strong>}
            </span>
          </div>
        </div>
        {(measuredWeightOf10 <= 0 || editingWeightOf10) && (
          <div className="order-sample-weight-form">
            <label htmlFor={`weight-of-10-${item.uid}`}>وزن ۱۰ عدد (گرم)</label>
            <input
              id={`weight-of-10-${item.uid}`}
              aria-label="وزن ۱۰ عدد به گرم"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              dir="ltr"
              value={weightOf10Input}
              onChange={(event) => setWeightOf10Input(event.target.value)}
              placeholder="۰"
            />
            <button type="button" className="primary-btn compact" disabled={savingWeightOf10} onClick={saveWeightOf10}>
              {savingWeightOf10 ? 'در حال ذخیره...' : measuredWeightOf10 > 0 ? 'ذخیره' : 'ثبت'}
            </button>
            {editingWeightOf10 && <button type="button" className="weight-edit-cancel" disabled={savingWeightOf10} onClick={() => { setEditingWeightOf10(false); setWeightOf10Input(''); }}>انصراف</button>}
          </div>
        )}
        <div className="order-weight-facts" aria-label="مقادیر وزن و تولید">
          <div className="order-weight-fact" data-kind="remaining">
            <MetallicText as="small" tone="gold">باقی‌مانده</MetallicText>
            <strong><MetallicText tone="gold">{measuredWeightOf10 > 0 && remainingWeight != null ? formatWeight(remainingWeight) : '—'}</MetallicText></strong>
            <MetallicText as="span" tone="gold">{remainingQuantity == null ? '— عدد' : `${fa(remainingQuantity)} عدد`}</MetallicText>
          </div>
          <div className="order-weight-fact" data-kind="produced">
            <MetallicText as="small" tone="green">تولید</MetallicText>
            <strong><MetallicText tone="green">{productionSummary ? `${fa(totalProducedQuantity)} عدد` : '—'}</MetallicText></strong>
            <MetallicText as="span" tone="green">{compactProducedWeightLabel}</MetallicText>
          </div>
          <div className="order-weight-fact" data-kind="dimensions">
            <MetallicText as="small" tone="silver">ابعاد</MetallicText>
            <MetallicText as="strong" tone="silver" dir="ltr">{dimensions}{dimensions !== '—' ? ' mm' : ''}</MetallicText>
          </div>
        </div>
        {(markImg || item.markingName) && (
          <div className="marking-detail">
            <span>مارک</span>
            <div className="marking-detail-body">
              {markImg && <img src={markImg} alt={item.markingName} />}
              <strong>{item.markingName || '—'}</strong>
            </div>
          </div>
        )}
        {item.description && <p className="item-desc">{item.description}</p>}
      </section>

      <section className="order-section order-production-section" aria-label="رکورد">
        <h4 className="order-section-title">رکورد</h4>
        {canAssign && !productionStopped && measuredWeightOf10 > 0 && (
          <section className="manager-production-log-section" aria-label="ثبت دستی تولید توسط مدیر">
            <form className="manager-production-log-form" onSubmit={saveManualProduction}>
              <input aria-label="وزن" type="number" min="0.001" step="0.001" inputMode="decimal" dir="rtl" value={manualWeightKg} onChange={(event) => setManualWeightKg(event.target.value)} placeholder="وزن" required />
              <select aria-label="انتخاب کارمند" value={manualEmployeeKey} onChange={(event) => setManualEmployeeKey(event.target.value)} required>
                <option value="">انتخاب کارمند...</option>
                {employees.map((employee) => <option key={employee.employeeKey} value={employee.employeeKey}>{employee.name}</option>)}
              </select>
              <JalaliDatePicker
                aria-label="تاریخ تولید"
                value={manualPickerDate}
                onChange={(date) => setManualDate(productionDateKey(date))}
                calendar={persian}
                locale={persian_fa}
                weekDays={weekDays}
                format="YYYY/MM/DD"
                placeholder="تاریخ تولید"
                calendarPosition="bottom-left"
                minDate={managerDateBounds.min}
                maxDate={managerDateBounds.max}
                inputClass="rmdp-input"
                containerClassName="manager-production-date"
                portal
              />
              <button type="submit" className="manager-production-submit-btn" aria-label={savingManualLog ? 'در حال ثبت...' : 'ثبت'} disabled={savingManualLog || employees.length === 0}>
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              </button>
              {employees.length === 0 && <small>فهرست کارمندان در دسترس نیست.</small>}
            </form>
          </section>
        )}

        {canViewProduction && productionSummary && (
        <div className="production-summary">
          {canAssign && productionSummary.tasks.length > 0 && <div className="production-summary-list"><b>تخصیص‌ها</b>{productionSummary.tasks.map((task) => <div key={task.id} className="production-assignment-row"><span>{task.employeeName} — {fa(task.requiredQuantity)} عدد (تولید: {fa(task.producedQuantity)}) — {task.status} <small>{task.createdAt ? new Date(task.createdAt).toLocaleString('fa-IR') : ''}</small></span>{editingTaskId === task.id ? <span className="production-assignment-edit"><input type="number" min="0.001" step="0.001" value={editingQuantity} onChange={(event) => setEditingQuantity(event.target.value)} aria-label="تعداد جدید وظیفه" /><button type="button" disabled={assigning} onClick={() => saveTaskQuantity(task.id)}>ذخیره</button><button type="button" onClick={() => setEditingTaskId(null)}>انصراف</button></span> : <button type="button" onClick={() => { setEditingTaskId(task.id); setEditingQuantity(String(task.requiredQuantity)); }}>ویرایش</button>}</div>)}</div>}
          {displayedProductionLogs.length > 0 && <div className="production-record-list">
            <div className="production-record-table-wrap">
              <table className="production-record-table">
                <thead>
                  <tr>
                    <th scope="col">ردیف</th>
                    <th scope="col">اپراتور</th>
                    <th scope="col">وزن</th>
                    <th scope="col">تعداد</th>
                    <th scope="col">تاریخ</th>
                    <th scope="col">عملیات</th>
                  </tr>
                </thead>
                <tbody>{displayedProductionLogs.map((log, index) => {
                  const isEditing = editingManagerLogId === log.id;
                  return isEditing ? (
                    <tr key={log.id} className="production-record-edit-row">
                      <td colSpan={6}>
                        <form className="manager-production-log-edit-form" onSubmit={(event) => saveManagerLogEdit(event, log)}>
                          <JalaliDatePicker
                            aria-label="تاریخ تولید"
                            value={managerLogEditPickerDate}
                            onChange={(date) => setManagerLogEditDate(productionDateKey(date))}
                            calendar={persian}
                            locale={persian_fa}
                            weekDays={weekDays}
                            placeholder="تاریخ تولید"
                            calendarPosition="bottom-right"
                            minDate={managerDateBounds.min}
                            maxDate={managerDateBounds.max}
                            inputClass="rmdp-input"
                            containerClassName="manager-production-date"
                          />
                          <input aria-label="وزن" type="number" min="0.001" step="0.001" inputMode="decimal" dir="rtl" value={managerLogEditWeightKg} onChange={(event) => setManagerLogEditWeightKg(event.target.value)} placeholder="وزن" required />
                          <select aria-label="انتخاب کارمند" value={managerLogEditEmployeeKey} onChange={(event) => setManagerLogEditEmployeeKey(event.target.value)} required>
                            <option value="">انتخاب کارمند...</option>
                            {employees.map((employee) => <option key={employee.employeeKey} value={employee.employeeKey}>{employee.name}</option>)}
                          </select>
                          <div className="manager-production-log-edit-actions">
                            <button type="submit" className="primary-btn compact" disabled={mutatingManagerLogId === log.id}>{mutatingManagerLogId === log.id ? 'در حال ذخیره...' : 'ذخیره'}</button>
                            <button type="button" className="manager-log-cancel" onClick={cancelManagerLogEdit} disabled={mutatingManagerLogId === log.id}>انصراف</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={log.id}>
                      <td>{fa(displayedProductionLogs.length - index)}</td>
                      <td>{log.employeeName || '—'}</td>
                      <td>{log.totalWeightGrams ? `${fa(log.totalWeightGrams / 1000)} کیلوگرم` : '—'}</td>
                      <td>{fa(log.quantity)}</td>
                      <td>{formatJalali(log.productionDate)}</td>
                      <td>{log.isManagerEntry && <div className="manager-production-log-actions">
                        <button type="button" className="manager-log-edit-btn" onClick={() => beginManagerLogEdit(log)} disabled={mutatingManagerLogId === log.id}>ویرایش</button>
                        <button type="button" className="danger" onClick={() => deleteManagerLog(log)} disabled={mutatingManagerLogId === log.id}>{mutatingManagerLogId === log.id ? 'در حال انجام...' : 'حذف'}</button>
                      </div>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>}
        </div>
      )}
        {canAssign && (productionStopped || (productionSummary && productionReachedTarget)) && (
          <section className={`production-completion-panel${productionStopped ? ' is-confirmed' : ''}`} aria-live="polite">
            <div className="production-completion-summary">
              <strong>تکمیل</strong>
              <span>تعداد: {productionSummary ? fa(totalProducedQuantity) : '—'}</span>
              <span>وزن: {compactProducedWeightLabel}</span>
            </div>
            {productionStopped ? (
              <button type="button" className="production-completion-resume" disabled={resumingProduction} onClick={resumeProduction}>
                <i className="fa-solid fa-rotate-left" aria-hidden="true" />
                {resumingProduction ? 'در حال ادامه...' : 'ادامه تولید'}
              </button>
            ) : !workflowAdvancedPastProduction && (
              <button type="button" className="production-completion-confirm" disabled={confirmingProductionStop} onClick={confirmProductionStop}>
                {confirmingProductionStop ? 'در حال ذخیره...' : 'تأیید پایان تولید'}
              </button>
            )}
          </section>
        )}
        {canAssign && productionSummary && !productionReachedTarget && !productionStopped && !workflowAdvancedPastProduction && (
          <section className="production-short-completion" aria-label="پایان دستی تولید با کسری">
            <button type="button" disabled={confirmingProductionStop} onClick={confirmProductionStop}>
              {confirmingProductionStop ? 'در حال ذخیره...' : `تأیید اتمام تولید با ${fa(remainingQuantity)} کسری`}
            </button>
            <small>تولید شده {fa(totalProducedQuantity)}</small>
          </section>
        )}

        {summaryError && <p className="production-summary-error" role="status">{summaryError}</p>}
      </section>

      {/* State control + timeline */}
      <section className="order-section order-state-section" aria-label="وضعیت">
      <h4 className="order-section-title">وضعیت</h4>
      <div className="state-form">
        <select value={nextState} disabled={editingHistoryIndex !== null || mutatingHistory} onChange={(e) => setNextState(e.target.value)}>
          <option value="">انتخاب وضعیت جدید...</option>
          {ORDER_STATE_CHOICES.map((choice, choiceIndex) => choice.separator ? (
            <option key={`separator-${choiceIndex}`} value={`__separator-${choiceIndex}`} disabled>
              ────────────────
            </option>
          ) : (
            <option key={choice.value} value={choice.value}>{ORDER_STATE_LABELS[choice.value]}</option>
          ))}
        </select>
        <input
          type="number" step="0.1" dir="ltr" className="ltr-num"
          disabled={editingHistoryIndex !== null || mutatingHistory}
          value={stageWeight}
          onChange={(e) => setStageWeight(e.target.value)}
          placeholder="وزن کل (کیلوگرم) - اختیاری"
        />
        <input
          type="text"
          disabled={editingHistoryIndex !== null || mutatingHistory}
          value={stateNote}
          onChange={(e) => setStateNote(e.target.value)}
          placeholder="یادداشت وضعیت - اختیاری"
        />
        <button className="primary-btn compact" disabled={editingHistoryIndex !== null || mutatingHistory} onClick={addState}>ثبت وضعیت</button>
      </div>

      <div className="timeline">
        <div className="timeline-head">
          <h4>تاریخچه وضعیت</h4>
          {history.length > 1 && (
            <button className="link-btn" disabled={editingHistoryIndex !== null || mutatingHistory} onClick={undoLast}>
              <i className="fa-solid fa-rotate-left"></i> حذف آخرین
            </button>
          )}
        </div>
        {history.map((h, i) => {
          const historyIndex = history.length - i - 1;
          const isEditing = editingHistoryIndex === historyIndex;
          const editValue = h.event === 'PRODUCTION_RESUMED' ? 'PRODUCTION_RESUMED' : h.state;
          const options = historyStateOptions(h);
          const label = h.event === 'PRODUCTION_RESUMED' ? 'ادامه تولید' : (ORDER_STATE_LABELS[h.state] || h.state);
          return (
            <div key={historyIndex} className={`timeline-item${i === 0 ? ' current' : ''}${h.event === 'PRODUCTION_RESUMED' ? ' resumed' : ''}`}>
              <span className="timeline-dot" />
              <div className="timeline-body">
                {isEditing ? (
                  <select
                    className="timeline-state-editor"
                    aria-label={`ویرایش وضعیت ${label}`}
                    value={historyEditState || editValue}
                    disabled={mutatingHistory}
                    onChange={(event) => setHistoryEditState(event.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <strong>{label}</strong>
                )}
                {h.date && <span className="timeline-date">{formatStamp(h.date)}</span>}
                {h.totalWeight != null && <span className="timeline-weight">وزن: {formatWeight(h.totalWeight)}</span>}
                {h.note && <span className="timeline-note">یادداشت: {h.note}</span>}
              </div>
              {isEditing ? (
                <div className="timeline-entry-actions">
                  <button type="button" className="timeline-save-action" disabled={mutatingHistory} onClick={() => saveHistoryEdit(historyIndex)}>
                    {mutatingHistory ? 'در حال ذخیره...' : 'ذخیره'}
                  </button>
                  <button type="button" className="timeline-cancel-action" disabled={mutatingHistory} onClick={cancelHistoryEdit}>انصراف</button>
                </div>
              ) : (
                <div className="timeline-entry-actions">
                  <button
                    type="button"
                    className="link-btn timeline-entry-action"
                    aria-label={`ویرایش ${label}`}
                    title="ویرایش وضعیت"
                    disabled={mutatingHistory || editingHistoryIndex !== null}
                    onClick={() => beginHistoryEdit(historyIndex, h)}
                  ><i className="fa-solid fa-pen-to-square" aria-hidden="true" /></button>
                  <button
                    type="button"
                    className="link-btn danger timeline-entry-action"
                    aria-label={`حذف ${label}`}
                    title="حذف وضعیت"
                    disabled={mutatingHistory || editingHistoryIndex !== null}
                    onClick={() => deleteHistoryEntry(historyIndex, h)}
                  ><i className="fa-solid fa-trash-can" aria-hidden="true" /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="state-delivery-quick-action">
        <button
          type="button"
          className="primary-btn compact state-delivery-quick-btn"
          disabled={editingHistoryIndex !== null || mutatingHistory}
          onClick={markDelivered}
        >تحویل شد</button>
      </div>
      </section>
    </div>
  );
};

const OrderView = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const linkedItemUid = searchParams.get('itemUid');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currency: displayCurrency, fromRial, toRial } = useSettings();
  const invoiceCurrency = displayCurrency === 'TOMAN' ? 'toman' : 'rial';
  const [invoiceOrientation, setInvoiceOrientation] = useState('portrait');
  const [invoiceQuantities, setInvoiceQuantities] = useState({});
  const [invoicePrices, setInvoicePrices] = useState({});
  const [isInvoiceExportOpen, setIsInvoiceExportOpen] = useState(false);
  const [isExportingInvoice, setIsExportingInvoice] = useState(false);
  const orderId = Number(id);

  const orderQuery = useApiQuery(async () => {
    try { return (await ordersApi.get(orderId)).order; }
    catch (error) { if (error.status === 404) return null; throw error; }
  }, [orderId]);
  const { data: order, setData: setOrder } = orderQuery;
  const markingsQuery = useApiQuery(async () => order?.customerId == null ? [] : liveRows((await markingsApi.list({ customerId: order.customerId })).markings), [order?.customerId]);
  const { data: markings } = markingsQuery;
  const customerQuery = useApiQuery(async () => {
    if (order?.customerId == null) return null;
    try { return (await peopleApi.get(order.customerId)).person; }
    catch (error) { if (error.status === 404) return null; throw error; }
  }, [order?.customerId]);
  const { data: customer } = customerQuery;

  const [toast, setToast] = useState(null);
  const [productionQuantities, setProductionQuantities] = useState({});
  const [selectedItemUid, setSelectedItemUid] = useState(linkedItemUid);
  const invoiceRef = useRef(null);

  useEffect(() => setSelectedItemUid(linkedItemUid), [linkedItemUid, orderId]);
  useEffect(() => {
    if (!isInvoiceExportOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !isExportingInvoice) setIsInvoiceExportOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isInvoiceExportOpen, isExportingInvoice]);

  const markingMap = useMemo(() => {
    const map = {};
    (markings || []).forEach((m) => { map[m.id] = m; });
    return map;
  }, [markings]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  if (orderQuery.error) return <div className={`${managementRootClass} order-view`}><ApiReadStatus queries={[orderQuery]} /></div>;
  if (order === undefined) {
    return <div className={`${managementRootClass} order-view`}><p className="hint-text">در حال بارگذاری...</p></div>;
  }
  if (order === null) {
    return (
      <div className={`${managementRootClass} order-view`}>
      <ApiReadStatus queries={[orderQuery, markingsQuery, customerQuery]} />
        <div className="page-back">
          <button className="back-btn" onClick={() => navigate('/orders/list')}>
            <i className="fa-solid fa-chevron-left"></i><span>بازگشت</span>
          </button>
        </div>
        <p className="hint-text">سفارش یافت نشد.</p>
      </div>
    );
  }

  const items = order.items || [];
  const selectedItem = items.find((item) => item.uid === selectedItemUid) || items[0] || null;
  const productionCompleteIndex = ORDER_STATES.findIndex((state) => state.value === 'PRODUCTION_COMPLETE');
  const reportItemProduction = (uid, summary) => {
    const quantity = summary == null ? null : Number(summary.totalProduced) || 0;
    setProductionQuantities((previous) => previous[uid] === quantity
      ? previous
      : { ...previous, [uid]: quantity });
    if (summary?.orderItem) {
      const currentState = summary.orderItem;
      setOrder((currentOrder) => {
        if (!currentOrder) return currentOrder;
        let changed = false;
        const updatedItems = (currentOrder.items || []).map((currentItem) => {
          if (currentItem.uid !== uid) return currentItem;
          const nextHistory = currentState.stateHistory || [];
          if (currentItem.state === currentState.state
            && Boolean(currentItem.productionStopped) === Boolean(currentState.productionStopped)
            && JSON.stringify(currentItem.stateHistory || []) === JSON.stringify(nextHistory)) return currentItem;
          changed = true;
          return { ...currentItem, state: currentState.state, stateHistory: nextHistory, productionStopped: Boolean(currentState.productionStopped) };
        });
        return changed ? { ...currentOrder, items: updatedItems } : currentOrder;
      });
    }
  };

  const updateItem = async (index, patch) => {
    const newItems = items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    try {
      const { order: updated } = await ordersApi.update(orderId, { items: newItems });
      setOrder(updated);
      return true;
    } catch (error) {
      console.error('Failed to update order:', error);
      showToast(
        error instanceof ApiError && error.status === 0
          ? 'برای ذخیره نیاز به اتصال اینترنت دارید.'
          : 'خطا در ذخیره.',
        'error'
      );
      return false;
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('آیا از حذف این سفارش اطمینان دارید؟')) return;
    try {
      await ordersApi.remove(orderId);
      navigate('/orders/list');
    } catch (error) {
      console.error('Failed to delete order:', error);
      showToast(
        error instanceof ApiError && error.status === 0
          ? 'برای حذف نیاز به اتصال اینترنت دارید.'
          : 'خطا در حذف.',
        'error'
      );
    }
  };

  const phones = (customer?.phones || []).filter(Boolean);
  const addresses = (customer?.addresses || []).filter(Boolean);
  const invoiceDate = new DateObject({ calendar: persian, locale: persian_fa }).format('YYYY/MM/DD');
  const getInvoiceQuantity = (item, index) => Math.max(0, Math.floor(Number(invoiceQuantities[invoiceItemKey(item, index)]) || 0));
  const invoiceGrandTotal = items.reduce(
    (sum, item, index) => sum + (Number(item.salePrice) || 0) * getInvoiceQuantity(item, index),
    0
  );

  const openInvoiceExport = () => {
    setInvoiceOrientation('portrait');
    setInvoiceQuantities(Object.fromEntries(items.map((item, index) => [
      invoiceItemKey(item, index),
      Math.max(0, Number(productionQuantities[item.uid]) || 0),
    ])));
    setInvoicePrices(Object.fromEntries(items.map((item, index) => [
      invoiceItemKey(item, index),
      item.salePrice == null ? '' : formatInvoicePriceInput(fromRial(item.salePrice)),
    ])));
    setIsInvoiceExportOpen(true);
  };

  const handleExportInvoice = async () => {
    if (!invoiceRef.current) return;
    setIsExportingInvoice(true);
    let savingPrices = false;
    let exportSucceeded = false;
    try {
      const nextItems = items.map((item, index) => {
        const rawPrice = String(invoicePrices[invoiceItemKey(item, index)] ?? '').replace(/,/g, '').trim();
        const nextPrice = rawPrice === '' ? null : toRial(Number(rawPrice));
        return { ...item, salePrice: nextPrice };
      });
      const pricesChanged = nextItems.some((item, index) => (
        (item.salePrice == null ? null : Number(item.salePrice))
        !== (items[index].salePrice == null ? null : Number(items[index].salePrice))
      ));
      if (pricesChanged) {
        savingPrices = true;
        const { order: updatedOrder } = await ordersApi.update(orderId, { items: nextItems });
        flushSync(() => setOrder(updatedOrder));
        savingPrices = false;
      }
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 1.5,
        backgroundColor: '#ffffff',
        imageTimeout: 5000,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const pdf = new jsPDF({ orientation: invoiceOrientation, unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.width / canvas.height;
      const pageRatio = pageW / pageH;
      let w, h;
      if (imgRatio > pageRatio) { w = pageW; h = pageW / imgRatio; }
      else { h = pageH; w = pageH * imgRatio; }
      pdf.addImage(imgData, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);

      // Name the file after the company (or customer) + order date.
      const who = (customer?.companyName?.trim() || order.customerName || 'فاکتور').replace(/\s+/g, '-');
      const fileName = `${who}-${order.date}.pdf`;
      // Plain in-memory browser download — nothing is stored server-side.
      pdf.save(fileName);
      exportSucceeded = true;
    } catch (error) {
      console.error('Invoice export failed:', error);
      showToast(savingPrices ? 'ذخیره قیمت‌های سفارش انجام نشد و فاکتور صادر نشد.' : 'خطا در صدور فاکتور.', 'error');
    } finally {
      setIsExportingInvoice(false);
      if (exportSucceeded) setIsInvoiceExportOpen(false);
    }
  };

  return (
    <div className={`${managementRootClass} order-view ${glassStyles.page}`}>
      <ApiReadStatus queries={[orderQuery, markingsQuery, customerQuery]} />
      <div className={glassStyles.overview}>
      <div className="page-back">
        <button className="back-btn" onClick={() => navigate('/orders/list')}>
          <i className="fa-solid fa-chevron-left"></i><span>بازگشت</span>
        </button>
        <div className="page-actions">
          <button className="icon-btn" onClick={openInvoiceExport} title="صدور فاکتور">
            <i className="fa-solid fa-file-invoice"></i>
          </button>
          <button className="icon-btn" onClick={() => navigate(`/orders/edit/${orderId}`)} title="ویرایش">
            <i className="fa-solid fa-pen-to-square"></i>
          </button>
          <button className="icon-btn danger" onClick={handleDelete} title="حذف">
            <i className="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>

      <section className="order-glance-section" aria-label="خلاصه سریع سفارش">
        <div className="order-header-card">
          <div className="order-header-customer">
            <strong>{order.customerName || '—'}</strong>
          </div>
          <div className="order-header-company" aria-hidden={!customer?.companyName?.trim()}>
            {customer?.companyName?.trim() && <strong>{customer.companyName.trim()}</strong>}
          </div>
          <div className="order-header-number" dir="ltr">
            <strong>{order.orderNumber}</strong>
          </div>
          <div className="order-header-date">
            <strong dir="ltr">{formatJalali(order.date)}</strong>
          </div>
        </div>

        <div className="order-glance-table-wrap">
          <table className="order-glance-table">
            <thead>
              <tr>
                <th scope="col" className="order-glance-row-number">ردیف</th>
                <th scope="col">نام محصول</th>
                <th scope="col"><span className="order-glance-head-full">سفارش</span><span className="order-glance-head-short">سفارش</span></th>
                <th scope="col"><span className="order-glance-head-full">تولید</span><span className="order-glance-head-short">تولید</span></th>
                <th scope="col">مانده</th>
                <th scope="col"><span className="order-glance-head-full">وضعیت</span><span className="order-glance-head-short">انجام</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const produced = productionQuantities[item.uid];
                const quantity = Number(item.quantity) || 0;
                const remaining = produced == null ? null : Math.max(quantity - Number(produced), 0);
                const dimensions = formatDimensions(item);
                const platingColor = item.platingColor === 'GOLD' || item.platingColor === 'SILVER'
                  ? item.platingColor
                  : 'NONE';
                const platingTone = platingColor === 'GOLD' ? 'gold' : platingColor === 'SILVER' ? 'silver' : 'matte';
                const stateIndex = ORDER_STATES.findIndex((state) => state.value === item.state);
                const isDone = Boolean(item.productionStopped)
                  || (item.state !== INITIAL_ORDER_STATE && stateIndex >= productionCompleteIndex)
                  || (produced != null && produced >= quantity);
                return (
                  <tr
                    key={item.uid}
                    className={selectedItem?.uid === item.uid ? 'is-selected' : undefined}
                    onClick={() => setSelectedItemUid(item.uid)}
                  >
                    <td className="order-glance-row-number">{fa(index + 1)}</td>
                    <th scope="row">
                      <button
                        type="button"
                        className="order-glance-select"
                        aria-pressed={selectedItem?.uid === item.uid}
                        onClick={() => setSelectedItemUid(item.uid)}
                      >
                        <span className="order-glance-product">
                          <span className="order-glance-product-name" title={item.productName || '—'}>{item.productName || '—'}</span>
                          <bdi className="order-glance-dimensions" dir="ltr">{dimensions}</bdi>
                          <MetallicText className="order-glance-plating" tone={platingTone}>
                            {PLATING_LABELS[platingColor]}
                          </MetallicText>
                        </span>
                      </button>
                    </th>
                    <td>{fa(quantity)}</td>
                    <td>{produced == null ? '—' : fa(produced)}</td>
                    <td>{remaining == null ? '—' : fa(remaining)}</td>
                    <td><span className={`order-glance-state${isDone ? ' is-done' : ''}`}><i className={`fa-solid ${isDone ? 'fa-circle-check' : 'fa-clock'}`} aria-hidden="true" /><span className="order-glance-state-full">{isDone ? 'تکمیل شده' : 'در حال انجام'}</span><span className="order-glance-state-short">{isDone ? 'کامل' : 'مانده'}</span></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      </div>

      {/* Item panels */}
      {items.map((item, index) => (
        <ItemPanel
          key={item.uid || index}
          item={item}
          index={index}
          markingMap={markingMap}
          onUpdate={updateItem}
          onToast={showToast}
          onProductionSummaryChange={reportItemProduction}
          orderId={orderId}
          canAssign={user?.role === 'admin'}
          canViewProduction={user?.role !== 'employee'}
          hidden={item.uid !== selectedItem?.uid}
        />
      ))}

      {/* Off-screen invoice (PDF source) */}
      <div className="invoice-offscreen" aria-hidden="true">
        <div className="invoice-sheet" data-orientation={invoiceOrientation} ref={invoiceRef}>
          <div className="invoice-head">
            <div>
              <h1>فاکتور فروش</h1>
              <div className="invoice-meta">شماره سفارش: {order.orderNumber}</div>
            </div>
            <div className="invoice-meta-left">
              <div>تاریخ: {invoiceDate}</div>
            </div>
          </div>

          <div className="invoice-customer">
            <div><span>مشتری:</span> <strong>{order.customerName}</strong></div>
            {phones.length > 0 && <div><span>تلفن:</span> {phones.join(' ، ')}</div>}
            {addresses.length > 0 && <div><span>نشانی:</span> {addresses.join(' — ')}</div>}
          </div>

          <table className="invoice-table">
            <thead>
              <tr>
                <th className="c-num">ردیف</th>
                <th>شرح کالا</th>
                <th className="c-dimension">ضخامت</th>
                <th className="c-dimension">قطر</th>
                <th className="c-qty">تعداد</th>
                <th className="c-unit">واحد</th>
                <th className="c-price">قیمت واحد</th>
                <th className="c-price">جمع</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.uid || i}>
                  <td className="c-num">{(i + 1).toLocaleString('fa-IR')}</td>
                  <td className="c-desc">{invoiceDescription(it, i)}</td>
                  <td className="c-dimension"><bdi dir="ltr">{formatInvoiceDimension(it.thickness)}</bdi></td>
                  <td className="c-dimension"><bdi dir="ltr">{formatInvoiceDimension(it.diameter)}</bdi></td>
                  <td className="c-qty">{fa(getInvoiceQuantity(it, i))}</td>
                  <td className="c-unit">عدد</td>
                  <td className="c-price"><bdi>{formatInvoiceAmount(it.salePrice, invoiceCurrency)}</bdi> {invoiceCurrency === 'toman' ? 'تومان' : 'ریال'}</td>
                  <td className="c-price"><bdi>{formatInvoiceAmount((Number(it.salePrice) || 0) * getInvoiceQuantity(it, i), invoiceCurrency)}</bdi> {invoiceCurrency === 'toman' ? 'تومان' : 'ریال'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} className="c-total-label">جمع کل</td>
                <td className="c-price"><bdi>{formatInvoiceAmount(invoiceGrandTotal, invoiceCurrency)}</bdi> {invoiceCurrency === 'toman' ? 'تومان' : 'ریال'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {isInvoiceExportOpen && (
        <div className={glassStyles.invoiceExportBackdrop} onMouseDown={() => !isExportingInvoice && setIsInvoiceExportOpen(false)}>
          <section
            className={glassStyles.invoiceExportDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-export-title"
            dir="rtl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={glassStyles.invoiceExportHeader}>
              <span className={glassStyles.invoiceExportIcon}><i className="fa-solid fa-file-invoice-dollar" aria-hidden="true" /></span>
              <button type="button" className={glassStyles.invoiceExportClose} onClick={() => setIsInvoiceExportOpen(false)} aria-label="بستن" disabled={isExportingInvoice}>
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
              <h2 id="invoice-export-title">صدور فاکتور</h2>
            </header>

            <div className={glassStyles.invoiceExportBody}>
              <div className={glassStyles.invoiceOrientationControl}>
                <span>جهت فاکتور</span>
                <div role="group" aria-label="جهت فاکتور">
                  <button type="button" className={invoiceOrientation === 'portrait' ? glassStyles.invoiceOrientationActive : ''} aria-pressed={invoiceOrientation === 'portrait'} onClick={() => setInvoiceOrientation('portrait')}>
                    <i className="fa-regular fa-file-lines" aria-hidden="true" /> عمودی
                  </button>
                  <button type="button" className={invoiceOrientation === 'landscape' ? glassStyles.invoiceOrientationActive : ''} aria-pressed={invoiceOrientation === 'landscape'} onClick={() => setInvoiceOrientation('landscape')}>
                    <i className="fa-regular fa-image" aria-hidden="true" /> افقی
                  </button>
                </div>
              </div>
              <div className={glassStyles.invoiceQuantityList}>
                <div className={glassStyles.invoiceQuantityHeading}><strong>تعداد و قیمت هر قلم</strong></div>
                {items.map((item, index) => {
                  const key = invoiceItemKey(item, index);
                  return (
                    <label className={glassStyles.invoiceQuantityRow} key={key}>
                      <span className={glassStyles.invoiceQuantityProduct}>
                        <strong>{invoiceDialogDescription(item, index)}</strong>
                      </span>
                      <span className={glassStyles.invoiceQuantityInputWrap}>
                        <input
                          type="tel"
                          inputMode="numeric"
                          enterKeyHint="done"
                          autoComplete="off"
                          dir="ltr"
                          value={formatInvoiceQuantityInput(invoiceQuantities[key] ?? 0)}
                          placeholder="تعداد"
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => {
                            const normalized = event.target.value
                              .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
                              .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
                              .replace(/\D/g, '');
                            setInvoiceQuantities((previous) => ({ ...previous, [key]: normalized }));
                          }}
                          aria-label={`تعداد فاکتور ${item.productName || index + 1}`}
                        />
                      </span>
                      <span className={glassStyles.invoicePriceInputWrap}>
                        <input
                          type="text"
                          inputMode="decimal"
                          enterKeyHint="done"
                          autoComplete="off"
                          dir="ltr"
                          value={formatInvoicePriceInput(invoicePrices[key] ?? '')}
                          placeholder="قیمت"
                          title={`قیمت واحد به ${invoiceCurrency === 'toman' ? 'تومان' : 'ریال'}`}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => {
                            const normalized = event.target.value
                              .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
                              .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
                              .replace(/,/g, '')
                              .replace(/[^\d.]/g, '');
                            const [integerPart, ...fractionParts] = normalized.split('.');
                            const nextValue = fractionParts.length
                              ? `${integerPart}.${fractionParts.join('').slice(0, 1)}`
                              : integerPart;
                            setInvoicePrices((previous) => ({ ...previous, [key]: nextValue }));
                          }}
                          aria-label={`قیمت واحد ${item.productName || index + 1} به ${invoiceCurrency === 'toman' ? 'تومان' : 'ریال'}`}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <footer className={glassStyles.invoiceExportActions}>
              <button type="button" className={glassStyles.invoiceExportCancel} onClick={() => setIsInvoiceExportOpen(false)} disabled={isExportingInvoice}>انصراف</button>
              <button type="button" className={glassStyles.invoiceExportConfirm} onClick={handleExportInvoice} disabled={isExportingInvoice}>
                {isExportingInvoice ? 'در حال ذخیره و صدور…' : 'ذخیره قیمت و صدور فاکتور'}
              </button>
            </footer>
          </section>
        </div>
      )}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default OrderView;
