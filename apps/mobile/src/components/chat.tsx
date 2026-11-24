import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { CTAButton, EmptyState, ErrorState, LoadingState, SecondaryButton } from '@/components/ui';
import { fetchConversations, openConversation, type ChatSubject, type ConversationSummary } from '@/data/chat';
import { chatTitle, listTimeLabel, subjectLabel } from '@/data/chat-rules';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

/** Opens (or starts) the chat about something and shows it. */
export async function goToChat(kind: ChatSubject = 'general', ref?: string | null, forCustomer?: string) {
  try {
    const id = await openConversation(kind, ref, forCustomer);
    router.push({ pathname: '/conversation/[id]', params: { id } });
  } catch (e) {
    Alert.alert('Could not open the chat', e instanceof Error ? e.message : 'Please try again.');
  }
}

/** A "Chat" button that opens the conversation about an enquiry, order or nothing in particular. */
export function ChatButton({
  label,
  kind = 'general',
  refId,
  forCustomer,
}: {
  label: string;
  kind?: ChatSubject;
  refId?: string | null;
  forCustomer?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <SecondaryButton
      label={busy ? 'Opening chat…' : label}
      onPress={async () => {
        if (busy) return;
        setBusy(true);
        await goToChat(kind, refId, forCustomer);
        setBusy(false);
      }}
    />
  );
}

/** The chat list for either side: customers see their chats with DEV, staff see every customer. */
export function ConversationList({ staff }: { staff?: boolean }) {
  const { profile } = useAuth();
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    fetchConversations()
      .then((l) => {
        if (cancelled) return;
        // Customers see empty chats they opened; staff only see chats with messages.
        setList(l.filter((c) => c.lastMessageAt || !staff));
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [staff]);
  useFocusEffect(load);

  if (!isSupabaseConfigured) return <EmptyState title="Chat" hint="Connect the app to the server to chat." />;
  if (error && !list) return <ErrorState message={error} onRetry={load} />;
  if (!list) return <LoadingState />;

  const hasGeneral = list.some((c) => c.subjectType === 'general' && c.customerId === profile?.id);
  return (
    <FlatList
      style={styles.root}
      data={list}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          colors={[colors.brandSecondary]}
        />
      }
      ListHeaderComponent={
        !staff && !hasGeneral && list.length > 0 ? (
          <View style={{ marginBottom: spacing.sm }}>
            <SecondaryButton label="+ New message to DEV Group" onPress={() => goToChat('general')} />
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        staff ? (
          <EmptyState title="No chats yet" hint="When a customer sends a message, it shows up here." />
        ) : (
          <View style={{ gap: spacing.lg }}>
            <EmptyState
              title="Chat with DEV Group"
              hint="Ask about products, prices, delivery or anything else. You can also chat about a specific enquiry or order from its page."
            />
            <CTAButton label="Send a message" onPress={() => goToChat('general')} />
          </View>
        )
      }
      renderItem={({ item }) => <ConversationRow item={item} staff={!!staff} me={profile?.id} />}
    />
  );
}

function ConversationRow({ item, staff, me }: { item: ConversationSummary; staff: boolean; me?: string }) {
  const unread = item.unread > 0;
  const mine = item.lastSenderId === me;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${chatTitle(item, staff)}${unread ? `, ${item.unread} unread` : ''}`}
      onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'baseline' }}>
          <Text style={[type.body, styles.title, unread && { fontWeight: '700' }]} numberOfLines={1}>
            {chatTitle(item, staff)}
          </Text>
          <Text style={[type.caption, { color: unread ? colors.brandSecondary : colors.textSecondary }]}>
            {listTimeLabel(item.lastMessageAt)}
          </Text>
        </View>
        {(staff || item.subjectType !== 'general') && (
          <Text style={[type.caption, { color: colors.info }]}>{subjectLabel(item.subjectType, item.subjectNumber)}</Text>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Text
            style={[type.caption, { flex: 1, color: unread ? colors.textPrimary : colors.textSecondary }]}
            numberOfLines={1}>
            {item.lastMessagePreview ? `${mine ? 'You: ' : ''}${item.lastMessagePreview}` : 'No messages yet'}
          </Text>
          {unread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  row: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: minTouch,
  },
  title: { flex: 1, color: colors.textPrimary, fontWeight: '600' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.brandSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...type.caption, color: colors.textOnBrand, fontWeight: '700' },
});
