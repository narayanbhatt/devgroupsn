import { describe, expect, it } from '@jest/globals';

import { friendlyError } from '../errors';

describe('friendlyError', () => {
  it('maps common auth errors to plain messages', () => {
    expect(friendlyError(new Error('Invalid login credentials'))).toMatch(/don’t match/);
    expect(friendlyError(new Error('Token has expired or is invalid'))).toMatch(/expired/);
    expect(friendlyError(new Error('Network request failed'))).toMatch(/No internet/);
    expect(friendlyError({ message: 'User already registered' })).toMatch(/already exists/);
  });

  it('never shows raw database errors', () => {
    const msg = friendlyError(new Error('duplicate key value violates unique constraint "products_sku_key"'));
    expect(msg).toBe('Something went wrong. Please try again.');
    expect(friendlyError(new Error('new row violates row-level security policy'))).toMatch(/permission/);
  });
});
