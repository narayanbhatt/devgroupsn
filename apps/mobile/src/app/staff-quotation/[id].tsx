import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { cardStyle, MoneyRow, QuotationBreakdown, StatusPill } from '@/components/commercial';
import { FormError, FormNotice, FormScreen, TextField } from '@/components/form';
import { CreateOrderButton, OrderForQuotation, QuotationPdfButton } from '@/components/orders';
import { Body, CTAButton, ErrorState, H1, LoadingState, SecondaryButton, SectionTitle } from '@/components/ui';
import {
  formatDate,
  parseAmount,
  parseIndianDate,
  QUOTATION_STATUS_STAFF,
  quotationTotals,
  todayInIndia,
} from '@/data/commercial';
import { fetchQuotation, type Quotation } from '@/data/enquiries';
import { hasRole, useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/use-async';
import { colors, spacing, type } from '@/theme/tokens';

/** A quotation as staff see it: an editor while it's a draft, read-only once sent (§16, §47). */
export default function StaffQuotationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staffRoles } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const { state, retry } = useAsync(() => fetchQuotation(id), `${id}:${attempt}`);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  const q = state.data;
  if (!q) return <ErrorState message="This quotation no longer exists." onRetry={() => router.back()} />;

  if (q.status === 'draft' && hasRole(staffRoles, 'order_manager')) {
    return <Editor key={`${q.id}:${attempt}`} q={q} onSent={() => setAttempt((n) => n + 1)} />;
  }
  return (
    <>
      <Stack.Screen options={{ title: `${q.number} v${q.version}` }} />
      <FormScreen>
        <H1>
          {q.number} v{q.version}
        </H1>
        <StatusPill label={QUOTATION_STATUS_STAFF[q.status]} tone={q.status === 'approved' ? 'success' : 'info'} />
        <Body muted>
          {q.sentAt ? `Sent ${formatDate(q.sentAt)}` : 'Not sent'}
          {q.validUntil ? ` · valid until ${formatDate(q.validUntil)}` : ''}
        </Body>
        {q.responseNote ? <FormNotice message={`Customer: “${q.responseNote}”`} /> : null}
        <QuotationBreakdown q={q} />
        {q.notes ? <Body>{q.notes}</Body> : null}
        {q.terms ? <Body muted>{q.terms}</Body> : null}
        {q.status === 'approved' && hasRole(staffRoles, 'order_manager') && <CreateOrderButton quotationId={q.id} />}
        {q.status === 'converted' && <OrderForQuotation quotationId={q.id} staff />}
        <QuotationPdfButton quotationId={q.id} />
        <Body muted>A sent quotation can’t be changed. To change prices, create a revision from the enquiry.</Body>
      </FormScreen>
    </>
  );
}

