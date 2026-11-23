import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ProductCard, StatusBadge } from '@/components/product';
import { Body, CTAButton, EmptyState, ErrorState, H1, LoadingState, PriceBlock, SecondaryButton, SectionTitle } from '@/components/ui';
import { fetchProductWithRelated, type Product } from '@/data/catalogue';
import { useAsync } from '@/lib/use-async';
import { colors, radius, spacing, type } from '@/theme/tokens';

/** C04 Product Detail: photos, price, specifications, related products. Primary CTA: Add to Enquiry (§12). */
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, retry } = useAsync(() => fetchProductWithRelated(id), id);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (!state.data) return <EmptyState title="Product not available" hint="It may have been removed from the catalogue." />;
  const { product, related, categoryName } = state.data;
  const available = product.status === 'published';
  const specs = Object.entries(product.specifications);

  return (
    <>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Gallery product={product} />
        <View style={{ gap: spacing.sm }}>
          <H1>{product.name}</H1>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            SKU {product.sku}
            {product.unit !== 'piece' ? ` · Sold per ${product.unit}` : ''}
          </Text>
          {!available && <StatusBadge status={product.status} />}
        </View>
        <PriceBlock
          amount={product.pricingType === 'quote' ? null : product.listedPrice}
          taxNote={`${product.taxNote}${product.pricingType === 'starting_from' ? ' (starting price)' : ''}`}
        />
        {product.description ? <Body>{product.description}</Body> : null}

        {product.keyFeatures.length > 0 && (
          <View style={{ gap: spacing.xs }}>
            <SectionTitle>Key features</SectionTitle>
            {product.keyFeatures.map((f) => (
              <View key={f} style={styles.feature}>
                <Text style={styles.featureTick}>✓</Text>
                <Text style={[type.body, { color: colors.textPrimary, flex: 1 }]}>{f}</Text>
              </View>
            ))}
          </View>
        )}

        {specs.length > 0 && (
          <View>
            <SectionTitle>Specifications</SectionTitle>
            <View style={styles.specs}>
              {specs.map(([k, v], i) => (
                <View key={k} style={[styles.specRow, i > 0 && styles.specDivider]}>
                  <Text style={styles.specKey}>{k}</Text>
                  <Text style={styles.specValue}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: spacing.sm }}>
          {available ? (
            // The enquiry basket is the next phase of the build.
            <CTAButton
              label="Add to Enquiry"
              onPress={() => Alert.alert('Coming next', 'The enquiry basket is the next feature being built.')}
            />
          ) : (
            <Body muted>This product can’t be added to an enquiry right now. Ask us about availability.</Body>
          )}
          <SecondaryButton label="Chat with DEV" onPress={() => router.navigate('/chat')} />
        </View>

        {related.length > 0 && (
          <View style={{ gap: spacing.md }}>
            <SectionTitle>Related products</SectionTitle>
            {related.map((r) => (
              <ProductCard key={r.id} product={r} categoryName={categoryName} />
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Gallery({ product }: { product: Product }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const slide = width - spacing.lg * 2;

  if (product.images.length === 0) {
    return (
      <View style={[styles.hero, styles.heroEmpty]}>
        <Text style={styles.heroText}>{product.name}</Text>
      </View>
    );
  }
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / slide))}
        style={{ borderRadius: radius.lg }}>
        {product.images.map((img) => (
          <Image
            key={img.id}
            source={{ uri: img.url }}
            alt={img.alt || product.name}
            style={[styles.hero, { width: slide }]}
            contentFit="cover"
            transition={150}
            cachePolicy="disk"
          />
        ))}
      </ScrollView>
      {product.images.length > 1 && (
        <View style={styles.dots} accessibilityLabel={`Photo ${index + 1} of ${product.images.length}`}>
          {product.images.map((img, i) => (
            <View key={img.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfacePrimary },
  hero: { height: 260, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary },
  heroEmpty: { backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  heroText: { ...type.h3, color: colors.textOnBrand },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brandSecondary, width: 16 },
  feature: { flexDirection: 'row', gap: spacing.sm },
  featureTick: { ...type.body, color: colors.success, fontWeight: '700' },
  specs: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.sm },
  specRow: { flexDirection: 'row', padding: spacing.md, gap: spacing.md },
  specDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  specKey: { ...type.body, color: colors.textSecondary, flex: 1 },
  specValue: { ...type.body, color: colors.textPrimary, flex: 1.4 },
});
