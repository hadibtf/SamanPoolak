import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { peopleApi, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import JalaliDatePicker from "../components/JalaliDatePicker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import MarkingsManager from '../components/MarkingsManager';
import './People.css';

const People = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [markingsCustomer, setMarkingsCustomer] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [employeeAccount, setEmployeeAccount] = useState({ enabled: false, username: '', password: '' });

  const people = useLiveQuery(() => db.people.toArray());

  const initialFormState = {
    category: 'EMPLOYEE',
    sex: 'MALE',
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
    mCardNo: '', // attendance device card number — stored locally, not on the server
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Server-authoritative writes: every save/delete fails loudly if offline.
  const reportError = (error) => {
    if (error instanceof ApiError && error.status === 0) {
      showToast('برای ذخیره نیاز به اتصال اینترنت دارید.', 'error');
    } else {
      showToast('خطا در ذخیره اطلاعات.', 'error');
    }
    console.error('People write failed:', error);
  };

  const [formData, setFormData] = useState(initialFormState);

  const handleOpenModal = async (person = null) => {
    if (person) {
      setEditingPerson(person);
      setFormData({ ...person, mCardNo: person.cardNo || '' });
      if (isAdmin && person.category === 'EMPLOYEE') {
        try {
          const { employeeAccount: account } = await peopleApi.employeeAccount(person.id);
          setEmployeeAccount({ enabled: !!account?.enabled, username: account?.username || '', password: '' });
        } catch (error) { reportError(error); return; }
      } else setEmployeeAccount({ enabled: false, username: '', password: '' });
    } else {
      setEditingPerson(null);
      setFormData(initialFormState);
      setEmployeeAccount({ enabled: false, username: '', password: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPerson(null);
    setFormData(initialFormState);
    setEmployeeAccount({ enabled: false, username: '', password: '' });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleArrayChange = (index, value, field) => {
    const newArray = [...formData[field]];
    newArray[index] = value;
    setFormData(prev => ({ ...prev, [field]: newArray }));
  };

  const addArrayField = (field) => {
    setFormData(prev => ({ ...prev, [field]: [...prev[field], ''] }));
  };

  const removeArrayField = (index, field) => {
    const newArray = formData[field].filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, [field]: newArray }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!formData.lastName?.trim() && !formData.companyName?.trim()) {
      showToast('نام خانوادگی یا نام شرکت الزامی است.', 'error');
      return;
    }
    setSaving(true);
    try {
      // The server is the source of truth; it assigns the id on create.
      // Strip mirror-only metadata; map the card field to the server's cardNo.
      const payload = { ...formData };
      ['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'syncStatus', 'mCardNo']
        .forEach((k) => delete payload[k]);
      payload.cardNo = (formData.mCardNo || '').trim();
      if (isAdmin && formData.category === 'EMPLOYEE') payload.employeeAccount = employeeAccount;
      let person;
      if (editingPerson) {
        ({ person } = await peopleApi.update(editingPerson.id, payload));
      } else {
        ({ person } = await peopleApi.create(payload));
      }
      await db.people.put(person); // update the local mirror immediately
      handleCloseModal();
      showToast(editingPerson ? 'ویرایش شد.' : 'ثبت شد.');
    } catch (error) {
      reportError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("آیا از حذف این مورد اطمینان دارید؟")) return;
    try {
      await peopleApi.remove(id);
      await db.people.delete(id); // drop from the local mirror
      showToast('حذف شد.');
    } catch (error) {
      reportError(error);
    }
  };

  const getCategoryLabel = (cat) => {
    switch(cat) {
      case 'EMPLOYEE': return 'کارمند';
      case 'CUSTOMER': return 'مشتری';
      case 'SERVICE_PROVIDER': return 'فروشنده';
      default: return cat;
    }
  };

  return (
    <div className="people-container">
      <div className="header-section">
        <h1>لیست افراد</h1>
        <button className="add-btn" onClick={() => handleOpenModal()}>
          <i className="fa-solid fa-plus"></i>
          افزودن فرد جدید
        </button>
      </div>

      <div className="people-list">
        {people?.map(person => (
          <div key={person.id} className="person-card">
            <div className="person-info">
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                <h3>{person.firstName} {person.lastName}</h3>
              </div>
              <p>
                <span className="category-tag">{getCategoryLabel(person.category)}</span>
                {person.category === 'EMPLOYEE' && person.cardNo && (
                  <span className="category-tag" style={{ marginRight: '8px' }}>
                    کارت: {person.cardNo}
                  </span>
                )}
                {person.phones?.[0] && <span style={{ marginRight: '10px' }}>{person.phones[0]}</span>}
              </p>
            </div>
            <div className="person-actions">
              {person.category === 'CUSTOMER' && (
                <button
                  className="action-btn"
                  title="مارک‌ها"
                  onClick={() => setMarkingsCustomer(person)}
                >
                  <i className="fa-solid fa-stamp"></i>
                </button>
              )}
              <button className="action-btn" onClick={() => handleOpenModal(person)}>
                <i className="fa-solid fa-pen-to-square"></i>
              </button>
              <button className="action-btn delete" onClick={() => handleDelete(person.id)}>
                <i className="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '20px' }}>{editingPerson ? 'ویرایش فرد' : 'افزودن فرد جدید'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>دسته بندی</label>
                  <select name="category" value={formData.category} onChange={handleChange} required>
                    <option value="EMPLOYEE">کارمند</option>
                    <option value="CUSTOMER">مشتری</option>
                    <option value="SERVICE_PROVIDER">فروشنده</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>جنسیت</label>
                  <select name="sex" value={formData.sex} onChange={handleChange}>
                    <option value="MALE">مرد</option>
                    <option value="FEMALE">زن</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>نام</label>
                  <input name="firstName" value={formData.firstName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>نام خانوادگی</label>
                  <input name="lastName" value={formData.lastName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>نام پدر</label>
                  <input name="fatherName" value={formData.fatherName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>کد ملی</label>
                  <input name="nationalCode" value={formData.nationalCode} onChange={handleChange} />
                </div>
                {formData.category === 'EMPLOYEE' && (
                  <>
                  <div className="form-group">
                    <label>شناسه حضور و غیاب (کد کارت)</label>
                    <input
                      name="mCardNo"
                      value={formData.mCardNo}
                      onChange={handleChange}
                      inputMode="numeric"
                      placeholder="۱۲"
                    />
                  </div>
                  {isAdmin && (
                    <div className="form-group full-width">
                      <label>حساب ورود کارمند</label>
                      <label className="toggle-row">
                        <span>فعال بودن حساب</span>
                        <input type="checkbox" checked={employeeAccount.enabled} onChange={(e) => setEmployeeAccount((prev) => ({ ...prev, enabled: e.target.checked }))} />
                      </label>
                      {employeeAccount.enabled && <>
                        <input name="employeeUsername" value={employeeAccount.username} onChange={(e) => setEmployeeAccount((prev) => ({ ...prev, username: e.target.value }))} placeholder="نام کاربری" autoComplete="username" />
                        <input type="password" name="employeePassword" value={employeeAccount.password} onChange={(e) => setEmployeeAccount((prev) => ({ ...prev, password: e.target.value }))} placeholder={editingPerson ? 'رمز عبور جدید (اختیاری)' : 'رمز عبور'} autoComplete="new-password" />
                      </>}
                    </div>
                  )}
                  </>
                )}
                <div className="form-group">
                  <label>تاریخ تولد</label>
                  <JalaliDatePicker
                    value={formData.birthDate}
                    onChange={(date) => setFormData(prev => ({ ...prev, birthDate: date?.toString() }))}
                    calendar={persian}
                    locale={persian_fa}
                    calendarPosition="bottom-right"
                    inputClass="rmdp-input"
                  />
                </div>
                <div className="form-group">
                  <label>نام شرکت</label>
                  <input name="companyName" value={formData.companyName} onChange={handleChange} />
                </div>

                <div className="form-group full-width">
                  <label>شماره تماس</label>
                  {formData.phones.map((phone, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input 
                        value={phone} 
                        onChange={(e) => handleArrayChange(index, e.target.value, 'phones')} 
                        style={{ flex: 1 }}
                      />
                      {index > 0 && <button type="button" onClick={() => removeArrayField(index, 'phones')} className="action-btn delete"><i className="fa-solid fa-minus-circle"></i></button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => addArrayField('phones')} style={{ alignSelf: 'flex-start', fontSize: '12px', color: 'var(--active-color)', background: 'none', border: 'none', cursor: 'pointer' }}>+ افزودن شماره</button>
                </div>

                <div className="form-group full-width">
                  <label>نشانی</label>
                  {formData.addresses.map((addr, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input 
                        value={addr} 
                        onChange={(e) => handleArrayChange(index, e.target.value, 'addresses')} 
                        style={{ flex: 1 }}
                      />
                      {index > 0 && <button type="button" onClick={() => removeArrayField(index, 'addresses')} className="action-btn delete"><i className="fa-solid fa-minus-circle"></i></button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => addArrayField('addresses')} style={{ alignSelf: 'flex-start', fontSize: '12px', color: 'var(--active-color)', background: 'none', border: 'none', cursor: 'pointer' }}>+ افزودن نشانی</button>
                </div>

                <div className="form-group">
                  <label>استان</label>
                  <input name="county" value={formData.county} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>شهر</label>
                  <input name="city" value={formData.city} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>کد پستی</label>
                  <input name="postalCode" value={formData.postalCode} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>شماره حساب</label>
                  <input name="bankAccountNumber" value={formData.bankAccountNumber} onChange={handleChange} />
                </div>
                <div className="form-group full-width">
                  <label>IBAN (شبا)</label>
                  <input name="iban" value={formData.iban} onChange={handleChange} />
                </div>
                <div className="form-group full-width">
                  <label>توضیحات</label>
                  <textarea name="description" value={formData.description} onChange={handleChange} rows="3" />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="submit-btn" disabled={saving}>
                  {saving ? 'در حال ذخیره...' : 'ذخیره'}
                </button>
                <button type="button" className="cancel-btn" onClick={handleCloseModal}>انصراف</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {markingsCustomer && (
        <MarkingsManager
          customer={markingsCustomer}
          onClose={() => setMarkingsCustomer(null)}
        />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default People;
