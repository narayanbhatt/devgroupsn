import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { PriceLine, ProductThumb, StatusBadge } from '@/components/product';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import {
  fetchAllCategories,
  fetchAllProducts,
  STATUS_LABEL,
  type Category,
  type Product,
  type ProductStatus,
} from '@/data/catalogue';
import { hasRole, useAuth } from '@/lib/auth';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

type Filter = 'all' | ProductStatus;
const FILTERS: Filter[] = ['all', 'published', 'draft', 'temporarily_unavailable', 'archived'];

interface Data {
  products: Product[];
  categories: Category[];
}

/** A10 Product management: every product with its status, search, and the way into the editor. */
export default function StaffCatalogScreen() {
  const { staffRoles } = useAuth();
  const canEdit = hasRole(staffRoles, 'catalog_admin');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    let cancelled = false;
    Promise.all([fetchAllProducts(), fetchAllCategories()])
      .then(([products, categories]) => {
        if (cancelled) return;
        setData({ products, categories });
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload whenever the tab comes back into view, e.g. after saving in the editor.
  useFocusEffect(load);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, published: 0, draft: 0, temporarily_unavailable: 0, archived: 0 };
    for (const p of data?.products ?? []) {
      c.all++;
      c[p.status]++;
    }
    return c;
  }, [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.products ?? []).filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    );
  }, [data, query, filter]);

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState />;

  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or SKU"
          placeholderTextColor={colors.textSecondary}
          style={styles.search}
          accessibilityLabel="Search products"
        />
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f }}
              onPress={() => setFilter(f)}
              style={[styles.chip, filter === f && styles.chipSelected]}>
              <Text style={[styles.chipLabel, filter === f && { color: colors.textOnBrand }]}>
                {f === 'all' ? 'All' : STATUS_LABEL[f]} {counts[f]}
              </Text>
            </Pressable>
          ))}
        </View>
        {canEdit && (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/staff-product/[id]', params: { id: 'new' } })}
              style={[styles.action, styles.actionPrimary]}>
              <Text style={[styles.actionLabel, { color: colors.textOnBrand }]}>Add product</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/staff-categories')} style={styles.action}>
              <Text style={styles.actionLabel}>Categories</Text>
            </Pressable>
          </View>
        )}
      </View>
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
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
        ListEmptyComponent={<EmptyState title="No products" hint={query ? 'Try another search.' : undefined} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              canEdit
                ? router.push({ pathname: '/staff-product/[id]', params: { id: item.id } })
                : router.push({ pathname: '/product/[id]', params: { id: item.id } })
            }
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
            <View style={{ width: 64 }}>
              <ProductThumb product={item} label="" height={64} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {item.sku} · {catName(item.categoryId)} · {item.images.length} photo{item.images.length === 1 ? '' : 's'}
              </Text>
              <PriceLine product={item} />
              <StatusBadge status={item.status} />
            </View>
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
  chip: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipLabel: { ...type.caption, color: colors.textPrimary, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary },
  actionLabel: { ...type.body, fontWeight: '600', color: colors.brandPrimary },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
});
