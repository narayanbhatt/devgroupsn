import { describe, expect, it } from '@jest/globals';

import { compactINR, dashboardStats, type DashEnquiry, type DashOrder } from '../dashboard';

const enq = (id: string, status: DashEnquiry['status'], submittedAt = '2026-11-20T00:00:00Z'): DashEnquiry => ({
  id,
  number: `ENQ-${id}`,
  status,
  submittedAt,
  customerName: 'Asha',
  organizationName: null,
});
const ord = (id: string, o: Partial<DashOrder>): DashOrder => ({
  id,
  number: `DG-${id}`,
  status: 'confirmed',
  paymentStatus: 'unpaid',
  grandTotal: 1000,
  paidAmount: 0,
  createdAt: '2026-11-21T00:00:00Z',
  customerName: null,
  organizationName: 'Ward 12',
  ...o,
});

describe('dashboardStats', () => {
  it('is all zeros with no data', () => {
    const s = dashboardStats([], []);
    expect(s).toMatchObject({ actions: [], activeOrders: 0, received: 0, outstanding: 0, newEnquiries: 0 });
  });

  it('puts approved quotations and payments to verify first', () => {
    const s = dashboardStats(
      [enq('1', 'submitted', '2026-11-01T00:00:00Z'), enq('2', 'approved'), enq('3', 'quoted'), enq('4', 'converted_to_order')],
      [ord('a', { paymentStatus: 'under_review' }), ord('b', {})],
    );
    expect(s.actions.map((a) => a.reason)).toEqual(['Approved, create order', 'Payment to verify', 'New enquiry']);
    expect(s.actions[2].who).toBe('Asha');
    expect(s.actions[1].who).toBe('Ward 12');
    expect(s.withCustomer).toBe(1);
    expect(s.newEnquiries).toBe(1);
  });

  it('sums money without cancelled orders and never counts overpayment as negative', () => {
    const s = dashboardStats(
      [],
      [
        ord('a', { grandTotal: 1000, paidAmount: 400 }),
        ord('b', { grandTotal: 500, paidAmount: 600, status: 'completed' }),
        ord('c', { grandTotal: 9999, paidAmount: 100, status: 'cancelled' }),
        ord('d', { status: 'out_for_delivery' }),
      ],
    );
    expect(s.received).toBe(1000);
    expect(s.outstanding).toBe(600 + 1000);
    expect(s.activeOrders).toBe(2);
    expect(s.completed).toBe(1);
    expect(s.toDeliver).toBe(1);
  });
});

describe('compactINR', () => {
  it.each([
    [0, '₹0'],
    [950, '₹950'],
    [12500, '₹12.5K'],
    [100000, '₹1L'],
    [2450000, '₹24.5L'],
    [12345678, '₹1.2Cr'],
    [1500000000, '₹150Cr'],
  ])('%d → %s', (n, out) => expect(compactINR(n)).toBe(out));
});
