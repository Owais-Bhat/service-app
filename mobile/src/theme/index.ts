// Matches the web app's dark theme (src/style.css --primary etc.) so the
// mobile app reads as the same product, not a separate one.
export const colors = {
  primary: '#2bbf73',
  primaryDim: '#1c8a53',
  bg: '#06100b',
  surface: '#0d1f16',
  surfaceRaised: '#12291d',
  border: '#1e3a2a',
  text: '#eaf5ee',
  textDim: '#8fa79a',
  success: '#2bbf73',
  warning: '#FBBF24',
  danger: '#F87171',
};

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  full: 999,
};

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: '500' as const, color: colors.textDim },
};
