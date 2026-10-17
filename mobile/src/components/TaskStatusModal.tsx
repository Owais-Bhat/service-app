import React, { useEffect, useMemo, useRef, useState } from 'react';
import { pingAssignmentSeen } from '../api/tasks';
import CustomerEquipment from './CustomerEquipment';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AppModal as Modal } from './AppModal';
import { KeyboardAwareScrollView as ScrollView } from './KeyboardAware';
import * as Location from 'expo-location';
import Icon from './Icon';
import PressScale from './PressScale';
import ServicePickerModal, { PickedService } from './ServicePickerModal';
import PhotoPicker from './PhotoPicker';
import BillItemsEditor from './BillItemsEditor';
import CalendarPickerModal from './CalendarPickerModal';
import { IconName } from '../theme/icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
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
import { fetchInventoryItems, fetchBillItems, saveBillItems, InventoryItem, BillItemLine } from '../api/inventory';
import { markDeviceTaken, fetchDeviceServiceEnabled, setDeviceServiceEnabled } from '../api/deviceTracking';
import { ApiError } from '../api/client';

const BUSINESS_NAME = 'Networking Experts';

const DEVICE_TYPE_CHIPS = ['CCTV DVR', 'CCTV Camera', 'NVR', 'Router', 'Video Door Phone', 'Biometric'];

