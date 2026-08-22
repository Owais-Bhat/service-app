# Technician Icon & Motion Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every plain text-glyph icon across the technician app with real duotone SVG icons, add a bouncy-overshoot motion preset, and fix the plaintext password storage bug — per `docs/superpowers/specs/2026-08-19-technician-icon-motion-polish.md`.

**Architecture:** A small icon foundation (`theme/icons.ts` path registry + `components/Icon.tsx` renderer + `components/BackLink.tsx` shared back-link), then one task per screen swapping its specific glyph(s) for the new components. A separate generic `IconChip` wrapper was considered during design but dropped here — every real icon site (tab bar, stat cards, tool rows) already has its own established tinted-chip background pattern, so the duotone treatment is applied by reusing each site's existing styles rather than introducing an unused, redundant component.

**Tech Stack:** Adds `react-native-svg` (new dependency). No other new dependencies — motion uses the existing `react-native-reanimated` spring system.

---

### Task 1: Add `react-native-svg`

**Files:** none (dependency only)

- [ ] **Step 1: Install**

Run (from `mobile/`): `npx expo install react-native-svg`

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors (package added, nothing references it yet).

- [ ] **Step 3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "chore(mobile): add react-native-svg for custom icons"
```

---

### Task 2: Icon path registry

**Files:**
- Create: `mobile/src/theme/icons.ts`

- [ ] **Step 1: Write the file**

Every icon is one or more 24×24-viewBox SVG paths. Multi-path icons (e.g. `home`'s roof + walls, `clock`'s face + hands) are stroked together in outline mode; in filled mode `Icon` fills path `[0]` solid and draws any remaining paths as a white detail stroke on top (see Task 3).

```ts
export const ICONS = {
  home: ['M3 10l9-7 9 7v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9z', 'M9 21v-6h6v6'],
  clock: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3.5 2'],
  'check-circle': ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M8 12.5l2.5 2.5L16 9'],
  wrench: ['M14.7 6.3a4 4 0 10-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.8 2.8-2-2z'],
  wallet: ['M3 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z', 'M16 12h3v3h-3a1.5 1.5 0 010-3z'],
  user: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'],
  'chevron-left': ['M15 18l-6-6 6-6'],
  'chevron-right': ['M9 18l6-6-6-6'],
  star: ['M12 2l2.9 6.9 7.1.6-5.4 4.6 1.7 7-6.3-4L6 21.1l1.7-7L2.3 9.5l7.1-.6z'],
  trash: ['M4 7h16', 'M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  'eye-off': [
    'M9.9 5.1A10.9 10.9 0 0112 5c6.5 0 10 7 10 7a13.2 13.2 0 01-3.1 3.9M6.1 6.1A13.4 13.4 0 002 12s3.5 7 10 7c1.2 0 2.4-.2 3.4-.6',
    'M10.6 10.6a3 3 0 004.2 4.2',
    'M3 3l18 18',
  ],
} as const;

export type IconName = keyof typeof ICONS;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/icons.ts
git commit -m "feat(mobile): add SVG icon path registry"
```

---

### Task 3: `Icon` component

**Files:**
- Create: `mobile/src/components/Icon.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { ICONS, IconName } from '../theme/icons';

interface Props {
  name: IconName;
  size?: number;
  color: string;
  filled?: boolean;
}

