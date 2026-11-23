import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProductionRecord } from './ProductionDayDetails';

test('management production record links to its exact order item', () => {
  render(<MemoryRouter><ProductionRecord linkToOrder record={{
    id: 12,
    orderId: 42,
    orderItemUid: 'item/دو',
    orderNumber: '05071',
    productName: 'قطعه آزمایشی',
    customerName: 'مشتری',
    quantity: 10,
  }} /></MemoryRouter>);

  expect(screen.getByRole('link', { name: /نمایش سفارش 05071/ }))
    .toHaveAttribute('href', '/orders/view/42?itemUid=item%2F%D8%AF%D9%88');
});
