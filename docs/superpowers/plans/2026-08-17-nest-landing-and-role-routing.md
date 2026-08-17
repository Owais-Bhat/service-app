# NEST Landing + Role Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NEST's Landing screen as the app's real unauthenticated entry point, move staff login behind a "Staff Login" button, and update branding to "NEST" in mobile display text — per `docs/superpowers/specs/2026-08-17-nest-landing-and-role-routing.md`.

**Architecture:** One new screen (`LandingScreen`) built entirely from components that already exist (`MeshBackground`, `Panel`, `GlowButton`), reusing `categoryColors` tokens already in `theme/tokens.ts`. `RootNavigator`'s guest stack gains `Landing` as its new initial route; `LoginScreen` becomes a secondary route reached via a button, not the default screen.

**Tech Stack:** No new dependencies — everything needed shipped in the visual-foundation phase.

**Verification approach:** Same as prior phases — `npx tsc --noEmit` after every step, on-device check via Expo Go at the end.

---

### Task 1: `LandingScreen`

**Files:**
- Create: `mobile/src/screens/LandingScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlowButton from '../components/GlowButton';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, categoryColors } from '../theme/tokens';

interface Props {
  onStaffLogin: () => void;
  onGoSubmit: () => void;
  onGoTrack: () => void;
}

const SERVICES: { label: string; initials: string; cat: keyof typeof categoryColors }[] = [
  { label: 'CCTV', initials: 'CC', cat: 'CCTV' },
  { label: 'Networking', initials: 'NW', cat: 'Networking' },
  { label: 'Biometric & Access', initials: 'BM', cat: 'Biometric' },
  { label: 'Gate Automation', initials: 'GA', cat: 'GateAutomation' },
  { label: 'VDP Installation', initials: 'VD', cat: 'VDP' },
];

const STATS = [
  { value: '4.8★', label: 'Rated' },
  { value: '500+', label: 'Installs' },
  { value: '12hr', label: 'SLA' },
];

// The app's real public entry point (design spec §3): a marketing/
// self-service front door, with staff sign-in reached via a button rather
// than being the default screen. No role-picker here — role comes from
// who successfully authenticates on LoginScreen, not a user's own claim.
export default function LandingScreen({ onStaffLogin, onGoSubmit, onGoTrack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(10), paddingHorizontal: spacing(5) }}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoChip}>
              <Text style={styles.logoLetter}>N</Text>
            </View>
            <Text style={[styles.wordmark, { color: theme.text }]}>NEST</Text>
          </View>
          <Pressable
            onPress={onStaffLogin}
            style={({ pressed }) => [
              styles.loginButton,
              { borderColor: theme.line, backgroundColor: theme.panel2 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.loginButtonText, { color: theme.text2 }]}>Staff Login</Text>
          </Pressable>
        </View>

        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>Resolved in 12 hours, guaranteed</Text>
        </View>

        <Text style={[styles.headline, { color: theme.text }]}>Reliable CCTV, Networking & Access Control</Text>
        <Text style={[styles.subcopy, { color: theme.text2 }]}>
          Installation, service &amp; AMC for CCTV, networking, biometric access and gate automation — one call away.
        </Text>

        <GlowButton label="Raise a Service Request" onPress={onGoSubmit} />
        <Pressable
          onPress={onGoTrack}
          style={({ pressed }) => [
            styles.trackButton,
            { backgroundColor: theme.panel2, borderColor: theme.line },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.trackButtonText, { color: theme.text }]}>Track Your Ticket</Text>
        </Pressable>

        <Panel style={styles.statsRow}>
          {STATS.map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.text3 }]}>{s.label}</Text>
            </View>
          ))}
        </Panel>

        <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Our Services</Text>
        <View style={styles.grid}>
          {SERVICES.map((s) => {
            const c = categoryColors[s.cat];
            return (
              <Panel key={s.label} style={styles.serviceRow}>
                <View style={[styles.serviceIcon, { backgroundColor: c.bg }]}>
                  <Text style={[styles.serviceIconText, { color: c.color }]}>{s.initials}</Text>
                </View>
                <Text style={[styles.serviceLabel, { color: theme.text }]}>{s.label}</Text>
              </Panel>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(5) },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  logoChip: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary },
  logoLetter: { ...typography.heading, color: '#ffffff', fontSize: 16 },
  wordmark: { ...typography.heading, fontSize: 18 },
  loginButton: { paddingHorizontal: spacing(4), paddingVertical: spacing(2.5), borderRadius: radius.md, borderWidth: 1 },
  loginButtonText: { ...typography.caption, fontSize: 12 },
  pressed: { opacity: 0.7 },
  badge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(1.75),
    borderRadius: radius.full,
    backgroundColor: 'rgba(21,160,90,0.14)',
    marginBottom: spacing(4),
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: brand.primary },
  badgeText: { ...typography.caption, color: brand.primary, fontSize: 12 },
  headline: { ...typography.title, marginBottom: spacing(3) },
  subcopy: { ...typography.body, marginBottom: spacing(5) },
  trackButton: { padding: spacing(4), borderRadius: radius.md, borderWidth: 1, alignItems: 'center', marginTop: spacing(1), marginBottom: spacing(6) },
  trackButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing(6) },
  statItem: { alignItems: 'center' },
  statValue: { ...typography.heading, color: brand.primary, fontSize: 20 },
  statLabel: { ...typography.caption, fontSize: 11, marginTop: spacing(0.5) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(3) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5) },
  serviceRow: { width: '47%', flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  serviceIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  serviceIconText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  serviceLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12, flexShrink: 1 },
});
```

