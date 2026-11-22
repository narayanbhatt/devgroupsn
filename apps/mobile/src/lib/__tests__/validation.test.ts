import { describe, expect, it } from '@jest/globals';

import { isEmail, isGstin, isIndianMobile, isOtp, isPincode, passwordProblem } from '../validation';

describe('validation', () => {
  it('checks email addresses', () => {
    expect(isEmail('buyer@example.com')).toBe(true);
    expect(isEmail(' buyer@example.co.in ')).toBe(true);
    expect(isEmail('buyer@')).toBe(false);
    expect(isEmail('buyer example.com')).toBe(false);
  });

  it('requires 8+ character passwords', () => {
    expect(passwordProblem('short')).not.toBeNull();
    expect(passwordProblem('longenough')).toBeNull();
  });

  it('accepts Indian mobile numbers', () => {
    expect(isIndianMobile('9876543210')).toBe(true);
    expect(isIndianMobile('+91 98765 43210')).toBe(true);
    expect(isIndianMobile('1234567890')).toBe(false);
    expect(isIndianMobile('98765')).toBe(false);
  });

  it('checks GSTIN format', () => {
    expect(isGstin('29ABCDE1234F1Z5')).toBe(true);
    expect(isGstin('29abcde1234f1z5')).toBe(true);
    expect(isGstin('29ABCDE1234F1X5')).toBe(false);
    expect(isGstin('ABCDE1234F')).toBe(false);
  });

  it('checks PIN codes and OTPs', () => {
    expect(isPincode('560001')).toBe(true);
    expect(isPincode('060001')).toBe(false);
    expect(isOtp('123456')).toBe(true);
    expect(isOtp('12345')).toBe(false);
  });
});
