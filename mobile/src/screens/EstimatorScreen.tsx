import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlowButton from '../components/GlowButton';
import ToolHeader from '../components/ToolHeader';
import Icon from '../components/Icon';
import Field from '../components/admin/Field';
import FilterChips from '../components/admin/FilterChips';
import SectionLabel from '../components/admin/SectionLabel';
import ServicePickerModal, { PickedService } from '../components/ServicePickerModal';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { radius, spacing, typography } from '../theme';
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
const OTHER_KEY = '__other__';
const NO_PRESET_KEY = '__none__';
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

  const companyItems = [
    ...[BUSINESS_NAME, ...companies.map((c) => c.name)].map((name) => ({ key: name, label: name })),
    { key: OTHER_KEY, label: 'Other' },
  ];

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader
        title="Estimator"
        subtitle="Quote without a ticket"
        onBack={onBack}
        actions={[{ icon: 'refresh', label: 'Reset', text: 'Reset', onPress: reset }]}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
      >
        <View style={[styles.infoBanner, { backgroundColor: theme.infoS }]}>
          <Icon name="alert" size={18} color={theme.info} />
          <Text style={[styles.infoText, { color: theme.text }]}>Estimate only — not a tax invoice. Not linked to any ticket.</Text>
        </View>

        <FilterChips
          items={[{ key: 'service', label: 'Service' }, { key: 'installation', label: 'Installation' }]}
          activeKey={jobType}
          onSelect={(k) => setJobType(k as JobType)}
        />

        <Field label="Customer name" value={clientName} onChangeText={setClientName} placeholder="Client name" autoCapitalize="words" />
        <Field label="WhatsApp number" value={clientPhone} onChangeText={setClientPhone} placeholder="10 digit mobile number" keyboardType="phone-pad" />
        {jobType === 'installation' ? (
          <View>
            <Text style={[styles.fieldLabel, { color: theme.text2 }]}>Installation type</Text>
            <FilterChips
              items={INSTALLATION_TYPES.map((t) => ({ key: t.label, label: `${t.icon} ${t.label}` }))}
              activeKey={serviceTitle}
              onSelect={setServiceTitle}
            />
          </View>
        ) : null}
        <Field
          label="Service / project"
          value={serviceTitle}
          onChangeText={setServiceTitle}
          placeholder={jobType === 'installation' ? 'e.g. CCTV Camera Installation' : 'e.g. CCTV service visit'}
        />
        <Field label="Location" value={location} onChangeText={setLocation} placeholder="Client location" />
        <View>
          <Text style={[styles.fieldLabel, { color: theme.text2 }]}>Company</Text>
          <FilterChips
            items={companyItems}
            activeKey={isOtherCompany ? OTHER_KEY : companyName}
            onSelect={(k) => (k === OTHER_KEY ? setIsOtherCompany(true) : selectCompany(k))}
          />
        </View>
        {isOtherCompany ? <Field label="Company name" value={customCompany} onChangeText={setCustomCompany} placeholder="Company name" autoCapitalize="words" /> : null}

        <View>
          <SectionLabel>Services</SectionLabel>
          <Panel style={styles.list}>
            {services.length === 0 ? (
              <Text style={[styles.emptyRow, { color: theme.text3 }]}>No services added yet.</Text>
            ) : (
              services.map((s) => (
                <View key={s.id} style={[styles.itemRow, { borderBottomColor: theme.line }]}>
                  <View style={styles.itemText}>
                    <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={2}>{s.label}</Text>
                    <Text style={[styles.itemMeta, { color: theme.text3 }]}>{s.qty} × {inr(s.cost)}</Text>
                  </View>
                  <View style={[styles.qtyStepper, { borderColor: theme.border }]}>
                    <Pressable onPress={() => changeQty(s.id, -1)} style={styles.qtyBtn} accessibilityLabel={`Less ${s.label}`} hitSlop={4}>
                      <Text style={[styles.qtyBtnText, { color: theme.text }]}>−</Text>
                    </Pressable>
                    <Text style={[styles.qtyValue, { color: theme.text }]}>{s.qty}</Text>
                    <Pressable onPress={() => changeQty(s.id, 1)} style={styles.qtyBtn} accessibilityLabel={`More ${s.label}`} hitSlop={4}>
                      <Text style={[styles.qtyBtnText, { color: theme.text }]}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.itemAmount, { color: theme.text }]}>{inr(s.cost * s.qty)}</Text>
                </View>
              ))
            )}
            <Pressable onPress={() => setShowPicker(true)} style={({ pressed }) => [styles.addRow, pressed && styles.pressed]} accessibilityRole="button">
              <Icon name="add" size={18} color={theme.accent} />
              <Text style={[styles.addText, { color: theme.accent }]}>Add service or item</Text>
            </Pressable>
          </Panel>
        </View>

        <View>
          <SectionLabel>Fees &amp; discount</SectionLabel>
          <View style={styles.fields}>
            <Field label="Extra charge" value={extra} onChangeText={setExtra} placeholder="0" keyboardType="numeric" />
            {Number(extra) > 0 ? <Field label="Extra reason" value={extraReason} onChangeText={setExtraReason} placeholder="Material, labour, etc." /> : null}
            <View style={styles.fieldRow}>
              <View style={styles.half}><Field label="Platform fee" value={platform} onChangeText={setPlatform} keyboardType="numeric" /></View>
              <View style={styles.half}><Field label="GST %" value={gstRate} onChangeText={setGstRate} keyboardType="numeric" /></View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.half}><Field label="Travel (km)" value={km} onChangeText={setKm} placeholder="0" keyboardType="numeric" /></View>
              <View style={styles.half}><Field label="Rate / km" value={kmRate} onChangeText={setKmRate} keyboardType="numeric" /></View>
            </View>
            {presets.length > 0 ? (
              <View>
                <Text style={[styles.fieldLabel, { color: theme.text2 }]}>Admin discount</Text>
                <FilterChips
                  items={[{ key: NO_PRESET_KEY, label: 'None' }, ...presets.map((p) => ({ key: p.id, label: `${p.name} - ${inr(Number(p.amount))}` }))]}
                  activeKey={presetId ?? NO_PRESET_KEY}
                  onSelect={(k) => setPresetId(k === NO_PRESET_KEY ? null : k)}
                />
              </View>
            ) : null}
            <View style={styles.fieldRow}>
              <View style={styles.half}><Field label="Manual discount" value={manualDiscount} onChangeText={setManualDiscount} placeholder="0" keyboardType="numeric" /></View>
              <View style={styles.half}><Field label="Discount reason" value={discountReason} onChangeText={setDiscountReason} placeholder="Required" /></View>
            </View>
          </View>
        </View>

        <View style={[styles.totals, { backgroundColor: theme.panel2 }]}>
          <Text style={[styles.slipClient, { color: theme.text }]}>{clientName.trim() || 'Client'}</Text>
          <Text style={[styles.slipMeta, { color: theme.text3 }]}>
            {(serviceTitle.trim() || 'Service estimate')}{location.trim() ? ` — ${location.trim()}` : ''} · {new Date().toLocaleDateString('en-IN')}
          </Text>
          <TotalRow label="Services" value={inr(bill.servicesSubtotal)} />
          {bill.extra > 0 ? <TotalRow label={`Extra charges${extraReason.trim() ? ` (${extraReason.trim()})` : ''}`} value={inr(bill.extra)} /> : null}
          <TotalRow label="Platform fee" value={inr(bill.platform)} />
          <TotalRow label={`Transport · ${bill.km} km × ${inr(bill.kmRate)}`} value={inr(bill.transport)} />
          {bill.discount > 0 ? <TotalRow label={bill.discountLabel || 'Discount'} value={`-${inr(bill.discount)}`} color={theme.err} /> : null}
          <TotalRow label="Taxable amount" value={inr(bill.taxable)} />
          <TotalRow label={`GST ${bill.gstRate}%`} value={inr(bill.gst)} />
          <View style={[styles.totalRow, { borderTopColor: theme.line }]}>
            <Text style={[styles.totalLabel, { color: theme.text }]}>Estimated total</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{inr(bill.total)}</Text>
          </View>
        </View>

        {error ? (
          <View accessibilityRole="alert" style={[styles.infoBanner, { backgroundColor: theme.errS }]}>
            <Icon name="alert" size={18} color={theme.err} />
            <Text style={[styles.infoText, { color: theme.text }]}>{error}</Text>
          </View>
        ) : null}

        {pdfUrl ? (
          <GlowButton label="View PDF" onPress={() => Linking.openURL(pdfUrl)} variant="secondary" icon="receipt" />
        ) : (
          <GlowButton label="Generate PDF" onPress={handleGeneratePdf} variant="secondary" icon="receipt" loading={generatingPdf} />
        )}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + 12, backgroundColor: theme.surfaceStrong, borderTopColor: theme.line }]}>
        <View style={styles.stickySec}>
          <GlowButton label={copied ? 'Copied!' : 'Copy text'} onPress={handleCopy} variant="secondary" icon={copied ? 'check' : undefined} />
        </View>
        <View style={styles.stickyPri}>
          <GlowButton label="Share on WhatsApp" onPress={handleWhatsApp} icon="whatsapp" />
        </View>
      </View>

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

