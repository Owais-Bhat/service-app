# NEST Earnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Earnings tab (Cash, Collections, Salary) as the employee tab set's fifth real tab — per `docs/superpowers/specs/2026-08-17-nest-earnings.md`.

**Architecture:** One new API module (`earnings.ts`, reading `inquiries`' real billing columns) plus one new screen (`EarningsScreen`). Salary math reuses phase 3b's `attendance.ts` functions (`fetchAttendanceHistory`, `fetchLeaveRequests`) directly — no new attendance/leave API needed.

**Tech Stack:** No new dependencies.

**Verification approach:** `npx tsc --noEmit` after every step. The on-device check needs a real employee account with at least one paid-cash inquiry to see non-empty Cash/Collections data, though Salary will show real numbers regardless.

---

### Task 1: Type `salary` on `AuthUser`

**Files:**
- Modify: `mobile/src/api/auth.ts`

- [ ] **Step 1: Add the field**

The server already returns this (`SELECT * FROM profiles` on both signin and `/auth/me`) — the type just under-declares it.

```ts
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  can_add_service: boolean | number;
  allowed_tabs: string | null;
  worker_type: WorkerType;
  installations_enabled: boolean | number;
  salary: string | number;
}
```

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/auth.ts
git commit -m "feat(mobile): type salary on AuthUser"
```

---

### Task 2: `earnings.ts` API module

**Files:**
- Create: `mobile/src/api/earnings.ts`

- [ ] **Step 1: Write the file**

```ts
import { dataGet } from './client';

export interface CashInquiry {
  id: string;
  ticket_no: string;
  full_name: string;
  bill_amount: string | null;
  bill_total: string | null;
  payment_status: string;
  payment_method: string | null;
  cash_collected_at: string | null;
  cash_submitted_at: string | null;
  created_at: string;
}

// Mirrors the server's own COALESCE(NULLIF(bill_total,0), bill_amount, 0)
// pattern (design spec §2).
export function cashAmount(row: CashInquiry): number {
  return Number(row.bill_total) || Number(row.bill_amount) || 0;
}

// The real source of "cash collected" data — see design spec §2:
// cash_collections/payments/bills are vestigial, never-created tables;
// billing actually lives on `inquiries`, scoped to this employee via
// assigned_employee_id.
export async function fetchCashInquiries(employeeId: string): Promise<CashInquiry[]> {
  const rows = await dataGet<CashInquiry[]>('inquiries', {
    select: 'id,ticket_no,full_name,bill_amount,bill_total,payment_status,payment_method,cash_collected_at,cash_submitted_at,created_at',
    eq: [`assigned_employee_id:${employeeId}`, `payment_status:paid`],
    order: 'cash_collected_at:desc',
  });
  // payment_method isn't a clean enum suitable for an exact server-side
  // filter — mirror the server's own case-insensitive "contains cash"
  // check client-side instead.
  return rows.filter((r) => (r.payment_method || '').toLowerCase().includes('cash') && r.cash_collected_at);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/earnings.ts
git commit -m "feat(mobile): add earnings API module reading real inquiries billing fields"
```

---

### Task 3: Give `EmployeeDashboardScreen` a fifth tab (Earnings)

**Files:**
- Modify: `mobile/src/screens/EmployeeDashboardScreen.tsx`

- [ ] **Step 1: Update `EMPLOYEE_TABS`, `Props`, and the tab bar handler**

```tsx
export const EMPLOYEE_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'jobtools', label: 'Job Tools' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'more', label: 'More' },
];
```

```tsx
interface Props {
  onOpenTask: (ticketId: string) => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
  onGoEarnings: () => void;
}
```

```tsx
export default function EmployeeDashboardScreen({ onOpenTask, onGoAttendance, onGoJobTools, onGoEarnings }: Props) {
```

```tsx
        onSelect={(key) => {
          if (key === 'more') setMoreVisible(true);
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'earnings') onGoEarnings();
          else setMoreVisible(false);
        }}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: an error in `RootNavigator.tsx` — `EmployeeDashboardRoute` doesn't pass `onGoEarnings` yet. Expected until Task 7 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EmployeeDashboardScreen.tsx
git commit -m "feat(mobile): add Earnings as EmployeeDashboardScreen's fifth tab"
```

---

### Task 4: Give `AttendanceScreen` the same fifth tab

**Files:**
- Modify: `mobile/src/screens/AttendanceScreen.tsx`

- [ ] **Step 1: Update `Props` and the tab bar handler**

```tsx
interface Props {
  onGoDashboard: () => void;
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onOpenLeaveForm: () => void;
}
```

```tsx
export default function AttendanceScreen({ onGoDashboard, onGoJobTools, onGoEarnings, onOpenLeaveForm }: Props) {
```

```tsx
        onSelect={(key) => {
          if (key === 'more') setMoreVisible(true);
          else if (key === 'dashboard') onGoDashboard();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'earnings') onGoEarnings();
          else setMoreVisible(false);
        }}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: an error in `RootNavigator.tsx` — `AttendanceRoute` doesn't pass `onGoEarnings` yet. Expected until Task 7 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/AttendanceScreen.tsx
