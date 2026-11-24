import { describe, expect, it } from '@jest/globals';

import { amountDue, canRecordPayment, orderStages, safeFileName } from '../order-rules';

describe('orderStages', () => {
  it('marks earlier stages done and the current one current', () => {
    const s = orderStages('processing', []);
    expect(s.slice(0, 4).map((x) => x.state)).toEqual(['done', 'done', 'current', 'todo']);
  });
  it('shows a completed order as all done', () => {
    expect(orderStages('completed', []).every((x) => x.state === 'done')).toBe(true);
  });
  it('keeps the stages a cancelled order reached', () => {
    const s = orderStages('cancelled', ['payment_pending', 'confirmed']);
    expect(s.map((x) => x.state)).toEqual(['done', 'done', 'todo', 'todo', 'todo', 'todo', 'todo']);
  });
});

describe('payments', () => {
  it('works out what is still due', () => {
    expect(amountDue(26960, 10000)).toBe(16960);
    expect(amountDue(100, 150)).toBe(0);
  });
  it('lets the customer pay only while something is due and not already being checked', () => {
    expect(canRecordPayment('payment_pending', 1000, 0, 0)).toBe(true);
    expect(canRecordPayment('payment_pending', 1000, 0, 1000)).toBe(false);
    expect(canRecordPayment('cancelled', 1000, 0, 0)).toBe(false);
    expect(canRecordPayment('confirmed', 1000, 1000, 0)).toBe(false);
  });
});

describe('safeFileName', () => {
  it('keeps the extension and drops odd characters', () => {
    expect(safeFileName('PO 12/2026 (final).PDF')).toBe('PO-12-2026-final.pdf');
    expect(safeFileName('???.jpg')).toBe('file.jpg');
  });
});
