import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormError, FormNotice, FormScreen, LinkButton, TextField } from '@/components/form';
import { Body, CTAButton, SecondaryButton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { authRedirectUrl } from '@/lib/auth-link';
import { supabase } from '@/lib/supabase';
import { isOtp } from '@/lib/validation';

/** Seconds before another email can be requested (Supabase also rate-limits). */
const RESEND_WAIT = 60;

/**
 * "Check your email" after sign-up, an unconfirmed sign-in, or a password reset.
 * The email's link opens the app and signs in (auth-link.ts); a 6-digit code is the
 * fallback when the email template includes one, so it stays tucked away.
 */
export default function VerifyScreen() {
  const { email, kind } = useLocalSearchParams<{ email: string; kind: 'signup' | 'recovery' }>();
  const { setRecoveryPending } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function onVerify() {
    if (!isOtp(code)) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    setError(null);
    // Keep the reset flow on the auth screens until a new password is chosen.
    if (kind === 'recovery') setRecoveryPending(true);
    const { error: e } = await supabase!.auth.verifyOtp({ email, token: code.trim(), type: kind });
    setBusy(false);
    if (e) {
      if (kind === 'recovery') setRecoveryPending(false);
      return setError(friendlyError(e));
    }
    if (kind === 'recovery') router.replace('/new-password');
    // For sign-up, the root layout opens the app once the session exists.
  }

  async function onResend() {
    if (wait > 0) return;
    setError(null);
    setWait(RESEND_WAIT);
    const { error: e } =
      kind === 'recovery'
        ? await supabase!.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() })
        : await supabase!.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirectUrl() } });
    if (e) return setError(friendlyError(e));
    setNotice('We sent a new email. It can take a minute to arrive; check spam too.');
  }

  const reset = kind === 'recovery';
  return (
    <FormScreen>
      <Body>
        We sent {reset ? 'a password reset link' : 'a confirmation link'} to {email}. Open the email on this phone and tap the link.
        {reset ? ' The app will open so you can choose a new password.' : ' The app will open and sign you in.'}
      </Body>
      <Body muted>Can’t find it? Check your spam or promotions folder.</Body>
      <FormNotice message={notice} />
      <FormError message={error} />
      <SecondaryButton label={wait > 0 ? `Resend email in ${wait}s` : 'Resend email'} onPress={onResend} />
      {!reset && <LinkButton label="Confirmed on another device? Sign in" onPress={() => router.replace('/sign-in')} />}
      {showCode ? (
        <View style={{ gap: 12 }}>
          <TextField
            label="6-digit code from the email"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
          />
          <CTAButton label={busy ? 'Checking…' : 'Verify code'} onPress={onVerify} disabled={busy} />
        </View>
      ) : (
        <LinkButton label="Email has a code instead? Enter it" onPress={() => setShowCode(true)} />
      )}
      <LinkButton label="Wrong email? Go back" onPress={() => router.back()} />
    </FormScreen>
  );
}
