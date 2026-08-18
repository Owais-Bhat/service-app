# NEST My Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dashboard's flat ticket list into a filterable Tasks list, and add a Task Detail screen with a working status-advance action against the real backend — per `docs/superpowers/specs/2026-08-17-nest-my-tasks.md`.

**Architecture:** A new `tickets.ts` API module (detail fetch + status update — shared with Phase 4's future admin ticket screens), widened `categoryColors`/`statusColors` tokens covering all real backend values (not just NEST's mockup subset), a new `TaskDetailScreen`, and the employee side's first real native stack (`Dashboard` → `TaskDetail`).

**Tech Stack:** No new dependencies. Uses the existing generic `/api/data/:table` compatibility layer (`dataGet`/`dataPost`), extended with a `dataPatch` for the one new HTTP verb needed.

**Verification approach:** `npx tsc --noEmit` after every step. The final on-device check needs a real staff login with at least one assigned ticket to exercise the live status-advance call — noted in Task 10.

---

### Task 1: Add `dataPatch` to the API client

**Files:**
- Modify: `mobile/src/api/client.ts`

- [ ] **Step 1: Add the function**

Add this after `dataPost`:

```ts
export async function dataPatch<T>(table: string, eq: string | string[], body: unknown): Promise<T> {
  const sp = new URLSearchParams();
  (Array.isArray(eq) ? eq : [eq]).forEach((v) => sp.append('eq', v));
  return request<T>(`/data/${table}?${sp.toString()}`, { method: 'PATCH', body: JSON.stringify(body) });
}
```

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/client.ts
git commit -m "feat(mobile): add dataPatch to the API client for status updates"
```

---

### Task 2: Widen status/category tokens to real backend values

**Files:**
- Modify: `mobile/src/theme/tokens.ts`

- [ ] **Step 1: Replace the `categoryColors`/`statusColors` section**

Replace the existing `categoryColors` and `statusColors` exports (keep everything above them — `ThemeTokens`, `DARK_TOKENS`, `LIGHT_TOKENS`, `brand`, `semantic` — unchanged) with:

```ts
export interface CategoryStyle {
  color: string;
  bg: string;
  initials: string;
}

// Real category values from src/pages/job-cards.js's CATEGORIES constant —
// wider than the NEST mockup's 5. String keys (not identifiers) since
// several contain spaces/slashes. 5 keep NEST's original colors; the 3
// NEST doesn't cover (Locks, Fire Alarm, Other) use unused hues already
// in the app's palette rather than new colors.
export const categoryColors: Record<string, CategoryStyle> = {
  CCTV: { color: '#15a05a', bg: 'rgba(21,160,90,0.16)', initials: 'CC' },
  Networking: { color: '#0ea5a5', bg: 'rgba(14,165,165,0.16)', initials: 'NW' },
  'Video Door Phone': { color: '#6366f1', bg: 'rgba(99,102,241,0.16)', initials: 'VD' },
  Locks: { color: '#2e9bff', bg: 'rgba(46,155,255,0.14)', initials: 'LK' },
  'Gate Automation': { color: '#e08a14', bg: 'rgba(224,138,20,0.16)', initials: 'GA' },
  'Access Control / Biometric': { color: '#7c5cfc', bg: 'rgba(124,92,252,0.16)', initials: 'BM' },
  'Fire Alarm': { color: '#f0556d', bg: 'rgba(240,85,109,0.14)', initials: 'FA' },
  Other: { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', initials: 'OT' },
};

export const DEFAULT_CATEGORY_STYLE: CategoryStyle = { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', initials: '—' };

export interface StatusStyle {
  color: string;
  bg: string;
  label: string;
}

// Real status values used across the app — wider than NEST's 4-state
// mockup (which also used the wrong key: "progress" instead of the real
// "in_progress"). TECH_STATUS_ORDER is the subset a technician
// self-advances through; the rest are admin/finance workflow states.
export const statusColors: Record<string, StatusStyle> = {
  open: { color: '#2e9bff', bg: 'rgba(46,155,255,0.14)', label: 'Open' },
  assigned: { color: '#7c5cfc', bg: 'rgba(124,92,252,0.14)', label: 'Assigned' },
  in_progress: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)', label: 'In Progress' },
  resolved: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)', label: 'Resolved' },
  case_closed: { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'Closed' },
  closed: { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'Closed' },
  foc: { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'FOC' },
  issue_not_resolved: { color: '#f0556d', bg: 'rgba(240,85,109,0.14)', label: 'Issue Not Resolved' },
  paid: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)', label: 'Paid' },
};

