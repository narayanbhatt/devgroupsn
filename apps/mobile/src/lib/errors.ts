/**
 * Turn backend errors into messages a customer can act on.
 * Raw database or API errors are never shown (design doc §48).
 */
export function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : '')
    .toLowerCase();

  if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
    return 'No internet connection. Check your connection and try again.';
  }
  if (msg.includes('invalid login credentials')) return 'That email and password don’t match.';
  if (msg.includes('email not confirmed')) return 'Please verify your email first. We sent you a code.';
  if (msg.includes('user already registered')) return 'An account with this email already exists. Try signing in.';
  if (msg.includes('token has expired') || msg.includes('otp_expired') || msg.includes('expired')) {
    return 'That code has expired. Request a new one.';
  }
  if (msg.includes('invalid') && (msg.includes('otp') || msg.includes('token'))) {
    return 'That code is not correct. Check it and try again.';
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
