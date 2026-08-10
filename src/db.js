import Dexie from 'dexie';
import { attendanceApi, ApiError } from './api/client';
import { requestSync } from './syncBus';
import { ORDER_STATES } from './constants';

export const db = new Dexie('BusinessPlatformDB');

db.version(1).stores({
  people: 'id, category, firstName, lastName, syncStatus',
  counters: 'name'
});

// v2: introduce the local "orders" store for the Order Management module.
// The people store is intentionally left untouched so People CRUD + Payroll
// search keep working against the same local database.
db.version(2).stores({
  people: 'id, category, firstName, lastName, syncStatus',
  counters: 'name',
  orders: '++id, orderNumber, dateKey, customerId, productName, status, syncStatus'
});

// v3: manufacturing requirements. The "status" field is dropped at submission
// time and replaced with manufacturing specs (dimensions, marking, plating,
// hardening). Only query/sort-relevant columns are indexed — the Base64 photo
// and booleans are stored as plain (unindexed) properties.
db.version(3).stores({
  people: 'id, category, firstName, lastName, syncStatus',
  counters: 'name',
  orders: '++id, orderNumber, date, customerId, productName, syncStatus'
});

// v4: per-customer marking directory + order workflow state & weight tracking.
// - markings: a customer-scoped directory of mark images (Base64).
// - orders: gains `state` (current workflow state) plus unindexed fields for
//   material, markingId, stateHistory, and weight/quantity reconciliation.
db.version(4).stores({
  people: 'id, category, firstName, lastName, syncStatus',
  counters: 'name',
  orders: '++id, orderNumber, date, customerId, productName, state, syncStatus',
  markings: '++id, customerId, name'
});

// v5: an order is now a header (customer + date) holding MULTIPLE items.
// Each item carries its own product spec, pricing, workflow state/history and
// weight tracking. Product/state are no longer order-level columns.
db.version(5).stores({
  people: 'id, category, firstName, lastName, syncStatus',
  counters: 'name',
  orders: '++id, orderNumber, date, customerId, syncStatus',
  markings: '++id, customerId, name'
}).upgrade(async (tx) => {
  // Wrap each existing single-product order into a one-item array.
  await tx.table('orders').toCollection().modify((o) => {
    if (Array.isArray(o.items)) return;
    const state = o.state || 'REGISTERED';
    o.items = [{
      uid: `mig-${o.id}`,
      productName: o.productName || '',
      quantity: o.quantity || 0,
      material: o.material || 'IRON',
      thickness: o.thickness ?? null,
      diameter: o.diameter ?? null,
      markingId: o.markingId ?? null,
      markingName: o.markingName || '',
      platingColor: o.platingColor || 'NONE',
      isHardened: !!o.isHardened,
      hardeningIntensity: o.hardeningIntensity || '',
      description: '',
      salePrice: null,
      unitCost: null,
      state,
      stateHistory: o.stateHistory || [{ state, date: null, totalWeight: null }],
      weightOf10: o.weightOf10 ?? null,
      producedTotalWeight: o.producedTotalWeight ?? null,
    }];
    // Remove the now-migrated per-product fields from the header.
    ['productName', 'quantity', 'material', 'thickness', 'diameter', 'markingId',
      'markingName', 'platingColor', 'isHardened', 'hardeningIntensity', 'state',
      'stateHistory', 'weightOf10', 'producedTotalWeight'].forEach((k) => delete o[k]);
  });
});

// v6: shared expense tracker (server-backed, mirrored locally).
db.version(6).stores({
  people: 'id, category, firstName, lastName, syncStatus',
  counters: 'name',
  orders: '++id, orderNumber, date, customerId, syncStatus',
  markings: '++id, customerId, name',
  expenses: '++id, date, category, syncStatus'
});

// v7: attendance (حضور و غیاب) — LOCAL ONLY, device-scoped, NOT synced to the
// server (no backend endpoint exists; these stores must never be added to the
// sync engine's RESOURCES). Populated by importing the attendance.json produced
// by `npm run export:attendance`.
// - attendanceScans: one row per device/manual scan. `source` is 'device'|'manual'.
// - attendanceEmployees: the device's card->name directory (fallback names).
// - personCards: maps an app person id to their device card number (entered in
//   the People screen).
db.version(7).stores({
  people: 'id, category, firstName, lastName, syncStatus',
  counters: 'name',
  orders: '++id, orderNumber, date, customerId, syncStatus',
  markings: '++id, customerId, name',
  expenses: '++id, date, category, syncStatus',
  attendanceScans: '++id, cardNo, dateKey, source',
  attendanceEmployees: 'cardNo',
  personCards: 'personId'
});

