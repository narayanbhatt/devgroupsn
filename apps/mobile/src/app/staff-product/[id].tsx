import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceField, FormError, FormNotice, FormScreen, TextField } from '@/components/form';
import { Body, CTAButton, ErrorState, LoadingState, SecondaryButton, SectionTitle } from '@/components/ui';
import {
  fetchAllCategories,
  fetchProductForEdit,
  PRICING_LABEL,
  STATUS_LABEL,
  type Category,
  type PricingType,
  type Product,
  type ProductImage,
  type ProductStatus,
} from '@/data/catalogue';
import { draftToRow, EMPTY_DRAFT, specsToRows, type ProductDraft } from '@/data/product-form';
import { addProductPhotos, makeCoverPhoto, removeProductPhoto } from '@/data/product-photos';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/use-async';
import { colors, radius, spacing, type } from '@/theme/tokens';

const PRICING_OPTIONS = (Object.keys(PRICING_LABEL) as PricingType[]).map((v) => ({ value: v, label: PRICING_LABEL[v] }));
const STATUS_OPTIONS = (['draft', 'published', 'temporarily_unavailable', 'archived'] as ProductStatus[]).map((v) => ({
  value: v,
  label: STATUS_LABEL[v],
}));

/** A10 Product editor for catalogue admins. id "new" creates a product. */
export default function StaffProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { state, retry } = useAsync(async () => {
    const [categories, product] = await Promise.all([fetchAllCategories(), isNew ? null : fetchProductForEdit(id)]);
    return { categories, product };
  }, id);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (!isNew && !state.data.product) return <ErrorState message="This product no longer exists." onRetry={retry} />;

  return <Editor key={id} categories={state.data.categories} product={state.data.product} />;
}

function toDraft(p: Product | null, categories: Category[]): ProductDraft {
  if (!p) return { ...EMPTY_DRAFT, categoryId: categories[0]?.id ?? '' };
  return {
    name: p.name,
    sku: p.sku,
    categoryId: p.categoryId,
    description: p.description,
    price: p.listedPrice == null ? '' : String(p.listedPrice),
    pricingType: p.pricingType,
    taxRate: String(p.taxRate),
    taxNote: p.taxNote,
    unit: p.unit,
    status: p.status,
    specs: specsToRows(p.specifications),
    features: p.keyFeatures.join('\n'),
  };
}

