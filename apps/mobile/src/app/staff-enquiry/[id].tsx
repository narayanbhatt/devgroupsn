import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cardStyle, KeyValue, StatusPill } from '@/components/commercial';
import { FormError, TextField } from '@/components/form';
import { DocumentsSection } from '@/components/orders';
import { Body, CTAButton, EmptyState, ErrorState, H1, LoadingState, SecondaryButton, SectionTitle } from '@/components/ui';
import { ENQUIRY_STATUS_STAFF, formatDate, QUOTATION_STATUS_STAFF, type EnquiryStatus } from '@/data/commercial';
import { EVENT_LABEL, fetchEnquiry, type Enquiry } from '@/data/enquiries';
import { hasRole, useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, spacing, type } from '@/theme/tokens';

const CLOSED: EnquiryStatus[] = ['approved', 'converted_to_order', 'cancelled', 'rejected'];
const REVISABLE = new Set(['sent', 'viewed', 'revision_requested', 'rejected', 'expired']);

/** A03 (enquiry part): everything the customer asked for, and the quotation workflow. */
export default function StaffEnquiryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staffRoles } = useAuth();
  const canQuote = hasRole(staffRoles, 'order_manager');
  const [enquiry, setEnquiry] = useState<Enquiry | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<'requirement_clarification' | 'rejected' | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    let cancelled = false;
    fetchEnquiry(id)
      .then((e) => {
        if (cancelled) return;
        setEnquiry(e);
        setLoadError(null);
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);
  useFocusEffect(load);

  if (loadError && enquiry === undefined) return <ErrorState message={loadError} onRetry={load} />;
  if (enquiry === undefined) return <LoadingState />;
  if (enquiry === null) return <EmptyState title="Enquiry not found" />;

  const closed = CLOSED.includes(enquiry.status);
  const latest = enquiry.quotations[0];

  /** Runs a workflow function; returns ok and its result. */
  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase!.rpc(fn, args);
    setBusy(false);
    if (e) {
      setError(friendlyError(e));
      return { ok: false, data: null };
    }
    load();
    return { ok: true, data: data as unknown };
  }

  async function setStatus(status: EnquiryStatus, n: string | null = null) {
    const r = await call('set_enquiry_status', { e: enquiry!.id, new_status: status, note: n });
    if (r.ok) {
      setNoteFor(null);
      setNote('');
    }
  }

  async function onQuote() {
    let q: string | null = null;
    if (latest?.status === 'draft') q = latest.id;
    else if (latest) q = (await call('create_quotation_revision', { q: latest.id })).data as string | null;
    else q = (await call('create_quotation', { e: enquiry!.id })).data as string | null;
    if (q) router.push({ pathname: '/staff-quotation/[id]', params: { id: q } });
  }

  const quoteLabel = !latest
    ? 'Prepare quotation'
    : latest.status === 'draft'
      ? `Continue draft ${latest.number} v${latest.version}`
      : REVISABLE.has(latest.status)
        ? `Create revision v${latest.version + 1}`
        : null;

  return (
    <>
      <Stack.Screen options={{ title: enquiry.number }} />
      <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <H1>{enquiry.organizationName || enquiry.customerName || 'Customer'}</H1>
          <StatusPill label={ENQUIRY_STATUS_STAFF[enquiry.status]} tone="info" />
          <Body muted>
            {enquiry.number} · received {formatDate(enquiry.submittedAt)}
          </Body>
        </View>

        <FormError message={error} />

        {canQuote && !closed && (
          <View style={{ gap: spacing.sm }}>
            {quoteLabel && <CTAButton label={busy ? 'Working…' : quoteLabel} onPress={onQuote} disabled={busy} />}
            {enquiry.status === 'submitted' && (
              <SecondaryButton label="Mark under review" onPress={() => setStatus('under_review')} />
            )}
            {noteFor ? (
              <>
                <TextField
                  label={noteFor === 'rejected' ? 'Reason (the customer sees this)' : 'What do you need from the customer? (they see this)'}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  autoFocus
                />
                <CTAButton
                  label={noteFor === 'rejected' ? 'Reject enquiry' : 'Ask for details'}
                  onPress={() => (note.trim() ? setStatus(noteFor, note.trim()) : setError('Add a short note for the customer.'))}
                  disabled={busy}
                />
                <SecondaryButton label="Back" onPress={() => setNoteFor(null)} />
              </>
            ) : (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <SecondaryButton label="Need details" onPress={() => setNoteFor('requirement_clarification')} />
                </View>
                <View style={{ flex: 1 }}>
                  <SecondaryButton
                    label="Reject"
                    onPress={() =>
                      Alert.alert('Reject this enquiry?', 'The customer will see it as closed.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Continue', style: 'destructive', onPress: () => setNoteFor('rejected') },
                      ])
                    }
                  />
                </View>
              </View>
            )}
          </View>
        )}
        {!canQuote && <Body muted>Only order managers can prepare quotations or change this enquiry.</Body>}

        {enquiry.quotations.length > 0 && (
          <View>
            <SectionTitle>Quotations</SectionTitle>
            <View style={cardStyle}>
              {enquiry.quotations.map((q) => (
                <Pressable
                  key={q.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/staff-quotation/[id]', params: { id: q.id } })}
                  style={styles.qRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]}>
                      {q.number} v{q.version}
                    </Text>
                    <Text style={[type.caption, { color: colors.textSecondary }]}>
                      {QUOTATION_STATUS_STAFF[q.status]}
                      {q.validUntil ? ` · valid until ${formatDate(q.validUntil)}` : ''}
                    </Text>
                    {q.responseNote ? (
                      <Text style={[type.caption, { color: colors.warning }]}>Customer: “{q.responseNote}”</Text>
                    ) : null}
                  </View>
                  <Text style={[type.body, { color: colors.textPrimary }]}>{formatINR(q.grandTotal)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View>
          <SectionTitle>Requested products</SectionTitle>
          <View style={cardStyle}>
            {enquiry.items.map((i) => (
              <View key={i.id} style={{ gap: 2 }}>
                <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]}>
                  {i.productName} × {i.quantity} {i.unit}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {[
                    i.sku,
                    i.listedPrice != null ? `listed ${formatINR(i.listedPrice)}` : 'price on quotation',
                    i.installationRequired ? 'installation needed' : null,
                    i.notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View>
          <SectionTitle>Customer</SectionTitle>
          <View style={cardStyle}>
            <KeyValue label="Account" value={[enquiry.customerName, enquiry.customerEmail, enquiry.customerType].filter(Boolean).join(' · ')} />
            <KeyValue label="Contact person" value={enquiry.contactPerson} />
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${enquiry.phone}`)}>
              <KeyValue label="Phone (tap to call)" value={enquiry.phone} />
            </Pressable>
            <KeyValue label="Email" value={enquiry.email} />
            <KeyValue label="Organization" value={enquiry.organizationName} />
            <KeyValue label="Department" value={enquiry.department} />
            <KeyValue label="Designation" value={enquiry.designation} />
            <KeyValue label="Tender / procurement reference" value={enquiry.procurementReference} />
            {enquiry.poRequired && <KeyValue label="Purchase order" value="Customer will issue a PO" />}
          </View>
        </View>

        <View>
          <SectionTitle>Project</SectionTitle>
          <View style={cardStyle}>
            <KeyValue label="Project" value={enquiry.projectName} />
            <KeyValue label="Location" value={enquiry.projectLocation} />
            <KeyValue label="Deliver to" value={enquiry.deliveryAddress} />
            <KeyValue label="Required by" value={formatDate(enquiry.requiredBy)} />
            <KeyValue label="Requirements" value={enquiry.requirements} />
            <KeyValue label="Notes" value={enquiry.notes} />
          </View>
        </View>

        <View>
          <SectionTitle>Files</SectionTitle>
          <DocumentsSection
            ownerType="enquiry"
            ownerId={enquiry.id}
            documents={enquiry.documents}
            uploadTypes={['PURCHASE_ORDER', 'PROJECT_DOCUMENT', 'OTHER']} staff
            onChanged={load}
          />
        </View>

        <View>
          <SectionTitle>History</SectionTitle>
          <View style={cardStyle}>
            {enquiry.events.map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', gap: spacing.md }}>
                <Text style={[type.caption, { color: colors.textSecondary, width: 84 }]}>{formatDate(e.createdAt)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.textPrimary }]}>{EVENT_LABEL[e.event] ?? e.event}</Text>
                  {e.note ? <Text style={[type.caption, { color: colors.textSecondary }]}>{e.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  qRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs, alignItems: 'center' },
});
