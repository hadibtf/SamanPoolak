import { useEffect, useRef } from 'react';
import { db } from '../db';
import {
  peopleApi, ordersApi, markingsApi, expensesApi, issueNotesApi, attendanceApi, holidaysApi, getToken,
} from '../api/client';
import { onSyncRequest } from '../syncBus';
import { applyServerHolidays } from '../holidays';

const POLL_MS = 15000;
// Bump this whenever a deployed client must rebuild its local server mirror.
// A cursor can survive IndexedDB being cleared or migrated; without this reset,
// a client would only request rows newer than that stale cursor.
const MIRROR_REVISION = '2';
const MIRROR_REVISION_KEY = 'signit_mirror_revision';

// After a resource is pulled, optionally bridge the mirror somewhere else.
// Holidays feed the holidays.js localStorage cache so isHoliday() stays the
// single read path (whether data arrived via manual upload or server sync).
const afterHolidaysPull = async () => {
  try {
    applyServerHolidays(await db.holidays.toArray());
  } catch (e) {
    console.error('Applying server holidays failed:', e);
  }
};

// One delta-pull definition per server-backed resource.
// `table` is the Dexie mirror; `key` is the response array key; `cursorKey`
// persists the last-synced timestamp; `list` fetches the delta; `onApplied`
// runs after the mirror is updated.
const RESOURCES = [
  { table: 'people',     key: 'people',     cursorKey: 'signit_people_synced_at',     list: peopleApi.list },
  { table: 'orders',     key: 'orders',     cursorKey: 'signit_orders_synced_at',     list: ordersApi.list },
  { table: 'markings',   key: 'markings',   cursorKey: 'signit_markings_synced_at',    list: markingsApi.list },
  { table: 'expenses',   key: 'expenses',   cursorKey: 'signit_expenses_synced_at',    list: expensesApi.list },
  { table: 'issueNotes', key: 'issueNotes', cursorKey: 'signit_issue_notes_synced_at', list: issueNotesApi.list },
  { table: 'attendance', key: 'attendance', cursorKey: 'signit_attendance_synced_at',  list: attendanceApi.list },
  { table: 'holidays',   key: 'holidays',   cursorKey: 'signit_holidays_synced_at',    list: holidaysApi.list, onApplied: afterHolidaysPull },
];

// Pull one resource's changes from the server into its local Dexie mirror.
// First run (no cursor) replaces the local set with the server's (start fresh);
// later runs are incremental via ?updatedAfter=<iso> and apply soft-deletes.
const pullResource = async ({ table, key, cursorKey, list, onApplied }) => {
  const cursor = localStorage.getItem(cursorKey) || null;
  const res = await list(cursor || undefined);
  const rows = res?.[key];
  if (!Array.isArray(rows)) return;

  let maxUpdatedAt = cursor;
  const advance = (r) => {
    if (r.updatedAt && (!maxUpdatedAt || r.updatedAt > maxUpdatedAt)) maxUpdatedAt = r.updatedAt;
  };

  if (!cursor) {
    const fresh = rows.filter((r) => !r.deletedAt);
    await db[table].clear();
    if (fresh.length) await db[table].bulkPut(fresh);
    rows.forEach(advance);
  } else {
    for (const r of rows) {
      if (r.deletedAt) await db[table].delete(r.id);
      else await db[table].put(r);
      advance(r);
    }
  }

  if (maxUpdatedAt) localStorage.setItem(cursorKey, maxUpdatedAt);
  if (onApplied) await onApplied();
};

// Mirrors all server-backed resources (people, orders, markings) into Dexie.
export const useSyncEngine = () => {
  const runningRef = useRef(false);

  const syncData = async () => {
    if (runningRef.current || !getToken() || !navigator.onLine) return;
    runningRef.current = true;
    try {
      for (const resource of RESOURCES) {
        try {
          await pullResource(resource);
        } catch (error) {
          // One resource failing shouldn't block the others; next tick retries.
          // 404 = endpoint not deployed yet (e.g. attendance/holidays before the
          // API ships) — stay quiet so it doesn't spam the console every poll.
          if (error?.status !== 404) {
            console.error(`Sync failed for ${resource.table}:`, error);
          }
        }
      }
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    // One-time, safe full refresh for existing installs. The server remains the
    // source of truth, and each resource's first pull replaces its local set.
    if (localStorage.getItem(MIRROR_REVISION_KEY) !== MIRROR_REVISION) {
      RESOURCES.forEach(({ cursorKey }) => localStorage.removeItem(cursorKey));
      localStorage.setItem(MIRROR_REVISION_KEY, MIRROR_REVISION);
    }
    syncData();

    const onOnline = () => syncData();
    const onFocus = () => syncData();
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    const interval = setInterval(syncData, POLL_MS);
    // Let writes (attendance/holiday import) request an immediate pull.
    const unsubscribe = onSyncRequest(syncData);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { syncData };
};
