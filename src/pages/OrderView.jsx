import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { db } from '../db';
import { ordersApi, productionApi, ApiError } from '../api/client';
import JalaliDatePicker from '../components/JalaliDatePicker';
import MetallicText from '../components/MetallicText';
import { productionDateKey } from '../productionStatistics';
import { useAuth } from '../auth/AuthContext';
import {
  ORDER_STATES,
  ORDER_STATE_LABELS,
  MATERIAL_LABELS,
  PLATING_LABELS,
  INVOICE_PLATING_LABELS,
} from '../constants';
import styles from './Management.module.css';

const managementRootClass = styles.root;
void styles;

const fa = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fa-IR'));
const faDigits = (value) => String(value).replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[digit]);
// Raw Rial formatting — the invoice is always in Rial, never converted.
const faRial = (n) => Math.round(Number(n) || 0).toLocaleString('fa-IR');
const formatDimension = (value) => {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : '—';
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

const formatJalali = (dateKey) => {
  if (!dateKey || dateKey.length !== 8) return '—';
  return faDigits(`${dateKey.slice(0, 4)}/${dateKey.slice(4, 6)}/${dateKey.slice(6, 8)}`);
};

const currentJalaliDateKey = () => productionDateKey(new DateObject({ calendar: persian, locale: persian_fa }));
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
const invoiceDescription = (item) => {
  const parts = [item.productName];
  if (item.isHardened) parts.push('سختکاری شده');
  const plating = INVOICE_PLATING_LABELS[item.platingColor] || '';
  if (plating) parts.push(plating);
  let desc = parts.join(' - ');
  if (item.thickness != null || item.diameter != null) {
    desc += ` ${formatDimension(item.diameter)} × ${formatDimension(item.thickness)} mm`;
  }
  if (item.description) desc += ` - ${item.description}`;
  return desc;
};

// ---- One item panel (specs + state machine + weight reconciliation) ----
const ItemPanel = ({ item, index, markingMap, onUpdate, onToast, onProductionSummaryChange, orderId, canAssign, canViewProduction, hidden = false }) => {
  const [nextState, setNextState] = useState('');
  const [stageWeight, setStageWeight] = useState('');
  const [stateNote, setStateNote] = useState('');
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
  const [manualEmployeeId, setManualEmployeeId] = useState('');
  const [savingManualLog, setSavingManualLog] = useState(false);
  const [resumingProduction, setResumingProduction] = useState(false);
  const [editingManagerLogId, setEditingManagerLogId] = useState(null);
  const [managerLogEditDate, setManagerLogEditDate] = useState('');
  const [managerLogEditWeightKg, setManagerLogEditWeightKg] = useState('');
  const [managerLogEditEmployeeId, setManagerLogEditEmployeeId] = useState('');
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
    if (!manualEmployeeId || !manualDate || !Number.isFinite(weightKg) || weightKg <= 0 || savingManualLog) {
      onToast('تاریخ، وزن تولید و کارمند را کامل کنید.', 'error');
      return;
    }
    setSavingManualLog(true);
    try {
      await productionApi.logManagerProduction(orderId, item.uid, {
        employeeUserId: Number(manualEmployeeId),
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
    setManagerLogEditEmployeeId(String(log.employeeUserId));
  };

  const cancelManagerLogEdit = () => {
    setEditingManagerLogId(null);
    setManagerLogEditDate('');
    setManagerLogEditWeightKg('');
    setManagerLogEditEmployeeId('');
  };

  const saveManagerLogEdit = async (event, log) => {
    event.preventDefault();
    const weightKg = Number(managerLogEditWeightKg);
    if (!managerLogEditDate || !managerLogEditEmployeeId || !Number.isFinite(weightKg) || weightKg <= 0) {
      onToast('تاریخ، وزن و کارمند را کامل کنید.', 'error');
      return;
    }
    setMutatingManagerLogId(log.id);
    try {
      await productionApi.updateManagerProduction(orderId, item.uid, log.id, {
        employeeUserId: Number(managerLogEditEmployeeId),
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
  const workflowAdvancedPastProduction = itemStateIndex > productionCompleteStateIndex;
  const remainingQuantity = productionSummary ? Math.max(0, orderQuantity - totalProducedQuantity) : null;
  const remainingWeight = remainingQuantity == null ? null : unitWeight * remainingQuantity;

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

  const undoLast = () => {
    const stateHistory = [...(item.stateHistory || [])];
    if (stateHistory.length <= 1) { onToast('حذف اولین وضعیت ممکن نیست.', 'error'); return; }
    stateHistory.pop();
    onUpdate(index, { state: stateHistory[stateHistory.length - 1].state, stateHistory });
    onToast('آخرین وضعیت حذف شد.');
  };

  const platingColor = item.platingColor === 'GOLD' || item.platingColor === 'SILVER'
    ? item.platingColor
    : 'NONE';
  const platingTone = platingColor === 'GOLD' ? 'gold' : platingColor === 'SILVER' ? 'silver' : 'matte';

  return (
    <div hidden={hidden} className={`glass-card item-panel ${index % 2 === 0 ? 'item-panel-tone-white' : 'item-panel-tone-blue'}`}>
      <section className="order-section order-item-details" aria-label={`مشخصات ${item.productName || 'قطعه'}`}>
        <h4 className="order-section-title">{item.productName || '—'}</h4>
        <div className="order-spec-ribbon" aria-label="مشخصات سفارش">
          <div className="order-spec-item" data-kind="quantity">
            <small>تعداد</small>
            <strong>{fa(item.quantity)}</strong>
          </div>
          <div className="order-spec-item" data-kind="plating" data-plating={platingColor}>
            <small>آبکاری</small>
            <MetallicText as="strong" className="order-spec-plating" tone={platingTone}>
              {PLATING_LABELS[platingColor]}
            </MetallicText>
          </div>
          <div className="order-spec-item" data-kind="material">
            <small>جنس ورق</small>
            <strong>{MATERIAL_LABELS[item.material] || '—'}</strong>
          </div>
          <div className="order-spec-item" data-kind="hardening">
            <small>سخت‌کاری</small>
            <strong>{item.isHardened ? `بله${item.hardeningIntensity ? ` · ${item.hardeningIntensity}` : ''}` : 'خیر'}</strong>
          </div>
          <div className="order-spec-item" data-kind="estimated-weight">
            <small>وزن برآوردی</small>
            <strong>{measuredWeightOf10 > 0 ? formatWeight(expectedTotalWeight) : '—'}</strong>
          </div>
          <div className="order-spec-item" data-kind="unit-weight">
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
            <MetallicText as="strong" tone="silver" dir="ltr">{formatDimension(item.diameter)} × {formatDimension(item.thickness)} mm</MetallicText>
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
              <select aria-label="انتخاب کارمند" value={manualEmployeeId} onChange={(event) => setManualEmployeeId(event.target.value)} required>
                <option value="">انتخاب کارمند...</option>
                {employees.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.name}</option>)}
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

        {canAssign && productionSummary && (
        <div className="production-summary">
          {productionSummary.tasks.length > 0 && <div className="production-summary-list"><b>تخصیص‌ها</b>{productionSummary.tasks.map((task) => <div key={task.id} className="production-assignment-row"><span>{task.employeeName} — {fa(task.requiredQuantity)} عدد (تولید: {fa(task.producedQuantity)}) — {task.status} <small>{task.createdAt ? new Date(task.createdAt).toLocaleString('fa-IR') : ''}</small></span>{editingTaskId === task.id ? <span className="production-assignment-edit"><input type="number" min="0.001" step="0.001" value={editingQuantity} onChange={(event) => setEditingQuantity(event.target.value)} aria-label="تعداد جدید وظیفه" /><button type="button" disabled={assigning} onClick={() => saveTaskQuantity(task.id)}>ذخیره</button><button type="button" onClick={() => setEditingTaskId(null)}>انصراف</button></span> : <button type="button" onClick={() => { setEditingTaskId(task.id); setEditingQuantity(String(task.requiredQuantity)); }}>ویرایش</button>}</div>)}</div>}
          {productionSummary.logs.length > 0 && <div className="production-record-list">
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
                <tbody>{productionSummary.logs.map((log, index) => {
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
                          <select aria-label="انتخاب کارمند" value={managerLogEditEmployeeId} onChange={(event) => setManagerLogEditEmployeeId(event.target.value)} required>
                            <option value="">انتخاب کارمند...</option>
                            {employees.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.name}</option>)}
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
                      <td>{fa(productionSummary.logs.length - index)}</td>
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
        <select value={nextState} onChange={(e) => setNextState(e.target.value)}>
          <option value="">انتخاب وضعیت جدید...</option>
          <option value="PRODUCTION_RESUMED">ادامه تولید</option>
          {ORDER_STATES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <input
          type="number" step="0.1" dir="ltr" className="ltr-num"
          value={stageWeight}
          onChange={(e) => setStageWeight(e.target.value)}
          placeholder="وزن کل (کیلوگرم) - اختیاری"
        />
        <input
          type="text"
          value={stateNote}
          onChange={(e) => setStateNote(e.target.value)}
          placeholder="یادداشت وضعیت - اختیاری"
        />
        <button className="primary-btn compact" onClick={addState}>ثبت وضعیت</button>
      </div>

      <div className="timeline">
        <div className="timeline-head">
          <h4>تاریخچه وضعیت</h4>
          {history.length > 1 && (
            <button className="link-btn" onClick={undoLast}>
              <i className="fa-solid fa-rotate-left"></i> حذف آخرین
            </button>
          )}
        </div>
        {history.map((h, i) => (
          <div key={i} className={`timeline-item${i === 0 ? ' current' : ''}${h.event === 'PRODUCTION_RESUMED' ? ' resumed' : ''}`}>
            <span className="timeline-dot" />
            <div className="timeline-body">
              <strong>{h.event === 'PRODUCTION_RESUMED' ? 'ادامه تولید' : (ORDER_STATE_LABELS[h.state] || h.state)}</strong>
              {h.date && <span className="timeline-date">{formatStamp(h.date)}</span>}
              {h.totalWeight != null && <span className="timeline-weight">وزن: {formatWeight(h.totalWeight)}</span>}
              {h.note && <span className="timeline-note">یادداشت: {h.note}</span>}
            </div>
          </div>
        ))}
      </div>
      </section>
    </div>
  );
};

const OrderView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const orderId = Number(id);

  const order = useLiveQuery(() => db.orders.get(orderId), [orderId]);
  const markings = useLiveQuery(() => db.markings.toArray(), []);
  const customer = useLiveQuery(
    () => (order?.customerId != null ? db.people.get(order.customerId) : undefined),
    [order?.customerId]
  );

  const [toast, setToast] = useState(null);
  const [productionQuantities, setProductionQuantities] = useState({});
  const [selectedItemUid, setSelectedItemUid] = useState(null);
  const invoiceRef = useRef(null);

  const markingMap = useMemo(() => {
    const map = {};
    (markings || []).forEach((m) => { map[m.id] = m; });
    return map;
  }, [markings]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  if (order === undefined) {
    return <div className={`${managementRootClass} order-view`}><p className="hint-text">در حال بارگذاری...</p></div>;
  }
  if (order === null) {
    return (
      <div className={`${managementRootClass} order-view`}>
        <div className="page-back">
          <button className="back-btn" onClick={() => navigate('/orders/list')}>
            <i className="fa-solid fa-chevron-right"></i> بازگشت
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
      db.orders.get(orderId).then((currentOrder) => {
        if (!currentOrder) return;
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
        if (changed) db.orders.put({ ...currentOrder, items: updatedItems });
      }).catch((error) => console.error('Failed to refresh production state:', error));
    }
  };

  const updateItem = async (index, patch) => {
    const newItems = items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    try {
      const { order: updated } = await ordersApi.update(orderId, { items: newItems });
      await db.orders.put(updated); // mirror the server's canonical row
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
      await db.orders.delete(orderId);
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
  const grandTotal = items.reduce(
    (sum, it) => sum + (Number(it.salePrice) || 0) * (Number(it.quantity) || 0),
    0
  );

  const handleExportInvoice = async () => {
    if (!invoiceRef.current) return;
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
    } catch (error) {
      console.error('Invoice export failed:', error);
      showToast('خطا در صدور فاکتور.', 'error');
    }
  };

  return (
    <div className={`${managementRootClass} order-view`}>
      <div className="page-back">
        <button className="back-btn" onClick={() => navigate('/orders/list')}>
          <i className="fa-solid fa-chevron-right"></i> بازگشت
        </button>
        <h2>سفارش #{order.orderNumber}</h2>
        <div className="page-actions">
          <button className="icon-btn" onClick={handleExportInvoice} title="صدور فاکتور">
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
            <span className="order-header-icon" aria-hidden="true"><i className="fa-solid fa-user" /></span>
            <div><small>مشتری</small><strong>{order.customerName || '—'}</strong></div>
          </div>
          {customer?.companyName?.trim() && (
            <div className="order-header-company">
              <small>شرکت</small><strong>{customer.companyName.trim()}</strong>
            </div>
          )}
          <div className="order-header-date">
            <span className="order-header-icon" aria-hidden="true"><i className="fa-solid fa-calendar-days" /></span>
            <div><small>تاریخ ثبت سفارش</small><strong dir="ltr">{formatJalali(order.date)}</strong></div>
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
                const diameter = formatDimension(item.diameter);
                const thickness = formatDimension(item.thickness);
                const platingColor = item.platingColor === 'GOLD' || item.platingColor === 'SILVER'
                  ? item.platingColor
                  : 'NONE';
                const platingTone = platingColor === 'GOLD' ? 'gold' : platingColor === 'SILVER' ? 'silver' : 'matte';
                const stateIndex = ORDER_STATES.findIndex((state) => state.value === item.state);
                const isDone = Boolean(item.productionStopped)
                  || stateIndex >= productionCompleteIndex
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
                          <bdi className="order-glance-dimensions" dir="ltr">{diameter}×{thickness}</bdi>
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
        <div className="invoice-sheet" ref={invoiceRef}>
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
                <th className="c-qty">سفارش</th>
                <th className="c-price">قیمت واحد</th>
                <th className="c-price">جمع</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.uid || i}>
                  <td className="c-num">{(i + 1).toLocaleString('fa-IR')}</td>
                  <td className="c-desc">{invoiceDescription(it)}</td>
                  <td className="c-qty">{fa(it.quantity)}</td>
                  <td className="c-price">{faRial(it.salePrice)}</td>
                  <td className="c-price">{faRial((Number(it.salePrice) || 0) * (Number(it.quantity) || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="c-total-label">جمع کل</td>
                <td className="c-price">{faRial(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default OrderView;