export const DEFAULT_STATUS_STYLE: StatusStyle = { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'Unknown' };

export const TECH_STATUS_ORDER = ['open', 'assigned', 'in_progress', 'resolved'] as const;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: an error in `LandingScreen.tsx` — its `SERVICES` array is typed against the old `categoryColors` key set (`keyof typeof categoryColors`), which no longer matches. Expected until Task 3 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/tokens.ts
git commit -m "feat(mobile): widen category/status tokens to real backend values"
```

---

### Task 3: Fix `LandingScreen` for the widened category tokens

**Files:**
- Modify: `mobile/src/screens/LandingScreen.tsx`

- [ ] **Step 1: Update the import and `SERVICES` array**

Replace the tokens import:

```tsx
import { brand, categoryColors, DEFAULT_CATEGORY_STYLE } from '../theme/tokens';
```

Replace the `SERVICES` constant (it no longer needs its own `initials` field — that now comes from `categoryColors`):

```tsx
const SERVICES: { label: string; cat: string }[] = [
  { label: 'CCTV', cat: 'CCTV' },
  { label: 'Networking', cat: 'Networking' },
  { label: 'Biometric & Access', cat: 'Access Control / Biometric' },
  { label: 'Gate Automation', cat: 'Gate Automation' },
  { label: 'VDP Installation', cat: 'Video Door Phone' },
];
```

- [ ] **Step 2: Update the services grid render**

Replace the `SERVICES.map` block inside the `grid` `View`:

```tsx
        <View style={styles.grid}>
          {SERVICES.map((s) => {
            const c = categoryColors[s.cat] || DEFAULT_CATEGORY_STYLE;
            return (
              <Panel key={s.label} style={styles.serviceRow}>
                <View style={[styles.serviceIcon, { backgroundColor: c.bg }]}>
                  <Text style={[styles.serviceIconText, { color: c.color }]}>{c.initials}</Text>
                </View>
                <Text style={[styles.serviceLabel, { color: theme.text }]}>{s.label}</Text>
              </Panel>
            );
          })}
        </View>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/LandingScreen.tsx
git commit -m "fix(mobile): update LandingScreen for widened category tokens"
```

---

### Task 4: Widen `TicketRow`

**Files:**
- Modify: `mobile/src/api/employee.ts`

- [ ] **Step 1: Replace the `TicketRow` interface and `fetchMyTickets`**

```ts
export interface TicketRow {
  id: string;
  assigned_to: string;
  status: string;
  title: string;
  category: string;
  created_at: string;
}

