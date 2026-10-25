import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { peopleApi, ApiError } from '../api/client';
import PersonFormSheet from '../components/PersonFormSheet';
import MarkingsManager from '../components/MarkingsManager';
import SegmentedTabs from '../components/SegmentedTabs';
import styles from './People.module.css';

const PEOPLE_CATEGORY_TABS = [
  { value: 'ALL', label: 'همه', icon: 'fa-solid fa-users' },
  { value: 'CUSTOMER', label: 'مشتری', icon: 'fa-solid fa-user-tie' },
  { value: 'EMPLOYEE', label: 'کارمند', icon: 'fa-solid fa-user' },
  { value: 'SERVICE_PROVIDER', label: 'فروشنده', icon: 'fa-solid fa-truck' },
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

      <SegmentedTabs className={styles.categoryTabs} label="دسته‌بندی افراد" items={PEOPLE_CATEGORY_TABS} value={activeCategory} onChange={setActiveCategory} />

      <div className="people-list">
        {filteredPeople?.map(person => (
          <div key={person.id} className="person-card">
            <div className="person-info">
              <div className={styles.personHeading}>
                {person.category === 'EMPLOYEE' && person.cardNo && (
                  <span className={styles.personIdentifier} dir="auto" title={person.cardNo}>{person.cardNo}</span>
                )}
                {person.category === 'CUSTOMER' && person.companyName?.trim() && (
                  <span className={styles.personIdentifier} dir="auto" title={person.companyName.trim()}>{person.companyName.trim()}</span>
                )}
                <h3 dir="auto">{person.firstName} {person.lastName}</h3>
              </div>
              {person.phones?.[0] && <p dir="auto">{person.phones[0]}</p>}
            </div>
            <div className={styles.personActions} role="group" aria-label={`عملیات ${person.firstName} ${person.lastName}`}>
              {person.category === 'CUSTOMER' && (
                <button
                  type="button"
                  className={`${styles.personAction} ${styles.personActionDetails}`}
                  title="مدیریت نشان‌های مشتری"
                  aria-label={`مدیریت نشان‌های مشتری ${person.firstName} ${person.lastName}`}
                  onClick={() => setMarkingsCustomer(person)}
                >
                  <i className="fa-solid fa-user" aria-hidden="true"></i>
                </button>
              )}
              <button
                type="button"
                className={`${styles.personAction} ${styles.personActionEdit}`}
                title="ویرایش اطلاعات"
                aria-label={`ویرایش ${person.firstName} ${person.lastName}`}
                onClick={() => handleOpenModal(person)}
              >
                <i className="fa-solid fa-pen-to-square" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                className={`${styles.personAction} ${styles.personActionDelete}`}
                title="حذف"
                aria-label={`حذف ${person.firstName} ${person.lastName}`}
                onClick={() => handleDelete(person.id)}
              >
                <i className="fa-solid fa-trash" aria-hidden="true"></i>
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
