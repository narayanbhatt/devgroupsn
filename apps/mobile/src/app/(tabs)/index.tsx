import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, H1, SectionTitle } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

const QUICK_ACTIONS: { label: string; go: () => void }[] = [
  { label: 'New Enquiry', go: () => router.navigate('/catalog') },
  { label: 'View Catalogue', go: () => router.navigate('/catalog') },
  { label: 'Track Order', go: () => router.navigate('/orders') },
  { label: 'Chat with DEV', go: () => router.navigate('/chat') },
];

/** C02 Home: active commercial activity first, marketing second (§10). */
export default function HomeScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg }}>
      <H1>Hello</H1>
      <Body muted>Infrastructure products and project services.</Body>

      {!isSupabaseConfigured && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Demo mode: showing sample catalogue data.</Text>
        </View>
      )}

      <SectionTitle>Active quotation</SectionTitle>
      <View style={styles.card}>
        <Body muted>No active quotations. Add products to an enquiry to get a quote.</Body>
      </View>

      <SectionTitle>Active order</SectionTitle>
      <View style={styles.card}>
        <Body muted>No active orders yet.</Body>
      </View>

      <SectionTitle>Quick actions</SectionTitle>
      <View style={styles.actions}>
        {QUICK_ACTIONS.map((a) => (
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
