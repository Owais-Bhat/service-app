import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import * as Location from 'expo-location';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import ServicePickerModal, { PickedService } from './ServicePickerModal';
import PhotoPicker from './PhotoPicker';
import CalendarPickerModal from './CalendarPickerModal';
import { IconName } from '../theme/icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import {
  updateTaskStatus,
  saveDeviceInfo,
  computeBill,
  haversineKm,
  generatePaymentLinkForBill,
  TaskItem,
  StatusOption,
  PaymentMethod,
  ResolveBill,
} from '../api/tasks';
import { checkPaymentStatus } from '../api/payments';
import { validateCoupon } from '../api/coupons';
import { generateBillPdf, billWhatsAppCaption, BillPdfData } from '../api/bills';
import { markDeviceTaken } from '../api/deviceTracking';
import { ApiError } from '../api/client';

const BUSINESS_NAME = 'Networking Experts';

const DEVICE_TYPE_CHIPS = ['CCTV DVR', 'CCTV Camera', 'NVR', 'Router', 'Video Door Phone', 'Biometric'];

// Distinct accent per status option (+ the Device Service tile) so the
// option list reads as a set of colored 3D chips rather than one flat list.
const OPTION_ACCENT: Record<StatusOption | 'device', string> = {
  in_progress: '#e08a14',
  resolved: brand.primary,
  reschedule: '#2e9bff',
  issue_not_resolved: semantic.danger,
  case_closed: '#6d8278',
  foc: brand.primary,
  device: '#7c5cfc',
};

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
  const { user } = useAuth();
  const isGig = user?.worker_type === 'gig';
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
  const [showCalendar, setShowCalendar] = useState(false);
  const [billNo, setBillNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Device Service — a separate action, not a ticket status (the ticket
  // stays whatever it currently is). No bill/payment fields here at all.
  const [deviceType, setDeviceType] = useState(item.deviceType || '');
  const [deviceSerialNo, setDeviceSerialNo] = useState(item.deviceSerialNo || '');
  const [deviceDesc, setDeviceDesc] = useState('');
  const [devicePhoto, setDevicePhoto] = useState<string | null>(null);
  const alreadyTaken = item.deviceStatus === 'taken' || item.deviceStatus === 'in_service';

  // Bill fields (only used when status === 'resolved')
  const [companyName, setCompanyName] = useState(item.companyName || 'Networking Experts');
  const [services, setServices] = useState<PickedService[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [extraCost, setExtraCost] = useState('');
  const [extraReason, setExtraReason] = useState('');
  const [transportKm, setTransportKm] = useState('');
  const [locatingKm, setLocatingKm] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(isGig ? 'online' : 'cash');

  // Admin discount coupon — validated server-side, stacks with the manual
  // employee discount (same combination rule as web).
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Online payment link — generating it is a separate step from resolving:
  // the ticket only actually resolves once the customer pays (poll below),
  // matching web's Save-button gating exactly.
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const finalizingRef = useRef(false);

  // Bill PDF + WhatsApp — same server-rendered invoice web generates
  // (/api/bills/generate), independent of payment method or resolve state.
  const [billPdfUrl, setBillPdfUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const bill = useMemo(
    () =>
      computeBill({
        companyName,
        services,
        extraCost: Number(extraCost) || 0,
        transportKm: Number(transportKm) || 0,
        manualDiscount: Number(discountAmount) || 0,
        couponDiscount: couponApplied?.discount || 0,
        couponLabel: couponApplied?.label,
      }),
    [companyName, services, extraCost, transportKm, discountAmount, couponApplied],
  );

  const buildResolveBill = (): ResolveBill => ({
    companyName,
    services,
    extraCost: Number(extraCost) || 0,
    extraReason: extraReason.trim() || undefined,
    transportKm: Number(transportKm) || 0,
    manualDiscount: Number(discountAmount) || 0,
    discountReason: discountReason.trim() || undefined,
    couponDiscount: couponApplied?.discount || 0,
    couponLabel: couponApplied?.label,
    couponCode: couponApplied?.code,
    paymentMethod,
  });

  const removeService = (id: string) => setServices((prev) => prev.filter((s) => s.id !== id));

  const buildBillPdfData = (): BillPdfData => ({
    customer: {
      name: item.fullName,
      phone: item.phone || '',
      location: item.location || '',
      company: companyName,
      device_type: deviceType,
      device_serial: deviceSerialNo,
      service_item: item.serviceItem || '',
      ticket_no: item.ticketNo || '',
    },
    technician: user?.full_name || 'Technician',
    services: services.map((s) => ({ name: s.label, cost: s.cost })),
    servicesSubtotal: bill.servicesSubtotal,
    extra: Number(extraCost) || 0,
    extraReason: extraReason.trim(),
    platform: bill.platformFee,
    km: Number(transportKm) || 0,
    transport: bill.transportFee,
    taxable: bill.servicesSubtotal + (Number(extraCost) || 0) + bill.platformFee + bill.transportFee,
    gst: bill.gst,
    discount: bill.discount,
    discountLabel: couponApplied?.label || (Number(discountAmount) > 0 ? 'Employee discount' : ''),
    discountReason: discountReason.trim(),
    total: bill.total,
    paymentLink: paymentLink || '',
    paymentStatus: paymentConfirmed ? 'paid' : paymentMethod === 'cash' ? 'paid' : 'unpaid',
  });

  // Shared by the bill PDF, payment-link, and final-save actions so "extra
  // cost needs a reason, same as discount" (and every other bill guard)
  // can't drift between the three places a bill gets validated.
  const validateBillFields = (): string | null => {
    if (!companyName.trim()) return 'Company name is required to resolve';
    if (services.length === 0 && !(Number(extraCost) > 0)) return 'Add at least one service, or an extra charge';
    if (Number(extraCost) > 0 && !extraReason.trim()) return 'Enter a reason for the extra cost';
    if (Number(discountAmount) > 0 && !discountReason.trim()) return 'Enter a reason for the discount';
    return null;
  };

  const handleGenerateBillPdf = async () => {
    const validationError = validateBillFields();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setGeneratingPdf(true);
    try {
      const url = await generateBillPdf(buildBillPdfData(), item.inquiryId);
      setBillPdfUrl(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the bill PDF — check your connection');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleShareBillWhatsApp = () => {
    if (!billPdfUrl) return;
    const phone = (item.phone || '').replace(/\D/g, '');
    if (!phone) {
      setError('This customer has no phone number on file');
      return;
    }
    const caption = billWhatsAppCaption(BUSINESS_NAME, buildBillPdfData(), billPdfUrl);
    Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(caption)}`);
  };

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponMsg({ text: 'Enter a coupon code', ok: false });
      return;
    }
    setCouponChecking(true);
    setCouponMsg(null);
    try {
      // Coupons are measured against the pre-discount gross total.
      const grossBase = computeBill({
        companyName,
        services,
        extraCost: Number(extraCost) || 0,
        transportKm: Number(transportKm) || 0,
        manualDiscount: 0,
        couponDiscount: 0,
      }).total;
      const result = await validateCoupon(code, grossBase);
      if (!result.valid) {
        setCouponMsg({ text: result.error || 'Invalid coupon', ok: false });
        return;
      }
      setCouponApplied({ code, discount: result.discount || 0, label: result.label || `Coupon ${code}` });
      setCouponMsg({ text: `Applied: -${inr(result.discount || 0)}`, ok: true });
    } finally {
      setCouponChecking(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponApplied(null);
    setCouponCode('');
    setCouponMsg(null);
  };

  const handleGenerateLink = async () => {
    if (!item.inquiryId) return;
    const validationError = validateBillFields();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setGeneratingLink(true);
    try {
      const { shortUrl } = await generatePaymentLinkForBill(item, buildResolveBill());
      setPaymentLink(shortUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate payment link — check your connection');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCheckPayment = async (silent: boolean) => {
    if (!item.inquiryId || finalizingRef.current) return;
    if (!silent) setCheckingPayment(true);
    try {
      const res = await checkPaymentStatus(item.inquiryId);
      if (res.payment_status === 'paid' && !finalizingRef.current) {
        finalizingRef.current = true;
        setPaymentConfirmed(true);
        try {
          await updateTaskStatus(item, { status: 'resolved', detail: detail.trim(), bill: buildResolveBill() });
          onSaved();
        } catch {
          // Payment landed but the final resolve write failed — leave
          // paymentConfirmed true so the (now-enabled) Save button lets the
          // employee retry without waiting on the poll again.
          finalizingRef.current = false;
        }
      }
    } catch {
      // Silent poll failures are expected on a flaky connection — the next
      // tick tries again. The manual re-check button surfaces a real error.
      if (!silent) setError('Could not check payment status — check your connection');
    } finally {
      if (!silent) setCheckingPayment(false);
    }
  };

  useEffect(() => {
    if (!paymentLink || paymentConfirmed) return;
    handleCheckPayment(true);
    const poll = setInterval(() => handleCheckPayment(true), 3000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentLink, paymentConfirmed]);

  const handleAutoKm = async () => {
    if (item.customerLat == null || item.customerLng == null) {
      setError("This customer has no saved location to measure from");
      return;
    }
    setLocatingKm(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setError('Location permission is required for Auto km');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const km = haversineKm(pos.coords.latitude, pos.coords.longitude, item.customerLat, item.customerLng);
      setTransportKm(km.toFixed(1));
    } catch {
      setError('Could not get your location — check your connection');
    } finally {
      setLocatingKm(false);
    }
  };

  const handleMarkDeviceTaken = async () => {
    if (!item.inquiryId) return;
    setError(null);
    setSaving(true);
    try {
      await markDeviceTaken(item.inquiryId, deviceDesc.trim(), devicePhoto);
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
      if (!scheduledAt) {
        setError('Pick the new visit date & time');
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
      const validationError = validateBillFields();
      if (validationError) {
        setError(validationError);
        return;
      }
      if (paymentMethod === 'online' && !paymentConfirmed) {
        setError('Generate a payment link and wait for the customer to pay before saving');
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
        bill: status === 'resolved' ? buildResolveBill() : undefined,
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
        <Animated.View entering={ZoomIn.duration(360).springify().damping(15).mass(0.85)} style={styles.modalCardWrap}>
          <GlassSurface style={styles.modalCard} borderRadius={radius.lg}>
            <View style={[styles.modalHeaderRow, { borderBottomColor: theme.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Update Status</Text>
                <Text style={[styles.modalSub, { color: theme.text3 }]}>{item.fullName} · {item.ticketNo || 'No ticket'}</Text>
              </View>
              <PressScale onPress={onDismiss}>
                <View style={[styles.closeBtn, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                  <Icon name="close" size={13} color={theme.text3} />
                </View>
              </PressScale>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {item.reopened ? (
                <View style={styles.reopenedBanner}>
                  <Icon name="alert" size={14} color={semantic.warning} />
                  <Text style={styles.reopenedBannerText}>Reopened — complete as free rework (FOC), no new bill.</Text>
                </View>
              ) : null}

              <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(3) }]}>New Status</Text>
              <View style={styles.optionList}>
                {options.map((opt, idx) => {
                  const active = mode === 'status' && status === opt.key;
                  const accent = OPTION_ACCENT[opt.key];
                  return (
                    <Animated.View key={opt.key} entering={FadeInUp.delay(idx * 55).duration(360).springify().damping(15)}>
                      <PressScale onPress={() => { setMode('status'); setStatus(opt.key); }}>
                        <View
                          style={[
                            styles.optionRow,
                            active && styles.optionRowActiveShadow,
                            { borderColor: active ? accent : theme.line, backgroundColor: active ? `${accent}1a` : theme.panel2, shadowColor: accent },
                          ]}
                        >
                          <View style={[styles.optionIconChip, { backgroundColor: active ? accent : `${theme.text3}1f` }]}>
                            <Icon name={opt.icon} size={15} color={active ? '#fff' : theme.text3} />
                          </View>
                          <Text style={[styles.optionText, { color: active ? accent : theme.text }]}>{opt.label}</Text>
                          {active ? (
                            <View style={[styles.optionCheckBadge, { backgroundColor: accent }]}>
                              <Icon name="check" size={11} color="#fff" />
                            </View>
                          ) : null}
                        </View>
                      </PressScale>
                    </Animated.View>
                  );
                })}
                {item.inquiryId ? (
                  <Animated.View entering={FadeInUp.delay(options.length * 55).duration(360).springify().damping(15)}>
                    <PressScale onPress={() => setMode('device')}>
                      <View
                        style={[
                          styles.optionRow,
                          mode === 'device' && styles.optionRowActiveShadow,
                          { borderColor: mode === 'device' ? OPTION_ACCENT.device : theme.line, backgroundColor: mode === 'device' ? `${OPTION_ACCENT.device}1a` : theme.panel2, shadowColor: OPTION_ACCENT.device },
                        ]}
                      >
                        <View style={[styles.optionIconChip, { backgroundColor: mode === 'device' ? OPTION_ACCENT.device : `${theme.text3}1f` }]}>
                          <Icon name="device" size={15} color={mode === 'device' ? '#fff' : theme.text3} />
                        </View>
                        <Text style={[styles.optionText, { color: mode === 'device' ? OPTION_ACCENT.device : theme.text }]}>Device Service</Text>
                        {mode === 'device' ? (
                          <View style={[styles.optionCheckBadge, { backgroundColor: OPTION_ACCENT.device }]}>
                            <Icon name="check" size={11} color="#fff" />
                          </View>
                        ) : null}
                      </View>
                    </PressScale>
                  </Animated.View>
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

                  <View style={{ marginTop: spacing(3) }}>
                    <PhotoPicker label="Device Photo (when taken)" value={devicePhoto} onChange={setDevicePhoto} />
                  </View>

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
                <Pressable onPress={() => setShowCalendar(true)} style={[styles.input, styles.scheduleInput, { borderColor: theme.line }]}>
                  <Icon name="calendar" size={15} color={brand.primary} />
                  <Text style={[styles.scheduleInputText, { color: scheduledAt ? theme.text : theme.text3 }]}>
                    {scheduledAt || 'Tap to pick a date & time'}
                  </Text>
                </Pressable>
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
                <PressScale onPress={() => setShowPicker(true)}>
                  <View style={styles.addServiceBtn}>
                    <View style={styles.addServiceBadge}>
                      <Text style={styles.addServiceBadgeText}>+</Text>
                    </View>
                    <Text style={styles.addServiceText}>Add Service</Text>
                    <Icon name="chevron-right" size={16} color="#ffffff" />
                  </View>
                </PressScale>

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
                    <View style={styles.transportLabelRow}>
                      <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Transport (km)</Text>
                      <Pressable onPress={handleAutoKm} disabled={locatingKm} style={styles.autoKmBtn}>
                        {locatingKm ? (
                          <ActivityIndicator size="small" color={brand.primary} />
                        ) : (
                          <>
                            <Icon name="crosshair" size={11} color={brand.primary} />
                            <Text style={[styles.autoKmText, { color: brand.primary }]}>Auto</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
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
                    placeholder="Reason for extra cost (required)"
                    placeholderTextColor={theme.text3}
                    value={extraReason}
                    onChangeText={setExtraReason}
                  />
                ) : null}

                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Redeem Coupon</Text>
                <View style={styles.couponRow}>
                  <TextInput
                    style={[styles.input, styles.couponInput, { color: theme.text, borderColor: theme.line }]}
                    placeholder="e.g. SAVE50"
                    placeholderTextColor={theme.text3}
                    autoCapitalize="characters"
                    value={couponCode}
                    onChangeText={setCouponCode}
                    editable={!couponApplied}
                  />
                  <Pressable
                    onPress={couponApplied ? handleRemoveCoupon : handleApplyCoupon}
                    disabled={couponChecking}
                    style={[styles.couponBtn, { backgroundColor: couponApplied ? semantic.danger : brand.primary, opacity: couponChecking ? 0.7 : 1 }]}
                  >
                    {couponChecking ? <ActivityIndicator size="small" color="#fff" /> : (
                      <Text style={styles.couponBtnText}>{couponApplied ? 'Remove' : 'Apply'}</Text>
                    )}
                  </Pressable>
                </View>
                {couponMsg ? (
                  <Text style={[styles.couponMsg, { color: couponMsg.ok ? semantic.success : semantic.danger }]}>{couponMsg.text}</Text>
                ) : null}

                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Employee Discount</Text>
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

                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Payment Method</Text>
                <View style={styles.paymentRow}>
                  {(isGig ? (['online'] as PaymentMethod[]) : (['cash', 'online'] as PaymentMethod[])).map((m) => {
                    const active = paymentMethod === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setPaymentMethod(m)}
                        style={[styles.paymentPill, { borderColor: active ? brand.primary : theme.line, backgroundColor: active ? `${brand.primary}1a` : theme.panel2 }]}
                      >
                        <Icon name={m === 'cash' ? 'wallet' : 'receipt'} size={14} color={active ? brand.primary : theme.text3} />
                        <Text style={[styles.paymentPillText, { color: active ? brand.primary : theme.text }]}>{m === 'cash' ? 'Cash' : 'Online'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {isGig ? (
                  <Text style={[styles.paymentHint, { color: theme.text3 }]}>Gig workers are online-payment only.</Text>
                ) : null}

                {paymentMethod === 'cash' ? (
                  <Text style={[styles.paymentHint, { color: theme.text3 }]}>
                    Saving marks this {inr(bill.total)} as collected in cash automatically.
                  </Text>
                ) : (
                  <View style={[styles.onlineBox, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                    {paymentConfirmed ? (
                      <View style={styles.paidRow}>
                        <Icon name="check" size={16} color={semantic.success} />
                        <Text style={[styles.paidText, { color: semantic.success }]}>Payment received — saving will resolve this ticket.</Text>
                      </View>
                    ) : paymentLink ? (
                      <>
                        <Text style={[styles.linkLabel, { color: theme.text3 }]}>Payment Link</Text>
                        <Text style={[styles.linkValue, { color: brand.primary }]} numberOfLines={1}>{paymentLink}</Text>
                        <Image
                          source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentLink)}` }}
                          style={styles.qr}
                        />
                        <Pressable
                          onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent('Please use this link to pay for your service: ' + paymentLink)}`)}
                          style={[styles.waBtn, { backgroundColor: '#25D366' }]}
                        >
                          <Icon name="whatsapp" size={15} color="#fff" filled />
                          <Text style={styles.waBtnText}>Share via WhatsApp</Text>
                        </Pressable>
                        <View style={styles.waitingRow}>
                          {checkingPayment ? <ActivityIndicator size="small" color={semantic.warning} /> : <Icon name="clock" size={13} color={semantic.warning} />}
                          <Text style={[styles.waitingText, { color: semantic.warning }]}>Waiting for payment · auto-checking every 3s</Text>
                          <Pressable onPress={() => handleCheckPayment(false)} hitSlop={8}>
                            <Icon name="refresh" size={14} color={theme.text3} />
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <PressScale onPress={handleGenerateLink} disabled={generatingLink}>
                        <View style={[styles.genLinkBtn, { backgroundColor: brand.primary, opacity: generatingLink ? 0.7 : 1 }]}>
                          <Icon name="receipt" size={15} color="#fff" />
                          <Text style={styles.genLinkBtnText}>{generatingLink ? 'Generating…' : 'Generate Payment Link'}</Text>
                        </View>
                      </PressScale>
                    )}
                  </View>
                )}

                <View style={[styles.receipt, { borderColor: theme.line }]}>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Services</Text>
                    <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.servicesSubtotal)}</Text>
                  </View>
                  {Number(extraCost) > 0 ? (
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Extra charges{extraReason.trim() ? ` (${extraReason.trim()})` : ''}</Text>
                      <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(Number(extraCost))}</Text>
                    </View>
                  ) : null}
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

                {billPdfUrl ? (
                  <View style={styles.pdfRow}>
                    <PressScale onPress={() => Linking.openURL(billPdfUrl)} style={{ flex: 1 }}>
                      <View style={[styles.pdfBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                        <Icon name="receipt" size={14} color={theme.text} />
                        <Text style={[styles.pdfBtnText, { color: theme.text }]}>View PDF</Text>
                      </View>
                    </PressScale>
                    <PressScale onPress={handleShareBillWhatsApp} style={{ flex: 1 }}>
                      <View style={[styles.pdfBtn, { backgroundColor: '#25D366' }]}>
                        <Icon name="whatsapp" size={14} color="#fff" filled />
                        <Text style={[styles.pdfBtnText, { color: '#fff' }]}>Send via WhatsApp</Text>
                      </View>
                    </PressScale>
                  </View>
                ) : (
                  <PressScale onPress={handleGenerateBillPdf} disabled={generatingPdf} style={{ marginTop: spacing(3) }}>
                    <View style={[styles.pdfGenerateBtn, { borderColor: brand.primary, opacity: generatingPdf ? 0.7 : 1 }]}>
                      {generatingPdf ? <ActivityIndicator size="small" color={brand.primary} /> : <Icon name="receipt" size={15} color={brand.primary} />}
                      <Text style={[styles.pdfGenerateBtnText, { color: brand.primary }]}>
                        {generatingPdf ? 'Generating…' : 'Generate Bill PDF'}
                      </Text>
                    </View>
                  </PressScale>
                )}
              </View>
            ) : null}

            {mode === 'status' && (() => {
              const awaitingPayment = status === 'resolved' && paymentMethod === 'online' && !paymentConfirmed;
              return (
                <>
                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <View style={styles.modalActions}>
                    <Pressable onPress={onDismiss} style={[styles.cancelBtn, { borderColor: theme.line }]}>
                      <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
                    </Pressable>
                    <PressScale onPress={handleSave} disabled={saving || awaitingPayment} style={{ flex: 1 }}>
                      <View style={[styles.saveBtn, { backgroundColor: brand.primary, opacity: saving || awaitingPayment ? 0.6 : 1 }]}>
                        <Text style={styles.saveBtnText}>
                          {saving ? 'Saving…' : awaitingPayment ? 'Awaiting Payment…' : 'Save Changes'}
                        </Text>
                      </View>
                    </PressScale>
                  </View>
                </>
              );
            })()}
          </ScrollView>
          </GlassSurface>
        </Animated.View>
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

      {showCalendar && (
        <CalendarPickerModal
          value={scheduledAt}
          onDismiss={() => setShowCalendar(false)}
          onConfirm={(v) => {
            setScheduledAt(v);
            setShowCalendar(false);
          }}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  modalCardWrap: { width: '100%', maxWidth: 440, maxHeight: '86%' },
  modalCard: { width: '100%', maxHeight: '100%', padding: spacing(5) },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), paddingBottom: spacing(3), marginBottom: spacing(1), borderBottomWidth: 1 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { ...typography.heading, fontSize: 18 },
  modalSub: { ...typography.caption, marginTop: spacing(0.5) },
  reopenedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), backgroundColor: 'rgba(224,138,20,0.14)', borderRadius: radius.md, padding: spacing(2.5), marginTop: spacing(3) },
  reopenedBannerText: { flex: 1, fontSize: 12, color: semantic.warning, lineHeight: 17 },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(3), marginBottom: spacing(1) },
  optionList: { gap: spacing(2) },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5) },
  optionRowActiveShadow: { shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.32, shadowRadius: 10, elevation: 5 },
  optionIconChip: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  optionCheckBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
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
  addServiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.5),
    backgroundColor: brand.primary,
    borderRadius: radius.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3),
    marginTop: spacing(1),
    shadowColor: brand.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  addServiceBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  addServiceBadgeText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#fff', marginTop: -2 },
  addServiceText: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
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
  transportLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  autoKmBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), minWidth: 40, justifyContent: 'flex-end' },
  autoKmText: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase' },
  paymentRow: { flexDirection: 'row', gap: spacing(2) },
  paymentPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing(2.5) },
  paymentPillText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  paymentHint: { fontSize: 11, marginTop: spacing(2), lineHeight: 15 },
  scheduleInput: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  scheduleInputText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  couponRow: { flexDirection: 'row', gap: spacing(2) },
  couponInput: { flex: 1 },
  couponBtn: { paddingHorizontal: spacing(4), borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  couponBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#fff' },
  couponMsg: { fontSize: 11, marginTop: spacing(1.5), fontFamily: 'Manrope_600SemiBold' },
  onlineBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5), marginTop: spacing(2), alignItems: 'center' },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  paidText: { flex: 1, fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  linkLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, alignSelf: 'flex-start' },
  linkValue: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', alignSelf: 'stretch', marginTop: spacing(1), marginBottom: spacing(3) },
  qr: { width: 140, height: 140, borderRadius: radius.sm, marginBottom: spacing(3) },
  waBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), alignSelf: 'stretch', height: 42, borderRadius: radius.sm, marginBottom: spacing(3) },
  waBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#fff' },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  waitingText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  genLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), alignSelf: 'stretch', height: 46, borderRadius: radius.md },
  genLinkBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
  pdfGenerateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing(3) },
  pdfGenerateBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  pdfRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 42, borderRadius: radius.sm, borderWidth: 1 },
  pdfBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
});