function TotalRow({ label, value, color }: { label: string; value: string; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.receiptRow}>
      <Text style={[styles.receiptLabel, { color: color ?? theme.text2 }]}>{label}</Text>
      <Text style={[styles.receiptValue, { color: color ?? theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), gap: 18 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md },
  infoText: { ...typography.caption, fontSize: 12, lineHeight: 16, flex: 1 },
  fieldLabel: { ...typography.caption, marginBottom: spacing(1.5) },
  fields: { gap: spacing(3.5) },
  fieldRow: { flexDirection: 'row', gap: spacing(3) },
  half: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  emptyRow: { ...typography.supporting, padding: spacing(3.5) },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { ...typography.rowTitle, fontSize: 14, lineHeight: 19 },
  itemMeta: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  itemAmount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14, minWidth: 64, textAlign: 'right' },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm },
  qtyBtn: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16 },
  qtyValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, minWidth: 18, textAlign: 'center' },
  addRow: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  pressed: { opacity: 0.7 },
  totals: { borderRadius: radius.lg, padding: spacing(3.5), gap: 6 },
  slipClient: { ...typography.rowTitle },
  slipMeta: { ...typography.supporting, fontSize: 12, marginBottom: spacing(1.5) },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(2) },
  receiptLabel: { ...typography.supporting, flex: 1 },
  receiptValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
  totalLabel: { ...typography.rowTitle, fontSize: 16 },
  totalValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 18 },
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 12, paddingTop: 12, paddingHorizontal: 16, borderTopWidth: 1 },
  stickySec: { flex: 1 },
  stickyPri: { flex: 1.6 },
});
