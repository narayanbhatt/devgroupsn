import { EmptyState, Screen } from '@/components/ui';

export default function ProfileScreen() {
  return (
    <Screen>
      <EmptyState title="Profile" hint="Sign in to manage your profile and organization." />
    </Screen>
  );
}
