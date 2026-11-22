import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceField, FormError, FormScreen, TextField } from '@/components/form';
import { Body, CTAButton, ErrorState, LoadingState, SecondaryButton, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isPincode } from '@/lib/validation';
import { colors, radius, spacing, type } from '@/theme/tokens';

type Kind = 'billing' | 'delivery' | 'site';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'billing', label: 'Billing' },
  { value: 'site', label: 'Project site' },
];

interface Address {
  id: string;
  kind: Kind;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
}

const EMPTY = { label: '', line1: '', line2: '', city: '', state: '', pincode: '' };

export default function AddressesScreen() {
  const { profile } = useAuth();
  const [list, setList] = useState<Address[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Kind>('delivery');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    supabase!
      .from('addresses')
      .select('id, kind, label, line1, line2, city, state, pincode')
      .eq('user_id', profile!.id)
      .order('created_at')
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) return setLoadError(friendlyError(e));
        setLoadError(null);
        setList(data as Address[]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, reloadKey]);

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onAdd() {
    if (!form.line1.trim() || !form.city.trim() || !form.state.trim()) {
      return setError('Fill in the address, city and state.');
    }
    if (!isPincode(form.pincode)) return setError('Enter a 6-digit PIN code.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase!.from('addresses').insert({
      user_id: profile!.id,
      kind,
      label: form.label.trim() || null,
      line1: form.line1.trim(),
      line2: form.line2.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
    });
    setBusy(false);
    if (e) return setError(friendlyError(e));
    setForm(EMPTY);
    setAdding(false);
    load();
  }

  function onDelete(a: Address) {
    Alert.alert('Remove address?', `${a.line1}, ${a.city}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase!.from('addresses').delete().eq('id', a.id);
          if (e) Alert.alert('Could not remove', friendlyError(e));
          load();
        },
      },
    ]);
  }

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!list) return <LoadingState />;

  return (
    <FormScreen>
      {list.length === 0 && !adding && <Body muted>No saved addresses yet.</Body>}
      {list.map((a) => (
        <View key={a.id} style={styles.card}>
          <Text style={styles.kind}>{KINDS.find((k) => k.value === a.kind)?.label}{a.label ? ` · ${a.label}` : ''}</Text>
          <Text style={[type.body, { color: colors.textPrimary }]}>
            {a.line1}
            {a.line2 ? `, ${a.line2}` : ''}
          </Text>
          <Text style={[type.body, { color: colors.textSecondary }]}>
            {a.city}, {a.state} {a.pincode}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => onDelete(a)} hitSlop={8} style={styles.remove}>
            <Text style={[type.caption, { color: colors.error, fontWeight: '600' }]}>Remove</Text>
          </Pressable>
        </View>
      ))}

      {adding ? (
        <>
          <SectionTitle>New address</SectionTitle>
          <FormError message={error} />
          <ChoiceField label="Use for" value={kind} options={KINDS} onChange={setKind} />
          <TextField label="Label (optional)" value={form.label} onChangeText={set('label')} placeholder="e.g. Head office" />
          <TextField label="Address line 1" value={form.line1} onChangeText={set('line1')} />
          <TextField label="Address line 2 (optional)" value={form.line2} onChangeText={set('line2')} />
          <TextField label="City" value={form.city} onChangeText={set('city')} />
          <TextField label="State" value={form.state} onChangeText={set('state')} />
          <TextField label="PIN code" value={form.pincode} onChangeText={set('pincode')} keyboardType="number-pad" maxLength={6} />
          <CTAButton label={busy ? 'Saving…' : 'Save address'} onPress={onAdd} disabled={busy} />
          <SecondaryButton label="Cancel" onPress={() => setAdding(false)} />
        </>
      ) : (
        <SecondaryButton label="Add an address" onPress={() => setAdding(true)} />
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  kind: { ...type.caption, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
  remove: { alignSelf: 'flex-start', marginTop: spacing.sm, minHeight: 32, justifyContent: 'center' },
});
