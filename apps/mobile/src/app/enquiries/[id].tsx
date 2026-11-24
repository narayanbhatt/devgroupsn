import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cardStyle, KeyValue, StatusPill } from '@/components/commercial';
import { FormNotice } from '@/components/form';
import { Body, CTAButton, EmptyState, ErrorState, H1, LoadingState, SecondaryButton, SectionTitle } from '@/components/ui';
import { canAnswer, ENQUIRY_STATUS, formatDate, QUOTATION_STATUS } from '@/data/commercial';
import { EVENT_LABEL, fetchEnquiry, type Enquiry } from '@/data/enquiries';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, spacing, type } from '@/theme/tokens';

// Internal steps customers don't need to see in their timeline.
const HIDDEN_EVENTS = new Set(['QUOTATION_CREATED', 'VERSION_CREATED']);
const CANCELLABLE = new Set(['submitted', 'under_review', 'requirement_clarification', 'quote_preparation', 'quoted', 'revision_requested', 'expired']);

/** Enquiry detail for the customer: status, what was asked for, quotations, timeline. */
export default function EnquiryScreen() {
  const { id, sent } = useLocalSearchParams<{ id: string; sent?: string }>();
  const [enquiry, setEnquiry] = useState<Enquiry | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    fetchEnquiry(id)
      .then((e) => {
        if (cancelled) return;
        setEnquiry(e);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);
  useFocusEffect(load);

  if (error && enquiry === undefined) return <ErrorState message={error} onRetry={load} />;
  if (enquiry === undefined) return <LoadingState />;
  if (enquiry === null) return <EmptyState title="Enquiry not found" />;

  const s = ENQUIRY_STATUS[enquiry.status];
  const current = enquiry.quotations[0];

  function onCancel() {
    Alert.alert('Cancel this enquiry?', 'Any quotation for it will be withdrawn.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel enquiry',
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase!.rpc('cancel_enquiry', { e: enquiry!.id, reason: null });
          if (e) Alert.alert('Could not cancel', friendlyError(e));
          load();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      {sent === '1' && (
        <FormNotice message={`Enquiry ${enquiry.number} sent. We’ll review it and send you a quotation here. You’ll also find it under Orders.`} />
      )}
      <View style={{ gap: spacing.xs }}>
        <H1>{enquiry.number}</H1>
        {enquiry.projectName ? <Body>{enquiry.projectName}</Body> : null}
        <StatusPill label={s.label} tone={s.tone} />
        <Body muted>{s.hint}</Body>
      </View>

      {current && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/quotation/[id]', params: { id: current.id } })}
          style={[cardStyle, { borderColor: canAnswer(current.status, current.validUntil) ? colors.brandSecondary : colors.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.body, { color: colors.textPrimary, fontWeight: '700' }]}>
              Quotation {current.number} v{current.version}
            </Text>
            <Text style={[type.body, { color: colors.info }]}>Open ›</Text>
          </View>
          <Text style={[type.h3, { color: colors.textPrimary }]}>{formatINR(current.grandTotal)}</Text>
          <StatusPill label={QUOTATION_STATUS[current.status].label} tone={QUOTATION_STATUS[current.status].tone} />
          {current.validUntil && <Body muted>Valid until {formatDate(current.validUntil)}</Body>}
        </Pressable>
      )}

      <View>
        <SectionTitle>Products</SectionTitle>
        <View style={cardStyle}>
          {enquiry.items.map((i) => (
            <View key={i.id} style={{ gap: 2 }}>
              <Text style={[type.body, { color: colors.textPrimary }]}>
                {i.productName} × {i.quantity}
                {i.unit !== 'piece' ? ` ${i.unit}` : ''}
              </Text>
              {(i.installationRequired || i.notes) && (
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {[i.installationRequired ? 'Installation needed' : null, i.notes].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          ))}
        </View>
      </View>

      <View>
        <SectionTitle>Details</SectionTitle>
        <View style={cardStyle}>
          <KeyValue label="Contact" value={`${enquiry.contactPerson} · ${enquiry.phone}`} />
          <KeyValue label="Organization" value={enquiry.organizationName} />
          <KeyValue label="Project location" value={enquiry.projectLocation} />
          <KeyValue label="Deliver to" value={enquiry.deliveryAddress} />
          <KeyValue label="Required by" value={formatDate(enquiry.requiredBy)} />
          <KeyValue label="Requirements" value={enquiry.requirements} />
          <KeyValue label="Tender / procurement reference" value={enquiry.procurementReference} />
          <KeyValue label="Notes" value={enquiry.notes} />
        </View>
      </View>

      <View>
        <SectionTitle>Timeline</SectionTitle>
        <View style={cardStyle}>
          {enquiry.events
            .filter((e) => !HIDDEN_EVENTS.has(e.event))
            .map((e) => (
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

      <SecondaryButton label="Chat with DEV" onPress={() => router.navigate('/chat')} />
      {CANCELLABLE.has(enquiry.status) && (
        <Pressable accessibilityRole="button" onPress={onCancel} style={{ alignSelf: 'center', padding: spacing.sm }}>
          <Text style={[type.body, { color: colors.error }]}>Cancel enquiry</Text>
        </Pressable>
      )}
      {enquiry.status === 'approved' && (
        <CTAButton label="View approved quotation" onPress={() => router.push({ pathname: '/quotation/[id]', params: { id: current!.id } })} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
});
