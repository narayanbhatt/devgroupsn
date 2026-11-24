import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { cardStyle, KeyValue, MoneyRow, QuotationBreakdown, StatusPill } from '@/components/commercial';
import { DocumentsSection, OrderProgress } from '@/components/orders';
import { ChatButton } from '@/components/chat';
import { Body, CTAButton, EmptyState, ErrorState, H1, LoadingState, SecondaryButton, SectionTitle } from '@/components/ui';
import { formatDate } from '@/data/commercial';
import {
  amountDue,
  canRecordPayment,
  CUSTOMER_DOCUMENT_TYPES,
  ORDER_EVENT_LABEL,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATE,
  PAYMENT_STATUS,
  type OrderStatus,
} from '@/data/order-rules';
import { fetchOrder, type Order } from '@/data/orders';
import { formatINR } from '@/lib/format';
import { colors, spacing, type } from '@/theme/tokens';

/** C09 Order detail for the customer: progress, what's due, payments, files, history (§19-24). */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    fetchOrder(id)
      .then((o) => {
        if (cancelled) return;
        setOrder(o);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);
  useFocusEffect(load);

  if (error && order === undefined) return <ErrorState message={error} onRetry={load} />;
  if (order === undefined) return <LoadingState />;
  if (order === null) return <EmptyState title="Order not found" />;

  const s = ORDER_STATUS[order.status];
  const p = PAYMENT_STATUS[order.paymentStatus];
  const due = amountDue(order.grandTotal, order.paidAmount);
  const pending = order.payments.filter((x) => x.status === 'submitted').reduce((t, x) => t + x.amount, 0);
  const reached = order.events.map((e) => e.toStatus).filter((x): x is OrderStatus => x != null);

  return (
    <>
      <Stack.Screen options={{ title: order.number }} />
      <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <H1>{order.number}</H1>
          {order.projectName ? <Body>{order.projectName}</Body> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatusPill label={s.label} tone={s.tone} />
            <StatusPill label={p.label} tone={p.tone} />
          </View>
        </View>

        <View>
          <SectionTitle>Payment</SectionTitle>
          <View style={cardStyle}>
            <MoneyRow label="Order total" amount={order.grandTotal} />
            <MoneyRow label="Paid (verified)" amount={order.paidAmount} />
            {pending > 0 && <MoneyRow label="Being checked" amount={pending} />}
            <MoneyRow label="Amount due" amount={due} strong />
            {canRecordPayment(order.status, order.grandTotal, order.paidAmount, pending) && (
              <CTAButton
                label="I’ve paid: add payment details"
                onPress={() => router.push({ pathname: '/order-payment/[id]', params: { id: order.id } })}
              />
            )}
            {pending > 0 && <Body muted>We’re checking your payment. You’ll see it here once it’s verified.</Body>}
          </View>
          {order.payments.length > 0 && (
            <View style={[cardStyle, { marginTop: spacing.sm }]}>
              {order.payments.map((x) => (
                <View key={x.id} style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]}>{formatINR(x.amount)}</Text>
                    <StatusPill label={PAYMENT_STATE[x.status].label} tone={PAYMENT_STATE[x.status].tone} />
                  </View>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {PAYMENT_METHOD[x.method]}
                    {x.referenceNumber ? ` · ${x.referenceNumber}` : ''} · paid {formatDate(x.paymentDate)}
                  </Text>
                  {x.status === 'rejected' && x.reviewNote ? (
                    <Text style={[type.caption, { color: colors.error }]}>Reason: {x.reviewNote}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        <View>
          <SectionTitle>Progress</SectionTitle>
          <OrderProgress status={order.status} reached={reached} />
        </View>

        <View>
          <SectionTitle>Items</SectionTitle>
          <QuotationBreakdown q={order} />
        </View>

        <View>
          <SectionTitle>Delivery</SectionTitle>
          <View style={cardStyle}>
            <KeyValue label="Expected delivery" value={formatDate(order.expectedDelivery) || 'We’ll confirm the date'} />
            <KeyValue label="Project location" value={order.projectLocation} />
            <KeyValue label="Deliver to" value={order.deliveryAddress} />
            <KeyValue label="Terms" value={order.terms} />
          </View>
        </View>

        <View>
          <SectionTitle>Files</SectionTitle>
          <DocumentsSection
            ownerType="order"
            ownerId={order.id}
            documents={order.documents}
            uploadTypes={order.status === 'cancelled' ? [] : CUSTOMER_DOCUMENT_TYPES}
            onChanged={load}
          />
        </View>

        <View>
          <SectionTitle>History</SectionTitle>
          <View style={cardStyle}>
            {order.events.map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', gap: spacing.md }}>
                <Text style={[type.caption, { color: colors.textSecondary, width: 84 }]}>{formatDate(e.createdAt)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.textPrimary }]}>
                    {e.event === 'STATUS' && e.toStatus ? ORDER_STATUS[e.toStatus].label : (ORDER_EVENT_LABEL[e.event] ?? e.event)}
                  </Text>
                  {e.note ? <Text style={[type.caption, { color: colors.textSecondary }]}>{e.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>

        <SecondaryButton
          label="View quotation"
          onPress={() => router.push({ pathname: '/quotation/[id]', params: { id: order.quotationId } })}
        />
        <ChatButton label="Chat with DEV about this order" kind="order" refId={order.id} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
});
