import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { db, jalaliDateKey } from '../db';
import { issueNotesApi } from '../api/client';
import './IssueNotes.css';

const itemBlank = () => ({ productName: '', quantity: '', weight: '', quantityUnit: 'عدد', packaging: '', description: '' });
const currentDate = () => new DateObject({ calendar: persian, locale: persian_fa });
const displayDate = (key) => key?.length === 8 ? `${key.slice(0, 4)}/${key.slice(4, 6)}/${key.slice(6, 8)}` : '—';
const EMPTY = [];

export default function IssueNotes() {
  const rows = useLiveQuery(() => db.issueNotes.orderBy('id').reverse().toArray());
  const notes = rows || EMPTY;
  const [date, setDate] = useState(currentDate);
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  const [receiverName, setReceiverName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState([itemBlank()]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [saving, setSaving] = useState(false);
  const slipRef = useRef(null);

  const filtered = useMemo(() => {
    const start = jalaliDateKey(from); const end = jalaliDateKey(to);
    const term = keyword.trim().toLocaleLowerCase('fa-IR');
    return notes.filter((note) => {
      const text = `${note.customerName} ${note.receiverName || note.receiverFirstName || ''} ${(note.items || []).map((item) => `${item.productName} ${item.description}`).join(' ')}`.toLocaleLowerCase('fa-IR');
      return (!start || note.date >= start) && (!end || note.date <= end) && (!term || text.includes(term));
    });
  }, [notes, keyword, from, to]);

  const reset = () => { setDate(currentDate()); setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })); setReceiverName(''); setCustomerName(''); setItems([itemBlank()]); setEditing(null); };
  const updateItem = (index, key, value) => setItems((old) => old.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const receiverOf = (note) => note.receiverName || [note.receiverFirstName, note.receiverLastName].filter(Boolean).join(' ');

  const save = async (event) => {
    event.preventDefault();
    if (saving || !customerName.trim() || items.some((item) => !item.productName.trim())) return;
    setSaving(true);
    try {
      const payload = { date: jalaliDateKey(date), dateText: date.toString(), time, receiverName: receiverName.trim(), customerName: customerName.trim(), items: items.map((item) => ({ ...item, quantity: Number(item.quantity) || 0, weight: Number(item.weight) || 0 })) };
      const result = editing ? await issueNotesApi.update(editing.id, payload) : await issueNotesApi.create(payload);
      await db.issueNotes.put(result.issueNote); reset(); setOpen(result.issueNote);
    } catch { alert('خطا در ذخیره برگه خروج.'); } finally { setSaving(false); }
  };
  const edit = (note) => { setOpen(null); setEditing(note); setDate(new DateObject({ calendar: persian, locale: persian_fa, year: +note.date.slice(0, 4), month: +note.date.slice(4, 6), day: +note.date.slice(6, 8) })); setTime(note.time || ''); setReceiverName(receiverOf(note)); setCustomerName(note.customerName || ''); setItems(note.items?.length ? note.items : [itemBlank()]); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remove = async (note) => { if (!window.confirm('حذف کامل برگه خروج؟')) return; try { await issueNotesApi.remove(note.id); await db.issueNotes.delete(note.id); setOpen(null); } catch { alert('خطا در حذف برگه خروج.'); } };
  const exportPdf = async () => {
    if (!slipRef.current || !open) return;
    const canvas = await html2canvas(slipRef.current, { scale: 2, backgroundColor: '#fffdf3', useCORS: true });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 148);
    pdf.save(`برگه-خروج-${open.id}-${open.date}.pdf`);
  };

  useEffect(() => {
    if (!open) return undefined;
    const fitSlip = () => {
      const scale = Math.min(1, (window.innerWidth - 24) / 794, (window.innerHeight - 24) / 559);
      document.documentElement.style.setProperty('--issue-slip-scale', String(Math.max(scale, 0.1)));
    };
    fitSlip();
    window.addEventListener('resize', fitSlip);
    window.addEventListener('orientationchange', fitSlip);
    const stopGesture = (event) => event.preventDefault();
    document.addEventListener('gesturestart', stopGesture, { passive: false });
    document.addEventListener('gesturechange', stopGesture, { passive: false });
    return () => { window.removeEventListener('resize', fitSlip); window.removeEventListener('orientationchange', fitSlip); document.removeEventListener('gesturestart', stopGesture); document.removeEventListener('gesturechange', stopGesture); };
  }, [open]);

  return <div className="issue-notes">
    <div className="glass-card"><h2>{editing ? 'ویرایش برگه خروج' : 'ثبت برگه خروج'}</h2><form onSubmit={save}>
      <div className="issue-grid issue-header-grid"><label>تاریخ<JalaliDatePicker value={date} onChange={setDate} calendar={persian} locale={persian_fa} inputClass="rmdp-input" /></label><label>ساعت<input className="issue-time-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label><label>نام کامل تحویل‌گیرنده<input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="نام و نام خانوادگی" /></label><label>مشتری / شرکت مقصد<input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="نام شخص یا شرکت" /></label></div>
      <h3 className="items-heading">اقلام خروجی</h3>{items.map((item, index) => <section className="item-row" key={index}><div className="item-editor-head"><span className="item-badge">کالا {(index + 1).toLocaleString('fa-IR')}</span>{items.length > 1 && <button type="button" className="link-btn danger" onClick={() => setItems(items.filter((_, i) => i !== index))}><i className="fa-solid fa-trash" /> حذف</button>}</div><div className="issue-grid"><label>شرح کالا<input required value={item.productName} onChange={(e) => updateItem(index, 'productName', e.target.value)} /></label><label>تعداد<input type="number" min="0" step="any" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} /></label><label>وزن کیلوگرم<input type="number" min="0" step="any" value={item.weight} onChange={(e) => updateItem(index, 'weight', e.target.value)} /></label><label>واحد<input value={item.quantityUnit} onChange={(e) => updateItem(index, 'quantityUnit', e.target.value)} /></label><label>بسته‌بندی<input value={item.packaging} onChange={(e) => updateItem(index, 'packaging', e.target.value)} /></label><label>توضیحات<input value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} /></label></div></section>)}
      <button type="button" className="add-item-btn" onClick={() => setItems((old) => [...old, itemBlank()])}><i className="fa-solid fa-plus" /> افزودن کالا</button><div className="issue-actions"><button className="primary-btn" disabled={saving}>{saving ? 'در حال ذخیره...' : 'ذخیره برگه خروج'}</button>{editing && <button type="button" className="cancel-btn" onClick={reset}>انصراف</button>}</div>
    </form></div>
    <div className="glass-card issue-filters"><h2>فیلتر برگه‌ها</h2><div className="issue-grid"><label>جستجو<input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="مشتری، کالا یا تحویل‌گیرنده..." /></label><label>از تاریخ<JalaliDatePicker value={from} onChange={setFrom} calendar={persian} locale={persian_fa} inputClass="rmdp-input" /></label><label>تا تاریخ<JalaliDatePicker value={to} onChange={setTo} calendar={persian} locale={persian_fa} inputClass="rmdp-input" /></label></div></div>
    <h2 className="issue-list-title">برگه‌های خروج · {filtered.length.toLocaleString('fa-IR')}</h2><div className="issue-list">{filtered.map((note) => <article className="issue-card" key={note.id} onClick={() => setOpen(note)}><div><strong>{note.items?.map((item) => item.productName).join('، ') || 'بدون کالا'}</strong><span>{note.customerName} · {displayDate(note.date)} · {note.time}</span><small>{note.items?.length || 0} ردیف کالا</small></div><button type="button" className="open-note-btn">مشاهده</button></article>)}{!filtered.length && <div className="empty-state"><p>برگه خروجی یافت نشد.</p></div>}</div>
    {open && <div className="issue-note-overlay" onClick={() => setOpen(null)}><section className="issue-slip" ref={slipRef} onClick={(event) => event.stopPropagation()}><button className="detail-close" onClick={() => setOpen(null)}>×</button><header className="issue-slip-head"><h1>خروج کالا</h1><div>تاریخ {displayDate(open.date)}<br />ساعت {open.time}</div></header><div className="issue-slip-meta"><span>نام مشتری: <b>{open.customerName}</b></span><span>تحویل‌گیرنده: <b>{receiverOf(open)}</b></span></div><table className="issue-slip-table"><thead><tr><th>ردیف</th><th>شرح کالا</th><th>تعداد</th><th>وزن</th><th>واحد</th><th>بسته‌بندی</th><th>ملاحظات</th></tr></thead><tbody>{open.items?.map((item, index) => <tr key={index}><td>{(index + 1).toLocaleString('fa-IR')}</td><td>{item.productName}</td><td>{item.quantity}</td><td>{item.weight}</td><td>{item.quantityUnit}</td><td>{item.packaging}</td><td>{item.description}</td></tr>)}</tbody></table><footer className="issue-slip-signatures"><span>امضای تحویل‌دهنده</span><span>امضای تحویل‌گیرنده</span></footer><div className="issue-slip-actions"><button className="open-note-btn" onClick={() => exportPdf()}><i className="fa-solid fa-file-pdf" /> دریافت PDF</button><button className="open-note-btn" onClick={() => edit(open)}><i className="fa-solid fa-pen" /> ویرایش</button><button className="open-note-btn danger" onClick={() => remove(open)}><i className="fa-solid fa-trash" /> حذف کامل</button></div></section></div>}
  </div>;
}
