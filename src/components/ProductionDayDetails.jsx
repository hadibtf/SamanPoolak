import React from 'react';
import { PRODUCTION_MONTHS, productionFa, productionStatusLabel } from '../productionStatistics';

export default function ProductionDayDetails({ date, details, loading, error, showEmployee = false }) {
  if (!date) return null;
  const day = Number(date.slice(6, 8));
  return <section className="statistics-details glass-card">
    <div className="statistics-card-title"><div><h2>تولید روز {productionFa(day)} {PRODUCTION_MONTHS[Number(date.slice(4, 6)) - 1]}</h2><p>{date.slice(0, 4)}/{date.slice(4, 6)}/{date.slice(6, 8)}</p></div>{details && <b>{productionFa(details.total)} عدد</b>}</div>
    {loading && <div className="detail-state">در حال دریافت جزئیات...</div>}
    {error && <div className="detail-state error">{error}</div>}
    {details && details.records.length === 0 && <div className="detail-state">در این روز تولیدی ثبت نشده است.</div>}
    {details?.records.map((record) => <article key={record.id}>
      <div><h3>{record.productName}</h3><p>{showEmployee && <>{record.employeeName} · </>}سفارش {record.orderNumber} · وظیفه {productionFa(record.taskId)}</p></div>
      <strong>{productionFa(record.quantity)} عدد</strong>
      <dl><div><dt>وضعیت وظیفه</dt><dd>{productionStatusLabel(record.taskStatus)}</dd></div><div><dt>مقدار تخصیص</dt><dd>{productionFa(record.taskRequiredQuantity)}</dd></div><div><dt>ابعاد</dt><dd>{record.thickness ?? '—'} × {record.diameter ?? '—'} میلی‌متر</dd></div><div><dt>زمان ثبت</dt><dd>{record.createdAt ? new Date(record.createdAt).toLocaleString('fa-IR') : '—'}</dd></div></dl>
    </article>)}
  </section>;
}
