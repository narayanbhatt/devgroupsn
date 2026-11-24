import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { BasketProvider } from '@/lib/basket';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, spacing, type } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <AuthProvider>
      <BasketProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </BasketProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { initializing, session, recoveryPending, isStaff, staffView } = useAuth();

  if (initializing) return <Splash />;

  // Demo mode (no Supabase configured) skips sign-in and shows sample data.
  const signedIn = !isSupabaseConfigured || (session != null && !recoveryPending);
  const showStaff = signedIn && isStaff && staffView;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.brandPrimary },
        headerTintColor: colors.textOnBrand,
        contentStyle: { backgroundColor: colors.surfaceSecondary },
      }}>
      {/* Email links land here whether or not anyone is signed in yet. */}
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !showStaff}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={showStaff}>
        <Stack.Screen name="staff" options={{ headerShown: false }} />
        <Stack.Screen name="staff-product/[id]" options={{ title: 'Product' }} />
        <Stack.Screen name="staff-categories" options={{ title: 'Categories' }} />
        <Stack.Screen name="staff-enquiry/[id]" options={{ title: 'Enquiry' }} />
        <Stack.Screen name="staff-quotation/[id]" options={{ title: 'Quotation' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
        <Stack.Screen name="enquiry/index" options={{ title: 'Your enquiry' }} />
        <Stack.Screen name="enquiry/details" options={{ title: 'Enquiry details' }} />
        <Stack.Screen name="enquiries/[id]" options={{ title: 'Enquiry' }} />
        <Stack.Screen name="quotation/[id]" options={{ title: 'Quotation' }} />
        <Stack.Screen name="profile/edit" options={{ title: 'Personal information' }} />
        <Stack.Screen name="profile/organization" options={{ title: 'Organization' }} />
        <Stack.Screen name="profile/addresses" options={{ title: 'Addresses' }} />
      </Stack.Protected>
    </Stack>
  );
}

function Splash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.brand}>DEV GROUP</Text>
      <ActivityIndicator color={colors.brandSecondary} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  brand: { ...type.h1, color: colors.textOnBrand, letterSpacing: 2 },
});
