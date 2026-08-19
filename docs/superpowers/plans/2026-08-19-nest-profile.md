# NEST Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Profile tab (Leaderboard, Training Courses, Tutorials, Notifications, Settings) as the employee tab set's real 5th tab, replacing the placeholder "More" tab across all 4 existing top-level screens — per `docs/superpowers/specs/2026-08-19-nest-profile.md`.

**Architecture:** One small server addition (an employee-facing leaderboard route reusing existing helpers), three new mobile API modules, seven new screens, and a tab-bar simplification across `EmployeeDashboardScreen`/`AttendanceScreen`/`JobToolsScreen`/`EarningsScreen` (drop `MoreSheet`/`moreVisible`, add `onGoProfile`).

**Tech Stack:** No new dependencies — `Linking` (Tutorials playback) is core React Native.

**Verification approach:** `npx tsc --noEmit` after every mobile step. The server change (Task 1) needs the **local dev server restarted** to pick up the new route before Task 17's on-device check can exercise Leaderboard.

---

### Task 1: Add an employee-facing leaderboard endpoint

**Files:**
- Modify: `server/index.cjs`

- [ ] **Step 1: Add the route**

Insert this immediately before the existing `app.get('/api/admin/leaderboard', ...)` handler — it reuses the same helpers (`fetchVerifiedJobsForMonth`, `computeLeaderboard`) already defined above that handler, just without the admin gate or award lookup:

```js
// Employee-facing leaderboard — same computation as the admin endpoint
// below, without the admin gate or award-lookup, so a technician can see
// their own standing (design spec §2).
app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    if (req.user.role !== 'employee') return res.sendStatus(403);
    const month = String(req.query.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'month must be formatted YYYY-MM' });
    }

    let connection;
    try {
        connection = await getConn();
        const rows = await fetchVerifiedJobsForMonth(connection, month);
        const board = computeLeaderboard(rows);
        res.json({ month, leaderboard: board });
    } catch (err) {
        console.error('[leaderboard] employee leaderboard fetch failed:', err);
        res.status(500).json({ error: 'Could not load leaderboard' });
    } finally {
        if (connection) connection.release();
    }
});

```

- [ ] **Step 2: Sanity-check the server still starts**

Run from the repo root: `node -c server/index.cjs`
Expected: no output (syntax is valid). This project's server isn't part of the mobile `tsc` check, so a syntax check is the fast local signal; Task 17 verifies it for real once the dev server is running.

- [ ] **Step 3: Commit**

```bash
git add server/index.cjs
git commit -m "feat(server): add employee-facing GET /api/leaderboard"
```

---

### Task 2: `leaderboard.ts` API module

**Files:**
- Create: `mobile/src/api/leaderboard.ts`

- [ ] **Step 1: Write the file**

```ts
import { api } from './client';

export interface LeaderboardEntry {
  employeeId: string;
  name: string;
  avgRating: number | null;
  avgTimeEfficiency: number | null;
  jobsCount: number;
  combinedScore: number;
}

export interface LeaderboardResponse {
  month: string;
  leaderboard: LeaderboardEntry[];
}

const currentMonthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  return api.get<LeaderboardResponse>(`/leaderboard?month=${currentMonthKey()}`);
}
```

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/leaderboard.ts
git commit -m "feat(mobile): add leaderboard API module"
```

---

### Task 3: `training.ts` API module

**Files:**
- Create: `mobile/src/api/training.ts`

- [ ] **Step 1: Write the file**

```ts
import { dataGet, api } from './client';

export interface CourseSummary {
  id: string;
  title: string;
  description: string | null;
  category: string;
  lesson_count: number;
  quiz_count: number;
  done_count: number;
  due_date: string | null;
  completed: number;
}

export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  type: string;
  position: number;
}

export interface CourseDetail {
  course: { id: string; title: string; description: string | null; category: string };
  lessons: Lesson[];
  doneLessonIds: string[];
  completion: { id: string; completed_at: string } | null;
}

export interface TrainingItem {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  url: string;
  active: number;
  position: number;
}

export interface WatchProgress {
  item_id: string;
  percent: number;
  seconds_watched: number;
  duration_seconds: number;
}

export async function fetchMyCourses(): Promise<CourseSummary[]> {
  return api.get<CourseSummary[]>('/training/my');
}

export async function fetchCourseDetail(courseId: string): Promise<CourseDetail> {
  return api.get<CourseDetail>(`/training/course/${courseId}`);
}

export async function completeLesson(lessonId: string): Promise<void> {
  await api.post(`/training/lessons/${lessonId}/complete`);
}

export async function fetchTrainingItems(): Promise<TrainingItem[]> {
  return dataGet<TrainingItem[]>('training_items', {
    select: 'id,title,description,kind,url,active,position',
    eq: ['active:1'],
    order: 'position:asc',
  });
}

