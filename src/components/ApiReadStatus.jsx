import React from 'react';

export default function ApiReadStatus({ queries, empty = false }) {
  const failed = queries.filter((query) => query.error);
  if (failed.length) return <div role="alert" dir="rtl" className="inline-error">
    دریافت اطلاعات ناموفق بود. اتصال اینترنت را بررسی کنید.
    <button type="button" onClick={() => failed.forEach((query) => query.refresh())}>تلاش دوباره</button>
  </div>;
  if (queries.some((query) => query.loading)) return <p role="status" dir="rtl" className="hint-text">در حال بارگذاری...</p>;
  return empty ? <p className="hint-text" dir="rtl">موردی یافت نشد.</p> : null;
}
