import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { ChoiceField, FormError, FormScreen, TextField } from '@/components/form';
import { Body, CTAButton, ErrorState, LoadingState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isGstin } from '@/lib/validation';

type OrgType = 'business' | 'government' | 'institution' | 'other';
const TYPES: { value: OrgType; label: string }[] = [
  { value: 'business', label: 'Business' },
  { value: 'government', label: 'Government' },
  { value: 'institution', label: 'Institution' },
  { value: 'other', label: 'Other' },
];

interface Org {
  id: string;
  name: string;
  type: OrgType;
  gstin: string | null;
  department: string | null;
}

/** Organization details for business, government and institution buyers (§14.3, §27). */
export default function OrganizationScreen() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState<OrgType>('business');
  const [gstin, setGstin] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase!
        .from('organization_members')
        .select('role, organizations(id, name, type, gstin, department)')
        .eq('user_id', profile!.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (e) return setLoadError(friendlyError(e));
      const found = (data?.organizations ?? null) as unknown as Org | null;
      if (found) {
        setOrg(found);
        setName(found.name);
        setOrgType(found.type);
        setGstin(found.gstin ?? '');
        setDepartment(found.department ?? '');
        setCanEdit(data!.role === 'owner' || data!.role === 'admin');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, attempt]);

  async function onSave() {
    if (!name.trim()) return setError('Enter the organization name.');
    const g = gstin.trim().toUpperCase();
    if (g && !isGstin(g)) return setError('GSTIN should be 15 characters, like 29ABCDE1234F1Z5.');
    setBusy(true);
    setError(null);
    const values = { name: name.trim(), type: orgType, gstin: g || null, department: department.trim() || null };
    const { error: e } = org
      ? await supabase!.from('organizations').update(values).eq('id', org.id)
      : await supabase!.from('organizations').insert(values);
    setBusy(false);
    if (e) return setError(friendlyError(e));
    router.back();
  }

  if (loading) return <LoadingState />;
  if (loadError) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => {
          setLoadError(null);
          setLoading(true);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  return (
    <FormScreen>
      <Body muted>
        {org
          ? canEdit
            ? 'These details appear on your quotations and invoices.'
            : 'Only the organization owner or admin can change these details.'
          : 'Buying for a company, department or institution? Add it here so quotations carry the right name and GSTIN.'}
      </Body>
      <FormError message={error} />
      <TextField label="Organization name" value={name} onChangeText={setName} editable={canEdit} />
      <ChoiceField label="Type" value={orgType} options={TYPES} onChange={canEdit ? setOrgType : () => {}} />
      <TextField
        label="GSTIN (optional)"
        value={gstin}
        onChangeText={(t) => setGstin(t.toUpperCase())}
        autoCapitalize="characters"
        maxLength={15}
        editable={canEdit}
      />
      <TextField
        label="Department (for government buyers)"
        value={department}
        onChangeText={setDepartment}
        editable={canEdit}
      />
      {canEdit && (
        <CTAButton label={busy ? 'Saving…' : org ? 'Save' : 'Add organization'} onPress={onSave} disabled={busy} />
      )}
    </FormScreen>
  );
}
