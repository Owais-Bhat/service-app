# Mobile Admin: Service Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give mobile admins a real "Service Requests" screen — view every customer inquiry, filter/search it the same way web does, open one, and assign/reassign an employee to it.

**Architecture:** Two new mobile files (a list screen, a detail/assign modal) plus a thin API wrapper, following the exact structural precedent of `ManageTasksScreen.tsx`/`TaskStatusModal.tsx` (the employee-side equivalent of this same job). No new backend endpoints — everything reuses `/api/data/inquiries` and the existing `/api/admin/inquiries/:id/manage-context` route. Reached via a new entry in `AdminDashboardScreen`'s "More" sheet, registered as a real stack route in `AdminNavigator` — the same wiring pattern already used for Notifications and Live Locations (not a new tab-bar entry; see "Deviation from spec" note below).

**Tech Stack:** Expo/React Native (TypeScript), existing mobile design system (`GlassCard`, `GlassSurface`, `PressScale`, `AppHeaderBar`, `theme/tokens.ts`).

**Deviation from spec:** `docs/superpowers/specs/2026-09-05-mobile-admin-service-requests.md` §5 proposed adding a 3rd tab to `AdminDashboardScreen`'s tab bar. While reading the actual navigation code, the established pattern for every admin section built so far (Notifications, Live Locations) is: a "More" sheet entry + a real `AdminStack.Screen` route, not a tab-bar entry. This plan follows that proven pattern instead, for consistency and lower risk. Functionally identical outcome (a reachable, real screen); only the entry point differs.

---

### Task 1: Admin inquiries API layer

**Files:**
- Create: `mobile/src/api/adminInquiries.ts`

- [ ] **Step 1: Create the file with types, fetch functions, assignment function, and ported SLA helpers**

```typescript
import { api, dataGet, dataPatch } from './client';

export interface AdminInquiryRow {
  id: string;
  ticket_no: string | null;
  full_name: string;
  phone: string | null;
  service_item: string | null;
  status: string;
  payment_status: string | null;
  bill_amount: number | string | null;
  bill_total: number | string | null;
  assigned_employee_id: string | null;
  assignment_status: string | null;
  company_name: string | null;
  reopened: number | null;
  created_at: string;
}

export async function fetchInquiries(): Promise<AdminInquiryRow[]> {
  return dataGet<AdminInquiryRow[]>('inquiries', {
    select: '*',
    order: 'created_at:desc',
  });
}

export interface ManageContextEmployee {
  id: string;
  full_name: string;
  clockedIn: boolean;
  restricted: boolean;
  always_assign: boolean;
}

export interface ManageContextInquiry {
  id: string;
  ticket_no: string | null;
  full_name: string;
  phone: string | null;
  service_item: string | null;
  description: string | null;
  location: string | null;
  preferred_time: string | null;
  status: string;
  assignment_status: string | null;
  decline_reason: string | null;
  assigned_employee_id: string | null;
  assigned_at: string | null;
  company_name: string | null;
  customer_lat: number | string | null;
  customer_lng: number | string | null;
  device_type: string | null;
  device_serial_no: string | null;
  extra_cost: number | string | null;
  extra_cost_reason: string | null;
  bill_total: number | string | null;
  bill_amount: number | string | null;
  payment_status: string | null;
  feedback_rating: number | null;
  feedback_comment: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ManageContext {
  inquiry: ManageContextInquiry;
  employees: ManageContextEmployee[];
}

export async function fetchInquiryManageContext(id: string): Promise<ManageContext> {
  return api.get<ManageContext>(`/admin/inquiries/${encodeURIComponent(id)}/manage-context`);
}

// Mirrors web's save-assignment payload (src/pages/admin.js's openInquiryDetail)
// minus the legacy `tickets` table insert — see design spec §2 for why that's
// safe to skip. The server's generic PATCH handler stamps `assigned_at`
// itself the moment assigned_employee_id changes (server/index.cjs).
export async function assignInquiryEmployee(inquiryId: string, employeeId: string | null): Promise<void> {
  await dataPatch('inquiries', `id:${inquiryId}`, {
    assigned_employee_id: employeeId,
    assignment_status: employeeId ? 'pending' : null,
    decline_reason: null,
  });
}

// --- SLA (ported from src/utils.js's calculateSLA/formatSLADeadline/formatTimeRemaining) ---
// Jammu & Kashmir working hours: 10:00-18:00, Sunday excluded. Same 12-hour
// default budget as web's admin detail modal.
export function calculateSlaDeadline(assignedAt: string, slaHours = 12): Date {
  const date = new Date(assignedAt);
  let hoursRemaining = slaHours;
  const startHour = 10;
  const endHour = 18;

  while (hoursRemaining > 0) {
    const curHour = date.getHours();
    const day = date.getDay();

    if (day === 0) {
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
      continue;
    }
    if (curHour < startHour) {
      date.setHours(startHour, 0, 0, 0);
      continue;
    }
    if (curHour >= endHour) {
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
      continue;
    }

    const endOfDay = new Date(date);
    endOfDay.setHours(endHour, 0, 0, 0);
    const workdayRemainingMs = endOfDay.getTime() - date.getTime();
    const workdayRemainingHours = workdayRemainingMs / (1000 * 60 * 60);

    if (hoursRemaining <= workdayRemainingHours) {
      date.setMilliseconds(date.getMilliseconds() + hoursRemaining * 60 * 60 * 1000);
      hoursRemaining = 0;
    } else {
      hoursRemaining -= workdayRemainingHours;
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
    }
  }
  return date;
}

export function formatSlaDeadlineLabel(deadline: Date): { label: string; isOverdue: boolean } {
  const isOverdue = deadline.getTime() < Date.now();
  const day = deadline.getDate();
  const dayName = deadline.toLocaleDateString('en-US', { weekday: 'long' });
  const time = deadline.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return { label: `${day} ${dayName} ${time}`, isOverdue };
}

export function formatTimeRemainingLabel(deadline: Date): { label: string; isOverdue: boolean } {
  const diff = deadline.getTime() - Date.now();
  if (diff <= 0) return { label: 'OVERDUE', isOverdue: true };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { label: `${hours}h ${mins}m left`, isOverdue: false };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit -p .`
