import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import BackLink from '../components/BackLink';
import PressScale from '../components/PressScale';
import Icon from '../components/Icon';
import ServicePickerModal, { PickedService } from '../components/ServicePickerModal';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchCompanies, Company } from '../api/companies';
import { fetchDiscountPresets, DiscountPreset } from '../api/discountPresets';
import { generateBillPdf, BillPdfData } from '../api/bills';
import { ApiError } from '../api/client';

interface Props {
  onBack: () => void;
}

// A picked service plus how many of it — lets "Add" a camera once and bump
// the count instead of reopening the picker per unit (e.g. a 4-camera
// install is one line, not four re-picks of the same item).
interface LineItem extends PickedService {
  qty: number;
}

type JobType = 'service' | 'installation';

// Same categories as the public landing page's Installations section —
// picking one just quick-fills Service/Project, no separate pricing logic
// (web's own Estimator doesn't distinguish service vs installation either).
const INSTALLATION_TYPES = [
  { icon: '📹', label: 'CCTV Camera Installation' },
  { icon: '🌐', label: 'Networking & LAN Setup' },
  { icon: '📶', label: 'WiFi / Access Point Setup' },
  { icon: '🔒', label: 'Biometric & Access Control' },
  { icon: '🔔', label: 'Video Door Phone / Intercom' },
  { icon: '🏠', label: 'Smart Home Automation' },
];