// Outline mode (default): every path drawn as a 2px stroke in `color`, no
// fill — matches every icon in the registry when used plainly.
// Filled mode: path[0] is the icon's solid shape (filled with `color`);
// any further paths are detail lines (e.g. a checkmark) drawn as a white
// stroke on top, since those are the only icons in the registry that pair
// a solid background shape with an inner accent line.
export default function Icon({ name, size = 20, color, filled = false }: Props) {
  const paths = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths.map((d, i) => {
        if (filled && i === 0) {
          return <Path key={i} d={d} fill={color} stroke="none" />;
        }
        if (filled) {
          return <Path key={i} d={d} fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />;
        }
        return <Path key={i} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </Svg>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/Icon.tsx
git commit -m "feat(mobile): add Icon component"
```

---

### Task 4: `BackLink` shared component

**Files:**
- Create: `mobile/src/components/BackLink.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Icon from './Icon';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  onPress: () => void;
}

// Replaces the `← Back` text link duplicated across every drill-down
// screen (design spec §3, item 2) with one shared component.
export default function BackLink({ onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.row} hitSlop={8}>
      <Icon name="chevron-left" size={16} color={brand.primary} />
      <Text style={styles.label}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing(3), alignSelf: 'flex-start' },
  label: { ...typography.caption, color: brand.primary },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/BackLink.tsx
git commit -m "feat(mobile): add shared BackLink component"
```

---

### Task 5: Add `bouncy` motion preset

**Files:**
- Modify: `mobile/src/theme/motion.ts`

- [ ] **Step 1: Add the preset**

Find the `springs` object (currently `{ move: {...}, drawer: {...} }`) and add a third entry:

```ts
export const springs = {
  move: { duration: 400, dampingRatio: 1.0 },
  drawer: { duration: 300, dampingRatio: 0.8 },
  bouncy: { duration: 500, dampingRatio: 0.5 },
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/motion.ts
git commit -m "feat(mobile): add bouncy spring preset"
```

---

### Task 6: Wire icons into `GlassTabBar`

**Files:**
- Modify: `mobile/src/components/GlassTabBar.tsx`
- Modify: `mobile/src/screens/EmployeeDashboardScreen.tsx`

- [ ] **Step 1: Replace `GlassTabBar.tsx`**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import Icon from './Icon';
import { IconName } from '../theme/icons';

export interface TabItem {
  key: string;
  label: string;
  icon: IconName;
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
                <Icon name={item.icon} size={20} color={active ? brand.primary : theme.text3} />
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
  label: { ...typography.caption, fontSize: 11 },
  indicator: { width: 16, height: 3, borderRadius: 2, marginTop: 2, backgroundColor: 'transparent' },
});
```

- [ ] **Step 2: Give each tab an icon in `EmployeeDashboardScreen.tsx`**

Replace:

```ts
export const EMPLOYEE_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'jobtools', label: 'Job Tools' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'profile', label: 'Profile' },
];
```

with:

```ts
export const EMPLOYEE_TABS: TabItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home' },
  { key: 'attendance', label: 'Attendance', icon: 'clock' },
  { key: 'jobtools', label: 'Job Tools', icon: 'wrench' },
  { key: 'earnings', label: 'Earnings', icon: 'wallet' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];
```

And add the `TabItem` import alongside the existing `GlassTabBar` import:

```ts
import GlassTabBar, { TabItem } from '../components/GlassTabBar';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (every screen importing `EMPLOYEE_TABS` gets the new shape automatically since `GlassTabBar`'s `items` prop is typed `TabItem[]`).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/GlassTabBar.tsx mobile/src/screens/EmployeeDashboardScreen.tsx
git commit -m "feat(mobile): give every tab bar item a real icon"
```

---

### Task 7: `EmployeeDashboardScreen` clock-in status icon

**Files:**
- Modify: `mobile/src/components/AnimatedStatCard.tsx`
- Modify: `mobile/src/screens/EmployeeDashboardScreen.tsx`

- [ ] **Step 1: Add an optional icon to `AnimatedStatCard`**

`AnimatedStatCard` is also used for "Open Tickets" (no meaningful icon in scope for this phase — spec §3 only covers the clock-in indicator), so the icon stays optional and the existing generic dot remains the fallback.

In `mobile/src/components/AnimatedStatCard.tsx`, add the import and props:

```tsx
import Icon from './Icon';
import { IconName } from '../theme/icons';
```

```tsx
interface Props {
  label: string;
  value: string | number;
  accentColor?: string;
  delayMs?: number;
  icon?: IconName;
  iconFilled?: boolean;
}
```

```tsx
export default function AnimatedStatCard({ label, value, accentColor, delayMs = 0, icon, iconFilled = false }: Props) {
```

Replace the chip's contents:

```tsx
      <View style={[styles.iconChip, { backgroundColor: color + '29' }]}>
        {icon ? <Icon name={icon} size={16} color={color} filled={iconFilled} /> : <View style={[styles.iconDot, { borderColor: color }]} />}
      </View>
```

- [ ] **Step 2: Use it for the clock-in card in `EmployeeDashboardScreen.tsx`**

Replace:

```tsx
          <AnimatedStatCard
            label={clockedIn ? 'Clocked In' : 'Not Clocked In'}
            value={clockedIn ? '●' : '○'}
            accentColor={clockedIn ? semantic.success : theme.text3}
            delayMs={0}
          />
```

with:

```tsx
          <AnimatedStatCard
            label={clockedIn ? 'Clocked In' : 'Not Clocked In'}
            value={clockedIn ? 'Active' : 'Off'}
            accentColor={clockedIn ? semantic.success : theme.text3}
            icon={clockedIn ? 'check-circle' : 'clock'}
            iconFilled={clockedIn}
            delayMs={0}
          />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/AnimatedStatCard.tsx mobile/src/screens/EmployeeDashboardScreen.tsx
git commit -m "feat(mobile): replace clock-in status dot with a real icon"
```

---

### Task 8: `ProfileScreen` and `JobToolsScreen` disclosure chevrons

**Files:**
- Modify: `mobile/src/screens/ProfileScreen.tsx`
- Modify: `mobile/src/screens/JobToolsScreen.tsx`

- [ ] **Step 1: `ProfileScreen.tsx`**

Add the import:

```tsx
import Icon from '../components/Icon';
```

Replace:

```tsx
              <Text style={[styles.chevron, { color: theme.text3 }]}>›</Text>
```

with:

```tsx
              <Icon name="chevron-right" size={18} color={theme.text3} />
```

Remove the now-unused `chevron` style line (`chevron: { fontSize: 20 },`).

- [ ] **Step 2: `JobToolsScreen.tsx`**

Add the import:

```tsx
import Icon from '../components/Icon';
```

Replace:

```tsx
              <Text style={[styles.chevron, { color: theme.text3 }]}>›</Text>
```

with:

```tsx
              <Icon name="chevron-right" size={18} color={theme.text3} />
```

Remove the now-unused `chevron` style line.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/ProfileScreen.tsx mobile/src/screens/JobToolsScreen.tsx
git commit -m "feat(mobile): replace disclosure chevrons with real icons"
```

---

### Task 9: `EstimatorScreen` — back link + trash icon

**Files:**
- Modify: `mobile/src/screens/EstimatorScreen.tsx`

- [ ] **Step 1: Update imports**

Replace:

```tsx
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
```

with:

```tsx
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
```

- [ ] **Step 2: Replace the back link**

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
        <BackLink onPress={onBack} />
```

- [ ] **Step 3: Replace the remove button**

Replace:

```tsx
                  <Text style={[styles.removeText, { color: theme.text3 }]}>✕</Text>
```

with:

```tsx
                  <Icon name="trash" size={16} color={theme.text3} />
```

- [ ] **Step 4: Remove now-unused styles**

Remove these two lines from the `StyleSheet.create` block:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  removeText: { fontSize: 16, paddingHorizontal: spacing(1) },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/EstimatorScreen.tsx
git commit -m "feat(mobile): replace EstimatorScreen's back link and remove-item glyph with icons"
```

---

### Task 10: `LeaderboardScreen` — back link + star icon

**Files:**
- Modify: `mobile/src/screens/LeaderboardScreen.tsx`

- [ ] **Step 1: Update imports**

Replace:

```tsx
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useAuth } from '../context/AuthContext';
```

with:

```tsx
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
```

- [ ] **Step 2: Replace the back link**

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
        <BackLink onPress={onBack} />
```

- [ ] **Step 3: Replace the rating display**

Replace:

```tsx
                <Text style={[styles.score, { color: theme.text2 }]}>{r.avgRating != null ? `★ ${r.avgRating.toFixed(1)}` : '—'}</Text>
```

with:

```tsx
                {r.avgRating != null ? (
                  <View style={styles.scoreRow}>
                    <Icon name="star" size={13} color={theme.text2} filled />
                    <Text style={[styles.score, { color: theme.text2 }]}>{r.avgRating.toFixed(1)}</Text>
                  </View>
                ) : (
                  <Text style={[styles.score, { color: theme.text2 }]}>—</Text>
                )}
```

- [ ] **Step 4: Add the `scoreRow` style, remove the unused `link` style**

Replace:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
```

with:

```tsx
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/LeaderboardScreen.tsx
git commit -m "feat(mobile): replace LeaderboardScreen's back link and star glyph with icons"
```

---

### Task 11: `TaskDetailScreen` — both back links

**Files:**
- Modify: `mobile/src/screens/TaskDetailScreen.tsx`

- [ ] **Step 1: Update imports**

Replace:

```tsx
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
```

with:

```tsx
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
```

- [ ] **Step 2: Replace the error-state back link**

Replace:

```tsx
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Ticket not found'}</Text>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Ticket not found'}</Text>
          <BackLink onPress={onBack} />
```

- [ ] **Step 3: Replace the main back link**

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>

        <GlassCard>
```

with:

```tsx
        <BackLink onPress={onBack} />

        <GlassCard>
```

- [ ] **Step 4: Remove the now-unused `link` style**

Remove this line from `StyleSheet.create`:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/TaskDetailScreen.tsx
git commit -m "feat(mobile): replace TaskDetailScreen's back links with BackLink"
```

---

### Task 12: `DeviceFollowUpScreen`, `DeviceDetailScreen`, `EodReportScreen`, `LeaveFormScreen` — back links

**Files:**
- Modify: `mobile/src/screens/DeviceFollowUpScreen.tsx`
- Modify: `mobile/src/screens/DeviceDetailScreen.tsx`
- Modify: `mobile/src/screens/EodReportScreen.tsx`
- Modify: `mobile/src/screens/LeaveFormScreen.tsx`

Each of these four screens has exactly one `← Back` instance and one `link` style, in the identical shape. Apply the same three edits to each file.

- [ ] **Step 1: `DeviceFollowUpScreen.tsx`**

Add the import, alongside the existing `Panel` import:

```tsx
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
```

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
        <BackLink onPress={onBack} />
```

Remove the now-unused style line:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 2: `DeviceDetailScreen.tsx`**

Add the import, alongside the existing `Panel` import:

```tsx
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
```

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
        <BackLink onPress={onBack} />
```

Remove the now-unused style line:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 3: `EodReportScreen.tsx`**

Add the import, alongside the existing `GlowButton` import:

```tsx
import GlowButton from '../components/GlowButton';
import BackLink from '../components/BackLink';
```

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
        <BackLink onPress={onBack} />
```

Remove the now-unused style line:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 4: `LeaveFormScreen.tsx`**

Add the import, alongside the existing `GlowButton` import:

```tsx
import GlowButton from '../components/GlowButton';
import BackLink from '../components/BackLink';
```

Replace:

```tsx
          <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
          <BackLink onPress={onBack} />
```

Remove the now-unused style line:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/DeviceFollowUpScreen.tsx mobile/src/screens/DeviceDetailScreen.tsx mobile/src/screens/EodReportScreen.tsx mobile/src/screens/LeaveFormScreen.tsx
git commit -m "feat(mobile): replace back-link text with BackLink across device/EOD/leave screens"
```

---

### Task 13: `TutorialsScreen`, `NotificationsScreen`, `TrainingCoursesScreen`, `SettingsScreen` — back links

**Files:**
- Modify: `mobile/src/screens/TutorialsScreen.tsx`
- Modify: `mobile/src/screens/NotificationsScreen.tsx`
- Modify: `mobile/src/screens/TrainingCoursesScreen.tsx`
- Modify: `mobile/src/screens/SettingsScreen.tsx`

Same pattern as Task 12 — one `← Back` instance and one `link` style per file.

- [ ] **Step 1: `TutorialsScreen.tsx`**

Add the import, alongside the existing `Panel` import:

```tsx
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
```

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
        <BackLink onPress={onBack} />
```

Remove the now-unused style line:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 2: `NotificationsScreen.tsx`**

Add the import, alongside the existing `Panel` import:

```tsx
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
```

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
        <BackLink onPress={onBack} />
```

Remove the now-unused style line:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 3: `TrainingCoursesScreen.tsx`**

Add the import, alongside the existing `Panel` import:

```tsx
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
```

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
        <BackLink onPress={onBack} />
```

Remove the now-unused style line:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 4: `SettingsScreen.tsx`**

Add the import, alongside the existing `Panel` import:

```tsx
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
```

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
        <BackLink onPress={onBack} />
```

Remove the now-unused style line:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/TutorialsScreen.tsx mobile/src/screens/NotificationsScreen.tsx mobile/src/screens/TrainingCoursesScreen.tsx mobile/src/screens/SettingsScreen.tsx
git commit -m "feat(mobile): replace back-link text with BackLink across tutorials/notifications/training/settings"
```

---

### Task 14: `CoursePlayerScreen` — both back links

**Files:**
- Modify: `mobile/src/screens/CoursePlayerScreen.tsx`

- [ ] **Step 1: Update imports**

Replace:

```tsx
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
```

with:

```tsx
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
```

- [ ] **Step 2: Replace the error-state back link**

Replace:

```tsx
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Course not found'}</Text>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
```

with:

```tsx
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Course not found'}</Text>
          <BackLink onPress={onBack} />
```

- [ ] **Step 3: Replace the main back link**

Replace:

```tsx
        <Text style={styles.link} onPress={onBack}>← Back</Text>

        <GlassCard style={styles.headerCard}>
```

with:

```tsx
        <BackLink onPress={onBack} />

        <GlassCard style={styles.headerCard}>
```

- [ ] **Step 4: Remove the now-unused `link` style**

Remove this line from `StyleSheet.create`:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/CoursePlayerScreen.tsx
git commit -m "feat(mobile): replace CoursePlayerScreen's back links with BackLink"
```

---

### Task 15: `LoginScreen` — icons, back link, and the SecureStore fix

**Files:**
- Modify: `mobile/src/screens/LoginScreen.tsx`

- [ ] **Step 1: Update imports**

Replace:

```tsx
import React, { useState, useEffect } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
```

with:

```tsx
import React, { useState, useEffect } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
```

- [ ] **Step 2: Fix the plaintext password storage and strip routine debug logs**

Replace:

```tsx
  useEffect(() => {
    const loadCreds = async () => {
      try {
        console.log('Loading saved credentials...');
        const savedEmail = await AsyncStorage.getItem('saved_email');
        const savedPassword = await AsyncStorage.getItem('saved_password');
        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);
        console.log('Credentials loaded');
      } catch (e) {
        console.log('Error loading credentials', e);
      }
    };
    loadCreds();
  }, []);

  const handleLogin = async () => {
    console.log('Attempting login with email:', email);
    if (!email.trim() || !password) {
      console.log('Validation failed: email or password missing');
      setError('Enter your email and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await AsyncStorage.setItem('saved_email', email.trim());
      await AsyncStorage.setItem('saved_password', password);
      console.log('Credentials saved locally');

      console.log('Calling login API...');
      await login(email.trim(), password);
      console.log('Login successful');
    } catch (err) {
      console.log('Login error:', err);
      setError(err instanceof ApiError ? err.message : 'Could not sign in — check your connection');
    } finally {
      setLoading(false);
    }
  };
```

with:

```tsx
  useEffect(() => {
    const loadCreds = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('saved_email');
        const savedPassword = await SecureStore.getItemAsync('saved_password');
        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);
      } catch (e) {
        console.log('Error loading credentials', e);
      }
    };
    loadCreds();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await AsyncStorage.setItem('saved_email', email.trim());
      await SecureStore.setItemAsync('saved_password', password);
      await login(email.trim(), password);
    } catch (err) {
      console.log('Login error:', err);
      setError(err instanceof ApiError ? err.message : 'Could not sign in — check your connection');
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 3: Replace the back link**

Replace:

```tsx
      <View style={[styles.backButtonWrap, { top: insets.top + spacing(2) }]}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
      </View>
```

with:

```tsx
      <View style={[styles.backButtonWrap, { top: insets.top + spacing(2) }]}>
        <BackLink onPress={onBack} />
      </View>
```

- [ ] **Step 4: Replace the Show/Hide text toggle with an eye icon**

Replace:

```tsx
              <Pressable style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Text style={[styles.eyeText, { color: theme.text3 }]}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
```

with:

```tsx
              <Pressable style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color={theme.text3} />
              </Pressable>
```

- [ ] **Step 5: Remove the now-unused `link` and `eyeText` styles**

Replace:

```tsx
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  brand: { ...typography.title, textAlign: 'center' },
```

with:

```tsx
  brand: { ...typography.title, textAlign: 'center' },
```

Replace:

```tsx
  eyeButton: { position: 'absolute', right: spacing(4) },
  eyeText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
```

with:

```tsx
  eyeButton: { position: 'absolute', right: spacing(4) },
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/LoginScreen.tsx
git commit -m "fix(mobile): store remembered password in SecureStore, add eye/back icons, strip debug logs"
```

---

### Task 16: Manual on-device verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm zero type errors project-wide**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Restart Metro and reconnect**

Run (from `mobile/`): `npx expo start -c`, then reconnect from Expo Go.

- [ ] **Step 3: Walk the app**

- **Tab bar**: Dashboard, Attendance, Job Tools, Earnings, Profile each show a distinct icon (house, clock, wrench, wallet, person) inside a tinted duotone chip — not the old identical dot.
- **Every "← Back"** across Tutorials, Course Player (both states), Notifications, Estimator, Device Follow-up, Device Detail, Training Courses, Leaderboard, EOD Report, Login, Leave Form, Settings, Task Detail (both states) now shows a chevron icon + "Back" via the shared component, and still navigates correctly.
- **Profile menu rows** and **Job Tools rows** show a chevron-right icon instead of `›`.
- **Dashboard's clock-in card** shows "Active"/"Off" with a filled check-circle when clocked in, an outline clock when not.
- **Estimator**: adding an item to the quote, then tapping the trash icon removes it.
- **Leaderboard**: rows with a rating show a filled star + the number; rows without show "—".
- **Login**: the password field's eye icon toggles visibility; log in, force-close the app, reopen — email and password are both still remembered (now via SecureStore for the password).
- Tap through a few tab switches and back-link presses — motion should feel the same as before (this phase only added the `bouncy` preset to `theme/motion.ts`; nothing yet uses it, so no visual difference is expected here — confirms the preset didn't break anything else).

- [ ] **Step 4: Report back**

If everything matches, this phase is complete. If something's off, note which screen and what's wrong.
