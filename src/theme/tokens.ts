export const darkTheme = {
  background: '#0D0F12',
  surface: '#16191D',
  surfaceElevated: '#1E2227',
  border: '#2A2F36',
  textPrimary: '#F4F5F7',
  textSecondary: '#9AA1AB',
  textDisabled: '#565C64',
  accent: '#3D8BFF',
  accentSecondary: '#00D9A3',
  success: '#34C77B',
  warning: '#FFB020',
  danger: '#FF4D4F',
};

export const lightTheme = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#E4E7EB',
  textPrimary: '#14171A',
  textSecondary: '#6B7280',
  textDisabled: '#9CA3AF',
  accent: '#2563EB',
  accentSecondary: '#00A886',
  success: '#1F9D55',
  warning: '#B45309',
  danger: '#DC2626',
};

export const typography = {
  display: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  h1: { fontSize: 24, fontWeight: '700' as const },
  h2: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
};

export const radius = { sm: 8, md: 12, lg: 16 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

export type Theme = typeof darkTheme;
