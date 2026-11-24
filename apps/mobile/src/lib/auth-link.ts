import * as Linking from 'expo-linking';

/**
 * Where Supabase sends people after they tap the link in a sign-up or reset email.
 * On a phone with the app installed this opens the app (devgroup://auth/callback).
 * It must be listed under Authentication › URL Configuration › Redirect URLs.
 */
export const authRedirectUrl = () => Linking.createURL('auth/callback');

export type AuthCallback =
  | { kind: 'session'; accessToken: string; refreshToken: string; type: string | null }
  | { kind: 'error'; message: string };

/**
 * Reads the tokens (or error) Supabase puts in the link it opens:
 * devgroup://auth/callback#access_token=…&refresh_token=…&type=signup
 * Returns null for any other link.
 */
export function parseAuthCallback(url: string | null): AuthCallback | null {
  if (!url || !/auth\/callback/.test(url)) return null;
  const params = new URLSearchParams();
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  if (query >= 0) new URLSearchParams(url.slice(query + 1, hash > query ? hash : undefined)).forEach((v, k) => params.set(k, v));
  if (hash >= 0) new URLSearchParams(url.slice(hash + 1)).forEach((v, k) => params.set(k, v));

  const error = params.get('error_description') ?? params.get('error');
  if (error) {
    const expired = /expired|invalid/i.test(error) || params.get('error_code') === 'otp_expired';
    return {
      kind: 'error',
      message: expired
        ? 'That link has expired or was already used. Sign in, or ask for a new email.'
        : 'That link didn’t work. Sign in, or ask for a new email.',
    };
  }
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken, type: params.get('type') };
  return null;
}
