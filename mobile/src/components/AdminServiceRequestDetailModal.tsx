import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from './KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from './MeshBackground';
import AdminHeader from './admin/AdminHeader';
import ActionButton from './admin/ActionButton';
import StatusBadge from './admin/StatusBadge';
import GlowButton from './GlowButton';
import Icon from './Icon';
import { IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import {
  fetchInquiryManageContext,
  assignInquiryEmployee,
  calculateSlaDeadline,
  formatSlaDeadlineLabel,
  formatTimeRemainingLabel,
  ManageContext,
  ManageContextEmployee,
} from '../api/adminInquiries';
import { ApiError, resolveUploadUrl } from '../api/client';
import RequestPhotos from './RequestPhotos';
import { deleteInquiry, releaseToPool, transferInquiry } from '../api/adminManage';
import CustomerEquipment from './CustomerEquipment';

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

// Design "Detail" template: a summary card, labelled panels, an audit trail and
// one sticky action. The assignment rules are unchanged — the list below is the
// same technician picker, and Save is locked while someone holds the job.
export default function AdminServiceRequestDetailModal({ inquiryId, onDismiss, onSaved }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [context, setContext] = useState<ManageContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

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

  const finished = inq ? ['resolved', 'closed', 'case_closed', 'issue_not_resolved', 'foc'].includes(inq.status) : false;
  const canTransfer = !!inq && !!inq.assigned_employee_id && !finished && inq.payment_status !== 'paid' && inq.pool_status !== 'claimed';
  const canRelease = !!inq && !inq.pool_status && !finished;

  const run = async (key: string, fn: () => Promise<unknown>, done: () => void) => {
    setActing(key);
    setError(null);
    try {
      await fn();
      done();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not complete that');
    } finally {
      setActing(null);
    }
  };

  const confirmTransfer = (e: ManageContextEmployee) =>
    Alert.alert('Transfer request?', `Move it from ${technicianName || 'the current technician'} to ${e.full_name}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Transfer', onPress: () => inq && run('transfer', () => transferInquiry(inq.id, e.id, ''), onSaved) },
    ]);

  const confirmRelease = () =>
    Alert.alert('Release to public pool?', 'Gig workers will see this job and the first to accept gets it. Payment becomes online-only.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Release', onPress: () => inq && run('pool', () => releaseToPool(inq.id), onSaved) },
    ]);

  const doDelete = () => {
    if (!inq) return;
    setConfirmingDelete(false);
    run('delete', () => deleteInquiry(inq.id, inq.ticket_id || null), onSaved);
  };

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

  const statusStyle = inq ? statusColors[displayStatus(inq.status)] || DEFAULT_STATUS_STYLE : DEFAULT_STATUS_STYLE;
  const slaColor = isTerminal ? theme.text3 : slaTimeInfo?.isOverdue ? theme.err : theme.ok;
  const slaText = isTerminal ? 'Service completed' : slaTimeInfo ? slaTimeInfo.label : 'Awaiting assignment';

  // Audit trail from the timestamps the request carries.
  const audit: { icon: IconName; color: string; title: string; when: string }[] = [];
  if (inq) {
    audit.push({ icon: 'dot', color: theme.info, title: 'Request received', when: formatDateTime(inq.created_at) });
    if (inq.assigned_at) {
      audit.push({ icon: 'person-circle', color: theme.vio, title: `Assigned${technicianName ? ` to ${technicianName}` : ''}`, when: formatDateTime(inq.assigned_at) });
    }
    if (inq.assignment_status === 'declined') {
      audit.push({ icon: 'alert', color: theme.err, title: `Declined${inq.decline_reason ? ` · ${inq.decline_reason}` : ''}`, when: formatDateTime(inq.updated_at) });
    }
    if (isTerminal || finished) {
      audit.push({ icon: 'check-circle', color: statusStyle.color, title: statusStyle.label, when: formatDateTime(inq.updated_at) });
    }
  }

  const detailPanels: { icon: IconName; label: string; value: string; hint?: string; mono?: boolean }[] = [];
  if (inq) {
    detailPanels.push({ icon: 'tasks', label: 'SERVICE ITEM', value: inq.service_item || '—', hint: inq.description || undefined });
    detailPanels.push({ icon: 'pin', label: 'LOCATION', value: inq.location || '—' });
    if (inq.device_type || inq.device_serial_no) {
      detailPanels.push({ icon: 'device', label: 'DEVICE', value: inq.device_type || '—', hint: inq.device_serial_no ? `Serial ${inq.device_serial_no}` : undefined });
    }
    if (inq.preferred_time) detailPanels.push({ icon: 'clock', label: 'PREFERRED TIME', value: inq.preferred_time });
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onDismiss}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <MeshBackground />
        <AdminHeader title={inq?.ticket_no || inq?.id.slice(0, 8) || 'Service request'} subtitle="Service request" onBack={onDismiss} />

        {loading ? (
          <ActivityIndicator color={theme.accent} style={styles.loader} />
        ) : error && !inq ? (
          <Text style={[styles.errorText, { color: theme.err }]}>{error}</Text>
        ) : inq ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.summaryTop}>
                <StatusBadge label={statusStyle.label} color={statusStyle.color} />
                <Text style={[styles.sla, { color: slaColor }]} numberOfLines={1}>{slaText}</Text>
              </View>
              <Text style={[styles.customer, { color: theme.text }]}>{inq.full_name}</Text>
              <View style={styles.contactRow}>
                <Text style={[styles.contact, { color: theme.text2 }]} numberOfLines={1}>{inq.phone || 'No phone'}</Text>
                {inq.phone ? (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${inq.phone}`)}
                    accessibilityRole="button"
                    accessibilityLabel="Call customer"
                    style={[styles.callBtn, { backgroundColor: theme.panel2, borderColor: theme.border }]}
                  >
                    <Icon name="phone" size={14} color={theme.accent} />
                    <Text style={[styles.callText, { color: theme.text }]}>Call</Text>
                  </Pressable>
                ) : null}
              </View>
              {inq.company_name ? <Text style={[styles.company, { color: theme.text2 }]}>Company: {inq.company_name}</Text> : null}
              <Text style={[styles.created, { color: theme.text3 }]}>Created {formatDateTime(inq.created_at)}</Text>
              {!isTerminal && slaDeadlineInfo ? (
                <Text style={[styles.created, { color: theme.text3 }]}>Deadline: {slaDeadlineInfo.label}</Text>
              ) : null}
            </View>

            {detailPanels.map((p) => (
              <View key={p.label} style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                <View style={[styles.tile, { backgroundColor: theme.panel2 }]}>
                  <Icon name={p.icon} size={20} color={theme.text2} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.overline, { color: theme.text3 }]}>{p.label}</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{p.value}</Text>
                  {p.hint ? <Text style={[styles.hint, { color: theme.text2 }]}>{p.hint}</Text> : null}
                </View>
              </View>
            ))}

            {hasCoords ? (
              <Pressable
                onPress={openMaps}
                accessibilityRole="button"
                style={[styles.linkPanel, { backgroundColor: theme.panel, borderColor: theme.border }]}
              >
                <Icon name="pin" size={18} color={theme.accent} />
                <Text style={[styles.linkText, { color: theme.accent }]}>Open exact client pin</Text>
              </Pressable>
            ) : null}

            <CustomerEquipment phone={inq.phone} ticketNo={inq.ticket_no} />
            <RequestPhotos raw={inq.photo_urls} />

            {Number(inq.extra_cost) > 0 ? (
              <View style={[styles.note, { backgroundColor: theme.okS, borderColor: theme.accent }]}>
                <Text style={[styles.overline, { color: theme.text3 }]}>ADDITIONAL CHARGES</Text>
                <Text style={[styles.value, { color: theme.text }]}>
                  {money(inq.extra_cost)} — {inq.extra_cost_reason || 'No reason'}
                </Text>
              </View>
            ) : null}

            {inq.assignment_status === 'declined' ? (
              <View style={[styles.note, { backgroundColor: theme.errS, borderColor: theme.err }]}>
                <Text style={[styles.overline, { color: theme.err }]}>EMPLOYEE DECLINED</Text>
                <Text style={[styles.value, { color: theme.text }]}>{inq.decline_reason || 'No reason provided'}</Text>
              </View>
            ) : null}

            {assignmentLocked ? (
              <View style={[styles.note, { backgroundColor: theme.warnS, borderColor: theme.warn }]}>
                <Text style={[styles.overline, { color: theme.warn }]}>
                  {assignmentAwaitingResponse ? 'WAITING FOR EMPLOYEE RESPONSE' : 'ASSIGNMENT LOCKED'}
                </Text>
                <Text style={[styles.value, { color: theme.text }]}>
                  {assignmentAwaitingResponse
                    ? `${technicianName || 'Assigned technician'} must accept or decline before this can be reassigned.`
                    : `${technicianName || 'This technician'} is already assigned. Reassignment is locked unless they decline.`}
                </Text>
              </View>
            ) : null}

            {inq.feedback_rating ? (
              <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                <View style={[styles.tile, { backgroundColor: theme.warnS }]}>
                  <Icon name="star" size={20} color={theme.warn} filled />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.overline, { color: theme.text3 }]}>{`CUSTOMER FEEDBACK · ${inq.feedback_rating}/5`}</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{inq.feedback_comment || 'No comment.'}</Text>
                </View>
              </View>
            ) : null}

            {hasBill ? (
              <View style={[styles.bill, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                <View style={styles.billTop}>
                  <Text style={[styles.overline, { color: theme.text3 }]}>BILL TOTAL</Text>
                  <Text style={[styles.billTotal, { color: theme.ok }]}>{money(inq.bill_total)}</Text>
                </View>
                {[
                  ['Platform fee', money(inq.platform_fee)],
                  [`Transport (${Number(inq.transport_km || 0).toFixed(1)} km)`, money(inq.transport_fee)],
                  ['GST', money(inq.gst_amount)],
                  ...(Number(inq.discount_amount) > 0
                    ? [[inq.discount_label || (inq.coupon_code ? `Coupon ${inq.coupon_code}` : 'Discount'), `-${money(inq.discount_amount)}`]]
                    : []),
                  ['Payment', `${inq.payment_status === 'paid' ? 'Paid' : 'Unpaid'}${inq.payment_method ? ` · ${inq.payment_method}` : ''}`],
                ].map(([k, v]) => (
                  <View key={k} style={[styles.billLine, { borderTopColor: theme.line }]}>
                    <Text style={[styles.billKey, { color: theme.text2 }]}>{k}</Text>
                    <Text style={[styles.billVal, { color: theme.text }]}>{v}</Text>
                  </View>
                ))}
                {inq.bill_pdf_url ? (
                  <Pressable
                    onPress={() => Linking.openURL(resolveUploadUrl(inq.bill_pdf_url as string))}
                    accessibilityRole="button"
                    style={styles.pdfLink}
                  >
                    <Icon name="receipt" size={16} color={theme.accent} />
                    <Text style={[styles.linkText, { color: theme.accent }]}>View bill PDF</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : inq.payment_status === 'foc' ? (
              <View style={[styles.note, { backgroundColor: theme.okS, borderColor: theme.accent }]}>
                <Text style={[styles.overline, { color: theme.accent }]}>NO BILL — FOC</Text>
                <Text style={[styles.value, { color: theme.text }]}>This job was completed free of charge.</Text>
              </View>
            ) : null}

            {inq.pool_status ? (
              <View style={[styles.note, { backgroundColor: theme.infoS, borderColor: theme.info }]}>
                <Text style={[styles.overline, { color: theme.info }]}>
                  {inq.pool_status === 'claimed' ? 'CLAIMED FROM PUBLIC POOL' : 'IN PUBLIC POOL'}
                </Text>
                <Text style={[styles.value, { color: theme.text }]}>
                  {inq.pool_status === 'claimed'
                    ? `Claimed by ${employees.find((e) => e.id === inq.claimed_by_gig_worker_id)?.full_name || 'a gig worker'}`
                    : 'Visible to gig workers — first to accept gets it'}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.heading, { color: theme.text }]}>Assign technician</Text>
            <View style={styles.optionList}>
              <Pressable
                onPress={() => !assignmentLocked && setSelectedEmployeeId(null)}
                disabled={assignmentLocked}
                style={[styles.option, { backgroundColor: selectedEmployeeId === null ? theme.okS : theme.panel, borderColor: selectedEmployeeId === null ? theme.accent : theme.border }]}
              >
                <View style={[styles.radio, { borderColor: selectedEmployeeId === null ? theme.accent : theme.text3 }]}>
                  {selectedEmployeeId === null ? <View style={[styles.radioDot, { backgroundColor: theme.accent }]} /> : null}
                </View>
                <Text style={[styles.optionName, { color: theme.text }]}>— None —</Text>
              </Pressable>
              {employees.map((e) => {
                const selectable = employeeSelectable(e);
                const selected = selectedEmployeeId === e.id;
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => !assignmentLocked && selectable && setSelectedEmployeeId(e.id)}
                    disabled={assignmentLocked || !selectable}
                    style={[
                      styles.option,
                      {
                        backgroundColor: selected ? theme.okS : theme.panel,
                        borderColor: selected ? theme.accent : theme.border,
                        opacity: selectable ? 1 : 0.5,
                      },
                    ]}
                  >
                    <View style={[styles.radio, { borderColor: selected ? theme.accent : theme.text3 }]}>
                      {selected ? <View style={[styles.radioDot, { backgroundColor: theme.accent }]} /> : null}
                    </View>
                    <Text style={[styles.optionName, { color: theme.text }]} numberOfLines={1}>{e.full_name}</Text>
                    <Text style={[styles.optionStatus, { color: e.clockedIn ? theme.ok : theme.text3 }]}>{employeeStatusLabel(e)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.helper, { color: theme.text3 }]}>
              {assignmentLocked
                ? 'Already assigned. Save is disabled to prevent duplicate assignment.'
                : 'Only currently clocked-in employees, or those admin has allowed offline, can receive new assignments.'}
            </Text>

            <Text style={[styles.heading, { color: theme.text }]}>Actions</Text>
            <View style={styles.actions}>
              {canTransfer ? (
                <View style={styles.actionCell}>
                  <ActionButton label="Transfer" tone="neutral" grow={false} onPress={() => setShowTransfer((v) => !v)} />
                </View>
              ) : null}
              {canRelease ? (
                <View style={styles.actionCell}>
                  <ActionButton label="Release to pool" tone="neutral" grow={false} busy={acting === 'pool'} onPress={confirmRelease} />
                </View>
              ) : null}
              <View style={styles.actionCell}>
                <ActionButton label="Delete" tone="danger" grow={false} busy={acting === 'delete'} onPress={() => setConfirmingDelete(true)} />
              </View>
            </View>

            {showTransfer && canTransfer ? (
              <View style={styles.optionList}>
                <Text style={[styles.helper, { color: theme.text3, marginTop: 0 }]}>Move it to one of the technicians who are online:</Text>
                {employees
                  .filter((e) => e.id !== inq.assigned_employee_id && employeeSelectable(e))
                  .map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => confirmTransfer(e)}
                      disabled={acting === 'transfer'}
                      style={[styles.option, { backgroundColor: theme.panel, borderColor: theme.border }]}
                    >
                      <Text style={[styles.optionName, { color: theme.text }]} numberOfLines={1}>{e.full_name}</Text>
                      <Text style={[styles.optionStatus, { color: theme.ok }]}>{employeeStatusLabel(e)}</Text>
                    </Pressable>
                  ))}
              </View>
            ) : null}

            <Text style={[styles.heading, { color: theme.text }]}>Audit log</Text>
            <View>
              {audit.map((h, i) => (
                <View key={`${h.title}-${i}`} style={styles.auditRow}>
                  <View style={styles.auditRail}>
                    <Icon name={h.icon} size={18} color={h.color} filled />
                    {i < audit.length - 1 ? <View style={[styles.auditLine, { backgroundColor: theme.line }]} /> : null}
                  </View>
                  <View style={styles.auditText}>
                    <Text style={[styles.auditTitle, { color: theme.text }]}>{h.title}</Text>
                    <Text style={[styles.auditWhen, { color: theme.text3 }]}>{h.when}</Text>
                  </View>
                </View>
              ))}
            </View>

            {error ? <Text style={[styles.errorText, { color: theme.err }]}>{error}</Text> : null}
          </ScrollView>
        ) : null}

        {inq ? (
          <View style={[styles.sticky, { backgroundColor: theme.surfaceStrong, borderTopColor: theme.line, paddingBottom: insets.bottom + spacing(3) }]}>
            <GlowButton
              label={assignmentLocked ? 'Already assigned' : 'Save assignment'}
              icon="check"
              disabled={assignmentLocked}
              loading={saving}
              onPress={handleSave}
            />
          </View>
        ) : null}

        {confirmingDelete && inq ? (
          <View style={styles.scrim}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmingDelete(false)} accessibilityLabel="Keep request" />
            <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.border, paddingBottom: insets.bottom + spacing(5) }]}>
              <View style={[styles.grabber, { backgroundColor: theme.border }]} />
              <View style={[styles.sheetTile, { backgroundColor: theme.errS }]}>
                <Icon name="trash" size={24} color={theme.err} />
              </View>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{`Delete request ${inq.ticket_no || ''}?`.replace(' ?', '?')}</Text>
              <Text style={[styles.sheetBody, { color: theme.text2 }]}>
                This permanently removes the request with its bill, payment and feedback records. It cannot be undone.
              </Text>
              <View style={styles.sheetButtons}>
                <ActionButton label="Keep request" tone="neutral" onPress={() => setConfirmingDelete(false)} />
                <ActionButton label="Delete" tone="danger" onPress={doDelete} />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  loader: { marginVertical: spacing(10) },
  content: { padding: spacing(4), paddingBottom: spacing(8), gap: spacing(3) },
  summary: { borderWidth: 1, borderRadius: radius.xl, padding: spacing(4), gap: spacing(2.5) },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2) },
  sla: { ...typography.monoId, flexShrink: 1 },
  customer: { ...typography.heading, fontSize: 20, lineHeight: 26 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  contact: { ...typography.supporting, flexShrink: 1, fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), height: 32, paddingHorizontal: spacing(2.5), borderRadius: radius.sm, borderWidth: 1 },
  callText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  company: { ...typography.supporting },
  created: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16 },
  panel: { flexDirection: 'row', gap: spacing(3), borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5) },
  tile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  overline: { ...typography.overline },
  value: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 19, marginTop: 2 },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16, marginTop: 2 },
  linkPanel: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing(3.5), minHeight: 48 },
  linkText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  note: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5) },
  bill: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5) },
  billTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(2) },
  billTotal: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 20 },
  billLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(2), borderTopWidth: 1 },
  billKey: { fontFamily: 'Manrope_500Medium', fontSize: 13 },
  billVal: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  pdfLink: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(2) },
  heading: { ...typography.heading, fontSize: 16, lineHeight: 22, marginTop: spacing(2) },
  optionList: { gap: spacing(2) },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: 16, padding: spacing(3), minHeight: 52 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optionName: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  optionStatus: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  helper: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5) },
  actionCell: { flexBasis: '47%', flexGrow: 1 },
  auditRow: { flexDirection: 'row', gap: spacing(3) },
  auditRail: { width: 20, alignItems: 'center' },
  auditLine: { width: 2, flex: 1, minHeight: 12, marginVertical: 2 },
  auditText: { flex: 1, paddingBottom: spacing(2.5) },
  auditTitle: { fontFamily: 'Manrope_700Bold', fontSize: 13, lineHeight: 18 },
  auditWhen: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16 },
  errorText: { ...typography.caption, textAlign: 'center', marginVertical: spacing(3) },
  sticky: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1, paddingTop: spacing(2.5), paddingHorizontal: spacing(5) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing(4) },
  sheetTile: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  sheetTitle: { ...typography.heading, fontSize: 20, lineHeight: 26 },
  sheetBody: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20, marginTop: spacing(1.5), marginBottom: spacing(4.5) },
  sheetButtons: { flexDirection: 'row', gap: spacing(3) },
});
