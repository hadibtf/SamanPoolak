import { clearLegacyCursors, deviceOnlyData, needsLegacyExport, deleteLegacyDatabase, readLegacySnapshot } from './legacyDataCleanup';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

test('refetchable rows and obsolete counters may retire, but any device attendance/card data requires export', () => {
  expect(needsLegacyExport({ people: [{ id: '0-1' }], attendance: [{ id: 5 }], counters: [{ name: 'EMPLOYEE', value: 2 }] })).toBe(false);
  for (const store of ['attendanceScans', 'attendanceEmployees', 'personCards']) {
    expect(needsLegacyExport({ [store]: [{}] })).toBe(true);
  }
  expect(deviceOnlyData({ attendance: [{ id: -1 }, { id: 1 }] }).attendance).toEqual([{ id: -1 }]);
  expect(needsLegacyExport({ attendance: [{ id: -1 }] })).toBe(true);
});

test('cleanup removes only known mirror cursors, preserving calendar, auth and preferences', () => {
  const keep = ['ir_holidays_1405', 'signit_token', 'theme', 'currency', 'signit_unknown_synced_at'];
  for (const key of [...keep, 'signit_people_synced_at', 'signit_mirror_revision']) localStorage.setItem(key, 'value');
  clearLegacyCursors();
  for (const key of keep) expect(localStorage.getItem(key)).toBe('value');
  expect(localStorage.getItem('signit_people_synced_at')).toBeNull();
  expect(localStorage.getItem('signit_mirror_revision')).toBeNull();
});

test('blocked deletion is reported and can be retried without touching unrelated databases', async () => {
  const requests = [];
  const remove = vi.fn(() => { const request = {}; requests.push(request); return request; });
  vi.stubGlobal('indexedDB', { deleteDatabase: remove });
  const first = deleteLegacyDatabase();
  requests[0].onblocked();
  expect(await first).toBe('blocked');
  const retry = deleteLegacyDatabase();
  requests[1].onsuccess();
  expect(await retry).toBe('deleted');
  expect(remove.mock.calls).toEqual([['BusinessPlatformDB'], ['BusinessPlatformDB']]);
});

test('inspection aborts creation when no old database exists', async () => {
  const request = { transaction: { abort: vi.fn() } };
  vi.stubGlobal('indexedDB', { open: vi.fn(() => request) });
  const pending = readLegacySnapshot();
  request.onupgradeneeded();
  expect(request.transaction.abort).toHaveBeenCalledOnce();
  request.onerror();
  expect(await pending).toBeNull();
});
