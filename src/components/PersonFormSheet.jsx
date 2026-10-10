import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../db';
import { peopleApi, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import JalaliDatePicker from './JalaliDatePicker';
import BottomSheet from './BottomSheet';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import styles from './PersonFormSheet.module.css';

const createInitialFormState = (category) => ({
  category,
  firstName: '',
  lastName: '',
  fatherName: '',
  phones: [''],
  addresses: [''],
  companyName: '',
  county: '',
  city: '',
  postalCode: '',
  nationalCode: '',
  iban: '',
  bankAccountNumber: '',
  birthDate: '',
  description: '',
  mCardNo: '',
});

const getPersonFormState = (person, initialCategory) => {
  if (!person) return createInitialFormState(initialCategory);

  return {
    ...createInitialFormState(initialCategory),
    ...person,
    phones: Array.isArray(person.phones) && person.phones.length ? person.phones : [''],
    addresses: Array.isArray(person.addresses) ? person.addresses : [''],
    mCardNo: person.cardNo || '',
  };
};

const getSaveErrorMessage = (error) => (
  error instanceof ApiError && error.status === 0
    ? 'برای ذخیره نیاز به اتصال اینترنت دارید.'
    : 'خطا در ذخیره اطلاعات.'
);

const normalizeComparisonText = (value) => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase('fa-IR')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u200c\u200e\u200f]/g, ' ')
  .replace(/[^\u0600-\u06FFa-z0-9]+/gi, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const normalizeEmployeeCode = (value) => String(value ?? '')
  .normalize('NFKC')
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
  .replace(/\s+/g, '')
  .trim();

const getEditDistance = (left, right) => {
  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentRow = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      currentRow[rightIndex] = Math.min(
        currentRow[rightIndex - 1] + 1,
        previousRow[rightIndex] + 1,
        previousRow[rightIndex - 1] + substitutionCost,
      );
    }
    previousRow = currentRow;
  }

  return previousRow[right.length];
};

const getNameSimilarity = (left, right, threshold) => {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const longestLength = Math.max(left.length, right.length);
  if (Math.min(left.length, right.length) < 5) return 0;

  const score = 1 - (getEditDistance(left, right) / longestLength);
  return score >= threshold ? score : 0;
};

const getFullName = (person) => [person.firstName, person.lastName]
  .map((part) => String(part || '').trim())
  .filter(Boolean)
  .join(' ');

const findSimilarPeople = (formData, people, { includeNameCompanyMatches = true, excludePersonId = null } = {}) => {
  const compareNameAndCompany = includeNameCompanyMatches && formData.category === 'SERVICE_PROVIDER';
  const submittedLastName = compareNameAndCompany ? normalizeComparisonText(formData.lastName) : '';
  const submittedCompanyName = normalizeComparisonText(formData.companyName);
  const submittedEmployeeCode = formData.category === 'EMPLOYEE'
    ? normalizeEmployeeCode(formData.mCardNo)
    : '';

  return people
    .filter((candidate) => (
      excludePersonId == null || String(candidate.id) !== String(excludePersonId)
    ))
    .map((candidate) => {
      const candidateEmployeeCode = normalizeEmployeeCode(candidate.cardNo ?? candidate.mCardNo);
      const employeeCodeDuplicate = Boolean(
        submittedEmployeeCode
        && candidate.category === 'EMPLOYEE'
        && submittedEmployeeCode === candidateEmployeeCode,
      );
      if (employeeCodeDuplicate) {
        return {
          person: candidate,
          employeeCodeDuplicate: true,
          customerCompanyDuplicate: false,
          similarNameAndCompany: false,
          similarity: 2,
        };
      }

      const candidateCompanyName = normalizeComparisonText(candidate.companyName);
      const customerCompanyDuplicate = Boolean(
        formData.category === 'CUSTOMER'
        && candidate.category === 'CUSTOMER'
        && submittedCompanyName
        && submittedCompanyName === candidateCompanyName,
      );
      if (customerCompanyDuplicate) {
        return {
          person: candidate,
          employeeCodeDuplicate: false,
          customerCompanyDuplicate: true,
          similarNameAndCompany: false,
          similarity: 2,
        };
      }

      const candidateLastName = compareNameAndCompany ? normalizeComparisonText(candidate.lastName) : '';
      const lastNameSimilarity = submittedLastName && candidateLastName
        ? getNameSimilarity(submittedLastName, candidateLastName, 0.82)
        : 0;
      if (!compareNameAndCompany || !lastNameSimilarity || !submittedCompanyName || !candidateCompanyName) {
        return {
          person: candidate,
          employeeCodeDuplicate: false,
          customerCompanyDuplicate: false,
          similarNameAndCompany: false,
          similarity: 0,
        };
      }

      const companyNameSimilarity = getNameSimilarity(submittedCompanyName, candidateCompanyName, 0.86);
      const similarNameAndCompany = Boolean(lastNameSimilarity && companyNameSimilarity);

      return {
        person: candidate,
        employeeCodeDuplicate,
        customerCompanyDuplicate: false,
        similarNameAndCompany,
        similarity: similarNameAndCompany ? (lastNameSimilarity + companyNameSimilarity) / 2 : 0,
      };
    })
    .filter(({ employeeCodeDuplicate, customerCompanyDuplicate, similarNameAndCompany }) => (
      employeeCodeDuplicate || customerCompanyDuplicate || similarNameAndCompany
    ))
    .sort((left, right) => right.similarity - left.similarity);
};

