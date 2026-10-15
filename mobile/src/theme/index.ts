// Layout constants only — color now comes from useTheme() (theme/ThemeContext.tsx),
// not from a static export, so light/dark switching works. See
// docs/superpowers/specs/2026-08-17-nest-design-visual-foundation.md.

export const spacing = (n: number) => n * 4;

// Design radii: 12 icon tiles · 14 inputs and buttons · 18 list panels ·
// 24 hero/glass cards · 28 sheets · 999 chips and badges.
export const radius = {
  sm: 12,
  md: 14,
  lg: 18,
  xl: 24,
  sheet: 28,
  full: 999,
};

// Font families are the three NEST typefaces (theme/fonts.ts loads them).
// No `color` field — every usage merges in theme.text/theme.text3/etc, or a
// brand color, at the point of use so it reacts to theme mode.
//
// Scale from the design's Typography table. `title` / `heading` / `body` /
// `caption` / `mono` are the long-standing keys; the rest are the design's
// remaining named styles.
export const typography = {
  largeTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30, letterSpacing: -0.6, lineHeight: 36 },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, letterSpacing: -0.35, lineHeight: 30 },
  heading: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, letterSpacing: -0.15, lineHeight: 24 },
  kpi: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 26, letterSpacing: -0.5, lineHeight: 32 },
  body: { fontFamily: 'Manrope_400Regular', fontSize: 15, letterSpacing: 0, lineHeight: 22 },
  rowTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, letterSpacing: 0, lineHeight: 20 },
  supporting: { fontFamily: 'Manrope_500Medium', fontSize: 13, letterSpacing: 0, lineHeight: 18 },
  caption: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, letterSpacing: 0, lineHeight: 18 },
  overline: { fontFamily: 'Manrope_700Bold', fontSize: 11, letterSpacing: 0.8, lineHeight: 15, textTransform: 'uppercase' as const },
  monoId: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, letterSpacing: 0, lineHeight: 18 },
  mono: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15, letterSpacing: 0 },
  button: { fontFamily: 'Manrope_700Bold', fontSize: 15, letterSpacing: 0, lineHeight: 20 },
};
