import React, { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { db, jalaliDateKey, importAttendance, addManualScan, removeScan } from '../db';
import {
  groupByDay, computeDay, formatDuration, formatDateKey, formatBalance, toFa, toMinutes,
} from '../utils/attendance';
import { useHolidays } from '../holidays';
import { usePayrollSettings, hourlyAdjustRate } from '../payrollSettings';
import { useSettings } from '../context/SettingsContext';
import './PayrollAttendance.css';

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

  const employees = useLiveQuery(
    () => db.people.where('category').equals('EMPLOYEE').toArray(),
    []
  );
  const scanCount = useLiveQuery(() => db.attendance.count(), []);

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
      const summary = await importAttendance(payload);
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

  const scans = useLiveQuery(
    () => {
      if (!selected?.cardNo || !fromKey || !toKey) return [];
      return db.attendance
        .where('cardNo').equals(selected.cardNo)
        .filter((s) => !s.deletedAt && s.dateKey >= fromKey && s.dateKey <= toKey)
        .toArray();
    },
    [selected?.cardNo, fromKey, toKey]
  );

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
      showToast('برای این کارمند کد کارت ثبت نشده — در صفحه افراد وارد کنید.', 'error');
      return;
    }
    const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
      || `کارت ${cardNo}`;
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
    await addManualScan(selected.cardNo, dateKey, time);
    setExitInputs((prev) => ({ ...prev, [dateKey]: '' }));
  };

  const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  return (
    <div className="attendance-tab">
      <div className="card att-import-card">
        <div className="att-import-row">
          <div>
            <h2 className="att-h2">سوابق حضور و غیاب</h2>
            <p className="att-sub">
              {scanCount ? `${toFa(scanCount)} رکورد` : 'هنوز رکوردی وارد نشده است'}
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
                  {card ? `کارت ${card}` : 'بدون کد کارت'}
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
              <h2>{selected.name}</h2>
              <button className="att-close" onClick={closeModal}>بستن</button>
            </div>

            <div className="att-range">
              <div className="att-range-pickers">
                <JalaliDatePicker
                  value={fFrom}
                  onChange={setFFrom}
                  calendar={persian}
                  locale={persian_fa}
                  weekDays={weekDays}
                  placeholder="از تاریخ"
                  calendarPosition="bottom-right"
                />
                <JalaliDatePicker
                  value={fTo}
                  onChange={setFTo}
                  calendar={persian}
                  locale={persian_fa}
                  weekDays={weekDays}
                  placeholder="تا تاریخ"
                  calendarPosition="bottom-right"
                />
              </div>
              <div className="att-quick">
                <button onClick={setThisMonth}>این ماه</button>
                <button onClick={setPrevMonth}>ماه قبل</button>
              </div>
            </div>

            <div className="att-summary">
              <div className="att-sum-cell">
                <span>کل کارکرد</span>
                <strong>{formatDuration(totals.worked)}</strong>
                <small>{toFa(totals.daysWorked)} روز</small>
              </div>
              <div className="att-sum-cell">
                <span>اضافه‌کاری</span>
                <strong className="pos">{formatDuration(totals.overtime)}</strong>
              </div>
              <div className="att-sum-cell">
                <span>کسری</span>
                <strong className="neg">{formatDuration(totals.deduction)}</strong>
              </div>
              <div className="att-sum-cell att-sum-net">
                <span>{totals.netMin >= 0 ? 'خالص اضافه‌کاری' : 'خالص کسری'}</span>
                <strong className={totals.netMin >= 0 ? 'pos' : 'neg'}>
                  {formatMoney(Math.round(Math.abs(totals.netRial)))}
                </strong>
              </div>
            </div>
            <p className="att-hint">
              شیفت {toFa(s.shiftStart)} تا {toFa(s.shiftEnd)} • تنفس روزانه {toFa(breakMin)} دقیقه
              (از زمان کار کسر می‌شود) • قابل تغییر در تب «تنظیمات».
            </p>

            <div className="att-days">
              {days.length > 0 && (
                <div className="att-day-header">
                  <span>روز</span>
                  <span>ورود / خروج</span>
                  <span>کارکرد</span>
                </div>
              )}
              {days.length === 0 && <p className="att-hint">رکوردی در این بازه یافت نشد.</p>}
              {days.map(({ dateKey, summary }) => {
                const dupSecondIds = new Set(summary.flags.duplicates.map((d) => d.second.id));
                // Chips only for genuinely messy days (3+ punches or a duplicate);
                // a plain entry+manual-exit day stays as the single summary line.
                const hasExtra = summary.scans.length > 2 || dupSecondIds.size > 0;
                const flagged = summary.flags.missingExit || summary.flags.duplicates.length > 0;
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
                          <>
                            <span className="att-worked">{formatDuration(summary.workedMin)}</span>
                            <span className={`att-bal ${summary.balanceMin >= 0 ? 'pos' : 'neg'}`}>
                              {formatBalance(summary.balanceMin)}
                            </span>
                          </>
                        ) : 'بدون خروج'}
                      </span>
                    </div>

                    {hasExtra && (
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

                    {summary.flags.missingExit && (
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

                    {summary.flags.duplicates.map((d, i) => (
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
