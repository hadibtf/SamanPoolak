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
// Raw Rial formatting — the invoice is always in Rial, never converted.
const faRial = (n) => Math.round(Number(n) || 0).toLocaleString('fa-IR');

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
  return `${dateKey.slice(0, 4)}/${dateKey.slice(4, 6)}/${dateKey.slice(6, 8)}`;
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
    desc += ` ${item.thickness ?? '—'}*${item.diameter ?? '—'} mm`;
  }
  if (item.description) desc += ` - ${item.description}`;
  return desc;
};

// ---- One item panel (specs + state machine + weight reconciliation) ----
const ItemPanel = ({ item, index, markingMap, onUpdate, onToast, onProductionSummaryChange, orderId, orderDate, canAssign, canViewProduction }) => {
  const [nextState, setNextState] = useState('');
  const [stageWeight, setStageWeight] = useState('');
  const [stateNote, setStateNote] = useState('');
  const [weightOf10Input, setWeightOf10Input] = useState('');
  const [savingWeightOf10, setSavingWeightOf10] = useState(false);
  const [editingWeightOf10, setEditingWeightOf10] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeeUserId, setEmployeeUserId] = useState('');
  const [assignQuantity, setAssignQuantity] = useState(String(item.quantity || ''));
  const [assigning, setAssigning] = useState(false);
  const [splitFromTaskId, setSplitFromTaskId] = useState('');
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
      .catch(() => { setProductionSummary(null); onProductionSummaryChange(item.uid, null); setSummaryError('سوابق تولید دریافت نشد.'); });
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

  const assignTask = async () => {
    if (!employeeUserId || !assignQuantity || assigning) { onToast('کارمند و مقدار را انتخاب کنید.', 'error'); return; }
    const requested = Number(assignQuantity);
    if (!Number.isFinite(requested) || requested <= 0) { onToast('تعداد معتبر وارد کنید.', 'error'); return; }
    const assigned = (productionSummary?.tasks || []).reduce((sum, task) => sum + Number(task.requiredQuantity), 0);
    const deficit = Math.max(0, assigned + requested - Number(item.quantity));
    let sourceId = null;
    if (deficit > 0) {
      const eligible = (productionSummary?.tasks || []).filter((task) =>
        task.employeeUserId !== Number(employeeUserId) && Number(task.requiredQuantity) - Number(task.producedQuantity || 0) >= deficit);
      const source = eligible.find((task) => String(task.id) === splitFromTaskId) || (eligible.length === 1 ? eligible[0] : null);
      if (!source) { onToast('برای تقسیم تولید، یک تخصیص قبلی با مقدار آزاد کافی انتخاب کنید.', 'error'); return; }
      if (!window.confirm(`آیا می‌خواهید ${fa(deficit)} عدد از وظیفه ${source.employeeName} کم شود و بین دو کارمند تقسیم گردد؟ مقدار تولید ثبت‌شده قبلی تغییر نمی‌کند.`)) return;
      sourceId = source.id;
    }
    setAssigning(true);
    try {
      await productionApi.assignTask({
        orderId, orderItemUid: item.uid, employeeUserId: Number(employeeUserId),
        requiredQuantity: requested, assignedDate: orderDate,
        ...(sourceId ? { splitFromTaskId: sourceId } : {}),
      });
      loadSummary();
      setEmployeeUserId('');
      setSplitFromTaskId('');
      onToast('وظیفه تولید تخصیص داده شد.');
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'خطا در تخصیص وظیفه.', 'error');
    } finally { setAssigning(false); }
  };

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
  const totalProducedQuantity = Number(productionSummary?.totalProduced) || 0;
  const orderQuantity = Number(item.quantity) || 0;
  const productionReachedTarget = Boolean(productionSummary) && totalProducedQuantity >= orderQuantity;
  const productionStopped = Boolean(item.productionStopped) || item.state === 'PRODUCTION_COMPLETE';
  const productionCompleteStateIndex = ORDER_STATES.findIndex((state) => state.value === 'PRODUCTION_COMPLETE');
  const itemStateIndex = ORDER_STATES.findIndex((state) => state.value === item.state);
  const workflowAdvancedPastProduction = itemStateIndex > productionCompleteStateIndex;
  const progress = Number(item.quantity) > 0 ? Math.min(100, Math.max(0, totalProducedQuantity / Number(item.quantity) * 100)) : 0;
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

  const isReady = item.state === 'READY';

  return (
    <div className="glass-card item-panel">
      <div className="item-panel-head">
        <h3 className="section-title">
          {(index + 1).toLocaleString('fa-IR')}. {item.productName || '—'}
        </h3>
        <span className={`state-pill ${isReady ? 'ready' : ''}`}>
          {ORDER_STATE_LABELS[item.state] || item.state}
        </span>
      </div>

      <section className="order-section order-item-details" aria-label="جزئیات سفارش">
        <h4 className="order-section-title">جزئیات سفارش</h4>
        <div className="order-detail-grid">
          <div className="order-detail-tile" data-kind="quantity">
            <span className="order-detail-icon"><i className="fa-solid fa-boxes-stacked" aria-hidden="true" /></span>
            <span><small>تعداد</small><strong>{fa(item.quantity)} <em>عدد</em></strong></span>
          </div>
          <div className="order-detail-tile" data-kind="material">
            <span className="order-detail-icon"><i className="fa-solid fa-layer-group" aria-hidden="true" /></span>
            <span><small>جنس ورق</small><strong>{MATERIAL_LABELS[item.material] || '—'}</strong></span>
          </div>
          <div className="order-detail-tile" data-kind="plating">
            <span className="order-detail-icon"><i className="fa-solid fa-droplet" aria-hidden="true" /></span>
            <span><small>آبکاری</small><strong>{PLATING_LABELS[item.platingColor] || '—'}</strong></span>
          </div>
          <div className="order-detail-tile" data-kind="dimensions">
            <span className="order-detail-icon"><i className="fa-solid fa-ruler-combined" aria-hidden="true" /></span>
            <span><small>ابعاد</small><strong dir="ltr">{fa(item.thickness)} × {fa(item.diameter)} mm</strong></span>
          </div>
        </div>
        <div className="order-detail-extra">
          <span><small>سخت‌کاری</small><strong>{item.isHardened ? `بله${item.hardeningIntensity ? ` · ${item.hardeningIntensity}` : ''}` : 'خیر'}</strong></span>
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

      <section className="order-section order-production-section" aria-label="تولید">
        <h4 className="order-section-title">تولید</h4>
        {measuredWeightOf10 > 0 && editingWeightOf10 && (
          <div className="weight-measure-step weight-measure-edit">
            <div className="weight-measure-copy">
              <strong>ویرایش وزن ۱۰ قطعه</strong>
              <span>این تغییر برآورد سفارش و ثبت‌های بعدی را به‌روز می‌کند؛ سوابق قبلی دست‌نخورده می‌مانند.</span>
            </div>
            <label htmlFor={`weight-of-10-${item.uid}`}>وزن ۱۰ قطعه (گرم)</label>
            <div className="weight-measure-control">
              <input id={`weight-of-10-${item.uid}`} type="number" min="1" step="1" inputMode="numeric" dir="ltr" value={weightOf10Input} onChange={(event) => setWeightOf10Input(event.target.value)} />
              <div className="weight-measure-edit-actions">
                <button type="button" className="primary-btn compact" disabled={savingWeightOf10} onClick={saveWeightOf10}>{savingWeightOf10 ? 'در حال ذخیره...' : 'ذخیره تغییر'}</button>
                <button type="button" className="weight-edit-cancel" disabled={savingWeightOf10} onClick={() => { setEditingWeightOf10(false); setWeightOf10Input(''); }}>انصراف</button>
              </div>
            </div>
          </div>
        )}
        {measuredWeightOf10 <= 0 ? (
          <div className="weight-measure-step weight-measure-initial">
            <div className="weight-measure-copy">
              <span>وزن 10 عدد نمونه</span>
            </div>
            <div className="weight-measure-control">
              <input
                id={`weight-of-10-${item.uid}`}
                aria-label="وزن ۱۰ قطعه به گرم"
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
                {savingWeightOf10 ? 'در حال ثبت...' : 'ثبت وزن نمونه'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="production-metrics-grid">
              <div className="production-metric" data-kind="unit-weight">
                <small>وزن یک قطعه</small>
                <div className="unit-weight-value-row">
                  <strong>{formatWeight(unitWeight)}</strong>
                  {!editingWeightOf10 && (
                    <button type="button" className="weight-edit-link" onClick={() => {
                      setWeightOf10Input(String(measuredWeightOf10));
                      setEditingWeightOf10(true);
                    }}>ویرایش</button>
                  )}
                </div>
              </div>
              <div className="production-metric" data-kind="order-quantity"><small>تعداد سفارش</small><strong>{fa(item.quantity)} <em>عدد</em></strong></div>
              <div className="production-metric" data-kind="estimated-weight"><small>وزن کل برآوردی</small><strong>{formatWeight(expectedTotalWeight)}</strong></div>
              <div className="production-metric" data-kind="produced-weight"><small>وزن تولیدشده</small><strong>{producedWeightLabel}</strong></div>
              <div className="production-metric" data-kind="produced-quantity"><small>تعداد تولیدشده</small><strong>{productionSummary ? `${fa(totalProducedQuantity)} عدد` : '—'}</strong></div>
            </div>
            <div className="production-remaining-row" aria-label="مقدار باقی‌مانده سفارش">
              <div className="production-remaining-item" data-kind="remaining-quantity">
                <small>تعداد باقی‌مانده</small>
                <strong>{remainingQuantity == null ? '—' : `${fa(remainingQuantity)} عدد`}</strong>
              </div>
              <div className="production-remaining-item" data-kind="remaining-weight">
                <small>وزن باقی‌مانده</small>
                <strong>{remainingWeight == null ? '—' : remainingWeight === 0 ? '۰ گرم' : formatWeight(remainingWeight)}</strong>
              </div>
            </div>
            <div className="production-progress-block">
              <div className="production-progress-labels">
                <span>پیشرفت تولید</span>
                <strong>{productionSummary ? `${fa(totalProducedQuantity)} از ${fa(item.quantity)} عدد` : 'در حال دریافت...'}</strong>
              </div>
              <div
                className="production-progress-track"
                role="progressbar"
                aria-label="پیشرفت تولید سفارش"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(progress)}
                aria-valuetext={`${fa(totalProducedQuantity)} از ${fa(item.quantity)} عدد`}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
              <small>{totalProducedQuantity > Number(item.quantity) ? `${fa(totalProducedQuantity - Number(item.quantity))} عدد بیشتر از مقدار سفارش` : `${fa(Math.max(0, Number(item.quantity) - totalProducedQuantity))} عدد باقی‌مانده`}</small>
            </div>
            {canAssign && (productionStopped || (productionSummary && productionReachedTarget)) && (
              <section className={`production-completion-panel${productionStopped ? ' is-confirmed' : ''}`} aria-live="polite">
                <span className="production-completion-icon" aria-hidden="true">
                  <i className={`fa-solid ${productionStopped ? 'fa-circle-check' : 'fa-boxes-stacked'}`} />
                </span>
                <div className="production-completion-copy">
                  <strong>{productionStopped ? 'پایان تولید تأیید شد' : 'به نظر می‌رسد تولید این قلم کامل شده است'}</strong>
                  <span>{productionStopped
                    ? !productionSummary
                      ? 'پایان تولید تأیید شده است؛ ثبت تولید و تخصیص این قلم بسته شده است.'
                      : totalProducedQuantity < orderQuantity
                        ? `پایان تولید با ${fa(totalProducedQuantity)} عدد از ${fa(orderQuantity)} عدد سفارش تأیید شده است. ثبت تولید و تخصیص این قلم بسته شد.`
                        : 'تعداد تولید به مقدار سفارش رسیده است؛ ثبت تولید و تخصیص این قلم بسته شد و برای مرحله بعد آماده است.'
                    : totalProducedQuantity === orderQuantity
                      ? `تعداد تولید ثبت‌شده (${fa(totalProducedQuantity)}) به مقدار سفارش (${fa(orderQuantity)}) رسیده است. با تأیید، تولید این قلم نهایی می‌شود و ثبت تولید و تخصیص بسته خواهد شد.`
                      : `تعداد تولید ثبت‌شده (${fa(totalProducedQuantity)}) از مقدار سفارش (${fa(orderQuantity)}) بیشتر شده است. با تأیید، تولید این قلم نهایی می‌شود و ثبت تولید و تخصیص بسته خواهد شد.`}</span>
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
                <div>
                  <strong>پایان تولید پیش از تکمیل مقدار سفارش</strong>
                  <span>{fa(totalProducedQuantity)} از {fa(orderQuantity)} عدد تولید شده؛ در صورت نهایی بودن همین مقدار، می‌توانید پایان تولید را دستی ثبت کنید.</span>
                </div>
                <button type="button" disabled={confirmingProductionStop} onClick={confirmProductionStop}>
                  {confirmingProductionStop ? 'در حال ذخیره...' : 'تأیید پایان با کسری'}
                </button>
              </section>
            )}
          </>
        )}

        {canAssign && !productionStopped && (
          <section className="order-assignment-section" aria-label="تخصیص تولید">
            <h5 className="sub-title">تخصیص تولید</h5>
          <div className="state-form">
            <select value={employeeUserId} onChange={(e) => setEmployeeUserId(e.target.value)}>
              <option value="">انتخاب کارمند...</option>
              {employees.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.name}</option>)}
            </select>
            <input type="number" min="0.001" step="0.001" dir="ltr" className="ltr-num" value={assignQuantity} onChange={(e) => setAssignQuantity(e.target.value)} placeholder="تعداد" />
            <button type="button" className="primary-btn compact" disabled={assigning} onClick={assignTask}>{assigning ? 'در حال تخصیص...' : 'تخصیص'}</button>
          </div>
          {productionSummary?.tasks?.length > 1 && <label className="production-split-source">در صورت تقسیم، از کدام وظیفه کم شود؟
            <select value={splitFromTaskId} onChange={(event) => setSplitFromTaskId(event.target.value)}><option value="">انتخاب تخصیص قبلی...</option>{productionSummary.tasks.map((task) => <option key={task.id} value={task.id}>{task.employeeName} — {fa(task.requiredQuantity - (task.producedQuantity || 0))} عدد آزاد</option>)}</select>
          </label>}
          </section>
        )}

        {canAssign && !productionStopped && measuredWeightOf10 > 0 && (
          <section className="manager-production-log-section" aria-label="ثبت دستی تولید توسط مدیر">
            <form className="manager-production-log-form" onSubmit={saveManualProduction}>
              <label>تاریخ تولید
                <JalaliDatePicker
                  value={manualPickerDate}
                  onChange={(date) => setManualDate(productionDateKey(date))}
                  calendar={persian}
                  locale={persian_fa}
                  weekDays={weekDays}
                  placeholder="انتخاب تاریخ"
                  calendarPosition="bottom-right"
                  minDate={managerDateBounds.min}
                  maxDate={managerDateBounds.max}
                  inputClass="rmdp-input"
                  containerClassName="manager-production-date"
                />
              </label>
              <label>وزن تولید (کیلوگرم)
                <input type="number" min="0.001" step="0.001" inputMode="decimal" dir="ltr" value={manualWeightKg} onChange={(event) => setManualWeightKg(event.target.value)} placeholder="۰٫۰۰۰" required />
              </label>
              <label>کارمند
                <select value={manualEmployeeId} onChange={(event) => setManualEmployeeId(event.target.value)} required>
                  <option value="">انتخاب کارمند...</option>
                  {employees.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.name}</option>)}
                </select>
              </label>
              <button type="submit" className="primary-btn compact" disabled={savingManualLog || employees.length === 0}>
                {savingManualLog ? 'در حال ثبت...' : 'ثبت تولید'}
              </button>
              {employees.length === 0 && <small>فهرست کارمندان در دسترس نیست.</small>}
            </form>
          </section>
        )}

      {canAssign && productionSummary && (
        <div className="production-summary">
          <h5 className="sub-title">سوابق تولید</h5>
          {productionSummary.tasks.length > 0 && <div className="production-summary-list"><b>تخصیص‌ها</b>{productionSummary.tasks.map((task) => <div key={task.id} className="production-assignment-row"><span>{task.employeeName} — {fa(task.requiredQuantity)} عدد (تولید: {fa(task.producedQuantity)}) — {task.status} <small>{task.createdAt ? new Date(task.createdAt).toLocaleString('fa-IR') : ''}</small></span>{editingTaskId === task.id ? <span className="production-assignment-edit"><input type="number" min="0.001" step="0.001" value={editingQuantity} onChange={(event) => setEditingQuantity(event.target.value)} aria-label="تعداد جدید وظیفه" /><button type="button" disabled={assigning} onClick={() => saveTaskQuantity(task.id)}>ذخیره</button><button type="button" onClick={() => setEditingTaskId(null)}>انصراف</button></span> : <button type="button" onClick={() => { setEditingTaskId(task.id); setEditingQuantity(String(task.requiredQuantity)); }}>ویرایش</button>}</div>)}</div>}
          {productionSummary.byEmployee.length > 0 && <div className="production-summary-list"><b>تولید هر کارمند</b>{productionSummary.byEmployee.map((row) => <div key={row.employeeUserId}>{row.employeeName}: <strong>{fa(row.quantity)} عدد</strong></div>)}</div>}
          {productionSummary.logs.length > 0 && <div className="production-summary-list"><b>ریز ثبت تولید</b>{productionSummary.logs.map((log) => {
            const isEditing = editingManagerLogId === log.id;
            return <div key={log.id} className={log.isManagerEntry ? 'manager-production-log-row' : undefined}>
              {isEditing ? (
                <form className="manager-production-log-edit-form" onSubmit={(event) => saveManagerLogEdit(event, log)}>
                  <label>تاریخ تولید
                    <JalaliDatePicker
                      value={managerLogEditPickerDate}
                      onChange={(date) => setManagerLogEditDate(productionDateKey(date))}
                      calendar={persian}
                      locale={persian_fa}
                      weekDays={weekDays}
                      placeholder="انتخاب تاریخ"
                      calendarPosition="bottom-right"
                      minDate={managerDateBounds.min}
                      maxDate={managerDateBounds.max}
                      inputClass="rmdp-input"
                      containerClassName="manager-production-date"
                    />
                  </label>
                  <label>وزن (کیلوگرم)
                    <input type="number" min="0.001" step="0.001" inputMode="decimal" dir="ltr" value={managerLogEditWeightKg} onChange={(event) => setManagerLogEditWeightKg(event.target.value)} required />
                  </label>
                  <label>کارمند
                    <select value={managerLogEditEmployeeId} onChange={(event) => setManagerLogEditEmployeeId(event.target.value)} required>
                      <option value="">انتخاب کارمند...</option>
                      {employees.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.name}</option>)}
                    </select>
                  </label>
                  <div className="manager-production-log-edit-actions">
                    <button type="submit" className="primary-btn compact" disabled={mutatingManagerLogId === log.id}>{mutatingManagerLogId === log.id ? 'در حال ذخیره...' : 'ذخیره'}</button>
                    <button type="button" className="manager-log-cancel" onClick={cancelManagerLogEdit} disabled={mutatingManagerLogId === log.id}>انصراف</button>
                  </div>
                </form>
              ) : <>
                <span>{log.employeeName} — {fa(log.quantity)} عدد — {log.totalWeightGrams ? `${fa(log.totalWeightGrams / 1000)} کیلوگرم — ` : ''}{formatJalali(log.productionDate)} {log.isManagerEntry && <em className="manager-log-badge">ثبت مدیر</em>}</span>
                <small>{log.updatedAt ? `${new Date(log.updatedAt).toLocaleString('fa-IR')} · ویرایش‌شده` : (log.createdAt ? new Date(log.createdAt).toLocaleString('fa-IR') : '')}</small>
                {log.isManagerEntry && <div className="manager-production-log-actions">
                  <button type="button" onClick={() => beginManagerLogEdit(log)} disabled={mutatingManagerLogId === log.id}>ویرایش</button>
                  <button type="button" className="danger" onClick={() => deleteManagerLog(log)} disabled={mutatingManagerLogId === log.id}>{mutatingManagerLogId === log.id ? 'در حال انجام...' : 'حذف'}</button>
                </div>}
              </>}
            </div>;
          })}</div>}
        </div>
      )}
        {summaryError && <p className="production-summary-error" role="status">{summaryError}</p>}
      </section>

      {/* State control + timeline */}
      <section className="order-section order-state-section" aria-label="ثبت وضعیت سفارش">
      <h4 className="order-section-title">وضعیت سفارش</h4>
      <h5 className="sub-title">تغییر وضعیت</h5>
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
            <thead><tr><th scope="col">نام محصول</th><th scope="col"><span className="order-glance-head-full">تعداد سفارش</span><span className="order-glance-head-short">تعداد</span></th><th scope="col"><span className="order-glance-head-full">تعداد تولیدشده</span><span className="order-glance-head-short">تولید</span></th><th scope="col"><span className="order-glance-head-full">وضعیت</span><span className="order-glance-head-short">انجام</span></th></tr></thead>
            <tbody>
              {items.map((item) => {
                const produced = productionQuantities[item.uid];
                const quantity = Number(item.quantity) || 0;
                const stateIndex = ORDER_STATES.findIndex((state) => state.value === item.state);
                const isDone = Boolean(item.productionStopped)
                  || stateIndex >= productionCompleteIndex
                  || (produced != null && produced >= quantity);
                return (
                  <tr key={item.uid}>
                    <th scope="row">{item.productName || '—'}</th>
                    <td>{fa(quantity)} <em>عدد</em></td>
                    <td>{produced == null ? '—' : <>{fa(produced)} <em>عدد</em></>}</td>
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
          orderDate={order.date}
          canAssign={user?.role === 'admin'}
          canViewProduction={user?.role !== 'employee'}
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
                <th className="c-qty">تعداد</th>
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
