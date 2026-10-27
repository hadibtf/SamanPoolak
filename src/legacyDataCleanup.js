// One-release migration shim: read/export/delete only this retired database.
// Never open it as an application data source or write records into it.
const DATABASE = 'BusinessPlatformDB';
const CURSORS = ['people', 'orders', 'markings', 'expenses', 'issue_notes', 'attendance', 'holidays'];

export function clearLegacyCursors() {
  try {
    CURSORS.forEach((resource) => localStorage.removeItem(`signit_${resource}_synced_at`));
    localStorage.removeItem('signit_mirror_revision');
  } catch { /* A blocked preference store must not prevent API reads. */ }
}

export function readLegacySnapshot() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE);
    let absent = false;
    request.onupgradeneeded = () => {
      // Opening a missing database must not create a new persistent store.
      absent = true;
      request.transaction.abort();
    };
    request.onerror = () => absent ? resolve(null) : reject(request.error);
    request.onblocked = () => reject(new Error('Close other tabs and retry.'));
    request.onsuccess = () => {
      const connection = request.result;
      connection.onversionchange = () => connection.close();
      const names = Array.from(connection.objectStoreNames);
      if (!names.length) { connection.close(); resolve({}); return; }
      const snapshot = {};
      const transaction = connection.transaction(names, 'readonly');
      names.forEach((name) => {
        const read = transaction.objectStore(name).getAll();
        read.onsuccess = () => { snapshot[name] = read.result; };
      });
      transaction.oncomplete = () => { connection.close(); resolve(snapshot); };
      transaction.onabort = transaction.onerror = () => { connection.close(); reject(transaction.error || new Error('Cannot read legacy data')); };
    };
  });
}

export function deviceOnlyData(snapshot) {
  if (!snapshot) return {};
  // Counters belonged to dead client-side ID/number generators and are retired.
  // Card links and fallback employee names remain valuable even if superseded
  // by server people.cardNo, so require an export rather than guessing.
  return {
    attendanceScans: snapshot.attendanceScans || [],
    attendanceEmployees: snapshot.attendanceEmployees || [],
    personCards: snapshot.personCards || [],
    attendance: (snapshot.attendance || []).filter((row) => Number(row.id) < 0),
  };
}

export function needsLegacyExport(snapshot) {
  return Object.values(deviceOnlyData(snapshot)).some((rows) => rows.length > 0);
}

export function deleteLegacyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = () => { clearLegacyCursors(); resolve('deleted'); };
    request.onblocked = () => resolve('blocked');
    request.onerror = () => reject(request.error);
  });
}
