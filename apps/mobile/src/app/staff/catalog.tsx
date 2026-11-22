import { EmptyState, Screen } from '@/components/ui';

export default function StaffCatalogScreen() {
  return (
    <Screen>
      <EmptyState title="Catalog" hint="The product editor arrives in Phase 2. Until then, edit products in Supabase." />
    </Screen>
  );
}
