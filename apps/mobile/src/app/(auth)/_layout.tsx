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
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in', headerTitle: 'Sign in' }} />
      <Stack.Screen name="register" options={{ headerTitle: 'Create account' }} />
      <Stack.Screen name="verify" options={{ headerTitle: 'Enter code' }} />
      <Stack.Screen name="forgot" options={{ headerTitle: 'Reset password' }} />
      <Stack.Screen name="new-password" options={{ headerTitle: 'New password', headerBackVisible: false }} />
    </Stack>
  );
}