// v8: attendance + holidays are now SERVER-BACKED (mirrored via useSyncEngine,
// like expenses). Server assigns the `id`, so these stores key on `id` (not
// ++id). The v7 local-only stores are kept defined so any pre-cutover local
// data remains readable as an offline fallback.
// - attendance: one row per scan (source 'device'|'manual').
// - holidays: official holiday days (dateKey). Fridays stay client-derived.
db.version(8).stores({
  people: 'id, category, firstName, lastName, syncStatus',
  counters: 'name',
  orders: '++id, orderNumber, date, customerId, syncStatus',
  markings: '++id, customerId, name',
  expenses: '++id, date, category, syncStatus',
  attendanceScans: '++id, cardNo, dateKey, source',
  attendanceEmployees: 'cardNo',
  personCards: 'personId',
  attendance: 'id, cardNo, dateKey, source, syncStatus',
  holidays: 'id, dateKey, year'
});

/**
 * Generates a prefixed ID based on category:
 * 0-[AutoNumber] for Employees
 * 1-[AutoNumber] for Customers
 * 2-[AutoNumber] for Service Providers
 */
export const generateId = async (category) => {
  const prefixMap = {
    'EMPLOYEE': '0',
    'CUSTOMER': '1',
    'SERVICE_PROVIDER': '2'
  };
  const prefix = prefixMap[category];
  
  return await db.transaction('rw', db.counters, async () => {
    let counter = await db.counters.get(category);
    if (!counter) {
      counter = { name: category, value: 1 };
    } else {
      counter.value += 1;
    }
    await db.counters.put(counter);
    return `${prefix}-${counter.value}`;
  });
};

/**
 * Builds the YYYYMMDD key from a react-multi-date-picker DateObject (Jalali).
 * e.g. 1405/04/01 -> "14050401"
 */
export const jalaliDateKey = (dateObj) => {
  if (!dateObj) return '';
  const y = dateObj.year;
  const m = String(dateObj.month.number).padStart(2, '0');
  const d = String(dateObj.day).padStart(2, '0');
  return `${y}${m}${d}`;
};

/**
 * Builds the YYMM prefix (last two Jalali year digits + two-digit month)
 * from a YYYYMMDD date key. e.g. "14050301" -> "0503"
 */
export const yymmPrefix = (dateKey) => {
  if (!dateKey || dateKey.length < 6) return '';
  return dateKey.slice(2, 6); // YY + MM
};

/**
 * Generates an order number using the "monthly reset" pattern: YYMMN.
 * N is the count of existing orders in the same Jalali month plus one,
 * with no zero-padding. e.g. 1st order of 1405/03 -> "05031",
 * 35th order -> "050335".
 */
export const generateOrderNumber = async (dateKey) => {
  if (!dateKey) return '';
  const prefix = yymmPrefix(dateKey);
  if (!prefix) return '';

  return await db.transaction('rw', db.orders, async () => {
    const countThisMonth = await db.orders
      .where('orderNumber')
      .startsWith(prefix)
      .count();
    const n = countThisMonth + 1;
    return `${prefix}${n}`;
  });
};

/* ===================== Markings directory ===================== */

/**
 * Splits a marking filename into [base, ext] so duplicates can be numerated
 * before the extension. e.g. "amirnia5c.jpeg" -> ["amirnia5c", ".jpeg"]
 */
const splitName = (name) => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return [name, ''];
  return [name.slice(0, dot), name.slice(dot)];
};

/**
 * Adds a marking to a customer's directory. Markings are strictly
 * customer-scoped (never shared). If the desired name already exists for that
 * customer, it is auto-numerated: name.jpeg -> name-2.jpeg -> name-3.jpeg ...
 * Returns the stored marking record (including its final unique name).
 */
export const addMarking = async (customerId, name, src, location = '') => {
  return await db.transaction('rw', db.markings, async () => {
    const existing = await db.markings
      .where('customerId')
      .equals(customerId)
      .toArray();
    const taken = new Set(existing.map((m) => m.name));

    let finalName = name;
    if (taken.has(finalName)) {
      const [base, ext] = splitName(name);
      let n = 2;
      while (taken.has(`${base}-${n}${ext}`)) n += 1;
      finalName = `${base}-${n}${ext}`;
    }

    const record = { customerId, name: finalName, src, location, createdAt: Date.now() };
    record.id = await db.markings.add(record);
    return record;
  });
};

export const getCustomerMarkings = (customerId) =>
  db.markings.where('customerId').equals(customerId).toArray();

/* ===================== Weight reconciliation ===================== */

/**
 * Pure helper: derive per-piece weight, expected total, produced quantity, etc.
 * weightOf10 / producedTotalWeight are in grams; orderQuantity is a piece count.
 * Returns null-ish fields when inputs are missing rather than NaN.
 */
/* ===================== Order items ===================== */

const READY_STATE = 'READY';
const READY_STATE_INDEX = ORDER_STATES.findIndex((state) => state.value === READY_STATE);

