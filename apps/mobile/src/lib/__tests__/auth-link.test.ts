import { describe, expect, it, jest } from '@jest/globals';

import { parseAuthCallback } from '../auth-link';

// Hoisted above the import by babel-jest.
jest.mock('expo-linking', () => ({ createURL: (p: string) => `devgroup://${p}` }));

describe('parseAuthCallback', () => {
  it('reads tokens from the link fragment', () => {
    expect(parseAuthCallback('devgroup://auth/callback#access_token=a&refresh_token=r&type=signup&expires_in=3600')).toEqual({
      kind: 'session',
      accessToken: 'a',
      refreshToken: 'r',
      type: 'signup',
    });
  });

  it('turns Supabase errors into a plain message', () => {
    const r = parseAuthCallback('devgroup://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(r).toEqual({ kind: 'error', message: expect.stringMatching(/expired or was already used/) });
  });

  it('ignores other links', () => {
    expect(parseAuthCallback('devgroup://product/123')).toBeNull();
    expect(parseAuthCallback(null)).toBeNull();
    expect(parseAuthCallback('devgroup://auth/callback')).toBeNull();
  });
});
