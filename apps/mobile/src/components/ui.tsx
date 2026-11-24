import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { formatINR } from '@/lib/format';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={[type.h1, { color: colors.textPrimary }]}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text style={[type.body, { color: muted ? colors.textSecondary : colors.textPrimary }]}>
      {children}
    </Text>
  );
}

export function CTAButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.cta,
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.5 },
      ]}>
      <Text style={styles.ctaLabel}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, pressed && { backgroundColor: colors.surfaceSecondary }]}>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

/** Listed price is always shown as indicative, never as the final quoted price (§12). */
export function PriceBlock({ amount, taxNote }: { amount: number | null; taxNote: string }) {
  if (amount == null) return <Body muted>Price on quotation</Body>;
  return (
    <View>
      <Text style={styles.price}>
        {formatINR(amount)} <Text style={styles.taxNote}>{taxNote}</Text>
      </Text>
      <Text style={styles.caption}>Listed price. Final price is set in your quotation.</Text>
    </View>
  );
}

export function LoadingState() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.brandPrimary} />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.centered}>
      <Body>{message}</Body>
      <View style={{ height: spacing.md }} />
      <SecondaryButton label="Retry" onPress={onRetry} />
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.centered}>
      <Text style={[type.h3, { color: colors.textPrimary, textAlign: 'center' }]}>{title}</Text>
      {hint ? (
        <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.lg },
  sectionTitle: {
    ...type.caption,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  cta: {
    minHeight: minTouch + 4,
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  // Full-width, centred labels: some Android phones (custom system fonts, large text)
  // measure bold text too narrow and drop the last word, e.g. "Add to Enquiry" → "Add to".
  ctaLabel: { ...type.body, fontWeight: '700', color: colors.textOnBrand, alignSelf: 'stretch', textAlign: 'center' },
  secondary: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryLabel: { ...type.body, fontWeight: '600', color: colors.brandPrimary, alignSelf: 'stretch', textAlign: 'center' },
  price: { ...type.h2, color: colors.textPrimary },
  taxNote: { ...type.body, color: colors.textSecondary },
  caption: { ...type.caption, color: colors.textSecondary, marginTop: spacing.xs },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