const BUSINESS_NAME = 'Networking Experts';
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// Matches web's renderEmployeeEstimatorTab exactly: build a client-facing
// cost estimate and send it over WhatsApp — nothing is persisted server-side
// (no estimates table), same "ephemeral quote tool" design as before, just
// with the real fields/math/WhatsApp send web actually has.
export default function EstimatorScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();

  const [jobType, setJobType] = useState<JobType>('service');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [serviceTitle, setServiceTitle] = useState('');
  const [location, setLocation] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyName, setCompanyName] = useState(BUSINESS_NAME);
  const [isOtherCompany, setIsOtherCompany] = useState(false);
  const [customCompany, setCustomCompany] = useState('');

  const [services, setServices] = useState<LineItem[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const [extra, setExtra] = useState('');
  const [extraReason, setExtraReason] = useState('');
  const [platform, setPlatform] = useState('50');
  const [km, setKm] = useState('');
  const [kmRate, setKmRate] = useState('5');
  const [gstRate, setGstRate] = useState('18');

  const [presets, setPresets] = useState<DiscountPreset[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [manualDiscount, setManualDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    fetchCompanies().then(setCompanies).catch(() => {});
    fetchDiscountPresets().then(setPresets).catch(() => {});
  }, []);

  const getCompanyName = () => (isOtherCompany ? customCompany.trim() : companyName.trim());

  const selectCompany = (name: string) => {
    setIsOtherCompany(false);
    setCompanyName(name);
    setPlatform(name.trim().toLowerCase().replace(/\s+/g, ' ') === 'networking experts' ? '50' : '100');
  };

  const bill = useMemo(() => {
    const servicesSubtotal = services.reduce((sum, s) => sum + (Number(s.cost) || 0) * s.qty, 0);
    const extraNum = Math.max(0, Number(extra) || 0);
    const platformNum = Math.max(0, Number(platform) || 0);
    const kmNum = Math.max(0, Number(km) || 0);
    const kmRateNum = Math.max(0, Number(kmRate) || 0);
    const transport = Math.round(kmNum * kmRateNum);
    const preset = presets.find((p) => p.id === presetId);
    const presetDiscount = preset ? Number(preset.amount) || 0 : 0;
    const manualNum = Math.max(0, Number(manualDiscount) || 0);
    const preDiscount = servicesSubtotal + extraNum + platformNum + transport;
    const discount = Math.min(preDiscount, presetDiscount + manualNum);
    const gstRateNum = Math.max(0, Number(gstRate) || 0);
    const taxable = Math.max(0, preDiscount - discount);
    const gst = Math.round((taxable * gstRateNum) / 100);
    const total = taxable + gst;
    const labels: string[] = [];
    if (presetDiscount) labels.push(preset?.name || 'Admin discount');
    if (manualNum) labels.push('Manual discount');
    return { servicesSubtotal, extra: extraNum, platform: platformNum, km: kmNum, kmRate: kmRateNum, transport, presetDiscount, manualDiscount: manualNum, discount, discountLabel: labels.join(' + '), taxable, gstRate: gstRateNum, gst, total };
  }, [services, extra, platform, km, kmRate, gstRate, presets, presetId, manualDiscount]);

  const buildMessage = () => {
    const name = clientName.trim() || 'Client';
    const title = serviceTitle.trim() || 'Service estimate';
    const lines = [`Hi ${name},`, `Here is your estimated cost from ${BUSINESS_NAME}.`, '', `Service: ${title}`];
    if (location.trim()) lines.push(`Location: ${location.trim()}`);
    if (getCompanyName()) lines.push(`Company: ${getCompanyName()}`);
    lines.push('', 'Items:');
    if (services.length) {
      services.forEach((s, i) => lines.push(`${i + 1}. ${s.qty > 1 ? `${s.qty}x ` : ''}${s.label} - ${inr(s.cost * s.qty)}`));
    } else lines.push('No itemised service selected');
    if (bill.extra > 0) lines.push(`Extra charge${extraReason.trim() ? ` (${extraReason.trim()})` : ''}: ${inr(bill.extra)}`);
    lines.push('', `Services subtotal: ${inr(bill.servicesSubtotal)}`);
    lines.push(`Platform fee: ${inr(bill.platform)}`);
    lines.push(`Travel: ${bill.km} km x ${inr(bill.kmRate)} = ${inr(bill.transport)}`);
    if (bill.discount > 0) lines.push(`Discount${bill.discountLabel ? ` (${bill.discountLabel})` : ''}: -${inr(bill.discount)}`);
    lines.push(`Taxable amount: ${inr(bill.taxable)}`);
    lines.push(`GST (${bill.gstRate}%): ${inr(bill.gst)}`);
    lines.push(`Estimated total: ${inr(bill.total)}`);
    lines.push('', 'Final bill may change if extra work or material is required.');
    if (pdfUrl) lines.push('', 'View / download this estimate (PDF):', pdfUrl);
    lines.push('', `- ${BUSINESS_NAME}`);
    return lines.join('\n');
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(buildMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    setError(null);
    if (bill.total <= 0) return setError('Add at least one service or charge');
    if (bill.manualDiscount > 0 && !discountReason.trim()) return setError('Enter a reason for the manual discount');
    const digits = clientPhone.replace(/\D/g, '');
    const phone = digits.length > 10 ? digits.slice(-10) : digits;
    if (phone.length !== 10) return setError('Enter a valid 10 digit WhatsApp number');
    Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(buildMessage())}`);
  };

  const reset = () => {
    setJobType('service');
    setClientName(''); setClientPhone(''); setServiceTitle(''); setLocation('');
    setIsOtherCompany(false); setCompanyName(BUSINESS_NAME); setCustomCompany('');
    setServices([]);
    setExtra(''); setExtraReason(''); setPlatform('50'); setKm(''); setKmRate('5'); setGstRate('18');
    setPresetId(null); setManualDiscount(''); setDiscountReason('');
    setError(null); setPdfUrl(null);
  };

  const addService = (s: PickedService) => {
    setPdfUrl(null);
    setServices((prev) => {
      const existing = prev.find((p) => p.id === s.id);
      if (existing) return prev.map((p) => (p.id === s.id ? { ...p, qty: p.qty + 1 } : p));
      return [...prev, { ...s, qty: 1 }];
    });
  };

  const changeQty = (id: string, delta: number) => {
    setPdfUrl(null);
    setServices((prev) =>
      prev
        .map((p) => (p.id === id ? { ...p, qty: p.qty + delta } : p))
        .filter((p) => p.qty > 0),
    );
  };

  const buildPdfData = (): BillPdfData => ({
    customer: {
      name: clientName.trim() || 'Client',
      phone: clientPhone.trim(),
      location: location.trim(),
      company: getCompanyName(),
      device_type: '',
      device_serial: '',
      service_item: serviceTitle.trim() || 'Service estimate',
      ticket_no: '',
    },
    technician: user?.full_name || 'Technician',
    services: services.map((s) => ({ name: s.qty > 1 ? `${s.qty}x ${s.label}` : s.label, cost: s.cost * s.qty })),
    servicesSubtotal: bill.servicesSubtotal,
    extra: bill.extra,
    extraReason: extraReason.trim(),
    platform: bill.platform,
    km: bill.km,
    transport: bill.transport,
    taxable: bill.taxable,
    gst: bill.gst,
    discount: bill.discount,
    discountLabel: bill.discountLabel,
    discountReason: discountReason.trim(),
    total: bill.total,
    paymentLink: '',
    paymentStatus: 'estimate',
  });

  const handleGeneratePdf = async () => {
    setError(null);
    if (bill.total <= 0) return setError('Add at least one service or charge');
    setGeneratingPdf(true);
    try {
      const url = await generateBillPdf(buildPdfData(), null, `Estimate-${(clientName.trim() || 'client').replace(/\s+/g, '_')}.pdf`);
      setPdfUrl(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the PDF — check your connection');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(12) }}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <BackLink onPress={onBack} />
            <Text style={[styles.title, { color: theme.text }]}>Estimator</Text>
            <Text style={[styles.caption, { color: theme.text3 }]}>Prepare a cost estimate and send it to the client on WhatsApp.</Text>
          </View>
          <PressScale onPress={reset}>
            <View style={[styles.resetBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="refresh" size={15} color={theme.text2} />
            </View>
          </PressScale>
        </View>

        <Animated.View entering={FadeInUp.duration(400).springify().damping(15)}>
          <GlassCard shadow style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="user" size={13} color={brand.primary} />
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Client Details</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Job Type</Text>
            <View style={[styles.jobTypeRow, { marginBottom: spacing(3) }]}>
              <PressScale onPress={() => setJobType('service')} style={{ flex: 1 }}>
                <View style={[styles.jobTypePill, jobType === 'service' && styles.pillActiveShadow, { backgroundColor: jobType === 'service' ? brand.primary : theme.panel2, borderColor: jobType === 'service' ? brand.primary : theme.line }]}>
                  <Icon name="wrench" size={13} color={jobType === 'service' ? '#fff' : theme.text2} />
                  <Text style={[styles.jobTypeText, { color: jobType === 'service' ? '#fff' : theme.text2 }]}>Service</Text>
                </View>
              </PressScale>
              <PressScale onPress={() => setJobType('installation')} style={{ flex: 1 }}>
                <View style={[styles.jobTypePill, jobType === 'installation' && styles.pillActiveShadow, { backgroundColor: jobType === 'installation' ? brand.primary : theme.panel2, borderColor: jobType === 'installation' ? brand.primary : theme.line }]}>
                  <Icon name="box" size={13} color={jobType === 'installation' ? '#fff' : theme.text2} />
                  <Text style={[styles.jobTypeText, { color: jobType === 'installation' ? '#fff' : theme.text2 }]}>Installation</Text>
                </View>
              </PressScale>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Client Name</Text>
            <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} placeholder="Client name" placeholderTextColor={theme.text3} value={clientName} onChangeText={setClientName} />
            <Text style={[styles.fieldLabel, { color: theme.text3 }]}>WhatsApp Number</Text>
            <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} placeholder="10 digit mobile number" placeholderTextColor={theme.text3} value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
            <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Service / Project</Text>
            {jobType === 'installation' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing(2) }}>
                <View style={styles.pillRow}>
                  {INSTALLATION_TYPES.map((t) => {
                    const active = serviceTitle === t.label;
                    return (
                      <PressScale key={t.label} onPress={() => setServiceTitle(t.label)}>
                        <View style={[styles.pill, active && styles.pillActiveShadow, { backgroundColor: active ? brand.primary : theme.panel2, borderColor: active ? brand.primary : theme.line }]}>
                          <Text style={styles.installEmoji}>{t.icon}</Text>
                          <Text style={[styles.pillText, { color: active ? '#fff' : theme.text2 }]}>{t.label}</Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </View>
              </ScrollView>
            ) : null}
            <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} placeholder={jobType === 'installation' ? 'e.g. CCTV Camera Installation' : 'e.g. CCTV service visit'} placeholderTextColor={theme.text3} value={serviceTitle} onChangeText={setServiceTitle} />
            <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Location</Text>
            <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} placeholder="Client location" placeholderTextColor={theme.text3} value={location} onChangeText={setLocation} />

            <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Company</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing(1) }}>
              <View style={styles.pillRow}>
                {[BUSINESS_NAME, ...companies.map((c) => c.name)].map((name) => {
                  const active = !isOtherCompany && companyName === name;
                  return (
                    <PressScale key={name} onPress={() => selectCompany(name)}>
                      <View style={[styles.pill, active && styles.pillActiveShadow, { backgroundColor: active ? brand.primary : theme.panel2, borderColor: active ? brand.primary : theme.line }]}>
                        <Text style={[styles.pillText, { color: active ? '#fff' : theme.text2 }]}>{name}</Text>
                      </View>
                    </PressScale>
                  );
                })}
                <PressScale onPress={() => setIsOtherCompany(true)}>
                  <View style={[styles.pill, isOtherCompany && styles.pillActiveShadow, { backgroundColor: isOtherCompany ? brand.primary : theme.panel2, borderColor: isOtherCompany ? brand.primary : theme.line }]}>
                    <Text style={[styles.pillText, { color: isOtherCompany ? '#fff' : theme.text2 }]}>Other</Text>
                  </View>
                </PressScale>
              </View>
            </ScrollView>
            {isOtherCompany ? (
              <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line, marginTop: spacing(2) }]} placeholder="Company name" placeholderTextColor={theme.text3} value={customCompany} onChangeText={setCustomCompany} />
            ) : null}
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(60).duration(400).springify().damping(15)}>
          <GlassCard shadow style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="wrench" size={13} color={brand.primary} />
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Services</Text>
            </View>

            {services.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(2) }]}>No services added yet.</Text>
            ) : (
              services.map((s) => (
                <View key={s.id} style={[styles.serviceRow, { borderColor: theme.line }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.serviceLabel, { color: theme.text }]} numberOfLines={2}>{s.label}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>{inr(s.cost)} each</Text>
                  </View>
                  <View style={[styles.qtyStepper, { borderColor: theme.line }]}>
                    <PressScale onPress={() => changeQty(s.id, -1)}>
                      <View style={styles.qtyBtn}>
                        <Text style={[styles.qtyBtnText, { color: theme.text2 }]}>−</Text>
                      </View>
                    </PressScale>
                    <Text style={[styles.qtyValue, { color: theme.text }]}>{s.qty}</Text>
                    <PressScale onPress={() => changeQty(s.id, 1)}>
                      <View style={styles.qtyBtn}>
                        <Text style={[styles.qtyBtnText, { color: theme.text2 }]}>+</Text>
                      </View>
                    </PressScale>
                  </View>
                  <Text style={[styles.serviceCost, { color: brand.primary }]}>{inr(s.cost * s.qty)}</Text>
                </View>
              ))
            )}

            <PressScale onPress={() => setShowPicker(true)} style={{ marginTop: spacing(1) }}>
              <View style={[styles.addServiceBtn, { backgroundColor: brand.primary, shadowColor: brand.primary }]}>
                <Icon name="edit" size={14} color="#fff" />
                <Text style={styles.addServiceBtnText}>Add Service</Text>
              </View>
            </PressScale>
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(120).duration(400).springify().damping(15)}>
          <GlassCard shadow style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="receipt" size={13} color={brand.primary} />
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Fees & Discount</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Extra Charge</Text>
            <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} placeholder="0" placeholderTextColor={theme.text3} value={extra} onChangeText={setExtra} keyboardType="numeric" />
            {Number(extra) > 0 ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Extra Reason</Text>
                <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} placeholder="Material, labour, etc." placeholderTextColor={theme.text3} value={extraReason} onChangeText={setExtraReason} />
              </>
            ) : null}

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Platform Fee</Text>
                <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} value={platform} onChangeText={setPlatform} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>GST %</Text>
                <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} value={gstRate} onChangeText={setGstRate} keyboardType="numeric" />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Travel (km)</Text>
                <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} placeholder="0" placeholderTextColor={theme.text3} value={km} onChangeText={setKm} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Rate / km</Text>
                <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} value={kmRate} onChangeText={setKmRate} keyboardType="numeric" />
              </View>
            </View>

            {presets.length > 0 ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Admin Discount</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing(2) }}>
                  <View style={styles.pillRow}>
                    <PressScale onPress={() => setPresetId(null)}>
                      <View style={[styles.pill, !presetId && styles.pillActiveShadow, { backgroundColor: !presetId ? brand.primary : theme.panel2, borderColor: !presetId ? brand.primary : theme.line }]}>
                        <Text style={[styles.pillText, { color: !presetId ? '#fff' : theme.text2 }]}>None</Text>
                      </View>
                    </PressScale>
                    {presets.map((p) => {
                      const active = presetId === p.id;
                      return (
                        <PressScale key={p.id} onPress={() => setPresetId(p.id)}>
                          <View style={[styles.pill, active && styles.pillActiveShadow, { backgroundColor: active ? brand.primary : theme.panel2, borderColor: active ? brand.primary : theme.line }]}>
                            <Text style={[styles.pillText, { color: active ? '#fff' : theme.text2 }]}>{p.name} - {inr(Number(p.amount))}</Text>
                          </View>
                        </PressScale>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            ) : null}

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Manual Discount</Text>
                <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} placeholder="0" placeholderTextColor={theme.text3} value={manualDiscount} onChangeText={setManualDiscount} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Discount Reason</Text>
                <TextInput style={[styles.input, { color: theme.text, borderColor: theme.line }]} placeholder="Required" placeholderTextColor={theme.text3} value={discountReason} onChangeText={setDiscountReason} />
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(180).duration(400).springify().damping(15)}>
          <GlassCard shadow style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="receipt" size={13} color={brand.primary} />
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Estimate Preview</Text>
            </View>

            <View style={[styles.slip, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <View style={styles.slipHeadRow}>
                <View>
                  <Text style={[styles.slipBusiness, { color: theme.text }]}>{BUSINESS_NAME}</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>Cost Estimate</Text>
                </View>
                <Text style={[styles.caption, { color: theme.text3 }]}>{new Date().toLocaleDateString('en-IN')}</Text>
              </View>
              <Text style={[styles.slipClient, { color: theme.text }]}>{clientName.trim() || 'Client'}</Text>
              <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(3) }]}>
                {(serviceTitle.trim() || 'Service estimate')}{location.trim() ? ` — ${location.trim()}` : ''}
              </Text>

              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Services</Text>
                <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.servicesSubtotal)}</Text>
              </View>
              {bill.extra > 0 ? (
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Extra charges{extraReason.trim() ? ` (${extraReason.trim()})` : ''}</Text>
                  <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.extra)}</Text>
                </View>
              ) : null}
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Platform fee</Text>
                <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.platform)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Travel ({bill.km} km × {inr(bill.kmRate)})</Text>
                <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.transport)}</Text>
              </View>
              {bill.discount > 0 ? (
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { color: semantic.danger }]}>{bill.discountLabel || 'Discount'}</Text>
                  <Text style={[styles.receiptValue, { color: semantic.danger }]}>-{inr(bill.discount)}</Text>
                </View>
              ) : null}
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.text3 }]}>Taxable amount</Text>
                <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.taxable)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.text3 }]}>GST ({bill.gstRate}%)</Text>
                <Text style={[styles.receiptValue, { color: theme.text }]}>{inr(bill.gst)}</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptTotalRow, { borderColor: theme.line }]}>
                <Text style={[styles.receiptTotalLabel, { color: theme.text }]}>Estimated Total</Text>
                <Text style={[styles.receiptTotalValue, { color: brand.primary }]}>{inr(bill.total)}</Text>
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actionRow}>
              <PressScale onPress={handleCopy} style={{ flex: 1 }}>
                <View style={[styles.copyBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                  <Icon name={copied ? 'check' : 'receipt'} size={14} color={theme.text} />
                  <Text style={[styles.copyBtnText, { color: theme.text }]}>{copied ? 'Copied!' : 'Copy Text'}</Text>
                </View>
              </PressScale>
              <PressScale onPress={handleWhatsApp} style={{ flex: 1 }}>
                <View style={[styles.waBtn, { backgroundColor: '#25D366', shadowColor: '#25D366' }]}>
                  <Icon name="whatsapp" size={14} color="#fff" filled />
                  <Text style={styles.waBtnText}>Send WhatsApp</Text>
                </View>
              </PressScale>
            </View>

            {pdfUrl ? (
              <PressScale onPress={() => Linking.openURL(pdfUrl)} style={{ marginTop: spacing(2.5) }}>
                <View style={[styles.pdfBtn, { borderColor: brand.primary }]}>
                  <Icon name="receipt" size={14} color={brand.primary} />
                  <Text style={[styles.pdfBtnText, { color: brand.primary }]}>View PDF</Text>
                </View>
              </PressScale>
            ) : (
              <PressScale onPress={handleGeneratePdf} disabled={generatingPdf} style={{ marginTop: spacing(2.5) }}>
                <View style={[styles.pdfBtn, { borderColor: theme.line, opacity: generatingPdf ? 0.7 : 1 }]}>
                  {generatingPdf ? <ActivityIndicator size="small" color={theme.text} /> : <Icon name="receipt" size={14} color={theme.text} />}
                  <Text style={[styles.pdfBtnText, { color: theme.text }]}>{generatingPdf ? 'Generating…' : 'Generate PDF'}</Text>
                </View>
              </PressScale>
            )}
          </GlassCard>
        </Animated.View>
      </ScrollView>

      {showPicker && (
        <ServicePickerModal
          onDismiss={() => setShowPicker(false)}
          onSelect={(s) => {
            addService(s);
            setShowPicker(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), marginBottom: spacing(4) },
  title: { ...typography.title, marginTop: spacing(1) },
  caption: { ...typography.caption },
  resetBtn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: spacing(1) },
  section: { marginBottom: spacing(4) },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginBottom: spacing(3) },
  sectionLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing(1) },
  fieldRow: { flexDirection: 'row', gap: spacing(3) },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 44, fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing(3) },
  pillRow: { flexDirection: 'row', gap: spacing(2) },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3), paddingVertical: spacing(1.75), borderRadius: radius.full, borderWidth: 1 },
  pillActiveShadow: { shadowColor: brand.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  pillText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  installEmoji: { fontSize: 14 },
  jobTypeRow: { flexDirection: 'row', gap: spacing(2) },
  jobTypePill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 42, borderRadius: radius.md, borderWidth: 1 },
  jobTypeText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), borderWidth: 1, borderRadius: radius.md, padding: spacing(2.5), marginBottom: spacing(2) },
  serviceLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5 },
  serviceCost: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12.5, minWidth: 64, textAlign: 'right' },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(1) },
  qtyBtn: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15 },
  qtyValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12, minWidth: 16, textAlign: 'center' },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 42, borderRadius: radius.md, borderWidth: 1.5 },
  pdfBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
  addServiceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 44, borderRadius: radius.md, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  addServiceBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
  slip: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5), marginBottom: spacing(3) },
  slipHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(3) },
  slipBusiness: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14 },
  slipClient: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1) },
  receiptLabel: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', flex: 1, marginRight: spacing(2) },
  receiptValue: { fontSize: 12, fontFamily: 'Manrope_700Bold' },
  receiptTotalRow: { borderTopWidth: 1, marginTop: spacing(1), paddingTop: spacing(2) },
  receiptTotalLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13 },
  receiptTotalValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15 },
  error: { ...typography.caption, color: semantic.danger, marginBottom: spacing(2), textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: spacing(2.5) },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 46, borderRadius: radius.md, borderWidth: 1 },
  copyBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
  waBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 46, borderRadius: radius.md, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  waBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: '#fff' },
});
