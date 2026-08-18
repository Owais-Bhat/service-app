# NEST Job Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Job Tools hub (Estimator, Device Follow-up, EOD Report) as the employee tab set's fourth real tab — per `docs/superpowers/specs/2026-08-17-nest-job-tools.md`.

**Architecture:** Three new API modules (`pricing.ts`, `deviceTracking.ts`, `eod.ts`) and five new screens (`JobToolsScreen` hub, `EstimatorScreen`, `DeviceFollowUpScreen`, `DeviceDetailScreen`, `EodReportScreen`), added as siblings/drill-downs on the existing `EmployeeStack`. `EmployeeDashboardScreen` and `AttendanceScreen` each gain a fourth tab-bar entry and a way to navigate to it.

**Tech Stack:** No new dependencies.

**Verification approach:** `npx tsc --noEmit` after every step. The on-device check needs a real employee account with at least one device-tracking-relevant inquiry to exercise the taken/followup/return actions for real.

---

### Task 1: `pricing.ts` API module

**Files:**
- Create: `mobile/src/api/pricing.ts`

- [ ] **Step 1: Write the file**

```ts
import { dataGet } from './client';

export interface ServicePricingItem {
  id: string;
  name: string;
  category: string | null;
  sub_category: string | null;
  sub_sub_category: string | null;
  cost: string; // DECIMAL column — MySQL returns this as a string, coerce with Number() at use sites
  description: string | null;
}

export async function fetchServicePricing(): Promise<ServicePricingItem[]> {
  return dataGet<ServicePricingItem[]>('service_pricing', {
    select: 'id,name,category,sub_category,sub_sub_category,cost,description',
    order: 'category:asc',
  });
}
```

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/pricing.ts
git commit -m "feat(mobile): add pricing API module for the Estimator"
```

---

### Task 2: `deviceTracking.ts` API module

**Files:**
- Create: `mobile/src/api/deviceTracking.ts`

- [ ] **Step 1: Write the file**

These call the bespoke `/api/device-tracking/*` endpoints directly via `api.get`/`api.post` — not the generic `/api/data/:table` layer — matching exactly what the web app already does (design spec §2).

```ts
import { api } from './client';

export interface DeviceTakenLog {
  id: string;
  inquiry_id: string;
  employee_id: string;
  device_description: string | null;
  device_image_url: string | null;
  taken_at: string;
  profiles?: { full_name: string };
}

export interface DeviceReturnLog {
  id: string;
  inquiry_id: string;
  device_condition: string;
  return_notes: string | null;
  return_image_url: string | null;
  returned_at: string;
}

export interface DeviceFollowUpLog {
  id: string;
  inquiry_id: string;
  status: string;
  notes: string | null;
  updated_by: string;
  created_at: string;
  profiles?: { full_name: string };
}

export interface EmployeeDevice {
  id: string;
  ticket_no: string;
  full_name: string;
  phone: string;
  service_item: string;
  address: string | null;
  company_name: string | null;
  device_type: string | null;
  device_serial_no: string | null;
  preferred_time: string | null;
  bill_no: string | null;
  device_status: string | null;
  follow_up_status: string | null;
  device_service_enabled: number | boolean | null;
  status: string;
  created_at: string;
  device_taken_logs: DeviceTakenLog | null;
  device_return_logs: DeviceReturnLog | null;
}

export interface DeviceStatusDetail {
  inquiry: { device_status: string | null; follow_up_status: string | null };
  device_taken_logs: DeviceTakenLog | null;
  device_return_logs: DeviceReturnLog | null;
  device_follow_up_logs: DeviceFollowUpLog[];
}

export async function fetchEmployeeDevices(employeeId: string): Promise<EmployeeDevice[]> {
  return api.get<EmployeeDevice[]>(`/device-tracking/employee/${employeeId}`);
}

export async function fetchDeviceStatus(inquiryId: string): Promise<DeviceStatusDetail> {
  return api.get<DeviceStatusDetail>(`/device-tracking/status/${inquiryId}`);
}

export async function markDeviceTaken(inquiryId: string, description: string): Promise<void> {
  await api.post(`/device-tracking/taken`, { inquiry_id: inquiryId, description: description || null });
}

export async function logFollowUp(inquiryId: string, status: string, notes: string): Promise<void> {
  await api.post(`/device-tracking/followup`, { inquiry_id: inquiryId, status, notes: notes || null });
}

export async function markDeviceReturned(inquiryId: string, condition: string, notes: string): Promise<void> {
  await api.post(`/device-tracking/return`, {
    inquiry_id: inquiryId,
    device_condition: condition,
    return_notes: notes || null,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/deviceTracking.ts
git commit -m "feat(mobile): add deviceTracking API module (taken/followup/return)"
```

---

### Task 3: `eod.ts` API module

**Files:**
- Create: `mobile/src/api/eod.ts`

- [ ] **Step 1: Write the file**

```ts
import { dataGet, dataPost } from './client';

export interface EodReport {
  id: string;
  employee_id: string;
  content: string;
  date: string;
}

export async function fetchEodReports(employeeId: string): Promise<EodReport[]> {
  return dataGet<EodReport[]>('eod_reports', {
    select: '*',
    eq: [`employee_id:${employeeId}`],
    order: 'date:desc',
  });
}

export async function submitEodReport(employeeId: string, content: string): Promise<EodReport> {
  return dataPost<EodReport>('eod_reports', {
    employee_id: employeeId,
    content,
    date: new Date().toLocaleDateString('en-CA'),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/eod.ts
git commit -m "feat(mobile): add eod API module"
```

---

### Task 4: Give `EmployeeDashboardScreen` a fourth tab (Job Tools)

**Files:**
- Modify: `mobile/src/screens/EmployeeDashboardScreen.tsx`

- [ ] **Step 1: Update `EMPLOYEE_TABS`, the `Props` interface, and the tab bar handler**

Change the `EMPLOYEE_TABS` export:

```tsx
export const EMPLOYEE_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'jobtools', label: 'Job Tools' },
  { key: 'more', label: 'More' },
];
```

Change the `Props` interface:

```tsx
interface Props {
  onOpenTask: (ticketId: string) => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
}
```

Change the component signature and the `GlassTabBar`'s `onSelect`:

```tsx
export default function EmployeeDashboardScreen({ onOpenTask, onGoAttendance, onGoJobTools }: Props) {
```

```tsx
      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey={moreVisible ? 'more' : 'dashboard'}
        onSelect={(key) => {
          if (key === 'more') setMoreVisible(true);
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'jobtools') onGoJobTools();
          else setMoreVisible(false);
        }}
      />
```

Everything else in the file (imports, state, `load`, the tickets list, styles) is unchanged.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: an error in `RootNavigator.tsx` — `EmployeeDashboardRoute` doesn't pass `onGoJobTools` yet. Expected until Task 11 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EmployeeDashboardScreen.tsx
git commit -m "feat(mobile): add Job Tools as EmployeeDashboardScreen's fourth tab"
```

---

### Task 5: Give `AttendanceScreen` the same fourth tab

**Files:**
- Modify: `mobile/src/screens/AttendanceScreen.tsx`

- [ ] **Step 1: Update the `Props` interface and the tab bar handler**

Change the `Props` interface:

```tsx
interface Props {
  onGoDashboard: () => void;
  onGoJobTools: () => void;
  onOpenLeaveForm: () => void;
}
```

Change the component signature:

```tsx
export default function AttendanceScreen({ onGoDashboard, onGoJobTools, onOpenLeaveForm }: Props) {
```

Change the `GlassTabBar`'s `onSelect`:

```tsx
      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey={moreVisible ? 'more' : 'attendance'}
        onSelect={(key) => {
          if (key === 'more') setMoreVisible(true);
          else if (key === 'dashboard') onGoDashboard();
          else if (key === 'jobtools') onGoJobTools();
          else setMoreVisible(false);
        }}
      />
```

(`EMPLOYEE_TABS` is imported from `EmployeeDashboardScreen` already, so it automatically picks up the fourth entry from Task 4 — no import change needed here.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: an error in `RootNavigator.tsx` — `AttendanceRoute` doesn't pass `onGoJobTools` yet. Expected until Task 11 lands.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/AttendanceScreen.tsx
git commit -m "feat(mobile): add Job Tools navigation to AttendanceScreen's tab bar"
```

---

### Task 6: `JobToolsScreen` (hub)

**Files:**
- Create: `mobile/src/screens/JobToolsScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import MoreSheet from '../components/MoreSheet';
import { EMPLOYEE_TABS, EMPLOYEE_MORE_SECTIONS } from './EmployeeDashboardScreen';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';

interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onOpenEstimator: () => void;
  onOpenDeviceFollowUp: () => void;
  onOpenEodReport: () => void;
}

const TOOLS = [
  { key: 'estimator', label: 'Estimator', desc: 'Build an on-site quote', color: '#15a05a' },
  { key: 'devices', label: 'Device Follow-up', desc: 'Devices under service', color: '#0ea5a5' },
  { key: 'eod', label: 'EOD Report', desc: 'Submit end-of-day summary', color: '#6366f1' },
];

export default function JobToolsScreen({ onGoDashboard, onGoAttendance, onOpenEstimator, onOpenDeviceFollowUp, onOpenEodReport }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [moreVisible, setMoreVisible] = useState(false);

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
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey={moreVisible ? 'more' : 'jobtools'}
        onSelect={(key) => {
          if (key === 'more') setMoreVisible(true);
          else if (key === 'dashboard') onGoDashboard();
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
  title: { ...typography.title },
  caption: { ...typography.caption },
  pressed: { opacity: 0.7 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  toolIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toolDot: { width: 10, height: 10, borderRadius: 5 },
  toolInfo: { flex: 1, minWidth: 0 },
  toolLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15, marginBottom: spacing(0.5) },
  chevron: { fontSize: 20 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/JobToolsScreen.tsx
git commit -m "feat(mobile): add JobToolsScreen hub"
```

---

### Task 7: `EstimatorScreen`

**Files:**
- Create: `mobile/src/screens/EstimatorScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { fetchServicePricing, ServicePricingItem } from '../api/pricing';

interface Props {
  onBack: () => void;
}

// Ephemeral by design (design spec §2) — NEST's own mockup treats "add" as
// a no-op, and there's no quote/estimate table on the backend to persist
// to. This is a live total to show a customer, not a saved document.
export default function EstimatorScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [items, setItems] = useState<ServicePricingItem[]>([]);
  const [selected, setSelected] = useState<ServicePricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchServicePricing();
        setItems(rows);
      } catch {
        setError('Could not load pricing — check your connection');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addItem = (item: ServicePricingItem) => setSelected((prev) => [...prev, item]);
  const removeAt = (index: number) => setSelected((prev) => prev.filter((_, i) => i !== index));
  const total = selected.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(20) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Estimator</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>Tap a service to add it to the quote — nothing is saved.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {selected.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Your Quote</Text>
            {selected.map((item, i) => (
              <Panel key={`${item.id}-${i}`} style={styles.quoteRow}>
                <Text style={[styles.itemName, { color: theme.text, flex: 1 }]} numberOfLines={1}>{item.sub_category || item.name}</Text>
                <Text style={[styles.quoteCost, { color: brand.primary }]}>₹{(Number(item.cost) || 0).toLocaleString('en-IN')}</Text>
                <Pressable onPress={() => removeAt(i)} hitSlop={8}>
                  <Text style={[styles.removeText, { color: theme.text3 }]}>✕</Text>
                </Pressable>
              </Panel>
            ))}
          </>
        ) : null}

        <Text style={[styles.sectionLabel, { color: theme.text3 }]}>All Services</Text>
        {loading ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>Loading pricing…</Text>
        ) : (
          items.map((item) => (
            <Pressable key={item.id} onPress={() => addItem(item)} style={({ pressed }) => [pressed && styles.pressed]}>
              <Panel style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: theme.text }]}>{item.sub_category || item.name}</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>
                    {[item.category, item.sub_sub_category].filter(Boolean).join(' · ')} · ₹{(Number(item.cost) || 0).toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.addButton}>
                  <Text style={styles.addButtonText}>+</Text>
                </View>
              </Panel>
            </Pressable>
          ))
        )}
      </ScrollView>

      {selected.length > 0 ? (
        <View style={[styles.totalBar, { backgroundColor: theme.bg, borderTopColor: theme.line }]}>
          <View>
            <Text style={[styles.caption, { color: theme.text3 }]}>{selected.length} item{selected.length === 1 ? '' : 's'}</Text>
            <Text style={[styles.totalValue, { color: brand.primary }]}>₹{total.toLocaleString('en-IN')}</Text>
          </View>
          <Pressable
            onPress={() => setSelected([])}
            style={({ pressed }) => [styles.clearButton, { borderColor: theme.line }, pressed && styles.pressed]}
          >
            <Text style={[styles.clearButtonText, { color: theme.text2 }]}>Clear</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  caption: { ...typography.caption },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: spacing(4), marginBottom: spacing(2.5) },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(2.5) },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  addButton: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(21,160,90,0.16)', alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: brand.primary, fontFamily: 'Manrope_700Bold', fontSize: 16 },
  pressed: { opacity: 0.7 },
  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginBottom: spacing(2) },
  quoteCost: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 13 },
  removeText: { fontSize: 16, paddingHorizontal: spacing(1) },
  totalBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing(4),
    borderTopWidth: 1,
  },
  totalValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20 },
  clearButton: { paddingHorizontal: spacing(4), paddingVertical: spacing(2.5), borderRadius: 12, borderWidth: 1 },
  clearButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EstimatorScreen.tsx
git commit -m "feat(mobile): add EstimatorScreen with real pricing catalog"
```

---

### Task 8: `DeviceFollowUpScreen` (list)

**Files:**
- Create: `mobile/src/screens/DeviceFollowUpScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchEmployeeDevices, EmployeeDevice } from '../api/deviceTracking';

interface Props {
  onBack: () => void;
  onOpenDevice: (inquiryId: string) => void;
}

const DEVICE_STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  taken: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)', label: 'Taken' },
  returned: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)', label: 'Returned' },
};
const PENDING_STATUS_STYLE = { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'Pending' };

// Filters to inquiries actually relevant to device tracking (design spec
// §2) — the underlying endpoint returns every inquiry assigned to this
// employee, not just device-related ones.
export default function DeviceFollowUpScreen({ onBack, onOpenDevice }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [devices, setDevices] = useState<EmployeeDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await fetchEmployeeDevices(user.id);
      setDevices(rows.filter((d) => d.device_service_enabled || d.device_status));
      setError(null);
    } catch {
      setError('Could not load devices — pull to retry');
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Device Follow-up</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>Devices under service</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {devices.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No devices under service right now.</Text>
        ) : (
          devices.map((d) => {
            const s = (d.device_status && DEVICE_STATUS_STYLE[d.device_status]) || PENDING_STATUS_STYLE;
            return (
              <Pressable key={d.id} onPress={() => onOpenDevice(d.id)} style={({ pressed }) => [pressed && styles.pressed]}>
                <Panel style={styles.deviceRow}>
                  <View style={styles.deviceInfo}>
                    <Text style={[styles.deviceService, { color: theme.text }]} numberOfLines={1}>{d.service_item}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>{d.full_name} · {d.ticket_no}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
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
  title: { ...typography.title },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  pressed: { opacity: 0.7 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  deviceInfo: { flex: 1, minWidth: 0 },
  deviceService: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  statusBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8 },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/DeviceFollowUpScreen.tsx
git commit -m "feat(mobile): add DeviceFollowUpScreen list"
```

---

### Task 9: `DeviceDetailScreen`

**Files:**
- Create: `mobile/src/screens/DeviceDetailScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { ApiError } from '../api/client';
import { fetchDeviceStatus, markDeviceTaken, logFollowUp, markDeviceReturned, DeviceStatusDetail } from '../api/deviceTracking';

interface Props {
  inquiryId: string;
  onBack: () => void;
}

// A small UI convenience, not a schema-enforced enum — the server accepts
// any string for follow-up status (design spec §2).
const FOLLOWUP_OPTIONS = [
  { key: 'diagnosing', label: 'Diagnosing' },
  { key: 'awaiting_parts', label: 'Awaiting Parts' },
  { key: 'in_repair', label: 'In Repair' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup' },
];

export default function DeviceDetailScreen({ inquiryId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [detail, setDetail] = useState<DeviceStatusDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [takenNote, setTakenNote] = useState('');
  const [followupStatus, setFollowupStatus] = useState(FOLLOWUP_OPTIONS[0].key);
  const [followupNote, setFollowupNote] = useState('');
  const [returnCondition, setReturnCondition] = useState('good');
  const [returnNote, setReturnNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchDeviceStatus(inquiryId);
      setDetail(d);
      setError(null);
    } catch {
      setError('Could not load device status — check your connection');
    } finally {
      setLoading(false);
    }
  }, [inquiryId]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (action: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save — check your connection');
    } finally {
      setSubmitting(false);
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

  const taken = detail?.device_taken_logs;
  const returned = detail?.device_return_logs;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Device Detail</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!taken ? (
          <GlassCard style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Mark Device Taken</Text>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Device description (optional)"
              placeholderTextColor={theme.text3}
              value={takenNote}
              onChangeText={setTakenNote}
            />
            <Pressable
              onPress={() => runAction(() => markDeviceTaken(inquiryId, takenNote.trim()))}
              disabled={submitting}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed, submitting && styles.disabled]}
            >
              <Text style={styles.actionButtonText}>Mark Device Taken</Text>
            </Pressable>
          </GlassCard>
        ) : (
          <>
            <Panel style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Device Taken</Text>
              <Text style={[styles.body, { color: theme.text }]}>By {taken.profiles?.full_name || 'you'}</Text>
              <Text style={[styles.caption, { color: theme.text3 }]}>{new Date(taken.taken_at).toLocaleString('en-IN')}</Text>
              {taken.device_description ? (
                <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>{taken.device_description}</Text>
              ) : null}
            </Panel>

            {!returned ? (
              <GlassCard style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Log Follow-up Update</Text>
                <View style={styles.chipsRow}>
                  {FOLLOWUP_OPTIONS.map((opt) => {
                    const active = followupStatus === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => setFollowupStatus(opt.key)}
                        style={[styles.chip, { borderColor: theme.line, backgroundColor: active ? brand.primary : theme.panel2 }]}
                      >
                        <Text style={[styles.chipText, { color: active ? '#ffffff' : theme.text2 }]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  style={[styles.input, { color: theme.text, marginTop: spacing(3) }]}
                  placeholder="Notes (optional)"
                  placeholderTextColor={theme.text3}
                  value={followupNote}
                  onChangeText={setFollowupNote}
                />
                <Pressable
                  onPress={() => runAction(() => logFollowUp(inquiryId, followupStatus, followupNote.trim()))}
                  disabled={submitting}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.pressed, submitting && styles.disabled]}
                >
                  <Text style={styles.actionButtonText}>Log Update</Text>
                </Pressable>
              </GlassCard>
            ) : null}

            {detail && detail.device_follow_up_logs.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Follow-up History</Text>
                {detail.device_follow_up_logs.map((f) => (
                  <Panel key={f.id} style={styles.historyRow}>
                    <Text style={[styles.historyStatus, { color: brand.primary }]}>{f.status.replace(/_/g, ' ').toUpperCase()}</Text>
                    {f.notes ? <Text style={[styles.body, { color: theme.text2 }]}>{f.notes}</Text> : null}
                    <Text style={[styles.caption, { color: theme.text3 }]}>
                      {f.profiles?.full_name || 'Someone'} · {new Date(f.created_at).toLocaleString('en-IN')}
                    </Text>
                  </Panel>
                ))}
              </View>
            ) : null}

            {!returned ? (
              <GlassCard style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Mark Returned</Text>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Condition (e.g. good)"
                  placeholderTextColor={theme.text3}
                  value={returnCondition}
                  onChangeText={setReturnCondition}
                />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Notes (optional)"
                  placeholderTextColor={theme.text3}
                  value={returnNote}
                  onChangeText={setReturnNote}
                />
                <Pressable
                  onPress={() => runAction(() => markDeviceReturned(inquiryId, returnCondition.trim() || 'good', returnNote.trim()))}
                  disabled={submitting}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.pressed, submitting && styles.disabled]}
                >
                  <Text style={styles.actionButtonText}>Mark Returned</Text>
                </Pressable>
              </GlassCard>
            ) : (
              <Panel style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Returned</Text>
                <Text style={[styles.body, { color: theme.text }]}>Condition: {returned.device_condition}</Text>
                <Text style={[styles.caption, { color: theme.text3 }]}>{new Date(returned.returned_at).toLocaleString('en-IN')}</Text>
                {returned.return_notes ? (
                  <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>{returned.return_notes}</Text>
                ) : null}
              </Panel>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title, marginBottom: spacing(4) },
  body: { ...typography.body },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  section: { marginBottom: spacing(4) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  actionButton: { padding: spacing(3.5), borderRadius: radius.md, backgroundColor: brand.primary, alignItems: 'center' },
  actionButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#ffffff' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { paddingHorizontal: spacing(3), paddingVertical: spacing(2), borderRadius: 10, borderWidth: 1 },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  historyRow: { marginBottom: spacing(2) },
  historyStatus: { fontFamily: 'Manrope_700Bold', fontSize: 12, marginBottom: spacing(0.5) },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/DeviceDetailScreen.tsx
git commit -m "feat(mobile): add DeviceDetailScreen with taken/followup/return actions"
```

---

### Task 10: `EodReportScreen`

**Files:**
- Create: `mobile/src/screens/EodReportScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { ApiError } from '../api/client';
import { fetchEodReports, submitEodReport, EodReport } from '../api/eod';

interface Props {
  onBack: () => void;
}

export default function EodReportScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [reports, setReports] = useState<EodReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await fetchEodReports(user.id);
      setReports(rows);
    } catch {
      setError('Could not load past reports');
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!user) return;
    if (!content.trim()) {
      setError('Describe what you completed today');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await submitEodReport(user.id, content.trim());
      setContent('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit — check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>EOD Report</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>Submit end-of-day summary</Text>

        <GlassCard>
          <TextInput
            style={[styles.input, styles.textArea, { color: theme.text }]}
            placeholder="What did you complete today?"
            placeholderTextColor={theme.text3}
            value={content}
            onChangeText={setContent}
            multiline
          />
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <GlowButton label="Submit EOD Report" onPress={handleSubmit} loading={loading} />

        <Text style={[styles.sectionLabel, { color: theme.text3, marginTop: spacing(5) }]}>Recent Reports</Text>
        {reports.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No reports yet.</Text>
        ) : (
          reports.map((r) => (
            <Panel key={r.id} style={styles.reportRow}>
              <Text style={[styles.reportDate, { color: brand.primary }]}>{r.date}</Text>
              <Text style={[styles.body, { color: theme.text2, marginTop: spacing(1) }]}>{r.content}</Text>
            </Panel>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  body: { ...typography.body },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  input: { ...typography.body, borderRadius: 16, paddingHorizontal: spacing(4), paddingVertical: spacing(3) },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  reportRow: { marginBottom: spacing(2.5) },
  reportDate: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EodReportScreen.tsx
git commit -m "feat(mobile): add EodReportScreen"
```

---

### Task 11: Wire Job Tools screens into the employee stack

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

// Dashboard, Attendance, and JobTools are siblings switched with no
// transition (an instant-swap approximation of tab behavior — design
// spec §4, same pattern phase 3b established). Every other screen is a
// genuine drill-down push with a slide transition and no tab bar.
function EmployeeNavigator() {
  return (
    <EmployeeStack.Navigator screenOptions={{ headerShown: false }}>
      <EmployeeStack.Screen name="Dashboard" component={EmployeeDashboardRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Attendance" component={AttendanceRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="JobTools" component={JobToolsRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="TaskDetail" component={TaskDetailRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="LeaveForm" component={LeaveFormRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Estimator" component={EstimatorRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="DeviceFollowUp" component={DeviceFollowUpRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="DeviceDetail" component={DeviceDetailRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="EodReport" component={EodReportRoute} options={{ animation: 'slide_from_right' }} />
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
git commit -m "feat(mobile): wire Job Tools screens into the employee stack"
```

---

### Task 12: Manual on-device verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm zero type errors project-wide**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Start the dev server and open on a real device**

Run from `mobile/`: `npx expo start`, then scan the QR code with Expo Go.

- [ ] **Step 3: Walk the flow with a real employee account**

- Tab bar now shows **Dashboard, Attendance, Job Tools, More** — tapping between the first three swaps instantly.
- **Job Tools hub**: three rows (Estimator, Device Follow-up, EOD Report), each with a distinct colored icon.
- **Estimator**: real pricing catalog loads; tapping an item adds it to "Your Quote" at the top with a live total bar pinned to the bottom; tapping ✕ removes an item; "Clear" empties the quote. Leaving and reopening the screen resets it (nothing persisted, by design).
- **Device Follow-up**: if this employee has any device-tracking-relevant inquiries, they appear with a Pending/Taken/Returned badge; otherwise "No devices under service right now."
- **Device Detail** (open one, or use a test inquiry with `device_service_enabled`): "Mark Device Taken" works for real — after tapping it, the screen updates to show the taken log and reveals the follow-up/return sections. Log a follow-up update (pick a status chip, add a note) — it appears in "Follow-up History." "Mark Returned" works for real and the screen switches to the returned summary.
- **EOD Report**: submitting a summary clears the field and the new report appears in "Recent Reports" immediately.

- [ ] **Step 4: Report back**

If everything matches, phase 3c is done. If something's off, note which screen and what's wrong.
