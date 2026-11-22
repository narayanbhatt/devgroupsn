import { useState } from 'react';

import { FormError, FormScreen, LinkButton, TextField } from '@/components/form';
import { Body, CTAButton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { passwordProblem } from '@/lib/validation';

export default function NewPasswordScreen() {
  const { setRecoveryPending, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (e) return setError(friendlyError(e));
    setRecoveryPending(false); // opens the app
  }

  return (
    <FormScreen>
      <Body muted>Choose a new password for your account.</Body>
      <FormError message={error} />
      <TextField label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
      <CTAButton label={busy ? 'Saving…' : 'Save password'} onPress={onSave} disabled={busy} />
      <LinkButton label="Cancel" onPress={signOut} />
    </FormScreen>
  );
}
