import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { cardStyle, KeyValue } from '@/components/commercial';
import { ChoiceField, FormError, FormScreen, TextField } from '@/components/form';
import { Body, CTAButton, EmptyState, ErrorState, LoadingState, SectionTitle } from '@/components/ui';
import { parseAmount, parseIndianDate, todayInIndia } from '@/data/commercial';
import { pickFile, uploadDocument, type PickedFile } from '@/data/documents';
import { amountDue, PAYMENT_METHOD, type PaymentMethod } from '@/data/order-rules';
import { fetchOrder } from '@/data/orders';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/use-async';
import { colors, type } from '@/theme/tokens';

interface PaymentDetails {
  account_name?: string;
  bank_name?: string;
  account_number?: string;
  ifsc?: string;
  upi_id?: string;
  note?: string;
}

const METHODS = (['bank_transfer', 'upi', 'cheque', 'other'] as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD[m] }));

/** Upload payment proof (§19): the customer tells us what they paid and shows the receipt. */
export default function OrderPaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, retry } = useAsync(async () => {
    const [order, cfg] = await Promise.all([
      fetchOrder(id),
      supabase!.from('app_config').select('value').eq('key', 'payment_details').maybeSingle(),
    ]);
    return { order, details: (cfg.data?.value ?? {}) as PaymentDetails };
  }, id);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (!state.data.order) return <ErrorState message="Order not found." onRetry={retry} />;
  const { order, details } = state.data;
  const pending = order.payments.filter((p) => p.status === 'submitted').reduce((t, p) => t + p.amount, 0);
  const due = Math.round((amountDue(order.grandTotal, order.paidAmount) - pending) * 100) / 100;
  if (due <= 0 || order.status === 'cancelled' || order.status === 'completed') {
    return (
      <EmptyState
        title="Nothing to pay right now"
        hint={pending > 0 ? 'We’re checking the payment you sent. You’ll see it on the order once it’s verified.' : 'This order has no amount due.'}
      />
    );
  }
  return <PaymentForm orderId={order.id} number={order.number} due={due} details={details} />;
}

function PaymentForm({ orderId, number, due, details }: { orderId: string; number: string; due: number; details: PaymentDetails }) {
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayInIndia().split('-').reverse().join('/'));
  const [notes, setNotes] = useState('');
  const [proof, setProof] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasBank = !!(details.account_number || details.upi_id);

  async function onPick() {
    try {
      const f = await pickFile();
      if (f) setProof(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  async function onSubmit() {
    const amt = parseAmount(amount);
    if (!amt || amt <= 0) return setError('Enter the amount you paid.');
    if (amt > due) return setError(`That is more than the ${formatINR(due)} due.`);
    const paidOn = parseIndianDate(date);
    if (!paidOn) return setError('Enter the payment date as DD/MM/YYYY.');
    if (!reference.trim()) return setError('Enter the UTR, transaction ID or cheque number.');
    if (!proof) return setError('Attach a screenshot, receipt or photo of the cheque.');
    setBusy(true);
    setError(null);
    try {
      const docId = await uploadDocument('order', orderId, 'PAYMENT_PROOF', proof);
      const { error: e } = await supabase!.rpc('submit_payment', {
        o: orderId,
        amount: amt,
        method,
        reference_number: reference.trim(),
        payment_date: paidOn,
        notes: notes.trim() || null,
        proof_document_id: docId,
      });
      if (e) throw new Error(friendlyError(e));
      Alert.alert('Payment details sent', 'Our accounts team will check it, usually within one working day.');
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the payment details.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Body>
        Order {number} · {formatINR(due)} due
      </Body>
      {hasBank ? (
        <View style={cardStyle}>
          <Text style={[type.body, { color: colors.textPrimary, fontWeight: '700' }]}>Pay DEV Group</Text>
          <KeyValue label="Account name" value={details.account_name} />
          <KeyValue label="Bank" value={details.bank_name} />
          <KeyValue label="Account number" value={details.account_number} />
          <KeyValue label="IFSC" value={details.ifsc} />
          <KeyValue label="UPI ID" value={details.upi_id} />
          {details.note ? <Body muted>{details.note}</Body> : null}
        </View>
      ) : (
        <Body muted>Ask us in Chat for our bank or UPI details if you don’t have them.</Body>
      )}

      <SectionTitle>What you paid</SectionTitle>
      <FormError message={error} />
      <TextField label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" hint="You can pay in parts, for example an advance." />
      <ChoiceField label="How you paid" value={method} options={METHODS} onChange={setMethod} />
      <TextField
        label={method === 'cheque' ? 'Cheque / DD number' : 'UTR or transaction ID'}
        value={reference}
        onChangeText={setReference}
        autoCapitalize="characters"
      />
      <TextField label="Date paid" value={date} onChangeText={setDate} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />

      <SectionTitle>Proof</SectionTitle>
      <Pressable accessibilityRole="button" onPress={onPick} style={[cardStyle, { alignItems: 'center' }]}>
        <Text style={[type.body, { color: proof ? colors.textPrimary : colors.brandPrimary, fontWeight: '600' }]}>
          {proof ? proof.name : '+ Attach screenshot, receipt or cheque photo'}
        </Text>
        {proof && <Text style={[type.caption, { color: colors.info }]}>Tap to change</Text>}
      </Pressable>

      <CTAButton label={busy ? 'Sending…' : 'Send payment details'} onPress={onSubmit} disabled={busy} />
    </FormScreen>
  );
}
