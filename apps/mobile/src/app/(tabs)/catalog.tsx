import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { fetchCategories, fetchProducts, type Category, type Product } from '@/data/catalogue';
import { formatINR } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

/** C03 Catalog: search, category filter, product cards (§11). */
export default function CatalogScreen() {
  const { state, retry } = useAsync(async () => {
    const [categories, products] = await Promise.all([fetchCategories(), fetchProducts()]);
    return { categories, products };
  });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (state.status !== 'success') return [];
    const q = query.trim().toLowerCase();
    return state.data.products.filter(
      (p) => (!category || p.categoryId === category) && (!q || p.name.toLowerCase().includes(q)),
    );
  }, [state, query, category]);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;

  const catName = (id: string) => state.data.categories.find((c) => c.id === id)?.name ?? '';

  return (
    <View style={styles.root}>
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

function ProductCard({ product, categoryName }: { product: Product; categoryName: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.imagePlaceholder}>
        <Text style={styles.imageText}>{categoryName}</Text>
      </View>
      <Text style={[type.h3, { color: colors.textPrimary }]}>{product.name}</Text>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{categoryName}</Text>
      {product.listedPrice != null ? (
        <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600', marginTop: spacing.xs }]}>
          {formatINR(product.listedPrice)} <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>{product.taxNote}</Text>
        </Text>
      ) : (
        <Text style={[type.body, { color: colors.textSecondary }]}>Price on quotation</Text>
      )}
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
  card: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  imagePlaceholder: {
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  imageText: { ...type.caption, color: colors.textOnBrand, letterSpacing: 1, textTransform: 'uppercase' },
});