export async function fetchMyTickets(userId: string): Promise<TicketRow[]> {
  return dataGet<TicketRow[]>('tickets', {
    select: 'id,assigned_to,status,title,category,created_at',
    eq: [`assigned_to:${userId}`],
    order: 'created_at:desc',
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the list screen isn't updated to use the new fields yet — that's Task 7 — but the widened interface alone doesn't break anything).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/employee.ts
git commit -m "feat(mobile): widen TicketRow with title and category"
```

---

### Task 5: `tickets.ts` API module

**Files:**
- Create: `mobile/src/api/tickets.ts`

- [ ] **Step 1: Write the file**

```ts
import { dataGet, dataPatch } from './client';

export interface TicketContact {
  full_name: string | null;
  phone: string | null;
  location: string | null;
}

export interface TicketDetail {
  id: string;
  assigned_to: string;
  client_id: string;
  status: string;
  title: string;
  description: string | null;
  category: string;
  priority: string | null;
  created_at: string;
  inquiries?: TicketContact[];
}

// Separate from employee.ts (which owns the employee-scoped list query)
// because ticket detail/update isn't employee-exclusive — Phase 4's admin
// ticket screens will reuse this module.
export async function fetchTicketDetail(ticketId: string): Promise<TicketDetail | null> {
  const rows = await dataGet<TicketDetail[]>('tickets', {
    select: '*,inquiries(full_name,phone,location)',
    eq: [`id:${ticketId}`],
  });
  return rows[0] ?? null;
}

export async function updateTicketStatus(ticketId: string, status: string): Promise<void> {
  await dataPatch('tickets', `id:${ticketId}`, { status });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/tickets.ts
git commit -m "feat(mobile): add tickets API module for detail fetch and status update"
```

---

### Task 6: `TaskDetailScreen`

**Files:**
- Create: `mobile/src/screens/TaskDetailScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, categoryColors, statusColors, DEFAULT_CATEGORY_STYLE, DEFAULT_STATUS_STYLE, TECH_STATUS_ORDER } from '../theme/tokens';
import { fetchTicketDetail, updateTicketStatus, TicketDetail } from '../api/tickets';

interface Props {
  ticketId: string;
  onBack: () => void;
}

type TechStatus = (typeof TECH_STATUS_ORDER)[number];

export default function TaskDetailScreen({ ticketId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await fetchTicketDetail(ticketId);
      setTicket(t);
      setError(t ? null : 'Ticket not found');
    } catch {
      setError('Could not load this task — check your connection');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  const advance = async () => {
    if (!ticket) return;
    const idx = TECH_STATUS_ORDER.indexOf(ticket.status as TechStatus);
    if (idx < 0 || idx >= TECH_STATUS_ORDER.length - 1) return;
    const next = TECH_STATUS_ORDER[idx + 1];
    setAdvancing(true);
    try {
      await updateTicketStatus(ticket.id, next);
      setTicket({ ...ticket, status: next });
      setError(null);
    } catch {
      setError('Could not update status — check your connection');
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={styles.centered}>
          <ActivityIndicator color={brand.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Ticket not found'}</Text>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
        </View>
      </View>
    );
  }

  const statusIdx = TECH_STATUS_ORDER.indexOf(ticket.status as TechStatus);
  const isTechStatus = statusIdx >= 0;
  const statusStyle = statusColors[ticket.status] || DEFAULT_STATUS_STYLE;
  const categoryStyle = categoryColors[ticket.category] || DEFAULT_CATEGORY_STYLE;
  const contact = ticket.inquiries?.[0];
  const canAdvance = isTechStatus && statusIdx < TECH_STATUS_ORDER.length - 1;
  const advanceLabel = !isTechStatus
    ? null
    : statusIdx >= TECH_STATUS_ORDER.length - 1
      ? 'Job Resolved'
      : `Mark as ${(statusColors[TECH_STATUS_ORDER[statusIdx + 1]] || DEFAULT_STATUS_STYLE).label}`;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>

        <GlassCard>
          <View style={styles.headerRow}>
            <Text style={styles.ticketId}>{ticket.id.slice(0, 8).toUpperCase()}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
            </View>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{ticket.title}</Text>
          {ticket.description ? (
            <Text style={[styles.description, { color: theme.text2 }]}>{ticket.description}</Text>
          ) : null}
          <View style={[styles.categoryChip, { backgroundColor: categoryStyle.bg }]}>
            <Text style={[styles.categoryChipText, { color: categoryStyle.color }]}>{ticket.category}</Text>
          </View>
        </GlassCard>

        {contact ? (
          <Panel style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Customer</Text>
            {contact.full_name ? <Text style={[styles.contactName, { color: theme.text }]}>{contact.full_name}</Text> : null}
            {contact.phone ? <Text style={[styles.contactLine, { color: theme.text2 }]}>{contact.phone}</Text> : null}
            {contact.location ? <Text style={[styles.contactLine, { color: theme.text3 }]}>{contact.location}</Text> : null}
          </Panel>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Status</Text>
          <View style={styles.stepperRow}>
            {TECH_STATUS_ORDER.map((s, i) => (
              <View
                key={s}
                style={[styles.step, { backgroundColor: isTechStatus && i <= statusIdx ? brand.primary : theme.line }]}
              />
            ))}
          </View>
          {advanceLabel ? (
            canAdvance ? (
              <Pressable
                onPress={advance}
                disabled={advancing}
                style={({ pressed }) => [styles.advanceButton, pressed && styles.pressed, advancing && styles.disabled]}
              >
                <Text style={styles.advanceButtonText}>{advancing ? 'Updating…' : advanceLabel}</Text>
              </Pressable>
            ) : (
              <View style={[styles.advanceButton, styles.advanceButtonDone, { borderColor: theme.line }]}>
                <Text style={[styles.advanceButtonText, { color: theme.text3 }]}>{advanceLabel}</Text>
              </View>
            )
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.photoRow}>
          <View style={[styles.photoTile, { borderColor: theme.line }]}>
            <Text style={[styles.photoTileText, { color: theme.text3 }]}>Before photo</Text>
            <Text style={[styles.comingSoon, { color: theme.text3 }]}>Coming soon</Text>
          </View>
          <View style={[styles.photoTile, { borderColor: theme.line }]}>
            <Text style={[styles.photoTileText, { color: theme.text3 }]}>After photo</Text>
            <Text style={[styles.comingSoon, { color: theme.text3 }]}>Coming soon</Text>
          </View>
        </View>
        <View style={[styles.signatureTile, { borderColor: theme.line }]}>
          <Text style={[styles.photoTileText, { color: theme.text3 }]}>Customer signature</Text>
          <Text style={[styles.comingSoon, { color: theme.text3 }]}>Coming soon</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing(6), gap: spacing(3) },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  body: { ...typography.body, textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(2) },
  ticketId: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, color: brand.primary },
  statusBadge: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.sm },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  title: { ...typography.heading, marginBottom: spacing(2) },
  description: { ...typography.body, marginBottom: spacing(3) },
  categoryChip: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.sm, alignSelf: 'flex-start' },
  categoryChipText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  section: { marginTop: spacing(4) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  contactName: { ...typography.body, fontFamily: 'Manrope_700Bold', marginBottom: spacing(0.5) },
  contactLine: { ...typography.caption, marginBottom: spacing(0.5) },
  stepperRow: { flexDirection: 'row', gap: spacing(1.5), marginBottom: spacing(3) },
  step: { flex: 1, height: 6, borderRadius: 3 },
  advanceButton: { padding: spacing(3.5), borderRadius: radius.md, alignItems: 'center', backgroundColor: brand.primary },
  advanceButtonDone: { backgroundColor: 'transparent', borderWidth: 1 },
  advanceButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#ffffff' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3), textAlign: 'center' },
  photoRow: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(5) },
  photoTile: { flex: 1, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: spacing(5), alignItems: 'center', gap: spacing(1) },
  signatureTile: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: spacing(4.5), alignItems: 'center', gap: spacing(1), marginTop: spacing(2.5) },
  photoTileText: { ...typography.caption, fontSize: 12 },
  comingSoon: { ...typography.caption, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/TaskDetailScreen.tsx
git commit -m "feat(mobile): add TaskDetailScreen with real status-advance action"
```

---

### Task 7: Upgrade `EmployeeDashboardScreen`'s task list

**Files:**
- Modify: `mobile/src/screens/EmployeeDashboardScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedStatCard from '../components/AnimatedStatCard';
import MeshBackground from '../components/MeshBackground';
import GlassTabBar from '../components/GlassTabBar';
import MoreSheet from '../components/MoreSheet';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, categoryColors, semantic, statusColors, DEFAULT_CATEGORY_STYLE, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchMyTickets, fetchTodayAttendance, AttendanceRow, TicketRow } from '../api/employee';

interface Props {
  onOpenTask: (ticketId: string) => void;
}

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'more', label: 'More' },
];

// The web app's employee-relevant sections not yet ported to mobile — see
// design spec §5/§8 (phase 1) and phase 3a's spec §8 (Job Cards is a
// separate, richer feature from this phase's simple status tracking).
const MORE_SECTIONS = [
  { label: 'Job Cards' },
  { label: 'Device Tracking' },
  { label: 'Training' },
  { label: 'Media Training' },
  { label: 'Notifications' },
  { label: 'Profile' },
];

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

export default function EmployeeDashboardScreen({ onOpenTask }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [filter, setFilter] = useState('all');

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
  const filteredTickets = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);

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

        <Text style={[styles.heading, { color: theme.text, marginTop: spacing(6), marginBottom: spacing(2) }]}>My Tasks</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: spacing(2) }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, { borderColor: theme.line, backgroundColor: active ? brand.primary : theme.panel2 }]}
              >
                <Text style={[styles.filterChipText, { color: active ? '#ffffff' : theme.text2 }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredTickets.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>No tasks in this filter.</Text>
        ) : (
          filteredTickets.map((t) => {
            const categoryStyle = categoryColors[t.category] || DEFAULT_CATEGORY_STYLE;
            const statusStyle = statusColors[t.status] || DEFAULT_STATUS_STYLE;
            return (
              <Pressable
                key={t.id}
                onPress={() => onOpenTask(t.id)}
                style={({ pressed }) => [styles.taskRow, { borderColor: theme.line, backgroundColor: theme.panel2 }, pressed && styles.pressed]}
              >
                <View style={[styles.taskIcon, { backgroundColor: categoryStyle.bg }]}>
                  <Text style={[styles.taskIconText, { color: categoryStyle.color }]}>{categoryStyle.initials}</Text>
                </View>
                <View style={styles.taskInfo}>
                  <Text style={[styles.taskTitle, { color: theme.text }]} numberOfLines={1}>{t.title}</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>#{t.id.slice(0, 8).toUpperCase()}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                </View>
              </Pressable>
            );
          })
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
  caption: { ...typography.caption },
  filterRow: { marginBottom: spacing(3) },
  filterChip: { paddingHorizontal: spacing(3.5), paddingVertical: spacing(2), borderRadius: 12, borderWidth: 1 },
  filterChipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3.5), borderRadius: 18, borderWidth: 1, marginBottom: spacing(2.5) },
  pressed: { opacity: 0.7 },
  taskIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  taskIconText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  taskInfo: { flex: 1, minWidth: 0 },
  taskTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  statusBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8 },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: an error in `RootNavigator.tsx` — it still renders `<EmployeeDashboardScreen />` with no `onOpenTask` prop. Expected until Task 8 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EmployeeDashboardScreen.tsx