Expected: no errors (this file has no consumers yet, so it should compile in isolation).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/adminInquiries.ts
git commit -m "feat(mobile): add admin inquiries API layer for Service Requests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Detail/assign modal

**Files:**
- Create: `mobile/src/components/AdminServiceRequestDetailModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import {
  fetchInquiryManageContext,
  assignInquiryEmployee,
  calculateSlaDeadline,
  formatSlaDeadlineLabel,
  formatTimeRemainingLabel,
  ManageContext,
  ManageContextEmployee,
} from '../api/adminInquiries';
import { ApiError } from '../api/client';

interface Props {
  inquiryId: string;
  onDismiss: () => void;
  onSaved: () => void;
}

const money = (n: number | string | null | undefined) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

function displayStatus(status: string): string {
  return status === 'closed' ? 'resolved' : status || 'open';
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function AdminServiceRequestDetailModal({ inquiryId, onDismiss, onSaved }: Props) {
  const { theme } = useTheme();
  const [context, setContext] = useState<ManageContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ctx = await fetchInquiryManageContext(inquiryId);
      setContext(ctx);
      setSelectedEmployeeId(ctx.inquiry.assigned_employee_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this service request');
    } finally {
      setLoading(false);
    }
  }, [inquiryId]);

  useEffect(() => {
    load();
  }, [load]);

  const inq = context?.inquiry;
  const employees = context?.employees || [];
  const technicianName = employees.find((e) => e.id === inq?.assigned_employee_id)?.full_name || '';
  const assignmentAwaitingResponse = !!(inq?.assigned_employee_id && inq.assignment_status === 'pending');
  const assignmentLocked = !!(inq?.assigned_employee_id && inq.assignment_status !== 'declined');
  const hasBill = Number(inq?.bill_total) > 0;
  const hasCoords = inq?.customer_lat != null && inq?.customer_lng != null;

  const sla = inq?.assigned_at ? calculateSlaDeadline(inq.assigned_at) : null;
  const isTerminal = inq ? ['resolved', 'closed', 'issue_not_resolved'].includes(inq.status) : false;
  const slaDeadlineInfo = sla ? formatSlaDeadlineLabel(sla) : null;
  const slaTimeInfo = sla ? formatTimeRemainingLabel(sla) : null;

  const openMaps = () => {
    if (!inq || inq.customer_lat == null || inq.customer_lng == null) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${inq.customer_lat},${inq.customer_lng}`);
  };

  const employeeStatusLabel = (e: ManageContextEmployee): string => {
    if (e.clockedIn && !e.restricted) return 'Online';
    if (e.restricted) return 'Restricted';
    if (e.always_assign) return 'Offline ⭐ (Allowed)';
    return 'Offline';
  };

  const employeeSelectable = (e: ManageContextEmployee): boolean => (e.clockedIn && !e.restricted) || e.always_assign;

  const handleSave = async () => {
    if (assignmentLocked || !inq) return;
    setSaving(true);
    setError(null);
    try {
      await assignInquiryEmployee(inq.id, selectedEmployeeId);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save assignment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.cardWrap}>
          <GlassSurface style={styles.card} borderRadius={radius.lg}>
            <View style={[styles.header, { borderBottomColor: theme.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text }]}>Service Request</Text>
                {inq ? <Text style={[styles.subtitle, { color: theme.text3 }]}>{inq.ticket_no || inq.id.slice(0, 8)}</Text> : null}
              </View>
              <PressScale onPress={onDismiss}>
                <View style={[styles.closeBtn, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                  <Icon name="close" size={14} color={theme.text} />
                </View>
              </PressScale>
            </View>

            {loading ? (
              <ActivityIndicator color={brand.primary} style={{ marginVertical: spacing(8) }} />
            ) : error && !inq ? (
              <Text style={[styles.errorText, { marginVertical: spacing(6) }]}>{error}</Text>
            ) : inq ? (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
                <View style={styles.metaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Status</Text>
                    <Text style={[styles.fieldValue, { color: (statusColors[displayStatus(inq.status)] || DEFAULT_STATUS_STYLE).color }]}>
                      {(statusColors[displayStatus(inq.status)] || DEFAULT_STATUS_STYLE).label}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Created</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>{formatDateTime(inq.created_at)}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Customer</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>{inq.full_name}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Phone</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>{inq.phone || '—'}</Text>
                  </View>
                </View>

                <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(2) }]}>Service item</Text>
                <Text style={[styles.fieldValue, { color: theme.text }]}>{inq.service_item || '—'}</Text>

                {inq.description ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(2) }]}>Customer description</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>{inq.description}</Text>
                  </>
                ) : null}

                <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(2) }]}>Location</Text>
                <Text style={[styles.fieldValue, { color: theme.text }]}>{inq.location || '—'}</Text>
                {hasCoords ? (
                  <PressScale onPress={openMaps} style={{ marginTop: spacing(2) }}>
                    <View style={[styles.mapBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                      <Icon name="pin" size={14} color={brand.primary} />
                      <Text style={[styles.mapBtnText, { color: brand.primary }]}>Open exact client pin</Text>
                    </View>
                  </PressScale>
                ) : null}

                {inq.company_name ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(2) }]}>Company</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>{inq.company_name}</Text>
                  </>
                ) : null}

                {inq.device_type || inq.device_serial_no ? (
                  <View style={styles.metaRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Device Type</Text>
                      <Text style={[styles.fieldValue, { color: theme.text }]}>{inq.device_type || '—'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Serial No</Text>
                      <Text style={[styles.fieldValue, styles.mono, { color: theme.text }]}>{inq.device_serial_no || '—'}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.metaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Preferred Time</Text>
                    <Text style={[styles.fieldValue, { color: brand.primary }]}>{inq.preferred_time || 'Flexible'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>SLA</Text>
                    <Text style={[styles.fieldValue, { color: isTerminal ? theme.text3 : slaTimeInfo?.isOverdue ? semantic.danger : semantic.success }]}>
                      {isTerminal ? 'Service Completed' : slaTimeInfo ? slaTimeInfo.label : 'Awaiting assignment'}
                    </Text>
                  </View>
                </View>
                {!isTerminal && slaDeadlineInfo ? (
                  <Text style={[styles.fieldValue, { color: theme.text3, fontSize: 11, marginTop: -spacing(1) }]}>
                    Deadline: {slaDeadlineInfo.label}
                  </Text>
                ) : null}

                {Number(inq.extra_cost) > 0 ? (
                  <View style={[styles.noteBox, { backgroundColor: `${brand.primary}14`, borderColor: brand.primary }]}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Additional Charges</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>
                      {money(inq.extra_cost)} — {inq.extra_cost_reason || 'No reason'}
                    </Text>
                  </View>
                ) : null}

                {inq.assignment_status === 'declined' ? (
                  <View style={[styles.noteBox, { backgroundColor: `${semantic.danger}18`, borderColor: semantic.danger }]}>
                    <Text style={[styles.fieldLabel, { color: semantic.danger }]}>Employee Declined</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>{inq.decline_reason || 'No reason provided'}</Text>
                  </View>
                ) : null}

                {assignmentLocked ? (
                  <View style={[styles.noteBox, { backgroundColor: `${semantic.warning}18`, borderColor: semantic.warning }]}>
                    <Text style={[styles.fieldLabel, { color: semantic.warning }]}>
                      {assignmentAwaitingResponse ? 'Waiting for employee response' : 'Assignment locked'}
                    </Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>
                      {assignmentAwaitingResponse
                        ? `${technicianName || 'Assigned technician'} must accept or decline before this can be reassigned.`
                        : `${technicianName || 'This technician'} is already assigned. Reassignment is locked unless they decline.`}
                    </Text>
                  </View>
                ) : null}

                {inq.feedback_rating ? (
                  <View style={[styles.noteBox, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Customer feedback ({inq.feedback_rating}/5)</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>{inq.feedback_comment || 'No comment.'}</Text>
                  </View>
                ) : null}

                {hasBill ? (
                  <View style={[styles.billBox, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Bill Total</Text>
                    <Text style={[styles.billTotal, { color: semantic.success }]}>{money(inq.bill_total)}</Text>
                  </View>
                ) : inq.payment_status === 'foc' ? (
                  <View style={[styles.noteBox, { backgroundColor: `${brand.primary}14`, borderColor: brand.primary }]}>
                    <Text style={[styles.fieldLabel, { color: brand.primary }]}>No Bill — FOC</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>This job was completed free of charge.</Text>
                  </View>
                ) : null}

                <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(4) }]}>Assign to Technician</Text>
                <View style={styles.employeeList}>
                  <PressScale onPress={() => !assignmentLocked && setSelectedEmployeeId(null)} disabled={assignmentLocked}>
                    <View
                      style={[
                        styles.employeeRow,
                        { borderColor: theme.line, backgroundColor: selectedEmployeeId === null ? `${brand.primary}14` : theme.panel2 },
                      ]}
                    >
                      <Text style={[styles.employeeName, { color: theme.text }]}>— None —</Text>
                    </View>
                  </PressScale>
                  {employees.map((e) => {
                    const selectable = employeeSelectable(e);
                    const selected = selectedEmployeeId === e.id;
                    return (
                      <PressScale
                        key={e.id}
                        onPress={() => !assignmentLocked && selectable && setSelectedEmployeeId(e.id)}
                        disabled={assignmentLocked || !selectable}
                      >
                        <View
                          style={[
                            styles.employeeRow,
                            {
                              borderColor: selected ? brand.primary : theme.line,
                              backgroundColor: selected ? `${brand.primary}14` : theme.panel2,
                              opacity: selectable ? 1 : 0.5,
                            },
                          ]}
                        >
                          <Text style={[styles.employeeName, { color: theme.text }]}>{e.full_name}</Text>
                          <Text style={[styles.employeeStatus, { color: e.clockedIn ? semantic.success : theme.text3 }]}>
                            {employeeStatusLabel(e)}
                          </Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </View>
                <Text style={[styles.helperText, { color: theme.text3 }]}>
                  {assignmentLocked
                    ? 'Already assigned. Save is disabled to prevent duplicate assignment.'
                    : 'Only currently clocked-in employees, or those admin has allowed offline, can receive new assignments.'}
                </Text>

                {error ? <Text style={[styles.errorText, { marginTop: spacing(2) }]}>{error}</Text> : null}
              </ScrollView>
            ) : null}

            {inq ? (
              <View style={[styles.footer, { borderTopColor: theme.line }]}>
                <PressScale onPress={onDismiss} style={{ flex: 1 }}>
                  <View style={[styles.cancelBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                    <Text style={[styles.cancelBtnText, { color: theme.text }]}>Close</Text>
                  </View>
                </PressScale>
                <PressScale onPress={handleSave} disabled={assignmentLocked || saving} style={{ flex: 1 }}>
                  <View style={[styles.saveBtn, { backgroundColor: assignmentLocked ? theme.line : brand.primary, opacity: saving ? 0.7 : 1 }]}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="check" size={15} color="#fff" />}
                    <Text style={styles.saveBtnText}>{assignmentLocked ? 'Already assigned' : 'Save assignment'}</Text>
                  </View>
                </PressScale>
              </View>
            ) : null}
          </GlassSurface>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  cardWrap: { width: '100%', maxWidth: 480, maxHeight: '86%' },
  card: { width: '100%', maxHeight: '100%', padding: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(5), borderBottomWidth: 1 },
  title: { ...typography.heading, fontSize: 17 },
  subtitle: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12, marginTop: spacing(0.5) },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  body: { paddingHorizontal: spacing(5), paddingTop: spacing(3) },
  metaRow: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(2) },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing(0.5) },
  fieldValue: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  mono: { fontFamily: 'JetBrainsMono_700Bold' },
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 38,
    borderRadius: radius.sm, borderWidth: 1, alignSelf: 'flex-start', paddingHorizontal: spacing(3),
  },
  mapBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  noteBox: { borderRadius: radius.md, borderWidth: 1, padding: spacing(2.5), marginTop: spacing(2.5) },
  billBox: { borderRadius: radius.md, borderWidth: 1, padding: spacing(2.5), marginTop: spacing(2.5), alignItems: 'center' },
  billTotal: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, marginTop: spacing(0.5) },
  employeeList: { gap: spacing(2), marginTop: spacing(1) },
  employeeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 46,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing(3),
  },
  employeeName: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  employeeStatus: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  helperText: { fontSize: 11, marginTop: spacing(2), marginBottom: spacing(5) },
  errorText: { color: semantic.danger, fontSize: 12, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: spacing(2.5), padding: spacing(5), borderTopWidth: 1 },
  cancelBtn: { height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 46, borderRadius: radius.md },
  saveBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/AdminServiceRequestDetailModal.tsx
git commit -m "feat(mobile): add Service Request detail/assign modal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: List screen

**Files:**
- Create: `mobile/src/screens/AdminServiceRequestsScreen.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import AppHeaderBar from '../components/AppHeaderBar';
import Icon from '../components/Icon';
import PressScale from '../components/PressScale';
import AdminServiceRequestDetailModal from '../components/AdminServiceRequestDetailModal';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchInquiries, AdminInquiryRow } from '../api/adminInquiries';

interface Props {
  onBack: () => void;
}

type FilterKey = 'active' | 'resolved' | 'issues' | 'reopened' | 'unpaid' | 'paid' | 'all';

const FILTER_LABEL: Record<FilterKey, string> = {
  active: 'Active',
  resolved: 'Resolved',
  issues: 'Issue Not Resolved',
  reopened: 'Reopened',
  unpaid: 'Awaiting Payment',
  paid: 'Paid',
  all: 'All',
};

function displayStatus(status: string): string {
  return status === 'closed' ? 'resolved' : status || 'open';
}

function matchesFilter(row: AdminInquiryRow, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return !['resolved', 'closed', 'issue_not_resolved'].includes(row.status);
  if (filter === 'resolved') return ['resolved', 'closed'].includes(row.status);
  if (filter === 'issues') return row.status === 'issue_not_resolved';
  if (filter === 'reopened') return Number(row.reopened) === 1;
  if (filter === 'unpaid') return !!row.bill_amount && row.payment_status !== 'paid';
  if (filter === 'paid') return row.payment_status === 'paid';
  return true;
}

export default function AdminServiceRequestsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [rows, setRows] = useState<AdminInquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('active');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await fetchInquiries();
      setRows(data);
      setError(null);
    } catch {
      setError('Could not load service requests — pull to retry');
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

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { active: 0, resolved: 0, issues: 0, reopened: 0, unpaid: 0, paid: 0, all: rows.length };
    rows.forEach((r) => {
      (Object.keys(c) as FilterKey[]).forEach((key) => {
        if (key !== 'all' && matchesFilter(r, key)) c[key]++;
      });
    });
    return c;
  }, [rows]);

  const filters: FilterKey[] = ['active', 'resolved', 'issues', ...(counts.reopened ? (['reopened'] as FilterKey[]) : []), 'unpaid', 'paid', 'all'];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const c = companyFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesFilter(r, filter)) return false;
      if (c && !(r.company_name || '').toLowerCase().includes(c)) return false;
      if (!q) return true;
      return (
        (r.full_name || '').toLowerCase().includes(q) ||
        (r.ticket_no || '').toLowerCase().includes(q) ||
        (r.service_item || '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search, companyFilter]);

  const topInset = headerHeight > 0 ? headerHeight : insets.top + 100;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Service Requests" subtitle="Every customer request, filterable and assignable" onBack={onBack} onLayout={setHeaderHeight} />
      <ScrollView
        contentContainerStyle={{ paddingTop: topInset + spacing(4), paddingBottom: insets.bottom + spacing(10), paddingHorizontal: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        {error ? <Text style={[styles.caption, { color: semantic.danger, marginBottom: spacing(3) }]}>{error}</Text> : null}

        <View style={styles.filterRow}>
          {filters.map((f) => {
            const active = filter === f;
            return (
              <PressScale key={f} onPress={() => setFilter(f)}>
                <View style={[styles.filterPill, { backgroundColor: active ? brand.primary : theme.panel2, borderColor: active ? brand.primary : theme.line }]}>
                  <Text style={[styles.filterPillText, { color: active ? '#fff' : theme.text2 }]}>{FILTER_LABEL[f]}</Text>
                  <View style={[styles.filterCountBubble, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.panel2 }]}>
                    <Text style={[styles.filterCountText, { color: active ? '#fff' : theme.text3 }]}>{counts[f]}</Text>
                  </View>
                </View>
              </PressScale>
            );
          })}
        </View>

        <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
          <Icon name="search" size={16} color={theme.text3} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by name, ticket, or service…"
            placeholderTextColor={theme.text3}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <PressScale onPress={() => setSearch('')}>
              <View style={[styles.clearBtn, { backgroundColor: theme.line }]}>
                <Icon name="close" size={11} color={theme.text3} />
              </View>
            </PressScale>
          ) : null}
        </View>

        <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.panel2, marginBottom: spacing(4) }]}>
          <Icon name="box" size={16} color={theme.text3} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Filter by company…"
            placeholderTextColor={theme.text3}
            value={companyFilter}
            onChangeText={setCompanyFilter}
          />
          {companyFilter.length > 0 ? (
            <PressScale onPress={() => setCompanyFilter('')}>
              <View style={[styles.clearBtn, { backgroundColor: theme.line }]}>
                <Icon name="close" size={11} color={theme.text3} />
              </View>
            </PressScale>
          ) : null}
        </View>

        {loading && rows.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={brand.primary} />
            <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>Loading service requests…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIconChip, { backgroundColor: `${brand.primary}1f` }]}>
              <Icon name="report" size={22} color={brand.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing here</Text>
            <Text style={[styles.caption, { color: theme.text3, textAlign: 'center' }]}>No requests match this view.</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.resultCount, { color: theme.text3 }]}>{filtered.length} of {rows.length} requests</Text>
            {filtered.map((row, idx) => {
              const statusStyle = statusColors[displayStatus(row.status)] || DEFAULT_STATUS_STYLE;
              const paid = row.payment_status === 'paid';
              return (
                <Animated.View key={row.id} entering={FadeInUp.delay(Math.min(idx, 8) * 60).duration(400)}>
                  <PressScale onPress={() => setSelectedId(row.id)}>
                    <View style={[styles.cardOuter, { shadowColor: statusStyle.color }]}>
                      <View style={[styles.accentBar, { backgroundColor: statusStyle.color }]} />
                      <GlassCard shadow style={styles.card}>
                        <View style={styles.rowHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.name, { color: theme.text }]}>{row.full_name}</Text>
                            <Text style={[styles.ticketNo, { color: theme.text3 }]}>{row.ticket_no || row.id.slice(0, 8)}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                          </View>
                        </View>
                        {row.service_item ? (
                          <Text style={[styles.serviceItem, { color: theme.text2 }]} numberOfLines={1}>{row.service_item}</Text>
                        ) : null}
                        <View style={styles.chipRow}>
                          <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                            <Icon name="user" size={11} color={theme.text3} />
                            <Text style={[styles.metaChipText, { color: theme.text2 }]}>
                              {row.assigned_employee_id ? 'Assigned' : 'Unassigned'}
                            </Text>
                          </View>
                          {row.bill_amount ? (
                            <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: paid ? `${semantic.success}18` : `${semantic.warning}18` }]}>
                              <Text style={[styles.metaChipText, { color: paid ? semantic.success : semantic.warning }]}>{paid ? 'Paid' : 'Unpaid'}</Text>
                            </View>
                          ) : null}
                        </View>
                      </GlassCard>
                    </View>
                  </PressScale>
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>

      {selectedId && (
        <AdminServiceRequestDetailModal
          inquiryId={selectedId}
          onDismiss={() => setSelectedId(null)}
          onSaved={() => {
            setSelectedId(null);
            load();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  caption: { ...typography.caption },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3), paddingVertical: spacing(1.75), borderRadius: radius.full, borderWidth: 1 },
  filterPillText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  filterCountBubble: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterCountText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 44, marginBottom: spacing(2.5) },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  clearBtn: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  loadingBox: { alignItems: 'center', paddingVertical: spacing(10) },
  emptyBox: { alignItems: 'center', paddingVertical: spacing(9), gap: spacing(1) },
  emptyIconChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  emptyTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, marginBottom: spacing(0.5) },
  resultCount: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, marginBottom: spacing(2.5) },
  cardOuter: { flexDirection: 'row', marginBottom: spacing(3), shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 3 },
  accentBar: { width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  card: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(2), marginBottom: spacing(1.5) },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 11, marginTop: spacing(0.5) },
  statusBadge: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.full },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  serviceItem: { fontSize: 12.5, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing(2) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: radius.full, borderWidth: 1 },
  metaChipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/AdminServiceRequestsScreen.tsx
git commit -m "feat(mobile): add Service Requests list screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire into navigation

**Files:**
- Modify: `mobile/src/navigation/RootNavigator.tsx`
- Modify: `mobile/src/screens/AdminDashboardScreen.tsx`

- [ ] **Step 1: Add the route type, import, route wrapper, and stack registration in `RootNavigator.tsx`**

Find this block (around line 47):

```typescript
type AdminStackParams = {
  Dashboard: undefined;
  Notifications: undefined;
  LiveLocations: undefined;
};
```

Replace with:

```typescript
type AdminStackParams = {
  Dashboard: undefined;
  Notifications: undefined;
  LiveLocations: undefined;
  ServiceRequests: undefined;
};
```

Find the screen imports near the top of the file (alongside `import LiveLocationsScreen from '../screens/LiveLocationsScreen';`) and add:

```typescript
import AdminServiceRequestsScreen from '../screens/AdminServiceRequestsScreen';
```

Find this block (around line 292):

```typescript
function AdminDashboardRoute({ navigation }: any) {
  return (
    <AdminDashboardScreen
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenLiveLocations={() => navigation.navigate('LiveLocations')}
    />
  );
}

function AdminNotificationsRoute({ navigation }: any) {
  return <NotificationsScreen onBack={() => navigation.goBack()} />;
}

function AdminLiveLocationsRoute({ navigation }: any) {
  return <LiveLocationsScreen onBack={() => navigation.goBack()} />;
}

// Only Dashboard + Notifications + Live Locations for now — the rest of
// admin (Job Cards, Finance, Device Tracking, etc.) is still the
// MoreSheet's "Coming soon" placeholder list (AdminDashboardScreen's
// MORE_SECTIONS), each becoming a real route here as it's built.
function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminStack.Screen name="Dashboard" component={AdminDashboardRoute} options={{ animation: 'none' }} />
      <AdminStack.Screen name="Notifications" component={AdminNotificationsRoute} options={{ animation: 'slide_from_right' }} />
      <AdminStack.Screen name="LiveLocations" component={AdminLiveLocationsRoute} options={{ animation: 'slide_from_right' }} />
    </AdminStack.Navigator>
  );
}
```

Replace with:

```typescript
function AdminDashboardRoute({ navigation }: any) {
  return (
    <AdminDashboardScreen
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenLiveLocations={() => navigation.navigate('LiveLocations')}
      onOpenServiceRequests={() => navigation.navigate('ServiceRequests')}
    />
  );
}

function AdminNotificationsRoute({ navigation }: any) {
  return <NotificationsScreen onBack={() => navigation.goBack()} />;
}

function AdminLiveLocationsRoute({ navigation }: any) {
  return <LiveLocationsScreen onBack={() => navigation.goBack()} />;
}

function AdminServiceRequestsRoute({ navigation }: any) {
  return <AdminServiceRequestsScreen onBack={() => navigation.goBack()} />;
}

// Dashboard + Notifications + Live Locations + Service Requests so far —
// the rest of admin (Job Cards, Finance, Device Tracking, etc.) is still the
// MoreSheet's "Coming soon" placeholder list (AdminDashboardScreen's
// MORE_SECTIONS), each becoming a real route here as it's built.
function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminStack.Screen name="Dashboard" component={AdminDashboardRoute} options={{ animation: 'none' }} />
      <AdminStack.Screen name="Notifications" component={AdminNotificationsRoute} options={{ animation: 'slide_from_right' }} />
      <AdminStack.Screen name="LiveLocations" component={AdminLiveLocationsRoute} options={{ animation: 'slide_from_right' }} />
      <AdminStack.Screen name="ServiceRequests" component={AdminServiceRequestsRoute} options={{ animation: 'slide_from_right' }} />
    </AdminStack.Navigator>
  );
}
```

- [ ] **Step 2: Add the prop and More-sheet entry in `AdminDashboardScreen.tsx`**

Find:

```typescript
interface Props {
  onOpenNotifications: () => void;
  onOpenLiveLocations: () => void;
}

