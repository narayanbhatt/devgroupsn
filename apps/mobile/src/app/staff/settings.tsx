import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceField, FormError, FormScreen, TextField } from '@/components/form';
import { Body, CTAButton, H1, SecondaryButton, SectionTitle } from '@/components/ui';
import { hasRole, useAuth, type StaffRole } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isEmail } from '@/lib/validation';
import { colors, radius, spacing, type } from '@/theme/tokens';

const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  catalog_admin: 'Catalogue admin',
  order_manager: 'Order manager',
  project_manager: 'Project manager',
  finance: 'Finance',
  support_agent: 'Support agent',
};
const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

interface StaffRow {
  user_id: string;
  role: StaffRole;
  profiles: { full_name: string | null; email: string | null } | null;
}

/** Staff settings. Super admins manage who has which staff role (A17). */
export default function StaffSettingsScreen() {
  const { profile, staffRoles, setStaffView, signOut } = useAuth();
  const isSuper = hasRole(staffRoles, 'super_admin');

  return (
    <FormScreen>
      <H1>{profile?.full_name || profile?.email}</H1>
      <Body muted>Your roles: {staffRoles.map((r) => ROLE_LABEL[r]).join(', ')}</Body>
      <SecondaryButton label="Switch to customer view" onPress={() => setStaffView(false)} />
      {isSuper && <StaffMembers />}
      <View style={{ flex: 1 }} />
      <SecondaryButton label="Sign out" onPress={signOut} />
    </FormScreen>
  );
}

function StaffMembers() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('support_agent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    supabase!
      .from('staff_roles')
      .select('user_id, role, profiles!staff_roles_user_id_fkey(full_name, email)')
      .order('granted_at')
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) return setError(friendlyError(e));
        setRows(data as unknown as StaffRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function onGrant() {
    if (!isEmail(email)) return setError('Enter the staff member’s email.');
    setBusy(true);
    setError(null);
    // The person must have signed up in the app first; staff can't self-register.
    const { data: person, error: findError } = await supabase!
      .from('profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    if (findError || !person) {
      setBusy(false);
      return setError(findError ? friendlyError(findError) : 'No account with that email. Ask them to sign up in the app first.');
    }
    const { error: e } = await supabase!.from('staff_roles').insert({ user_id: person.id, role, granted_by: profile!.id });
    setBusy(false);
    if (e) return setError(e.code === '23505' ? 'They already have that role.' : friendlyError(e));
    setEmail('');
    load();
  }

  function onRemove(r: StaffRow) {
    if (r.user_id === profile!.id && r.role === 'super_admin') {
      return Alert.alert('Not allowed here', 'You can’t remove your own super admin role.');
    }
    Alert.alert('Remove role?', `${ROLE_LABEL[r.role]} for ${r.profiles?.email ?? 'this person'}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase!.from('staff_roles').delete().eq('user_id', r.user_id).eq('role', r.role);
          if (e) Alert.alert('Could not remove', friendlyError(e));
          load();
        },
      },
    ]);
  }

  return (
    <>
      <SectionTitle>Staff members</SectionTitle>
      {rows.map((r) => (
        <View key={`${r.user_id}-${r.role}`} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: colors.textPrimary }]}>{r.profiles?.full_name || r.profiles?.email}</Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {ROLE_LABEL[r.role]} · {r.profiles?.email}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => onRemove(r)} hitSlop={8}>
            <Text style={[type.caption, { color: colors.error, fontWeight: '600' }]}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <SectionTitle>Add a staff role</SectionTitle>
      <FormError message={error} />
      <TextField label="Their account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <ChoiceField label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
      <CTAButton label={busy ? 'Adding…' : 'Add role'} onPress={onGrant} disabled={busy} />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
});
