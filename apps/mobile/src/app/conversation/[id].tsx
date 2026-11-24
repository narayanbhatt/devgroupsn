import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/ui';
import {
  fetchConversation,
  fetchConversations,
  fetchMessages,
  markRead,
  PAGE_SIZE,
  sendMessage,
  subscribeToMessages,
  type ChatMessage,
  type Conversation,
} from '@/data/chat';
import { chatTitle, dayLabel, MAX_MESSAGE_LENGTH, mergeMessages, startsNewDay, subjectLabel, timeLabel } from '@/data/chat-rules';
import { formatBytes, openDocument, pickFile, type PickedFile } from '@/data/documents';
import { useAuth } from '@/lib/auth';
import { useKeyboardInset } from '@/lib/keyboard';
import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

interface Header {
  title: string;
  subtitle: string | null;
}

/** C-Chat / A14: one conversation, newest at the bottom, with live updates while open. */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isStaff, staffView } = useAuth();
  const staff = isStaff && staffView;
  const [conversation, setConversation] = useState<Conversation | null | undefined>(undefined);
  const [header, setHeader] = useState<Header>({ title: 'Chat', subtitle: null });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [sending, setSending] = useState(false);
  const { keyboardHeight } = useKeyboardInset();
  const live = useRef(true);

  // Load the chat, its newest messages, and the name to show at the top.
  useEffect(() => {
    live.current = true;
    Promise.all([fetchConversation(id), fetchMessages(id), fetchConversations().catch(() => [])])
      .then(([c, msgs, list]) => {
        if (!live.current) return;
        setConversation(c);
        setMessages(msgs);
        setHasOlder(msgs.length === PAGE_SIZE);
        const s = list.find((x) => x.id === id);
        if (s) {
          setHeader({
            title: chatTitle(s, staff),
            subtitle: staff || s.subjectType !== 'general' ? subjectLabel(s.subjectType, s.subjectNumber) : null,
          });
        }
        setError(null);
        void markRead(id).catch(() => undefined);
      })
      .catch((e: Error) => live.current && setError(e.message));
    return () => {
      live.current = false;
    };
  }, [id, staff, attempt]);

  // New messages arrive while the chat is open; reading them here marks them read.
  useEffect(() => {
    return subscribeToMessages(id, (m) => {
      setMessages((list) => mergeMessages(list, [m]));
      if (m.senderId !== profile?.id) void markRead(id).catch(() => undefined);
    });
  }, [id, profile?.id]);

  const loadOlder = useCallback(async () => {
    if (!hasOlder || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const older = await fetchMessages(id, messages[0].createdAt);
      setMessages((list) => mergeMessages(list, older));
      setHasOlder(older.length === PAGE_SIZE);
    } catch {
      // Leave what's on screen; the person can scroll up again.
    } finally {
      setLoadingOlder(false);
    }
  }, [hasOlder, loadingOlder, messages, id]);

  async function onAttach() {
    try {
      const f = await pickFile();
      if (f) setFile(f);
    } catch (e) {
      Alert.alert('Could not add the file', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  async function onSend() {
    if (sending || (!text.trim() && !file)) return;
    setSending(true);
    try {
      await sendMessage(id, text, file);
      setText('');
      setFile(null);
      // Show it straight away, even if the live feed is slow.
      const latest = await fetchMessages(id);
      setMessages((list) => mergeMessages(list, latest));
    } catch (e) {
      Alert.alert('Message not sent', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (conversation === undefined) return <LoadingState />;
  if (conversation === null) return <ErrorState message="This chat is not available." onRetry={() => router.back()} />;

  const newestFirst = [...messages].reverse();
  const canSend = !sending && (text.trim().length > 0 || !!file);
  const openSubject =
    conversation.subjectType === 'general' || !conversation.subjectId
      ? null
      : () =>
          router.push({
            pathname:
              conversation.subjectType === 'order'
                ? staff
                  ? '/staff-order/[id]'
                  : '/order/[id]'
                : staff
                  ? '/staff-enquiry/[id]'
                  : '/enquiries/[id]',
            params: { id: conversation.subjectId! },
          });

  return (
    <View style={[styles.root, { paddingBottom: keyboardHeight }]}>
      <Stack.Screen options={{ title: header.title }} />
      {header.subtitle && (
        <Pressable
          accessibilityRole={openSubject ? 'link' : undefined}
          disabled={!openSubject}
          onPress={openSubject ?? undefined}
          style={styles.subject}>
          <Text style={[type.caption, { color: colors.info, fontWeight: '600' }]}>
            {header.subtitle}
            {openSubject ? '  ›' : ''}
          </Text>
        </Pressable>
      )}
      <FlatList
        inverted
        data={newestFirst}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingOlder ? <ActivityIndicator color={colors.brandSecondary} /> : undefined}
        ListEmptyComponent={
          <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
            <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              {staff ? 'No messages yet. Write to the customer below.' : 'Send a message and the DEV Group team will reply here.'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const oldestIndex = messages.length - 1 - index;
          return (
            <View>
              {startsNewDay(messages, oldestIndex) && <Text style={styles.day}>{dayLabel(item.createdAt)}</Text>}
              <Bubble m={item} mine={item.senderId === profile?.id} staffView={staff} customerId={conversation.customerId} />
            </View>
          );
        }}
      />
      {file && (
        <View style={styles.pending}>
          <Ionicons name="document-attach-outline" size={18} color={colors.textSecondary} />
          <Text style={[type.caption, { flex: 1, color: colors.textPrimary }]} numberOfLines={1}>
            {file.name} · {formatBytes(file.size)}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove file" onPress={() => setFile(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}
      <View style={styles.composer}>
        <Pressable accessibilityRole="button" accessibilityLabel="Attach a PDF or photo" onPress={onAttach} style={styles.iconBtn}>
          <Ionicons name="attach" size={24} color={colors.textSecondary} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Write a message"
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          accessibilityLabel="Message"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={onSend}
          disabled={!canSend}
          style={[styles.send, !canSend && { opacity: 0.4 }]}>
          {sending ? <ActivityIndicator color={colors.textOnBrand} /> : <Ionicons name="send" size={18} color={colors.textOnBrand} />}
        </Pressable>
      </View>
    </View>
  );
}

function Bubble({ m, mine, staffView, customerId }: { m: ChatMessage; mine: boolean; staffView: boolean; customerId: string }) {
  // Staff see which side wrote it; customers just see "DEV Group" for every staff reply.
  const fromCustomer = m.senderId === customerId;
  const who = mine ? null : staffView ? (fromCustomer ? 'Customer' : 'DEV team') : fromCustomer ? null : 'DEV Group';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {who && <Text style={[type.caption, { color: colors.brandSecondary, fontWeight: '700' }]}>{who}</Text>}
      {m.attachmentPath && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${m.attachmentName}`}
          onPress={() =>
            openDocument(m.attachmentPath!).catch((e: Error) => Alert.alert('Could not open the file', e.message))
          }
          style={[styles.file, mine && { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
          <Ionicons
            name={m.attachmentMime === 'application/pdf' ? 'document-text-outline' : 'image-outline'}
            size={20}
            color={mine ? colors.textOnBrand : colors.textPrimary}
          />
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: mine ? colors.textOnBrand : colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
              {m.attachmentName}
            </Text>
            {m.attachmentSize ? (
              <Text style={[type.caption, { color: mine ? colors.textOnBrand : colors.textSecondary }]}>
                {formatBytes(m.attachmentSize)} · tap to open
              </Text>
            ) : null}
          </View>
        </Pressable>
      )}
      {m.body ? (
        <Text selectable style={[type.body, { color: mine ? colors.textOnBrand : colors.textPrimary }]}>
          {m.body}
        </Text>
      ) : null}
      <Text style={[type.caption, { alignSelf: 'flex-end', color: mine ? 'rgba(255,255,255,0.75)' : colors.textSecondary }]}>
        {timeLabel(m.createdAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  subject: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfacePrimary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  empty: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  day: { ...type.caption, color: colors.textSecondary, textAlign: 'center', marginVertical: spacing.sm, fontWeight: '600' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brandPrimary, borderBottomRightRadius: radius.sm },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfacePrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    minHeight: minTouch,
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfacePrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surfacePrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  iconBtn: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  input: {
    ...type.body,
    flex: 1,
    minHeight: minTouch,
    maxHeight: 140,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSecondary,
  },
  send: {
    width: minTouch,
    height: minTouch,
    borderRadius: minTouch / 2,
    backgroundColor: colors.brandSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
