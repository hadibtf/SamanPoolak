import { peopleApi, attendanceApi } from '../api/client';
import { useApiQuery, liveRows, upsertRow } from '../hooks/useApiQuery';
import ApiReadStatus from '../components/ApiReadStatus';
import React, { useState, useMemo, useRef } from 'react';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { jalaliDateKey } from '../domain';
import {
  groupByDay, computeDay, formatDuration, formatDateKey, formatBalance, toFa, toMinutes,
} from '../utils/attendance';
import { useHolidays } from '../holidays';
import { usePayrollSettings, hourlyAdjustRate } from '../payrollSettings';
import { useSettings } from '../context/SettingsContext';
import styles from './PayrollAttendance.module.css';

const DOUBLE_SCAN_MIN = 10;

const mkFirst = (y, m) =>
  new DateObject({ calendar: persian, locale: persian_fa, year: y, month: m, day: 1 });

// Persian weekday name (شنبه ... جمعه) for a YYYYMMDD Jalali key.
const weekdayOf = (dateKey) => {
  if (!dateKey || String(dateKey).length !== 8) return '';
  const d = new DateObject({
    calendar: persian,
    locale: persian_fa,
    year: Number(dateKey.slice(0, 4)),
    month: Number(dateKey.slice(4, 6)),
    day: Number(dateKey.slice(6, 8)),
  });
  return d.weekDay?.name || '';
};

