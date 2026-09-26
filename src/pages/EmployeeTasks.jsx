import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { computeWeights } from '../db';
import { productionApi, ApiError } from '../api/client';
import './EmployeeTasks.css';

const today = () => new DateObject({ calendar: persian, locale: persian_fa }).format('YYYYMMDD');
const fa = (value) => Number(value || 0).toLocaleString('fa-IR');
const stamp = (value) => value ? new Date(value).toLocaleString('fa-IR') : '';
const key = () => window.crypto?.randomUUID?.() || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
export default function EmployeeTasks() {
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [quantity, setQuantity] = useState('');
  const [productionDate, setProductionDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = useMemo(() => tasks.find((task) => task.id === selectedId) || tasks[0] || null, [tasks, selectedId]);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError('');
    try {
      const { productionTasks } = await productionApi.listTasks();
      setTasks(productionTasks || []);
    } catch (err) {
      setTasksError(err instanceof ApiError ? err.message : 'دریافت وظایف تولید انجام نشد.');
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  useEffect(() => {
    if (!selected) return;
    productionApi.taskLogs(selected.id).then(({ productionLogs }) => setLogs(productionLogs || [])).catch(() => setLogs([]));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const produced = logs.reduce((sum, log) => sum + Number(log.quantity || 0), 0);
  const remaining = Math.max(0, Number(selected?.requiredQuantity || 0) - produced);
  const weights = selected ? computeWeights({ weightOf10: selected.weightOf10, orderQuantity: selected.requiredQuantity, producedTotalWeight: 0 }) : null;

  const submit = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    setError('');
    const value = Number(quantity);
    if (!Number.isFinite(value) || value <= 0 || value > remaining) { setError('تعداد واردشده معتبر نیست یا از مقدار باقی‌مانده بیشتر است.'); return; }
    setBusy(true);
    try {
      const { productionLog, productionTask } = await productionApi.logProduction(selected.id, { quantity: value, productionDate, submissionKey: key() });
      setTasks((previous) => previous.map((task) => task.id === selected.id ? { ...task, ...productionTask } : task));
      setLogs((previous) => [productionLog, ...previous]); setQuantity('');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'ثبت تولید انجام نشد.'); }
    finally { setBusy(false); }
  };

  if (tasksLoading) return <div className="employee-tasks empty-state"><i className="fa-solid fa-spinner fa-spin" /><p>در حال دریافت وظایف تولید...</p></div>;
  if (tasksError) return <div className="employee-tasks empty-state"><i className="fa-solid fa-triangle-exclamation" /><p>{tasksError}</p><button type="button" className="retry-tasks" onClick={loadTasks}>تلاش دوباره</button></div>;
  if (!tasks.length) return <div className="employee-tasks empty-state"><i className="fa-solid fa-list-check" /><p>وظیفه تولید فعالی ندارید.</p></div>;
  return <div className="employee-tasks">
    <header><h1>وظایف تولید</h1><span>{fa(tasks.length)} وظیفه</span></header>
    <div className="task-list">{tasks.map((task) => <button type="button" key={task.id} onClick={() => setSelectedId(task.id)} className={task.id === selected?.id ? 'active' : ''}><strong>{task.productName}</strong><span>سفارش {task.orderNumber}</span><em>{task.status}</em></button>)}</div>
    {selected && <section className="task-detail glass-card">
      <div className="task-title"><div><h2>{selected.productName}</h2><span>سفارش {selected.orderNumber}</span></div><b>{selected.status}</b></div>
      {selected.markingSrc && <img className="task-marking" src={selected.markingSrc} alt={selected.markingName || 'مارک'} />}
      {selected.markingName && <p>مارک: {selected.markingName}</p>}
      <div className="task-specs"><span>تعداد وظیفه: <b>{fa(selected.requiredQuantity)}</b></span><span>باقی‌مانده: <b>{fa(remaining)}</b></span><span>وزن هر عدد: <b>{weights?.unitWeight ? `${fa(weights.unitWeight)} گرم` : '—'}</b></span><span>وزن مورد انتظار: <b>{weights?.expectedTotalWeight ? `${fa(weights.expectedTotalWeight / 1000)} کیلوگرم` : '—'}</b></span></div>
      {(selected.thickness || selected.diameter || selected.hardeningIntensity || selected.description) && <p className="task-description">ابعاد: {selected.thickness || '—'} × {selected.diameter || '—'} میلی‌متر {selected.isHardened ? `• سخت‌کاری ${selected.hardeningIntensity || ''}` : ''}<br />{selected.description}</p>}
      {remaining > 0 && <form onSubmit={submit} className="production-form"><h3>ثبت تولید</h3><input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0.001" step="0.001" inputMode="decimal" placeholder="تعداد تولیدشده" /><JalaliDatePicker value={productionDate} onChange={(date) => setProductionDate(date?.format?.('YYYYMMDD') || today())} calendar={persian} locale={persian_fa} inputClass="rmdp-input" /><button disabled={busy}>{busy ? 'در حال ثبت...' : 'ثبت تولید'}</button>{error && <p className="task-error">{error}</p>}</form>}
      <div className="task-logs"><h3>سوابق ثبت تولید</h3>{logs.length ? logs.map((log) => <div key={log.id}><b>{fa(log.quantity)} عدد</b><span>{log.productionDate.slice(0,4)}/{log.productionDate.slice(4,6)}/{log.productionDate.slice(6,8)}</span><small>{stamp(log.createdAt)}</small></div>) : <p>هنوز تولیدی ثبت نشده است.</p>}</div>
    </section>}
  </div>;
}
