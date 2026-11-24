import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cardStyle } from '@/components/commercial';
import { EmptyState, ErrorState, LoadingState, SectionTitle } from '@/components/ui';
import { compactINR, dashboardStats, type ActionItem, type DashboardStats } from '@/data/dashboard';
import { fetchAllEnquiries } from '@/data/enquiries';
import { fetchAllOrders } from '@/data/orders';
import { hasRole, useAuth } from '@/lib/auth';
import { formatINR } from '@/lib/format';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

/** How many action rows to show before "See all". */
const ACTION_LIMIT = 8;

/** A01 Staff dashboard: headline numbers, what needs doing now, and shortcuts. */
export default function StaffDashboardScreen() {
  const { profile, staffRoles } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    Promise.all([fetchAllEnquiries(), fetchAllOrders()])
      .then(([enquiries, orders]) => {
        if (cancelled) return;
        setStats(dashboardStats(enquiries, orders));
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, []);
  useFocusEffect(load);

  if (!isSupabaseConfigured) return <EmptyState title="Dashboard" hint="Connect the app to the server to see the dashboard." />;
  if (error && !stats) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return <LoadingState />;

  const actions = showAll ? stats.actions : stats.actions.slice(0, ACTION_LIMIT);
  const firstName = profile?.full_name?.split(' ')[0];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          colors={[colors.brandSecondary]}
        />
      }>
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.h2, { color: colors.textPrimary }]}>{firstName ? `Hello, ${firstName}` : 'Dashboard'}</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          {stats.actions.length === 0
            ? 'Nothing is waiting for the team right now.'
            : `${stats.actions.length} thing${stats.actions.length === 1 ? '' : 's'} need${stats.actions.length === 1 ? 's' : ''} attention.`}
        </Text>
      </View>

      <View style={styles.tiles}>
        <Tile value={String(stats.actions.length)} label="Need action" tone={stats.actions.length ? colors.brandSecondary : undefined} />
        <Tile value={String(stats.activeOrders)} label="Active orders" onPress={() => router.navigate('/staff/order-list')} />
        <Tile value={compactINR(stats.received)} label="Received" hint={formatINR(stats.received)} />
        <Tile value={compactINR(stats.outstanding)} label="Still due" hint={formatINR(stats.outstanding)} />
      </View>

      <View>
        <SectionTitle>Needs action</SectionTitle>
        {stats.actions.length === 0 ? (
          <View style={cardStyle}>
            <Text style={[type.body, { color: colors.textSecondary }]}>All caught up. New enquiries and payments will show here.</Text>
          </View>
        ) : (
          <View style={[cardStyle, { gap: 0, paddingVertical: spacing.xs }]}>
            {actions.map((a, i) => (
              <ActionRow key={a.key} item={a} last={i === actions.length - 1} />
            ))}
            {stats.actions.length > ACTION_LIMIT && (
              <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} style={styles.more}>
                <Text style={[type.body, { color: colors.info, fontWeight: '600' }]}>
                  {showAll ? 'Show fewer' : `See all ${stats.actions.length}`}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <View>
        <SectionTitle>Pipeline</SectionTitle>
        <View style={[cardStyle, { gap: 0, paddingVertical: spacing.xs }]}>
          <PipelineRow label="New enquiries" value={stats.newEnquiries} onPress={() => router.navigate('/staff/orders')} />
          <PipelineRow label="Quotations with customers" value={stats.withCustomer} onPress={() => router.navigate('/staff/orders')} />
          <PipelineRow label="Active orders" value={stats.activeOrders} onPress={() => router.navigate('/staff/order-list')} />
          <PipelineRow label="Ready or out for delivery" value={stats.toDeliver} onPress={() => router.navigate('/staff/order-list')} />
          <PipelineRow label="Completed orders" value={stats.completed} onPress={() => router.navigate('/staff/order-list')} last />
        </View>
      </View>

      <View>
        <SectionTitle>Shortcuts</SectionTitle>
        <View style={styles.shortcuts}>
          {hasRole(staffRoles, 'catalog_admin') && (
            <Shortcut label="+ Add product" onPress={() => router.push({ pathname: '/staff-product/[id]', params: { id: 'new' } })} />
          )}
          <Shortcut label="Catalog" onPress={() => router.navigate('/staff/catalog')} />
          <Shortcut label="Enquiries" onPress={() => router.navigate('/staff/orders')} />
          <Shortcut label="Orders" onPress={() => router.navigate('/staff/order-list')} />
        </View>
      </View>
    </ScrollView>
  );
}

function Tile({ value, label, hint, tone, onPress }: { value: string; label: string; hint?: string; tone?: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'summary'}
      accessibilityLabel={`${label}: ${hint ?? value}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}>
      <Text style={[type.h2, { color: tone ?? colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

function ActionRow({ item, last }: { item: ActionItem; last: boolean }) {
  const open = () =>
    item.kind === 'order'
      ? router.push({ pathname: '/staff-order/[id]', params: { id: item.id } })
      : router.push({ pathname: '/staff-enquiry/[id]', params: { id: item.id } });
  return (
    <Pressable accessibilityRole="button" onPress={open} style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
          {item.number} · {item.who}
        </Text>
        <Text style={[type.caption, { color: item.rank <= 1 ? colors.brandSecondary : colors.textSecondary, fontWeight: '600' }]}>
          {item.reason}
          {item.amount != null ? ` · ${formatINR(item.amount)}` : ''}
        </Text>
      </View>
      <Text style={[type.body, { color: colors.textSecondary }]}>›</Text>
    </Pressable>
  );
}

function PipelineRow({ label, value, onPress, last }: { label: string; value: number; onPress: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { opacity: 0.85 }]}>
      <Text style={[type.body, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
      <Text style={[type.body, { color: colors.textPrimary, fontWeight: '700' }]}>{value}</Text>
    </Pressable>
  );
}

function Shortcut({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.85 }]}>
      <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: minTouch, paddingVertical: spacing.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  more: { minHeight: minTouch, justifyContent: 'center' },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shortcut: {
    minHeight: minTouch,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
