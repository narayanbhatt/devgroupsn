import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FormError, FormNotice, FormScreen, LinkButton, TextField } from '@/components/form';
import { CTAButton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isEmail } from '@/lib/validation';

export default function SignInScreen() {
  const { notice, clearNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    clearNotice();
    if (!isEmail(email)) return setError('Enter a valid email address.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) {
      if (e.message.toLowerCase().includes('email not confirmed')) {
        // Don't send another email on every attempt: the mail service allows only a few an hour.
        // The next screen has a "Resend email" button for when it's really needed.
        router.push({ pathname: '/verify', params: { email: email.trim(), kind: 'signup' } });
        return;
      }
      setError(friendlyError(e));
    }
    // On success the root layout switches to the app automatically.
  }

  return (
    <FormScreen>
      <FormNotice message={notice} />
      <FormError message={error} />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <CTAButton label={busy ? 'Signing in…' : 'Sign in'} onPress={onSignIn} disabled={busy} />
      <LinkButton label="Forgot password?" onPress={() => router.push('/forgot')} />
      <View style={{ flex: 1 }} />
      <LinkButton label="New to DEV Group? Create an account" onPress={() => router.replace('/register')} />
    </FormScreen>
  );
}