// No in-app player exists this phase (design spec §2), so this only shows
// whatever progress already exists (e.g. from web usage) — read-only.
export async function fetchWatchProgress(): Promise<WatchProgress[]> {
  return api.get<WatchProgress[]>('/training/watch-progress/mine');
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/training.ts
git commit -m "feat(mobile): add training API module (courses, lessons, tutorials)"
```

---

### Task 4: `notifications.ts` API module

**Files:**
- Create: `mobile/src/api/notifications.ts`

- [ ] **Step 1: Write the file**

```ts
import { api } from './client';

export interface NotificationItem {
  id: string;
  subject: string | null;
  title: string | null;
  body: string | null;
  data: unknown;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

export async function fetchNotifications(): Promise<NotificationsResponse> {
  return api.get<NotificationsResponse>('/notifications');
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/notifications/${id}/read`);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/notifications.ts
git commit -m "feat(mobile): add notifications API module"
```

---

### Task 5: Replace "More" with "Profile" on `EmployeeDashboardScreen`

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
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onGoProfile: () => void;
}

// Shared by every employee top-level screen so the tab bar is identical
// (not duplicated) across all of them. Matches NEST's real 5-tab design —
// see docs/superpowers/specs/2026-08-19-nest-profile.md §3. "More" is
// gone: Profile is a real tab now, not a placeholder holding area.
export const EMPLOYEE_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'jobtools', label: 'Job Tools' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'profile', label: 'Profile' },
];

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

export default function EmployeeDashboardScreen({ onOpenTask, onGoAttendance, onGoJobTools, onGoEarnings, onGoProfile }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        activeKey="dashboard"
        onSelect={(key) => {
          if (key === 'attendance') onGoAttendance();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'earnings') onGoEarnings();
          else if (key === 'profile') onGoProfile();
        }}
      />
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
Expected: errors in `AttendanceScreen.tsx`, `JobToolsScreen.tsx`, `EarningsScreen.tsx` (they still import the now-removed `EMPLOYEE_MORE_SECTIONS`) and in `RootNavigator.tsx` (missing `onGoProfile`). Expected until Tasks 6–8 and 16 land.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EmployeeDashboardScreen.tsx
git commit -m "feat(mobile): replace More with Profile on EmployeeDashboardScreen's tab bar"
```

---

### Task 6: Replace "More" with "Profile" on `AttendanceScreen`

**Files:**
- Modify: `mobile/src/screens/AttendanceScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
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
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onGoProfile: () => void;
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

export default function AttendanceScreen({ onGoDashboard, onGoJobTools, onGoEarnings, onGoProfile, onOpenLeaveForm }: Props) {
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
        activeKey="attendance"
        onSelect={(key) => {
          if (key === 'dashboard') onGoDashboard();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'earnings') onGoEarnings();
          else if (key === 'profile') onGoProfile();
        }}
      />
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
Expected: errors remain in `JobToolsScreen.tsx`, `EarningsScreen.tsx`, and `RootNavigator.tsx`. Expected until Tasks 7–8 and 16 land.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/AttendanceScreen.tsx
git commit -m "feat(mobile): replace More with Profile on AttendanceScreen's tab bar"
```

---

### Task 7: Replace "More" with "Profile" on `JobToolsScreen`, add Job Cards row

**Files:**
- Modify: `mobile/src/screens/JobToolsScreen.tsx`

- [ ] **Step 1: Replace the file contents**

Job Cards relocates here as a 4th, non-interactive "Coming soon" row (design spec §3) — it's a job-tools concept (technician job documentation), and it's the one item from the old "More" list still genuinely unbuilt.

```tsx
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';

interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onGoEarnings: () => void;
  onGoProfile: () => void;
  onOpenEstimator: () => void;
  onOpenDeviceFollowUp: () => void;
  onOpenEodReport: () => void;
}

const TOOLS = [
  { key: 'estimator', label: 'Estimator', desc: 'Build an on-site quote', color: '#15a05a' },
  { key: 'devices', label: 'Device Follow-up', desc: 'Devices under service', color: '#0ea5a5' },
  { key: 'eod', label: 'EOD Report', desc: 'Submit end-of-day summary', color: '#6366f1' },
];

