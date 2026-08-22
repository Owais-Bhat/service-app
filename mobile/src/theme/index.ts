// Layout constants only — color now comes from useTheme() (theme/ThemeContext.tsx),
// not from a static export, so light/dark switching works. See
// docs/superpowers/specs/2026-08-17-nest-design-visual-foundation.md.

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 26,
  full: 999,
};

// Font families are the three NEST typefaces (theme/fonts.ts loads them).
// No `color` field — every usage merges in theme.text/theme.text3/etc, or a
// brand color, at the point of use so it reacts to theme mode.
export const typography = {
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28, letterSpacing: -0.4, lineHeight: 32 },
  heading: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, letterSpacing: -0.2, lineHeight: 24 },
  body: { fontFamily: 'Manrope_400Regular', fontSize: 15, letterSpacing: 0, lineHeight: 22 },
  caption: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, letterSpacing: 0.1, lineHeight: 18 },
  mono: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15, letterSpacing: 0 },
};
