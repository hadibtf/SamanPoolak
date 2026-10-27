import React, { useEffect, useState } from 'react';
import { clearLegacyCursors, readLegacySnapshot, needsLegacyExport, deviceOnlyData, deleteLegacyDatabase } from '../legacyDataCleanup';

export default function LegacyDataCleanup() {
  const [snapshot, setSnapshot] = useState(null);
  const [exported, setExported] = useState(null);
  const [status, setStatus] = useState('checking');

  const inspect = async () => {
    setStatus('checking');
    try {
      const data = await readLegacySnapshot();
      setSnapshot(data);
      if (needsLegacyExport(data)) { setStatus('export'); return; }
      if (!data) { clearLegacyCursors(); setStatus('deleted'); return; }
      setStatus(await deleteLegacyDatabase());
    } catch { setStatus('error'); }
  };

  useEffect(() => { inspect(); }, []);

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'saman-poolak-legacy-v1', exportedAt: new Date().toISOString(), stores: snapshot }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `saman-poolak-device-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(JSON.stringify(deviceOnlyData(snapshot)));
  };

  const finish = async () => {
    setStatus('checking');
    try {
      // Recheck before deleting: another old tab may have written since export.
      const latest = await readLegacySnapshot();
      if (needsLegacyExport(latest) && JSON.stringify(deviceOnlyData(latest)) !== exported) {
        setSnapshot(latest); setExported(null); setStatus('export'); return;
      }
      setStatus(await deleteLegacyDatabase());
    } catch { setStatus('error'); }
  };

  if (status === 'checking' || status === 'deleted') return null;
  return <section className="glass-card" dir="rtl" aria-label="انتقال اطلاعات قدیمی دستگاه">
    {status === 'export' ? <>
      <p>اطلاعات حضور و غیاب یا کد کارت قدیمی فقط روی این دستگاه وجود دارد. پیش از پاک‌سازی، فایل پشتیبان را ذخیره کنید. این فایل به سرور ارسال نمی‌شود؛ برای بازیابی و بررسی نگه دارید.</p>
      <button type="button" onClick={download}>دریافت پشتیبان اطلاعات دستگاه</button>
      {exported && <button type="button" onClick={finish}>فایل را ذخیره کردم؛ پاک‌سازی اطلاعات قدیمی دستگاه</button>}
    </> : <>
      <p role="alert">{status === 'blocked' ? 'برای تکمیل پاک‌سازی، برگه‌های دیگر برنامه را ببندید و صفحه را دوباره بارگذاری کنید.' : 'بررسی اطلاعات قدیمی دستگاه ناموفق بود. هیچ اطلاعاتی پاک نشد.'}</p>
      <button type="button" onClick={inspect}>تلاش دوباره</button>
    </>}
  </section>;
}
