import { Redirect, router } from 'expo-router';

import { CTAButton, LoadingState, Screen } from '@/components/ui';
import { FormNotice } from '@/components/form';
import { useAuth } from '@/lib/auth';

/**
 * Where an email link lands (devgroup://auth/callback). The auth provider reads the
 * tokens from the link; this screen waits, then sends the person on.
 */
export default function AuthCallbackScreen() {
  const { session, recoveryPending, notice } = useAuth();

  if (recoveryPending && session) return <Redirect href="/new-password" />;
  if (session) return <Redirect href="/" />;
  if (notice) {
    return (
      <Screen>
        <FormNotice message={notice} />
        <CTAButton label="Go to sign in" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }
  return <LoadingState />;
}
