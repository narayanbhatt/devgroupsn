import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { ChatButton } from '@/components/chat';
import { cardStyle, KeyValue, MoneyRow, QuotationBreakdown, StatusPill } from '@/components/commercial';
import { FormError, FormScreen, TextField } from '@/components/form';
import { DocumentsSection, OrderProgress } from '@/components/orders';
import { Body, CTAButton, EmptyState, ErrorState, H1, LoadingState, SecondaryButton, SectionTitle } from '@/components/ui';
import { formatDate, parseIndianDate } from '@/data/commercial';
import { openDocument } from '@/data/documents';
import {
  amountDue,
  MOVE_LABEL,
  ORDER_EVENT_LABEL,
  ORDER_MOVES,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATE,
  PAYMENT_STATUS,
  type DocumentType,
  type OrderStatus,
} from '@/data/order-rules';
import { fetchOrder, type Order, type Payment } from '@/data/orders';
import { hasRole, useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, spacing, type } from '@/theme/tokens';

const STAFF_DOCUMENT_TYPES: DocumentType[] = ['INVOICE', 'DELIVERY_DOCUMENT', 'PURCHASE_ORDER', 'PROJECT_DOCUMENT', 'OTHER'];

/** A03 Order detail for staff: stages, payments to verify, files, notes (§30). */
export default function StaffOrderScreen() {
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
  return <Detail key={order.id} order={order} reload={load} />;
}

