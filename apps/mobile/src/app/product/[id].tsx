import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';

import { ProductCard, StatusBadge } from '@/components/product';
import { ChatButton } from '@/components/chat';
import { Body, CTAButton, EmptyState, ErrorState, H1, LoadingState, PriceBlock, SectionTitle } from '@/components/ui';
import { fetchProductWithRelated, type Product } from '@/data/catalogue';
import { useBasket } from '@/lib/basket';
import { useKeyboardInset } from '@/lib/keyboard';
import { useAsync } from '@/lib/use-async';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

/** C04 Product Detail: photos, price, specifications, related products. Primary CTA: Add to Enquiry (§12). */
export default function ProductDetailScreen() {
  const { id, preview } = useLocalSearchParams<{ id: string; preview?: string }>();
  const isPreview = preview === '1';
  const { state, retry } = useAsync(() => fetchProductWithRelated(id), id);
  const scroll = useRef<ScrollViewInstance>(null);
  const { keyboardHeight, onScroll } = useKeyboardInset((y) => scroll.current?.scrollTo({ y, animated: true }));

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (!state.data) return <EmptyState title="Product not available" hint="It may have been removed from the catalogue." />;
  const { product, related, categoryName } = state.data;
  const available = product.status === 'published';
  const specs = Object.entries(product.specifications);

  return (
    <>
      <Stack.Screen options={{ title: isPreview ? 'Customer preview' : product.name }} />
      {isPreview && <PreviewBanner status={product.status} />}
      <ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        style={styles.root}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg + keyboardHeight, gap: spacing.lg }}>
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
          {isPreview ? (
            <Body muted>Customers see “Add to Enquiry” and “Chat with DEV” here{available ? '' : ' once the product is published'}.</Body>
          ) : available ? (
            <AddToEnquiry product={product} />
          ) : (
            <Body muted>This product can’t be added to an enquiry right now. Ask us about availability.</Body>
          )}
          {!isPreview && <ChatButton label="Chat with DEV" />}
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

/** Quantity stepper and the primary CTA (§12-13). */
/** Shown at the top in preview: what this page is and whether customers can see it yet. */
function PreviewBanner({ status }: { status: Product['status'] }) {
  const visible = status === 'published' || status === 'temporarily_unavailable';
  return (
    <View style={styles.preview} accessibilityLiveRegion="polite">
      <Text style={[type.caption, { color: colors.textPrimary, fontWeight: '700' }]}>
        Preview: this is how customers see this product
      </Text>
      <Text style={[type.caption, { color: colors.textSecondary }]}>
        {visible
          ? 'It’s in the customer catalogue. Shows the last saved version.'
          : `Customers can’t see it yet because it’s ${status === 'draft' ? 'a draft' : 'archived'}. Shows the last saved version.`}
      </Text>
    </View>
  );
}

function AddToEnquiry({ product }: { product: Product }) {
  const { items, add } = useBasket();
  const [qty, setQty] = useState('1');
  const inBasket = items.find((i) => i.productId === product.id);
  const n = Math.floor(Number(qty));
  const valid = Number.isFinite(n) && n > 0;

  function onAdd() {
    if (!valid) return Alert.alert('Enter a quantity', 'How many do you need?');
    add(product, n);
    setQty('1');
    Alert.alert('Added to your enquiry', `${n} × ${product.name}`, [
      { text: 'Keep browsing', style: 'cancel' },
      { text: 'View enquiry', onPress: () => router.push('/enquiry') },
    ]);
  }

  const step = (d: number) => setQty(String(Math.max(1, (valid ? n : 1) + d)));
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.qtyRow}>
        <Text style={[type.body, { color: colors.textSecondary, flex: 1 }]}>
          Quantity{product.unit !== 'piece' ? ` (${product.unit})` : ''}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Decrease quantity" onPress={() => step(-1)} style={styles.qtyBtn}>
          <Text style={styles.qtyBtnText}>−</Text>
        </Pressable>
        <TextInput
          value={qty}
          onChangeText={(t) => setQty(t.replace(/[^0-9]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          accessibilityLabel="Quantity"
          style={styles.qtyInput}
          selectTextOnFocus
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Increase quantity" onPress={() => step(1)} style={styles.qtyBtn}>
          <Text style={styles.qtyBtnText}>+</Text>
        </Pressable>
      </View>
      <CTAButton label="Add to Enquiry" onPress={onAdd} disabled={!valid} />
      {inBasket && (
        <Pressable accessibilityRole="link" onPress={() => router.push('/enquiry')}>
          <Text style={[type.caption, { color: colors.info, textAlign: 'center' }]}>
            {inBasket.quantity} already in your enquiry · View enquiry
          </Text>
        </Pressable>
      )}
    </View>
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
  preview: {
    backgroundColor: '#FFF4E5',
    borderBottomWidth: 1,
    borderBottomColor: '#F5D9B0',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  root: { flex: 1, backgroundColor: colors.surfacePrimary },
  hero: { height: 260, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary },
  heroEmpty: { backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  heroText: { ...type.h3, color: colors.textOnBrand },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brandSecondary, width: 16 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: {
    width: minTouch,
    height: minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { ...type.h3, color: colors.brandPrimary },
  qtyInput: {
    width: 72,
    height: minTouch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    color: colors.textPrimary,
    ...type.body,
  },
  feature: { flexDirection: 'row', gap: spacing.sm },
  featureTick: { ...type.body, color: colors.success, fontWeight: '700' },
  specs: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.sm },
  specRow: { flexDirection: 'row', padding: spacing.md, gap: spacing.md },
  specDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  specKey: { ...type.body, color: colors.textSecondary, flex: 1 },
  specValue: { ...type.body, color: colors.textPrimary, flex: 1.4 },
});
