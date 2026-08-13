# Mobile Liquid Glass Design System (Pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply an Apple-style "liquid glass" visual system (Aurora Deep materials, Skia-based 3D accents, spring-driven motion, hybrid tab-bar navigation) to the mobile app's 5 existing screens, per `docs/superpowers/specs/2026-08-13-mobile-liquid-glass-design-system-design.md`.

**Architecture:** New reusable components under `mobile/src/components/` (`AuroraBackground`, `GlassCard`, `GlassSurface`, `AccentOrb`, `GlassTabBar`, `MoreSheet`) plus a shared `mobile/src/theme/motion.ts` spring-preset module. Existing screens are edited in place to use these components; `RootNavigator.tsx` is untouched because the new tab bar/sheet are owned locally by each dashboard screen, not by React Navigation.

**Tech Stack:** Expo SDK 56, React Native 0.85, `react-native-reanimated` 4.5 (duration/dampingRatio springs), `@shopify/react-native-skia` 2.11 (gradients/shaders), `expo-blur` (new — real native backdrop blur), core React Native `PanResponder` (no new gesture dependency).

**Verification approach:** This project has no test runner configured (`mobile/package.json` has no `jest`/testing dependency) and `mobile/AGENTS.md` establishes that this app is tested via **Expo Go on a real device**, not a browser preview — SDK 56 was deliberately pinned for real-device Expo Go compatibility. So every task verifies with `npx tsc --noEmit` (catches type/import/prop errors immediately) and the final task is a manual on-device checklist. No task claims visual verification that wasn't actually performed on a device.

---

### Task 1: Add the `expo-blur` dependency

**Files:**
- Modify: `mobile/package.json`

- [ ] **Step 1: Install via the Expo version resolver**

Run from the `mobile/` directory:

```bash
npx expo install expo-blur
```

This picks the exact version compatible with SDK 56 and writes it into `package.json` — don't hand-edit a version number.

- [ ] **Step 2: Verify it installed**

Run: `grep expo-blur mobile/package.json`
Expected: a line like `"expo-blur": "~56.0.x"` under `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "chore(mobile): add expo-blur for native glass materials"
```

---

### Task 2: Add Aurora Deep design tokens to the theme

**Files:**
- Modify: `mobile/src/theme/index.ts`

- [ ] **Step 1: Replace the file contents**

```ts
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
```

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors (existing screens only read tokens that still exist; nothing was renamed or removed).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/index.ts
git commit -m "feat(mobile): add Aurora Deep glass tokens and optical type scale"
```

---

### Task 3: Add shared spring presets

**Files:**
- Create: `mobile/src/theme/motion.ts`

- [ ] **Step 1: Write the file**

```ts
// Reanimated's duration/dampingRatio spring config maps directly onto
// Apple's "response" (here: duration, ms) and "damping ratio" parameters
// from Designing Fluid Interfaces (WWDC 2018). Every settling animation in
// this design system pulls its spring config from here instead of
// inventing its own timing. (AccentOrb's idle wobble is a looping
// withRepeat/withTiming, not a spring — springs settle to a target, which
// isn't what an infinite ambient loop needs.)
export const springs = {
  // Reposition/mount — critically damped, no overshoot.
  move: { duration: 400, dampingRatio: 1.0 },
  // Sheets/drawers — slight bounce only because the gesture carries momentum.
  drawer: { duration: 300, dampingRatio: 0.8 },
} as const;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/motion.ts
git commit -m "feat(mobile): add shared spring presets for the glass design system"
```

---

### Task 4: `AuroraBackground` component

**Files:**
- Create: `mobile/src/components/AuroraBackground.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas, Rect, RadialGradient, vec } from '@shopify/react-native-skia';
import { colors } from '../theme';

// Skia radial-gradient blooms over a near-black base — the "Aurora Deep"
// background used behind every screen so the app reads as one continuous
// material instead of separate flat-colored screens.
export default function AuroraBackground() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Canvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height} color={colors.bg} />
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={vec(width * 0.78, height * 0.02)} r={width * 0.9} colors={[colors.auroraViolet, 'transparent']} />
        </Rect>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={vec(width * 0.5, height * 0.32)} r={width} colors={[colors.auroraNavy, 'transparent']} />
        </Rect>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={vec(width * 0.28, height * 0.78)} r={width * 0.7} colors={['#0e3a33', 'transparent']} />
        </Rect>
      </Canvas>
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/AuroraBackground.tsx
git commit -m "feat(mobile): add AuroraBackground component"
```

---

### Task 5: `GlassCard` component

**Files:**
- Create: `mobile/src/components/GlassCard.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

