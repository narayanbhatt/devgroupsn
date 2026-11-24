import { ConversationList } from '@/components/chat';

/** A14 Chat: every customer conversation, newest and unread first. */
export default function StaffChatScreen() {
  return <ConversationList staff />;
}
