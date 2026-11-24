/**
 * Chat helpers with no Supabase imports, so they can be unit tested on their own.
 */
import type { ChatMessage, ChatSubject } from '@/data/chat';

const IST = 'Asia/Kolkata';

/** What a chat is about, e.g. "Order DG-2026-0001", or "General" for an open chat. */
export function subjectLabel(type: ChatSubject, number: string | null): string {
  if (type === 'order') return number ? `Order ${number}` : 'Order';
  if (type === 'enquiry') return number ? `Enquiry ${number}` : 'Enquiry';
  return 'General';
}

/** Customers are always talking to DEV Group; staff see the customer's name. */
export function chatTitle(c: { customerName: string }, staff: boolean) {
  return staff ? c.customerName : 'DEV Group';
}

/**
 * Adds messages to a list without duplicates (the sender gets their own message back
 * from both the send and the live feed), keeping it oldest first.
 */
export function mergeMessages(list: ChatMessage[], add: ChatMessage[]): ChatMessage[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of add) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: IST });

/** "Today", "Yesterday" or "24 Nov 2026", in India time. */
export function dayLabel(iso: string, now = new Date()): string {
  const k = dayKey(iso);
  if (k === dayKey(now.toISOString())) return 'Today';
  if (k === dayKey(new Date(now.getTime() - 86400000).toISOString())) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' });
}

/** "9:21 pm" in India time. */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

/** For the chat list: the time if today, otherwise the day. */
export function listTimeLabel(iso: string | null, now = new Date()): string {
  if (!iso) return '';
  const d = dayLabel(iso, now);
  return d === 'Today' ? timeLabel(iso) : d;
}

/** True when a message starts a new day, so the list shows a date divider above it. */
export function startsNewDay(list: ChatMessage[], index: number): boolean {
  return index === 0 || dayKey(list[index].createdAt) !== dayKey(list[index - 1].createdAt);
}

export const MAX_MESSAGE_LENGTH = 4000;
