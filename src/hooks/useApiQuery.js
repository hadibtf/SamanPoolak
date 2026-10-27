import { useCallback, useEffect, useRef, useState } from 'react';

// Screen-owned, memory-only reads. Keys must include every route/filter used by
// load. A newer read, route change, unmount, or canonical write wins over a late
// response. No global resource cache or polling loop is involved.
export function useApiQuery(load, dependencies = []) {
  const key = JSON.stringify(dependencies);
  const loader = useRef(load);
  loader.current = load;
  const generation = useRef(0);
  const activeKey = useRef(key);
  activeKey.current = key;
  const [result, setResult] = useState({ key, loading: true });

  const refresh = useCallback(async () => {
    const requestId = ++generation.current;
    setResult((old) => ({ ...(old.key === key ? old : {}), key, loading: true, error: null }));
    try {
      const data = await loader.current();
      if (requestId !== generation.current || activeKey.current !== key) return false;
      setResult({ key, data, loading: false, error: null });
      return true;
    } catch (error) {
      if (requestId !== generation.current || activeKey.current !== key) return false;
      setResult((old) => ({ ...old, key, loading: false, error }));
      return false;
    }
  }, [key]);

  const setData = useCallback((update) => {
    if (activeKey.current !== key) return;
    ++generation.current;
    setResult((old) => {
      const data = typeof update === 'function' ? update(old.key === key ? old.data : undefined) : update;
      if (old.key === key && data === old.data && !old.loading && !old.error) return old;
      return { key, data, loading: false, error: null };
    });
  }, [key]);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      ++generation.current;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { ...(result.key === key ? result : { loading: true }), refresh, setData };
}

export const liveRows = (rows) => (rows || []).filter((row) => !row.deletedAt);
export const newestFirst = (rows) => liveRows(rows).sort((a, b) => Number(b.id) - Number(a.id));
export const upsertRow = (rows, row) => [row, ...(rows || []).filter((old) => old.id !== row.id)];
