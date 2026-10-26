import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, jalaliDateKey } from '../db';
import JalaliDatePicker from "../components/JalaliDatePicker";
import DateObject from 'react-date-object';
import PersonFormSheet from '../components/PersonFormSheet';
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useSettings } from '../context/SettingsContext';
import { useHolidays } from '../holidays';
import { computeDay, groupByDay, toMinutes } from '../utils/attendance';
import PayrollAttendance from './PayrollAttendance';
import PayrollSettings from './PayrollSettings';
import JobApplications from './JobApplications';
import { usePayrollSettings } from '../payrollSettings';
import styles from './HumanResources.module.css';
import SegmentedTabs from '../components/SegmentedTabs';

const formatNum = (num) => {
  return Math.round(num).toLocaleString('fa-IR');
};

// Latin -> Persian digits without any grouping separator (for years etc.)
const toFa = (val) => String(val).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

// Jalali calendar helpers (module scope so they can be reused for the
// absent-day per-month divisor as well as the worked-days calculation).
const isLeap = (year) => [1, 5, 9, 13, 17, 22, 26, 30].includes(year % 33);
const getDaysInMonth = (year, month) => {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isLeap(year) ? 30 : 29;
};

const calculateDays = (start, end) => {
  if (!start || !end) return { ratio: 0, days: 0, text: "" };

  let totalDays = 0;
  let totalRatio = 0;

  const startObj = start.toDate ? start.toDate() : new Date(start);
  const endObj = end.toDate ? end.toDate() : new Date(end);

  if (startObj > endObj) return { ratio: 0, days: 0, text: "" };

  let cy = start.year, cm = start.month.number, cd = start.day;
  let y2 = end.year, m2 = end.month.number, d2 = end.day;

  let fullMonths = 0;
  let extraDays = 0;

  while (true) {
    let dim = getDaysInMonth(cy, cm);
    if (cy === y2 && cm === m2) {
      let sD = (cy === start.year && cm === start.month.number) ? cd : 1;
      let worked = d2 - sD + 1;
      totalDays += worked;
      totalRatio += worked / dim;
      if (worked === dim && sD === 1) fullMonths++; else extraDays += worked;
      break;
    } else {
      let sD = (cy === start.year && cm === start.month.number) ? cd : 1;
      let worked = dim - sD + 1;
      totalDays += worked;
      totalRatio += worked / dim;
      if (worked === dim && sD === 1) fullMonths++; else extraDays += worked;
      cm++; cd = 1;
      if (cm > 12) { cm = 1; cy++; }
    }
  }

  if (extraDays >= 30) {
    fullMonths += Math.floor(extraDays / 30);
    extraDays = extraDays % 30;
  }

  let msgParts = [];
  if (fullMonths > 0) msgParts.push(`${formatNum(fullMonths)} ماه`);
  if (extraDays > 0) msgParts.push(`${formatNum(extraDays)} روز`);
  let textStr = msgParts.join(' و ') || (formatNum(totalDays) + " روز");

  return { ratio: totalRatio, days: totalDays, text: textStr };
};

