import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import JalaliDatePicker from "../components/JalaliDatePicker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useSettings } from '../context/SettingsContext';
import PayrollAttendance from './PayrollAttendance';
import PayrollSettings from './PayrollSettings';
import { usePayrollSettings } from '../payrollSettings';
import "./Payroll.css";

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

const Payroll = () => {
  const [activeTab, setActiveTab] = useState('calc'); // 'calc' | 'attendance'
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [sanavat, setSanavat] = useState(0);
  const [children, setChildren] = useState(0);
  const [overtime, setOvertime] = useState(0);
  const [hourlyDeduction, setHourlyDeduction] = useState(0);
  const [unusedLeave, setUnusedLeave] = useState(0);
  const [absentDays, setAbsentDays] = useState(0);
  const [reward, setReward] = useState(0);
  const [married, setMarried] = useState(false);
  const [noInsurance, setNoInsurance] = useState(false);
  const { isToman, currencyLabel } = useSettings(); // app-wide currency
  const s = usePayrollSettings(); // editable rates (single source, shared with attendance)
  const [results, setResults] = useState(null);
  const [daysInfo, setDaysInfo] = useState({ text: "", days: 0 });
  const [copied, setCopied] = useState(false);

  const slipRef = useRef(null);
  // True once the user has calculated; lets inputs/currency changes re-run the
  // calc without an effect that depends on `results` (which would loop forever).
  const hasCalculatedRef = useRef(false);

  // Predictive Search State
  const [searchFullName, setSearchFullName] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const matchedEmployees = useLiveQuery(
    () => {
      if (!searchFullName) return [];
      const q = searchFullName.trim();
      if (!q) return [];
      return db.people
        .where('category').equals('EMPLOYEE')
        .filter(person => {
          const full = `${person.firstName} ${person.lastName}`;
          return full.includes(q);
        })
        .toArray();
    },
    [searchFullName]
  );

  const handleSelectEmployee = (emp) => {
    setSelectedEmployee(emp);
    setSearchFullName(`${emp.firstName} ${emp.lastName}`);
    setShowDropdown(false);
  };

  const handleClearSelection = () => {
    setSelectedEmployee(null);
    setSearchFullName('');
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
    <div className="payroll-container">
      <div className="payroll-tabs">
        <div className="segmented-control">
          <button
            type="button"
            className={`segment ${activeTab === 'calc' ? 'active' : ''}`}
            onClick={() => setActiveTab('calc')}
          >
            محاسبه حقوق
          </button>
          <button
            type="button"
            className={`segment ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
          >
            حضور و غیاب
          </button>
          <button
            type="button"
            className={`segment ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            تنظیمات
          </button>
        </div>
      </div>

      {activeTab === 'attendance' && <PayrollAttendance />}
      {activeTab === 'settings' && <PayrollSettings />}
      {activeTab === 'calc' && (
      <>
      <div className="card">
        <h1>محاسبه‌گر حقوق و بیمه ۱۴۰۵</h1>

        <div className="search-section">
          {selectedEmployee ? (
            <div className="selected-badge">
              <span>👤 کارمند: <strong>{selectedEmployee.firstName} {selectedEmployee.lastName}</strong></span>
              <button className="clear-btn" onClick={handleClearSelection}>تغییر</button>
            </div>
          ) : (
            <>
              <div className="form-group" style={{ maxWidth: '100%', margin: 0 }}>
                <label>جستجوی نام و نام خانوادگی</label>
                <input
                  value={searchFullName}
                  onChange={(e) => { setSearchFullName(e.target.value); setShowDropdown(true); }}
                  placeholder="نام یا نام خانوادگی را وارد کنید..."
                  style={{ width: '100%' }}
                />
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
            <label>بازه زمانی کارکرد</label>
            <div className="date-picker-wrapper">
              <JalaliDatePicker
                value={startDate}
                onChange={setStartDate}
                calendar={persian}
                locale={persian_fa}
                weekDays={weekDays}
                placeholder="از تاریخ"
                calendarPosition="bottom-right"
                containerClassName="full-width-date-picker"
              />
              <JalaliDatePicker
                value={endDate}
                onChange={setEndDate}
                calendar={persian}
                locale={persian_fa}
                weekDays={weekDays}
                placeholder="تا تاریخ"
                calendarPosition="bottom-right"
                containerClassName="full-width-date-picker"
              />
            </div>
            {daysInfo.days > 0 && (
              <div className="days-msg">⏱️ کارکرد: {daysInfo.text}</div>
            )}
          </div>

          <div className="form-group">
            <label>مبلغ سنواتی روزانه ({currText})</label>
            <input type="number" value={sanavat} onChange={(e) => setSanavat(e.target.value)} placeholder="۰" />
          </div>

          <div className="form-group">
            <label>تعداد فرزند (زیر ۱۸ سال/محصل)</label>
            <input type="number" value={children} onChange={(e) => setChildren(e.target.value)} min="0" />
          </div>

          <div className="form-group">
            <label>ساعت اضافه‌کاری</label>
            <input type="number" value={overtime} onChange={(e) => setOvertime(e.target.value)} min="0" />
          </div>

          <div className="form-group">
            <label>ساعت کسری کار</label>
            <input type="number" value={hourlyDeduction} onChange={(e) => setHourlyDeduction(e.target.value)} min="0" />
          </div>

          <div className="form-group">
            <label>مرخصی استفاده نشده (روز)</label>
            <input type="number" value={unusedLeave} onChange={(e) => setUnusedLeave(e.target.value)} min="0" />
          </div>

          <div className="form-group">
            <label>روزهای غیبت</label>
            <input type="number" value={absentDays} onChange={(e) => setAbsentDays(e.target.value)} min="0" />
          </div>

          <div className="form-group">
            <label>پاداش ({currText})</label>
            <input
              type="number"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder={isToman ? "مبلغ به تومان" : "مبلغ به ریال"}
              min="0"
            />
          </div>
          <div className="form-group"/>

          <div className="form-group">
            <label className="checkbox-group">
              <input type="checkbox" checked={married} onChange={(e) => setMarried(e.target.checked)} />
              <span>متاهل هستم</span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-group no-ins">
              <input type="checkbox" checked={noInsurance} onChange={(e) => setNoInsurance(e.target.checked)} />
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
    </div>
  );
};

export default Payroll;
