import { describe, expect, it } from '@jest/globals';

import { formatINR } from '../format';

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(750)).toBe('₹750');
    expect(formatINR(2200)).toBe('₹2,200');
    expect(formatINR(29500)).toBe('₹29,500');
    expect(formatINR(5000000)).toBe('₹50,00,000');
    expect(formatINR(21000000)).toBe('₹2,10,00,000');
  });

  it('keeps paise only when present', () => {
    expect(formatINR(1234.5)).toBe('₹1,234.50');
    expect(formatINR(99.99)).toBe('₹99.99');
  });

  it('handles zero and negatives', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(-2200)).toBe('-₹2,200');
  });
});
