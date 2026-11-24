import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { cardStyle, StatusPill } from '@/components/commercial';
import { SecondaryButton } from '@/components/ui';
import { formatDate } from '@/data/commercial';
import { formatBytes, openDocument, pickFile, uploadDocument } from '@/data/documents';
import {
  DOCUMENT_TYPE,
  ORDER_STATUS,
  orderStages,
  PAYMENT_STATUS,
  type DocumentType,
  type OrderStatus,
} from '@/data/order-rules';
import { fetchOrderIdForQuotation, type DocumentFile, type OrderSummary } from '@/data/orders';
import { shareQuotationPdf } from '@/data/quotation-pdf';
import { formatINR } from '@/lib/format';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

/** One order in a list; opens its detail (the staff one for staff lists). */
export function OrderRow({ item, staff }: { item: OrderSummary; staff?: boolean }) {
  const s = ORDER_STATUS[item.status];
  const p = PAYMENT_STATUS[item.paymentStatus];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: staff ? '/staff-order/[id]' : '/order/[id]', params: { id: item.id } })}
      style={({ pressed }) => [cardStyle, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text style={[type.body, { color: colors.textPrimary, fontWeight: '700' }]}>{item.number}</Text>
        <StatusPill label={staff ? s.staff : s.label} tone={s.tone} />
      </View>
      {staff && item.customerName ? (
        <Text style={[type.body, { color: colors.textPrimary }]}>
          {item.customerName}
          {item.organizationName ? ` · ${item.organizationName}` : ''}
        </Text>
      ) : null}
      {item.projectName ? <Text style={[type.body, { color: colors.textSecondary }]}>{item.projectName}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]}>{formatINR(item.grandTotal)}</Text>
        <StatusPill label={p.label} tone={p.tone} />
      </View>
      <Text style={[type.caption, { color: colors.textSecondary }]}>Placed {formatDate(item.createdAt)}</Text>
    </Pressable>
  );
}

/** ✓ / ● / ○ progress list (§22). */
export function OrderProgress({ status, reached }: { status: OrderStatus; reached: OrderStatus[] }) {
  const stages = orderStages(status, reached);
  return (
    <View style={cardStyle}>
      {(status === 'cancelled' || status === 'disputed') && (
        <View style={{ marginBottom: spacing.xs }}>
          <StatusPill label={ORDER_STATUS[status].label} tone={ORDER_STATUS[status].tone} />
        </View>
      )}
      {stages.map((st) => (
        <View key={st.status} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <Text
            style={[
              styles.mark,
              st.state === 'done' && { color: colors.success },
              st.state === 'current' && { color: colors.brandSecondary },
            ]}>
            {st.state === 'done' ? '✓' : st.state === 'current' ? '●' : '○'}
          </Text>
          <Text
            style={[
              type.body,
              { color: st.state === 'todo' ? colors.textSecondary : colors.textPrimary },
              st.state === 'current' && { fontWeight: '700' },
            ]}>
            {ORDER_STATUS[st.status].label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A list of files with a way to open each, and (optionally) to add one. */
export function DocumentsSection({
  ownerType,
  ownerId,
  documents,
  uploadTypes,
  staff,
  onChanged,
}: {
  ownerType: 'enquiry' | 'order';
  ownerId: string;
  documents: DocumentFile[];
  /** Kinds of file this person may add; empty hides the button. */
  uploadTypes: DocumentType[];
  staff?: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function add(t: DocumentType, visible: boolean) {
    try {
      const file = await pickFile();
      if (!file) return;
      setBusy(true);
      await uploadDocument(ownerType, ownerId, t, file, visible);
      onChanged();
    } catch (e) {
      Alert.alert('Could not add the file', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function chooseType() {
    const buttons = uploadTypes.map((t) => ({ text: DOCUMENT_TYPE[t], onPress: () => askVisibility(t) }));
    Alert.alert('What kind of file?', 'PDF or photo, up to 10 MB.', [...buttons, { text: 'Cancel', style: 'cancel' as const }]);
  }

  function askVisibility(t: DocumentType) {
    if (!staff) return void add(t, true);
    Alert.alert('Who can see it?', undefined, [
      { text: 'Customer and staff', onPress: () => void add(t, true) },
      { text: 'Staff only', onPress: () => void add(t, false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={cardStyle}>
      {documents.length === 0 && <Text style={[type.body, { color: colors.textSecondary }]}>No files yet.</Text>}
      {documents.map((d) => (
        <Pressable
          key={d.id}
          accessibilityRole="link"
          onPress={() => openDocument(d.path).catch((e: Error) => Alert.alert('Could not open', e.message))}
          style={styles.doc}>
          <Text style={styles.docIcon}>{d.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: colors.info }]} numberOfLines={1}>
              {d.filename}
            </Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {DOCUMENT_TYPE[d.type]} · {formatBytes(d.sizeBytes)} · {formatDate(d.createdAt)}
              {staff && !d.visibleToCustomer ? ' · Staff only' : ''}
            </Text>
          </View>
        </Pressable>
      ))}
      {uploadTypes.length > 0 && (
        <Pressable accessibilityRole="button" disabled={busy} onPress={chooseType} style={styles.add}>
          <Text style={[type.body, { color: colors.brandPrimary, fontWeight: '600' }]}>{busy ? 'Uploading…' : '+ Add a file'}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Builds the quotation PDF and opens the share sheet. */
export function QuotationPdfButton({ quotationId }: { quotationId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <SecondaryButton
      label={busy ? 'Preparing PDF…' : 'Download PDF'}
      onPress={() => {
        if (busy) return;
        setBusy(true);
        shareQuotationPdf(quotationId)
          .catch((e: Error) => Alert.alert('Could not make the PDF', e.message))
          .finally(() => setBusy(false));
      }}
    />
  );
}

/** "Open order" for a quotation that became an order. */
export function OrderForQuotation({ quotationId, staff }: { quotationId: string; staff?: boolean }) {
  const [orderId, setOrderId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchOrderIdForQuotation(quotationId)
      .then((id) => live && setOrderId(id))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [quotationId]);
  if (!orderId) return null;
  return (
    <SecondaryButton
      label="Open order"
      onPress={() => router.push({ pathname: staff ? '/staff-order/[id]' : '/order/[id]', params: { id: orderId } })}
    />
  );
}

const styles = StyleSheet.create({
  mark: { ...type.body, width: 20, textAlign: 'center', color: colors.textSecondary, fontWeight: '700' },
  doc: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', minHeight: minTouch },
  docIcon: {
    ...type.caption,
    fontWeight: '700',
    color: colors.textOnBrand,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  add: {
    minHeight: minTouch,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