export default function AdminDashboardScreen({ onOpenNotifications, onOpenLiveLocations }: Props) {
  // The web app's admin sections not yet ported to mobile — see design
  // spec §5/§8. Each becomes a real route in a later phase; Notifications
  // and Live Locations are the first to move out of "Coming soon" and
  // into real screens.
  const MORE_SECTIONS = [
    { label: 'Job Cards' },
```

Replace with:

```typescript
interface Props {
  onOpenNotifications: () => void;
  onOpenLiveLocations: () => void;
  onOpenServiceRequests: () => void;
}

export default function AdminDashboardScreen({ onOpenNotifications, onOpenLiveLocations, onOpenServiceRequests }: Props) {
  // The web app's admin sections not yet ported to mobile — see design
  // spec §5/§8. Each becomes a real route in a later phase; Notifications,
  // Live Locations, and Service Requests are the first to move out of
  // "Coming soon" and into real screens.
  const MORE_SECTIONS = [
    { label: 'Service Requests', onPress: onOpenServiceRequests },
    { label: 'Job Cards' },
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/navigation/RootNavigator.tsx mobile/src/screens/AdminDashboardScreen.tsx
git commit -m "feat(mobile): wire Service Requests into admin navigation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full mobile typecheck**

Run: `cd mobile && npx tsc --noEmit -p .`
Expected: no errors (final confirmation after all tasks).

- [ ] **Step 2: Web build sanity check** (this feature touches no web files, but confirms nothing else in the repo broke)

Run: `cd .. && npx vite build`
Expected: build succeeds. Then `rm -rf dist` to clean up the build artifact (gitignored, not meant to be committed).

- [ ] **Step 3: Kick off a new EAS production build so the feature can actually be tested on a device**

Run: `cd mobile && npx eas-cli build --profile production --platform android --non-interactive`
Expected: build completes, produces an install link.

- [ ] **Step 4: Manual smoke test on device** (cannot be automated — hand off to the user)

Checklist:
- Admin → More → Service Requests opens the new screen.
- All 7 filter chips show correct counts and filter the list correctly (Reopened chip only appears when its count > 0).
- Search box filters by customer name, ticket number, and service item.
- Company filter narrows results by company name substring.
- Tapping a row opens the detail modal with the correct data (compare a couple of tickets against the web admin panel for the same tickets).
- Assigning an unassigned request to a clocked-in employee succeeds and the modal closes; the list refreshes to show the new assignment.
- Opening an already-assigned (pending/accepted) request shows the "Assignment locked" banner and the Save button is disabled.
- A declined assignment shows the "Employee Declined" banner with the reason, and CAN be reassigned.

---

## Self-review notes

**Spec coverage:** All of design spec §3 (list screen filters/search/company filter, detail modal fields, employee picker, save) and §4 (API file contents) are covered by Tasks 1–4. §6 (error handling/testing) is covered by the `ApiError` surfacing already built into both new files, plus Task 5's manual checklist.

**Placeholder scan:** No TBD/TODO — every step has complete, exact code.

**Type consistency:** `AdminInquiryRow` (list) and `ManageContextInquiry` (detail) are deliberately separate, narrower interfaces matching what each screen's endpoint actually returns — not force-unified into one shared type, since the list endpoint (`select: '*'`) and the manage-context endpoint return different (overlapping but not identical) shapes in practice. `ManageContextEmployee`, `assignInquiryEmployee`, `calculateSlaDeadline`, `formatSlaDeadlineLabel`, `formatTimeRemainingLabel` are each defined once in Task 1 and consumed with identical names/signatures in Task 2 — verified by re-reading Task 2's imports against Task 1's exports.
