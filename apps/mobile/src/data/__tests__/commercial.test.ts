import { describe, expect, it } from '@jest/globals';

import {
  canAnswer,
  estimateBasket,
  formatDate,
  parseAmount,
  parseIndianDate,
  quotationTotals,
  todayInIndia,
} from '@/data/commercial';

describe('quotationTotals', () => {
  it('matches the database rule used in the tests', () => {
    const lines = [
      { quantity: 100, unitPrice: 2000, taxRate: 18 },
      { quantity: 50, unitPrice: 900, taxRate: 18 },
    ];
    expect(quotationTotals(lines, { discount: 1000, delivery: 5000, installation: 0, otherCharges: 0 })).toEqual({
      subtotal: 245000,
      tax: 44100,
      grandTotal: 293100,
    });
  });

  it('never goes below zero', () => {
    expect(quotationTotals([{ quantity: 1, unitPrice: 10, taxRate: 0 }], { discount: 50, delivery: 0, installation: 0, otherCharges: 0 }).grandTotal).toBe(0);
  });
});

describe('estimateBasket', () => {
  it('adds listed prices and counts unpriced items', () => {
    expect(estimateBasket([{ listedPrice: 2200, quantity: 100 }, { listedPrice: null, quantity: 3 }])).toEqual({ value: 220000, unpriced: 1 });
  });
});

describe('dates', () => {
  it('reads Indian-style dates', () => {
    expect(parseIndianDate('31/12/2026')).toBe('2026-12-31');
    expect(parseIndianDate('1-2-2027')).toBe('2027-02-01');
    expect(parseIndianDate('31/02/2026')).toBeNull();
    expect(parseIndianDate('2026-12-31')).toBeNull();
  });
  it('formats dates', () => {
    expect(formatDate('2026-11-30')).toBe('30 Nov 2026');
    expect(formatDate(null)).toBe('');
  });
  it('uses the Indian calendar day', () => {
    expect(todayInIndia(new Date('2026-11-24T20:00:00Z'))).toBe('2026-11-25');
  });
});

describe('canAnswer', () => {
  it('only while sent or viewed and not expired', () => {
    expect(canAnswer('sent', '2026-11-30', '2026-11-24')).toBe(true);
    expect(canAnswer('viewed', '2026-11-24', '2026-11-24')).toBe(true);
    expect(canAnswer('viewed', '2026-11-23', '2026-11-24')).toBe(false);
    expect(canAnswer('approved', '2026-11-30', '2026-11-24')).toBe(false);
  });
});

describe('parseAmount', () => {
  it('reads rupee amounts', () => {
    expect(parseAmount('1,25,000')).toBe(125000);
    expect(parseAmount('₹ 900.505')).toBe(900.51);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});
