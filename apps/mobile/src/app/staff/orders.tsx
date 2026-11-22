import { EmptyState, Screen } from '@/components/ui';

export default function StaffOrdersScreen() {
  return (
    <Screen>
      <EmptyState title="Orders" hint="Enquiries, quotations and orders arrive in Phases 3 and 4." />
    </Screen>
  );
}
