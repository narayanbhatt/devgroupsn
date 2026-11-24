import { router } from 'expo-router';
import { useState } from 'react';

import { FormError, FormScreen, TextField } from '@/components/form';
import { Body, CTAButton } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { authRedirectUrl } from '@/lib/auth-link';
import { supabase } from '@/lib/supabase';
import { isEmail } from '@/lib/validation';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend() {
    if (!isEmail(email)) return setError('Enter a valid email address.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() });
    setBusy(false);
    if (e) return setError(friendlyError(e));
    router.push({ pathname: '/verify', params: { email: email.trim(), kind: 'recovery' } });
  }

  return (
    <FormScreen>
      <Body muted>Enter your account email. We’ll send a code to reset your password.</Body>
      <FormError message={error} />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <CTAButton label={busy ? 'Sending…' : 'Send code'} onPress={onSend} disabled={busy} />
    </FormScreen>
  );
}