interface Line {
  key: string;
  id: string | null;
  productId: string | null;
  sku: string | null;
  unit: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

const isoToIndian = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
const money = (n: number) => (n ? String(n) : '');

function Editor({ q, onSent }: { q: Quotation; onSent: () => void }) {
  const [lines, setLines] = useState<Line[]>(() =>
    q.items.map((i) => ({
      key: i.id,
      id: i.id,
      productId: i.productId,
      sku: i.sku,
      unit: i.unit,
      description: i.description,
      quantity: String(i.quantity),
      unitPrice: money(i.unitPrice),
      taxRate: String(i.taxRate),
    })),
  );
  const [charges, setCharges] = useState({
    discount: money(q.discount),
    delivery: money(q.delivery),
    installation: money(q.installation),
    otherCharges: money(q.otherCharges),
  });
  const [validUntil, setValidUntil] = useState(isoToIndian(q.validUntil));
  const [terms, setTerms] = useState(q.terms ?? '');
  const [notes, setNotes] = useState(q.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLine = (key: string, k: keyof Line, v: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));
  const setCharge = (k: keyof typeof charges) => (v: string) => setCharges((c) => ({ ...c, [k]: v }));

  // Live preview; the server recalculates the stored totals the same way.
  const preview = quotationTotals(
    lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPrice: parseAmount(l.unitPrice) ?? 0, taxRate: Number(l.taxRate) || 0 })),
    {
      discount: parseAmount(charges.discount) ?? 0,
      delivery: parseAmount(charges.delivery) ?? 0,
      installation: parseAmount(charges.installation) ?? 0,
      otherCharges: parseAmount(charges.otherCharges) ?? 0,
    },
  );

  /** Validates and writes the draft. Returns false (with an error shown) if something is wrong. */
  async function save(): Promise<boolean> {
    if (lines.length === 0) return fail('Add at least one item.');
    for (const l of lines) {
      if (!l.description.trim()) return fail('Every item needs a description.');
      const qty = Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return fail(`Enter a quantity for ${l.description}.`);
      if (parseAmount(l.unitPrice) == null) return fail(`Check the price of ${l.description}.`);
      const t = Number(l.taxRate);
      if (!Number.isFinite(t) || t < 0 || t > 100) return fail(`GST for ${l.description} must be 0 to 100.`);
    }
    const c = {
      discount: parseAmount(charges.discount),
      delivery: parseAmount(charges.delivery),
      installation: parseAmount(charges.installation),
      other_charges: parseAmount(charges.otherCharges),
    };
    if (Object.values(c).some((v) => v == null)) return fail('Check the extra charges and discount: numbers only.');
    const until = parseIndianDate(validUntil);
    if (!until) return fail('Enter valid-until as DD/MM/YYYY.');

    setBusy(true);
    setError(null);
    const db = supabase!;
    const keepIds = new Set(lines.filter((l) => l.id).map((l) => l.id));
    const removed = q.items.filter((i) => !keepIds.has(i.id)).map((i) => i.id);
    const results = await Promise.all([
      db.from('quotations').update({ ...c, valid_until: until, terms: terms.trim() || null, notes: notes.trim() || null }).eq('id', q.id),
      removed.length ? db.from('quotation_items').delete().in('id', removed) : Promise.resolve({ error: null }),
      ...lines.map((l, i) => {
        const row = {
          description: l.description.trim(),
          quantity: Number(l.quantity),
          unit_price: parseAmount(l.unitPrice) ?? 0,
          tax_rate: Number(l.taxRate),
          sort_order: i,
        };
        return l.id
          ? db.from('quotation_items').update(row).eq('id', l.id)
          : db.from('quotation_items').insert({ ...row, quotation_id: q.id, unit: l.unit, product_id: l.productId, sku: l.sku });
      }),
    ]);
    setBusy(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) return fail(friendlyError(failed.error));
    return true;
  }

  function fail(msg: string) {
    setError(msg);
    return false;
  }

  async function onSave() {
    if (await save()) {
      Alert.alert('Draft saved', 'The customer can’t see it until you send it.');
      onSent();
    }
  }

  function onSend() {
    Alert.alert(
      'Send to the customer?',
      `Total ${preview.grandTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}. After sending, prices can only change through a new version.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            if (!(await save())) return;
            setBusy(true);
            const { error: e } = await supabase!.rpc('send_quotation', { q: q.id });
            setBusy(false);
            if (e) return setError(friendlyError(e));
            Alert.alert('Quotation sent', `${q.number} v${q.version} is now with the customer.`);
            onSent();
          },
        },
      ],
    );
  }

  function onDelete() {
    Alert.alert('Delete this draft?', 'You can start a new one from the enquiry.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase!.from('quotations').delete().eq('id', q.id);
          if (e) return setError(friendlyError(e));
          router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: `Draft ${q.number} v${q.version}` }} />
      <FormScreen>
        <Body muted>Draft. Only staff can see it. Prices start at the listed price; set the quoted price for each item.</Body>
        <FormError message={error} />

        <SectionTitle>Items</SectionTitle>
        {lines.map((l) => (
          <View key={l.key} style={[cardStyle, { gap: spacing.sm }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField label="Description" value={l.description} onChangeText={(v) => setLine(l.key, 'description', v)} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${l.description}`}
                hitSlop={8}
                onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                style={styles.remove}>
                <Text style={[type.h3, { color: colors.error }]}>×</Text>
              </Pressable>
            </View>
            <View style={styles.row3}>
              <View style={{ flex: 1 }}>
                <TextField label={`Qty (${l.unit})`} value={l.quantity} onChangeText={(v) => setLine(l.key, 'quantity', v)} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1.4 }}>
                <TextField label="Unit price ₹" value={l.unitPrice} onChangeText={(v) => setLine(l.key, 'unitPrice', v)} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 0.8 }}>
                <TextField label="GST %" value={l.taxRate} onChangeText={(v) => setLine(l.key, 'taxRate', v)} keyboardType="decimal-pad" />
              </View>
            </View>
          </View>
        ))}
        <SecondaryButton
          label="Add a line"
          onPress={() =>
            setLines((ls) => [
              ...ls,
              { key: `new-${Date.now()}`, id: null, productId: null, sku: null, unit: 'piece', description: '', quantity: '1', unitPrice: '', taxRate: '18' },
            ])
          }
        />

        <SectionTitle>Charges</SectionTitle>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <TextField label="Delivery ₹" value={charges.delivery} onChangeText={setCharge('delivery')} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Installation ₹" value={charges.installation} onChangeText={setCharge('installation')} keyboardType="decimal-pad" />
          </View>
        </View>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <TextField label="Other charges ₹" value={charges.otherCharges} onChangeText={setCharge('otherCharges')} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Discount ₹" value={charges.discount} onChangeText={setCharge('discount')} keyboardType="decimal-pad" />
          </View>
        </View>
        <Body muted>GST is added per item. Delivery, installation and other charges are added as entered.</Body>

        <View style={cardStyle}>
          <MoneyRow label="Subtotal" amount={preview.subtotal} />
          <MoneyRow label="GST" amount={preview.tax} />
          <MoneyRow label="Total" amount={preview.grandTotal} strong />
        </View>

        <SectionTitle>Terms</SectionTitle>
        <TextField
          label="Valid until"
          value={validUntil}
          onChangeText={setValidUntil}
          placeholder="DD/MM/YYYY"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          hint={`Today is ${formatDate(todayInIndia())}`}
        />
        <TextField label="Terms" value={terms} onChangeText={setTerms} multiline />
        <TextField label="Note to the customer (optional)" value={notes} onChangeText={setNotes} multiline />

        <CTAButton label={busy ? 'Working…' : 'Send to customer'} onPress={onSend} disabled={busy} />
        <SecondaryButton label="Save draft" onPress={onSave} />
        <Pressable accessibilityRole="button" onPress={onDelete} style={{ alignSelf: 'center', padding: spacing.sm }}>
          <Text style={[type.body, { color: colors.error }]}>Delete draft</Text>
        </Pressable>
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: spacing.md },
  row3: { flexDirection: 'row', gap: spacing.sm },
  remove: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
