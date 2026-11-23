const toEnglishDigits = (value) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const numericValue = (value) => {
  const number = Number(toEnglishDigits(value));
  return Number.isFinite(number) ? number : 0;
};

/**
 * Returns true for fully produced orders, false for incomplete orders, and
 * null while any item's production summary has not been loaded.
 */
export const isOrderProductionComplete = (order, summaryForItem) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) return false;

  const itemSummaries = items.map((item) => ({ item, summary: summaryForItem(item) }));
  if (itemSummaries.some(({ summary }) => !summary || typeof summary !== 'object')) return null;

  const hasProductionRecords = itemSummaries.some(({ summary }) =>
    Array.isArray(summary.logs) && summary.logs.length > 0
  );
  if (!hasProductionRecords) return false;

  return itemSummaries.every(({ item, summary }) => {
    const logs = Array.isArray(summary.logs) ? summary.logs : [];
    const totalFromLogs = logs.reduce((total, log) => total + numericValue(log.quantity), 0);
    const reportedTotal = Number(toEnglishDigits(summary.totalProduced));
    const produced = Number.isFinite(reportedTotal) && reportedTotal !== 0
      ? reportedTotal
      : totalFromLogs;
    const ordered = numericValue(item.quantity);
    const hasPendingQuantity = logs.some((log) => log.quantityPending === true
      || (log.isManagerEntry && !(numericValue(log.quantity) > 0)));

    return produced + 0.00001 >= ordered && !hasPendingQuantity;
  });
};
