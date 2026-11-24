import { describe, expect, it } from '@jest/globals';

import type { ChatMessage } from '../chat';
import { chatTitle, dayLabel, listTimeLabel, mergeMessages, startsNewDay, subjectLabel, timeLabel } from '../chat-rules';

const msg = (id: string, createdAt: string): ChatMessage => ({
  id,
  conversationId: 'c',
  senderId: 'u',
  body: id,
  attachmentPath: null,
  attachmentName: null,
  attachmentMime: null,
  attachmentSize: null,
  createdAt,
});

describe('titles', () => {
  it('names the subject', () => {
    expect(subjectLabel('order', 'DG-2026-0001')).toBe('Order DG-2026-0001');
    expect(subjectLabel('enquiry', null)).toBe('Enquiry');
    expect(subjectLabel('general', null)).toBe('General');
  });
  it('shows customers DEV Group and staff the customer', () => {
    const c = { customerName: 'Asha' };
    expect(chatTitle(c, false)).toBe('DEV Group');
    expect(chatTitle(c, true)).toBe('Asha');
  });
});

describe('mergeMessages', () => {
  it('drops duplicates and keeps oldest first', () => {
    const a = msg('a', '2026-11-24T10:00:00Z');
    const b = msg('b', '2026-11-24T10:01:00Z');
    const c = msg('c', '2026-11-24T09:59:00Z');
    expect(mergeMessages([a, b], [b, c]).map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('dates in India time', () => {
  const now = new Date('2026-11-24T15:00:00Z'); // 8:30 pm IST
  it('labels days', () => {
    expect(dayLabel('2026-11-24T00:30:00Z', now)).toBe('Today'); // 6 am IST
    expect(dayLabel('2026-11-23T18:45:00Z', now)).toBe('Today'); // 12:15 am IST on the 24th
    expect(dayLabel('2026-11-23T18:00:00Z', now)).toBe('Yesterday'); // 11:30 pm IST on the 23rd
    expect(dayLabel('2026-11-23T10:00:00Z', now)).toBe('Yesterday');
    expect(dayLabel('2026-11-20T10:00:00Z', now)).toBe('20 Nov 2026');
  });
  it('formats times', () => {
    expect(timeLabel('2026-11-24T15:51:00Z')).toBe('9:21 pm');
    expect(listTimeLabel('2026-11-24T15:51:00Z', now)).toBe('9:21 pm');
    expect(listTimeLabel('2026-11-23T10:00:00Z', now)).toBe('Yesterday');
    expect(listTimeLabel(null, now)).toBe('');
  });
  it('marks the first message of each day', () => {
    const l = [msg('a', '2026-11-23T10:00:00Z'), msg('b', '2026-11-23T11:00:00Z'), msg('c', '2026-11-24T10:00:00Z')];
    expect(l.map((_, i) => startsNewDay(l, i))).toEqual([true, false, true]);
  });
});
