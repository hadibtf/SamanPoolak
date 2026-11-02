import React from 'react';
import { Link } from 'react-router-dom';
import { PLATING_OPTIONS } from '../constants';
import { PRODUCTION_MONTHS, productionFa, productionStatusLabel } from '../productionStatistics';

const platingLabels = Object.fromEntries(PLATING_OPTIONS.map(({ value, label }) => [value, label]));

const groupRecordsByEmployee = (records = []) => {
  const groups = new Map();
  records.forEach((record) => {
    const key = String(record.employeeUserId ?? `name:${record.employeeName || '—'}`);
    if (!groups.has(key)) {
      groups.set(key, {
        employeeUserId: key,
        employeeName: record.employeeName || '—',
        records: [],
      });
    }
    groups.get(key).records.push(record);
  });
  return [...groups.values()];
};

export function EmployeeProductionRecord({ record, linkToOrder = false, showStatus = false, showItemIcon = false }) {
  const colorKey = record.platingColor === 'GOLD' || record.platingColor === 'SILVER' ? record.platingColor : 'NONE';
  const tone = colorKey === 'GOLD' ? 'gold' : colorKey === 'SILVER' ? 'silver' : 'matte';
  const dimension = [record.diameter, record.thickness]
    .map((value) => value == null || value === '' ? '—' : productionFa(value))
    .join(' × ');

  const quantity = Number(record.quantity) || 0;
  const hasMeasuredWeight = Number(record.totalWeightGrams) > 0;
  const hasQuantity = quantity > 0 && !record.quantityPending;
  const showProductionStatus = record.productionComplete || showStatus;
  const hasProductionValues = hasMeasuredWeight || hasQuantity || record.quantityPending;

  const itemDetails = <span className="statistics-production-item-title">
    <strong className="statistics-production-product">{record.productName || '—'}</strong>
    <strong className="statistics-production-customer">{record.customerName || '—'}</strong>
    <span className="statistics-production-spec-row">
      <bdi className="statistics-production-dimensions" dir="ltr">{dimension}</bdi>
      <span className="statistics-production-color" data-tone={tone}>{platingLabels[colorKey]}</span>
    </span>
  </span>;

  const content = <div className="statistics-production-sentence has-report-columns">
      <span className="statistics-production-item-identity">
        {showItemIcon && <span className="statistics-production-image" aria-hidden="true"><i className="fa-solid fa-cube" /></span>}
        {itemDetails}
      </span>
      {(hasProductionValues || showProductionStatus) && <div className="statistics-production-values">
        {hasQuantity && <span className="statistics-production-value statistics-production-quantity"><strong>{productionFa(quantity)} عدد</strong></span>}
        {record.quantityPending && <strong className="statistics-production-unit-unknown statistics-production-quantity">۰ عدد</strong>}
        {hasMeasuredWeight && <span className="statistics-production-value statistics-production-weight"><strong>{productionFa(Number(record.totalWeightGrams) / 1000)} کیلو</strong></span>}
        {showProductionStatus && <span
          className={`statistics-production-status ${record.productionComplete ? 'statistics-production-complete' : 'statistics-production-pending'}`}
          role="img"
          aria-label={record.productionComplete ? 'تولید این قلم تکمیل شده' : 'تولید این قلم در حال انجام است'}
          title={record.productionComplete ? 'تولید تکمیل شده' : 'تولید در حال انجام'}
        >
          <i className={`fa-solid ${record.productionComplete ? 'fa-check' : 'fa-ellipsis'}`} aria-hidden="true" />
        </span>}
      </div>}
    </div>;
  return <article className="statistics-production-record" dir="rtl">
    {linkToOrder && record.orderId ? <Link
      className="statistics-production-link"
      to={`/orders/view/${record.orderId}${record.orderItemUid ? `?itemUid=${encodeURIComponent(record.orderItemUid)}` : ''}`}
      aria-label={`نمایش سفارش ${record.orderNumber}، ${record.productName || 'قطعه'}`}
    >{content}</Link> : content}
  </article>;
}

export default function ProductionDayDetails({ date, details, loading, error, showEmployee = false, emptyMessage = 'در این روز تولیدی ثبت نشده است.' }) {
  if (!date) return null;
  const day = Number(date.slice(6, 8));
  const employeeGroups = showEmployee ? groupRecordsByEmployee(details?.records) : [];

  return <section className="statistics-details glass-card">
    {!showEmployee && <div className="statistics-card-title">
      <div>
        <h2>تولید روز {productionFa(day)} {PRODUCTION_MONTHS[Number(date.slice(4, 6)) - 1]}</h2>
        <p>{date.slice(0, 4)}/{date.slice(4, 6)}/{date.slice(6, 8)}</p>
      </div>
      {details && <b>{productionFa(details.total)} عدد</b>}
    </div>}
    {loading && <div className="detail-state">در حال دریافت جزئیات...</div>}
    {error && <div className="detail-state error">{error}</div>}
    {details && details.records.length === 0 && <div className="detail-state">{emptyMessage}</div>}
    {showEmployee ? employeeGroups.map((group) => <section className="statistics-worker-group" key={group.employeeUserId} aria-label={`تولید ${group.employeeName}`}>
      <h3 className="statistics-worker-name">{group.employeeName}</h3>
      <div className="statistics-worker-products">
        {group.records.map((record) => <EmployeeProductionRecord key={record.id} record={record} />)}
      </div>
    </section>) : details?.records.map((record) => {
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
          <div><dd>{record.totalWeightGrams ? `${productionFa(record.totalWeightGrams / 1000)} کیلو` : '—'}</dd></div>
          <div><dt>ابعاد</dt><dd>{record.thickness ?? '—'} × {record.diameter ?? '—'} میلی‌متر</dd></div>
          <div><dt>زمان ثبت</dt><dd>{record.createdAt ? new Date(record.createdAt).toLocaleString('fa-IR') : '—'}</dd></div>
        </dl>
      </article>;
    })}
  </section>;
}
