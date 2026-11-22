import { router } from 'expo-router';
import { useState } from 'react';

import { ChoiceField, FormError, FormScreen, LinkButton, TextField } from '@/components/form';
import { Body, CTAButton } from '@/components/ui';
import type { CustomerType } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isEmail, isIndianMobile, passwordProblem } from '@/lib/validation';

const TYPES: { value: CustomerType; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'business', label: 'Business' },
  { value: 'government', label: 'Government' },
  { value: 'institution', label: 'Institution' },
  { value: 'contractor', label: 'Contractor' },
];

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('individual');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onRegister() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Enter your name.';
    if (!isEmail(email)) next.email = 'Enter a valid email address.';
    if (phone.trim() && !isIndianMobile(phone)) next.phone = 'Enter a 10-digit mobile number.';
    const pw = passwordProblem(password);
    if (pw) next.password = pw;
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError(null);
    const { data, error } = await supabase!.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim(), phone: phone.trim() || null, customer_type: customerType } },
    });
    setBusy(false);
    if (error) return setFormError(friendlyError(error));
    // With email confirmation on (recommended), Supabase emails a 6-digit code.
    if (!data.session) router.push({ pathname: '/verify', params: { email: email.trim(), kind: 'signup' } });
  }

  return (
    <FormScreen>
      <Body muted>Create your account to request quotations, track orders and chat with DEV Group.</Body>
      <FormError message={formError} />
      <TextField label="Full name" value={name} onChangeText={setName} autoComplete="name" error={errors.name} />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={errors.email}
      />
      <TextField
        label="Mobile number (optional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        error={errors.phone}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        error={errors.password}
        hint="At least 8 characters."
      />
      <ChoiceField label="I am buying as" value={customerType} options={TYPES} onChange={setCustomerType} />
      <CTAButton label={busy ? 'Creating account…' : 'Create account'} onPress={onRegister} disabled={busy} />
      <LinkButton label="Already have an account? Sign in" onPress={() => router.replace('/sign-in')} />
    </FormScreen>
  );
}