export default function JobToolsScreen({
  onGoDashboard,
  onGoAttendance,
  onGoEarnings,
  onGoProfile,
  onOpenEstimator,
  onOpenDeviceFollowUp,
  onOpenEodReport,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const openTool = (key: string) => {
    if (key === 'estimator') onOpenEstimator();
    else if (key === 'devices') onOpenDeviceFollowUp();
    else onOpenEodReport();
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}>
        <Text style={[styles.title, { color: theme.text }]}>Job Tools</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(5) }]}>Estimator, devices & reports</Text>

        {TOOLS.map((tool) => (
          <Pressable key={tool.key} onPress={() => openTool(tool.key)} style={({ pressed }) => [pressed && styles.pressed]}>
            <Panel style={styles.toolRow}>
              <View style={[styles.toolIcon, { backgroundColor: tool.color + '24' }]}>
                <View style={[styles.toolDot, { backgroundColor: tool.color }]} />
              </View>
              <View style={styles.toolInfo}>
                <Text style={[styles.toolLabel, { color: theme.text }]}>{tool.label}</Text>
                <Text style={[styles.caption, { color: theme.text3 }]}>{tool.desc}</Text>
              </View>
              <Text style={[styles.chevron, { color: theme.text3 }]}>›</Text>
            </Panel>
          </Pressable>
        ))}

        <Panel style={[styles.toolRow, styles.comingSoonRow]}>
          <View style={[styles.toolIcon, { backgroundColor: theme.panel2 }]}>
            <View style={[styles.toolDot, { backgroundColor: theme.text3 }]} />
          </View>
          <View style={styles.toolInfo}>
            <Text style={[styles.toolLabel, { color: theme.text3 }]}>Job Cards</Text>
            <Text style={[styles.caption, { color: theme.text3 }]}>Coming soon</Text>
          </View>
        </Panel>
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey="jobtools"
        onSelect={(key) => {
          if (key === 'dashboard') onGoDashboard();
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'earnings') onGoEarnings();
          else if (key === 'profile') onGoProfile();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  caption: { ...typography.caption },
  pressed: { opacity: 0.7 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  comingSoonRow: { opacity: 0.6 },
  toolIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toolDot: { width: 10, height: 10, borderRadius: 5 },
  toolInfo: { flex: 1, minWidth: 0 },
  toolLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15, marginBottom: spacing(0.5) },
  chevron: { fontSize: 20 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain in `EarningsScreen.tsx` and `RootNavigator.tsx`. Expected until Task 8 and 16 land.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/JobToolsScreen.tsx
git commit -m "feat(mobile): replace More with Profile on JobToolsScreen, relocate Job Cards here"
```

---

### Task 8: Replace "More" with "Profile" on `EarningsScreen`

**Files:**
- Modify: `mobile/src/screens/EarningsScreen.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchAttendanceHistory, fetchLeaveRequests } from '../api/attendance';
import { fetchCashInquiries, cashAmount, CashInquiry } from '../api/earnings';

interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
  onGoProfile: () => void;
}

type Segment = 'cash' | 'collections' | 'salary';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'cash', label: 'My Cash' },
  { key: 'collections', label: 'Collections' },
  { key: 'salary', label: 'Salary' },
];

