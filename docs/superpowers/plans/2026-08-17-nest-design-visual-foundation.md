# NEST Design Visual Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Aurora Deep glass system with the NEST design's tokens, fonts, mesh-blob background, card materials, and neumorphic tab-bar chrome, per `docs/superpowers/specs/2026-08-17-nest-design-visual-foundation.md`. Re-skin the 5 existing screens; no new screens or content structure changes.

**Architecture:** A new `ThemeProvider`/`useTheme()` React Context (`mobile/src/theme/ThemeContext.tsx`) replaces the static `colors` export every existing component currently imports. Color tokens live in `mobile/src/theme/tokens.ts` (dark/light token tables, brand/semantic/category/status colors — all copied verbatim from the NEST design file). Google Fonts are loaded once at app root via `expo-font` + `@expo-google-fonts/*`, gated behind `expo-splash-screen`.

**Tech Stack:** Expo SDK 56, `expo-font` + `@expo-google-fonts/space-grotesk` + `@expo-google-fonts/manrope` + `@expo-google-fonts/jetbrains-mono` + `expo-splash-screen` (new), `@shopify/react-native-skia`'s `BlurMask` (new Skia feature, same library already in use), `expo-blur`, `react-native-reanimated`, `@react-native-async-storage/async-storage` (already a dependency, newly used for theme persistence).

**Verification approach:** Same as the prior phase — no test runner in this project; verify with `npx tsc --noEmit` after every step, and a final on-device checklist via Expo Go (per `mobile/AGENTS.md`).

---

### Task 1: Add font and splash-screen dependencies

**Files:**
- Modify: `mobile/package.json`

- [ ] **Step 1: Install via the Expo version resolver**

Run from `mobile/`:

```bash
npx expo install expo-font expo-splash-screen @expo-google-fonts/space-grotesk @expo-google-fonts/manrope @expo-google-fonts/jetbrains-mono
```

- [ ] **Step 2: Verify**

Run: `grep -E "expo-font|expo-splash-screen|expo-google-fonts" mobile/package.json`
Expected: 5 new lines under `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "chore(mobile): add font and splash-screen dependencies for NEST design"
```

---

### Task 2: Color/brand tokens

**Files:**
- Create: `mobile/src/theme/tokens.ts`

- [ ] **Step 1: Write the file**

```ts
// All values copied verbatim from the NEST design's DARK_TOKENS/LIGHT_TOKENS/
// CAT/STATUS_STYLE objects (docs/superpowers/specs/2026-08-17-nest-design-visual-foundation.md §2).
export interface ThemeTokens {
  bg: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  line: string;
  panel2: string;
  meshOp: number;
  meshOp2: number;
  meshOp3: number;
  neuLight: string;
  neuDark: string;
}

export const DARK_TOKENS: ThemeTokens = {
  bg: '#06100b',
  surface: 'rgba(22,38,31,0.62)',
  surfaceStrong: 'rgba(20,34,28,0.86)',
  border: 'rgba(255,255,255,0.14)',
  text: '#e9f1ec',
  text2: '#a3b6ad',
  text3: '#6d8278',
  line: 'rgba(255,255,255,0.09)',
  panel2: 'rgba(255,255,255,0.06)',
  meshOp: 0.28,
  meshOp2: 0.2,
  meshOp3: 0.16,
  neuLight: 'rgba(255,255,255,0.04)',
  neuDark: 'rgba(0,20,12,0.5)',
};

export const LIGHT_TOKENS: ThemeTokens = {
  bg: '#eef3ef',
  surface: 'rgba(255,255,255,0.68)',
  surfaceStrong: 'rgba(255,255,255,0.9)',
  border: 'rgba(16,50,36,0.12)',
  text: '#0e1d16',
  text2: '#41584d',
  text3: '#7a8d84',
  line: 'rgba(16,50,36,0.1)',
  panel2: 'rgba(16,50,36,0.05)',
  meshOp: 0.1,
  meshOp2: 0.08,
  meshOp3: 0.06,
  neuLight: 'rgba(255,255,255,0.9)',
  neuDark: 'rgba(163,182,173,0.45)',
};

// Mode-independent — NEST doesn't vary these between light/dark.
export const brand = {
  primary: '#15a05a',
  primaryGradientEnd: '#0f8a4c',
  primaryDim: '#0c6f3d',
  danger: '#f0556d',
};

export const semantic = {
  success: '#15a05a',
  warning: '#e08a14',
  danger: '#f0556d',
  info: '#2e9bff',
};

export const categoryColors = {
  CCTV: { color: '#15a05a', bg: 'rgba(21,160,90,0.16)' },
  Networking: { color: '#0ea5a5', bg: 'rgba(14,165,165,0.16)' },
  Biometric: { color: '#7c5cfc', bg: 'rgba(124,92,252,0.16)' },
  VDP: { color: '#6366f1', bg: 'rgba(99,102,241,0.16)' },
  GateAutomation: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)' },
} as const;

export const statusColors = {
  open: { color: '#2e9bff', bg: 'rgba(46,155,255,0.14)' },
  assigned: { color: '#7c5cfc', bg: 'rgba(124,92,252,0.14)' },
  progress: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)' },
  resolved: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)' },
} as const;
```

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/tokens.ts
git commit -m "feat(mobile): add NEST color/brand tokens"
```

---

### Task 3: `ThemeProvider` / `useTheme()`

**Files:**
- Create: `mobile/src/theme/ThemeContext.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_TOKENS, LIGHT_TOKENS, ThemeTokens } from './tokens';

