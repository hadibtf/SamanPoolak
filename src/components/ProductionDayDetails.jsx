import React from 'react';
import { PLATING_OPTIONS } from '../constants';
import { PRODUCTION_MONTHS, productionFa, productionStatusLabel } from '../productionStatistics';

const platingLabels = Object.fromEntries(PLATING_OPTIONS.map(({ value, label }) => [value, label]));

export default function ProductionDayDetails({ date, details, loading, error, showEmployee = false }) {
  if (!date) return null;
  const day = Number(date.slice(6, 8));

  return <section className="statistics-details glass-card">
    <div className="statistics-card-title">
      <div>
        <h2>تولید روز {productionFa(day)} {PRODUCTION_MONTHS[Number(date.slice(4, 6)) - 1]}</h2>
        <p>{date.slice(0, 4)}/{date.slice(4, 6)}/{date.slice(6, 8)}</p>
      </div>
      {details && <b>{productionFa(details.total)} عدد</b>}
    </div>
    {loading && <div className="detail-state">در حال دریافت جزئیات...</div>}
    {error && <div className="detail-state error">{error}</div>}
    {details && details.records.length === 0 && <div className="detail-state">در این روز تولیدی ثبت نشده است.</div>}
    {details?.records.map((record) => {
      if (showEmployee) {
        const colorKey = record.platingColor === 'GOLD' || record.platingColor === 'SILVER' ? record.platingColor : 'NONE';
        const tone = colorKey === 'GOLD' ? 'gold' : colorKey === 'SILVER' ? 'silver' : 'matte';
        const dimension = [record.diameter, record.thickness]
          .map((value) => value == null || value === '' ? '—' : productionFa(value))
          .join(' × ');

        return <article className="statistics-production-record" key={record.id} dir="rtl">
          <p className="statistics-production-sentence">
            <strong className="statistics-production-product">{record.productName || '—'}</strong>
            <span className="statistics-production-separator">، </span>
            <span>{record.customerName || '—'}</span>
            <span className="statistics-production-separator">، </span>
            <bdi className="statistics-production-dimensions" dir="ltr">{dimension}</bdi> میلی‌متر
            <span className="statistics-production-separator">، </span>
            <span className="statistics-production-color" data-tone={tone}>{platingLabels[colorKey]}</span>
            <span className="statistics-production-separator">، </span>
            <strong className="statistics-production-quantity">{productionFa(record.quantity)} عدد</strong>
            <span className="statistics-production-separator">، </span>
            <span className="statistics-production-employee">{record.employeeName || '—'}</span>
          </p>
        </article>;
      }

      return <article key={record.id}>
        <div>
          <h3>{record.productName}</h3>
          <p>سفارش {record.orderNumber} · {record.isManagerEntry ? <span className="production-manager-entry">ثبت دستی مدیر</span> : <>وظیفه {productionFa(record.taskId)}</>}</p>
        </div>
        <strong>{productionFa(record.quantity)} عدد</strong>
        <dl>
          {!record.isManagerEntry && <>
            <div><dt>وضعیت وظیفه</dt><dd>{productionStatusLabel(record.taskStatus)}</dd></div>
            <div><dt>مقدار تخصیص</dt><dd>{productionFa(record.taskRequiredQuantity)}</dd></div>
          </>}
          <div><dt>وزن تولید</dt><dd>{record.totalWeightGrams ? `${productionFa(record.totalWeightGrams / 1000)} کیلوگرم` : '—'}</dd></div>
          <div><dt>ابعاد</dt><dd>{record.thickness ?? '—'} × {record.diameter ?? '—'} میلی‌متر</dd></div>
          <div><dt>زمان ثبت</dt><dd>{record.createdAt ? new Date(record.createdAt).toLocaleString('fa-IR') : '—'}</dd></div>
        </dl>
      </article>;
    })}
  </section>;
}
