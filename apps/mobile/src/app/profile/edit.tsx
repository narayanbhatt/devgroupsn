import { router } from 'expo-router';
import { useState } from 'react';

import { ChoiceField, FormError, FormScreen, TextField } from '@/components/form';
import { CTAButton } from '@/components/ui';
import { useAuth, type CustomerType } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isIndianMobile } from '@/lib/validation';

const TYPES: { value: CustomerType; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'business', label: 'Business' },
  { value: 'government', label: 'Government' },
  { value: 'institution', label: 'Institution' },
  { value: 'contractor', label: 'Contractor' },
];

export default function EditProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [customerType, setCustomerType] = useState<CustomerType>(profile?.customer_type ?? 'individual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (!name.trim()) return setError('Enter your name.');
    if (phone.trim() && !isIndianMobile(phone)) return setError('Enter a 10-digit mobile number.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase!
      .from('profiles')
      .update({ full_name: name.trim(), phone: phone.trim() || null, customer_type: customerType })
      .eq('id', profile!.id);
    setBusy(false);
    if (e) return setError(friendlyError(e));
    await refreshProfile();
    router.back();
  }

  return (
    <FormScreen>
      <FormError message={error} />
      <TextField label="Full name" value={name} onChangeText={setName} autoComplete="name" />
      <TextField label="Email" value={profile?.email ?? ''} editable={false} hint="Contact DEV Group to change your email." />
      <TextField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <ChoiceField label="Buying as" value={customerType} options={TYPES} onChange={setCustomerType} />
      <CTAButton label={busy ? 'Saving…' : 'Save'} onPress={onSave} disabled={busy} />
    </FormScreen>
  );
}