function Detail({ order, reload }: { order: Order; reload: () => void }) {
  const { staffRoles } = useAuth();
  const canMove = hasRole(staffRoles, 'order_manager') || hasRole(staffRoles, 'project_manager');
  const canEdit = hasRole(staffRoles, 'order_manager');
  const isFinance = hasRole(staffRoles, 'finance');
  const [note, setNote] = useState('');
  const [internal, setInternal] = useState(true);
  const [delivery, setDelivery] = useState(order.expectedDelivery ? order.expectedDelivery.split('-').reverse().join('/') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = ORDER_STATUS[order.status];
  const p = PAYMENT_STATUS[order.paymentStatus];
  const reached = order.events.map((e) => e.toStatus).filter((x): x is OrderStatus => x != null);
  const due = amountDue(order.grandTotal, order.paidAmount);

  async function run(fn: () => PromiseLike<{ error: { message: string; code?: string } | null }>, done?: () => void) {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) return setError(friendlyError(e));
    done?.();
    reload();
  }

  function move(to: OrderStatus) {
    const needsNote = to === 'cancelled' || to === 'disputed';
    if (needsNote && !note.trim()) {
      return setError(`Write why in the note box below, then tap “${MOVE_LABEL[to]}” again.`);
    }
    Alert.alert(MOVE_LABEL[to], `Move ${order.number} to “${ORDER_STATUS[to].staff}”? The customer sees this.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        style: to === 'cancelled' ? 'destructive' : 'default',
        onPress: () =>
          void run(
            () => supabase!.rpc('set_order_status', { o: order.id, new_status: to, note: note.trim() || null }),
            () => setNote(''),
          ),
      },
    ]);
  }

  function review(pay: Payment, decision: 'verify' | 'reject') {
    if (decision === 'reject' && !note.trim()) {
      return setError('Write the reason in the note box below (the customer sees it), then tap Reject again.');
    }
    Alert.alert(
      decision === 'verify' ? 'Verify this payment?' : 'Reject this payment?',
      `${formatINR(pay.amount)} · ${pay.referenceNumber ?? ''}\nCheck it has reached the bank account first.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'verify' ? 'Verify' : 'Reject',
          style: decision === 'reject' ? 'destructive' : 'default',
          onPress: () =>
            void run(
              () => supabase!.rpc('review_payment', { p: pay.id, decision, note: decision === 'reject' ? note.trim() : null }),
              () => setNote(''),
            ),
        },
      ],
    );
  }

  function saveDelivery() {
    const iso = delivery.trim() ? parseIndianDate(delivery) : null;
    if (delivery.trim() && !iso) return setError('Enter the expected delivery date as DD/MM/YYYY.');
    void run(() => supabase!.from('orders').update({ expected_delivery: iso }).eq('id', order.id));
  }

  function addNote() {
    if (!note.trim()) return setError('Write a note first.');
    void run(
      () => supabase!.rpc('add_order_note', { o: order.id, note: note.trim(), internal }),
      () => setNote(''),
    );
  }

  const proof = (pay: Payment) => order.documents.find((d) => d.id === pay.proofDocumentId);

  return (
    <>
      <Stack.Screen options={{ title: order.number }} />
      <FormScreen>
        <View style={{ gap: spacing.xs }}>
          <H1>{order.number}</H1>
          <Body>
            {order.organizationName ? `${order.organizationName} · ` : ''}
            {order.customerName ?? 'Customer'}
          </Body>
          {order.customerEmail ? <Body muted>{order.customerEmail}</Body> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatusPill label={s.staff} tone={s.tone} />
            <StatusPill label={p.label} tone={p.tone} />
          </View>
        </View>
        <FormError message={error} />

        <SectionTitle>Stage</SectionTitle>
        <OrderProgress status={order.status} reached={reached} />
        {canMove && ORDER_MOVES[order.status].length > 0 && (
          <View style={{ gap: spacing.sm }}>
            {ORDER_MOVES[order.status].map((to) =>
              to === 'cancelled' || to === 'disputed' ? (
                <SecondaryButton key={to} label={MOVE_LABEL[to]} onPress={() => move(to)} />
              ) : (
                <CTAButton key={to} label={busy ? 'Saving…' : MOVE_LABEL[to]} onPress={() => move(to)} disabled={busy} />
              ),
            )}
            {order.status === 'payment_pending' && order.paidAmount === 0 && (
              <Body muted>No verified payment yet. Confirm only if the terms allow work to start before payment.</Body>
            )}
          </View>
        )}

        <SectionTitle>Payments</SectionTitle>
        <View style={cardStyle}>
          <MoneyRow label="Order total" amount={order.grandTotal} />
          <MoneyRow label="Verified" amount={order.paidAmount} />
          <MoneyRow label="Due" amount={due} strong />
        </View>
        {order.payments.length === 0 && <Body muted>The customer hasn’t sent payment details yet.</Body>}
        {order.payments.map((pay) => {
          const doc = proof(pay);
          return (
            <View key={pay.id} style={cardStyle}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[type.h3, { color: colors.textPrimary }]}>{formatINR(pay.amount)}</Text>
                <StatusPill label={PAYMENT_STATE[pay.status].label} tone={PAYMENT_STATE[pay.status].tone} />
              </View>
              <KeyValue label="Method" value={PAYMENT_METHOD[pay.method]} />
              <KeyValue label="Reference" value={pay.referenceNumber} />
              <KeyValue label="Paid on" value={formatDate(pay.paymentDate)} />
              <KeyValue label="Customer’s note" value={pay.notes} />
              <KeyValue label="Review note" value={pay.reviewNote} />
              {doc && (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => openDocument(doc.path).catch((e: Error) => Alert.alert('Could not open', e.message))}>
                  <Text style={[type.body, { color: colors.info }]}>Open proof: {doc.filename}</Text>
                </Pressable>
              )}
              {isFinance && pay.status === 'submitted' && (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <CTAButton label="Verify" onPress={() => review(pay, 'verify')} disabled={busy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <SecondaryButton label="Reject" onPress={() => review(pay, 'reject')} />
                  </View>
                </View>
              )}
            </View>
          );
        })}
        {isFinance && due > 0 && order.status !== 'cancelled' && (
          <SecondaryButton
            label="Record a payment for the customer"
            onPress={() => router.push({ pathname: '/order-payment/[id]', params: { id: order.id } })}
          />
        )}

        <SectionTitle>Items</SectionTitle>
        <QuotationBreakdown q={order} />

        <SectionTitle>Delivery</SectionTitle>
        <View style={cardStyle}>
          <KeyValue label="Project" value={order.projectName} />
          <KeyValue label="Location" value={order.projectLocation} />
          <KeyValue label="Deliver to" value={order.deliveryAddress} />
          <KeyValue label="Terms" value={order.terms} />
        </View>
        {canEdit ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <TextField label="Expected delivery" value={delivery} onChangeText={setDelivery} placeholder="DD/MM/YYYY" />
            </View>
            <View style={{ width: 96 }}>
              <SecondaryButton label="Save" onPress={saveDelivery} />
            </View>
          </View>
        ) : (
          <KeyValue label="Expected delivery" value={formatDate(order.expectedDelivery)} />
        )}

        <ChatButton label="Chat with customer about this order" kind="order" refId={order.id} />

        <SectionTitle>Files</SectionTitle>
        <DocumentsSection
          ownerType="order"
          ownerId={order.id}
          documents={order.documents}
          uploadTypes={STAFF_DOCUMENT_TYPES}
          staff
          onChanged={reload}
        />

        <SectionTitle>Note</SectionTitle>
        <TextField
          label="Note"
          value={note}
          onChangeText={setNote}
          multiline
          hint="Also used as the reason when you cancel, mark disputed or reject a payment."
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.body, { color: colors.textPrimary }]}>Staff only</Text>
          <Switch value={internal} onValueChange={setInternal} />
        </View>
        <SecondaryButton label="Add note" onPress={addNote} />

        <SectionTitle>History</SectionTitle>
        <View style={cardStyle}>
          {order.events.map((e) => (
            <View key={e.id} style={{ flexDirection: 'row', gap: spacing.md }}>
              <Text style={[type.caption, { color: colors.textSecondary, width: 84 }]}>{formatDate(e.createdAt)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: colors.textPrimary }]}>
                  {e.event === 'STATUS' && e.toStatus
                    ? `${e.fromStatus ? ORDER_STATUS[e.fromStatus].staff + ' → ' : ''}${ORDER_STATUS[e.toStatus].staff}`
                    : (ORDER_EVENT_LABEL[e.event] ?? e.event)}
                  {e.internal ? ' · staff only' : ''}
                </Text>
                {e.note ? <Text style={[type.caption, { color: colors.textSecondary }]}>{e.note}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        <SecondaryButton
          label="Open enquiry"
          onPress={() => router.push({ pathname: '/staff-enquiry/[id]', params: { id: order.enquiryId } })}
        />
        <SecondaryButton
          label="Open quotation"
          onPress={() => router.push({ pathname: '/staff-quotation/[id]', params: { id: order.quotationId } })}
        />
      </FormScreen>
    </>
  );
}
