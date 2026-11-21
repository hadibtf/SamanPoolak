import React from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import OrderList from './OrderList';

const mocks = vi.hoisted(() => ({
  peopleList: vi.fn(),
  ordersList: vi.fn(),
  ordersUpdate: vi.fn(),
  ordersRemove: vi.fn(),
  itemSummary: vi.fn(),
}));

vi.mock('../api/client', () => ({
  peopleApi: { list: mocks.peopleList },
  ordersApi: { list: mocks.ordersList, update: mocks.ordersUpdate, remove: mocks.ordersRemove },
  productionApi: { itemSummary: mocks.itemSummary },
  ApiError: class ApiError extends Error {
    constructor(message, status = 0) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('../components/ApiReadStatus', () => ({ default: () => null }));
vi.mock('../components/JalaliDatePicker', () => ({
  default: ({ placeholder, id, value, onChange, 'aria-label': ariaLabel }) => (
    <input id={id} value={value ?? ''} onChange={onChange} aria-label={ariaLabel} placeholder={placeholder} readOnly={!onChange} />
  ),
}));
vi.mock('../components/MetallicText', () => ({ default: ({ children }) => <>{children}</> }));
vi.mock('../components/ImageGlassSurface', () => ({
  default: ({ as: Tag = 'div', children, ...props }) => <Tag {...props}>{children}</Tag>,
}));
vi.mock('../components/SegmentedTabs', () => ({
  default: ({ items, value, onChange, label }) => (
    <div role="group" aria-label={label}>
      {items.map((item) => (
        <button key={item.value} type="button" aria-pressed={value === item.value} onClick={() => onChange(item.value)}>
          {item.label} {item.badge}
        </button>
      ))}
    </div>
  ),
}));

const makeOrder = (items = [{
  uid: 'item-1', productName: 'قطعه اول', quantity: 10, state: 'REGISTERED',
  stateHistory: [{ state: 'REGISTERED', date: 1, totalWeight: null }],
}]) => ({
  id: 17,
  orderNumber: '05071',
  date: '14050101',
  customerId: null,
  customerName: 'مشتری آزمایشی',
  items,
});

const renderOrderList = async (order) => {
  mocks.ordersList.mockResolvedValue({ orders: [order] });
  mocks.peopleList.mockResolvedValue({ people: [] });
  mocks.ordersUpdate.mockImplementation(async (id, patch) => ({
    order: { ...order, id, items: patch.items },
  }));
  const view = render(<MemoryRouter><OrderList /></MemoryRouter>);
  await screen.findByRole('button', { name: /تکمیل و تحویل/ });
  return view;
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OrderList delivery action', () => {
  test('delivers a fully produced order and moves it to the completed tab', async () => {
    const order = makeOrder();
    await renderOrderList(order);
    mocks.itemSummary.mockResolvedValue({ totalProduced: 10, logs: [{ quantity: 10, isManagerEntry: false }] });

    await userEvent.click(screen.getByRole('button', { name: /تکمیل و تحویل/ }));

    await waitFor(() => expect(mocks.ordersUpdate).toHaveBeenCalledTimes(1));
    const [, patch] = mocks.ordersUpdate.mock.calls[0];
    expect(patch.items[0]).toMatchObject({ state: 'DELIVERED_WORKSHOP', productionStopped: true });
    expect(patch.items[0].stateHistory).toHaveLength(2);
    expect(patch.items[0].stateHistory[0].state).toBe('REGISTERED');
    expect(patch.items[0].stateHistory[1]).not.toHaveProperty('note');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /تکمیل شده/ }));
    expect(await screen.findByText('قطعه اول')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تکمیل و تحویل/ })).not.toBeInTheDocument();
  });

  test('saves an explanation for orders without production records without a second confirmation', async () => {
    const order = makeOrder([
      { uid: 'item-1', productName: 'قطعه اول', quantity: 10, state: 'REGISTERED', stateHistory: [] },
      { uid: 'item-2', productName: 'قطعه دوم', quantity: 5, state: 'REGISTERED', stateHistory: [] },
    ]);
    await renderOrderList(order);
    mocks.itemSummary.mockResolvedValue({ totalProduced: 0, logs: [] });

    await userEvent.click(screen.getByRole('button', { name: /تکمیل و تحویل/ }));

    const dialog = await screen.findByRole('dialog', { name: 'بررسی تولید پیش از تحویل' });
    await waitFor(() => expect(screen.getByRole('button', { name: /تکمیل و تحویل/ })).toBeEnabled());
    expect(within(dialog).getByText('برای این سفارش هیچ سابقه فعال تولیدی ثبت نشده است.')).toBeInTheDocument();
    const warningText = 'تولید بعضی اقلام به تعداد سفارش نرسیده یا وزن واحد یکی از اقلام هنوز محاسبه نشده است:';
    expect(within(dialog).getByText(warningText)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'ادامه و ثبت تحویل' });
    expect(mocks.ordersUpdate).not.toHaveBeenCalled();
    const browserConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await userEvent.type(within(dialog).getByLabelText('توضیح وضعیت سفارش (اختیاری)'), 'تولید انجام شده اما ثبت آن موجود نیست.');
    await act(async () => { await userEvent.click(confirm); });

    expect(browserConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.ordersUpdate).toHaveBeenCalledTimes(1));
    const [, patch] = mocks.ordersUpdate.mock.calls[0];
    expect(patch.items).toHaveLength(2);
    patch.items.forEach((item) => {
      expect(item.state).toBe('DELIVERED_WORKSHOP');
      expect(item.productionStopped).toBe(true);
      expect(item.stateHistory.at(-1).note).toBe('تولید انجام شده اما ثبت آن موجود نیست.');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /تکمیل شده/ }));
    expect(await screen.findByText('قطعه اول')).toBeInTheDocument();
  });

  test('allows delivery without a note only after a second confirmation', async () => {
    await renderOrderList(makeOrder());
    mocks.itemSummary.mockResolvedValue({ totalProduced: 0, logs: [] });

    await userEvent.click(screen.getByRole('button', { name: /تکمیل و تحویل/ }));
    const dialog = await screen.findByRole('dialog', { name: 'بررسی تولید پیش از تحویل' });
    await waitFor(() => expect(screen.getByRole('button', { name: /تکمیل و تحویل/ })).toBeEnabled());
    const browserConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await act(async () => { await userEvent.click(within(dialog).getByRole('button', { name: 'ادامه و ثبت تحویل' })); });

    expect(browserConfirm).toHaveBeenCalledWith('توضیحی وارد نکرده‌اید. آیا مطمئن هستید که بدون توضیح، سفارش را تحویل‌شده ثبت کنید؟');
    await waitFor(() => expect(mocks.ordersUpdate).toHaveBeenCalledTimes(1));
    const [, patch] = mocks.ordersUpdate.mock.calls[0];
    expect(patch.items[0].state).toBe('DELIVERED_WORKSHOP');
    expect(patch.items[0].productionStopped).toBe(true);
    expect(patch.items[0].stateHistory.at(-1)).not.toHaveProperty('note');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('keeps the warning open when delivery without a note is declined', async () => {
    await renderOrderList(makeOrder());
    mocks.itemSummary.mockResolvedValue({ totalProduced: 0, logs: [] });

    await userEvent.click(screen.getByRole('button', { name: /تکمیل و تحویل/ }));
    const dialog = await screen.findByRole('dialog', { name: 'بررسی تولید پیش از تحویل' });
    await waitFor(() => expect(screen.getByRole('button', { name: /تکمیل و تحویل/ })).toBeEnabled());
    await userEvent.type(within(dialog).getByLabelText('توضیح وضعیت سفارش (اختیاری)'), '   ');
    const browserConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await userEvent.click(within(dialog).getByRole('button', { name: 'ادامه و ثبت تحویل' }));

    expect(browserConfirm).toHaveBeenCalledTimes(1);
    expect(mocks.ordersUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'بررسی تولید پیش از تحویل' })).toBeInTheDocument();
  });

  test('lists under-produced and uncalculated items, and cancel makes no change', async () => {
    const order = makeOrder([
      { uid: 'item-1', productName: 'قطعه کوتاه', quantity: 10, state: 'REGISTERED', stateHistory: [] },
      { uid: 'item-2', productName: 'قطعه منتظر محاسبه', quantity: 5, state: 'REGISTERED', stateHistory: [] },
    ]);
    await renderOrderList(order);
    mocks.itemSummary.mockImplementation(async (_orderId, uid) => uid === 'item-1'
      ? { totalProduced: 4, logs: [{ quantity: 4, isManagerEntry: false }] }
      : { totalProduced: 0, logs: [{ quantity: 0, isManagerEntry: true }] });

    await userEvent.click(screen.getByRole('button', { name: /تکمیل و تحویل/ }));

    const dialog = await screen.findByRole('dialog', { name: 'بررسی تولید پیش از تحویل' });
    expect(within(dialog).getByText('قطعه کوتاه')).toBeInTheDocument();
    expect(within(dialog).getByText(/تولید ۴ از ۱۰ عدد/)).toBeInTheDocument();
    expect(within(dialog).getByText('قطعه منتظر محاسبه')).toBeInTheDocument();
    expect(within(dialog).getByText(/در انتظار محاسبه تعداد/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'انصراف' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.ordersUpdate).not.toHaveBeenCalled();
  });

  test('does not deliver when production summaries cannot be loaded', async () => {
    await renderOrderList(makeOrder());
    mocks.itemSummary.mockRejectedValue(new Error('request failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await userEvent.click(screen.getByRole('button', { name: /تکمیل و تحویل/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('بررسی سوابق یا ثبت تحویل سفارش انجام نشد');
    expect(mocks.ordersUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  test('keeps the warning open and the order in progress when delivery save fails', async () => {
    await renderOrderList(makeOrder());
    mocks.itemSummary.mockResolvedValue({ totalProduced: 0, logs: [] });
    mocks.ordersUpdate.mockRejectedValue(new Error('write failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await userEvent.click(screen.getByRole('button', { name: /تکمیل و تحویل/ }));
    const dialog = await screen.findByRole('dialog', { name: 'بررسی تولید پیش از تحویل' });
    await waitFor(() => expect(screen.getByRole('button', { name: /تکمیل و تحویل/ })).toBeEnabled());
    await userEvent.type(within(dialog).getByLabelText('توضیح وضعیت سفارش (اختیاری)'), 'رکورد تولید در دسترس نیست.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'ادامه و ثبت تحویل' }));

    expect(await screen.findByText(/ثبت تحویل سفارش انجام نشد/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تکمیل و تحویل/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /در حال انجام/ })).toBeInTheDocument();
    expect(mocks.ordersUpdate).toHaveBeenCalledTimes(1);
  });
});
