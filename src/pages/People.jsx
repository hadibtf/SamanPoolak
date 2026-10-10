import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { peopleApi, ApiError } from '../api/client';
import PersonFormSheet from '../components/PersonFormSheet';
import MarkingsManager from '../components/MarkingsManager';
import styles from './People.module.css';

const PEOPLE_CATEGORY_TABS = [
  { value: 'ALL', label: 'همه' },
  { value: 'CUSTOMER', label: 'مشتری' },
  { value: 'EMPLOYEE', label: 'کارمند' },
  { value: 'SERVICE_PROVIDER', label: 'فروشنده' },
];

const People = () => {
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [markingsCustomer, setMarkingsCustomer] = useState(null);
  const [toast, setToast] = useState(null);

  const people = useLiveQuery(() => db.people.toArray());
  const filteredPeople = people?.filter((person) => (
    activeCategory === 'ALL' || person.category === activeCategory
  ));

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Server-authoritative writes: every save/delete fails loudly if offline.
  const reportError = (error, message) => {
    const errorMessage = message || (error instanceof ApiError && error.status === 0
      ? 'برای ذخیره نیاز به اتصال اینترنت دارید.'
      : 'خطا در ذخیره اطلاعات.');
    showToast(errorMessage, 'error');
    if (error) console.error('People write failed:', error);
  };

  const handleOpenModal = (person = null) => {
    setEditingPerson(person);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPerson(null);
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


  return (
    <div className={`${styles.root} people-container`}>
      <div className="header-section">
        <h1>لیست افراد</h1>
        <button className="add-btn" onClick={() => handleOpenModal()}>
          <i className="fa-solid fa-plus"></i>
          افزودن فرد جدید
        </button>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="دسته‌بندی افراد">
        {PEOPLE_CATEGORY_TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={activeCategory === value}
            className={activeCategory === value ? 'active' : ''}
            onClick={() => setActiveCategory(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="people-list">
        {filteredPeople?.map(person => (
          <div key={person.id} className="person-card">
            <div className="person-info">
              <div className={styles.personHeading}>
                {person.category === 'EMPLOYEE' && person.cardNo && (
                  <span className={styles.personIdentifier}>{person.cardNo}</span>
                )}
                {person.category === 'CUSTOMER' && person.companyName?.trim() && (
                  <span className={styles.personIdentifier}>{person.companyName.trim()}</span>
                )}
                <h3>{person.firstName} {person.lastName}</h3>
              </div>
              {person.phones?.[0] && <p>{person.phones[0]}</p>}
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
        <PersonFormSheet
          person={editingPerson}
          initialCategory={activeCategory === 'ALL' ? 'EMPLOYEE' : activeCategory}
          showCategorySelector={activeCategory === 'ALL'}
          onClose={handleCloseModal}
          onSaved={(_person, wasEditing) => showToast(wasEditing ? 'ویرایش شد.' : 'ثبت شد.')}
          onError={reportError}
        />
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