git commit -m "feat(mobile): upgrade EmployeeDashboardScreen with filterable task list"
```

---

### Task 8: Wire `TaskDetail` into a real employee stack

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
import TaskDetailScreen from '../screens/TaskDetailScreen';

type GuestStackParams = {
  Landing: undefined;
  Login: undefined;
  SubmitTicket: undefined;
  TrackTicket: undefined;
};

type EmployeeStackParams = {
  Dashboard: undefined;
  TaskDetail: { ticketId: string };
};

const GuestStack = createNativeStackNavigator<GuestStackParams>();
const EmployeeStack = createNativeStackNavigator<EmployeeStackParams>();

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
// request, with native slide transitions between them.
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

function EmployeeDashboardRoute({ navigation }: any) {
  return <EmployeeDashboardScreen onOpenTask={(ticketId) => navigation.navigate('TaskDetail', { ticketId })} />;
}

function TaskDetailRoute({ navigation, route }: any) {
  return <TaskDetailScreen ticketId={route.params.ticketId} onBack={() => navigation.goBack()} />;
}

// The employee role finally grows past a single screen — Dashboard (Tasks
// list) → Task Detail, with a native slide transition. Admin stays a
// single screen for now; it gets its own stack in the Phase 4 admin work.
function EmployeeNavigator() {
  return (
    <EmployeeStack.Navigator screenOptions={{ headerShown: false }}>
      <EmployeeStack.Screen name="Dashboard" component={EmployeeDashboardRoute} />
      <EmployeeStack.Screen name="TaskDetail" component={TaskDetailRoute} options={{ animation: 'slide_from_right' }} />
    </EmployeeStack.Navigator>
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
      {!user ? <GuestNavigator /> : user.role === 'admin' ? <AdminDashboardScreen /> : <EmployeeNavigator />}
    </NavigationContainer>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): give the employee role a real stack (Dashboard -> TaskDetail)"
```