// The standard card / form / list-row container for the glass design
// system — real native backdrop blur (expo-blur), not a faked
// translucent box, per the design spec's "real blur, not faked" call.
export default function GlassCard({ children, style }: Props) {
  return (
    <View style={[styles.wrapper, style]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.tint} pointerEvents="none" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderTopColor: colors.glassHighlight,
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassFill,
  },
  content: {
    padding: spacing(4),
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/GlassCard.tsx
git commit -m "feat(mobile): add GlassCard component"
```

---

### Task 6: `GlassSurface` component

**Files:**
- Create: `mobile/src/components/GlassSurface.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  borderRadius?: number;
}

// Heavier-blur variant of GlassCard for floating chrome — the tab bar and
// sheets — which sit over busier, scrolling content and need a stronger
// separation per the apple-design "bigger surfaces read as thicker" rule.
export default function GlassSurface({ children, style, borderRadius = radius.lg }: Props) {
  return (
    <View style={[styles.wrapper, { borderRadius }, style]}>
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={[styles.tint, { borderRadius }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderTopColor: colors.glassHighlight,
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassFill,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/GlassSurface.tsx
git commit -m "feat(mobile): add GlassSurface component"
```

---

### Task 7: `AccentOrb` component (Skia pseudo-3D)

**Files:**
- Create: `mobile/src/components/AccentOrb.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, SweepGradient, RadialGradient, vec } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors } from '../theme';

interface Props {
  size?: number;
}

// The "3D accent" decoration for dashboard cards (design spec §4). This is
// deliberately Skia (a shader-drawn sweep-gradient ring + specular
// highlight, idly tilted via Reanimated) rather than a real three.js
// Canvas per card — mounting a separate WebGL context per visible card
// would hurt performance and risks crashes on lower-end Android once a
// screen has several cards on it at once. NetworkScene3D remains the one
// genuine three.js scene in the app, on the login screen only.
export default function AccentOrb({ size = 28 }: Props) {
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
      <Canvas style={StyleSheet.absoluteFillObject}>
        <Circle cx={r} cy={r} r={r}>
          <SweepGradient c={vec(r, r)} colors={[colors.primary, colors.accentViolet, colors.accentCyan, colors.primary]} />
        </Circle>
        <Circle cx={r} cy={r} r={r * 0.62} color={colors.auroraNavy} />
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
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/AccentOrb.tsx
git commit -m "feat(mobile): add AccentOrb 3D-accent component"
```

---

### Task 8: Rebuild `AnimatedStatCard` on glass + `AccentOrb` + springs

**Files:**
- Modify: `mobile/src/components/AnimatedStatCard.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import AccentOrb from './AccentOrb';
import { colors, radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';

interface Props {
  label: string;
  value: string | number;
  accentColor?: string;
  delayMs?: number;
}

// Same public API as before this pass (label/value/accentColor/delayMs) —
// dashboard call sites don't change. Internals move from a flat surface +
// fixed-duration timing curve to GlassCard-style glass + a spring entrance,
// per the design system's motion rules (critically-damped default, no
// fixed-duration animation on anything that mounts/moves).
export default function AnimatedStatCard({ label, value, accentColor = colors.primary, delayMs = 0 }: Props) {
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
    <Animated.View style={[styles.card, animatedStyle]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.tint} pointerEvents="none" />
      <View style={styles.orbSlot}>
        <AccentOrb size={26} />
      </View>
      <Text style={[typography.title, { color: accentColor, fontSize: 26 }]}>{value}</Text>
      <Text style={typography.caption}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderTopColor: colors.glassHighlight,
    padding: spacing(4),
    minWidth: 140,
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassFill,
  },
  orbSlot: {
    position: 'absolute',
    top: spacing(2),
    right: spacing(2),
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`EmployeeDashboardScreen.tsx` and `AdminDashboardScreen.tsx` already call `AnimatedStatCard` with exactly this prop set, so no call-site changes are needed yet.)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/AnimatedStatCard.tsx
git commit -m "feat(mobile): rebuild AnimatedStatCard on glass materials and springs"
```

---

### Task 9: Restyle `GlowButton` for Aurora Deep

**Files:**
- Modify: `mobile/src/components/GlowButton.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Canvas, RoundedRect, LinearGradient, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const HEIGHT = 52;

// Skia-rendered gradient background with a Reanimated-driven pulsing glow —
// the two animation systems doing what each is best at: Skia for the GPU
// shader-drawn gradient, Reanimated for the UI-thread opacity/scale pulse.
export default function GlowButton({ label, onPress, disabled, loading }: Props) {
  const pulse = useSharedValue(0.6);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.5 : pulse.value,
    transform: [{ scale: 0.98 + pulse.value * 0.02 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
    >
      <Animated.View style={[styles.canvasWrap, glowStyle]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <RoundedRect x={0} y={0} width={320} height={HEIGHT} r={radius.md}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(320, HEIGHT)}
              colors={[colors.primary, colors.accentViolet]}
            />
          </RoundedRect>
        </Canvas>
      </Animated.View>
      <Text style={[typography.heading, styles.label]}>{loading ? 'Please wait…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: HEIGHT,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing(2),
  },
  pressed: { transform: [{ scale: 0.97 }] },
  canvasWrap: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  label: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/GlowButton.tsx
git commit -m "feat(mobile): restyle GlowButton for Aurora Deep, add press feedback"
```

---

### Task 10: `GlassTabBar` component

**Files:**
- Create: `mobile/src/components/GlassTabBar.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import GlassSurface from './GlassSurface';
import { colors, radius, spacing, typography } from '../theme';

export interface TabItem {
  key: string;
  label: string;
}

interface Props {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

// Floating glass bottom tab bar. Generic and config-driven — it doesn't
// know about "Dashboard" or "More" specifically — so later phases can add
// tabs per role without touching this component.
export default function GlassTabBar({ items, activeKey, onSelect }: Props) {
  return (
    <GlassSurface style={styles.wrapper} borderRadius={radius.full}>
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
              <View style={[styles.dot, active && styles.dotActive]} />
              <Text style={[typography.caption, active && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing(4),
    right: spacing(4),
    bottom: spacing(4),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing(3),
  },
  tab: { alignItems: 'center', gap: 4 },
  tabPressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.8, shadowRadius: 6 },
  labelActive: { color: colors.text, fontWeight: '700' },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/GlassTabBar.tsx
git commit -m "feat(mobile): add GlassTabBar component"
```

---

### Task 11: `MoreSheet` component (draggable, coming-soon rows)

**Files:**
- Create: `mobile/src/components/MoreSheet.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useEffect, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import { colors, radius, spacing, typography } from '../theme';
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

// The hybrid nav pattern's "More" destination — a glass grid sheet.
// Draggable-to-dismiss via PanResponder (core React Native — no new
// gesture dependency, since the design spec approved only expo-blur as a
// new package for this phase). Sections are rendered as explicit
// "Coming soon" rows: a complete, working nav shell today, not a
// half-built feature — phase 2 swaps rows for real routes one at a time.
export default function MoreSheet({ visible, sections, onClose }: Props) {
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
    <View style={StyleSheet.absoluteFillObject} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.sheetWrap, sheetStyle]} {...panResponder.panHandlers}>
        <GlassSurface style={styles.sheet} borderRadius={radius.lg}>
          <View style={styles.grabber} />
          <Text style={[typography.heading, styles.title]}>More</Text>
          {sections.map((s) => (
            <View key={s.label} style={styles.row}>
              <Text style={typography.body}>{s.label}</Text>
              <Text style={typography.caption}>Coming soon</Text>
            </View>
          ))}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { padding: spacing(5), paddingBottom: spacing(10) },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.glassBorder, marginBottom: spacing(3) },
  title: { marginBottom: spacing(3) },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/MoreSheet.tsx
git commit -m "feat(mobile): add draggable MoreSheet component"
```

---

### Task 12: Apply glass system to `LoginScreen`

**Files:**
- Modify: `mobile/src/screens/LoginScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuroraBackground from '../components/AuroraBackground';
import GlassCard from '../components/GlassCard';
import NetworkScene3D from '../components/NetworkScene3D';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, typography } from '../theme';
import { ApiError } from '../api/client';

interface Props {
  onGoSubmit: () => void;
  onGoTrack: () => void;
}

export default function LoginScreen({ onGoSubmit, onGoTrack }: Props) {
  const insets = useSafeAreaInsets();
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
      <AuroraBackground />
      <View style={styles.sceneWrap}>
        <NetworkScene3D />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.formWrap, { paddingBottom: insets.bottom + spacing(6) }]}
      >
        <Text style={styles.brand}>Networking Experts</Text>
        <Text style={styles.tagline}>Staff sign-in</Text>

        <GlassCard>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            placeholder="Password"
            placeholderTextColor={colors.textDim}
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
  root: { flex: 1, backgroundColor: colors.bg },
  sceneWrap: { flex: 1.1 },
  formWrap: {
    paddingHorizontal: spacing(6),
    paddingTop: spacing(4),
  },
  brand: { ...typography.title, textAlign: 'center' },
  tagline: { ...typography.caption, textAlign: 'center', marginBottom: spacing(5) },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    color: colors.text,
    marginBottom: spacing(3),
    fontSize: 15,
  },
  error: { color: colors.danger, marginBottom: spacing(2), textAlign: 'center' },
  guestLink: {
    ...typography.caption,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing(4),
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/LoginScreen.tsx
git commit -m "feat(mobile): apply glass design system to LoginScreen"
```

---

### Task 13: Apply glass system to `ClientSubmitTicketScreen`

**Files:**
- Modify: `mobile/src/screens/ClientSubmitTicketScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuroraBackground from '../components/AuroraBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { colors, radius, spacing, typography } from '../theme';
import { submitInquiry, Inquiry } from '../api/inquiries';

interface Props {
  onBack: () => void;
}

export default function ClientSubmitTicketScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
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
        <AuroraBackground />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <GlassCard style={styles.resultCard}>
            <Text style={typography.title}>Request Submitted</Text>
            <Text style={[typography.body, { marginTop: spacing(3), textAlign: 'center' }]}>
              Your ticket number is
            </Text>
            <Text style={styles.ticketNo}>{result.ticket_no}</Text>
            <Text style={[typography.caption, { textAlign: 'center', marginTop: spacing(2) }]}>
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
      <AuroraBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
          <Text style={typography.title}>Submit a Service Request</Text>

          <GlassCard style={styles.formCard}>
            <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={colors.textDim} value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor={colors.textDim} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <TextInput style={styles.input} placeholder="Location / address" placeholderTextColor={colors.textDim} value={location} onChangeText={setLocation} />
            <TextInput style={styles.input} placeholder="What's the issue?" placeholderTextColor={colors.textDim} value={issue} onChangeText={setIssue} />
            <TextInput
              style={[styles.input, styles.textArea, { marginBottom: 0 }]}
              placeholder="Additional details (optional)"
              placeholderTextColor={colors.textDim}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </GlassCard>

          {error ? <Text style={{ color: colors.danger, marginTop: spacing(3) }}>{error}</Text> : null}

          <GlowButton label="Submit Request" onPress={handleSubmit} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing(6) },
  formCard: { marginTop: spacing(4) },
  resultCard: { alignItems: 'center', paddingVertical: spacing(6) },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    color: colors.text,
    marginBottom: spacing(3),
    fontSize: 15,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  link: { ...typography.caption, color: colors.primary, marginBottom: spacing(3) },
  ticketNo: { ...typography.title, color: colors.primary, marginTop: spacing(2), letterSpacing: 1 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/ClientSubmitTicketScreen.tsx
git commit -m "feat(mobile): apply glass design system to ClientSubmitTicketScreen"
```

---

### Task 14: Apply glass system to `ClientTrackTicketScreen`

**Files:**
- Modify: `mobile/src/screens/ClientTrackTicketScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuroraBackground from '../components/AuroraBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { colors, radius, spacing, typography } from '../theme';
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
      <AuroraBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={typography.title}>Track Your Request</Text>

        <GlassCard style={styles.formCard}>
          <TextInput
            style={styles.input}
            placeholder="Ticket number (e.g. NE-260812-1234)"
            placeholderTextColor={colors.textDim}
            autoCapitalize="characters"
            value={ticketNo}
            onChangeText={setTicketNo}
          />
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            placeholder="Phone number"
            placeholderTextColor={colors.textDim}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
        </GlassCard>

        {error ? <Text style={{ color: colors.danger, marginTop: spacing(3) }}>{error}</Text> : null}

        <GlowButton label="Check Status" onPress={handleTrack} loading={loading} />

        {results?.map((r) => (
          <GlassCard key={r.id} style={styles.resultCard}>
            <Text style={typography.heading}>{r.ticket_no}</Text>
            <Text style={[typography.body, { marginTop: spacing(1) }]}>{r.service_item}</Text>
            <Text style={[typography.caption, { marginTop: spacing(2) }]}>Status</Text>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>
              {STATUS_LABEL[r.status] || r.status}
            </Text>
          </GlassCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  formCard: { marginTop: spacing(4) },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    color: colors.text,
    marginBottom: spacing(3),
    fontSize: 15,
  },
  link: { ...typography.caption, color: colors.primary, marginBottom: spacing(3) },
  resultCard: { marginTop: spacing(5) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/ClientTrackTicketScreen.tsx
git commit -m "feat(mobile): apply glass design system to ClientTrackTicketScreen"
```

---

### Task 15: Apply glass system + hybrid nav to `EmployeeDashboardScreen`

**Files:**
- Modify: `mobile/src/screens/EmployeeDashboardScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedStatCard from '../components/AnimatedStatCard';
import AuroraBackground from '../components/AuroraBackground';
import GlassTabBar from '../components/GlassTabBar';
import MoreSheet from '../components/MoreSheet';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';
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
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={typography.title}>Hi, {user?.full_name?.split(' ')[0] || 'there'}</Text>
        <Text style={typography.caption}>{user?.worker_type === 'gig' ? 'Gig worker' : 'Fixed employee'}</Text>

        {error ? <Text style={{ color: colors.danger, marginTop: spacing(3) }}>{error}</Text> : null}

        <View style={styles.row}>
          <AnimatedStatCard
            label={clockedIn ? 'Clocked In' : 'Not Clocked In'}
            value={clockedIn ? '●' : '○'}
            accentColor={clockedIn ? colors.success : colors.textDim}
            delayMs={0}
          />
          <AnimatedStatCard label="Open Tickets" value={openTickets} accentColor={colors.warning} delayMs={100} />
        </View>

        <Text style={[typography.heading, { marginTop: spacing(6), marginBottom: spacing(2) }]}>My Tickets</Text>
        {tickets.length === 0 ? (
          <Text style={typography.caption}>No tickets assigned right now.</Text>
        ) : (
          tickets.slice(0, 8).map((t) => (
            <View key={t.id} style={styles.ticketRow}>
              <Text style={typography.body}>#{t.id.slice(0, 8)}</Text>
              <Text style={[typography.caption, { textTransform: 'capitalize' }]}>{t.status}</Text>
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
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EmployeeDashboardScreen.tsx
git commit -m "feat(mobile): apply glass system and hybrid nav to EmployeeDashboardScreen"
```

---

### Task 16: Apply glass system + hybrid nav to `AdminDashboardScreen`

**Files:**
- Modify: `mobile/src/screens/AdminDashboardScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedStatCard from '../components/AnimatedStatCard';
import AuroraBackground from '../components/AuroraBackground';
import GlassTabBar from '../components/GlassTabBar';
import MoreSheet from '../components/MoreSheet';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';
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
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={typography.title}>Admin</Text>
        <Text style={typography.caption}>{user?.full_name}</Text>

        {error ? <Text style={{ color: colors.danger, marginTop: spacing(3) }}>{error}</Text> : null}

        <View style={styles.row}>
          <AnimatedStatCard label="Employees" value={employeeCount} accentColor={colors.primary} delayMs={0} />
          <AnimatedStatCard label="Open Tickets" value={openCount} accentColor={colors.warning} delayMs={100} />
        </View>
        <View style={[styles.row, { marginTop: spacing(3) }]}>
          <AnimatedStatCard label="Needs Assignment" value={unassignedCount} accentColor={colors.danger} delayMs={200} />
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
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/AdminDashboardScreen.tsx
git commit -m "feat(mobile): apply glass system and hybrid nav to AdminDashboardScreen"
```

---

### Task 17: Manual on-device verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run from `mobile/`: `npx expo start`

- [ ] **Step 2: Open on a real device via Expo Go**

Scan the QR code with Expo Go (per `mobile/AGENTS.md`, this project is pinned to SDK 56 specifically for real-device Expo Go compatibility — this is the established way this app is tested).

- [ ] **Step 3: Check each screen against the design spec**

Go through this checklist on the device:

- **Login** — Aurora Deep background visible (violet/navy/green blooms) behind the rotating network orb; email/password sit in one glass card with visible blur of whatever's behind it; Sign In button has a green→violet gradient and scales down slightly on press.
- **Submit/Track Ticket** — same Aurora background; form fields sit in a glass card; submitting shows the ticket number in a glass card; tracking renders each result as its own glass card.
- **Employee Dashboard** — Aurora background; the two stat cards are glass with a small animated rotating orb in the top-right corner of each; a floating glass pill tab bar sits at the bottom with "Dashboard" and "More"; tapping "More" opens a glass sheet listing employee sections as "Coming soon" rows; the sheet can be dragged down to dismiss, and grabbing it mid-close-animation should follow your finger rather than snapping shut first.
- **Admin Dashboard** — same as Employee Dashboard, with the admin's longer "Coming soon" list (13 sections) in the More sheet.
- **General** — no screen shows a flat solid-color background anymore; nothing looks like a plain semi-transparent box (blur should visibly soften whatever's scrolling behind each glass surface).

- [ ] **Step 4: Report back**

If everything on the checklist matches, this pilot is done. If something looks off (e.g., blur intensity too subtle/strong, orb animation not visible, sheet drag feels wrong), note which screen and what's wrong — that's a fast follow-up fix, not a plan revision.
