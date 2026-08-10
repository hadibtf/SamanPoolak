import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getCustomerMarkings } from '../db';
import { markingsApi, ApiError } from '../api/client';
import { compressImage } from '../utils/image';

// Per-customer marking directory. Markings are strictly owned by one customer
// and can hold an unlimited number of mark images (compressed Base64).
const MarkingsManager = ({ customer, onClose }) => {
  const markings = useLiveQuery(() => getCustomerMarkings(customer.id), [customer.id]);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [src, setSrc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setSrc(compressed);
      // Default the marking name to the file name (it acts as the ID).
      if (!name) setName(file.name);
    } catch (err) {
      console.error('Image compression failed:', err);
      setError('خطا در پردازش تصویر.');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('نام مارک (شناسه) را وارد کنید.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // Server stores the image as a file and returns the canonical record
      // (including its uniquified name and the image URL).
      const { marking } = await markingsApi.create({
        customerId: customer.id,
        name: name.trim(),
        location: location.trim(),
        imageData: src || undefined,
      });
      await db.markings.put(marking); // update the local mirror immediately
      setName('');
      setLocation('');
      setSrc('');
    } catch (err) {
      console.error('Failed to add marking:', err);
      setError(
        err instanceof ApiError && err.status === 0
          ? 'برای افزودن نیاز به اتصال اینترنت دارید.'
          : 'خطا در افزودن مارک.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف این مارک؟')) return;
    try {
      await markingsApi.remove(id);
      await db.markings.delete(id);
    } catch (err) {
      console.error('Failed to delete marking:', err);
      setError(
        err instanceof ApiError && err.status === 0
          ? 'برای حذف نیاز به اتصال اینترنت دارید.'
          : 'خطا در حذف مارک.'
      );
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: '4px' }}>مارک‌های مشتری</h2>
        <p className="muted" style={{ marginBottom: '20px' }}>
          {customer.firstName} {customer.lastName}
        </p>

        <form onSubmit={handleAdd} className="marking-form">
          <label className="photo-upload">
            {src ? (
              <img src={src} alt="پیش‌نمایش" className="photo-thumb" />
            ) : (
              <i className="fa-solid fa-camera"></i>
            )}
            <input type="file" accept="image/*" hidden onChange={handleFile} />
          </label>

          <div className="marking-form-fields">
            <div className="form-group">
              <label>نام مارک (شناسه)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: amirnia5c.jpeg"
              />
            </div>
            <div className="form-group">
              <label>محل نگهداری</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="مثال: باکس ۱"
              />
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={busy}>
            {busy ? 'در حال افزودن...' : 'افزودن مارک'}
          </button>
        </form>

        {error && <div className="inline-error">{error}</div>}

        <div className="markings-grid">
          {markings?.length ? (
            markings.map((m) => (
              <div key={m.id} className="marking-tile">
                {m.src ? (
                  <img src={m.src} alt={m.name} />
                ) : (
                  <div className="marking-tile-noimg"><i className="fa-solid fa-stamp"></i></div>
                )}
                <div className="marking-tile-info">
                  <strong title={m.name}>{m.name}</strong>
                  {m.location && <span className="muted">{m.location}</span>}
                </div>
                <button
                  type="button"
                  className="marking-tile-del"
                  onClick={() => handleDelete(m.id)}
                  title="حذف"
                >
                  <i className="fa-solid fa-trash"></i>
                </button>
              </div>
            ))
          ) : (
            <p className="hint-text">هنوز مارکی برای این مشتری ثبت نشده است.</p>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>بستن</button>
        </div>
      </div>
    </div>
  );
};

export default MarkingsManager;
