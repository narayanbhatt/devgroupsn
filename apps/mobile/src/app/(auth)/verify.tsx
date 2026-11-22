import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { FormError, FormNotice, FormScreen, LinkButton, TextField } from '@/components/form';
import { Body, CTAButton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isOtp } from '@/lib/validation';

/** OTP verification for sign-up and password reset. Handles invalid and expired codes. */
export default function VerifyScreen() {
  const { email, kind } = useLocalSearchParams<{ email: string; kind: 'signup' | 'recovery' }>();
  const { setRecoveryPending } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setError(null);
    const { error: e } =
      kind === 'recovery'
        ? await supabase!.auth.resetPasswordForEmail(email)
        : await supabase!.auth.resend({ type: 'signup', email });
    if (e) return setError(friendlyError(e));
    setNotice('We sent a new code.');
  }

  return (
    <FormScreen>
      <Body>We sent a 6-digit code to {email}. Enter it below.</Body>
      <FormNotice message={notice} />
      <FormError message={error} />
      <TextField
        label="Code"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
      />
      <CTAButton label={busy ? 'Checking…' : 'Verify'} onPress={onVerify} disabled={busy} />
      <LinkButton label="Send a new code" onPress={onResend} />
    </FormScreen>
  );
}
