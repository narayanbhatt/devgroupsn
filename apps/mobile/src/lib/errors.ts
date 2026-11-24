/**
 * Turn backend errors into messages a customer can act on.
 * Raw database or API errors are never shown (design doc §48).
 */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : '';
  const msg = raw.toLowerCase();
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';

  // Our own database functions explain the problem in plain words (codes 22023 and 42501).
  if ((code === '22023' || code === '42501') && raw && !msg.includes('permission denied') && !msg.includes('row-level security')) {
    return raw;
  }

  if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
    return 'No internet connection. Check your connection and try again.';
  }
  if (msg.includes('invalid login credentials')) return 'That email and password don’t match.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email first. Tap the link we emailed you.';
  if (msg.includes('user already registered')) return 'An account with this email already exists. Try signing in.';
  if (msg.includes('token has expired') || msg.includes('otp_expired') || msg.includes('expired')) {
    return 'That code has expired. Request a new one.';
  }
  if (msg.includes('invalid') && (msg.includes('otp') || msg.includes('token'))) {
    return 'That code is not correct. Check it and try again.';
  }
  // Supabase's built-in mail service only sends a few emails an hour for the whole app.
  if (code === 'over_email_send_rate_limit' || msg.includes('email rate limit')) {
    return 'We can’t send another email right now because too many were sent in the last hour. Please try again later.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (msg.includes('password') && msg.includes('should be')) return 'Choose a password of at least 8 characters.';
  if (msg.includes('jwt expired') || msg.includes('refresh token')) return 'Your session has expired. Please sign in again.';
  if (msg.includes('row-level security') || msg.includes('permission denied')) {
    return 'You don’t have permission to do that.';
  }
  return 'Something went wrong. Please try again.';
}
