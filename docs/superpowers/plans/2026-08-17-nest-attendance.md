# NEST Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Attendance screen (clock in/out, weekly hours, history, leave requests) as the employee tab set's second real tab — per `docs/superpowers/specs/2026-08-17-nest-attendance.md`.

**Architecture:** A new `attendance.ts` API module (mirrors `tickets.ts`'s rationale — Phase 4's admin "Team" view will reuse it), a `postForm` addition to the API client for the one multipart endpoint needed, and two new screens (`AttendanceScreen`, `LeaveFormScreen`) added as siblings on the existing `EmployeeStack`.

**Tech Stack:** One new dependency, `expo-location` (foreground GPS for the geofence-required clock-in case). Everything else reuses phase 3a's tokens/components.

**Verification approach:** `npx tsc --noEmit` after every step. The final on-device check needs a real employee login (ideally one of each `worker_type` — gig and fixed — to exercise both clock-in paths) since attendance mutations can't be verified any other way.

---

### Task 1: Add `expo-location`

**Files:**
- Modify: `mobile/package.json`

- [ ] **Step 1: Install via the Expo version resolver**

Run from `mobile/`: `npx expo install expo-location`

- [ ] **Step 2: Verify**

Run: `grep expo-location mobile/package.json`
Expected: one new line under `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "chore(mobile): add expo-location for geofenced clock-in"
```

---

### Task 2: Add `postForm` to the API client

**Files:**
- Modify: `mobile/src/api/client.ts`

- [ ] **Step 1: Add the function**

Add after `dataPatch`. This is separate from `request()`/`api.post` because those always set `Content-Type: application/json` and `JSON.stringify` the body — both wrong for a multipart upload, which needs `fetch` to compute its own boundary-bearing content type.

```ts
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const fullUrl = `${API_BASE_URL}${path}`;
  const res = await fetch(fullUrl, { method: 'POST', headers, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data as T;
}
```

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/client.ts
git commit -m "feat(mobile): add postForm to the API client for multipart uploads"
```

---

### Task 3: `attendance.ts` API module

**Files:**
- Create: `mobile/src/api/attendance.ts`

- [ ] **Step 1: Write the file**

```ts
import * as Location from 'expo-location';
import { dataGet, dataPatch, dataPost, postForm } from './client';

export interface AttendanceRow {
  id: string;
  user_id: string;
  clock_in: string | null;
  clock_out: string | null;
  date: string;
  location: string | null;
  status: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
}

const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, matches server/index.cjs

export async function fetchTodayAttendance(userId: string): Promise<AttendanceRow | null> {
  const rows = await dataGet<AttendanceRow[]>('attendance', {
    select: '*',
    eq: [`user_id:${userId}`, `date:${todayStr()}`],
  });
  return rows[0] ?? null;
}

// No `limit` support on the generic data endpoint — fetch everything for
// this user and let callers slice client-side (design spec §2).
export async function fetchAttendanceHistory(userId: string): Promise<AttendanceRow[]> {
  return dataGet<AttendanceRow[]>('attendance', {
    select: '*',
    eq: [`user_id:${userId}`],
    order: 'date:desc',
  });
}

interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
}

async function getCoordsIfAvailable(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0 };
  } catch {
    return null;
  }
}

export async function clockInGig(userId: string): Promise<AttendanceRow> {
  const coords = await getCoordsIfAvailable();
  return dataPost<AttendanceRow>('attendance', {
    user_id: userId,
    date: todayStr(),
    clock_in: new Date().toISOString(),
    status: 'present',
    ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
  });
}

// Fixed employees always go through the photo-capable endpoint even though
// this build never attaches a photo — the server (not this client) knows
// per-employee exemptions and decides whether one was actually required,
// rejecting with a specific error if so. See design spec §2: real
// photo/face-match clock-in isn't built; the honest cases (not required,
// or this employee is exempted) still work for real through this same call.
export async function clockInFixed(): Promise<AttendanceRow> {
  const coords = await getCoordsIfAvailable();
  const form = new FormData();
  if (coords) {
    form.append('lat', String(coords.lat));
    form.append('lng', String(coords.lng));
    form.append('accuracy', String(coords.accuracy));
  }
  return postForm<AttendanceRow>('/attendance/clock-in-photo', form);
}

export async function clockOut(attendanceId: string): Promise<void> {
  await dataPatch('attendance', `id:${attendanceId}`, { clock_out: new Date().toISOString() });
}