const HumanResources = () => {
  const [activeTab, setActiveTab] = useState('calc'); // 'calc' | 'attendance'
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [sanavat, setSanavat] = useState('');
  const [children, setChildren] = useState('');
  const [overtime, setOvertime] = useState('');
  const [hourlyDeduction, setHourlyDeduction] = useState('');
  const [unusedLeave, setUnusedLeave] = useState('');
  const [absentDays, setAbsentDays] = useState('');
  const [reward, setReward] = useState('');
  const [married, setMarried] = useState(false);
  const [noInsurance, setNoInsurance] = useState(false);
  const { isToman, currencyLabel } = useSettings(); // app-wide currency
  const s = usePayrollSettings(); // editable rates (single source, shared with attendance)
  const [results, setResults] = useState(null);
  const [daysInfo, setDaysInfo] = useState({ text: "", days: 0 });
  const [copied, setCopied] = useState(false);

  const handleSelectPreviousMonth = () => {
    const currentDate = new DateObject({ calendar: persian, locale: persian_fa });
    let year = currentDate.year;
    let month = currentDate.month.number - 1;

    if (month < 1) {
      month = 12;
      year -= 1;
    }

    setStartDate(new DateObject({ year, month, day: 1, calendar: persian, locale: persian_fa }));
    setEndDate(new DateObject({ year, month, day: getDaysInMonth(year, month), calendar: persian, locale: persian_fa }));
  };

  const slipRef = useRef(null);
  // True once the user has calculated; lets inputs/currency changes re-run the
  // calc without an effect that depends on `results` (which would loop forever).
  const hasCalculatedRef = useRef(false);

  // Predictive Search State
  const [searchFullName, setSearchFullName] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isEmployeeSheetOpen, setIsEmployeeSheetOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const { isHoliday, version: holidayVersion } = useHolidays();
  const breakMin = (Number(s.breakfastMin) || 0) + (Number(s.lunchMin) || 0);
  const shiftWindowMin = Math.max(0, (toMinutes(s.shiftEnd) ?? 0) - (toMinutes(s.shiftStart) ?? 0));

  const matchedEmployees = useLiveQuery(
    () => {
      const q = searchFullName.trim();
      return db.people
        .where('category').equals('EMPLOYEE')
        .filter(person => {
          if (!q) return true;
          const full = `${person.firstName || ''} ${person.lastName || ''}`;
          return full.includes(q);
        })
        .toArray()
        .then(people => people.sort((a, b) =>
          `${a.firstName || ''} ${a.lastName || ''}`.localeCompare(`${b.firstName || ''} ${b.lastName || ''}`, 'fa')
        ));
    },
    [searchFullName]
  );

  const attendanceFromKey = startDate ? jalaliDateKey(startDate) : '';
  const attendanceToKey = endDate ? jalaliDateKey(endDate) : '';
  const attendanceScans = useLiveQuery(
    () => {
      const cardNo = selectedEmployee?.cardNo;
      if (!cardNo || !attendanceFromKey || !attendanceToKey || attendanceFromKey > attendanceToKey) return [];
      return db.attendance
        .where('cardNo').equals(String(cardNo))
        .filter((scan) => !scan.deletedAt && scan.dateKey >= attendanceFromKey && scan.dateKey <= attendanceToKey)
        .toArray();
    },
    [selectedEmployee?.cardNo, attendanceFromKey, attendanceToKey]
  );

  const attendanceAdjustments = useMemo(() => {
    let overtimeMinutes = 0;
    let deductionMinutes = 0;
    let completeDays = 0;

    for (const day of groupByDay(attendanceScans || [])) {
      const summary = computeDay(day.scans, {
        doubleScanMinutes: 10,
        breakMin,
        shiftWindowMin,
        isHoliday: isHoliday(day.dateKey),
      });
      if (summary.balanceMin == null) continue;
      completeDays += 1;
      if (summary.balanceMin > 0) overtimeMinutes += summary.balanceMin;
      else if (summary.balanceMin < 0) deductionMinutes += Math.abs(summary.balanceMin);
    }

    return { overtimeMinutes, deductionMinutes, completeDays };
  }, [attendanceScans, breakMin, shiftWindowMin, isHoliday, holidayVersion]);

  const handleSelectEmployee = (emp) => {
    setSelectedEmployee(emp);
    setSearchFullName(`${emp.firstName} ${emp.lastName}`);
    setShowDropdown(false);
    setOvertime('');
    setHourlyDeduction('');
  };

  const handleClearSelection = () => {
    setSelectedEmployee(null);
    setSearchFullName('');
    setOvertime('');
    setHourlyDeduction('');
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCalculate = useCallback(() => {
    if (!startDate || !endDate) {
      return;
    }

    // Rates from the shared settings (single source).
    const CONSTANTS_RIAL = {
      DAILY_WAGE: Number(s.dailyWage) || 0,
      CHILD_ALLOWANCE: Number(s.childAllowance) || 0,
      MASKAN: Number(s.maskan) || 0,
      BON: Number(s.bon) || 0,
      TAHAHOL: Number(s.tahahol) || 0,
    };
    const SHIFT_HOURS = Number(s.shiftHours) || 7.33;
    const OVERTIME_FACTOR = Number(s.overtimeFactor) || 1.4;

    const { ratio, days, text } = calculateDays(startDate, endDate);
    if (days <= 0) {
      return;
    }

    setDaysInfo({ text, days });

    const multiplier = isToman ? 0.1 : 1;

    // --- Insured items (the only base insurance applies to) ---
    const baseSalary = (CONSTANTS_RIAL.DAILY_WAGE * multiplier) * days;
    const sanavatTotal = (Number(sanavat) || 0) * days;
    const childTotal = children * (CONSTANTS_RIAL.CHILD_ALLOWANCE * multiplier) * ratio;
    const maskan = (CONSTANTS_RIAL.MASKAN * multiplier) * ratio;
    const bon = (CONSTANTS_RIAL.BON * multiplier) * ratio;
    const tahahol = married ? ((CONSTANTS_RIAL.TAHAHOL * multiplier) * ratio) : 0;

    const insuredBase = baseSalary + sanavatTotal + childTotal + maskan + bon + tahahol;

    // --- Non-insured additions (added to net, no insurance) ---
    const overtimeHourlyWage = ((CONSTANTS_RIAL.DAILY_WAGE * multiplier) / SHIFT_HOURS) * OVERTIME_FACTOR;
    const overtimeTotal = (Number(overtime) || 0) * overtimeHourlyWage;
    const unusedLeaveTotal = (Number(unusedLeave) || 0) * (CONSTANTS_RIAL.DAILY_WAGE * multiplier);
    // Reward is a flat amount entered in the active currency (converted on toggle).
    const rewardTotal = Number(reward) || 0;

    // --- Non-insured deductions (subtracted from net, no insurance) ---
    const hourlyDeductionTotal = (Number(hourlyDeduction) || 0) * overtimeHourlyWage;

    // Absent-day rate: full daily package = daily wage + daily sanavat
    // + (monthly allowances ÷ days of the start date's Jalali month).
    const daysInStartMonth = getDaysInMonth(startDate.year, startDate.month.number);
    const monthlyExtras =
      (children * CONSTANTS_RIAL.CHILD_ALLOWANCE +
        CONSTANTS_RIAL.MASKAN +
        CONSTANTS_RIAL.BON +
        (married ? CONSTANTS_RIAL.TAHAHOL : 0)) * multiplier;
    const dailyExtras = monthlyExtras / daysInStartMonth;
    const perDayRate = (CONSTANTS_RIAL.DAILY_WAGE * multiplier) + (Number(sanavat) || 0) + dailyExtras;
    const absentTotal = (Number(absentDays) || 0) * perDayRate;

    // --- Insurance (only on the insured base) ---
    let workerIns = 0;
    let insEmployer = 0;
    let insUnemp = 0;
    let insuranceBonus = 0;

    if (noInsurance) {
      insuranceBonus = insuredBase * 0.23;
    } else {
      insEmployer = insuredBase * 0.20;
      insUnemp = insuredBase * 0.03;
      workerIns = insuredBase * 0.07;
    }

    const totalEarnings = insuredBase + insuranceBonus + overtimeTotal + unusedLeaveTotal + rewardTotal;
    const totalDeductions = workerIns + hourlyDeductionTotal + absentTotal;
    const netTotal = totalEarnings - totalDeductions;

    hasCalculatedRef.current = true;
    setResults({
      baseSalary, sanavatTotal, childTotal, maskan, bon, tahahol, insuredBase,
      overtimeTotal, unusedLeaveTotal, rewardTotal,
      hourlyDeductionTotal, absentTotal,
      insuranceBonus, insEmployer, insUnemp, workerIns,
      totalEarnings, totalDeductions, netTotal
    });
  }, [startDate, endDate, sanavat, children, overtime, hourlyDeduction, unusedLeave, absentDays, reward, married, noInsurance, isToman, s]);

  useEffect(() => {
    if (!selectedEmployee || !startDate || !endDate || attendanceScans === undefined) return;

    if (!selectedEmployee.cardNo || attendanceAdjustments.completeDays === 0) {
      setOvertime('');
      setHourlyDeduction('');
      return;
    }

    const asHours = (minutes) => minutes === 0 ? '0' : String(Number((minutes / 60).toFixed(2)));
    setOvertime(asHours(attendanceAdjustments.overtimeMinutes));
    setHourlyDeduction(asHours(attendanceAdjustments.deductionMinutes));
  }, [selectedEmployee, startDate, endDate, attendanceScans, attendanceAdjustments]);

  // Re-run the calc when inputs or the currency change — but only after the
  // first manual calculation, and WITHOUT depending on `results` (the previous
  // version did, so handleCalculate's own setResults re-triggered the effect in
  // an infinite loop that froze the page and blocked navigation).
  useEffect(() => {
    if (hasCalculatedRef.current) handleCalculate();
  }, [handleCalculate]);

  const currText = " " + currencyLabel;

  // Always copy the NET as a Rial amount, regardless of the display currency.
  const handleCopyNet = async () => {
    if (!results) return;
    const rial = Math.round((results.netTotal || 0) * (isToman ? 10 : 1));
    try {
      await navigator.clipboard.writeText(String(rial));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };
  const weekDays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

  const employeeName = selectedEmployee
    ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
    : '';
  const slipMonthYear = startDate?.month
    ? `${startDate.month.name} ${toFa(startDate.year)}`
    : '';

  const handleExportPdf = async () => {
    if (!results || !slipRef.current) return;
    try {
      const canvas = await html2canvas(slipRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' });
      const pageW = pdf.internal.pageSize.getWidth();   // 210
      const pageH = pdf.internal.pageSize.getHeight();  // 148

      // Contain-fit: scale the captured slip to fit fully inside the A5 page
      // (preserving aspect ratio, centered) so the bottom is never clipped.
      const imgRatio = canvas.width / canvas.height;
      const pageRatio = pageW / pageH;
      let w, h;
      if (imgRatio > pageRatio) {
        w = pageW;
        h = pageW / imgRatio;
      } else {
        h = pageH;
        w = pageH * imgRatio;
      }
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      pdf.addImage(imgData, 'JPEG', x, y, w, h);

      const safeName = (employeeName || 'کارمند').replace(/\s+/g, '-');
      const fileName = `فیش-حقوقی-${safeName}-${slipMonthYear.replace(/\s+/g, '')}.pdf`;
      // Plain browser download — generated in-memory, nothing is stored server-side.
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF export failed:', error);
    }
  };

  return (
    <div className={`${styles.root} payroll-container ${activeTab === 'jobs' ? 'payroll-container-wide' : ''} ${activeTab === 'calc' ? 'payroll-container-calc' : ''}`}>
      <div className="payroll-tabs">
        <SegmentedTabs className={styles.payrollTabs} label="بخش‌های منابع انسانی" value={activeTab} onChange={setActiveTab} items={[
          { value: 'calc', label: 'حقوق', icon: 'fa-solid fa-file-invoice' },
          { value: 'attendance', label: 'حضور غیاب', icon: 'fa-solid fa-user' },
          { value: 'settings', label: 'تنظیمات', icon: 'fa-solid fa-gear' },
          { value: 'jobs', label: 'استخدام', icon: 'fa-solid fa-user-group' },
        ]} />
      </div>

      {activeTab === 'attendance' && <PayrollAttendance />}
      {activeTab === 'settings' && <PayrollSettings />}
      {activeTab === 'jobs' && <JobApplications />}
      {activeTab === 'calc' && (
      <>
      <div className={`card ${styles.payrollForm}`}>
        <div className={styles.formHeader}>
          <div className={styles.headerIcon} aria-hidden="true"><i className="fa-solid fa-users" /></div>
          <div className={styles.formHeading}>
            <h1 className={styles.payrollTitle}>حقوق کارکنان</h1>
            <p>اطلاعات حقوق و مزایای کارکنان را وارد کنید</p>
          </div>
        </div>

        <div className="search-section">
          {selectedEmployee ? (
            <div className="selected-badge">
              <span>👤 کارمند: <strong>{selectedEmployee.firstName} {selectedEmployee.lastName}</strong></span>
              <button className="clear-btn" onClick={handleClearSelection}>تغییر</button>
            </div>
          ) : (
            <>
              <div className={`form-group ${styles.employeeSearchGroup}`}>
                <div className={styles.employeeControls}>
                <div className={`${styles.employeeSearchRow} ${styles.fieldShell} ${styles.employeeField}`}>
                  <span className={`${styles.fieldIcon} ${styles.neutralIcon}`} aria-hidden="true"><i className="fa-regular fa-user" /></span>
                  <input
                    id="payroll-employee-search"
                    value={searchFullName}
                    onChange={(e) => { setSearchFullName(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => window.setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="جستجو"
                    className={styles.searchInput}
                    type="search"
                    dir="rtl"
                  />
                </div>
                <button type="button" className={styles.employeeAddButton} aria-label="افزودن کارمند جدید" title="افزودن کارمند جدید" onClick={() => setIsEmployeeSheetOpen(true)}>+</button>
                </div>
              </div>

              {showDropdown && matchedEmployees?.length > 0 && (
                <div className="search-dropdown">
                  {matchedEmployees.map(emp => (
                    <div key={emp.id} className="dropdown-item" onClick={() => handleSelectEmployee(emp)}>
                      {emp.firstName} {emp.lastName} ({emp.id})
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="grid-form">
          <div className="form-group span-2">
            <div className="date-picker-wrapper">
              <div className={`${styles.fieldShell} ${styles.dateField}`}>
                <JalaliDatePicker value={startDate} onChange={setStartDate} calendar={persian} locale={persian_fa} weekDays={weekDays} placeholder="از تاریخ" calendarPosition="bottom-right" containerClassName={`full-width-date-picker ${styles.datePicker}`} />
                <button type="button" className={styles.previousMonthButton} onClick={handleSelectPreviousMonth} aria-label="انتخاب ماه قبل" title="ماه قبل">
                  <i className="fa-solid fa-hand-pointer" aria-hidden="true" />
                </button>
                <span className={`${styles.fieldIcon} ${styles.blueIcon}`} aria-hidden="true"><i className="fa-regular fa-calendar" /></span>
              </div>
              <div className={`${styles.fieldShell} ${styles.dateField}`}>
                <JalaliDatePicker value={endDate} onChange={setEndDate} calendar={persian} locale={persian_fa} weekDays={weekDays} placeholder="تا تاریخ" calendarPosition="bottom-right" containerClassName={`full-width-date-picker ${styles.datePicker}`} />
                <span className={`${styles.fieldIcon} ${styles.blueIcon}`} aria-hidden="true"><i className="fa-regular fa-calendar" /></span>
              </div>
            </div>
            {daysInfo.days > 0 && (
              <div className="days-msg">⏱️ کارکرد: {daysInfo.text}</div>
            )}
          </div>

          <div className="form-group">
            <div className={`${styles.fieldShell} ${styles.inputField}`}><input type="number" value={sanavat} onChange={(e) => setSanavat(e.target.value)} placeholder="سنواتی روزانه" aria-label={`مبلغ سنواتی روزانه (${currText})`} /><span className={`${styles.fieldIcon} ${styles.purpleIcon}`} aria-hidden="true"><i className="fa-regular fa-calendar-plus" /></span></div>
          </div>

          <div className="form-group">
            <div className={`${styles.fieldShell} ${styles.inputField}`}><input type="number" value={children} onChange={(e) => setChildren(e.target.value)} min="0" placeholder="تعداد فرزند" aria-label="تعداد فرزند (زیر ۱۸ سال/محصل)" /><span className={`${styles.fieldIcon} ${styles.greenIcon}`} aria-hidden="true"><i className="fa-solid fa-users" /></span></div>
          </div>

          <div className="form-group">
            <div className={`${styles.fieldShell} ${styles.inputField}`}><input type="number" value={overtime} onChange={(e) => setOvertime(e.target.value)} min="0" step="0.01" placeholder="اضافه کار" aria-label="ساعت اضافه‌کاری" /><span className={`${styles.fieldIcon} ${styles.orangeIcon}`} aria-hidden="true"><i className="fa-regular fa-clock" /></span></div>
          </div>

          <div className="form-group">
            <div className={`${styles.fieldShell} ${styles.inputField}`}><input type="number" value={hourlyDeduction} onChange={(e) => setHourlyDeduction(e.target.value)} min="0" step="0.01" placeholder="کسر کار" aria-label="ساعت کسری کار" /><span className={`${styles.fieldIcon} ${styles.pinkIcon}`} aria-hidden="true"><i className="fa-regular fa-clock" /></span></div>
          </div>

          <div className="form-group">
            <div className={`${styles.fieldShell} ${styles.inputField}`}><input type="number" value={unusedLeave} onChange={(e) => setUnusedLeave(e.target.value)} min="0" placeholder="مانده مرخصی" aria-label="مرخصی استفاده نشده (روز)" /><span className={`${styles.fieldIcon} ${styles.tealIcon}`} aria-hidden="true"><i className="fa-regular fa-calendar" /></span></div>
          </div>

          <div className="form-group">
            <div className={`${styles.fieldShell} ${styles.inputField}`}><input type="number" value={absentDays} onChange={(e) => setAbsentDays(e.target.value)} min="0" placeholder="غیبت" aria-label="روزهای غیبت" /><span className={`${styles.fieldIcon} ${styles.purpleIcon}`} aria-hidden="true"><i className="fa-solid fa-circle-minus" /></span></div>
          </div>

          <div className={`form-group ${styles.rewardGroup}`}>
            <div className={`${styles.fieldShell} ${styles.inputField} ${styles.rewardField}`}><input
              type="number"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="پاداش"
              aria-label={`پاداش (${currText})`}
              min="0"
            /><span className={`${styles.fieldIcon} ${styles.pinkIcon}`} aria-hidden="true"><i className="fa-solid fa-gift" /></span></div>
          </div>
          <div className="form-group">
            <label className={`checkbox-group ${styles.choicePanel} ${married ? styles.isActive : ''}`}>
              <input type="checkbox" checked={married} onChange={(e) => setMarried(e.target.checked)} />
              <i className={`fa-regular fa-heart ${styles.marriedIcon}`} aria-hidden="true" />
              <span>متاهل هستم</span>
            </label>
          </div>

          <div className="form-group">
            <label className={`checkbox-group no-ins ${styles.choicePanel} ${noInsurance ? styles.isActive : ''}`}>
              <input type="checkbox" checked={noInsurance} onChange={(e) => setNoInsurance(e.target.checked)} />
              <i className={`fa-solid fa-shield-halved ${styles.insuranceIcon}`} aria-hidden="true" />
              <span>بیمه نمی‌خوام</span>
            </label>
          </div>
        </div>

        <button className="btn-calc" onClick={handleCalculate}>محاسبه دقیق</button>

        {results && (
          <div className="result-container">
            <div className="res-box box-wage">
              <h3>💵 دستمزد</h3>
              <div className="row"><span>حقوق پایه:</span> <span>{formatNum(results.baseSalary)}{currText}</span></div>
            </div>

            <div className="res-box box-income">
              <h3>✅ مزایا</h3>
              <div className="row"><span>پایه سنوات:</span> <span>{formatNum(results.sanavatTotal)}{currText}</span></div>
              <div className="row"><span>حق اولاد:</span> <span>{formatNum(results.childTotal)}{currText}</span></div>
              <div className="row"><span>بن مسکن:</span> <span>{formatNum(results.maskan)}{currText}</span></div>
              <div className="row"><span>بن کارگری:</span> <span>{formatNum(results.bon)}{currText}</span></div>
              <div className="row"><span>حق تأهل:</span> <span>{formatNum(results.tahahol)}{currText}</span></div>

              {noInsurance && (
                <div className="row ins-bonus">
                  <span>حق بیمه:</span> <span>{formatNum(results.insuranceBonus)}{currText}</span>
                </div>
              )}

              <div className="row total-gross">
                <span><strong>جمع:</strong></span>
                <span>{formatNum(results.insuredBase + (noInsurance ? results.insuranceBonus : 0))}{currText}</span>
              </div>
            </div>

            {!noInsurance && (
              <div className="res-box box-ins">
                <h3>🛡️ بیمه</h3>
                <div className="row"><span>سهم کارفرما (۲۰٪):</span> <span>{formatNum(results.insEmployer)}{currText}</span></div>
                <div className="row"><span>بیمه بیکاری (۳٪):</span> <span>{formatNum(results.insUnemp)}{currText}</span></div>
              </div>
            )}

            <div className="res-box box-extra">
              <h3>➕ اضافه ها</h3>
              <div className="row"><span>اضافه‌کاری:</span> <span>{formatNum(results.overtimeTotal)}{currText}</span></div>
              <div className="row"><span>مرخصی استفاده نشده:</span> <span>{formatNum(results.unusedLeaveTotal)}{currText}</span></div>
              <div className="row"><span>پاداش:</span> <span>{formatNum(results.rewardTotal)}{currText}</span></div>
            </div>

            <div className="res-box box-deduct">
              <h3>❌ کسورات</h3>
              {!noInsurance && (
                <div className="row">
                  <span>حق بیمه سهم کارگر (۷٪):</span>
                  <span className="negative-val">- {formatNum(results.workerIns)}{currText}</span>
                </div>
              )}
              <div className="row">
                <span>کسری کار ساعتی:</span>
                <span className="negative-val">- {formatNum(results.hourlyDeductionTotal)}{currText}</span>
              </div>
              <div className="row">
                <span>غیبت:</span>
                <span className="negative-val">- {formatNum(results.absentTotal)}{currText}</span>
              </div>
              <div className="row total-deduct">
                <span><strong>جمع کل کسورات:</strong></span>
                <span className="negative-val">- {formatNum(results.totalDeductions)}{currText}</span>
              </div>
            </div>

            <div className="box-total">
              <span>💰 خالص دریافتی: {formatNum(results.netTotal)} {currText}</span>
              <button type="button" className="copy-net-btn" onClick={handleCopyNet} title="کپی مبلغ به ریال">
                {copied ? 'کپی شد ✓' : 'کپی'}
              </button>
            </div>

            <button className="btn-export" onClick={handleExportPdf}>
              📄 صدور فیش حقوقی
            </button>
          </div>
        )}
      </div>

      {/* Off-screen A5-landscape salary slip used as the PDF source */}
      {results && (
        <div className="slip-offscreen" aria-hidden="true">
          <div className="salary-slip" ref={slipRef}>
            <div className="slip-header">
              <div className="slip-title">
                <h2>فیش حقوقی</h2>
                <span>کارکرد {slipMonthYear}</span>
              </div>
              <div className="slip-emp">
                <div><span>کارمند:</span> <strong>{employeeName || '—'}</strong></div>
                <div><span>مدت کارکرد:</span> <strong>{daysInfo.text}</strong></div>
              </div>
            </div>

            <div className="slip-grid">
              <div className="slip-col">
                <div className="slip-col-title">دستمزد</div>
                <div className="slip-row"><span>حقوق پایه</span><span>{formatNum(results.baseSalary)}</span></div>
                <div className="slip-col-title mt">مزایا</div>
                <div className="slip-row"><span>پایه سنوات</span><span>{formatNum(results.sanavatTotal)}</span></div>
                <div className="slip-row"><span>حق اولاد</span><span>{formatNum(results.childTotal)}</span></div>
                <div className="slip-row"><span>بن مسکن</span><span>{formatNum(results.maskan)}</span></div>
                <div className="slip-row"><span>بن کارگری</span><span>{formatNum(results.bon)}</span></div>
                <div className="slip-row"><span>حق تأهل</span><span>{formatNum(results.tahahol)}</span></div>
                {noInsurance && (
                  <div className="slip-row"><span>حق بیمه</span><span>{formatNum(results.insuranceBonus)}</span></div>
                )}
                <div className="slip-row sub"><span>جمع</span><span>{formatNum(results.insuredBase + (noInsurance ? results.insuranceBonus : 0))}</span></div>
              </div>

              <div className="slip-col">
                <div className="slip-col-title">اضافه ها</div>
                <div className="slip-row"><span>اضافه‌کاری</span><span>{formatNum(results.overtimeTotal)}</span></div>
                <div className="slip-row"><span>مرخصی استفاده نشده</span><span>{formatNum(results.unusedLeaveTotal)}</span></div>
                <div className="slip-row"><span>پاداش</span><span>{formatNum(results.rewardTotal)}</span></div>
                <div className="slip-row sub"><span>جمع</span><span>{formatNum(results.overtimeTotal + results.unusedLeaveTotal + results.rewardTotal)}</span></div>
                {!noInsurance && (
                  <>
                    <div className="slip-col-title mt">بیمه</div>
                    <div className="slip-row"><span>سهم کارفرما <span dir="ltr">(۲۰٪)</span></span><span>{formatNum(results.insEmployer)}</span></div>
                    <div className="slip-row"><span>بیمه بیکاری <span dir="ltr">(۳٪)</span></span><span>{formatNum(results.insUnemp)}</span></div>
                  </>
                )}
              </div>

              <div className="slip-col">
                <div className="slip-col-title">کسورات</div>
                {!noInsurance && (
                  <div className="slip-row"><span>بیمه سهم کارگر <span dir="ltr">(۷٪)</span></span><span dir="ltr">- {formatNum(results.workerIns)}</span></div>
                )}
                <div className="slip-row"><span>کسری کار ساعتی</span><span dir="ltr">- {formatNum(results.hourlyDeductionTotal)}</span></div>
                <div className="slip-row"><span>غیبت</span><span dir="ltr">- {formatNum(results.absentTotal)}</span></div>
                <div className="slip-row sub"><span>جمع کسورات</span><span dir="ltr">- {formatNum(results.totalDeductions)}</span></div>
              </div>
            </div>

            <div className="slip-net">
              خالص دریافتی: {formatNum(results.netTotal)}{currText}
            </div>

            <div className="slip-footer-text">
              اینجانب ............................... تمام حق و حقوق خود را از بابت کارکرد {slipMonthYear} دریافت
              نمودم و حق هیچ‌گونه اعتراض یا شکایتی در هیچ یک از مراجع قانونی را ندارم.
            </div>

            <div className="slip-signatures">
              <div className="sign-box"><span className="sign-line"></span><span>مدیر</span></div>
              <div className="sign-box"><span className="sign-line"></span><span>مالک</span></div>
              <div className="sign-box"><span className="sign-line"></span><span>حسابدار</span></div>
              <div className="sign-box"><span className="sign-line"></span><span>کارمند</span></div>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {isEmployeeSheetOpen && (
        <PersonFormSheet
          initialCategory="EMPLOYEE"
          showCategorySelector={false}
          onClose={() => setIsEmployeeSheetOpen(false)}
          onSaved={(employee) => {
            handleSelectEmployee(employee);
            showToast('کارمند ثبت شد.');
          }}
          onError={(error, message) => {
            if (error) console.error('Employee creation failed:', error);
            showToast(message, 'error');
          }}
        />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default HumanResources;
