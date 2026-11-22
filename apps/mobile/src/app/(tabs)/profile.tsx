import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, H1, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

const TYPE_LABEL: Record<string, string> = {
  individual: 'Individual',
  business: 'Business',
  government: 'Government',
  institution: 'Institution',
  contractor: 'Contractor',
};

/** C13 Profile / Organization. */
export default function ProfileScreen() {
  const { profile, isStaff, setStaffView, signOut } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.root}>
        <View style={{ padding: spacing.lg }}>
          <Body muted>Demo mode: sign-in is off until the app is connected to Supabase.</Body>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg }}>
      <H1>{profile?.full_name || 'Your account'}</H1>
      <Body muted>
        {profile?.email} · {TYPE_LABEL[profile?.customer_type ?? 'individual']}
      </Body>

      <SectionTitle>Account</SectionTitle>
      <View style={styles.group}>
        <Row icon="person-outline" label="Personal information" href="/profile/edit" />
        <Row icon="business-outline" label="Organization and GST" href="/profile/organization" />
        <Row icon="location-outline" label="Addresses" href="/profile/addresses" last />
      </View>

      {isStaff && (
        <>
          <SectionTitle>Staff</SectionTitle>
          <View style={styles.group}>
            <Row icon="briefcase-outline" label="Switch to staff view" onPress={() => setStaffView(true)} last />
          </View>
        </>
      )}

      <SectionTitle>Support</SectionTitle>
      <View style={styles.group}>
        <Row icon="chatbubbles-outline" label="Help and support" onPress={() => router.navigate('/chat')} last />
      </View>

      <View style={[styles.group, { marginTop: spacing.xl }]}>
        <Row icon="log-out-outline" label="Sign out" onPress={signOut} danger last />
      </View>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  href,
  onPress,
  danger,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  href?: Href;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress ?? (() => href && router.push(href))}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { backgroundColor: colors.surfaceSecondary }]}>
      <Ionicons name={icon} size={20} color={danger ? colors.error : colors.brandPrimary} />
      <Text style={[type.body, { flex: 1, color: danger ? colors.error : colors.textPrimary }]}>{label}</Text>
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  group: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: minTouch + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
