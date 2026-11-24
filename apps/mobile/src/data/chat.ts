import type { RealtimeChannel } from '@supabase/supabase-js';

import { DOCUMENT_BUCKET, type PickedFile } from '@/data/documents';
import { safeFileName } from '@/data/order-rules';
import { supabase } from '@/lib/supabase';

export type ChatSubject = 'general' | 'enquiry' | 'order';

export interface ConversationSummary {
  id: string;
  customerId: string;
  customerName: string;
  subjectType: ChatSubject;
  subjectId: string | null;
  subjectNumber: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  unread: number;
}

export interface Conversation {
  id: string;
  customerId: string;
  subjectType: ChatSubject;
  subjectId: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  createdAt: string;
}

/** How many older messages to load at a time. */
export const PAGE_SIZE = 50;

function db() {
  if (!supabase) throw new Error('Chat needs the app to be connected to the server.');
  return supabase;
}

const summaryFrom = (r: any): ConversationSummary => ({
  id: r.id,
  customerId: r.customer_id,
  customerName: r.customer_name ?? 'Customer',
  subjectType: r.subject_type,
  subjectId: r.subject_id,
  subjectNumber: r.subject_number,
  lastMessageAt: r.last_message_at,
  lastMessagePreview: r.last_message_preview,
  lastSenderId: r.last_sender_id,
  unread: r.unread ?? 0,
});

export const messageFrom = (r: any): ChatMessage => ({
  id: r.id,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  body: r.body,
  attachmentPath: r.attachment_path,
  attachmentName: r.attachment_name,
  attachmentMime: r.attachment_mime,
  attachmentSize: r.attachment_size,
  createdAt: r.created_at,
});

/** Chats the signed-in person can see, newest first, with unread counts. */
export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await db().rpc('list_conversations');
  if (error) throw new Error('Unable to load your chats.');
  return (data ?? []).map(summaryFrom);
}

/** Finds or starts the chat about a subject. Staff pass the customer for a general chat. */
export async function openConversation(kind: ChatSubject = 'general', ref?: string | null, forCustomer?: string): Promise<string> {
  const { data, error } = await db().rpc('open_conversation', {
    kind,
    ref: ref ?? null,
    for_customer: forCustomer ?? null,
  });
  if (error) throw new Error(error.message || 'Unable to open the chat.');
  return data as string;
}

export async function fetchConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await db()
    .from('conversations')
    .select('id, customer_id, subject_type, subject_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Unable to load this chat.');
  return data ? { id: data.id, customerId: data.customer_id, subjectType: data.subject_type, subjectId: data.subject_id } : null;
}

/** The newest messages, or older ones before a time; returned oldest first. */
export async function fetchMessages(conversationId: string, before?: string): Promise<ChatMessage[]> {
  let q = db().from('messages').select('*').eq('conversation_id', conversationId);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(PAGE_SIZE);
  if (error) throw new Error('Unable to load messages.');
  return data.map(messageFrom).reverse();
}

export async function sendMessage(conversationId: string, body: string, file?: PickedFile | null): Promise<string> {
  const d = db();
  let attachment: { path: string; name: string; mime: string; size: number } | null = null;
  if (file) {
    const path = `conversation/${conversationId}/${Date.now()}-${safeFileName(file.name)}`;
    const bytes = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
    const up = await d.storage.from(DOCUMENT_BUCKET).upload(path, bytes, { contentType: file.mimeType, upsert: false });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
    attachment = { path, name: file.name, mime: file.mimeType, size: file.size };
  }
  const { data, error } = await d.rpc('send_message', {
    c: conversationId,
    body: body.trim() || null,
    attachment_path: attachment?.path ?? null,
    attachment_name: attachment?.name ?? null,
    attachment_mime: attachment?.mime ?? null,
    attachment_size: attachment?.size ?? null,
  });
  if (error) throw new Error(error.message || 'The message was not sent.');
  return data as string;
}

export async function markRead(conversationId: string): Promise<void> {
  await db().rpc('mark_conversation_read', { c: conversationId });
}

/** Calls back with each new message in the chat while it is open. Returns an unsubscribe function. */
export function subscribeToMessages(conversationId: string, onMessage: (m: ChatMessage) => void): () => void {
  if (!supabase) return () => undefined;
  const client = supabase;
  const channel: RealtimeChannel = client
    .channel(`chat:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(messageFrom(payload.new)),
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