---

### Task 9: `ClientTrackTicketScreen` reuses the shared status tokens

**Files:**
- Modify: `mobile/src/screens/ClientTrackTicketScreen.tsx`

- [ ] **Step 1: Replace the status-label logic**

Remove the local `STATUS_LABEL` constant entirely, and update the import line and status-rendering line.

Replace:

```tsx
import { brand } from '../theme/tokens';
```

with:

```tsx
import { brand, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
```

Remove:

```tsx
const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  case_closed: 'Closed',
};
```

Replace the status text (previously using the hardcoded `brand.primary` color and the local `STATUS_LABEL` lookup):

```tsx
            <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(2) }]}>Status</Text>
            <Text style={[styles.statusValue, { color: (statusColors[r.status] || DEFAULT_STATUS_STYLE).color }]}>
              {(statusColors[r.status] || DEFAULT_STATUS_STYLE).label}
            </Text>
```

Update the `statusValue` style (it no longer bakes in `color: brand.primary`, since the color is now per-status; it also switches from `...typography.body` + `fontWeight: '700'` to an explicit bold font family — layering `fontWeight` on top of a named custom-font style risks Android synthesizing a fake bold instead of using the real bold variant, the same fix applied in phase 2):

```ts
  statusValue: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/ClientTrackTicketScreen.tsx
git commit -m "refactor(mobile): reuse shared status tokens in ClientTrackTicketScreen"
```

---

### Task 10: Manual on-device verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm zero type errors project-wide**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Start the dev server and open on a real device**

Run from `mobile/`: `npx expo start`, then scan the QR code with Expo Go.

- [ ] **Step 3: Walk the flow with a real employee/technician account that has at least one assigned ticket**

- Dashboard shows **My Tasks** with filter chips (All/Open/In Progress/Resolved) — tapping a chip actually filters the list.
- Each task row shows a colored category icon chip, the real ticket title, and a colored status badge — not a truncated id.
- Tapping a task opens **Task Detail**: title, description, category chip, customer contact (if the ticket has a linked inquiry), a 4-segment status stepper, and a "Mark as [next status]" button.
- Tapping the advance button actually calls the server and the status updates — confirm by pulling to refresh the dashboard afterward and seeing the new status reflected there too.
- Once a ticket reaches "resolved," the button becomes a static "Job Resolved" box, not tappable.
- The before/after photo tiles and signature tile are visible but clearly say "Coming soon" and don't respond to taps.
- "← Back" returns to the dashboard.

- [ ] **Step 4: Report back**

If everything matches, phase 3a is done. If something's off, note which screen and what's wrong.
