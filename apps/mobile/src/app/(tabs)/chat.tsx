import { EmptyState, Screen } from '@/components/ui';

export default function ChatScreen() {
  return (
    <Screen>
      <EmptyState title="Chat" hint="Conversations with DEV Group will appear here." />
    </Screen>
  );
}
