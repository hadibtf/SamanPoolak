import React from 'react';
import { beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OrderView from './OrderView';

const mocks = vi.hoisted(() => ({
  ordersGet: vi.fn(),
  ordersUpdate: vi.fn(),
  peopleGet: vi.fn(),
  markingsList: vi.fn(),
  employees: vi.fn(),
  itemSummary: vi.fn(),
  html2canvas: vi.fn(),
  jsPdf: vi.fn(),
  pdfSave: vi.fn(),
}));

vi.mock('html2canvas', () => ({ default: mocks.html2canvas }));
vi.mock('jspdf', () => ({ default: mocks.jsPdf }));

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
  mocks.html2canvas.mockResolvedValue({
    width: 794,
    height: 1123,
    toDataURL: () => 'data:image/jpeg;base64,test',
  });
  mocks.jsPdf.mockImplementation(class MockJsPdf {
    constructor() {
      this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
      this.addImage = vi.fn();
      this.save = mocks.pdfSave;
    }
  });
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

describe('OrderView invoice export', () => {
  const openExportDialog = async () => {
    fireEvent.click(screen.getByTitle('صدور فاکتور'));
    await screen.findByRole('dialog');
  };

  const completeExport = async (buttonName) => {
    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    await waitFor(() => expect(mocks.pdfSave).toHaveBeenCalled());
    return mocks.html2canvas.mock.calls[0][0];
  };

  test('keeps the regular invoice title and places its description in the table footer', async () => {
    await renderOrderView(makeOrder());
    await openExportDialog();
    fireEvent.change(screen.getByLabelText('توضیحات فاکتور'), { target: { value: 'توضیح آزمایشی' } });

    const sheet = await completeExport('ذخیره قیمت و صدور فاکتور');
    const noteRow = sheet.querySelector('.invoice-table tfoot .c-note-row');

    expect(sheet.querySelector('.invoice-head h1')).toHaveTextContent('فاکتور فروش');
    expect(sheet.querySelector('.invoice-head')).not.toHaveClass('invoice-head-proforma');
    expect(noteRow).toHaveTextContent('توضیح آزمایشی');
    expect(noteRow.querySelector('td')).toHaveAttribute('colspan', '8');
    expect(noteRow.previousElementSibling).toHaveTextContent('جمع کل');
    expect(sheet.querySelector('.invoice-note')).toBeNull();
    expect(mocks.pdfSave).toHaveBeenCalledWith('مشتری-آزمایشی-14050101.pdf');
  });

  test('exports a centered pre-invoice title with the shared description and selected orientation', async () => {
    await renderOrderView(makeOrder());
    await openExportDialog();
    fireEvent.click(screen.getByRole('button', { name: /افقی/ }));
    fireEvent.change(screen.getByLabelText('توضیحات فاکتور'), { target: { value: 'شرایط پیش‌فاکتور' } });

    const sheet = await completeExport('صدور پیش فاکتور');
    const noteRow = sheet.querySelector('.invoice-table tfoot .c-note-row');

    expect(sheet.querySelector('.invoice-head h1')).toHaveTextContent('پیش فاکتور');
    expect(sheet.querySelector('.invoice-head')).toHaveClass('invoice-head-proforma');
    expect(sheet).toHaveAttribute('data-orientation', 'landscape');
    expect(noteRow).toHaveTextContent('شرایط پیش‌فاکتور');
    expect(noteRow.previousElementSibling).toHaveTextContent('جمع کل');
    expect(mocks.jsPdf).toHaveBeenCalledWith({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    expect(mocks.pdfSave).toHaveBeenCalledWith('مشتری-آزمایشی-14050101-پیش-فاکتور.pdf');
  });

  test('omits the attached description row when the description is blank', async () => {
    await renderOrderView(makeOrder());
    await openExportDialog();

    const sheet = await completeExport('صدور پیش فاکتور');

    expect(sheet.querySelector('.invoice-table tfoot .c-note-row')).toBeNull();
  });
});
