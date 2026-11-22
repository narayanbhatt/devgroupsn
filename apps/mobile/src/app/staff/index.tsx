import { EmptyState, Screen } from '@/components/ui';

export default function StaffDashboardScreen() {
  return (
    <Screen>
      <EmptyState title="Dashboard" hint="New enquiries, quotes pending, payments to verify and other actions will appear here as those features are built." />
    </Screen>
  );
}
