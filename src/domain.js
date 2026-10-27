// Storage-neutral date, order, and weight helpers. IDs and order numbers are server-owned.
export const jalaliDateKey = (dateObj) => {
  if (!dateObj) return '';
  const y = dateObj.year;
  const m = String(dateObj.month.number).padStart(2, '0');
  const d = String(dateObj.day).padStart(2, '0');
  return `${y}${m}${d}`;
};

const COMPLETED_ORDER_STATES = new Set([
  'DELIVERED_WORKSHOP',
  'SENT_FREIGHT',
  'DELIVERED_PLATING',
]);

let uidCounter = 0;
// Stable-enough unique id for an item within an order (app runtime only).
export const newUid = () => `it-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;

/**
 * An order is "done" only when the latest status recorded for every item is a
 * delivered state. A production-resumed event is not a delivered status.
 */
export const deriveOrderStatus = (order) => {
  const items = order?.items || [];
  const completed = items.filter((item) => {
    const history = item.stateHistory || [];
    const lastEntry = history[history.length - 1];
    const latestStatus = lastEntry?.event || lastEntry?.state || item.state;
    return COMPLETED_ORDER_STATES.has(latestStatus);
  }).length;
  return { done: items.length > 0 && completed === items.length, completed, total: items.length };
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

