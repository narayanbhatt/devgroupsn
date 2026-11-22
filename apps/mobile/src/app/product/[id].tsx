import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, CTAButton, EmptyState, ErrorState, H1, LoadingState, PriceBlock, SecondaryButton } from '@/components/ui';
import { fetchProduct } from '@/data/catalogue';
import { useAsync } from '@/lib/use-async';
import { colors, radius, spacing, type } from '@/theme/tokens';

/** C04 Product Detail. Primary CTA: Add to Enquiry (§12). */
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, retry } = useAsync(() => fetchProduct(id), id);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  const product = state.data;
  if (!product) return <EmptyState title="Product not available" hint="It may have been removed from the catalogue." />;

  return (
    <>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={styles.hero}>
          <Text style={styles.heroText}>{product.name}</Text>
        </View>
        <View style={{ gap: spacing.sm }}>
          <H1>{product.name}</H1>
          <Text style={[type.caption, { color: colors.textSecondary }]}>SKU {product.sku}</Text>
        </View>
        <PriceBlock amount={product.listedPrice} taxNote={product.taxNote} />
        {product.description ? <Body>{product.description}</Body> : null}
        <View style={{ gap: spacing.sm }}>
          {/* Enquiry basket arrives in step 3 of the build plan. */}
          <CTAButton
            label="Add to Enquiry"
            onPress={() => Alert.alert('Coming next', 'The enquiry basket is the next feature being built.')}
          />
          <SecondaryButton label="Chat with DEV" onPress={() => router.navigate('/chat')} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfacePrimary },
  hero: {
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { ...type.h3, color: colors.textOnBrand },
});
