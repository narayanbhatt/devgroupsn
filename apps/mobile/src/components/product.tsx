import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { STATUS_LABEL, type Product, type ProductStatus } from '@/data/catalogue';
import { formatINR } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme/tokens';

/** The product's first photo, or a navy panel with its category when it has none. */
export function ProductThumb({ product, label, height = 120 }: { product: Product; label: string; height?: number }) {
  const hero = product.images[0];
  if (hero) {
    return (
      <Image
        source={{ uri: hero.url }}
        alt={hero.alt || product.name}
        style={[styles.thumb, { height }]}
        contentFit="cover"
        transition={150}
        cachePolicy="disk"
      />
    );
  }
  return (
    <View style={[styles.thumb, styles.placeholder, { height }]}>
      <Text style={styles.placeholderText}>{label}</Text>
    </View>
  );
}

const BADGE: Record<ProductStatus, { bg: string; fg: string }> = {
  published: { bg: '#E6F4EA', fg: colors.success },
  temporarily_unavailable: { bg: '#FFF4E0', fg: colors.warning },
  draft: { bg: colors.surfaceSecondary, fg: colors.textSecondary },
  archived: { bg: '#FDECEA', fg: colors.error },
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  const c = BADGE[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

/** One line: "₹2,200 + Tax", "From ₹4,500 + Tax" or "Price on quotation". */
export function PriceLine({ product }: { product: Product }) {
  if (product.listedPrice == null || product.pricingType === 'quote') {
    return <Text style={[type.body, { color: colors.textSecondary }]}>Price on quotation</Text>;
  }
  return (
    <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]}>
      {product.pricingType === 'starting_from' ? 'From ' : ''}
      {formatINR(product.listedPrice)}
      <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>
        {product.taxNote ? ` ${product.taxNote}` : ''}
        {product.unit && product.unit !== 'piece' ? ` per ${product.unit}` : ''}
      </Text>
    </Text>
  );
}

export function ProductCard({ product, categoryName }: { product: Product; categoryName: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${categoryName}`}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <ProductThumb product={product} label={categoryName} />
      <Text style={[type.h3, { color: colors.textPrimary, marginTop: spacing.sm }]}>{product.name}</Text>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{categoryName}</Text>
      <View style={{ marginTop: spacing.xs, gap: spacing.xs }}>
        <PriceLine product={product} />
        {product.status === 'temporarily_unavailable' && <StatusBadge status={product.status} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: { width: '100%', borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  placeholder: { backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { ...type.caption, color: colors.textOnBrand, letterSpacing: 1, textTransform: 'uppercase' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  badgeText: { ...type.caption, fontWeight: '600' },
  card: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
});