const getPersonCategoryLabel = (category) => ({
  EMPLOYEE: 'کارمند',
  CUSTOMER: 'مشتری',
  SERVICE_PROVIDER: 'فروشنده',
}[category] || 'فرد');

const PersonFormSheet = ({
  person = null,
  initialCategory = 'EMPLOYEE',
  showCategorySelector = true,
  onClose,
  onSaved,
  onError,
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isEmployeeEdit = isAdmin && person?.category === 'EMPLOYEE';
  const [formData, setFormData] = useState(() => getPersonFormState(person, initialCategory));
  const [employeeAccount, setEmployeeAccount] = useState({ username: '', password: '' });
  const [loadingEmployeeAccount, setLoadingEmployeeAccount] = useState(isEmployeeEdit);
  const [saving, setSaving] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState(null);
  const duplicateDismissButtonRef = useRef(null);
  const duplicateDialogRef = useRef(null);
  const submitButtonRef = useRef(null);
  const savingRef = useRef(false);
  const checkingDuplicatesRef = useRef(false);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onClose, onError });
  callbacksRef.current = { onClose, onError };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const dismissDuplicateWarning = useCallback(() => {
    setDuplicateMatches(null);
    window.requestAnimationFrame(() => submitButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isEmployeeEdit) {
      setLoadingEmployeeAccount(false);
      setEmployeeAccount({ username: '', password: '' });
      return undefined;
    }

    let cancelled = false;
    setLoadingEmployeeAccount(true);
    peopleApi.employeeAccount(person.id)
      .then(({ employeeAccount: account }) => {
        if (cancelled) return;
        setEmployeeAccount({ username: account?.username || '', password: '' });
        setLoadingEmployeeAccount(false);
      })
      .catch((error) => {
        if (cancelled) return;
        callbacksRef.current.onError?.(error, getSaveErrorMessage(error));
        callbacksRef.current.onClose?.();
      });

    return () => { cancelled = true; };
  }, [isEmployeeEdit, person?.id]);

  useEffect(() => {
    if (!duplicateMatches) return undefined;

    duplicateDismissButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismissDuplicateWarning();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = Array.from(duplicateDialogRef.current?.querySelectorAll(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) || []);
        if (!focusable.length) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!duplicateDialogRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [duplicateMatches, dismissDuplicateWarning]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const hasDuplicateEmployeeCode = Boolean(duplicateMatches?.some((match) => match.employeeCodeDuplicate));
  const hasDuplicateCustomerCompany = Boolean(duplicateMatches?.some((match) => match.customerCompanyDuplicate));
  const hasBlockingDuplicate = hasDuplicateEmployeeCode || hasDuplicateCustomerCompany;

  const handleArrayChange = (index, value, field) => {
    setFormData((previous) => {
      const next = [...previous[field]];
      next[index] = value;
      return { ...previous, [field]: next };
    });
  };

  const addArrayField = (field) => {
    setFormData((previous) => ({ ...previous, [field]: [...previous[field], ''] }));
  };

  const removeArrayField = (index, field) => {
    setFormData((previous) => ({
      ...previous,
      [field]: previous[field].filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const savePerson = async () => {
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    let savedPerson = null;
    try {
      const payload = { ...formData };
      ['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'syncStatus', 'mCardNo', 'sex']
        .forEach((key) => delete payload[key]);
      payload.cardNo = (formData.mCardNo || '').trim();
      if (isAdmin && formData.category === 'EMPLOYEE') payload.employeeAccount = employeeAccount;

      if (person) {
        ({ person: savedPerson } = await peopleApi.update(person.id, payload));
      } else {
        ({ person: savedPerson } = await peopleApi.create(payload));
      }

      await db.people.put(savedPerson);
    } catch (error) {
      onError?.(error, getSaveErrorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }

    if (savedPerson) {
      onSaved?.(savedPerson, Boolean(person));
      onClose?.();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (savingRef.current || checkingDuplicatesRef.current || saving || checkingDuplicates) return;
    if (!formData.lastName?.trim() && !formData.companyName?.trim()) {
      onError?.(null, 'نام خانوادگی یا نام شرکت الزامی است.');
      return;
    }

    const shouldCheckDuplicates = !person || (
      (formData.category === 'EMPLOYEE' && normalizeEmployeeCode(formData.mCardNo))
      || (formData.category === 'CUSTOMER' && normalizeComparisonText(formData.companyName))
    );
    if (shouldCheckDuplicates) {
      checkingDuplicatesRef.current = true;
      setCheckingDuplicates(true);
      let similarPeople = [];
      try {
        similarPeople = findSimilarPeople(formData, await db.people.toArray(), {
          includeNameCompanyMatches: !person,
          excludePersonId: person?.id ?? null,
        });
      } catch (error) {
        if (mountedRef.current) onError?.(error, 'بررسی افراد مشابه با خطا مواجه شد.');
        return;
      } finally {
        checkingDuplicatesRef.current = false;
        if (mountedRef.current) setCheckingDuplicates(false);
      }

      if (!mountedRef.current) return;
      if (similarPeople.length) {
        setDuplicateMatches(similarPeople);
        return;
      }
    }

    await savePerson();
  };

  return (
    <>
      <BottomSheet onClose={onClose}>
      <h2 style={{ marginBottom: '20px' }}>{person ? 'ویرایش فرد' : 'افزودن فرد جدید'}</h2>
      {loadingEmployeeAccount ? (
        <p className="hint-text">در حال دریافت اطلاعات حساب کارمند...</p>
      ) : (
        <form onSubmit={handleSubmit} className={styles.form}>
          {showCategorySelector && (
            <fieldset className={styles.categoryFieldset}>
              <legend>دسته‌بندی فرد</legend>
              <div className={styles.categoryChips}>
                {[
                  { value: 'EMPLOYEE', label: 'کارمند' },
                  { value: 'CUSTOMER', label: 'مشتری' },
                  { value: 'SERVICE_PROVIDER', label: 'فروشنده' },
                ].map(({ value, label }) => (
                  <label
                    key={value}
                    className={`${styles.categoryChip} ${formData.category === value ? styles.categoryChipSelected : ''}`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={value}
                      checked={formData.category === value}
                      onChange={handleChange}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <section className={styles.section} aria-labelledby="person-main-info-heading">
            <h3 id="person-main-info-heading" className={styles.sectionTitle}>اطلاعات اصلی</h3>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label htmlFor="person-first-name">نام</label>
                <input id="person-first-name" name="firstName" value={formData.firstName} onChange={handleChange} />
              </div>
              <div className={styles.field}>
                <label htmlFor="person-last-name">نام خانوادگی</label>
                <input id="person-last-name" name="lastName" value={formData.lastName} onChange={handleChange} />
              </div>
              {formData.category !== 'EMPLOYEE' && (
                <div className={styles.field}>
                  <label htmlFor="person-company-name">نام شرکت</label>
                  <input id="person-company-name" name="companyName" value={formData.companyName} onChange={handleChange} />
                </div>
              )}
              {formData.category !== 'EMPLOYEE' && (
                <div className={styles.field}>
                  <label htmlFor="person-primary-phone">شماره تماس</label>
                  <input
                    id="person-primary-phone"
                    type="tel"
                    inputMode="tel"
                    value={formData.phones[0] || ''}
                    onChange={(event) => handleArrayChange(0, event.target.value, 'phones')}
                  />
                </div>
              )}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="person-additional-info-heading">
            <h3 id="person-additional-info-heading" className={styles.sectionTitle}>اطلاعات تکمیلی</h3>
            <div className={styles.field}>
              <span id="person-phone-numbers-label" className={styles.fieldLabel}>شماره‌های تماس</span>
              <div className={styles.arrayFields} role="group" aria-labelledby="person-phone-numbers-label">
                {formData.phones.slice(formData.category === 'EMPLOYEE' ? 0 : 1).map((phone, visibleIndex) => {
                  const index = visibleIndex + (formData.category === 'EMPLOYEE' ? 0 : 1);
                  return (
                    <div key={index} className={styles.arrayFieldRow}>
                      <input
                        type="tel"
                        inputMode="tel"
                        aria-label={`شماره تماس ${index + 1}`}
                        value={phone}
                        onChange={(event) => handleArrayChange(index, event.target.value, 'phones')}
                      />
                      {(formData.category === 'EMPLOYEE' ? formData.phones.length > 1 : index > 0) && (
                        <button
                          type="button"
                          onClick={() => removeArrayField(index, 'phones')}
                          className={styles.removeFieldButton}
                          aria-label={`حذف شماره تماس ${index + 1}`}
                        >
                          <i className="fa-solid fa-minus-circle" aria-hidden="true"></i>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => addArrayField('phones')} className={styles.addFieldButton}>
                + افزودن شماره
              </button>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="person-optional-info-heading">
            <h3 id="person-optional-info-heading" className={styles.sectionTitle}>اطلاعات اختیاری</h3>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label htmlFor="person-county">استان</label>
                <input id="person-county" name="county" value={formData.county} onChange={handleChange} />
              </div>
              <div className={styles.field}>
                <label htmlFor="person-city">شهر</label>
                <input id="person-city" name="city" value={formData.city} onChange={handleChange} />
              </div>
              {formData.category === 'EMPLOYEE' && (
                <div className={styles.field}>
                  <label htmlFor="person-attendance-code">شناسه حضور و غیاب (کد کارت)</label>
                  <input
                    id="person-attendance-code"
                    name="mCardNo"
                    value={formData.mCardNo}
                    onChange={handleChange}
                    inputMode="numeric"
                    placeholder="۱۲"
                  />
                </div>
              )}
              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label htmlFor="person-description">توضیحات</label>
                <textarea id="person-description" name="description" value={formData.description} onChange={handleChange} rows="3" />
              </div>
            </div>

            <details className={styles.moreOptional}>
              <summary>سایر اطلاعات اختیاری</summary>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label htmlFor="person-father-name">نام پدر</label>
                  <input id="person-father-name" name="fatherName" value={formData.fatherName} onChange={handleChange} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="person-national-code">کد ملی</label>
                  <input id="person-national-code" name="nationalCode" value={formData.nationalCode} onChange={handleChange} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="person-birth-date">تاریخ تولد</label>
                  <JalaliDatePicker
                    id="person-birth-date"
                    value={formData.birthDate}
                    onChange={(date) => setFormData((previous) => ({ ...previous, birthDate: date?.toString() || '' }))}
                    calendar={persian}
                    locale={persian_fa}
                    calendarPosition="bottom-right"
                    inputClass="rmdp-input"
                  />
                </div>
                {formData.category === 'EMPLOYEE' && (
                  <div className={styles.field}>
                    <label htmlFor="person-company-name">نام شرکت</label>
                    <input id="person-company-name" name="companyName" value={formData.companyName} onChange={handleChange} />
                  </div>
                )}
                <div className={styles.field}>
                  <label htmlFor="person-postal-code">کد پستی</label>
                  <input id="person-postal-code" name="postalCode" value={formData.postalCode} onChange={handleChange} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="person-bank-account">شماره حساب</label>
                  <input id="person-bank-account" name="bankAccountNumber" value={formData.bankAccountNumber} onChange={handleChange} />
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label htmlFor="person-iban">IBAN (شبا)</label>
                  <input id="person-iban" name="iban" value={formData.iban} onChange={handleChange} />
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <span id="person-addresses-label" className={styles.fieldLabel}>نشانی</span>
                  <div className={styles.arrayFields} role="group" aria-labelledby="person-addresses-label">
                    {formData.addresses.map((address, index) => (
                      <div key={index} className={styles.arrayFieldRow}>
                        <input
                          aria-label={`نشانی ${index + 1}`}
                          value={address}
                          onChange={(event) => handleArrayChange(index, event.target.value, 'addresses')}
                        />
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => removeArrayField(index, 'addresses')}
                            className={styles.removeFieldButton}
                            aria-label={`حذف نشانی ${index + 1}`}
                          >
                            <i className="fa-solid fa-minus-circle" aria-hidden="true"></i>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => addArrayField('addresses')} className={styles.addFieldButton}>
                    + افزودن نشانی
                  </button>
                </div>
                {formData.category === 'EMPLOYEE' && isAdmin && (
                  <div className={`${styles.field} ${styles.fullWidth}`}>
                    <label htmlFor="person-employee-username">حساب ورود کارمند (اختیاری)</label>
                    <input
                      id="person-employee-username"
                      name="employeeUsername"
                      value={employeeAccount.username}
                      onChange={(event) => setEmployeeAccount((previous) => ({ ...previous, username: event.target.value }))}
                      placeholder="نام کاربری"
                      autoComplete="username"
                    />
                    <input
                      type="password"
                      name="employeePassword"
                      value={employeeAccount.password}
                      onChange={(event) => setEmployeeAccount((previous) => ({ ...previous, password: event.target.value }))}
                      placeholder={person ? 'رمز عبور جدید (اختیاری)' : 'رمز عبور برای ساخت حساب'}
                      autoComplete="new-password"
                    />
                  </div>
                )}
              </div>
            </details>
          </section>

          <div className="form-actions">
            <button ref={submitButtonRef} type="submit" className="submit-btn" disabled={saving || checkingDuplicates}>
              {checkingDuplicates ? 'در حال بررسی...' : saving ? 'در حال ذخیره...' : 'ذخیره'}
            </button>
            <button type="button" className="cancel-btn" onClick={onClose}>انصراف</button>
          </div>
        </form>
      )}
      </BottomSheet>
      {duplicateMatches && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.duplicateOverlay}
          onClick={(event) => {
            if (event.target === event.currentTarget) dismissDuplicateWarning();
          }}
        >
          <section
            ref={duplicateDialogRef}
            className={styles.duplicateDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="similar-person-title"
            aria-describedby="similar-person-description"
            dir="rtl"
          >
            <button
              ref={duplicateDismissButtonRef}
              type="button"
              className={styles.duplicateCloseButton}
              aria-label="بستن هشدار"
              onClick={dismissDuplicateWarning}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
            <span className={styles.duplicateIcon} aria-hidden="true">
              <i className={`fa-solid ${hasDuplicateEmployeeCode ? 'fa-id-card' : hasDuplicateCustomerCompany ? 'fa-building' : 'fa-user-group'}`}></i>
            </span>
            <h2 id="similar-person-title" className={styles.duplicateTitle}>
              {hasDuplicateEmployeeCode
                ? 'کد حضور و غیاب تکراری است'
                : hasDuplicateCustomerCompany ? 'نام شرکت تکراری است' : 'احتمال ثبت فرد تکراری'}
            </h2>
            <p id="similar-person-description" className={styles.duplicateDescription}>
              {hasDuplicateEmployeeCode
                ? 'این کد حضور و غیاب قبلاً برای کارمند دیگری ثبت شده است. کد هر کارمند باید یکتا باشد؛ برای ادامه کد دیگری وارد کنید.'
                : hasDuplicateCustomerCompany
                  ? 'این نام شرکت قبلاً برای مشتری دیگری ثبت شده است. نام شرکت مشتری باید یکتا باشد؛ برای ادامه نام شرکت دیگری وارد کنید.'
                  : 'فرد دیگری با نام خانوادگی و نام شرکت مشابه در پایگاه داده وجود دارد. آیا مطمئن هستید که می‌خواهید فرد تکراری اضافه کنید؟'}
            </p>
            <ul className={styles.duplicateList} aria-label="افراد دارای کد یا اطلاعات مشابه">
              {duplicateMatches.map(({ person: match, employeeCodeDuplicate, customerCompanyDuplicate }, index) => {
                const fullName = getFullName(match) || match.companyName || 'بدون نام';
                const phone = match.phones?.find((value) => String(value || '').trim());
                return (
                  <li key={match.id ?? `${fullName}-${index}`} className={styles.duplicateListItem}>
                    <strong>{fullName}</strong>
                    <span>
                      {employeeCodeDuplicate
                        ? `کد حضور و غیاب تکراری · نام خانوادگی: ${match.lastName || '—'}`
                        : customerCompanyDuplicate
                          ? `نام شرکت تکراری: ${match.companyName || '—'}`
                          : 'نام خانوادگی و شرکت مشابه'}
                      {` · ${getPersonCategoryLabel(match.category)}`}
                      {match.companyName ? ` · ${match.companyName}` : ''}
                      {phone ? ` · ${phone}` : ''}
                      {employeeCodeDuplicate && (match.cardNo || match.mCardNo)
                        ? ` · کد: ${match.cardNo || match.mCardNo}`
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className={styles.duplicateActions}>
              <button type="button" className={styles.duplicateCancelButton} onClick={dismissDuplicateWarning}>
                {hasDuplicateEmployeeCode
                  ? 'بازگشت و اصلاح کد'
                  : hasDuplicateCustomerCompany ? 'بازگشت و اصلاح نام شرکت' : 'بازگشت و اصلاح'}
              </button>
              {!hasBlockingDuplicate && (
                <button type="button" className={styles.duplicateConfirmButton} onClick={savePerson} disabled={saving}>
                  {saving ? 'در حال ذخیره...' : 'ثبت با وجود شباهت'}
                </button>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
};

export default PersonFormSheet;