export async function fetchLeaveRequests(userId: string): Promise<LeaveRequest[]> {
  return dataGet<LeaveRequest[]>('leave_requests', {
    select: '*',
    eq: [`employee_id:${userId}`],
    order: 'start_date:desc',
  });
}

export async function submitLeaveRequest(
  userId: string,
  startDate: string,
  endDate: string,
  reason: string,
): Promise<LeaveRequest> {
  return dataPost<LeaveRequest>('leave_requests', {
    employee_id: userId,
    start_date: startDate,
    end_date: endDate,
    reason,
    status: 'pending',
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/attendance.ts
git commit -m "feat(mobile): add attendance API module (clock in/out, history, leave)"
```

---

### Task 4: Remove attendance code from `employee.ts`

**Files:**
- Modify: `mobile/src/api/employee.ts`

- [ ] **Step 1: Replace the file contents**

`AttendanceRow`/`fetchTodayAttendance` moved to `attendance.ts` (Task 3) — this file keeps only the ticket-list query, which is genuinely employee(self)-scoped.

```ts
import { dataGet } from './client';

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
Expected: an error in `EmployeeDashboardScreen.tsx` — it still imports `AttendanceRow`/`fetchTodayAttendance` from `../api/employee`. Expected until Task 5 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/employee.ts
git commit -m "refactor(mobile): move attendance code out of employee.ts"
```

---

### Task 5: Upgrade `EmployeeDashboardScreen` — real 3-tab bar, shared tab config

**Files:**
- Modify: `mobile/src/screens/EmployeeDashboardScreen.tsx`

- [ ] **Step 1: Replace the file contents**

`TABS`/`MORE_SECTIONS` become exported `EMPLOYEE_TABS`/`EMPLOYEE_MORE_SECTIONS` so `AttendanceScreen` (Task 6) can reuse the identical tab bar instead of duplicating it. The attendance import moves to the new module (Task 3/4); a new `onGoAttendance` prop wires the tab bar's real third tab.

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
import { fetchTodayAttendance, AttendanceRow } from '../api/attendance';
import { fetchMyTickets, TicketRow } from '../api/employee';

interface Props {
  onOpenTask: (ticketId: string) => void;
  onGoAttendance: () => void;
}

// Shared by EmployeeDashboardScreen and AttendanceScreen so the tab bar is
// identical (not duplicated) across the employee's top-level screens.
export const EMPLOYEE_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'more', label: 'More' },
];

// The web app's employee-relevant sections not yet ported to mobile — see
// design spec §5/§8 (phase 1) and phase 3a's spec §8 (Job Cards is a
// separate, richer feature from this phase's simple status tracking).
export const EMPLOYEE_MORE_SECTIONS = [
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

export default function EmployeeDashboardScreen({ onOpenTask, onGoAttendance }: Props) {
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
        items={EMPLOYEE_TABS}
        activeKey={moreVisible ? 'more' : 'dashboard'}
        onSelect={(key) => {
          if (key === 'more') setMoreVisible(true);
          else if (key === 'attendance') onGoAttendance();
          else setMoreVisible(false);
        }}
      />
      <MoreSheet visible={moreVisible} sections={EMPLOYEE_MORE_SECTIONS} onClose={() => setMoreVisible(false)} />
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
Expected: an error in `RootNavigator.tsx` — `EmployeeDashboardRoute` doesn't pass `onGoAttendance` yet. Expected until Task 8 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EmployeeDashboardScreen.tsx
git commit -m "feat(mobile): give EmployeeDashboardScreen a real 3-tab bar, export shared tab config"
```

---

### Task 6: `AttendanceScreen`

**Files:**
- Create: `mobile/src/screens/AttendanceScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import MoreSheet from '../components/MoreSheet';
import { EMPLOYEE_TABS, EMPLOYEE_MORE_SECTIONS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { ApiError } from '../api/client';
import {
  AttendanceRow,
  LeaveRequest,
  fetchTodayAttendance,
  fetchAttendanceHistory,
  fetchLeaveRequests,
  clockInGig,
  clockInFixed,
  clockOut,
} from '../api/attendance';

interface Props {
  onGoDashboard: () => void;
  onOpenLeaveForm: () => void;
}

const LEAVE_STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)', label: 'Pending' },
  approved: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)', label: 'Approved' },
  rejected: { color: '#f0556d', bg: 'rgba(240,85,109,0.14)', label: 'Rejected' },
};

function hoursBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? ms / 3600000 : 0;
}

export default function AttendanceScreen({ onGoDashboard, onOpenLeaveForm }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [segment, setSegment] = useState<'attendance' | 'leave'>('attendance');
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [clocking, setClocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [t, h, l] = await Promise.all([
        fetchTodayAttendance(user.id),
        fetchAttendanceHistory(user.id),
        fetchLeaveRequests(user.id),
      ]);
      setToday(t);
      setHistory(h);
      setLeaves(l);
      setError(null);
    } catch {
      setError('Could not load attendance — pull to retry');
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

  const clockedIn = !!today?.clock_in && !today?.clock_out;

  const handleClock = async () => {
    if (!user) return;
    setClocking(true);
    setError(null);
    try {
      if (clockedIn && today) {
        await clockOut(today.id);
      } else if (user.worker_type === 'gig') {
        await clockInGig(user.id);
      } else {
        await clockInFixed();
      }
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update attendance';
      setError(
        message.toLowerCase().includes('photo')
          ? "Photo clock-in isn't supported in the mobile app yet — use the web app."
          : message,
      );
    } finally {
      setClocking(false);
    }
  };

  const last7 = [...history]
    .filter((r) => new Date(r.date).getTime() >= Date.now() - 7 * 24 * 3600 * 1000)
    .sort((a, b) => a.date.localeCompare(b.date));
  const maxHours = Math.max(1, ...last7.map((r) => hoursBetween(r.clock_in, r.clock_out)));

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={[styles.title, { color: theme.text }]}>Attendance</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>Clock in, hours & leave</Text>

        <View style={[styles.segmentRow, { backgroundColor: theme.panel2 }]}>
          <Pressable onPress={() => setSegment('attendance')} style={[styles.segment, segment === 'attendance' && styles.segmentActive]}>
            <Text style={[styles.segmentText, { color: segment === 'attendance' ? '#ffffff' : theme.text2 }]}>Attendance</Text>
          </Pressable>
          <Pressable onPress={() => setSegment('leave')} style={[styles.segment, segment === 'leave' && styles.segmentActive]}>
            <Text style={[styles.segmentText, { color: segment === 'leave' ? '#ffffff' : theme.text2 }]}>Leave</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {segment === 'attendance' ? (
          <>
            <GlassCard style={styles.clockCard}>
              <View style={[styles.clockChip, { backgroundColor: clockedIn ? 'rgba(21,160,90,0.14)' : theme.panel2 }]}>
                <View style={[styles.clockDot, { backgroundColor: clockedIn ? brand.primary : theme.text3 }]} />
                <Text style={[styles.clockChipText, { color: clockedIn ? brand.primary : theme.text3 }]}>
                  {clockedIn ? 'Clocked in' : 'Clocked out'}
                </Text>
              </View>
              <Pressable
                onPress={handleClock}
                disabled={clocking}
                style={({ pressed }) => [
                  styles.clockButton,
                  { backgroundColor: clockedIn ? theme.panel2 : brand.primary, borderColor: theme.line, borderWidth: clockedIn ? 1 : 0 },
                  pressed && styles.pressed,
                  clocking && styles.disabled,
                ]}
              >
                <Text style={[styles.clockButtonText, { color: clockedIn ? theme.text : '#ffffff' }]}>
                  {clocking ? 'Please wait…' : clockedIn ? 'Clock Out' : 'Clock In'}
                </Text>
              </Pressable>
            </GlassCard>

            <Panel style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Hours this week</Text>
              <View style={styles.barsRow}>
                {last7.length === 0 ? (
                  <Text style={[styles.caption, { color: theme.text3 }]}>No attendance yet this week.</Text>
                ) : (
                  last7.map((r) => {
                    const h = hoursBetween(r.clock_in, r.clock_out);
                    return (
                      <View key={r.id} style={styles.barCol}>
                        <View style={[styles.bar, { height: Math.max(6, (h / maxHours) * 64), backgroundColor: brand.primary }]} />
                        <Text style={[styles.barLabel, { color: theme.text3 }]}>
                          {new Date(r.date).toLocaleDateString('en-US', { weekday: 'narrow' })}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </Panel>

            <Text style={[styles.sectionLabel, { color: theme.text3, marginTop: spacing(5) }]}>History</Text>
            {history.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3 }]}>No attendance history yet.</Text>
            ) : (
              history.slice(0, 14).map((r) => (
                <Panel key={r.id} style={styles.historyRow}>
                  <View style={styles.historyInfo}>
                    <Text style={[styles.historyDate, { color: theme.text }]}>{r.date}</Text>
                    {r.location ? <Text style={[styles.caption, { color: theme.text3 }]}>{r.location}</Text> : null}
                  </View>
                  <View style={styles.historyTimes}>
                    <Text style={[styles.historyTime, { color: theme.text }]}>
                      {r.clock_in ? new Date(r.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {' – '}
                      {r.clock_out ? new Date(r.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                    </Text>
                    <Text style={[styles.historyHours, { color: brand.primary }]}>{hoursBetween(r.clock_in, r.clock_out).toFixed(1)}h</Text>
                  </View>
                </Panel>
              ))
            )}
          </>
        ) : (
          <>
            <Pressable onPress={onOpenLeaveForm} style={({ pressed }) => [styles.newLeaveButton, pressed && styles.pressed]}>
              <Text style={styles.newLeaveButtonText}>+ New Leave Request</Text>
            </Pressable>
            {leaves.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3 }]}>No leave requests yet.</Text>
            ) : (
              leaves.map((l) => {
                const s = LEAVE_STATUS_STYLE[l.status] || LEAVE_STATUS_STYLE.pending;
                return (
                  <Panel key={l.id} style={styles.leaveRow}>
                    <View style={styles.leaveHeader}>
                      <Text style={[styles.leaveDates, { color: theme.text }]}>{l.start_date} – {l.end_date}</Text>
                      <View style={[styles.leaveBadge, { backgroundColor: s.bg }]}>
                        <Text style={[styles.leaveBadgeText, { color: s.color }]}>{s.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.caption, { color: theme.text2 }]}>{l.reason}</Text>
                  </Panel>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey={moreVisible ? 'more' : 'attendance'}
        onSelect={(key) => {
          if (key === 'more') setMoreVisible(true);
          else if (key === 'dashboard') onGoDashboard();
          else setMoreVisible(false);
        }}
      />
      <MoreSheet visible={moreVisible} sections={EMPLOYEE_MORE_SECTIONS} onClose={() => setMoreVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  caption: { ...typography.caption },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  section: { marginTop: spacing(5) },
  segmentRow: { flexDirection: 'row', borderRadius: 14, padding: 4, marginTop: spacing(4), marginBottom: spacing(4) },
  segment: { flex: 1, paddingVertical: spacing(2.5), borderRadius: 11, alignItems: 'center' },
  segmentActive: { backgroundColor: brand.primary },
  segmentText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  clockCard: { alignItems: 'center', paddingVertical: spacing(6) },
  clockChip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3.5), paddingVertical: spacing(1.75), borderRadius: radius.full, marginBottom: spacing(4) },
  clockDot: { width: 7, height: 7, borderRadius: 4 },
  clockChipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  clockButton: { width: '100%', paddingVertical: spacing(3.5), borderRadius: 14, alignItems: 'center' },
  clockButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2), height: 90 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing(1.5) },
  bar: { width: '100%', maxWidth: 20, borderRadius: 6 },
  barLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) },
  historyInfo: { flex: 1 },
  historyDate: { fontFamily: 'Manrope_700Bold', fontSize: 13, marginBottom: spacing(0.5) },
  historyTimes: { alignItems: 'flex-end' },
  historyTime: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12 },
  historyHours: { fontFamily: 'Manrope_700Bold', fontSize: 12, marginTop: spacing(0.5) },
  newLeaveButton: { padding: spacing(3.5), borderRadius: 14, backgroundColor: brand.primary, alignItems: 'center', marginBottom: spacing(4) },
  newLeaveButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#ffffff' },
  leaveRow: { marginBottom: spacing(2.5) },
  leaveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) },
  leaveDates: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  leaveBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(0.75), borderRadius: 8 },
  leaveBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/AttendanceScreen.tsx
git commit -m "feat(mobile): add AttendanceScreen with real clock in/out, hours, history, leave"
```

---

### Task 7: `LeaveFormScreen`

**Files:**
- Create: `mobile/src/screens/LeaveFormScreen.tsx`

- [ ] **Step 1: Write the file**

Two structured date fields (not NEST's single free-text "20 Jun – 21 Jun" mockup field) because the real `leave_requests.start_date`/`end_date` are DATE columns that need parseable values, not a display string.

```tsx
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { submitLeaveRequest } from '../api/attendance';
import { ApiError } from '../api/client';

interface Props {
  onBack: () => void;
}

export default function LeaveFormScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!user) return;
    if (!startDate.trim() || !endDate.trim() || !reason.trim()) {
      setError('Fill in the start date, end date, and reason');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await submitLeaveRequest(user.id, startDate.trim(), endDate.trim(), reason.trim());
      onBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your request — check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
          <Text style={[styles.title, { color: theme.text }]}>New Leave Request</Text>

          <GlassCard style={styles.formCard}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Start date (YYYY-MM-DD)"
              placeholderTextColor={theme.text3}
              value={startDate}
              onChangeText={setStartDate}
            />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="End date (YYYY-MM-DD)"
              placeholderTextColor={theme.text3}
              value={endDate}
              onChangeText={setEndDate}
            />
            <TextInput
              style={[styles.input, styles.textArea, { color: theme.text, marginBottom: 0 }]}
              placeholder="Reason"
              placeholderTextColor={theme.text3}
              value={reason}
              onChangeText={setReason}
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
  formCard: { marginTop: spacing(4) },
  title: { ...typography.title },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/LeaveFormScreen.tsx
git commit -m "feat(mobile): add LeaveFormScreen"
```

---

### Task 8: Wire `Attendance`/`LeaveForm` into the employee stack

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
import AttendanceScreen from '../screens/AttendanceScreen';
import LeaveFormScreen from '../screens/LeaveFormScreen';

type GuestStackParams = {
  Landing: undefined;
  Login: undefined;
  SubmitTicket: undefined;
  TrackTicket: undefined;
};

type EmployeeStackParams = {
  Dashboard: undefined;
  TaskDetail: { ticketId: string };
  Attendance: undefined;
  LeaveForm: undefined;
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
  return (
    <EmployeeDashboardScreen
      onOpenTask={(ticketId) => navigation.navigate('TaskDetail', { ticketId })}
      onGoAttendance={() => navigation.navigate('Attendance')}
    />
  );
}

function TaskDetailRoute({ navigation, route }: any) {
  return <TaskDetailScreen ticketId={route.params.ticketId} onBack={() => navigation.goBack()} />;
}

function AttendanceRoute({ navigation }: any) {
  return (
    <AttendanceScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onOpenLeaveForm={() => navigation.navigate('LeaveForm')}
    />
  );
}

function LeaveFormRoute({ navigation }: any) {
  return <LeaveFormScreen onBack={() => navigation.goBack()} />;
}

// Dashboard and Attendance are siblings switched with no transition
// (an instant-swap approximation of tab behavior, since GlassTabBar isn't
// a real React Navigation tab navigator — design spec §4). TaskDetail and
// LeaveForm are genuine drill-down pushes with a slide transition and no
// tab bar, matching the pattern TaskDetail already established.
function EmployeeNavigator() {
  return (
    <EmployeeStack.Navigator screenOptions={{ headerShown: false }}>
      <EmployeeStack.Screen name="Dashboard" component={EmployeeDashboardRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Attendance" component={AttendanceRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="TaskDetail" component={TaskDetailRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="LeaveForm" component={LeaveFormRoute} options={{ animation: 'slide_from_right' }} />
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
Expected: no errors — this was the last file with an outstanding change.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): wire Attendance and LeaveForm into the employee stack"
```

---

### Task 9: Manual on-device verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm zero type errors project-wide**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Start the dev server and open on a real device**

Run from `mobile/`: `npx expo start`, then scan the QR code with Expo Go.

- [ ] **Step 3: Walk the flow with a real employee account**

- From the Dashboard, tap the **Attendance** tab — it swaps instantly (no slide) to the Attendance screen; tapping **Dashboard** again swaps back the same way.
- **Attendance segment**: clock status chip, Clock In button. Tap it — for a **gig** worker, it should succeed immediately (check the location permission prompt appears and either grant or deny it — both paths should still let clock-in succeed, since gig workers don't require geofencing). For a **fixed** employee, if their account doesn't require a photo, clock-in should also succeed for real; if it does, the error should read "Photo clock-in isn't supported in the mobile app yet — use the web app," not a raw server error or a broken screen.
- After clocking in, pull to refresh — status flips to "Clocked in," and tapping the button again clocks out for real.
- "Hours this week" shows bars for real history days; "History" lists real past attendance rows.
- **Leave segment**: tap "+ New Leave Request," fill in dates + reason, submit — it navigates back and the new request appears in the list with a "Pending" badge.
- "← Back" from the leave form returns to Attendance, not Dashboard.

- [ ] **Step 4: Report back**

If everything matches, phase 3b is done. If something's off, note which screen, which worker type, and what's wrong.
