import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { db, computeWeights, deriveOrderStatus } from '../db';
import { ordersApi, productionApi, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../auth/AuthContext';
import {
  ORDER_STATES,
  ORDER_STATE_LABELS,
  MATERIAL_LABELS,
  PLATING_LABELS,
  INVOICE_PLATING_LABELS,
} from '../constants';
import './Management.css';

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
const ItemPanel = ({ item, index, markingMap, onUpdate, onToast, orderId, orderDate, canAssign }) => {
  const { formatMoney } = useSettings();
  const [nextState, setNextState] = useState('');
  const [stageWeight, setStageWeight] = useState('');
  const [stateNote, setStateNote] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeeUserId, setEmployeeUserId] = useState('');
  const [assignQuantity, setAssignQuantity] = useState(String(item.quantity || ''));
  const [assigning, setAssigning] = useState(false);
  const [splitFromTaskId, setSplitFromTaskId] = useState('');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingQuantity, setEditingQuantity] = useState('');
  const [productionSummary, setProductionSummary] = useState(null);

  const loadSummary = () => {
    if (!canAssign) return;
    productionApi.itemSummary(orderId, item.uid).then(setProductionSummary).catch(() => setProductionSummary(null));
  };

  useEffect(() => {
    if (!canAssign) return;
    productionApi.employees().then(({ employees: list }) => setEmployees(list || [])).catch(() => onToast('خطا در دریافت فهرست کارمندان.', 'error'));
  }, [canAssign, onToast]);

  useEffect(() => {
    loadSummary();
    if (!canAssign) return undefined;
    const interval = window.setInterval(loadSummary, 15000);
    return () => window.clearInterval(interval);
  }, [canAssign, orderId, item.uid]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const weights = computeWeights({
    weightOf10: item.weightOf10,
    orderQuantity: item.quantity,
    producedTotalWeight: item.producedTotalWeight,
  });

  const history = [...(item.stateHistory || [])].reverse();
  const markImg = markingMap[item.markingId]?.src;
  const qtyDiff = weights.producedQuantity
    ? Math.round(weights.producedQuantity) - weights.expectedQuantity
    : null;

  const lineTotal = (Number(item.salePrice) || 0) * (Number(item.quantity) || 0);
  const margin =
    item.salePrice != null && item.unitCost != null
      ? (Number(item.salePrice) - Number(item.unitCost)) * (Number(item.quantity) || 0)
      : null;

  const addState = () => {
    if (!nextState) { onToast('یک وضعیت انتخاب کنید.', 'error'); return; }
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

      <div className="detail-grid">
        <div className="detail"><span>تعداد</span><strong>{fa(item.quantity)}</strong></div>
        <div className="detail"><span>جنس</span><strong>{MATERIAL_LABELS[item.material] || '—'}</strong></div>
        <div className="detail"><span>آبکاری</span><strong>{PLATING_LABELS[item.platingColor] || '—'}</strong></div>
        <div className="detail" dir="ltr"><span>ابعاد</span><strong>{fa(item.thickness)} × {fa(item.diameter)} mm</strong></div>
        <div className="detail">
          <span>سخت‌کاری</span>
          <strong>{item.isHardened ? `بله${item.hardeningIntensity ? ` (${item.hardeningIntensity})` : ''}` : 'خیر'}</strong>
        </div>
        <div className="detail"><span>قیمت فروش هر عدد</span><strong>{formatMoney(item.salePrice)}</strong></div>
        <div className="detail"><span>جمع فروش</span><strong>{formatMoney(lineTotal)}</strong></div>
        {item.unitCost != null && (
          <div className="detail"><span>سود برآوردی</span><strong>{formatMoney(margin)}</strong></div>
        )}
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

      {canAssign && (
        <>
          <h4 className="sub-title">تخصیص تولید</h4>
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
        </>
      )}

      {canAssign && productionSummary && (
        <div className="production-summary">
          <h4 className="sub-title">پیشرفت و سوابق تولید</h4>
          <p>تولید کل: <strong>{fa(productionSummary.totalProduced)}</strong> از <strong>{fa(item.quantity)}</strong></p>
          {productionSummary.tasks.length > 0 && <div className="production-summary-list"><b>تخصیص‌ها</b>{productionSummary.tasks.map((task) => <div key={task.id} className="production-assignment-row"><span>{task.employeeName} — {fa(task.requiredQuantity)} عدد (تولید: {fa(task.producedQuantity)}) — {task.status} <small>{task.createdAt ? new Date(task.createdAt).toLocaleString('fa-IR') : ''}</small></span>{editingTaskId === task.id ? <span className="production-assignment-edit"><input type="number" min="0.001" step="0.001" value={editingQuantity} onChange={(event) => setEditingQuantity(event.target.value)} aria-label="تعداد جدید وظیفه" /><button type="button" disabled={assigning} onClick={() => saveTaskQuantity(task.id)}>ذخیره</button><button type="button" onClick={() => setEditingTaskId(null)}>انصراف</button></span> : <button type="button" onClick={() => { setEditingTaskId(task.id); setEditingQuantity(String(task.requiredQuantity)); }}>ویرایش</button>}</div>)}</div>}
          {productionSummary.byEmployee.length > 0 && <div className="production-summary-list"><b>تولید هر کارمند</b>{productionSummary.byEmployee.map((row) => <div key={row.employeeUserId}>{row.employeeName}: <strong>{fa(row.quantity)} عدد</strong></div>)}</div>}
          {productionSummary.logs.length > 0 && <div className="production-summary-list"><b>ریز ثبت تولید</b>{productionSummary.logs.map((log) => <div key={log.id}>{log.employeeName} — {fa(log.quantity)} عدد — {log.totalWeightGrams ? `${fa(log.totalWeightGrams / 1000)} کیلوگرم — ` : ''}{log.productionDate.slice(0,4)}/{log.productionDate.slice(4,6)}/{log.productionDate.slice(6,8)} <small>{log.createdAt ? new Date(log.createdAt).toLocaleString('fa-IR') : ''}</small></div>)}</div>}
        </div>
      )}

      {/* Weight & quantity */}
      <h4 className="sub-title">وزن و مقدار</h4>
      <div className="weight-inputs">
        <div className="form-group">
          <label>وزن ۱۰ عدد (گرم)</label>
          <input
            type="number" step="0.1" dir="ltr" className="ltr-num"
            defaultValue={item.weightOf10 ?? ''}
            onBlur={(e) => onUpdate(index, { weightOf10: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="0.0"
          />
        </div>
        <div className="form-group">
          <label>وزن کل تولید شده (کیلوگرم)</label>
          <input
            type="number" step="0.1" dir="ltr" className="ltr-num"
            defaultValue={item.producedTotalWeight == null ? '' : Number(item.producedTotalWeight) / 1000}
            onBlur={(e) => onUpdate(index, { producedTotalWeight: e.target.value === '' ? null : Number(e.target.value) * 1000 })}
            placeholder="0.0"
          />
        </div>
      </div>
      <div className="recon-grid">
        <div className="recon-col">
          <h4>مورد انتظار</h4>
          <div className="row"><span>وزن هر عدد</span><span>{formatWeight(weights.unitWeight)}</span></div>
          <div className="row"><span>تعداد</span><span>{fa(weights.expectedQuantity)}</span></div>
          <div className="row"><span>وزن کل</span><span>{formatWeight(weights.expectedTotalWeight)}</span></div>
        </div>
        <div className="recon-col produced">
          <h4>تولید شده</h4>
          <div className="row"><span>وزن هر عدد</span><span>{formatWeight(weights.unitWeight)}</span></div>
          <div className="row"><span>تعداد</span><span>{weights.producedQuantity ? fa(Math.round(weights.producedQuantity)) : '—'}</span></div>
          <div className="row"><span>وزن کل</span><span>{formatWeight(weights.producedTotalWeight)}</span></div>
        </div>
      </div>
      {qtyDiff != null && qtyDiff !== 0 && (
        <div className={`recon-diff ${qtyDiff < 0 ? 'short' : 'over'}`}>
          {qtyDiff < 0
            ? `کسری ${fa(Math.abs(qtyDiff))} عدد نسبت به مورد انتظار`
            : `${fa(qtyDiff)} عدد بیش از مورد انتظار`}
        </div>
      )}

      {/* State control + timeline */}
      <h4 className="sub-title">تغییر وضعیت</h4>
      <div className="state-form">
        <select value={nextState} onChange={(e) => setNextState(e.target.value)}>
          <option value="">انتخاب وضعیت جدید...</option>
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
          <div key={i} className={`timeline-item ${i === 0 ? 'current' : ''}`}>
            <span className="timeline-dot" />
            <div className="timeline-body">
              <strong>{ORDER_STATE_LABELS[h.state] || h.state}</strong>
              {h.date && <span className="timeline-date">{formatStamp(h.date)}</span>}
              {h.totalWeight != null && <span className="timeline-weight">وزن: {formatWeight(h.totalWeight)}</span>}
              {h.note && <span className="timeline-note">یادداشت: {h.note}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const OrderView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { formatMoney } = useSettings();
  const { user } = useAuth();
  const orderId = Number(id);

  const order = useLiveQuery(() => db.orders.get(orderId), [orderId]);
  const markings = useLiveQuery(() => db.markings.toArray(), []);
  const customer = useLiveQuery(
    () => (order?.customerId != null ? db.people.get(order.customerId) : undefined),
    [order?.customerId]
  );

  const [toast, setToast] = useState(null);
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
    return <div className="order-view"><p className="hint-text">در حال بارگذاری...</p></div>;
  }
  if (order === null) {
    return (
      <div className="order-view">
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
  const status = deriveOrderStatus(order);

  const updateItem = async (index, patch) => {
    const newItems = items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    try {
      const { order: updated } = await ordersApi.update(orderId, { items: newItems });
      await db.orders.put(updated); // mirror the server's canonical row
    } catch (error) {
      console.error('Failed to update order:', error);
      showToast(
        error instanceof ApiError && error.status === 0
          ? 'برای ذخیره نیاز به اتصال اینترنت دارید.'
          : 'خطا در ذخیره.',
        'error'
      );
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
    <div className="order-view">
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

      {/* Order header / status */}
      <div className="glass-card order-summary">
        <div className="detail-grid">
          <div className="detail"><span>مشتری</span><strong>{order.customerName}</strong></div>
          <div className="detail"><span>تاریخ</span><strong>{formatJalali(order.date)}</strong></div>
          <div className="detail"><span>تعداد اقلام</span><strong>{fa(items.length)}</strong></div>
          <div className="detail"><span>جمع کل فروش</span><strong>{formatMoney(grandTotal)}</strong></div>
          {order.createdByName && (
            <div className="detail"><span>ثبت‌کننده</span><strong>{order.createdByName}</strong></div>
          )}
        </div>
        <div className={`order-status-banner ${status.done ? 'done' : ''}`}>
          {status.done
            ? '✅ تکمیل شده — همهٔ اقلام آماده تحویل'
            : `در حال انجام — ${fa(status.ready)} از ${fa(status.total)} قلم آماده تحویل`}
        </div>
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
          orderId={orderId}
          orderDate={order.date}
          canAssign={user?.role === 'admin'}
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
