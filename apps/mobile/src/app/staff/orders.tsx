import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { StatusPill } from '@/components/commercial';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { ENQUIRY_STATUS_STAFF, formatDate, OPEN_FOR_STAFF, type EnquiryStatus, type Tone } from '@/data/commercial';
import { fetchAllEnquiries, type EnquirySummary } from '@/data/enquiries';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

type Filter = 'open' | 'quoted' | 'closed' | 'all';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'To do' },
  { value: 'quoted', label: 'With customer' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];
const WITH_CUSTOMER: EnquiryStatus[] = ['quoted'];
// Approved enquiries still need the team to create the order.
const TO_DO: EnquiryStatus[] = [...OPEN_FOR_STAFF, 'approved'];

const TONE: Partial<Record<EnquiryStatus, Tone>> = {
  submitted: 'action',
  revision_requested: 'action',
  requirement_clarification: 'warning',
  quoted: 'info',
  approved: 'action',
  converted_to_order: 'success',
};

function matches(f: Filter, s: EnquiryStatus) {
  if (f === 'all') return true;
  if (f === 'open') return TO_DO.includes(s);
  if (f === 'quoted') return WITH_CUSTOMER.includes(s);
  return !TO_DO.includes(s) && !WITH_CUSTOMER.includes(s);
}

/** A02 (enquiry part): every enquiry, newest first, with what needs action on top. */
export default function StaffEnquiriesScreen() {
  const [list, setList] = useState<EnquirySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    let cancelled = false;
    fetchAllEnquiries()
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
      (e) =>
        matches(filter, e.status) &&
        (!q ||
          e.number.toLowerCase().includes(q) ||
          (e.customerName ?? '').toLowerCase().includes(q) ||
          (e.organizationName ?? '').toLowerCase().includes(q) ||
          (e.projectName ?? '').toLowerCase().includes(q)),
    );
  }, [list, filter, query]);

  if (error && !list) return <ErrorState message={error} onRetry={load} />;
  if (!list) return <LoadingState />;
  const count = (f: Filter) => list.filter((e) => matches(f, e.status)).length;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search number, customer, organization, project"
          placeholderTextColor={colors.textSecondary}
          style={styles.search}
          accessibilityLabel="Search enquiries"
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
        keyExtractor={(e) => e.id}
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
        ListEmptyComponent={<EmptyState title="Nothing here" hint={filter === 'open' ? 'No enquiries waiting for the team.' : undefined} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/staff-enquiry/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
              <Text style={[type.body, { color: colors.textPrimary, fontWeight: '700' }]}>{item.number}</Text>
              <StatusPill label={ENQUIRY_STATUS_STAFF[item.status]} tone={TONE[item.status] ?? 'neutral'} />
            </View>
            <Text style={[type.body, { color: colors.textPrimary }]}>
              {item.organizationName || item.customerName || 'Customer'}
              {item.projectName ? ` · ${item.projectName}` : ''}
            </Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {item.itemCount} product{item.itemCount === 1 ? '' : 's'} · {formatDate(item.submittedAt)}
            </Text>
          </Pressable>
        )}
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
  row: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
});
