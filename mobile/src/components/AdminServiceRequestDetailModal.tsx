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
