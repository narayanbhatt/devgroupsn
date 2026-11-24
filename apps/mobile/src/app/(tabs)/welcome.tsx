import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EnquiryRow } from '@/components/commercial';
import { Body, H1, SectionTitle } from '@/components/ui';
import type { EnquiryStatus } from '@/data/commercial';
import { fetchMyEnquiries, type EnquirySummary } from '@/data/enquiries';
import { useAuth } from '@/lib/auth';
import { useBasket } from '@/lib/basket';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

const CLOSED: EnquiryStatus[] = ['converted_to_order', 'rejected', 'cancelled', 'expired'];

/** C02 Welcome: what's in progress first (§10). The catalogue is the first tab. */
export default function WelcomeScreen() {
  const { profile } = useAuth();
  const { count } = useBasket();
  const [enquiries, setEnquiries] = useState<EnquirySummary[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isSupabaseConfigured || !profile) return;
      let cancelled = false;
      fetchMyEnquiries(profile.id)
        .then((l) => !cancelled && setEnquiries(l))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [profile]),
  );

  const open = (enquiries ?? []).filter((e) => !CLOSED.includes(e.status));
  const quoted = open.filter((e) => e.status === 'quoted');
  const others = open.filter((e) => e.status !== 'quoted');
  const firstName = profile?.full_name?.split(' ')[0];

  const actions: { label: string; go: () => void }[] = [
    { label: count > 0 ? 'Continue enquiry' : 'Start an enquiry', go: () => (count > 0 ? router.push('/enquiry') : router.navigate('/')) },
    { label: 'Browse catalogue', go: () => router.navigate('/') },
    { label: 'Enquiries and orders', go: () => router.navigate('/orders') },
    { label: 'Chat with DEV', go: () => router.navigate('/chat') },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
      <H1>{firstName ? `Welcome, ${firstName}` : 'Welcome'}</H1>
      <Body muted>Infrastructure products and project services.</Body>

      {!isSupabaseConfigured && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Demo mode: showing sample catalogue data.</Text>
        </View>
      )}

      {count > 0 && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/enquiry')} style={styles.basket}>
          <Text style={[type.body, { color: colors.textOnBrand, fontWeight: '600', flex: 1 }]}>
            {count} product{count === 1 ? '' : 's'} in a new enquiry, not sent yet
          </Text>
          <Text style={[type.body, { color: colors.textOnBrand }]}>Review ›</Text>
        </Pressable>
      )}

      <SectionTitle>Quotations to review</SectionTitle>
      {quoted.length > 0 ? (
        quoted.map((e) => <EnquiryRow key={e.id} item={e} />)
      ) : (
        <View style={styles.card}>
          <Body muted>No quotations waiting for you. Add products to an enquiry to get a quote.</Body>
        </View>
      )}

      <SectionTitle>Your open enquiries</SectionTitle>
      {others.length > 0 ? (
        <>
          {others.slice(0, 3).map((e) => (
            <EnquiryRow key={e.id} item={e} />
          ))}
          {others.length > 3 && (
            <Pressable accessibilityRole="link" onPress={() => router.navigate('/orders')} style={{ padding: spacing.sm }}>
              <Text style={[type.body, { color: colors.info, textAlign: 'center' }]}>See all {others.length} enquiries</Text>
            </Pressable>
          )}
        </>
      ) : (
        <View style={styles.card}>
          <Body muted>{enquiries ? 'No open enquiries.' : 'Your enquiries show here once you send one.'}</Body>
        </View>
      )}

      <SectionTitle>Active order</SectionTitle>
      <View style={styles.card}>
        <Body muted>No active orders yet.</Body>
      </View>

      <SectionTitle>Quick actions</SectionTitle>
      <View style={styles.actions}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={a.go}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  card: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  basket: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  notice: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#E8F0FB',
  },
  noticeText: { ...type.caption, color: colors.info },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: {
    minHeight: minTouch,
    flexBasis: '48%',
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  actionLabel: { ...type.body, fontWeight: '600', color: colors.brandPrimary },
});