export default function EarningsScreen({ onGoDashboard, onGoAttendance, onGoJobTools, onGoProfile }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [segment, setSegment] = useState<Segment>('cash');
  const [cashRows, setCashRows] = useState<CashInquiry[]>([]);
  const [daysPresent, setDaysPresent] = useState(0);
  const [leaveDays, setLeaveDays] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [cash, history, leaves] = await Promise.all([
        fetchCashInquiries(user.id),
        fetchAttendanceHistory(user.id),
        fetchLeaveRequests(user.id),
      ]);
      setCashRows(cash);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      setDaysPresent(
        history.filter((r) => {
          const d = new Date(r.date);
          return d.getFullYear() === year && d.getMonth() === month && r.clock_in;
        }).length,
      );

      let leaveCount = 0;
      leaves
        .filter((l) => l.status === 'approved')
        .forEach((l) => {
          const start = new Date(l.start_date);
          const end = new Date(l.end_date);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getFullYear() === year && d.getMonth() === month) leaveCount++;
          }
        });
      setLeaveDays(leaveCount);
      setError(null);
    } catch {
      setError('Could not load earnings — pull to retry');
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

  const pendingCash = cashRows.filter((r) => !r.cash_submitted_at);
  const pendingTotal = pendingCash.reduce((sum, r) => sum + cashAmount(r), 0);
  const collectionsTotal = cashRows.reduce((sum, r) => sum + cashAmount(r), 0);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const salary = Number(user?.salary) || 0;
  const payableDays = daysPresent + leaveDays;
  const estimated = daysInMonth > 0 ? (salary * payableDays) / daysInMonth : 0;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={[styles.title, { color: theme.text }]}>Earnings</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>Cash, collections & salary</Text>

        <View style={[styles.segmentRow, { backgroundColor: theme.panel2 }]}>
          {SEGMENTS.map((s) => {
            const active = segment === s.key;
            return (
              <Pressable key={s.key} onPress={() => setSegment(s.key)} style={[styles.segment, active && styles.segmentActive]}>
                <Text style={[styles.segmentText, { color: active ? '#ffffff' : theme.text2 }]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {segment === 'cash' ? (
          <>
            <GlassCard style={styles.heroCard}>
              <Text style={[styles.heroLabel, { color: theme.text2 }]}>Pending to deposit</Text>
              <Text style={styles.heroValue}>₹{pendingTotal.toLocaleString('en-IN')}</Text>
            </GlassCard>
            {pendingCash.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3 }]}>Nothing pending — all caught up.</Text>
            ) : (
              pendingCash.map((r) => (
                <Panel key={r.id} style={styles.cashRow}>
                  <View style={styles.cashInfo}>
                    <Text style={[styles.cashName, { color: theme.text }]}>{r.full_name}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>{r.ticket_no}</Text>
                  </View>
                  <Text style={[styles.cashAmount, { color: theme.text }]}>₹{cashAmount(r).toLocaleString('en-IN')}</Text>
                </Panel>
              ))
            )}
          </>
        ) : null}

        {segment === 'collections' ? (
          cashRows.length === 0 ? (
            <Text style={[styles.caption, { color: theme.text3 }]}>No cash collections yet.</Text>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Total collected: ₹{collectionsTotal.toLocaleString('en-IN')}</Text>
              {cashRows.map((r) => (
                <Panel key={r.id} style={styles.cashRow}>
                  <View style={styles.cashInfo}>
                    <Text style={[styles.cashName, { color: theme.text }]}>{r.full_name}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>
                      {r.ticket_no} · {r.cash_submitted_at ? 'Submitted' : 'Pending'}
                    </Text>
                  </View>
                  <Text style={[styles.cashAmount, { color: theme.text }]}>₹{cashAmount(r).toLocaleString('en-IN')}</Text>
                </Panel>
              ))}
            </>
          )
        ) : null}

        {segment === 'salary' ? (
          <GlassCard style={styles.salaryCard}>
            <Text style={[styles.heroLabel, { color: theme.text2 }]}>Estimated this month</Text>
            <Text style={styles.heroValue}>₹{Math.round(estimated).toLocaleString('en-IN')}</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={[styles.caption, { color: theme.text3 }]}>Monthly</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>₹{salary.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.caption, { color: theme.text3 }]}>Days present</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{daysPresent}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.caption, { color: theme.text3 }]}>Leave taken</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{leaveDays} day{leaveDays === 1 ? '' : 's'}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.caption, { color: theme.text3 }]}>Payable days</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{payableDays} / {daysInMonth}</Text>
              </View>
            </View>
          </GlassCard>
        ) : null}
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey="earnings"
        onSelect={(key) => {
          if (key === 'dashboard') onGoDashboard();
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'profile') onGoProfile();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3), marginBottom: spacing(2) },
  segmentRow: { flexDirection: 'row', borderRadius: 14, padding: 4, marginTop: spacing(4), marginBottom: spacing(4) },
  segment: { flex: 1, paddingVertical: spacing(2.5), borderRadius: 11, alignItems: 'center' },
  segmentActive: { backgroundColor: brand.primary },
  segmentText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  heroCard: { alignItems: 'center', paddingVertical: spacing(6), marginBottom: spacing(4) },
  heroLabel: { ...typography.caption, marginBottom: spacing(1.5) },
  heroValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30, color: brand.primary },
  cashRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2.5) },
  cashInfo: { flex: 1, minWidth: 0 },
  cashName: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  cashAmount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
  sectionLabel: { ...typography.caption, fontSize: 12, marginBottom: spacing(3) },
  salaryCard: { paddingVertical: spacing(5) },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing(5), gap: spacing(4) },
  statCell: { width: '42%' },
  statValue: { fontFamily: 'Manrope_700Bold', fontSize: 15, marginTop: spacing(0.5) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: an error in `RootNavigator.tsx` only (missing `onGoProfile` on all 4 routes, and the new Profile/sub-screens aren't wired yet). Expected until Task 16 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EarningsScreen.tsx
git commit -m "feat(mobile): replace More with Profile on EarningsScreen's tab bar"
```

---

### Task 9: `ProfileScreen` (hub)

**Files:**
- Create: `mobile/src/screens/ProfileScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onOpenLeaderboard: () => void;
  onOpenTraining: () => void;
  onOpenTutorials: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
}

const MENU = [
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'training', label: 'Training Courses' },
  { key: 'tutorials', label: 'Tutorials' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'settings', label: 'Settings' },
];

