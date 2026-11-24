import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { OrderRow } from '@/components/orders';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { fetchAllOrders, type OrderSummary } from '@/data/orders';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

type Filter = 'active' | 'verify' | 'unpaid' | 'done' | 'all';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'verify', label: 'Payment to verify' },
  { value: 'unpaid', label: 'Money due' },
  { value: 'done', label: 'Closed' },
  { value: 'all', label: 'All' },
];

const CLOSED = ['completed', 'cancelled'];

function matches(f: Filter, o: OrderSummary) {
  switch (f) {
    case 'active':
      return !CLOSED.includes(o.status);
    case 'verify':
      return o.paymentStatus === 'under_review';
    case 'unpaid':
      return o.status !== 'cancelled' && o.paidAmount < o.grandTotal;
    case 'done':
      return CLOSED.includes(o.status);
    default:
      return true;
  }
}

/** A02 (order part): every order with filters for status and payment (§29). */
export default function StaffOrdersScreen() {
  const [list, setList] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    let cancelled = false;
    fetchAllOrders()
      .then((l) => {
        if (cancelled) return;
        setList(l);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, []);
  useFocusEffect(load);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter(
      (o) =>
        matches(filter, o) &&
        (!q ||
          o.number.toLowerCase().includes(q) ||
          (o.customerName ?? '').toLowerCase().includes(q) ||
          (o.organizationName ?? '').toLowerCase().includes(q) ||
          (o.projectName ?? '').toLowerCase().includes(q)),
    );
  }, [list, filter, query]);

  if (error && !list) return <ErrorState message={error} onRetry={load} />;
  if (!list) return <LoadingState />;
  const count = (f: Filter) => list.filter((o) => matches(f, o)).length;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search number, customer, organization, project"
          placeholderTextColor={colors.textSecondary}
          style={styles.search}
          accessibilityLabel="Search orders"
        />
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.value}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f.value }}
              onPress={() => setFilter(f.value)}
              style={[styles.chip, filter === f.value && styles.chipSelected]}>
              <Text style={[styles.chipLabel, filter === f.value && { color: colors.textOnBrand }]}>
                {f.label} {count(f.value)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        data={visible}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            colors={[colors.brandSecondary]}
          />
        }
        ListEmptyComponent={
          <EmptyState title="No orders here" hint="Orders appear when an approved quotation is turned into an order." />
        }
        renderItem={({ item }) => <OrderRow item={item} staff />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surfacePrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  search: {
    minHeight: minTouch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSecondary,
    ...type.body,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 32, paddingHorizontal: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipLabel: { ...type.caption, color: colors.textPrimary, fontWeight: '600' },
});
