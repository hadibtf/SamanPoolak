import { describe, expect, test } from 'vitest';
import { isOrderProductionComplete } from './orderCompleteness';

const makeOrder = (items = [{ uid: 'item-1', quantity: 10 }]) => ({ id: 7, items });
const summariesByUid = (entries) => (item) => entries[item.uid];

describe('isOrderProductionComplete', () => {
  test('accepts exact and over-produced quantities', () => {
    const order = makeOrder([
      { uid: 'exact', quantity: 10 },
      { uid: 'over', quantity: 5 },
    ]);
    const summaries = {
      exact: { totalProduced: 10, logs: [{ quantity: 10 }] },
      over: { totalProduced: 8, logs: [{ quantity: 8 }] },
    };

    expect(isOrderProductionComplete(order, summariesByUid(summaries))).toBe(true);
  });

  test('marks an order incomplete when any item is short', () => {
    const order = makeOrder([
      { uid: 'complete', quantity: 10 },
      { uid: 'short', quantity: 5 },
    ]);
    const summaries = {
      complete: { totalProduced: 10, logs: [{ quantity: 10 }] },
      short: { totalProduced: 4, logs: [{ quantity: 4 }] },
    };

    expect(isOrderProductionComplete(order, summariesByUid(summaries))).toBe(false);
  });

  test('marks orders with no active production records incomplete', () => {
    const order = makeOrder();

    expect(isOrderProductionComplete(order, () => ({ totalProduced: 0, logs: [] }))).toBe(false);
  });

  test('marks pending or uncalculated quantities incomplete', () => {
    const order = makeOrder([
      { uid: 'pending-report', quantity: 10 },
      { uid: 'pending-manager-entry', quantity: 4 },
    ]);
    const summaries = {
      'pending-report': {
        totalProduced: 10,
        logs: [{ quantity: 10, quantityPending: true }],
      },
      'pending-manager-entry': {
        totalProduced: 4,
        logs: [{ quantity: 0, isManagerEntry: true }],
      },
    };

    expect(isOrderProductionComplete(order, summariesByUid(summaries))).toBe(false);
  });

  test('returns unknown until every item summary is available', () => {
    const order = makeOrder([
      { uid: 'loaded', quantity: 10 },
      { uid: 'missing', quantity: 5 },
    ]);
    const summaries = { loaded: { totalProduced: 10, logs: [{ quantity: 10 }] } };

    expect(isOrderProductionComplete(order, summariesByUid(summaries))).toBeNull();
  });
});
