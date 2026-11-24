import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { StatusPill } from '@/components/commercial';
import { CTAButton, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { ENQUIRY_STATUS, formatDate } from '@/data/commercial';
import { fetchMyEnquiries, type EnquirySummary } from '@/data/enquiries';
import { useAuth } from '@/lib/auth';
import { useBasket } from '@/lib/basket';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, radius, spacing, type } from '@/theme/tokens';

/** Orders tab (C08). Until orders arrive in Phase 4 it lists enquiries and their quotations. */
export default function OrdersScreen() {
  const { profile } = useAuth();
  const { count } = useBasket();
  const [list, setList] = useState<EnquirySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    if (!isSupabaseConfigured || !profile) return;
    let cancelled = false;
    fetchMyEnquiries(profile.id)
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
  }, [profile]);
  useFocusEffect(load);

  if (!isSupabaseConfigured) {
    return <EmptyState title="Enquiries and orders" hint="Connect the app to the server to send enquiries." />;
  }
  if (error && !list) return <ErrorState message={error} onRetry={load} />;
  if (!list) return <LoadingState />;

  return (
    <FlatList
      style={styles.root}
      data={list}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
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
      ListHeaderComponent={
        count > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/enquiry')} style={styles.basket}>
            <Text style={[type.body, { color: colors.textOnBrand, fontWeight: '600' }]}>
              {count} product{count === 1 ? '' : 's'} in your enquiry, not sent yet
            </Text>
            <Text style={[type.body, { color: colors.textOnBrand }]}>Review ›</Text>
          </Pressable>
        ) : undefined
      }
      ListEmptyComponent={
        <View style={{ gap: spacing.lg }}>
          <EmptyState title="No enquiries yet" hint="Add products to an enquiry and send it to get a quotation." />
          <CTAButton label="Browse catalogue" onPress={() => router.navigate('/catalog')} />
        </View>
      }
      renderItem={({ item }) => {
        const s = ENQUIRY_STATUS[item.status];
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/enquiries/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
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
      }}
    />
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
    gap: spacing.xs,
  },
  basket: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xs,
  },
});
