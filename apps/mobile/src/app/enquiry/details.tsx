import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { ChoiceField, FormError, FormScreen, TextField } from '@/components/form';
import { Body, CTAButton, ErrorState, LoadingState, SectionTitle } from '@/components/ui';
import { parseIndianDate } from '@/data/commercial';
import { useAuth, type Profile } from '@/lib/auth';
import { useBasket } from '@/lib/basket';
import { friendlyError } from '@/lib/errors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/use-async';
import { isEmail, isIndianMobile } from '@/lib/validation';
import { colors, spacing, type } from '@/theme/tokens';

interface Org {
  id: string;
  name: string;
  department: string | null;
}
interface Address {
  id: string;
  label: string | null;
  line1: string;
  city: string;
  pincode: string;
}

async function loadChoices(userId: string) {
  const [orgs, addrs] = await Promise.all([
    supabase!.from('organization_members').select('organizations(id, name, department)').eq('user_id', userId),
    supabase!.from('addresses').select('id, label, line1, city, pincode').order('created_at'),
  ]);
  if (orgs.error || addrs.error) throw new Error('Unable to load your details.');
  return {
    orgs: orgs.data.map((r) => r.organizations as unknown as Org).filter(Boolean),
    addresses: addrs.data as Address[],
  };
}

/** C05 Enquiry details (§14): project, contact, delivery and procurement details. */
export default function EnquiryDetailsScreen() {
  const { profile } = useAuth();
  const { state, retry } = useAsync(() => loadChoices(profile!.id), profile?.id ?? '');

  if (!isSupabaseConfigured) {
    return <ErrorState message="Sending enquiries needs the app to be connected to the server." onRetry={() => router.back()} />;
  }
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  return <Form profile={profile!} orgs={state.data.orgs} addresses={state.data.addresses} />;
}

function Form({ profile, orgs, addresses }: { profile: Profile; orgs: Org[]; addresses: Address[] }) {
  const { items, clear } = useBasket();
  const procurement = profile.customer_type !== 'individual';
  const [f, setF] = useState({
    projectName: '',
    contactPerson: profile.full_name ?? '',
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    projectLocation: '',
    requiredBy: '',
    requirements: '',
    notes: '',
    department: orgs[0]?.department ?? '',
    designation: '',
    procurementReference: '',
  });
  const [orgId, setOrgId] = useState<string>(orgs[0]?.id ?? 'none');
  const [addressId, setAddressId] = useState<string>(addresses[0]?.id ?? 'none');
  const [poRequired, setPoRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function onSubmit() {
    if (items.length === 0) return setError('Your enquiry has no products.');
    if (!f.contactPerson.trim()) return setError('Enter a contact person.');
    if (!isIndianMobile(f.phone)) return setError('Enter a 10-digit mobile number.');
    if (f.email.trim() && !isEmail(f.email)) return setError('Check the email address.');
    let requiredBy: string | null = null;
    if (f.requiredBy.trim()) {
      requiredBy = parseIndianDate(f.requiredBy);
      if (!requiredBy) return setError('Enter the required-by date as DD/MM/YYYY.');
    }
    if (!f.projectLocation.trim() && addressId === 'none') {
      return setError('Tell us where the products are needed: a project location or a saved address.');
    }
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase!.rpc('submit_enquiry', {
      details: {
        project_name: f.projectName,
        contact_person: f.contactPerson,
        phone: f.phone,
        email: f.email,
        project_location: f.projectLocation,
        required_by: requiredBy ?? '',
        requirements: f.requirements,
        notes: f.notes,
        organization_id: orgId === 'none' ? '' : orgId,
        delivery_address_id: addressId === 'none' ? '' : addressId,
        department: f.department,
        designation: f.designation,
        procurement_reference: f.procurementReference,
        po_required: poRequired,
      },
      items: items.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        installation_required: i.installationRequired,
        notes: i.notes,
      })),
    });
    setBusy(false);
    if (e) return setError(friendlyError(e));
    clear();
    router.dismissAll();
    router.push({ pathname: '/enquiries/[id]', params: { id: data as string, sent: '1' } });
  }

  return (
    <FormScreen>
      <Body muted>
        {items.length} product{items.length === 1 ? '' : 's'} in this enquiry. Tell us about the project so we can prepare an accurate
        quotation.
      </Body>
      <FormError message={error} />

      <SectionTitle>Project</SectionTitle>
      <TextField label="Project name (optional)" value={f.projectName} onChangeText={set('projectName')} placeholder="e.g. Ward 12 park renovation" />
      <TextField label="Project location" value={f.projectLocation} onChangeText={set('projectLocation')} placeholder="Village / town, district" />
      <TextField
        label="Required by (optional)"
        value={f.requiredBy}
        onChangeText={set('requiredBy')}
        placeholder="DD/MM/YYYY"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <TextField
        label="Requirements (optional)"
        value={f.requirements}
        onChangeText={set('requirements')}
        multiline
        placeholder="Anything we should know: site conditions, specifications, tender details…"
      />

      <SectionTitle>Contact</SectionTitle>
      <TextField label="Contact person" value={f.contactPerson} onChangeText={set('contactPerson')} />
      <TextField label="Mobile number" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={13} />
      <TextField label="Email (optional)" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />

      <SectionTitle>Delivery</SectionTitle>
      {addresses.length > 0 ? (
        <ChoiceField
          label="Deliver to"
          value={addressId}
          onChange={setAddressId}
          options={[
            ...addresses.map((a) => ({ value: a.id, label: a.label || `${a.line1}, ${a.city}` })),
            { value: 'none', label: 'Project location above' },
          ]}
        />
      ) : (
        <Body muted>Save an address under Profile › Addresses to choose it here, or use the project location above.</Body>
      )}

      {(procurement || orgs.length > 0) && (
        <>
          <SectionTitle>Organization and procurement</SectionTitle>
          {orgs.length > 0 ? (
            <ChoiceField
              label="Enquiry for"
              value={orgId}
              onChange={setOrgId}
              options={[...orgs.map((o) => ({ value: o.id, label: o.name })), { value: 'none', label: 'Myself' }]}
            />
          ) : (
            <Body muted>Add your organization under Profile › Organization to quote in its name with GSTIN.</Body>
          )}
          <TextField label="Department (optional)" value={f.department} onChangeText={set('department')} />
          <TextField label="Your designation (optional)" value={f.designation} onChangeText={set('designation')} />
          <TextField
            label="Tender / procurement reference (optional)"
            value={f.procurementReference}
            onChangeText={set('procurementReference')}
          />
          <View style={styles.switchRow}>
            <Text style={[type.body, { color: colors.textPrimary, flex: 1 }]}>We will issue a purchase order</Text>
            <Switch
              value={poRequired}
              onValueChange={setPoRequired}
              trackColor={{ true: colors.brandSecondary, false: colors.border }}
              accessibilityLabel="We will issue a purchase order"
            />
          </View>
        </>
      )}

      <TextField label="Notes (optional)" value={f.notes} onChangeText={set('notes')} multiline />
      <CTAButton label={busy ? 'Sending…' : 'Send enquiry'} onPress={onSubmit} disabled={busy} />
      <Body muted>This is not an order. We’ll send you a quotation to review and approve.</Body>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
});