type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  theme: ThemeTokens;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'nest-theme-mode';

const ThemeContext = createContext<ThemeState | undefined>(undefined);

// Defaults to the device's system setting on first launch. Once a user
// explicitly toggles (Settings screen ships in a later phase), the choice
// is persisted and overrides the system default from then on.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(systemScheme === 'light' ? 'light' : 'dark');

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') setMode(stored);
    })();
  }, []);

  const toggleTheme = () => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      theme: mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS,
      toggleTheme,
    }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/ThemeContext.tsx
git commit -m "feat(mobile): add ThemeProvider/useTheme with system-default and persisted mode"
```

---

### Task 4: Font loading hook

**Files:**
- Create: `mobile/src/theme/fonts.ts`

- [ ] **Step 1: Write the file**

```ts
import { useFonts } from 'expo-font';
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';

export function useAppFonts() {
  return useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/fonts.ts
git commit -m "feat(mobile): add useAppFonts hook for NEST's Google Fonts"
```

---

### Task 5: Rewrite `theme/index.ts` (typography without baked-in color)

**Files:**
- Modify: `mobile/src/theme/index.ts`

- [ ] **Step 1: Replace the file contents**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: **many errors** — every file still importing `colors` from this module now fails, since the export no longer exists. This is expected; the remaining tasks fix each one. Confirm the errors are all `has no exported member 'colors'` (or downstream usages of it) and nothing else — that's the signal this step did what it should.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/index.ts
git commit -m "feat(mobile): rewrite typography without baked-in color; drop static colors export"
```

---

### Task 6: Migrate `NetworkScene3D` off static `colors`

**Files:**
- Modify: `mobile/src/components/NetworkScene3D.tsx`

- [ ] **Step 1: Update the import and color usage**

```tsx
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber/native';
import type { Group } from 'three';
import { brand } from '../theme/tokens';
```

Replace the import line `import { colors } from '../theme';` with the block above, then update the two usages inside `RotatingNetwork`:

```tsx
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshBasicMaterial color={brand.primary} />
        </mesh>
```

and

```tsx
        <lineBasicMaterial color={brand.primaryDim} transparent opacity={0.55} />
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `NetworkScene3D.tsx` no longer appears in the error list.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/NetworkScene3D.tsx
git commit -m "fix(mobile): migrate NetworkScene3D off static colors export"
```

---

### Task 7: `MeshBackground` (replaces `AuroraBackground`)

**Files:**
- Create: `mobile/src/components/MeshBackground.tsx`
- Delete: `mobile/src/components/AuroraBackground.tsx`

- [ ] **Step 1: Write the new file**

```tsx
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurMask, Canvas, Circle } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

// Alpha-blends a hex color with an 0-1 opacity by appending an 8-digit hex
// alpha suffix — React Native's color parser supports #RRGGBBAA.
function withOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}

interface BlobProps {
  size: number;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  color: string;
  duration: number;
}

// One floating, self-blurred circle — NEST's ".nest-blob" (CSS blur(50px) +
// a ping-pong translate/scale float). Skia's BlurMask is the RN equivalent
// of a shape blurring its own edges (expo-blur only blurs what's *behind*
// a view, which isn't what a glowing blob needs). Durations differ per
// blob (20s/24s/26s) so they drift out of phase naturally — CSS's negative
// animation-delay trick (start already partway through the cycle) has no
// clean Reanimated equivalent, so this is the practical substitute.
function Blob({ size, left, top, right, bottom, color, duration }: BlobProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [reducedMotion, duration, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * size * 0.04 },
      { translateY: progress.value * size * 0.05 },
      { scale: 1 + progress.value * 0.15 },
    ],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size, left, top, right, bottom }, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} color={color}>
          <BlurMask blur={25} style="normal" />
        </Circle>
      </Canvas>
    </Animated.View>
  );
}

export default function MeshBackground() {
  const { theme } = useTheme();

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, overflow: 'hidden' }]} pointerEvents="none">
      <Blob size={220} left={-60} top={-40} color={withOpacity('#15a05a', theme.meshOp)} duration={20000} />
      <Blob size={200} right={-50} top={120} color={withOpacity('#0ea5a5', theme.meshOp2)} duration={24000} />
      <Blob size={180} left={40} bottom={60} color={withOpacity('#6366f1', theme.meshOp3)} duration={26000} />
    </View>
  );
}
```

- [ ] **Step 2: Delete the old file**

```bash
rm mobile/src/components/AuroraBackground.tsx
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: `MeshBackground.tsx` compiles cleanly. Screens still importing `AuroraBackground` now show a "Cannot find module" error — expected until their tasks (13–17) land.

- [ ] **Step 4: Commit**

```bash
git add -A mobile/src/components/MeshBackground.tsx mobile/src/components/AuroraBackground.tsx
git commit -m "feat(mobile): replace AuroraBackground with NEST's mesh-blob background"
```

---

### Task 8: Restyle `GlassCard`

**Files:**
- Modify: `mobile/src/components/GlassCard.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  /** NEST applies the drop shadow selectively (e.g. task rows), not to every card. */
  shadow?: boolean;
}

