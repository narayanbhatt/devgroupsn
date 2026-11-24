import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.brandPrimary },
        headerTintColor: colors.textOnBrand,
        headerTitle: '',
      }}>
      {/* index is the welcome screen: the route the app lands on when signed out. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in', headerTitle: 'Sign in' }} />
      <Stack.Screen name="register" options={{ headerTitle: 'Create account' }} />
      <Stack.Screen name="verify" options={{ headerTitle: 'Check your email' }} />
      <Stack.Screen name="forgot" options={{ headerTitle: 'Reset password' }} />
      <Stack.Screen name="new-password" options={{ headerTitle: 'New password', headerBackVisible: false }} />
    </Stack>
  );
}
