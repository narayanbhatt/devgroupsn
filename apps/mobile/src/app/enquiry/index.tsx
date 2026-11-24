import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { CTAButton, EmptyState, SecondaryButton } from '@/components/ui';
import { estimateBasket } from '@/data/commercial';
import { useBasket, type BasketItem } from '@/lib/basket';
import { formatINR } from '@/lib/format';
import { useKeyboardInset } from '@/lib/keyboard';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

/** C05 Enquiry basket (§13). Not an order: it becomes an enquiry for a quotation. */
export default function BasketScreen() {
  const { items, clear } = useBasket();
  const { value, unpriced } = estimateBasket(items);
  const list = useRef<FlatList<BasketItem>>(null);
  const { keyboardHeight, onScroll } = useKeyboardInset((y) => list.current?.scrollToOffset({ offset: y, animated: true }));

  if (items.length === 0) {
    return (
      <View style={styles.root}>
        <EmptyState title="Your enquiry is empty" hint="Add products from the catalogue, then send them together for one quotation." />
        <View style={{ padding: spacing.lg }}>
          <CTAButton label="Browse catalogue" onPress={() => router.navigate('/')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={list}
        data={items}
        keyExtractor={(i) => i.productId}
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg + keyboardHeight, gap: spacing.md }}
        renderItem={({ item }) => <Row item={item} />}
        ListFooterComponent={
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <SecondaryButton label="Add more products" onPress={() => router.navigate('/')} />
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Alert.alert('Empty the enquiry?', 'All products will be removed.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Empty', style: 'destructive', onPress: clear },
                ])
              }
              style={{ alignSelf: 'center', padding: spacing.sm }}>
              <Text style={[type.caption, { color: colors.error }]}>Empty enquiry</Text>
            </Pressable>
          </View>
        }
      />
      <View style={styles.footer}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={[type.body, { color: colors.textSecondary }]}>Estimated catalogue value</Text>
          <Text style={[type.h3, { color: colors.textPrimary }]}>{formatINR(value)}</Text>
        </View>
        <Text style={[type.caption, { color: colors.textSecondary }]}>
          Before tax, at listed prices{unpriced > 0 ? `, plus ${unpriced} item${unpriced > 1 ? 's' : ''} priced on quotation` : ''}. Your
          quotation sets the final price.
        </Text>
        <CTAButton label="Continue" onPress={() => router.push('/enquiry/details')} />
      </View>
    </View>
  );
}

function Row({ item }: { item: BasketItem }) {
  const { update, remove } = useBasket();
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: colors.brandPrimary }]} />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]}>{item.name}</Text>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {item.listedPrice != null ? `${formatINR(item.listedPrice)} ${item.taxNote} each` : 'Price on quotation'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} onPress={() => remove(item.productId)} hitSlop={8}>
          <Text style={[type.h3, { color: colors.textSecondary }]}>×</Text>
        </Pressable>
      </View>
      <View style={styles.qtyRow}>
        <Text style={[type.body, { color: colors.textSecondary, flex: 1 }]}>Quantity{item.unit !== 'piece' ? ` (${item.unit})` : ''}</Text>
        <TextInput
          value={String(item.quantity)}
          onChangeText={(t) => {
            const n = Math.floor(Number(t.replace(/[^0-9]/g, '')));
            update(item.productId, { quantity: Number.isFinite(n) && n > 0 ? n : 1 });
          }}
          keyboardType="number-pad"
          accessibilityLabel={`Quantity of ${item.name}`}
          style={styles.qtyInput}
          selectTextOnFocus
        />
      </View>
      <View style={styles.qtyRow}>
        <Text style={[type.body, { color: colors.textSecondary, flex: 1 }]}>Installation needed</Text>
        <Switch
          value={item.installationRequired}
          onValueChange={(v) => update(item.productId, { installationRequired: v })}
          trackColor={{ true: colors.brandSecondary, false: colors.border }}
          accessibilityLabel={`Installation needed for ${item.name}`}
        />
      </View>
      <TextInput
        value={item.notes}
        onChangeText={(t) => update(item.productId, { notes: t })}
        placeholder="Size, variant or other requirement (optional)"
        placeholderTextColor={colors.textSecondary}
        style={styles.notes}
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  card: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyInput: {
    width: 88,
    height: minTouch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    color: colors.textPrimary,
    ...type.body,
  },
  notes: {
    minHeight: minTouch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...type.body,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surfacePrimary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