function Editor({ categories, product }: { categories: Category[]; product: Product | null }) {
  const [draft, setDraft] = useState<ProductDraft>(() => toDraft(product, categories));
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = <K extends keyof ProductDraft>(k: K) => (v: ProductDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name} (hidden)` }));

  async function onSave() {
    const result = draftToRow(draft);
    if (!result.ok) return setError(result.error);
    setBusy(true);
    setError(null);
    setNotice(null);
    const q = product
      ? supabase!.from('products').update(result.row).eq('id', product.id).select('id').single()
      : supabase!.from('products').insert(result.row).select('id').single();
    const { data, error: e } = await q;
    setBusy(false);
    if (e) return setError(e.code === '23505' ? 'Another product already uses that SKU.' : friendlyError(e));
    if (!product) {
      // Photos attach to a saved product, so continue in the editor for the new one.
      router.replace({ pathname: '/staff-product/[id]', params: { id: data.id } });
      return;
    }
    setNotice('Saved. Customers see the change the next time their catalogue loads.');
  }

  async function reloadImages() {
    if (!product) return;
    const fresh = await fetchProductForEdit(product.id);
    if (fresh) setImages(fresh.images);
  }

  async function onAddPhotos() {
    if (!product) return;
    setPhotoBusy(true);
    setError(null);
    try {
      await addProductPhotos(product.id, images.length, draft.name || product.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add photos.');
    }
    await reloadImages().catch(() => undefined);
    setPhotoBusy(false);
  }

  function onPhoto(img: ProductImage, index: number) {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Cancel', style: 'cancel' },
    ];
    if (index > 0) {
      buttons.push({
        text: 'Make cover photo',
        onPress: () => {
          setPhotoBusy(true);
          makeCoverPhoto(images, img.id)
            .catch((e: Error) => setError(e.message))
            .then(reloadImages)
            .catch(() => undefined)
            .finally(() => setPhotoBusy(false));
        },
      });
    }
    buttons.push({
      text: 'Remove',
      style: 'destructive',
      onPress: () => {
        setPhotoBusy(true);
        removeProductPhoto(img.id, img.path)
          .catch((e: Error) => setError(e.message))
          .then(reloadImages)
          .catch(() => undefined)
          .finally(() => setPhotoBusy(false));
      },
    });
    Alert.alert('Photo', index === 0 ? 'This is the cover photo customers see first.' : undefined, buttons);
  }

  function onSpec(i: number, field: 'key' | 'value', v: string) {
    setDraft((d) => ({ ...d, specs: d.specs.map((r, j) => (j === i ? { ...r, [field]: v } : r)) }));
  }

  return (
    <>
      <Stack.Screen options={{ title: product ? 'Edit product' : 'New product' }} />
      <FormScreen>
        <FormError message={error} />
        <FormNotice message={notice} />

        <TextField label="Product name" value={draft.name} onChangeText={set('name')} />
        <TextField
          label="SKU"
          value={draft.sku}
          onChangeText={set('sku')}
          autoCapitalize="characters"
          hint="Your stock code, e.g. LGT-STREET-45W"
        />
        {categories.length === 0 ? (
          <Body muted>Add a category first, under Catalog › Categories.</Body>
        ) : (
          <ChoiceField label="Category" value={draft.categoryId} options={categoryOptions} onChange={set('categoryId')} />
        )}
        <TextField label="Description" value={draft.description} onChangeText={set('description')} multiline />

        <SectionTitle>Price</SectionTitle>
        <ChoiceField label="Pricing" value={draft.pricingType} options={PRICING_OPTIONS} onChange={set('pricingType')} />
        {draft.pricingType !== 'quote' && (
          <TextField
            label="Listed price (₹)"
            value={draft.price}
            onChangeText={set('price')}
            keyboardType="decimal-pad"
            hint="Shown as indicative. The final price is set in each quotation."
          />
        )}
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <TextField label="GST rate (%)" value={draft.taxRate} onChangeText={set('taxRate')} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Tax note" value={draft.taxNote} onChangeText={set('taxNote')} placeholder="+ GST" />
          </View>
        </View>
        <TextField label="Unit" value={draft.unit} onChangeText={set('unit')} hint="piece, set, metre, job…" autoCapitalize="none" />

        <SectionTitle>Key features</SectionTitle>
        <TextField
          label="Key features"
          value={draft.features}
          onChangeText={set('features')}
          multiline
          hint="One per line, e.g. IP65 weatherproof"
        />

        <SectionTitle>Specifications</SectionTitle>
        {draft.specs.map((r, i) => (
          <View key={i} style={styles.specRow}>
            <View style={{ flex: 1 }}>
              <TextField label="Name" value={r.key} onChangeText={(v) => onSpec(i, 'key', v)} placeholder="Wattage" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Value" value={r.value} onChangeText={(v) => onSpec(i, 'value', v)} placeholder="45 W" />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove specification"
              hitSlop={8}
              onPress={() => setDraft((d) => ({ ...d, specs: d.specs.filter((_, j) => j !== i) }))}
              style={styles.specRemove}>
              <Text style={[type.h3, { color: colors.error }]}>×</Text>
            </Pressable>
          </View>
        ))}
        <SecondaryButton
          label="Add a specification"
          onPress={() => setDraft((d) => ({ ...d, specs: [...d.specs, { key: '', value: '' }] }))}
        />

        <SectionTitle>Visibility</SectionTitle>
        <ChoiceField label="Status" value={draft.status} options={STATUS_OPTIONS} onChange={set('status')} />
        <Body muted>
          Only Published products can be added to enquiries. Temporarily unavailable ones stay visible to customers;
          drafts and archived ones are hidden.
        </Body>

        <SectionTitle>Photos</SectionTitle>
        {product ? (
          <>
            {images.length === 0 && <Body muted>No photos yet. The first photo is the cover customers see.</Body>}
            <View style={styles.photos}>
              {images.map((img, i) => (
                <Pressable
                  key={img.id}
                  accessibilityRole="button"
                  accessibilityLabel={i === 0 ? 'Cover photo' : `Photo ${i + 1}`}
                  onPress={() => onPhoto(img, i)}
                  disabled={photoBusy}>
                  <Image source={{ uri: img.url }} style={styles.photo} contentFit="cover" />
                  {i === 0 && <Text style={styles.cover}>Cover</Text>}
                </Pressable>
              ))}
            </View>
            <SecondaryButton label={photoBusy ? 'Working on photos…' : 'Add photos'} onPress={photoBusy ? () => {} : onAddPhotos} />
          </>
        ) : (
          <Body muted>Save the product first, then add photos.</Body>
        )}

        <CTAButton label={busy ? 'Saving…' : product ? 'Save changes' : 'Create product'} onPress={onSave} disabled={busy} />
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: spacing.md },
  specRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  specRemove: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  cover: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    ...type.caption,
    fontWeight: '700',
    color: colors.textOnBrand,
    backgroundColor: colors.brandSecondary,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
