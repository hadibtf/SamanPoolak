import { act, renderHook, waitFor } from '@testing-library/react';
import { useApiQuery } from './useApiQuery';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test('loads on entry, refreshes on focus, and removes deleted rows by replacing the list', async () => {
  const load = vi.fn().mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);
  const { result, unmount } = renderHook(() => useApiQuery(load));
  await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.data).toEqual([]));
  unmount();
  window.dispatchEvent(new Event('focus'));
  expect(load).toHaveBeenCalledTimes(2);
});

test('ignores a late response after a filter or route changes', async () => {
  const first = deferred();
  const load = vi.fn((id) => id === 1 ? first.promise : Promise.resolve('second'));
  const { result, rerender } = renderHook(({ id }) => useApiQuery(() => load(id), [id]), { initialProps: { id: 1 } });
  rerender({ id: 2 });
  await waitFor(() => expect(result.current.data).toBe('second'));
  await act(async () => first.resolve('first'));
  expect(result.current.data).toBe('second');
});

test('a confirmed write wins over an older in-flight list read', async () => {
  const pending = deferred();
  const { result } = renderHook(() => useApiQuery(() => pending.promise));
  act(() => result.current.setData([{ id: 2, title: 'canonical' }]));
  await act(async () => pending.resolve([{ id: 2, title: 'old' }]));
  expect(result.current.data[0].title).toBe('canonical');
});

test('network errors are explicit and retry can recover', async () => {
  const error = new Error('offline');
  const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce([]);
  const { result } = renderHook(() => useApiQuery(load));
  await waitFor(() => expect(result.current.error).toBe(error));
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toBeUndefined();
  await act(() => result.current.refresh());
  expect(result.current.error).toBeNull();
  expect(result.current.data).toEqual([]);
});
