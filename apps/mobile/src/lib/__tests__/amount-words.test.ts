import { describe, expect, it } from '@jest/globals';

import { indianWords, rupeesInWords } from '../amount-words';

describe('amount in words', () => {
  it('uses lakh and crore', () => {
    expect(indianWords(26960)).toBe('Twenty Six Thousand Nine Hundred Sixty');
    expect(indianWords(100000)).toBe('One Lakh');
    expect(indianWords(12500000)).toBe('One Crore Twenty Five Lakh');
    expect(indianWords(999999999)).toBe('Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine');
    expect(indianWords(1000000000)).toBe('One Hundred Crore');
    expect(indianWords(0)).toBe('Zero');
    expect(indianWords(101)).toBe('One Hundred One');
  });
  it('adds paise and rounds to the paisa', () => {
    expect(rupeesInWords(26960.5)).toBe('Rupees Twenty Six Thousand Nine Hundred Sixty and Fifty Paise Only');
    expect(rupeesInWords(0.07)).toBe('Rupees Zero and Seven Paise Only');
    expect(rupeesInWords(1.005)).toBe('Rupees One Only');
    expect(rupeesInWords(1999.999)).toBe('Rupees Two Thousand Only');
  });
});
