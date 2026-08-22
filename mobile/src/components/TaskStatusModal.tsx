import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import ServicePickerModal, { PickedService } from './ServicePickerModal';
import { IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { updateTaskStatus, saveDeviceInfo, computeBill, TaskItem, StatusOption } from '../api/tasks';
import { markDeviceTaken } from '../api/deviceTracking';
import { ApiError } from '../api/client';

const DEVICE_TYPE_CHIPS = ['CCTV DVR', 'CCTV Camera', 'NVR', 'Router', 'Video Door Phone', 'Biometric'];

interface Props {
  item: TaskItem;
  onDismiss: () => void;
  onSaved: () => void;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// Shared between ManageTasksScreen (list) and TaskDetailScreen (single-item
// deep link from Today's Route) so both reach the same real status workflow
// instead of each screen growing its own copy.
export default function TaskStatusModal({ item, onDismiss, onSaved }: Props) {
  const { theme } = useTheme();
  const options: { key: StatusOption; label: string; icon: IconName }[] = item.reopened
    ? [{ key: 'foc', label: 'FOC — Free of Cost (rework)', icon: 'check' }]
    : [
        { key: 'in_progress', label: 'In Progress', icon: 'clock' },
        { key: 'resolved', label: 'Resolved — generate bill', icon: 'wallet' },
        { key: 'reschedule', label: 'Reschedule visit', icon: 'calendar' },
        { key: 'issue_not_resolved', label: 'Issue Not Resolved', icon: 'alert' },
        { key: 'case_closed', label: 'Case Closed (final)', icon: 'close' },
      ];
  const [mode, setMode] = useState<'status' | 'device'>('status');
  const [status, setStatus] = useState<StatusOption>(options[0].key);
  const [detail, setDetail] = useState(item.employeeUpdateDetail || '');
  const [scheduledAt, setScheduledAt] = useState('');
  const [billNo, setBillNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Device Service — a separate action, not a ticket status (the ticket
  // stays whatever it currently is). No bill/payment fields here at all.
  const [deviceType, setDeviceType] = useState(item.deviceType || '');
  const [deviceSerialNo, setDeviceSerialNo] = useState(item.deviceSerialNo || '');
  const [deviceDesc, setDeviceDesc] = useState('');
  const alreadyTaken = item.deviceStatus === 'taken' || item.deviceStatus === 'in_service';

  // Bill fields (only used when status === 'resolved')
  const [companyName, setCompanyName] = useState(item.companyName || 'Networking Experts');
  const [services, setServices] = useState<PickedService[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [extraCost, setExtraCost] = useState('');
  const [extraReason, setExtraReason] = useState('');
  const [transportKm, setTransportKm] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  const bill = useMemo(
    () =>
      computeBill({
        companyName,
        services,
        extraCost: Number(extraCost) || 0,
        transportKm: Number(transportKm) || 0,
        discountAmount: Number(discountAmount) || 0,
      }),
    [companyName, services, extraCost, transportKm, discountAmount],
  );

  const removeService = (id: string) => setServices((prev) => prev.filter((s) => s.id !== id));

  const handleMarkDeviceTaken = async () => {
    if (!item.inquiryId) return;
    setError(null);
    setSaving(true);
    try {
      await markDeviceTaken(item.inquiryId, deviceDesc.trim());
      await saveDeviceInfo(item.inquiryId, deviceType, deviceSerialNo);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save — check your connection');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (status === 'reschedule') {
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(scheduledAt.trim())) {
        setError('Enter the new visit time as YYYY-MM-DD HH:MM');
        return;
      }
    } else if (!detail.trim()) {
      setError('Describe the work done — this is required');
      return;
    }
    if (status === 'foc' && !billNo.trim()) {
      setError("Enter the client's existing bill number");
      return;
    }
    if (status === 'resolved') {
      if (!companyName.trim()) {
        setError('Company name is required to resolve');
        return;
      }
      if (services.length === 0 && !(Number(extraCost) > 0)) {
        setError('Add at least one service, or an extra charge');
        return;
      }
      if (Number(discountAmount) > 0 && !discountReason.trim()) {
        setError('Enter a reason for the discount');
        return;
      }
    }
    setSaving(true);
    try {
      await updateTaskStatus(item, {
        status,
        detail: detail.trim(),
        scheduledAt: status === 'reschedule' ? `${scheduledAt.trim()}:00` : undefined,
        billNo: status === 'foc' ? billNo.trim() : undefined,
        bill:
          status === 'resolved'
            ? {
                companyName,
                services,
                extraCost: Number(extraCost) || 0,
                extraReason: extraReason.trim() || undefined,
                transportKm: Number(transportKm) || 0,
                discountAmount: Number(discountAmount) || 0,
                discountReason: discountReason.trim() || undefined,
              }
            : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save — check your connection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.modalCard} borderRadius={radius.lg}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Update Status</Text>
            <Text style={[styles.modalSub, { color: theme.text3 }]}>{item.fullName} · {item.ticketNo || 'No ticket'}</Text>

            {item.reopened ? (
              <View style={styles.reopenedBanner}>
                <Icon name="alert" size={14} color={semantic.warning} />
                <Text style={styles.reopenedBannerText}>Reopened — complete as free rework (FOC), no new bill.</Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(3) }]}>New Status</Text>
            <View style={styles.optionList}>
              {options.map((opt) => {
                const active = mode === 'status' && status === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setMode('status'); setStatus(opt.key); }}
                    style={[styles.optionRow, { borderColor: active ? brand.primary : theme.line, backgroundColor: active ? `${brand.primary}1a` : theme.panel2 }]}
                  >
                    <Icon name={opt.icon} size={16} color={active ? brand.primary : theme.text3} />
                    <Text style={[styles.optionText, { color: active ? brand.primary : theme.text }]}>{opt.label}</Text>
                    {active ? <Icon name="check" size={15} color={brand.primary} /> : null}
                  </Pressable>
                );
              })}
              {item.inquiryId ? (
                <Pressable
                  onPress={() => setMode('device')}
                  style={[styles.optionRow, { borderColor: mode === 'device' ? brand.primary : theme.line, backgroundColor: mode === 'device' ? `${brand.primary}1a` : theme.panel2 }]}
                >
                  <Icon name="device" size={16} color={mode === 'device' ? brand.primary : theme.text3} />
                  <Text style={[styles.optionText, { color: mode === 'device' ? brand.primary : theme.text }]}>Device Service</Text>
                  {mode === 'device' ? <Icon name="check" size={15} color={brand.primary} /> : null}
                </Pressable>
              ) : null}
            </View>

            {mode === 'device' ? (
              alreadyTaken ? (
                <View style={styles.reopenedBanner}>
                  <Icon name="device" size={14} color={semantic.warning} />
                  <Text style={styles.reopenedBannerText}>
                    Device already marked as taken. Manage follow-up / return from Job Tools → Device Follow-up.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Device Type</Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                    placeholder="e.g. Video Door Phone"
                    placeholderTextColor={theme.text3}
                    value={deviceType}
                    onChangeText={setDeviceType}
                  />
                  <View style={styles.chipRow}>
                    {DEVICE_TYPE_CHIPS.map((c) => (
                      <Pressable key={c} onPress={() => setDeviceType(c)} style={[styles.chip, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                        <Text style={[styles.chipText, { color: theme.text2 }]}>{c}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Device Serial No</Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                    placeholder="e.g. SN-12345"
                    placeholderTextColor={theme.text3}
                    value={deviceSerialNo}
                    onChangeText={setDeviceSerialNo}
                  />

                  <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Condition on pickup</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.line }]}
                    placeholder="e.g. CCTV DVR, power issue, scratches on top panel"
                    placeholderTextColor={theme.text3}
                    value={deviceDesc}
                    onChangeText={setDeviceDesc}
                    multiline
                  />

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <View style={styles.modalActions}>
                    <Pressable onPress={onDismiss} style={[styles.cancelBtn, { borderColor: theme.line }]}>
                      <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
                    </Pressable>
                    <PressScale onPress={handleMarkDeviceTaken} disabled={saving} style={{ flex: 1 }}>
                      <View style={[styles.saveBtn, { backgroundColor: brand.primary, opacity: saving ? 0.7 : 1 }]}>
                        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Mark Device Taken'}</Text>
                      </View>
                    </PressScale>
                  </View>
                </>
              )
            ) : status === 'reschedule' ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>New visit date &amp; time</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                  placeholder="YYYY-MM-DD HH:MM"
                  placeholderTextColor={theme.text3}
                  value={scheduledAt}
                  onChangeText={setScheduledAt}
                />
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Work Details / Progress Update</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.line }]}
                  placeholder="Describe what you did… (mandatory)"
                  placeholderTextColor={theme.text3}
                  value={detail}
                  onChangeText={setDetail}
                  multiline
                />
              </>
            )}

            {mode === 'status' && status === 'foc' ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Client Bill Number</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                  placeholder="Enter the customer's existing bill number"
                  placeholderTextColor={theme.text3}
                  value={billNo}
                  onChangeText={setBillNo}
                />
              </>
            ) : null}

            {mode === 'status' && status === 'resolved' ? (
              <View style={[styles.billBlock, { borderColor: theme.line }]}>
                <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Company</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                  placeholder="Company name"
                  placeholderTextColor={theme.text3}
                  value={companyName}
                  onChangeText={setCompanyName}
                />

                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Services</Text>
                {services.map((s) => (
                  <View key={s.id} style={[styles.serviceRow, { borderColor: theme.line }]}>
                    <Text style={[styles.serviceLabel, { color: theme.text }]} numberOfLines={2}>{s.label}</Text>
                    <Text style={[styles.serviceCost, { color: semantic.success }]}>{inr(s.cost)}</Text>
                    <Pressable onPress={() => removeService(s.id)} hitSlop={8}>
                      <Icon name="close" size={14} color={theme.text3} />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => setShowPicker(true)} style={[styles.addServiceBtn, { borderColor: brand.primary }]}>
                  <Icon name="edit" size={14} color={brand.primary} />
                  <Text style={[styles.addServiceText, { color: brand.primary }]}>Add Service</Text>
                </Pressable>

                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Extra Cost</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                      placeholder="₹0"
                      placeholderTextColor={theme.text3}
                      keyboardType="numeric"
                      value={extraCost}
                      onChangeText={setExtraCost}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Transport (km)</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                      placeholder="0"
                      placeholderTextColor={theme.text3}
                      keyboardType="numeric"
                      value={transportKm}
                      onChangeText={setTransportKm}
                    />
                  </View>
                </View>
                {Number(extraCost) > 0 ? (
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.line, marginTop: spacing(2) }]}
                    placeholder="Reason for extra cost"
                    placeholderTextColor={theme.text3}
                    value={extraReason}
                    onChangeText={setExtraReason}
                  />
                ) : null}

                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Discount</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                  placeholder="₹0"
                  placeholderTextColor={theme.text3}
                  keyboardType="numeric"
                  value={discountAmount}
                  onChangeText={setDiscountAmount}
                />
                {Number(discountAmount) > 0 ? (
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.line, marginTop: spacing(2) }]}
                    placeholder="Reason for discount (required)"
                    placeholderTextColor={theme.text3}
                    value={discountReason}
                    onChangeText={setDiscountReason}
                  />
                ) : null}

                <View style={[styles.receipt, { borderColor: theme.line }]}>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Services</Text>
                    <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.servicesSubtotal)}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Platform fee</Text>
                    <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.platformFee)}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Transport</Text>
                    <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.transportFee)}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: theme.text3 }]}>GST (18%)</Text>
                    <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.gst)}</Text>
                  </View>
                  {bill.discount > 0 ? (
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptLabel, { color: semantic.danger }]}>Discount</Text>
                      <Text style={[styles.receiptValue, { color: semantic.danger }]}>-{inr(bill.discount)}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.receiptRow, styles.receiptTotalRow, { borderColor: theme.line }]}>
                    <Text style={[styles.receiptTotalLabel, { color: theme.text }]}>Total</Text>
                    <Text style={[styles.receiptTotalValue, { color: brand.primary }]}>{inr(bill.total)}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {mode === 'status' && (
              <>
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <View style={styles.modalActions}>
                  <Pressable onPress={onDismiss} style={[styles.cancelBtn, { borderColor: theme.line }]}>
                    <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
                  </Pressable>
                  <PressScale onPress={handleSave} disabled={saving} style={{ flex: 1 }}>
                    <View style={[styles.saveBtn, { backgroundColor: brand.primary, opacity: saving ? 0.7 : 1 }]}>
                      <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
                    </View>
                  </PressScale>
                </View>
              </>
            )}
          </ScrollView>
        </GlassSurface>
      </View>

      {showPicker && (
        <ServicePickerModal
          onDismiss={() => setShowPicker(false)}
          onSelect={(s) => {
            setServices((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
            setShowPicker(false);
          }}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  modalCard: { width: '100%', maxWidth: 440, maxHeight: '86%', padding: spacing(5) },
  modalTitle: { ...typography.heading, fontSize: 18 },
  modalSub: { ...typography.caption, marginTop: spacing(0.5) },
  reopenedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), backgroundColor: 'rgba(224,138,20,0.14)', borderRadius: radius.md, padding: spacing(2.5), marginTop: spacing(3) },
  reopenedBannerText: { flex: 1, fontSize: 12, color: semantic.warning, lineHeight: 17 },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(3), marginBottom: spacing(1) },
  optionList: { gap: spacing(2) },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.75) },
  optionText: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  error: { fontSize: 12, color: semantic.danger, marginTop: spacing(2.5) },
  modalActions: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(4) },
  cancelBtn: { paddingHorizontal: spacing(4), height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  saveBtn: { height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
  billBlock: { borderTopWidth: 1, marginTop: spacing(4), paddingTop: spacing(2) },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(2.5), paddingVertical: spacing(2), marginBottom: spacing(1.5) },
  serviceLabel: { flex: 1, fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  serviceCost: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  addServiceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.sm, paddingVertical: spacing(2.25), marginTop: spacing(1) },
  addServiceText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  twoCol: { flexDirection: 'row', gap: spacing(3) },
  receipt: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginTop: spacing(4) },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1) },
  receiptLabel: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  receiptValue: { fontSize: 12, fontFamily: 'Manrope_700Bold' },
  receiptTotalRow: { borderTopWidth: 1, marginTop: spacing(1), paddingTop: spacing(2) },
  receiptTotalLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14 },
  receiptTotalValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5), marginTop: spacing(1.5) },
  chip: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5), borderRadius: radius.full, borderWidth: 1 },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
});
