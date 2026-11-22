import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, minTouch, radius, spacing, type } from '@/theme/tokens';

/** Scrollable form page that stays clear of the keyboard. */
export function FormScreen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.surfacePrimary }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function TextField({
  label,
  error,
  hint,
  ...input
}: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, error ? { borderColor: colors.error } : null, input.multiline && { minHeight: 96 }]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <Text style={[type.body, { color: colors.error }]}>{message}</Text>
    </View>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={[styles.banner, { backgroundColor: '#E8F0FB', borderColor: '#C5D7F2' }]}>
      <Text style={[type.body, { color: colors.info }]}>{message}</Text>
    </View>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.link} hitSlop={8}>
      <Text style={[type.body, { color: colors.brandPrimary, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

/** Single choice from a few options, shown as chips. */
export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              style={[styles.choice, selected && styles.choiceSelected]}>
              <Text style={[type.body, { color: selected ? colors.textOnBrand : colors.textPrimary }]}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.caption, fontWeight: '600', color: colors.textPrimary },
  input: {
    minHeight: minTouch + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surfacePrimary,
    ...type.body,
  },
  error: { ...type.caption, color: colors.error },
  hint: { ...type.caption, color: colors.textSecondary },
  banner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#F3C7C7',
    backgroundColor: '#FDECEC',
  },
  link: { minHeight: minTouch, justifyContent: 'center', alignSelf: 'center' },
  choice: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  choiceSelected: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
});
