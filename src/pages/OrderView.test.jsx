import React from 'react';
import { beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OrderView from './OrderView';

const mocks = vi.hoisted(() => ({
  ordersGet: vi.fn(),
  ordersUpdate: vi.fn(),
  peopleGet: vi.fn(),
  markingsList: vi.fn(),
  employees: vi.fn(),
  itemSummary: vi.fn(),
}));

vi.mock('../api/client', () => ({
  peopleApi: { get: mocks.peopleGet },
  markingsApi: { list: mocks.markingsList },
  ordersApi: { get: mocks.ordersGet, update: mocks.ordersUpdate },
  productionApi: {
    employees: mocks.employees,
    itemSummary: mocks.itemSummary,
  },
  ApiError: class ApiError extends Error {
    constructor(message, status = 0) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
vi.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ currency: 'RIAL', fromRial: Number, toRial: Number }),
}));
vi.mock('../components/ApiReadStatus', () => ({ default: () => null }));
vi.mock('../components/JalaliDatePicker', () => ({
  default: ({ 'aria-label': ariaLabel, placeholder }) => <input aria-label={ariaLabel} placeholder={placeholder} />,
}));

const makeOrder = (productionStopped = false) => ({
  id: 1,
  orderNumber: '05071',
  date: '14050101',
  customerId: null,
  customerName: 'مشتری آزمایشی',
  items: [{
    uid: 'item-1',
    productName: 'قطعه آزمایشی',
    quantity: 10,
    material: 'برنج',
    thickness: 2,
    diameter: 10,
    markingId: null,
    markingName: '',
    platingColor: 'NONE',
    isHardened: false,
    hardeningIntensity: '',
    description: '',
    salePrice: null,
    unitCost: null,
    state: productionStopped ? 'PRODUCTION_COMPLETE' : 'REGISTERED',
    stateHistory: [{ state: productionStopped ? 'PRODUCTION_COMPLETE' : 'REGISTERED', date: Date.now(), totalWeight: null }],
    weightOf10: 100,
    productionStopped,
  }],
});

const renderOrderView = async (order, totalProduced = 10) => {
  mocks.ordersGet.mockResolvedValue({ order });
  mocks.ordersUpdate.mockResolvedValue({ order });
  mocks.peopleGet.mockResolvedValue({ person: null });
  mocks.markingsList.mockResolvedValue({ markings: [] });
  mocks.employees.mockResolvedValue({ employees: [{ personId: '2-9', userId: 9, name: 'کارمند آزمایشی', employeeKey: 'person:2-9' }] });
  mocks.itemSummary.mockResolvedValue({ totalProduced, logs: [] });

  render(
    <MemoryRouter initialEntries={['/orders/view/1']}>
      <Routes><Route path="/orders/view/:id" element={<OrderView />} /></Routes>
    </MemoryRouter>
  );
  await screen.findAllByText('قطعه آزمایشی');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OrderView manual production entry', () => {
  test.each([10, 12])('keeps the manager entry action available at %s produced pieces', async (totalProduced) => {
    await renderOrderView(makeOrder(false), totalProduced);

    expect(await screen.findByRole('button', { name: 'ثبت' })).toBeInTheDocument();
  });

  test('hides the manager entry action after production is explicitly stopped', async () => {
    await renderOrderView(makeOrder(true), 10);

    expect(await screen.findByRole('button', { name: 'ادامه تولید' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ثبت' })).not.toBeInTheDocument();
  });
});
