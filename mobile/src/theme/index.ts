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

  // Aurora Deep — the "liquid glass" design system pilot. See
  // docs/superpowers/specs/2026-08-13-mobile-liquid-glass-design-system-design.md
  auroraViolet: '#2a1f4d',
  auroraNavy: '#0a1030',
  accentViolet: '#6a5cff',
  accentCyan: '#22d3ee',
  glassFill: 'rgba(30,25,55,0.4)',
  glassBorder: 'rgba(255,255,255,0.12)',
  glassHighlight: 'rgba(255,255,255,0.16)',
};

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  full: 999,
};

// Tracking/leading are size-specific per Apple's optical-type guidance —
// large text gets tightened tracking and leading, body stays near neutral.
export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.4, lineHeight: 32 },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.2, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text, letterSpacing: 0, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500' as const, color: colors.textDim, letterSpacing: 0.1, lineHeight: 18 },
};
