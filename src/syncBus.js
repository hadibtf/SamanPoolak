// Tiny pub/sub so a write (attendance/holiday import) can ask the sync engine to
// pull immediately instead of waiting for the next ~15s poll. Kept dependency-free
// to avoid an import cycle between db.js and hooks/useSyncEngine.js.

const subscribers = new Set();

/** useSyncEngine registers its syncData here. */
export const onSyncRequest = (fn) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

/** Fire a sync now (best-effort; no-op if the engine isn't mounted). */
export const requestSync = () => subscribers.forEach((fn) => fn());