git commit -m "feat(mobile): add Earnings navigation to AttendanceScreen's tab bar"
```

---

### Task 5: Give `JobToolsScreen` the same fifth tab

**Files:**
- Modify: `mobile/src/screens/JobToolsScreen.tsx`

- [ ] **Step 1: Update `Props` and the tab bar handler**

```tsx
interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onGoEarnings: () => void;
  onOpenEstimator: () => void;
  onOpenDeviceFollowUp: () => void;
  onOpenEodReport: () => void;
}
```

```tsx
export default function JobToolsScreen({
  onGoDashboard,
  onGoAttendance,
  onGoEarnings,
  onOpenEstimator,
  onOpenDeviceFollowUp,
  onOpenEodReport,
}: Props) {
```

```tsx
        onSelect={(key) => {
          if (key === 'more') setMoreVisible(true);
          else if (key === 'dashboard') onGoDashboard();
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'earnings') onGoEarnings();
          else setMoreVisible(false);
        }}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: an error in `RootNavigator.tsx` — `JobToolsRoute` doesn't pass `onGoEarnings` yet. Expected until Task 7 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/JobToolsScreen.tsx
git commit -m "feat(mobile): add Earnings navigation to JobToolsScreen's tab bar"
```

---

### Task 6: `EarningsScreen`

**Files:**
- Create: `mobile/src/screens/EarningsScreen.tsx`

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
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchAttendanceHistory, fetchLeaveRequests } from '../api/attendance';
import { fetchCashInquiries, cashAmount, CashInquiry } from '../api/earnings';

interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
}

type Segment = 'cash' | 'collections' | 'salary';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'cash', label: 'My Cash' },
  { key: 'collections', label: 'Collections' },
  { key: 'salary', label: 'Salary' },
];

export default function EarningsScreen({ onGoDashboard, onGoAttendance, onGoJobTools }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [segment, setSegment] = useState<Segment>('cash');
  const [cashRows, setCashRows] = useState<CashInquiry[]>([]);
  const [daysPresent, setDaysPresent] = useState(0);
  const [leaveDays, setLeaveDays] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

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
        activeKey={moreVisible ? 'more' : 'earnings'}
        onSelect={(key) => {
          if (key === 'more') setMoreVisible(true);
          else if (key === 'dashboard') onGoDashboard();
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'jobtools') onGoJobTools();
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
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EarningsScreen.tsx
git commit -m "feat(mobile): add EarningsScreen with real cash/collections/salary data"
```

---

### Task 7: Wire `Earnings` into the employee stack

**Files:**
- Modify: `mobile/src/navigation/RootNavigator.tsx`

- [ ] **Step 1: Add the import, param type, route wrapper, and screen registration**

Add the import:

```tsx
import EarningsScreen from '../screens/EarningsScreen';
```

Add `Earnings: undefined;` to `EmployeeStackParams`:

```tsx
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
};
```

Update `EmployeeDashboardRoute`, `AttendanceRoute`, and `JobToolsRoute` to each pass the new prop:

```tsx
function EmployeeDashboardRoute({ navigation }: any) {
  return (
    <EmployeeDashboardScreen
      onOpenTask={(ticketId) => navigation.navigate('TaskDetail', { ticketId })}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoEarnings={() => navigation.navigate('Earnings')}
    />
  );
}
```

```tsx
function AttendanceRoute({ navigation }: any) {
  return (
    <AttendanceScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onOpenLeaveForm={() => navigation.navigate('LeaveForm')}
    />
  );
}
```

```tsx
function JobToolsRoute({ navigation }: any) {
  return (
    <JobToolsScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onOpenEstimator={() => navigation.navigate('Estimator')}
      onOpenDeviceFollowUp={() => navigation.navigate('DeviceFollowUp')}
      onOpenEodReport={() => navigation.navigate('EodReport')}
    />
  );
}
```

Add the new route wrapper (place it near the other sibling-tab wrappers):

```tsx
function EarningsRoute({ navigation }: any) {
  return (
    <EarningsScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoJobTools={() => navigation.navigate('JobTools')}
    />
  );
}
```

Add the screen registration inside `EmployeeNavigator`, alongside the other `animation: 'none'` siblings:

```tsx
      <EmployeeStack.Screen name="Earnings" component={EarningsRoute} options={{ animation: 'none' }} />
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — this was the last file with outstanding changes.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): wire Earnings screen into the employee stack"
```

---

### Task 8: Manual on-device verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm zero type errors project-wide**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Start the dev server and open on a real device**

Run from `mobile/`: `npx expo start`, then scan the QR code with Expo Go.

- [ ] **Step 3: Walk the flow with a real employee account**

- Tab bar now shows **Dashboard, Attendance, Job Tools, Earnings, More** — tapping any of the first four swaps instantly.
- **My Cash**: shows a real "Pending to deposit" total and a list of unsubmitted cash payments for this employee (or "Nothing pending" if there are none/all submitted).
- **Collections**: shows the full cash-collection history with a real total, each row marked Submitted/Pending.
- **Salary**: shows a real prorated estimate plus Monthly/Days present/Leave taken/Payable days — cross-check "Days present" against what Attendance's own history shows for this month, and "Leave taken" against approved requests in Attendance's Leave segment.

- [ ] **Step 4: Report back**

If everything matches, phase 3d is done. If something's off, note which segment and what's wrong.
