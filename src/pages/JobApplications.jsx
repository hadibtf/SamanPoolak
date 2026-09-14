import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, jobApplicationsApi } from '../api/client';
import './JobApplications.css';

const STATUSES = {
  new: 'بررسی نشده',
  interview: 'وقت مصاحبه تعیین شد',
  accepted: 'پذیرفته شده',
  rejected: 'رد شده',
};

const YES_NO = {
  yes: 'بله',
  no: 'خیر',
};

const AGE_MIN = 18;
const AGE_MAX = 30;
const EDUCATION_OPTIONS = [
  { value: 'زیر دیپلم', label: 'زیر دیپلم' },
  { value: 'دیپلم', label: 'دیپلم' },
  { value: 'کارشناسی', label: 'کارشناسی' },
  { value: 'کارشناسی ارشد', label: 'کارشناسی ارشد' },
  { value: 'دکتری', label: 'دکتری' },
];

const FilterDropdown = ({ label, active, children }) => (
  <details className="job-filter-menu">
    <summary className={active ? 'is-active' : ''}>
      <span>{label}</span>
      <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
    </summary>
    <div className="job-filter-menu-content">{children}</div>
  </details>
);

const currentJalaliYear = Number(
  new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric' }).format(new Date()),
);

const ageOf = (birthDate) => {
  const year = Number(String(birthDate || '').match(/\d{4}/)?.[0]);
  if (!year || !currentJalaliYear) return null;
  const age = currentJalaliYear - year;
  return age > 0 && age < 100 ? age : null;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const fullName = (item) => `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'بدون نام';

const DetailRow = ({ label, value }) => (
  <div className="job-detail-row">
    <span>{label}</span>
    <b>{value || '—'}</b>
  </div>
);

const JobApplications = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [educationFilter, setEducationFilter] = useState([]);
  const [carFilter, setCarFilter] = useState([]);
  const [workFilter, setWorkFilter] = useState([]);
  const [minAge, setMinAge] = useState(AGE_MIN);
  const [maxAge, setMaxAge] = useState(AGE_MAX);
  const [sort, setSort] = useState('new-unprocessed');
  const [toast, setToast] = useState(null);
  const [hiringOpen, setHiringOpen] = useState(true);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { jobApplications } = await jobApplicationsApi.list();
      setItems(jobApplications || []);
      const status = await jobApplicationsApi.status();
      setHiringOpen(status.open !== false);
    } catch (err) {
      console.error('Failed to load job applications:', err);
      showToast(
        err instanceof ApiError && err.status === 0
          ? 'برای دریافت درخواست‌های استخدام اتصال اینترنت لازم است.'
          : 'خطا در دریافت درخواست‌های استخدام.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim();
    const list = items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
       if (educationFilter.length && !educationFilter.includes(item.education)) return false;
       if (carFilter.length && !carFilter.includes(item.hasCar)) return false;
       const workValue = item.hasWorkExperience ? 'yes' : 'no';
       if (workFilter.length && !workFilter.includes(workValue)) return false;
      const age = ageOf(item.birthDate);
      if (minAge !== '' && (age === null || age < Number(minAge))) return false;
      if (maxAge !== '' && (age === null || age > Number(maxAge))) return false;
      if (!term) return true;
      return `${item.firstName} ${item.lastName} ${item.mobile} ${item.city}`.includes(term);
    });

    return [...list].sort((a, b) => {
      if (sort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === 'name') return fullName(a).localeCompare(fullName(b), 'fa');
      if (sort === 'status') return (a.status || '').localeCompare(b.status || '', 'fa');
      if (sort === 'interview') return (a.interviewAt || '').localeCompare(b.interviewAt || '', 'fa');
      if (sort === 'new-unprocessed') {
        const aRank = a.status === 'new' ? 0 : 1;
        const bRank = b.status === 'new' ? 0 : 1;
        if (aRank !== bRank) return aRank - bRank;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [items, statusFilter, educationFilter, carFilter, workFilter, minAge, maxAge, search, sort]);

  const updateStatus = async (item, status, interviewAt = item.interviewAt || '') => {
    try {
      const { jobApplication } = await jobApplicationsApi.update(item.id, { status, interviewAt });
      setItems((list) => list.map((entry) => (entry.id === jobApplication.id ? jobApplication : entry)));
      setSelected((current) => (current?.id === jobApplication.id ? jobApplication : current));
      showToast('وضعیت درخواست به‌روزرسانی شد.');
    } catch (err) {
      console.error('Job application update failed:', err);
      showToast('خطا در تغییر وضعیت درخواست.', 'error');
    }
  };

  const openCount = items.filter((item) => item.status === 'new').length;

  const toggleFilterValue = (setFilter, value) => {
    setFilter((values) => (values.includes(value)
      ? values.filter((entry) => entry !== value)
      : [...values, value]));
  };

  const toggleHiring = async () => {
    try {
      const { open } = await jobApplicationsApi.updateStatus(!hiringOpen);
      setHiringOpen(open);
      showToast(open ? 'پذیرش درخواست استخدام فعال شد.' : 'پذیرش درخواست استخدام بسته شد.');
    } catch (err) {
      console.error('Hiring status update failed:', err);
      showToast('خطا در تغییر وضعیت پذیرش درخواست.', 'error');
    }
  };

  const deleteOne = async (item) => {
    if (!window.confirm(`درخواست ${fullName(item)} حذف شود؟`)) return;
    try {
      await jobApplicationsApi.remove(item.id);
      setItems((list) => list.filter((entry) => entry.id !== item.id));
      setSelected((current) => (current?.id === item.id ? null : current));
      showToast('درخواست حذف شد.');
    } catch (err) {
      console.error('Job application delete failed:', err);
      showToast('خطا در حذف درخواست.', 'error');
    }
  };

  const deleteAll = async () => {
    if (!window.confirm('همه درخواست‌های استخدام برای همیشه حذف شوند؟')) return;
    if (!window.confirm('این کار قابل برگشت نیست. مطمئن هستید؟')) return;
    try {
      await jobApplicationsApi.removeAll();
      setItems([]);
      setSelected(null);
      showToast('همه درخواست‌ها حذف شدند.');
    } catch (err) {
      console.error('Job applications delete all failed:', err);
      showToast('خطا در حذف همه درخواست‌ها.', 'error');
    }
  };

  return (
    <div className="jobs-admin-page">
      <div className="jobs-admin-header">
        <div>
          <h1>درخواست‌های استخدام</h1>
          <p>{openCount.toLocaleString('fa-IR')} درخواست بررسی‌نشده</p>
        </div>
        <button className="jobs-refresh" onClick={load} disabled={loading}>
          <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`}></i>
          تازه‌سازی
        </button>
      </div>

      <div className="glass-card hiring-control">
        <div>
          <strong>پذیرش درخواست استخدام</strong>
          <span>{hiringOpen ? 'فرم استخدام فعال است.' : 'فرم استخدام بسته است و ارسال جدید ثبت نمی‌شود.'}</span>
        </div>
        <button className={hiringOpen ? 'danger' : 'success'} onClick={toggleHiring}>
          {hiringOpen ? 'بستن پذیرش' : 'فعال کردن پذیرش'}
        </button>
        <button className="danger subtle" onClick={deleteAll} disabled={items.length === 0}>
          حذف همه درخواست‌ها
        </button>
      </div>

      <div className="glass-card jobs-filters">
        <div className="jobs-filter-primary">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو بر اساس نام، موبایل یا شهر..." />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="مرتب‌سازی">
            <option value="new-unprocessed">جدیدترین بررسی‌نشده</option><option value="newest">جدیدترین درخواست</option><option value="oldest">قدیمی‌ترین درخواست</option><option value="name">نام</option><option value="status">وضعیت</option><option value="interview">تاریخ مصاحبه</option>
          </select>
        </div>
        <div className="jobs-filter-controls">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">همه وضعیت‌ها</option>{Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <FilterDropdown label="مدرک تحصیلی" active={educationFilter.length > 0}>
            {EDUCATION_OPTIONS.map(({ value, label }) => <label className="job-check-item" key={value}><input type="checkbox" checked={educationFilter.includes(value)} onChange={() => toggleFilterValue(setEducationFilter, value)} /><span>{label}</span></label>)}
          </FilterDropdown>
          <FilterDropdown label="خودرو" active={carFilter.length > 0}>{Object.entries(YES_NO).map(([value, label]) => <label className="job-check-item" key={value}><input type="checkbox" checked={carFilter.includes(value)} onChange={() => toggleFilterValue(setCarFilter, value)} /><span>{label}</span></label>)}</FilterDropdown>
          <FilterDropdown label="سابقه کاری" active={workFilter.length > 0}>{Object.entries(YES_NO).map(([value, label]) => <label className="job-check-item" key={value}><input type="checkbox" checked={workFilter.includes(value)} onChange={() => toggleFilterValue(setWorkFilter, value)} /><span>{label}</span></label>)}</FilterDropdown>
          <div className="job-age-range"><div className="job-age-label"><span>بازه سن</span><b>{minAge.toLocaleString('fa-IR')} تا {maxAge.toLocaleString('fa-IR')} سال</b></div><div className="job-range-track"><input aria-label="حداقل سن" type="range" min={AGE_MIN} max={AGE_MAX} value={minAge} onChange={(e) => setMinAge(Math.min(Number(e.target.value), maxAge))} /><input aria-label="حداکثر سن" type="range" min={AGE_MIN} max={AGE_MAX} value={maxAge} onChange={(e) => setMaxAge(Math.max(Number(e.target.value), minAge))} /></div></div>
        </div>
      </div>

      <div className="jobs-list">
        {filtered.length === 0 ? (
          <div className="jobs-empty">
            <i className="fa-solid fa-id-card-clip"></i>
            <p>{loading ? 'در حال دریافت درخواست‌ها...' : 'درخواستی با این فیلترها پیدا نشد.'}</p>
          </div>
        ) : filtered.map((item) => (
          <article className="job-card" key={item.id} onClick={() => setSelected(item)}>
            <div className="job-card-main">
              <div className="job-card-top">
                <h3>{fullName(item)}</h3>
                <span className={`job-status ${item.status}`}>{STATUSES[item.status] || item.status}</span>
              </div>
              <div className="job-meta">
                <a href={`tel:${item.mobile}`} onClick={(e) => e.stopPropagation()} dir="ltr">
                  <i className="fa-solid fa-phone"></i>{item.mobile}
                </a>
                <span><i className="fa-solid fa-location-dot"></i>{item.city}{item.sahandPhase ? `، ${item.sahandPhase}` : ''}</span>
                <span><i className="fa-solid fa-cake-candles"></i>{ageOf(item.birthDate) ? `${ageOf(item.birthDate).toLocaleString('fa-IR')} سال` : 'سن نامشخص'}</span>
                <span><i className="fa-solid fa-graduation-cap"></i>{item.educationOther || item.education}</span>
                <span><i className="fa-solid fa-car"></i>خودرو: {YES_NO[item.hasCar] || item.hasCar}</span>
                <span><i className="fa-solid fa-briefcase"></i>{item.hasWorkExperience ? 'سابقه کاری دارد' : 'بدون سابقه کاری'}</span>
                <span><i className="fa-solid fa-clock"></i>{formatDateTime(item.createdAt)}</span>
              </div>
            </div>
            <select
              value={item.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => updateStatus(item, e.target.value)}
            >
              {Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="job-delete-btn" onClick={(e) => { e.stopPropagation(); deleteOne(item); }}>
              <i className="fa-solid fa-trash"></i>
              حذف
            </button>
          </article>
        ))}
      </div>

      {selected && (
        <div className="job-modal-overlay" onClick={() => setSelected(null)}>
          <div className="job-modal" onClick={(e) => e.stopPropagation()}>
            <button className="job-modal-close" type="button" onClick={() => setSelected(null)}>×</button>
            <div className="job-modal-head">
              <div>
                <h2>{fullName(selected)}</h2>
                <span className={`job-status ${selected.status}`}>{STATUSES[selected.status] || selected.status}</span>
              </div>
              <a className="job-call" href={`tel:${selected.mobile}`} dir="ltr">
                <i className="fa-solid fa-phone"></i>{selected.mobile}
              </a>
            </div>

            <section className="job-detail-section">
              <h3>وضعیت درخواست</h3>
              <div className="job-status-edit">
                <select value={selected.status} onChange={(e) => updateStatus(selected, e.target.value)}>
                  {Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input
                  value={selected.interviewAt || ''}
                  onChange={(e) => setSelected({ ...selected, interviewAt: e.target.value })}
                  onBlur={(e) => updateStatus(selected, selected.status, e.target.value)}
                  placeholder="تاریخ / ساعت مصاحبه"
                />
              </div>
            </section>

            <section className="job-detail-section">
              <h3>اطلاعات فردی</h3>
              <DetailRow label="نام" value={selected.firstName} />
              <DetailRow label="نام خانوادگی" value={selected.lastName} />
              <DetailRow label="تاریخ تولد" value={selected.birthDate} />
              <DetailRow label="سن" value={ageOf(selected.birthDate) ? `${ageOf(selected.birthDate).toLocaleString('fa-IR')} سال` : ''} />
            </section>
            <section className="job-detail-section">
              <h3>محل سکونت و رفت‌وآمد</h3>
              <DetailRow label="شهر" value={selected.city} />
              <DetailRow label="فاز سهند" value={selected.sahandPhase} />
              <DetailRow label="خودرو شخصی" value={YES_NO[selected.hasCar] || selected.hasCar} />
            </section>
            <section className="job-detail-section">
              <h3>خانوادگی و نظام وظیفه</h3>
              <DetailRow label="وضعیت تأهل" value={selected.maritalStatus} />
              <DetailRow label="تعداد فرزندان" value={selected.childrenCount} />
              <DetailRow label="وضعیت سربازی" value={selected.militaryStatus} />
              <DetailRow label="دلیل معافیت" value={selected.militaryExemptionReason} />
              <DetailRow label="علت پزشکی" value={selected.militaryMedicalDetail} />
              <DetailRow label="توضیح معافیت" value={selected.militaryExplanation} />
              <DetailRow label="پایان معافیت تحصیلی" value={selected.militaryTempExpiry} />
            </section>
            <section className="job-detail-section">
              <h3>تحصیلات و تماس</h3>
              <DetailRow label="مدرک" value={selected.educationOther || selected.education} />
              <DetailRow label="رشته تحصیلی" value={selected.educationField} />
              <DetailRow label="موبایل" value={selected.mobile} />
              <DetailRow label="تاریخ ثبت" value={formatDateTime(selected.createdAt)} />
            </section>
            <section className="job-detail-section">
              <h3>سوابق کاری و بیمه</h3>
              <DetailRow label="سابقه کاری" value={selected.hasWorkExperience ? 'دارد' : 'ندارد'} />
              <DetailRow label="سابقه بیمه" value={selected.hasInsurance ? 'دارد' : 'ندارد'} />
              <DetailRow label="توضیحات تکمیلی" value={selected.experienceNotes} />
            </section>
            <button className="job-delete-btn modal-delete" onClick={() => deleteOne(selected)}>
              <i className="fa-solid fa-trash"></i>
              حذف این درخواست
            </button>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default JobApplications;
