import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProductCard } from '@/components/product';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { fetchCatalogue, type Category } from '@/data/catalogue';
import { useAsync } from '@/lib/use-async';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

/** C03 Catalog: search, category filter, product cards (§11). */
export default function CatalogScreen() {
  const { state, retry } = useAsync(fetchCatalogue);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (state.status !== 'success') return [];
    const q = query.trim().toLowerCase();
    return state.data.products.filter(
      (p) =>
        (!category || p.categoryId === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    );
  }, [state, query, category]);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;

  const catName = (id: string) => state.data.categories.find((c) => c.id === id)?.name ?? '';

  const offline = state.data.offlineSince;

  return (
    <View style={styles.root}>
      {offline && (
        <View style={styles.offline} accessibilityRole="alert">
          <Text style={styles.offlineText}>
            You’re offline. Showing the catalogue saved on {new Date(offline).toLocaleDateString('en-IN')}.
          </Text>
        </View>
      )}
      <View style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search products and services"
          placeholderTextColor={colors.textSecondary}
          style={styles.search}
          accessibilityLabel="Search catalogue"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
          {state.data.categories.map((c: Category) => (
            <Chip key={c.id} label={c.name} selected={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState title="No products found" hint="Try another search or category." />}
        renderItem={({ item }) => <ProductCard product={item} categoryName={catName(item.categoryId)} />}
        refreshControl={<RefreshControl refreshing={false} onRefresh={retry} colors={[colors.brandSecondary]} />}
      />
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipLabel, selected && { color: colors.textOnBrand }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
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
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary },
  chipLabel: { ...type.body, color: colors.textPrimary },
  offline: { backgroundColor: '#FFF4E0', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  offlineText: { ...type.caption, color: colors.warning, fontWeight: '600' },
});
