import { EmptyState, Screen } from '@/components/ui';

export default function OrdersScreen() {
  return (
    <Screen>
      <EmptyState title="Orders" hint="Your enquiries, quotations and orders will appear here." />
    </Screen>
  );
}