export default function ProfileScreen({
  onGoDashboard,
  onGoAttendance,
  onGoJobTools,
  onGoEarnings,
  onOpenLeaderboard,
  onOpenTraining,
  onOpenTutorials,
  onOpenNotifications,
  onOpenSettings,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();

  const initials = (user?.full_name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const openRow = (key: string) => {
    if (key === 'leaderboard') onOpenLeaderboard();
    else if (key === 'training') onOpenTraining();
    else if (key === 'tutorials') onOpenTutorials();
    else if (key === 'notifications') onOpenNotifications();
    else onOpenSettings();
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{user?.full_name}</Text>
          <Text style={[styles.caption, { color: theme.text3 }]}>{user?.email}</Text>
        </View>

        {MENU.map((item) => (
          <Pressable key={item.key} onPress={() => openRow(item.key)} style={({ pressed }) => [pressed && styles.pressed]}>
            <Panel style={styles.row}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>{item.label}</Text>
              <Text style={[styles.chevron, { color: theme.text3 }]}>›</Text>
            </Panel>
          </Pressable>
        ))}

        <Pressable onPress={logout} style={({ pressed }) => [pressed && styles.pressed]}>
          <View style={styles.logoutRow}>
            <Text style={styles.logoutText}>Log Out</Text>
          </View>
        </Pressable>
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey="profile"
        onSelect={(key) => {
          if (key === 'dashboard') onGoDashboard();
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'earnings') onGoEarnings();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: 'center', marginBottom: spacing(6) },
  avatar: { width: 68, height: 68, borderRadius: 20, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  avatarText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, color: '#ffffff' },
  name: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17 },
  caption: { ...typography.caption, marginTop: spacing(0.5) },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(2.5) },
  rowLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  chevron: { fontSize: 20 },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(4),
    borderRadius: 16,
    backgroundColor: 'rgba(240,85,109,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(240,85,109,0.25)',
    marginTop: spacing(2),
  },
  logoutText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: brand.danger },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/ProfileScreen.tsx
git commit -m "feat(mobile): add ProfileScreen hub"
```

---

### Task 10: `LeaderboardScreen`

**Files:**
- Create: `mobile/src/screens/LeaderboardScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchLeaderboard, LeaderboardEntry } from '../api/leaderboard';

interface Props {
  onBack: () => void;
}