// Maps to NEST's `--surface` material: a blurred hero-style container.
export default function GlassCard({ children, style, shadow = false }: Props) {
  const { theme, mode } = useTheme();
  return (
    <View style={[styles.wrapper, { borderColor: theme.border }, shadow && styles.shadow, style]}>
      <BlurView intensity={mode === 'dark' ? 40 : 55} tint={mode} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface }]} pointerEvents="none" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.5,
    shadowRadius: 34,
    elevation: 8,
  },
  content: { padding: spacing(4) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `GlassCard.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/GlassCard.tsx
git commit -m "feat(mobile): restyle GlassCard to NEST's surface material"
```

---

### Task 9: `Panel` component (new — NEST's flat `panel2` tier)

**Files:**
- Create: `mobile/src/components/Panel.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

// Maps to NEST's `--panel2` material: flat, unblurred — used for list rows
// and secondary info blocks. GlassCard (blurred, `--surface`) is the other
// tier; NEST consistently uses both, unlike the single-tier Aurora system.
export default function Panel({ children, style }: Props) {
  const { theme } = useTheme();
  return <View style={[styles.wrapper, { backgroundColor: theme.panel2, borderColor: theme.line }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: radius.md, borderWidth: 1, padding: spacing(4) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/Panel.tsx
git commit -m "feat(mobile): add Panel component for NEST's flat panel2 material"
```

---

### Task 10: Restyle `GlassSurface`

**Files:**
- Modify: `mobile/src/components/GlassSurface.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  borderRadius?: number;
}

// Maps to NEST's `--surfaceStrong` material: the heavier blur used for the
// role-sheet/sidebar-drawer look. Only MoreSheet uses this now — the tab
// bar switched to an opaque neumorphic chrome (see GlassTabBar), matching
// NEST's own distinction between the two.
export default function GlassSurface({ children, style, borderRadius = radius.lg }: Props) {
  const { theme, mode } = useTheme();
  return (
    <View style={[styles.wrapper, { borderRadius, borderColor: theme.border }, style]}>
      <BlurView intensity={mode === 'dark' ? 55 : 70} tint={mode} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surfaceStrong, borderRadius }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderWidth: 1, overflow: 'hidden' },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/GlassSurface.tsx
git commit -m "feat(mobile): restyle GlassSurface to NEST's surfaceStrong material"
```

---

### Task 11: Migrate `AccentOrb` off static `colors`

**Files:**
- Modify: `mobile/src/components/AccentOrb.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, RadialGradient, SweepGradient, vec } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  size?: number;
}

// Not used by any screen under the NEST design — NEST's KPI/stat cards use
// a plain icon chip, not a floating 3D orb (see AnimatedStatCard). Kept as
// a working Skia component (the same self-blur/gradient technique NEST's
// own conic-gradient course-progress rings use) for a future screen.
export default function AccentOrb({ size = 28 }: Props) {
  const { theme } = useTheme();
  const tilt = useSharedValue(0);

  useEffect(() => {
    tilt.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [tilt]);

  const wobbleStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 200 },
      { rotateX: `${tilt.value * 10 - 5}deg` },
      { rotateY: `${tilt.value * 14 - 7}deg` },
    ],
  }));

  const r = size / 2;

  return (
    <Animated.View style={[{ width: size, height: size }, wobbleStyle]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={r} cy={r} r={r}>
          <SweepGradient c={vec(r, r)} colors={['#15a05a', '#7c5cfc', '#0ea5a5', '#15a05a']} />
        </Circle>
        <Circle cx={r} cy={r} r={r * 0.62} color={theme.bg} />
        <Circle cx={r * 0.7} cy={r * 0.65} r={r * 0.22}>
          <RadialGradient c={vec(r * 0.7, r * 0.65)} r={r * 0.22} colors={['rgba(255,255,255,0.85)', 'transparent']} />
        </Circle>
      </Canvas>
    </Animated.View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `AccentOrb.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/AccentOrb.tsx
git commit -m "fix(mobile): migrate AccentOrb off static colors export"
```

---

### Task 12: Restyle `AnimatedStatCard` (icon chip, not orb)

**Files:**
- Modify: `mobile/src/components/AnimatedStatCard.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';

interface Props {
  label: string;
  value: string | number;
  accentColor?: string;
  delayMs?: number;
}

// Same public API as before (label/value/accentColor/delayMs) — dashboard
// call sites don't change. The 3D AccentOrb is gone: NEST's own KPI cards
// use a plain colored icon chip with a simple glyph, so that's what this
// renders instead (see design spec §6).
export default function AnimatedStatCard({ label, value, accentColor, delayMs = 0 }: Props) {
  const { theme, mode } = useTheme();
  const color = accentColor || theme.text;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delayMs, withSpring(1, springs.move));
  }, [delayMs, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 18 },
      { scale: 0.92 + progress.value * 0.08 },
    ],
  }));

  return (
    <Animated.View style={[styles.card, { borderColor: theme.border }, animatedStyle]}>
      <BlurView intensity={mode === 'dark' ? 40 : 55} tint={mode} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface }]} pointerEvents="none" />
      <View style={[styles.iconChip, { backgroundColor: color + '29' }]}>
        <View style={[styles.iconDot, { borderColor: color }]} />
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={[styles.label, { color: theme.text3 }]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing(4), minWidth: 140, overflow: 'hidden' },
  iconChip: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  iconDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 2 },
  value: { ...typography.title, fontSize: 26 },
  label: { ...typography.caption },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `AnimatedStatCard.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/AnimatedStatCard.tsx
git commit -m "feat(mobile): restyle AnimatedStatCard with NEST icon chip, drop AccentOrb usage"
```