const PayrollAttendance = () => {
  const { formatMoney } = useSettings();
  const s = usePayrollSettings();
  // Shift window + unpaid breaks from the settings tab.
  const breakMin = (Number(s.breakfastMin) || 0) + (Number(s.lunchMin) || 0);
  const shiftWindowMin = Math.max(
    0,
    (toMinutes(s.shiftEnd) ?? 0) - (toMinutes(s.shiftStart) ?? 0)
  );
  const fileRef = useRef(null);
  const [toast, setToast] = useState(null);
  const [importing, setImporting] = useState(false);

  // Detail modal state
  const [selected, setSelected] = useState(null); // { cardNo, name }
  const [fFrom, setFFrom] = useState(null);
  const [fTo, setFTo] = useState(null);
  const [exitInputs, setExitInputs] = useState({}); // dateKey -> "HH:mm"
  const [expandedDays, setExpandedDays] = useState({});

  const peopleQuery = useApiQuery(async () => liveRows((await peopleApi.list()).people).filter((p) => p.category === 'EMPLOYEE'));
  const { data: employees } = peopleQuery;
  const countQuery = useApiQuery(async () => (await attendanceApi.list({ countOnly: 1 })).count);
  const scanCount = countQuery.data;

  // Card number now lives on the person (server-backed people.cardNo).
  const cardByPerson = useMemo(() => {
    const m = {};
    (employees || []).forEach((e) => { if (e.cardNo) m[e.id] = e.cardNo; });
    return m;
  }, [employees]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleImportClick = () => fileRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const records = Array.isArray(payload?.records) ? payload.records : [];
      if (!records.length) throw new Error('فایل معتبر نیست یا رکوردی ندارد.');
      const summary = await attendanceApi.import(payload);
      await Promise.all([countQuery.refresh(), scansQuery.refresh()]);
      const range = summary.minDate && summary.maxDate
        ? ` از ${formatDateKey(summary.minDate)} تا ${formatDateKey(summary.maxDate)}`
        : '';
      showToast(`${summary.count} رکورد${range} وارد شد.`);
    } catch (err) {
      console.error('Attendance import failed:', err);
      const detail = err?.message ? ` (${err.message})` : '';
      showToast(`ورود ناموفق بود${detail}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  // ----- detail modal -----
  const fromKey = useMemo(() => jalaliDateKey(fFrom), [fFrom]);
  const toKey = useMemo(() => jalaliDateKey(fTo), [fTo]);

  const scansQuery = useApiQuery(async () => {
    if (!selected?.cardNo || !fromKey || !toKey || fromKey > toKey) return [];
    return liveRows((await attendanceApi.list({ cardNo: selected.cardNo, from: fromKey, to: toKey })).attendance);
  }, [selected?.cardNo, fromKey, toKey]);
  const { data: scans } = scansQuery;

  const removeScan = async (id) => {
    try {
      await attendanceApi.remove(id);
      scansQuery.setData((rows) => (rows || []).filter((row) => row.id !== id));
      await countQuery.refresh();
    } catch (error) {
      showToast('عملیات ناموفق بود. اتصال اینترنت را بررسی کنید.', 'error');
    }
  };

  // Holidays come from the manually-uploaded calendar (Settings); version bumps
  // on import so the day calcs below recompute.
  const { isHoliday, version: holidayVersion } = useHolidays();

  const days = useMemo(() => {
    const grouped = groupByDay(scans || []);
    return grouped.map((d) => ({
      ...d,
      summary: computeDay(d.scans, {
        doubleScanMinutes: DOUBLE_SCAN_MIN, breakMin, shiftWindowMin,
        isHoliday: isHoliday(d.dateKey),
      }),
    }));
    // holidayVersion: recompute when holiday data loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scans, breakMin, shiftWindowMin, holidayVersion]);

  const totals = useMemo(() => {
    let worked = 0; let overtime = 0; let deduction = 0; let daysWorked = 0;
    for (const d of days) {
      const { workedMin, balanceMin } = d.summary;
      if (workedMin == null) continue;
      worked += workedMin;
      daysWorked += 1;
      if (balanceMin > 0) overtime += balanceMin;
      else deduction += -balanceMin;
    }
    const netMin = overtime - deduction;
    const netRial = (netMin / 60) * hourlyAdjustRate(s);
    return { worked, overtime, deduction, netMin, netRial, daysWorked };
  }, [days, s]);

  const openEmployee = (emp) => {
    const cardNo = cardByPerson[emp.id];
    if (!cardNo) {
      showToast('برای این کارمند کد ثبت نشده — در صفحه افراد وارد کنید.', 'error');
      return;
    }
    const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
      || `کد ${cardNo}`;
    setSelected({ cardNo, name });
    setExitInputs({});
    // Default range = current Jalali month to today.
    const today = new DateObject({ calendar: persian, locale: persian_fa });
    setFFrom(mkFirst(today.year, today.month.number));
    setFTo(today);
  };

  const closeModal = () => { setSelected(null); setFFrom(null); setFTo(null); };

  const setThisMonth = () => {
    const today = new DateObject({ calendar: persian, locale: persian_fa });
    setFFrom(mkFirst(today.year, today.month.number));
    setFTo(today);
  };

  const setPrevMonth = () => {
    const today = new DateObject({ calendar: persian, locale: persian_fa });
    let py = today.year;
    let pm = today.month.number - 1;
    if (pm < 1) { pm = 12; py -= 1; }
    setFFrom(mkFirst(py, pm));
    setFTo(mkFirst(py, pm).toLastOfMonth());
  };

  // Flexible time entry:
  //   "HH:MM" (any minute, e.g. 7:20) -> exact
  //   4 digits "HHMM"  -> 1702 = 17:02, 0720 = 07:20
  //   1-3 digits       -> last digit = minutes ones (tens 0), rest = hour:
  //                       72 -> 07:02, 172 -> 17:02 (so 72 != 07:20)
  const parseQuickTime = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return null;
    let m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
    if (m) {
      const h = Number(m[1]); const mi = Number(m[2]);
      if (h > 23 || mi > 59) return null;
      return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }
    if (/^\d{4}$/.test(t)) {
      const h = Number(t.slice(0, 2)); const mi = Number(t.slice(2));
      if (h > 23 || mi > 59) return null;
      return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }
    if (/^\d{1,3}$/.test(t)) {
      const mi = Number(t.slice(-1));
      const h = Number(t.slice(0, -1) || '0');
      if (h > 23) return null;
      return `${String(h).padStart(2, '0')}:0${mi}`;
    }
    return null;
  };

  const handleAddExit = async (dateKey) => {
    const time = parseQuickTime(exitInputs[dateKey]);
    if (!time) {
      showToast('زمان نامعتبر است.', 'error');
      return;
    }
    try {
      const { attendance } = await attendanceApi.create({ cardNo: selected.cardNo, dateKey, time, source: 'manual' });
      scansQuery.setData((rows) => upsertRow(rows, attendance));
      setExitInputs((prev) => ({ ...prev, [dateKey]: '' }));
      await countQuery.refresh();
    } catch (error) {
      showToast('عملیات ناموفق بود. اتصال اینترنت را بررسی کنید.', 'error');
    }
  };

  const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  return (
    <div className={styles.root}>
      <ApiReadStatus queries={[peopleQuery, countQuery]} />
      <div className="card att-import-card">
        <div className="att-import-row">
          <div>
            <h2 className="att-h2">سوابق حضور و غیاب</h2>
            <p className="att-sub">
              {countQuery.loading || countQuery.error ? '' : scanCount ? `${toFa(scanCount)} رکورد` : 'هنوز رکوردی وارد نشده است'}
            </p>
          </div>
          <button className="att-btn-primary" onClick={handleImportClick} disabled={importing}>
            {importing ? 'در حال ورود...' : 'بروز رسانی سوابق'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
        </div>
      </div>

      <div className="card">
        <h3 className="att-h3">کارمندان</h3>
        <div className="att-emp-list">
          {(employees || []).map((emp) => {
            const card = cardByPerson[emp.id];
            const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || '—';
            return (
              <button
                key={emp.id}
                className={`att-emp-row ${card ? '' : 'disabled'}`}
                onClick={() => openEmployee(emp)}
              >
                <span className="att-emp-name">{name}</span>
                <span className="att-emp-card">
                  {card ? <>کد: <strong>{String(card).replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[digit])}</strong></> : 'بدون کد'}
                </span>
              </button>
            );
          })}
          {employees && employees.length === 0 && (
            <p className="att-hint">کارمندی ثبت نشده است.</p>
          )}
        </div>
      </div>

      {selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content att-modal" onClick={(e) => e.stopPropagation()}>
            <div className="att-modal-head">
              <div className="att-person-title">
                <span className="att-person-icon"><i className="fa-solid fa-user" aria-hidden="true" /></span>
                <h2>{selected.name}</h2>
              </div>
              <button className="att-close" onClick={closeModal}><i className="fa-solid fa-xmark" aria-hidden="true" /> بستن</button>
            </div>

            <ApiReadStatus queries={[scansQuery]} />
            <div className="att-range">
              <div className="att-range-pickers">
                <div className="att-date-field">
                  <label>از تاریخ</label>
                  <div className="att-date-control">
                    <JalaliDatePicker value={fFrom} onChange={setFFrom} calendar={persian} locale={persian_fa} weekDays={weekDays} placeholder="از تاریخ" calendarPosition="bottom-right" />
                    <i className="fa-regular fa-calendar" aria-hidden="true" />
                  </div>
                </div>
                <div className="att-date-field">
                  <label>تا تاریخ</label>
                  <div className="att-date-control">
                    <JalaliDatePicker value={fTo} onChange={setFTo} calendar={persian} locale={persian_fa} weekDays={weekDays} placeholder="تا تاریخ" calendarPosition="bottom-right" />
                    <i className="fa-regular fa-calendar" aria-hidden="true" />
                  </div>
                </div>
              </div>
              <div className="att-range-presets">
                <span className="att-preset-label">بازه زمانی</span>
                <div className="att-quick">
                  <button onClick={setThisMonth}>این ماه</button>
                  <button onClick={setPrevMonth}>ماه قبل</button>
                </div>
              </div>
            </div>

            <div className="att-summary">
              <div className="att-sum-cell att-sum-work">
                <span className="att-sum-icon"><i className="fa-regular fa-clock" aria-hidden="true" /></span>
                <span>کل ساعت کارکرد</span>
                <strong>{formatDuration(totals.worked)}</strong>
                <small>{toFa(totals.daysWorked)} روز</small>
              </div>
              <div className="att-sum-cell att-sum-overtime">
                <span className="att-sum-icon"><i className="fa-solid fa-arrow-trend-up" aria-hidden="true" /></span>
                <span>اضافه‌کاری</span>
                <strong className="pos">{formatDuration(totals.overtime)}</strong>
              </div>
              <div className="att-sum-cell att-sum-deduction">
                <span className="att-sum-icon"><i className="fa-solid fa-circle-minus" aria-hidden="true" /></span>
                <span>کسری</span>
                <strong className="neg">{formatDuration(totals.deduction)}</strong>
              </div>
              <div className="att-sum-cell att-sum-net">
                <span className="att-sum-icon"><i className="fa-solid fa-wallet" aria-hidden="true" /></span>
                <span>{totals.netMin >= 0 ? 'خالص اضافه‌کاری' : 'خالص کسری'}</span>
                <strong className={totals.netMin >= 0 ? 'pos' : 'neg'}>
                  {formatMoney(Math.round(Math.abs(totals.netRial)))}
                </strong>
              </div>
            </div>
            <div className="att-info-banner">
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
              <p className="att-hint">
                شیفت: {toFa(s.shiftStart)} تا {toFa(s.shiftEnd)} • تنفس روزانه {toFa(breakMin)} دقیقه از زمان کار کسر می‌شود • قابل تغییر در تب «تنظیمات».
              </p>
            </div>

            <div className="att-days">
              <div className="att-days-title-row">
                <h3 className="att-list-title"><i className="fa-regular fa-calendar" aria-hidden="true" /> لیست حضور و غیاب</h3>
                <span className="att-days-count"><i className="fa-regular fa-calendar" aria-hidden="true" /> {toFa(days.length)} روز</span>
              </div>
              {days.length > 0 && (
                <div className="att-day-header">
                  <span>روز و تاریخ</span>
                  <span>ورود / خروج</span>
                  <span>مدت کارکرد</span>
                  <span>وضعیت</span>
                  <span />
                </div>
              )}
              {!scansQuery.loading && !scansQuery.error && days.length === 0 && <p className="att-hint">رکوردی در این بازه یافت نشد.</p>}
              {days.map(({ dateKey, summary }) => {
                const dupSecondIds = new Set(summary.flags.duplicates.map((d) => d.second.id));
                const flagged = summary.flags.missingExit || summary.flags.duplicates.length > 0;
                const detailsOpen = expandedDays[dateKey] ?? false;
                const firstScan = summary.scans[0];
                const lastScan = summary.scans[summary.scans.length - 1];
                const renderTime = (scan) => (scan ? (
                  <span
                    className={scan.source === 'manual' ? 't-manual' : undefined}
                    onClick={scan.source === 'manual' ? () => removeScan(scan.id) : undefined}
                    title={scan.source === 'manual' ? 'حذف ثبت دستی' : undefined}
                  >{toFa(scan.time)}</span>
                ) : '—');
                return (
                  <div key={dateKey} className={`att-day ${flagged ? 'flagged' : ''}`}>
                    <div className="att-day-main">
                      <span className="att-day-id">
                        <b>{weekdayOf(dateKey)}</b>
                        <span className="att-day-date">{formatDateKey(dateKey)}</span>
                      </span>
                      {/* align under header «ورود / خروج»: exit (left) – entry (right) */}
                      <span className="att-day-times" dir="ltr">
                        {summary.scans.length > 1
                          ? <>{renderTime(lastScan)}{' – '}{renderTime(firstScan)}</>
                          : renderTime(firstScan)}
                      </span>
                      <span className={`att-day-dur ${summary.flags.missingExit ? 'warn' : ''}`}>
                        {summary.workedMin != null ? (
                          <span className="att-worked">{formatDuration(summary.workedMin)}</span>
                        ) : 'بدون خروج'}
                      </span>
                      <span className={`att-status ${summary.workedMin == null ? 'warn' : summary.balanceMin >= 0 ? 'pos' : 'neg'}`}>
                        <i aria-hidden="true" />
                        {summary.workedMin == null ? 'ناقص' : formatBalance(summary.balanceMin)}
                      </span>
                      <button
                        type="button"
                        className={`att-day-chevron ${detailsOpen ? 'expanded' : ''}`}
                        aria-label={detailsOpen ? 'بستن جزئیات روز' : 'نمایش جزئیات روز'}
                        aria-expanded={detailsOpen}
                        onClick={() => setExpandedDays((prev) => ({ ...prev, [dateKey]: !detailsOpen }))}
                      ><i className="fa-solid fa-chevron-down" aria-hidden="true" /></button>
                    </div>

                    {detailsOpen && summary.scans.length > 0 && (
                      <div className="att-scans">
                        {summary.scans.map((s) => (
                          <span
                            key={s.id}
                            className={`att-scan ${s.source === 'manual' ? 'manual' : ''} ${dupSecondIds.has(s.id) ? 'dup' : ''}`}
                          >
                            {toFa(s.time)}
                            {(s.source === 'manual' || dupSecondIds.has(s.id)) && (
                              <button
                                className="att-scan-del"
                                title="حذف"
                                onClick={() => removeScan(s.id)}
                              >×</button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {detailsOpen && summary.flags.missingExit && (
                      <div className="att-flag warn">
                        <span>⚠️ خروج ثبت نشده</span>
                        <div className="att-exit-add">
                          <input
                            placeholder="12:00"
                            value={exitInputs[dateKey] || ''}
                            onChange={(e) => setExitInputs((p) => ({ ...p, [dateKey]: e.target.value }))}
                          />
                          <button onClick={() => handleAddExit(dateKey)}>افزودن</button>
                        </div>
                      </div>
                    )}

                    {detailsOpen && summary.flags.duplicates.map((d, i) => (
                      <div key={i} className="att-flag info att-dup-row">
                        <span>↔️ ثبت نزدیک: {toFa(d.first.time)} / {toFa(d.second.time)} ({toFa(d.gap)} دقیقه)</span>
                        <button onClick={() => removeScan(d.second.id)}>ادغام</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default PayrollAttendance;