export default function LeaderboardScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchLeaderboard();
      setRows(res.leaderboard);
      setError(null);
    } catch {
      setError('Could not load leaderboard — pull to retry');
    } finally {
      setLoading(false);
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Leaderboard</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>This month's verified jobs</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && rows.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No verified jobs yet this month.</Text>
        ) : (
          rows.map((r, i) => {
            const isMe = r.employeeId === user?.id;
            return (
              <Panel key={r.employeeId} style={[styles.row, isMe && { borderColor: brand.primary }]}>
                <Text style={[styles.rank, { color: i === 0 ? '#e08a14' : theme.text3 }]}>#{i + 1}</Text>
                <View style={styles.info}>
                  <Text style={[styles.name, { color: theme.text }]}>{isMe ? 'You' : r.name}</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>{r.jobsCount} job{r.jobsCount === 1 ? '' : 's'}</Text>
                </View>
                <Text style={[styles.score, { color: theme.text2 }]}>{r.avgRating != null ? `★ ${r.avgRating.toFixed(1)}` : '—'}</Text>
              </Panel>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  rank: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14, width: 28 },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  score: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 13 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/LeaderboardScreen.tsx
git commit -m "feat(mobile): add LeaderboardScreen"
```

---

### Task 11: `TrainingCoursesScreen` (list)

**Files:**
- Create: `mobile/src/screens/TrainingCoursesScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchMyCourses, CourseSummary } from '../api/training';

interface Props {
  onBack: () => void;
  onOpenCourse: (courseId: string) => void;
}

export default function TrainingCoursesScreen({ onBack, onOpenCourse }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchMyCourses();
      setCourses(rows);
      setError(null);
    } catch {
      setError('Could not load courses — pull to retry');
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Training Courses</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {courses.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>No courses assigned to you yet.</Text>
        ) : (
          courses.map((c) => {
            const pct = c.lesson_count > 0 ? Math.round((c.done_count / c.lesson_count) * 100) : 0;
            return (
              <Pressable key={c.id} onPress={() => onOpenCourse(c.id)} style={({ pressed }) => [pressed && styles.pressed]}>
                <Panel style={styles.row}>
                  <View style={[styles.ring, { borderColor: theme.line }]}>
                    <Text style={[styles.ringText, { color: theme.text }]}>{pct}%</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{c.title}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>{c.category} · {c.lesson_count} lessons</Text>
                  </View>
                </Panel>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginBottom: spacing(4) },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  ring: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/TrainingCoursesScreen.tsx
git commit -m "feat(mobile): add TrainingCoursesScreen list"
```

---

### Task 12: `CoursePlayerScreen` (course detail)

**Files:**
- Create: `mobile/src/screens/CoursePlayerScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { fetchCourseDetail, completeLesson, CourseDetail } from '../api/training';

interface Props {
  courseId: string;
  onBack: () => void;
}

export default function CoursePlayerScreen({ courseId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchCourseDetail(courseId);
      setDetail(d);
      setError(null);
    } catch {
      setError('Could not load this course — check your connection');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleComplete = async (lessonId: string) => {
    setCompletingId(lessonId);
    try {
      await completeLesson(lessonId);
      await load();
    } catch {
      setError('Could not save — check your connection');
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={styles.centered}>
          <Text style={[styles.caption, { color: theme.text3 }]}>Loading…</Text>
        </View>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Course not found'}</Text>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
        </View>
      </View>
    );
  }

  const doneCount = detail.doneLessonIds.length;
  const pct = detail.lessons.length > 0 ? Math.round((doneCount / detail.lessons.length) * 100) : 0;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>

        <GlassCard style={styles.headerCard}>
          <Text style={[styles.courseTitle, { color: theme.text }]}>{detail.course.title}</Text>
          {detail.course.description ? (
            <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>{detail.course.description}</Text>
          ) : null}
          <Text style={[styles.caption, { color: brand.primary, marginTop: spacing(2) }]}>{pct}% complete</Text>
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {detail.lessons.map((lesson, i) => {
          const done = detail.doneLessonIds.includes(lesson.id);
          return (
            <Panel key={lesson.id} style={styles.lessonRow}>
              <View style={[styles.lessonIndex, { backgroundColor: done ? brand.primary : theme.line }]}>
                <Text style={[styles.lessonIndexText, { color: done ? '#ffffff' : theme.text2 }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.lessonTitle, { color: theme.text }]}>{lesson.title}</Text>
              {done ? (
                <Text style={[styles.doneLabel, { color: brand.primary }]}>Done</Text>
              ) : (
                <Pressable
                  onPress={() => handleComplete(lesson.id)}
                  disabled={completingId === lesson.id}
                  style={({ pressed }) => [styles.completeButton, pressed && styles.pressed]}
                >
                  <Text style={styles.completeButtonText}>{completingId === lesson.id ? '…' : 'Mark done'}</Text>
                </Pressable>
              )}
            </Panel>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing(3) },
  body: { ...typography.body },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  headerCard: { marginBottom: spacing(4) },
  courseTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 },
  pressed: { opacity: 0.7 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  lessonIndex: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  lessonIndexText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  lessonTitle: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 13, minWidth: 0 },
  doneLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  completeButton: { paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: 8, backgroundColor: brand.primary },
  completeButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#ffffff' },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/CoursePlayerScreen.tsx
git commit -m "feat(mobile): add CoursePlayerScreen with real lesson completion"
```

---

### Task 13: `TutorialsScreen`

**Files:**
- Create: `mobile/src/screens/TutorialsScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchTrainingItems, fetchWatchProgress, TrainingItem, WatchProgress } from '../api/training';

interface Props {
  onBack: () => void;
}

export default function TutorialsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [progress, setProgress] = useState<Record<string, WatchProgress>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, watch] = await Promise.all([fetchTrainingItems(), fetchWatchProgress()]);
      setItems(rows);
      setProgress(Object.fromEntries(watch.map((w) => [w.item_id, w])));
      setError(null);
    } catch {
      setError('Could not load tutorials — pull to retry');
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Tutorials</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {items.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>No tutorials available yet.</Text>
        ) : (
          items.map((item) => {
            const p = progress[item.id];
            return (
              <Pressable key={item.id} onPress={() => Linking.openURL(item.url)} style={({ pressed }) => [pressed && styles.pressed]}>
                <Panel style={styles.row}>
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>
                      {item.kind}{p ? ` · ${p.percent}% watched` : ''}
                    </Text>
                  </View>
                </Panel>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginBottom: spacing(4) },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  pressed: { opacity: 0.7 },
  row: { marginBottom: spacing(2.5) },
  info: { minWidth: 0 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/TutorialsScreen.tsx
git commit -m "feat(mobile): add TutorialsScreen with external playback"
```

---

### Task 14: `NotificationsScreen`

**Files:**
- Create: `mobile/src/screens/NotificationsScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchNotifications, markNotificationRead, NotificationItem } from '../api/notifications';

interface Props {
  onBack: () => void;
}

export default function NotificationsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchNotifications();
      setItems(res.items);
      setError(null);
    } catch {
      setError('Could not load notifications — pull to retry');
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

  const handlePress = async (item: NotificationItem) => {
    if (item.read_at) return;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await markNotificationRead(item.id);
    } catch {
      // Non-critical — the next refresh will reconcile the real state.
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {items.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>No notifications yet.</Text>
        ) : (
          items.map((item) => (
            <Pressable key={item.id} onPress={() => handlePress(item)} style={({ pressed }) => [pressed && styles.pressed]}>
              <Panel style={[styles.row, !item.read_at && { borderColor: brand.primary }]}>
                <View style={styles.rowHeader}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                  {!item.read_at ? <View style={styles.dot} /> : null}
                </View>
                {item.body ? <Text style={[styles.body, { color: theme.text2 }]}>{item.body}</Text> : null}
                <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(1) }]}>
                  {new Date(item.created_at).toLocaleString('en-IN')}
                </Text>
              </Panel>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginBottom: spacing(4) },
  body: { ...typography.body, marginTop: spacing(0.5) },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  pressed: { opacity: 0.7 },
  row: { marginBottom: spacing(2.5) },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  name: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brand.primary },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/NotificationsScreen.tsx
git commit -m "feat(mobile): add NotificationsScreen"
```

---

### Task 15: `SettingsScreen`

**Files:**
- Create: `mobile/src/screens/SettingsScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme, mode, toggleTheme } = useTheme();

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

        <Panel style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Dark mode</Text>
            <Text style={[styles.caption, { color: theme.text3 }]}>Aurora hero on a near-black base</Text>
          </View>
          <Pressable
            onPress={toggleTheme}
            style={[styles.switch, { backgroundColor: mode === 'dark' ? brand.primary : theme.panel2, borderColor: theme.line }]}
          >
            <View style={[styles.knob, { alignSelf: mode === 'dark' ? 'flex-end' : 'flex-start' }]} />
          </Pressable>
        </Panel>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginBottom: spacing(4) },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowInfo: { flex: 1, minWidth: 0, paddingRight: spacing(3) },
  rowLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  switch: { width: 46, height: 27, borderRadius: 14, borderWidth: 1, padding: 3, justifyContent: 'center' },
  knob: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#ffffff' },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/SettingsScreen.tsx
git commit -m "feat(mobile): add SettingsScreen with real dark-mode toggle"
```

---

### Task 16: Wire Profile and its sub-screens into the employee stack

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
import JobToolsScreen from '../screens/JobToolsScreen';
import EstimatorScreen from '../screens/EstimatorScreen';
import DeviceFollowUpScreen from '../screens/DeviceFollowUpScreen';
import DeviceDetailScreen from '../screens/DeviceDetailScreen';
import EodReportScreen from '../screens/EodReportScreen';
import EarningsScreen from '../screens/EarningsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import TrainingCoursesScreen from '../screens/TrainingCoursesScreen';
import CoursePlayerScreen from '../screens/CoursePlayerScreen';
import TutorialsScreen from '../screens/TutorialsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';

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
  JobTools: undefined;
  Estimator: undefined;
  DeviceFollowUp: undefined;
  DeviceDetail: { inquiryId: string };
  EodReport: undefined;
  Earnings: undefined;
  Profile: undefined;
  Leaderboard: undefined;
  TrainingCourses: undefined;
  CoursePlayer: { courseId: string };
  Tutorials: undefined;
  Notifications: undefined;
  Settings: undefined;
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
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onGoProfile={() => navigation.navigate('Profile')}
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
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onGoProfile={() => navigation.navigate('Profile')}
      onOpenLeaveForm={() => navigation.navigate('LeaveForm')}
    />
  );
}

function LeaveFormRoute({ navigation }: any) {
  return <LeaveFormScreen onBack={() => navigation.goBack()} />;
}

function JobToolsRoute({ navigation }: any) {
  return (
    <JobToolsScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onGoProfile={() => navigation.navigate('Profile')}
      onOpenEstimator={() => navigation.navigate('Estimator')}
      onOpenDeviceFollowUp={() => navigation.navigate('DeviceFollowUp')}
      onOpenEodReport={() => navigation.navigate('EodReport')}
    />
  );
}

function EstimatorRoute({ navigation }: any) {
  return <EstimatorScreen onBack={() => navigation.goBack()} />;
}

function DeviceFollowUpRoute({ navigation }: any) {
  return (
    <DeviceFollowUpScreen
      onBack={() => navigation.goBack()}
      onOpenDevice={(inquiryId) => navigation.navigate('DeviceDetail', { inquiryId })}
    />
  );
}

function DeviceDetailRoute({ navigation, route }: any) {
  return <DeviceDetailScreen inquiryId={route.params.inquiryId} onBack={() => navigation.goBack()} />;
}

function EodReportRoute({ navigation }: any) {
  return <EodReportScreen onBack={() => navigation.goBack()} />;
}

function EarningsRoute({ navigation }: any) {
  return (
    <EarningsScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoProfile={() => navigation.navigate('Profile')}
    />
  );
}

function ProfileRoute({ navigation }: any) {
  return (
    <ProfileScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onOpenLeaderboard={() => navigation.navigate('Leaderboard')}
      onOpenTraining={() => navigation.navigate('TrainingCourses')}
      onOpenTutorials={() => navigation.navigate('Tutorials')}
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenSettings={() => navigation.navigate('Settings')}
    />
  );
}

function LeaderboardRoute({ navigation }: any) {
  return <LeaderboardScreen onBack={() => navigation.goBack()} />;
}

function TrainingCoursesRoute({ navigation }: any) {
  return (
    <TrainingCoursesScreen
      onBack={() => navigation.goBack()}
      onOpenCourse={(courseId) => navigation.navigate('CoursePlayer', { courseId })}
    />
  );
}

function CoursePlayerRoute({ navigation, route }: any) {
  return <CoursePlayerScreen courseId={route.params.courseId} onBack={() => navigation.goBack()} />;
}

function TutorialsRoute({ navigation }: any) {
  return <TutorialsScreen onBack={() => navigation.goBack()} />;
}

function NotificationsRoute({ navigation }: any) {
  return <NotificationsScreen onBack={() => navigation.goBack()} />;
}

function SettingsRoute({ navigation }: any) {
  return <SettingsScreen onBack={() => navigation.goBack()} />;
}

// Dashboard, Attendance, JobTools, Earnings, and Profile are siblings
// switched with no transition (an instant-swap approximation of tab
// behavior — design spec §3, same pattern established since phase 3b).
// Every other screen is a genuine drill-down push with a slide
// transition and no tab bar.
function EmployeeNavigator() {
  return (
    <EmployeeStack.Navigator screenOptions={{ headerShown: false }}>
      <EmployeeStack.Screen name="Dashboard" component={EmployeeDashboardRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Attendance" component={AttendanceRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="JobTools" component={JobToolsRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Earnings" component={EarningsRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Profile" component={ProfileRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="TaskDetail" component={TaskDetailRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="LeaveForm" component={LeaveFormRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Estimator" component={EstimatorRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="DeviceFollowUp" component={DeviceFollowUpRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="DeviceDetail" component={DeviceDetailRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="EodReport" component={EodReportRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Leaderboard" component={LeaderboardRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="TrainingCourses" component={TrainingCoursesRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="CoursePlayer" component={CoursePlayerRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Tutorials" component={TutorialsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Notifications" component={NotificationsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Settings" component={SettingsRoute} options={{ animation: 'slide_from_right' }} />
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
Expected: no errors — this was the last file with outstanding changes.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): wire Profile and its sub-screens into the employee stack"
```

---

### Task 17: Manual on-device + server verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm zero type errors project-wide**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Restart the local server so it picks up the new route**

The `GET /api/leaderboard` route from Task 1 needs a running server restart — if the dev server was already running before this plan started, stop and restart it (however this project normally runs its Node server locally).

- [ ] **Step 3: Start the mobile dev server and open on a real device**

Run from `mobile/`: `npx expo start`, then scan the QR code with Expo Go.

- [ ] **Step 4: Walk the flow with a real employee account**

- Tab bar now shows exactly **Dashboard, Attendance, Job Tools, Earnings, Profile** — no "More" tab anywhere, and switching between any of the five is instant.
- **Job Tools** now has a 4th, greyed-out "Job Cards — Coming soon" row that doesn't respond to taps.
- **Profile**: avatar initials, name, email, then Leaderboard/Training Courses/Tutorials/Notifications/Settings rows, then a red Log Out row that actually signs out.
- **Leaderboard**: loads real ranked data for the current month (or "No verified jobs yet this month" if there are none) — confirm this only works after the server restart from Step 2.
- **Training Courses**: shows real assigned courses with a completion ring; opening one shows real lessons — tapping "Mark done" on an incomplete lesson actually persists (pull to refresh, or leave and reopen the course, to confirm it stuck).
- **Tutorials**: shows real training items; tapping one opens it in the browser/video app, not an in-app player.
- **Notifications**: shows real notifications for this account; tapping an unread one marks it read (the highlighted border disappears).
- **Settings**: toggling Dark Mode actually flips the whole app's theme in real time, and it persists across an app restart.

- [ ] **Step 5: Report back**

If everything matches, Phase 3 (all of the Technician app's screens) is complete. If something's off, note which screen and what's wrong.
