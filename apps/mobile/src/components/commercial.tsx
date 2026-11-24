import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ENQUIRY_STATUS, formatDate, type Tone } from '@/data/commercial';
import type { EnquirySummary, Quotation } from '@/data/enquiries';
import { formatINR } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme/tokens';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceSecondary, fg: colors.textSecondary },
  info: { bg: '#E8F0FB', fg: colors.info },
  action: { bg: '#FDEBDD', fg: '#B54708' },
  success: { bg: '#E6F4EA', fg: colors.success },
  warning: { bg: '#FFF4E0', fg: colors.warning },
  error: { bg: '#FDECEA', fg: colors.error },
};

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const c = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function MoneyRow({ label, amount, strong, minus }: { label: string; amount: number; strong?: boolean; minus?: boolean }) {
  return (
    <View style={styles.moneyRow}>
      <Text style={[strong ? type.h3 : type.body, { color: strong ? colors.textPrimary : colors.textSecondary }]}>{label}</Text>
      <Text style={[strong ? type.h3 : type.body, { color: colors.textPrimary, fontWeight: strong ? '700' : '500' }]}>
        {minus ? '− ' : ''}
        {formatINR(amount)}
      </Text>
    </View>
  );
}

/** Line items and totals of a quotation, as the customer sees them (§17). */
export function QuotationBreakdown({ q }: { q: Quotation }) {
  return (
    <View style={styles.card}>
      {q.items.map((i) => (
        <View key={i.id} style={styles.line}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]}>{i.description}</Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {i.quantity} {i.unit} × {formatINR(i.unitPrice)} · GST {i.taxRate}%
            </Text>
          </View>
          <Text style={[type.body, { color: colors.textPrimary }]}>{formatINR(i.lineTotal)}</Text>
        </View>
      ))}
      <View style={styles.totals}>
        <MoneyRow label="Subtotal" amount={q.subtotal} />
        <MoneyRow label="GST" amount={q.tax} />
        {q.delivery > 0 && <MoneyRow label="Delivery" amount={q.delivery} />}
        {q.installation > 0 && <MoneyRow label="Installation" amount={q.installation} />}
        {q.otherCharges > 0 && <MoneyRow label="Other charges" amount={q.otherCharges} />}
        {q.discount > 0 && <MoneyRow label="Discount" amount={q.discount} minus />}
        <View style={styles.divider} />
        <MoneyRow label="Total" amount={q.grandTotal} strong />
      </View>
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.kv}>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[type.body, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

export const cardStyle = {
  backgroundColor: colors.surfacePrimary,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
  padding: spacing.lg,
  gap: spacing.sm,
} as const;

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  pillText: { ...type.caption, fontWeight: '700' },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  card: cardStyle,
  line: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  totals: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  kv: { gap: 2 },
});

/** One sent enquiry in a list; opens its detail. */
export function EnquiryRow({ item, highlight }: { item: EnquirySummary; highlight?: boolean }) {
  const s = ENQUIRY_STATUS[item.status];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/enquiries/[id]', params: { id: item.id } })}
      style={({ pressed }) => [cardStyle, highlight && { borderColor: colors.success, borderWidth: 2 }, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text style={[type.body, { color: colors.textPrimary, fontWeight: '700' }]}>{item.number}</Text>
        <StatusPill label={s.label} tone={s.tone} />
      </View>
      {item.projectName ? <Text style={[type.body, { color: colors.textPrimary }]}>{item.projectName}</Text> : null}
      <Text style={[type.caption, { color: colors.textSecondary }]}>
        {item.itemCount} product{item.itemCount === 1 ? '' : 's'} · Sent {formatDate(item.submittedAt)}
        {item.organizationName ? ` · ${item.organizationName}` : ''}
      </Text>
    </Pressable>
  );
}