---

### Task 13: Restyle `GlowButton`

**Files:**
- Modify: `mobile/src/components/GlowButton.tsx`

- [ ] **Step 1: Update the import and gradient colors**

Replace the theme import line:

```tsx
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
```

Replace the gradient `colors` prop (previously `[colors.primary, colors.accentViolet]`):

```tsx
            <LinearGradient
              start={vec(0, 0)}
              end={vec(320, HEIGHT)}
              colors={[brand.primary, brand.primaryGradientEnd]}
            />
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `GlowButton.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/GlowButton.tsx
git commit -m "feat(mobile): restyle GlowButton to NEST's brand gradient"
```

---

### Task 14: Restyle `GlassTabBar` (neumorphic chrome)

**Files:**
- Modify: `mobile/src/components/GlassTabBar.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

export interface TabItem {
  key: string;
  label: string;
}

interface Props {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

// NEST's tab bar is opaque (background: var(--bg), no border, no blur) with
// a neumorphic drop shadow — a different material from the glass surfaces.
// RN can't do the dual light+dark shadow or a true inset shadow on one
// View, so this approximates: one outer drop shadow, and a solid two-tone
// fill instead of an inset shadow for the active icon (design spec §5.3).
export default function GlassTabBar({ items, activeKey, onSelect }: Props) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: theme.bg,
          shadowColor: theme.neuDark,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 10,
        },
      ]}
    >
      <View style={styles.row}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
              hitSlop={8}
            >
              <View style={[styles.iconWrap, active && { backgroundColor: theme.neuDark }]}>
                <View style={[styles.dot, { borderColor: active ? brand.primary : theme.text3 }]} />
              </View>
              <Text style={[styles.label, { color: active ? brand.primary : theme.text3 }]}>{item.label}</Text>
              <View style={[styles.indicator, active && { backgroundColor: brand.primary }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing(3),
    right: spacing(3),
    bottom: spacing(3.5),
    borderRadius: radius.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(1.5),
  },
  tab: { alignItems: 'center', gap: 6, flex: 1 },
  tabPressed: { opacity: 0.7 },
  iconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  label: { ...typography.caption, fontSize: 11 },
  indicator: { width: 16, height: 3, borderRadius: 2, marginTop: 2, backgroundColor: 'transparent' },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `GlassTabBar.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/GlassTabBar.tsx
git commit -m "feat(mobile): restyle GlassTabBar to NEST's neumorphic chrome"
```

---

### Task 15: Restyle `MoreSheet`

**Files:**
- Modify: `mobile/src/components/MoreSheet.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useEffect, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';

export interface MoreSheetSection {
  label: string;
}

interface Props {
  visible: boolean;
  sections: MoreSheetSection[];
  onClose: () => void;
}

const DISMISS_DISTANCE = 120;

export default function MoreSheet({ visible, sections, onClose }: Props) {
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(height);
  const scrim = useSharedValue(0);
  const dragStart = useRef(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, springs.drawer);
      scrim.value = withTiming(1, { duration: 220 });
    } else {
      translateY.value = withSpring(height, springs.drawer);
      scrim.value = withTiming(0, { duration: 220 });
    }
  }, [visible, height, translateY, scrim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => {
        dragStart.current = translateY.value;
      },
      onPanResponderMove: (_evt, gesture) => {
        const next = dragStart.current + gesture.dy;
        translateY.value = next < 0 ? 0 : next;
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > 1.2) {
          onClose();
        } else {
          translateY.value = withSpring(0, springs.drawer);
        }
      },
    }),
  ).current;

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrim.value * 0.5,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.sheetWrap, sheetStyle]} {...panResponder.panHandlers}>
        <GlassSurface style={styles.sheet} borderRadius={radius.lg}>
          <View style={[styles.grabber, { backgroundColor: theme.line }]} />
          <Text style={[styles.title, { color: theme.text }]}>More</Text>
          {sections.map((s) => (
            <View key={s.label} style={[styles.row, { borderBottomColor: theme.line }]}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>{s.label}</Text>
              <Text style={[styles.rowMeta, { color: theme.text3 }]}>Coming soon</Text>
            </View>
          ))}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { padding: spacing(5), paddingBottom: spacing(10), borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing(3) },
  title: { ...typography.heading, marginBottom: spacing(3) },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(3), borderBottomWidth: 1 },
  rowLabel: { ...typography.body },
  rowMeta: { ...typography.caption },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `MoreSheet.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/MoreSheet.tsx
git commit -m "feat(mobile): restyle MoreSheet to NEST's surfaceStrong role-sheet look"
```

---

### Task 16: Migrate `RootNavigator` off static `colors`

**Files:**
- Modify: `mobile/src/navigation/RootNavigator.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { brand } from '../theme/tokens';
import LoginScreen from '../screens/LoginScreen';
import ClientSubmitTicketScreen from '../screens/ClientSubmitTicketScreen';
import ClientTrackTicketScreen from '../screens/ClientTrackTicketScreen';
import EmployeeDashboardScreen from '../screens/EmployeeDashboardScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';

type GuestStackParams = {
  Login: undefined;
  SubmitTicket: undefined;
  TrackTicket: undefined;
};

const GuestStack = createNativeStackNavigator<GuestStackParams>();

function LoginRoute({ navigation }: any) {
  return (
    <LoginScreen
      onGoSubmit={() => navigation.navigate('SubmitTicket')}
      onGoTrack={() => navigation.navigate('TrackTicket')}
    />
  );
}

function SubmitTicketRoute({ navigation }: any) {
  return <ClientSubmitTicketScreen onBack={() => navigation.goBack()} />;
}

function TrackTicketRoute({ navigation }: any) {
  return <ClientTrackTicketScreen onBack={() => navigation.goBack()} />;
}

// Guest side (unauthenticated) gets a real stack — sign-in, submit a
// request, track a request — with native slide transitions between them.
// Once signed in, role picks exactly one dashboard, so no stack is needed
// there yet; add one per role as each grows past a single screen.
function GuestNavigator() {
  return (
    <GuestStack.Navigator screenOptions={{ headerShown: false }}>
      <GuestStack.Screen name="Login" component={LoginRoute} />
      <GuestStack.Screen name="SubmitTicket" component={SubmitTicketRoute} options={{ animation: 'slide_from_right' }} />
      <GuestStack.Screen name="TrackTicket" component={TrackTicketRoute} options={{ animation: 'slide_from_right' }} />
    </GuestStack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const { theme, mode } = useTheme();

  const navTheme = {
    ...(mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.bg,
      primary: brand.primary,
      card: theme.surface,
    },
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={brand.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? <GuestNavigator /> : user.role === 'admin' ? <AdminDashboardScreen /> : <EmployeeDashboardScreen />}
    </NavigationContainer>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `RootNavigator.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/navigation/RootNavigator.tsx
git commit -m "fix(mobile): migrate RootNavigator off static colors, react to theme mode"
```

---

### Task 17: Wire `ThemeProvider` and font loading into `App.tsx`

**Files:**
- Modify: `mobile/App.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/theme/ThemeContext';
import { useAppFonts } from './src/theme/fonts';
import RootNavigator from './src/navigation/RootNavigator';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `App.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/App.tsx
git commit -m "feat(mobile): wire ThemeProvider and NEST font loading into App root"
```

---

### Task 18: Re-skin `LoginScreen`

**Files:**
- Modify: `mobile/src/screens/LoginScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import NetworkScene3D from '../components/NetworkScene3D';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { ApiError } from '../api/client';

interface Props {
  onGoSubmit: () => void;
  onGoTrack: () => void;
}

export default function LoginScreen({ onGoSubmit, onGoTrack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      console.log('Login error:', err);
      setError(err instanceof ApiError ? err.message : 'Could not sign in — check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <View style={styles.sceneWrap}>
        <NetworkScene3D />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.formWrap, { paddingBottom: insets.bottom + spacing(6) }]}
      >
        <Text style={[styles.brand, { color: theme.text }]}>Networking Experts</Text>
        <Text style={[styles.tagline, { color: theme.text3 }]}>Staff sign-in</Text>

        <GlassCard>
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Email"
            placeholderTextColor={theme.text3}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={[styles.input, { color: theme.text, marginBottom: 0 }]}
            placeholder="Password"
            placeholderTextColor={theme.text3}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <GlowButton label="Sign In" onPress={handleLogin} loading={loading} />

        <Text style={styles.guestLink} onPress={onGoSubmit}>
          Not staff? Submit a service request →
        </Text>
        <Text style={styles.guestLink} onPress={onGoTrack}>
          Track an existing request →
        </Text>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sceneWrap: { flex: 1.1 },
  formWrap: { paddingHorizontal: spacing(6), paddingTop: spacing(4) },
  brand: { ...typography.title, textAlign: 'center' },
  tagline: { ...typography.caption, textAlign: 'center', marginBottom: spacing(5) },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(2), textAlign: 'center' },
  guestLink: { ...typography.caption, color: brand.primary, textAlign: 'center', marginTop: spacing(4) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `LoginScreen.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/LoginScreen.tsx
git commit -m "feat(mobile): re-skin LoginScreen to NEST design"
```

---

### Task 19: Re-skin `ClientSubmitTicketScreen`

**Files:**
- Modify: `mobile/src/screens/ClientSubmitTicketScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { submitInquiry, Inquiry } from '../api/inquiries';

interface Props {
  onBack: () => void;
}

export default function ClientSubmitTicketScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [issue, setIssue] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Inquiry | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim() || !location.trim() || !issue.trim()) {
      setError('Please fill in name, phone, location, and the issue');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const inquiry = await submitInquiry({
        full_name: name.trim(),
        phone: phone.trim().startsWith('+') ? phone.trim() : `+91${phone.trim()}`,
        location: location.trim(),
        service_item: issue.trim(),
        description: description.trim() || null,
      });
      setResult(inquiry);
    } catch (err) {
      setError('Could not submit your request — check your connection and try again');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <GlassCard style={styles.resultCard}>
            <Text style={[styles.title, { color: theme.text }]}>Request Submitted</Text>
            <Text style={[styles.body, { color: theme.text, marginTop: spacing(3), textAlign: 'center' }]}>
              Your ticket number is
            </Text>
            <Text style={styles.ticketNo}>{result.ticket_no}</Text>
            <Text style={[styles.caption, { color: theme.text3, textAlign: 'center', marginTop: spacing(2) }]}>
              Save this number — you can track your request status with it any time.
            </Text>
          </GlassCard>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MeshBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
          <Text style={[styles.title, { color: theme.text }]}>Submit a Service Request</Text>

          <GlassCard style={styles.formCard}>
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="Your name" placeholderTextColor={theme.text3} value={name} onChangeText={setName} />
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="Phone number" placeholderTextColor={theme.text3} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="Location / address" placeholderTextColor={theme.text3} value={location} onChangeText={setLocation} />
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="What's the issue?" placeholderTextColor={theme.text3} value={issue} onChangeText={setIssue} />
            <TextInput
              style={[styles.input, styles.textArea, { color: theme.text, marginBottom: 0 }]}
              placeholder="Additional details (optional)"
              placeholderTextColor={theme.text3}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </GlassCard>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <GlowButton label="Submit Request" onPress={handleSubmit} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing(6) },
  formCard: { marginTop: spacing(4) },
  resultCard: { alignItems: 'center', paddingVertical: spacing(6) },
  title: { ...typography.title },
  body: { ...typography.body },
  caption: { ...typography.caption },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  ticketNo: { ...typography.title, fontFamily: 'JetBrainsMono_700Bold', color: brand.primary, marginTop: spacing(2), letterSpacing: 1 },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `ClientSubmitTicketScreen.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/ClientSubmitTicketScreen.tsx
git commit -m "feat(mobile): re-skin ClientSubmitTicketScreen to NEST design"
```

---

### Task 20: Re-skin `ClientTrackTicketScreen`

**Files:**
- Modify: `mobile/src/screens/ClientTrackTicketScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { trackInquiry, Inquiry } from '../api/inquiries';

interface Props {
  onBack: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  case_closed: 'Closed',
};

export default function ClientTrackTicketScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [ticketNo, setTicketNo] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Inquiry[] | null>(null);

  const handleTrack = async () => {
    if (!ticketNo.trim() || !phone.trim()) {
      setError('Enter both your ticket number and phone number');
      return;
    }
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const phoneNormalized = phone.trim().startsWith('+') ? phone.trim() : `+91${phone.trim()}`;
      const rows = await trackInquiry(ticketNo.trim(), phoneNormalized);
      if (rows.length === 0) setError('No ticket found for that number and phone — double-check and try again');
      else setResults(rows);
    } catch {
      setError('Could not check your ticket — check your connection and try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Track Your Request</Text>

        <GlassCard style={styles.formCard}>
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Ticket number (e.g. NE-260812-1234)"
            placeholderTextColor={theme.text3}
            autoCapitalize="characters"
            value={ticketNo}
            onChangeText={setTicketNo}
          />
          <TextInput
            style={[styles.input, { color: theme.text, marginBottom: 0 }]}
            placeholder="Phone number"
            placeholderTextColor={theme.text3}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <GlowButton label="Check Status" onPress={handleTrack} loading={loading} />

        {results?.map((r) => (
          <GlassCard key={r.id} style={styles.resultCard}>
            <Text style={[styles.heading, { color: theme.text }]}>{r.ticket_no}</Text>
            <Text style={[styles.body, { color: theme.text, marginTop: spacing(1) }]}>{r.service_item}</Text>
            <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(2) }]}>Status</Text>
            <Text style={styles.statusValue}>{STATUS_LABEL[r.status] || r.status}</Text>
          </GlassCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  formCard: { marginTop: spacing(4) },
  title: { ...typography.title },
  heading: { ...typography.heading },
  body: { ...typography.body },
  caption: { ...typography.caption },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  resultCard: { marginTop: spacing(5) },
  statusValue: { ...typography.body, color: brand.primary, fontWeight: '700', fontSize: 16 },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `ClientTrackTicketScreen.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/ClientTrackTicketScreen.tsx
git commit -m "feat(mobile): re-skin ClientTrackTicketScreen to NEST design"
```

---

### Task 21: Re-skin `EmployeeDashboardScreen`

**Files:**
- Modify: `mobile/src/screens/EmployeeDashboardScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedStatCard from '../components/AnimatedStatCard';
import MeshBackground from '../components/MeshBackground';
import GlassTabBar from '../components/GlassTabBar';
import MoreSheet from '../components/MoreSheet';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { semantic } from '../theme/tokens';
import { fetchMyTickets, fetchTodayAttendance, AttendanceRow, TicketRow } from '../api/employee';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'more', label: 'More' },
];

// The web app's employee-relevant sections not yet ported to mobile — see
// design spec §5/§8. Each becomes a real route in a later phase.
const MORE_SECTIONS = [
  { label: 'Job Cards' },
  { label: 'Device Tracking' },
  { label: 'Training' },
  { label: 'Media Training' },
  { label: 'Notifications' },
  { label: 'Profile' },
];

export default function EmployeeDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [att, tix] = await Promise.all([fetchTodayAttendance(user.id), fetchMyTickets(user.id)]);
      setAttendance(att);
      setTickets(tix);
      setError(null);
    } catch (err) {
      setError('Could not load dashboard — pull to retry');
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openTickets = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'case_closed').length;
  const clockedIn = !!attendance?.clock_in && !attendance?.clock_out;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={[styles.title, { color: theme.text }]}>Hi, {user?.full_name?.split(' ')[0] || 'there'}</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>{user?.worker_type === 'gig' ? 'Gig worker' : 'Fixed employee'}</Text>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginTop: spacing(3) }]}>{error}</Text> : null}

        <View style={styles.row}>
          <AnimatedStatCard
            label={clockedIn ? 'Clocked In' : 'Not Clocked In'}
            value={clockedIn ? '●' : '○'}
            accentColor={clockedIn ? semantic.success : theme.text3}
            delayMs={0}
          />
          <AnimatedStatCard label="Open Tickets" value={openTickets} accentColor={semantic.warning} delayMs={100} />
        </View>

        <Text style={[styles.heading, { color: theme.text, marginTop: spacing(6), marginBottom: spacing(2) }]}>My Tickets</Text>
        {tickets.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No tickets assigned right now.</Text>
        ) : (
          tickets.slice(0, 8).map((t) => (
            <View key={t.id} style={[styles.ticketRow, { borderBottomColor: theme.line }]}>
              <Text style={[styles.body, { color: theme.text }]}>#{t.id.slice(0, 8)}</Text>
              <Text style={[styles.caption, { color: theme.text3, textTransform: 'capitalize' }]}>{t.status}</Text>
            </View>
          ))
        )}

        <GlowButton label="Sign Out" onPress={logout} />
      </ScrollView>

      <GlassTabBar
        items={TABS}
        activeKey={moreVisible ? 'more' : 'dashboard'}
        onSelect={(key) => setMoreVisible(key === 'more')}
      />
      <MoreSheet visible={moreVisible} sections={MORE_SECTIONS} onClose={() => setMoreVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
  title: { ...typography.title },
  heading: { ...typography.heading },
  body: { ...typography.body },
  caption: { ...typography.caption },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(2),
    borderBottomWidth: 1,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `EmployeeDashboardScreen.tsx` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EmployeeDashboardScreen.tsx
git commit -m "feat(mobile): re-skin EmployeeDashboardScreen to NEST design"
```

---

### Task 22: Re-skin `AdminDashboardScreen`

**Files:**
- Modify: `mobile/src/screens/AdminDashboardScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedStatCard from '../components/AnimatedStatCard';
import MeshBackground from '../components/MeshBackground';
import GlassTabBar from '../components/GlassTabBar';
import MoreSheet from '../components/MoreSheet';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { semantic } from '../theme/tokens';
import { fetchAllUsers, fetchOpenInquiries, AdminUserRow, InquiryRow } from '../api/admin';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'more', label: 'More' },
];

// The web app's admin sections not yet ported to mobile — see design
// spec §5/§8. Each becomes a real route in a later phase.
const MORE_SECTIONS = [
  { label: 'Job Cards' },
  { label: 'Finance' },
  { label: 'Discounts' },
  { label: 'Device Tracking' },
  { label: 'Training' },
  { label: 'Media Training' },
  { label: 'Stats' },
  { label: 'Admin Notices' },
  { label: 'Collections' },
  { label: 'AI Assistant' },
  { label: 'Notifications' },
  { label: 'Dashboard Widgets' },
  { label: 'Profile' },
];

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, inq] = await Promise.all([fetchAllUsers(), fetchOpenInquiries()]);
      setUsers(u);
      setInquiries(inq);
      setError(null);
    } catch {
      setError('Could not load dashboard — pull to retry');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const employeeCount = users.filter((u) => u.role === 'employee').length;
  const openCount = inquiries.filter((i) => i.status !== 'resolved' && i.status !== 'case_closed').length;
  const unassignedCount = inquiries.filter((i) => i.assignment_status === 'none' || i.assignment_status === 'pending').length;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={[styles.title, { color: theme.text }]}>Admin</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>{user?.full_name}</Text>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginTop: spacing(3) }]}>{error}</Text> : null}

        <View style={styles.row}>
          <AnimatedStatCard label="Employees" value={employeeCount} accentColor={semantic.success} delayMs={0} />
          <AnimatedStatCard label="Open Tickets" value={openCount} accentColor={semantic.warning} delayMs={100} />
        </View>
        <View style={[styles.row, { marginTop: spacing(3) }]}>
          <AnimatedStatCard label="Needs Assignment" value={unassignedCount} accentColor={semantic.danger} delayMs={200} />
        </View>

        <GlowButton label="Sign Out" onPress={logout} />
      </ScrollView>

      <GlassTabBar
        items={TABS}
        activeKey={moreVisible ? 'more' : 'dashboard'}
        onSelect={(key) => setMoreVisible(key === 'more')}
      />
      <MoreSheet visible={moreVisible} sections={MORE_SECTIONS} onClose={() => setMoreVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
  title: { ...typography.title },
  caption: { ...typography.caption },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `AdminDashboardScreen.tsx` compiles cleanly, **and the overall project error count is now zero** — this was the last file referencing the old static `colors` export.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/AdminDashboardScreen.tsx
git commit -m "feat(mobile): re-skin AdminDashboardScreen to NEST design"
```

---

### Task 23: Manual on-device verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm zero type errors project-wide**

Run: `npx tsc --noEmit`
Expected: no output at all (clean).

- [ ] **Step 2: Start the dev server and open on a real device**

Run from `mobile/`: `npx expo start`, then scan the QR code with Expo Go (per `mobile/AGENTS.md`).

- [ ] **Step 3: Check each screen against the design spec**

- **Login** — Space Grotesk brand wordmark, Manrope body text, three soft colored blobs floating slowly behind the rotating network orb, glass card around the form, green→dark-green Sign In button.
- **Submit/Track Ticket** — same mesh background; ticket number renders in monospace (JetBrains Mono).
- **Employee/Admin Dashboard** — stat cards show a small colored icon chip (not a floating orb); the bottom tab bar is opaque (not glassy/blurred) with a soft drop shadow and a green active-tab indicator; tapping "More" opens a blurred sheet that drags down to dismiss.
- **General** — no screen shows the old violet/cyan Aurora gradient anymore.

- [ ] **Step 4: Confirm system-theme default (light/dark)**

There's no in-app toggle yet (Settings ships in a later phase), so this checks the *default*: change the phone's system-wide dark/light mode setting, then relaunch the Expo Go app (cold start, since the mode is only read at `ThemeProvider` mount). Confirm the background, text, and card colors switch to match — `bg` goes from near-black to a light `#eef3ef`, text flips from light to dark, etc.

- [ ] **Step 5: Report back**

If everything matches, this phase is done — ready to start phase 2 (Landing + role routing) or phase 3 (Technician app screens) per the agreed breakdown. If something looks off, note which screen and what's wrong.