interface Props {
  item: TaskItem;
  onDismiss: () => void;
  onSaved: (resolvedStatus?: string) => void;
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
  // Tone per status option (design e_status): icon tile tint + selected ring.
  const tone = {
    in_progress: { c: theme.warn, bg: theme.warnS },
    resolved: { c: theme.ok, bg: theme.okS },
    reschedule: { c: theme.info, bg: theme.infoS },
    issue_not_resolved: { c: theme.err, bg: theme.errS },
    case_closed: { c: theme.grey, bg: theme.greyS },
    foc: { c: theme.vio, bg: theme.vioS },
    device: { c: theme.teal, bg: theme.tealS },
  } as const;
  const [mode, setMode] = useState<'status' | 'device'>('status');
  // Whether this ticket is marked as one whose device goes to the service centre.
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [deviceSwitching, setDeviceSwitching] = useState(false);
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
  // Parts fitted on this job. The catalogue is admin's; the technician only
  // picks quantities, and stock moves server-side when the bill saves.
  const [catalogue, setCatalogue] = useState<InventoryItem[]>([]);
  const [billItems, setBillItems] = useState<BillItemLine[]>([]);
  const [gstOn, setGstOn] = useState(true);
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
        itemsSubtotal: billItems.reduce((sum, it) => sum + it.quantity * it.rate, 0),
        gstOn,
        transportKm: Number(transportKm) || 0,
        manualDiscount: Number(discountAmount) || 0,
        couponDiscount: couponApplied?.discount || 0,
        couponLabel: couponApplied?.label,
      }),
    [companyName, services, billItems, gstOn, extraCost, transportKm, discountAmount, couponApplied],
  );

  const buildResolveBill = (): ResolveBill => ({
    companyName,
    services,
    extraCost: Number(extraCost) || 0,
    itemsSubtotal: billItems.reduce((sum, it) => sum + it.quantity * it.rate, 0),
    gstOn,
    extraReason: extraReason.trim() || undefined,
    transportKm: Number(transportKm) || 0,
    manualDiscount: Number(discountAmount) || 0,
    discountReason: discountReason.trim() || undefined,
    couponDiscount: couponApplied?.discount || 0,
    couponLabel: couponApplied?.label,
    couponCode: couponApplied?.code,
    paymentMethod,
  });

  useEffect(() => {
    if (mode !== 'device' || !item.inquiryId || deviceOn !== null) return;
    fetchDeviceServiceEnabled(item.inquiryId).then(setDeviceOn).catch(() => setDeviceOn(true));
  }, [mode, item.inquiryId, deviceOn]);

  // Opening a job is how the office learns it was seen.
  useEffect(() => {
    pingAssignmentSeen('inquiry', item.inquiryId);
  }, [item.inquiryId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cat, existing] = await Promise.all([
          fetchInventoryItems(),
          item.inquiryId ? fetchBillItems('inquiry', item.inquiryId) : Promise.resolve([]),
        ]);
        if (!alive) return;
        setCatalogue(cat);
        setBillItems(existing.map((r) => ({ item_id: r.item_id, name: r.name, quantity: Number(r.quantity), rate: Number(r.rate) })));
      } catch {
        // Inventory is optional — a bill without parts still works.
      }
    })();
    return () => { alive = false; };
  }, [item.inquiryId]);

  // Parts are recorded against the technician the moment the bill is made
  // (payment link or bill PDF), not only once the money arrives: the stock has
  // already left the shelf, so it must show on the employee until it is paid.
  // Saving replaces the job's set, so repeating it can never double-count.
  const recordBillItems = async () => {
    if (!item.inquiryId) return;
    try {
      await saveBillItems('inquiry', item.inquiryId, billItems.filter((it) => it.quantity > 0));
    } catch {
      // The bill itself still goes ahead; the parts just didn't reach stock.
    }
  };

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
      await recordBillItems();
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
      await recordBillItems();
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
          if (item.inquiryId) {
            try { await saveBillItems('inquiry', item.inquiryId, billItems.filter((it) => it.quantity > 0)); } catch { /* bill still saves */ }
          }
          await updateTaskStatus(item, { status: 'resolved', detail: detail.trim(), bill: buildResolveBill() });
          onSaved('resolved');
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
      onSaved('device_taken');
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
      if (status === 'resolved' && item.inquiryId) {
        try {
          await saveBillItems('inquiry', item.inquiryId, billItems.filter((it) => it.quantity > 0));
        } catch {
          // The bill itself still saves; the parts just didn't reach stock.
        }
      }
      await updateTaskStatus(item, {
        status,
        detail: detail.trim(),
        scheduledAt: status === 'reschedule' ? `${scheduledAt.trim()}:00` : undefined,
        billNo: status === 'foc' ? billNo.trim() : undefined,
        bill: status === 'resolved' ? buildResolveBill() : undefined,
      });
      onSaved(status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save — check your connection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
        <View style={styles.modalCardWrap}>
          <View style={[styles.modalCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Update status</Text>
                <Text style={[styles.modalSub, { color: theme.text2 }]}>{item.ticketNo || 'No ticket'} · {item.fullName}</Text>
              </View>
              <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Close" style={[styles.closeBtn, { backgroundColor: theme.panel2 }]}>
                <Icon name="close" size={16} color={theme.text2} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {item.reopened ? (
                <View style={[styles.reopenedBanner, { backgroundColor: theme.warnS }]}>
                  <Icon name="alert" size={14} color={theme.warn} />
                  <Text style={[styles.reopenedBannerText, { color: theme.warn }]}>Reopened — complete as free rework (FOC), no new bill.</Text>
                </View>
              ) : null}

              <CustomerEquipment phone={item.phone} ticketNo={item.ticketNo} />

              <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(3) }]}>New Status</Text>
              <View style={styles.optionList}>
                {options.map((opt) => {
                  const active = mode === 'status' && status === opt.key;
                  const t = tone[opt.key];
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => { setMode('status'); setStatus(opt.key); }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.optionRow,
                        { borderColor: active ? theme.accent : theme.border, borderWidth: active ? 2 : 1, backgroundColor: active ? theme.okS : 'transparent' },
                      ]}
                    >
                      <View style={[styles.optionIconChip, { backgroundColor: t.bg }]}>
                        <Icon name={opt.icon} size={20} color={t.c} />
                      </View>
                      <Text style={[styles.optionText, { color: theme.text }]}>{opt.label}</Text>
                      {active ? (
                        <Icon name="check-circle" size={22} color={theme.accent} filled />
                      ) : (
                        <View style={[styles.radioOff, { borderColor: theme.text3 }]} />
                      )}
                    </Pressable>
                  );
                })}
                {item.inquiryId ? (
                  <Pressable
                    onPress={() => setMode('device')}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: mode === 'device' }}
                    style={[
                      styles.optionRow,
                      { borderColor: mode === 'device' ? theme.accent : theme.border, borderWidth: mode === 'device' ? 2 : 1, backgroundColor: mode === 'device' ? theme.okS : 'transparent' },
                    ]}
                  >
                    <View style={[styles.optionIconChip, { backgroundColor: tone.device.bg }]}>
                      <Icon name="device" size={20} color={tone.device.c} />
                    </View>
                    <Text style={[styles.optionText, { color: theme.text }]}>Device service</Text>
                    {mode === 'device' ? (
                      <Icon name="check-circle" size={22} color={theme.accent} filled />
                    ) : (
                      <View style={[styles.radioOff, { borderColor: theme.text3 }]} />
                    )}
                  </Pressable>
                ) : null}
              </View>

            {mode === 'device' && item.inquiryId && deviceOn !== null ? (
              <View style={[styles.reopenedBanner, { backgroundColor: theme.warnS, justifyContent: 'space-between' }]}>
                <Text style={[styles.reopenedBannerText, { color: theme.warn, flex: 1 }]}>This ticket involves a device for the service centre</Text>
                <Switch
                  value={deviceOn}
                  disabled={deviceSwitching || (alreadyTaken && deviceOn)}
                  trackColor={{ true: theme.accent }}
                  onValueChange={async (v) => {
                    if (!v && alreadyTaken) return;
                    setDeviceSwitching(true);
                    try {
                      await setDeviceServiceEnabled(item.inquiryId as string, v);
                      setDeviceOn(v);
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : 'Could not change this');
                    } finally {
                      setDeviceSwitching(false);
                    }
                  }}
                />
              </View>
            ) : null}
            {mode === 'device' ? (
              alreadyTaken ? (
                <View style={[styles.reopenedBanner, { backgroundColor: theme.warnS }]}>
                  <Icon name="device" size={14} color={theme.warn} />
                  <Text style={[styles.reopenedBannerText, { color: theme.warn }]}>
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
                    {(DEVICE_TYPE_CHIPS.includes(deviceType) ? [deviceType] : DEVICE_TYPE_CHIPS).map((c) => {
                      const active = deviceType === c;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setDeviceType(active ? '' : c)}
                          style={[styles.chip, { borderColor: active ? theme.accent : theme.line, backgroundColor: active ? `${theme.accent}1a` : theme.panel2 }]}
                        >
                          <Text style={[styles.chipText, { color: active ? theme.accent : theme.text2 }]}>{c}</Text>
                          {active ? <Icon name="close" size={11} color={theme.accent} /> : null}
                        </Pressable>
                      );
                    })}
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

                  {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

                  <View style={styles.modalActions}>
                    <Pressable onPress={onDismiss} style={[styles.cancelBtn, { borderColor: theme.line }]}>
                      <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
                    </Pressable>
                    <PressScale onPress={handleMarkDeviceTaken} disabled={saving} style={{ flex: 1 }}>
                      <View style={[styles.saveBtn, { backgroundColor: brand.fill, opacity: saving ? 0.7 : 1 }]}>
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
                  <Icon name="calendar" size={15} color={theme.accent} />
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
                    <Text style={[styles.serviceCost, { color: theme.ok }]}>{inr(s.cost)}</Text>
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

                <BillItemsEditor items={billItems} onChange={setBillItems} catalogue={catalogue} />

                <Pressable onPress={() => setGstOn((v) => !v)} style={styles.gstRow}>
                  <View style={[styles.gstBox, { borderColor: gstOn ? theme.accent : theme.line, backgroundColor: gstOn ? theme.accent : 'transparent' }]}>
                    {gstOn ? <Icon name="check" size={12} color="#fff" /> : null}
                  </View>
                  <Text style={[styles.gstLabel, { color: theme.text2 }]}>Charge GST (18%) on this bill</Text>
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
                    <View style={styles.transportLabelRow}>
                      <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Transport (km)</Text>
                      <Pressable onPress={handleAutoKm} disabled={locatingKm} style={styles.autoKmBtn}>
                        {locatingKm ? (
                          <ActivityIndicator size="small" color={theme.accent} />
                        ) : (
                          <>
                            <Icon name="crosshair" size={11} color={theme.accent} />
                            <Text style={[styles.autoKmText, { color: theme.accent }]}>Auto</Text>
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
                    style={[styles.couponBtn, { backgroundColor: couponApplied ? theme.err : theme.accent, opacity: couponChecking ? 0.7 : 1 }]}
                  >
                    {couponChecking ? <ActivityIndicator size="small" color="#fff" /> : (
                      <Text style={styles.couponBtnText}>{couponApplied ? 'Remove' : 'Apply'}</Text>
                    )}
                  </Pressable>
                </View>
                {couponMsg ? (
                  <Text style={[styles.couponMsg, { color: couponMsg.ok ? theme.ok : theme.err }]}>{couponMsg.text}</Text>
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
                        style={[styles.paymentPill, { borderColor: active ? theme.accent : theme.line, backgroundColor: active ? `${theme.accent}1a` : theme.panel2 }]}
                      >
                        <Icon name={m === 'cash' ? 'wallet' : 'receipt'} size={14} color={active ? theme.accent : theme.text3} />
                        <Text style={[styles.paymentPillText, { color: active ? theme.accent : theme.text }]}>{m === 'cash' ? 'Cash' : 'Online'}</Text>
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
                        <Icon name="check" size={16} color={theme.ok} />
                        <Text style={[styles.paidText, { color: theme.ok }]}>Payment received — saving will resolve this ticket.</Text>
                      </View>
                    ) : paymentLink ? (
                      <>
                        <Text style={[styles.linkLabel, { color: theme.text3 }]}>Payment Link</Text>
                        <Text style={[styles.linkValue, { color: theme.accent }]} numberOfLines={1}>{paymentLink}</Text>
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
                          {checkingPayment ? <ActivityIndicator size="small" color={theme.warn} /> : <Icon name="clock" size={13} color={theme.warn} />}
                          <Text style={[styles.waitingText, { color: theme.warn }]}>Waiting for payment · auto-checking every 3s</Text>
                          <Pressable onPress={() => handleCheckPayment(false)} hitSlop={8}>
                            <Icon name="refresh" size={14} color={theme.text3} />
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <PressScale onPress={handleGenerateLink} disabled={generatingLink}>
                        <View style={[styles.genLinkBtn, { backgroundColor: brand.fill, opacity: generatingLink ? 0.7 : 1 }]}>
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
                      <Text style={[styles.receiptLabel, { color: theme.err }]}>Discount</Text>
                      <Text style={[styles.receiptValue, { color: theme.err }]}>-{inr(bill.discount)}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.receiptRow, styles.receiptTotalRow, { borderColor: theme.line }]}>
                    <Text style={[styles.receiptTotalLabel, { color: theme.text }]}>Total</Text>
                    <Text style={[styles.receiptTotalValue, { color: theme.accent }]}>{inr(bill.total)}</Text>
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
                    <View style={[styles.pdfGenerateBtn, { borderColor: theme.accent, opacity: generatingPdf ? 0.7 : 1 }]}>
                      {generatingPdf ? <ActivityIndicator size="small" color={theme.accent} /> : <Icon name="receipt" size={15} color={theme.accent} />}
                      <Text style={[styles.pdfGenerateBtnText, { color: theme.accent }]}>
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
                  {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

                  <View style={styles.modalActions}>
                    <Pressable onPress={onDismiss} style={[styles.cancelBtn, { borderColor: theme.line }]}>
                      <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
                    </Pressable>
                    <PressScale onPress={handleSave} disabled={saving || awaitingPayment} style={{ flex: 1 }}>
                      <View style={[styles.saveBtn, { backgroundColor: brand.fill, opacity: saving || awaitingPayment ? 0.6 : 1 }]}>
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
          </View>
        </View>
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
  qtyBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16 },
  gstRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(3) },
  gstBox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  gstLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5 },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  pickerCard: { width: '100%', maxWidth: 420, overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), borderBottomWidth: 1 },
  pickerTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3.5), borderBottomWidth: 1 },
  pickerName: { fontFamily: 'Manrope_700Bold', fontSize: 13.5 },
  pickerMeta: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, marginTop: 2 },
  pickerRate: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5 },
  pickerEmpty: { padding: spacing(6), textAlign: 'center', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCardWrap: { width: '100%', maxHeight: '90%' },
  modalCard: { width: '100%', maxHeight: '100%', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderTopWidth: 1, paddingHorizontal: spacing(5), paddingTop: spacing(2.5), paddingBottom: spacing(6) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing(4) },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), marginBottom: spacing(3) },
  closeBtn: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { ...typography.heading, fontSize: 20, lineHeight: 26 },
  modalSub: { ...typography.supporting, marginTop: spacing(0.5) },
  reopenedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), borderRadius: radius.md, padding: spacing(2.5), marginTop: spacing(3) },
  reopenedBannerText: { flex: 1, fontSize: 12, lineHeight: 17 },
  fieldLabel: { ...typography.overline, marginTop: spacing(3.5), marginBottom: spacing(1.5) },
  optionList: { gap: spacing(2) },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), minHeight: 56, borderRadius: 16, padding: spacing(3) },
  optionIconChip: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  radioOff: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  optionText: { flex: 1, ...typography.rowTitle },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3.5), paddingVertical: spacing(2.5), minHeight: 52, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  error: { fontSize: 12, marginTop: spacing(2.5) },
  modalActions: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(4) },
  cancelBtn: { paddingHorizontal: spacing(5), height: 52, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { ...typography.button },
  saveBtn: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { ...typography.button, color: '#fff' },
  billBlock: { borderTopWidth: 1, marginTop: spacing(4), paddingTop: spacing(2) },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(2.5), paddingVertical: spacing(2), marginBottom: spacing(1.5) },
  serviceLabel: { flex: 1, fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  serviceCost: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  addServiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.5),
    backgroundColor: brand.fill,
    borderRadius: radius.md,
    height: 48,
    paddingHorizontal: spacing(3),
    marginTop: spacing(1),
  },
  addServiceBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  addServiceBadgeText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#fff', marginTop: -2 },
  addServiceText: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
  twoCol: { flexDirection: 'row', gap: spacing(3) },
  receipt: { borderWidth: 0, borderRadius: radius.lg, padding: spacing(3.5), marginTop: spacing(4) },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1) },
  receiptLabel: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  receiptValue: { fontSize: 13, fontFamily: 'JetBrainsMono_500Medium' },
  receiptTotalRow: { borderTopWidth: 1, marginTop: spacing(1), paddingTop: spacing(2) },
  receiptTotalLabel: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  receiptTotalValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5), marginTop: spacing(1.5) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5), borderRadius: radius.full, borderWidth: 1 },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  transportLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  autoKmBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), minWidth: 40, justifyContent: 'flex-end' },
  autoKmText: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase' },
  paymentRow: { flexDirection: 'row', gap: spacing(2) },
  paymentPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), borderWidth: 2, borderRadius: radius.md, height: 56 },
  paymentPillText: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
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
  qr: { width: 200, height: 200, borderRadius: radius.lg, backgroundColor: '#ffffff', marginBottom: spacing(3) },
  waBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), alignSelf: 'stretch', height: 52, borderRadius: radius.md, marginBottom: spacing(3) },
  waBtnText: { ...typography.button, color: '#fff' },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  waitingText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  genLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), alignSelf: 'stretch', height: 52, borderRadius: radius.md },
  genLinkBtnText: { ...typography.button, color: '#fff' },
  pdfGenerateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, height: 52 },
  pdfGenerateBtnText: { ...typography.button },
  pdfRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 52, borderRadius: radius.md, borderWidth: 1 },
  pdfBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
