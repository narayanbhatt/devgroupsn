import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { QuotationBreakdown, StatusPill } from '@/components/commercial';
import { FormError, TextField } from '@/components/form';
import { OrderForQuotation, QuotationPdfButton } from '@/components/orders';
import { Body, CTAButton, ErrorState, H1, LoadingState, SecondaryButton, SectionTitle } from '@/components/ui';
import { canAnswer, formatDate, QUOTATION_STATUS } from '@/data/commercial';
import { fetchQuotation, type Quotation } from '@/data/enquiries';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/use-async';
import { colors, spacing } from '@/theme/tokens';

/** C06 Quotation (§17): lines, totals, validity; approve, ask for a revision, or decline. */
export default function QuotationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [attempt, setAttempt] = useState(0);
  const { state, retry } = useAsync(() => fetchQuotation(id), `${id}:${attempt}`);

  // Opening the quotation tells DEV Group it has been seen.
  useEffect(() => {
    supabase?.rpc('mark_quotation_viewed', { q: id }).then(() => undefined);
  }, [id]);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (!state.data) return <ErrorState message="This quotation isn’t available." onRetry={retry} />;
  return <Answer q={state.data} onChanged={() => setAttempt((n) => n + 1)} />;
}

function Answer({ q, onChanged }: { q: Quotation; onChanged: () => void }) {
  const [mode, setMode] = useState<'none' | 'revise' | 'reject'>('none');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = canAnswer(q.status, q.validUntil);
  const s = QUOTATION_STATUS[q.status];
  const expiredNow = (q.status === 'sent' || q.status === 'viewed') && !open;

  async function send(answer: 'approve' | 'revise' | 'reject') {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase!.rpc('answer_quotation', { q: q.id, answer, note: note.trim() || null });
    setBusy(false);
    if (e) return setError(friendlyError(e));
    if (data === 'expired') {
      Alert.alert('Quotation expired', 'This quotation is past its valid-until date. Ask us for a new one in Chat.');
    } else if (data === 'approved') {
      Alert.alert('Quotation approved', 'Thank you. We’ll confirm your order and share payment details.');
    } else {
      Alert.alert('Sent', answer === 'revise' ? 'We’ll prepare a revised quotation.' : 'We’ve recorded your answer.');
    }
    setMode('none');
    setNote('');
    onChanged();
  }

  function onApprove() {
    Alert.alert(
      'Approve this quotation?',
      `${q.number} v${q.version} for ${formatINR(q.grandTotal)}. Approving confirms you accept these prices and terms.`,
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Approve', onPress: () => send('approve') },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `${q.number} v${q.version}` }} />
      <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <H1>Quotation</H1>
          <Body muted>
            {q.number} · version {q.version}
          </Body>
          <StatusPill label={expiredNow ? 'Expired' : s.label} tone={expiredNow ? 'warning' : s.tone} />
          {q.validUntil && (
            <Body muted>
              Valid until {formatDate(q.validUntil)}
            </Body>
          )}
        </View>

        <QuotationBreakdown q={q} />

        {q.notes ? (
          <View>
            <SectionTitle>Notes from DEV Group</SectionTitle>
            <Body>{q.notes}</Body>
          </View>
        ) : null}
        {q.terms ? (
          <View>
            <SectionTitle>Terms</SectionTitle>
            <Body muted>{q.terms}</Body>
          </View>
        ) : null}
        {q.responseNote ? (
          <View>
            <SectionTitle>Your message</SectionTitle>
            <Body>{q.responseNote}</Body>
          </View>
        ) : null}

        <FormError message={error} />
        {open && mode === 'none' && (
          <View style={{ gap: spacing.sm }}>
            <CTAButton label={busy ? 'Sending…' : 'Approve quotation'} onPress={onApprove} disabled={busy} />
            <SecondaryButton label="Request revision" onPress={() => setMode('revise')} />
            <SecondaryButton label="Decline" onPress={() => setMode('reject')} />
          </View>
        )}
        {open && mode !== 'none' && (
          <View style={{ gap: spacing.sm }}>
            <TextField
              label={mode === 'revise' ? 'What should we change?' : 'Why are you declining? (helps us improve)'}
              value={note}
              onChangeText={setNote}
              multiline
              autoFocus
            />
            <CTAButton
              label={busy ? 'Sending…' : mode === 'revise' ? 'Send revision request' : 'Decline quotation'}
              onPress={() => (note.trim() ? send(mode) : setError('Please add a short note.'))}
              disabled={busy}
            />
            <SecondaryButton label="Back" onPress={() => setMode('none')} />
          </View>
        )}
        {expiredNow && <Body muted>This quotation has expired. Ask us for an updated one in Chat.</Body>}
        {q.status === 'converted' && <OrderForQuotation quotationId={q.id} />}
        <QuotationPdfButton quotationId={q.id} />
        <SecondaryButton label="Chat with DEV" onPress={() => router.navigate('/chat')} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
});