Note: bold text that needs a weight other than what a spread `typography.*` role already carries uses an explicit `fontFamily: 'Manrope_700Bold'` rather than spreading a lighter-weight role and adding `fontWeight: '700'` on top — layering `fontWeight` over a named custom-font family risks Android synthesizing a fake bold on top of the real font instead of just using the correct weighted variant.

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/LandingScreen.tsx
git commit -m "feat(mobile): add LandingScreen per NEST design"
```

---

### Task 2: Update `LoginScreen` — branding, back link, drop guest shortcuts

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
  onBack: () => void;
}

// No longer the guest stack's root — Landing is (design spec §5), reached
// via its "Staff Login" button. The old "Not staff? Submit a request /
// Track a request" shortcut links are gone: Landing offers those at the
// top level now, and NEST's own staff-login screen doesn't have them.
export default function LoginScreen({ onBack }: Props) {
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
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.brand, { color: theme.text }]}>NEST</Text>
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
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sceneWrap: { flex: 1.1 },
  formWrap: { paddingHorizontal: spacing(6), paddingTop: spacing(4) },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  brand: { ...typography.title, textAlign: 'center' },
  tagline: { ...typography.caption, textAlign: 'center', marginBottom: spacing(5) },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(2), textAlign: 'center' },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: a new error in `RootNavigator.tsx` — it still constructs `<LoginScreen onGoSubmit=... onGoTrack=... />` with the old props. Expected until Task 3 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/LoginScreen.tsx
git commit -m "feat(mobile): update LoginScreen for NEST branding and Landing entry point"
```

---

### Task 3: Wire `Landing` into `RootNavigator`

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
import LandingScreen from '../screens/LandingScreen';
import LoginScreen from '../screens/LoginScreen';
import ClientSubmitTicketScreen from '../screens/ClientSubmitTicketScreen';
import ClientTrackTicketScreen from '../screens/ClientTrackTicketScreen';
import EmployeeDashboardScreen from '../screens/EmployeeDashboardScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';

type GuestStackParams = {
  Landing: undefined;
  Login: undefined;
  SubmitTicket: undefined;
  TrackTicket: undefined;
};

const GuestStack = createNativeStackNavigator<GuestStackParams>();

function LandingRoute({ navigation }: any) {
  return (
    <LandingScreen
      onStaffLogin={() => navigation.navigate('Login')}
      onGoSubmit={() => navigation.navigate('SubmitTicket')}
      onGoTrack={() => navigation.navigate('TrackTicket')}
    />
  );
}

function LoginRoute({ navigation }: any) {
  return <LoginScreen onBack={() => navigation.goBack()} />;
}

function SubmitTicketRoute({ navigation }: any) {
  return <ClientSubmitTicketScreen onBack={() => navigation.goBack()} />;
}

function TrackTicketRoute({ navigation }: any) {
  return <ClientTrackTicketScreen onBack={() => navigation.goBack()} />;
}

// Guest side (unauthenticated) gets a real stack — land on the public
// Landing screen, then staff sign-in, submit a request, or track a
// request, with native slide transitions between them. Once signed in,
// role picks exactly one dashboard, so no stack is needed there yet; add
// one per role as each grows past a single screen.
function GuestNavigator() {
  return (
    <GuestStack.Navigator screenOptions={{ headerShown: false }}>
      <GuestStack.Screen name="Landing" component={LandingRoute} />
      <GuestStack.Screen name="Login" component={LoginRoute} options={{ animation: 'slide_from_right' }} />
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
Expected: no errors — this was the last file referencing the old `LoginScreen` props.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): wire Landing as the guest stack's entry point"
```

---

### Task 4: Manual on-device verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm zero type errors**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Start the dev server and open on a real device**

Run from `mobile/`: `npx expo start`, then scan the QR code with Expo Go.

- [ ] **Step 3: Walk the guest flow**

- App opens on **Landing**: "NEST" wordmark top-left, "Staff Login" button top-right, hero headline/subcopy, "Raise a Service Request" (green gradient) and "Track Your Ticket" (flat panel) buttons, a 3-stat panel, and a 5-item services grid with colored category chips.
- Tap **"Raise a Service Request"** → lands on the existing submit-ticket form; the "← Back" link returns to Landing.
- Tap **"Track Your Ticket"** → same, for the track form.
- Tap **"Staff Login"** → opens the sign-in screen (NEST-branded wordmark, network orb); it has a "← Back" link back to Landing and no longer shows the old guest shortcut links.
- Sign in with a real staff account → routes to the correct dashboard (admin vs employee) exactly as before.

- [ ] **Step 4: Report back**

If the flow matches, phase 2 is done. If something's off, note which screen and what's wrong.
