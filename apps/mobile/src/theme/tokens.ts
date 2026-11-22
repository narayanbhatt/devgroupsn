/**
 * DEV Group design tokens (design doc §64, wireframe spec §6).
 * Exact brand hex values are placeholders until DEV Group supplies them.
 */
export const colors = {
  brandPrimary: '#0B1F3A', // deep navy
  brandSecondary: '#F26B1D', // DEV orange: CTAs, progress, selection only
  surfacePrimary: '#FFFFFF',
  surfaceSecondary: '#F4F6F9',
  border: '#E1E5EB',
  textPrimary: '#0B1F3A',
  textSecondary: '#5B6778',
  textOnBrand: '#FFFFFF',
  success: '#1E8E3E',
  warning: '#B26A00',
  error: '#C62828',
  info: '#1565C0',
} as const;

/** 4px base grid; prefer 8/12/16/24/32. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = { sm: 6, md: 10, lg: 16 } as const;

export const type = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '600' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
};

/** Minimum touch target (accessibility §65). */
export const minTouch = 44;