let uidCounter = 0;
// Stable-enough unique id for an item within an order (app runtime only).
export const newUid = () => `it-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;

/**
 * Derives the order-level status from its items: an order is "done" once every
 * item has reached the READY (آماده تحویل) state or a later state.
 */
export const deriveOrderStatus = (order) => {
  const items = order?.items || [];
  const ready = items.filter((it) => {
    const stateIndex = ORDER_STATES.findIndex((state) => state.value === it.state);
    return stateIndex >= READY_STATE_INDEX;
  }).length;
  return { done: items.length > 0 && ready === items.length, ready, total: items.length };
};

export const computeWeights = ({ weightOf10, orderQuantity, producedTotalWeight }) => {
  const w10 = Number(weightOf10) || 0;
  const qty = Number(orderQuantity) || 0;
  const produced = Number(producedTotalWeight) || 0;

  const unitWeight = w10 > 0 ? w10 / 10 : 0;
  const expectedTotalWeight = unitWeight > 0 ? unitWeight * qty : 0;
  const producedQuantity = unitWeight > 0 && produced > 0 ? produced / unitWeight : 0;

  return {
    unitWeight,                 // grams per piece
    expectedQuantity: qty,
    expectedTotalWeight,        // grams
    producedTotalWeight: produced,
    producedQuantity,           // derived piece count
  };
};

/* ===================== Attendance (server-backed, local fallback) ========== */

// The attendance API isn't fully live on every branch yet. When it can't store
// the data — 404 (endpoint missing), 0 (offline), or 5xx (deployed but the
// `attendance` table hasn't been migrated onto the live DB) — we fall back to
// writing straight into the local `attendance` mirror so the feature stays
// usable. Local-only rows get negative ids so they never collide with
// server-assigned (positive) ids.
const serverUnavailable = (err) =>
  err instanceof ApiError && (err.status === 404 || err.status === 0 || err.status >= 500);

let localIdSeq = 0;
const nextLocalId = () => {
  localIdSeq += 1;
  return -(Date.now() * 1000 + (localIdSeq % 1000));
};

/**
 * Bulk-import an attendance.json payload
 * ({ employees:[{cardNo,name}], records:[{cardNo,dateKey,time,...}] }).
 * Tries the server (which dedups + preserves manual rows, then syncs back);
 * if the API is unavailable, imports into the local mirror instead. Returns a
 * summary for the toast.
 */
export const importAttendance = async (payload) => {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const employees = Array.isArray(payload?.employees) ? payload.employees : [];
  if (!records.length) {
    throw new Error('فایل معتبر نیست یا رکوردی ندارد.');
  }

  try {
    await attendanceApi.import({ records, employees });
    // Server is now authoritative — drop any local-only (negative id) rows so
    // they don't duplicate the rows the sync is about to bring in.
    const localOnly = (await db.attendance.toCollection().primaryKeys()).filter((k) => typeof k === 'number' && k < 0);
    if (localOnly.length) await db.attendance.bulkDelete(localOnly);
    requestSync();
  } catch (err) {
    if (!serverUnavailable(err)) throw err;
    // Local fallback: replace device scans, keep manual ones.
    await db.transaction('rw', db.attendance, async () => {
      const devices = await db.attendance.where('source').equals('device').primaryKeys();
      if (devices.length) await db.attendance.bulkDelete(devices);
      await db.attendance.bulkPut(
        records.map((r) => ({
          id: nextLocalId(),
          cardNo: String(r.cardNo),
          dateKey: String(r.dateKey),
          time: String(r.time || ''),
          status: r.status ?? null,
          insertType: r.insertType ?? null,
          source: 'device',
        }))
      );
    });
  }

  const dateKeys = records.map((r) => String(r.dateKey)).filter(Boolean).sort();
  return {
    count: records.length,
    employees: employees.length,
    minDate: dateKeys[0] || '',
    maxDate: dateKeys[dateKeys.length - 1] || '',
  };
};

/** Add a single manual scan (e.g. a forgotten exit): server + mirror, or local. */
export const addManualScan = async (cardNo, dateKey, time) => {
  const scan = { cardNo: String(cardNo), dateKey: String(dateKey), time: String(time), source: 'manual' };
  try {
    const res = await attendanceApi.create(scan);
    const row = res?.attendance;
    if (row) await db.attendance.put(row);
    return row;
  } catch (err) {
    if (!serverUnavailable(err)) throw err;
    const row = { id: nextLocalId(), status: null, insertType: null, ...scan };
    await db.attendance.put(row);
    return row;
  }
};

/** Soft-delete a scan: server + mirror, or local. */
export const removeScan = async (id) => {
  // Local-only rows (negative id) never reached the server.
  if (typeof id === 'number' && id < 0) {
    await db.attendance.delete(id);
    return;
  }
  try {
    await attendanceApi.remove(id);
  } catch (err) {
    if (!serverUnavailable(err)) throw err;
  }
  await db.attendance.delete(id);
};

/** Person <-> device card number (entered in the People screen). */
export const setPersonCard = (personId, cardNo) => {
  const trimmed = String(cardNo || '').trim();
  if (!trimmed) return db.personCards.delete(personId);
  return db.personCards.put({ personId, cardNo: trimmed });
};

export const getPersonCard = async (personId) => {
  const row = await db.personCards.get(personId);
  return row?.cardNo || '';
};
