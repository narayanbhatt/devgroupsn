import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinkButton } from '@/components/form';
import { CTAButton } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme/tokens';

/** C01 Splash / authentication entry. */
export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>DEV GROUP</Text>
        <Text style={styles.sub}>Infrastructure Solutions</Text>
        <View style={styles.artwork} accessibilityElementsHidden>
          <View style={[styles.bar, { height: 48 }]} />
          <View style={[styles.bar, { height: 80 }]} />
          <View style={[styles.bar, { height: 64, backgroundColor: colors.brandSecondary }]} />
          <View style={[styles.bar, { height: 96 }]} />
        </View>
        <Text style={styles.tagline}>Building better solutions</Text>
      </View>
      <View style={styles.actions}>
        <CTAButton label="Get Started" onPress={() => router.push('/register')} />
        <LinkButton label="I already have an account. Sign in" onPress={() => router.push('/sign-in')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brandPrimary, padding: spacing.xl, justifyContent: 'space-between' },
  brandBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  brand: { ...type.h1, fontSize: 32, color: colors.textOnBrand, letterSpacing: 3 },
  sub: { ...type.h3, fontWeight: '400', color: '#C9D3E3' },
  artwork: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginVertical: spacing.xxl },
  bar: { width: 28, borderRadius: radius.sm, backgroundColor: '#2A4570' },
  tagline: { ...type.body, color: '#C9D3E3' },
  actions: {
    gap: spacing.sm,
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
});
