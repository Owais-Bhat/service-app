import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import SectionLabel from '../../components/admin/SectionLabel';
import StatGrid from '../../components/admin/StatGrid';
import ImageUploadField from '../../components/admin/ImageUploadField';
import {
  Business,
  BusinessInfo,
  fetchBusiness,
  fetchSeries,
  fetchServiceLedger,
  fetchTaxRateRows,
  fetchWaLog,
  fetchWaSettings,
  saveBusiness,
  saveSeries,
  saveTaxRate,
  saveWaSettings,
  sendWaTest,
  SeriesRow,
  ServiceLedgerStatus,
  setServiceLedgerFrom,
  syncServiceLedger,
  TaxRateRow,
  WaLogRow,
  WaSettings,
} from '../../api/adminBusiness';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { dateTime, shortDate, todayIso } from '../../utils/format';

interface Props {
  onBack: () => void;
}

type Tab = 'business' | 'numbering' | 'tax' | 'service' | 'whatsapp';
const TABS: { key: Tab; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'numbering', label: 'Numbering' },
  { key: 'tax', label: 'Tax Rates' },
  { key: 'service', label: 'Service Income' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

const STATES: [string, string][] = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'],
  ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'],
  ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'],
  ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'],
  ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'],
  ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
];

const DOC_LABEL: Record<string, string> = {
  invoice: 'Tax invoice', estimate: 'Estimate / quotation', sales_order: 'Sales order', delivery_challan: 'Delivery challan',
  credit_note: 'Credit note', debit_note: 'Debit note', proforma: 'Proforma invoice', receipt: 'Payment receipt',
  payment: 'Payment made', purchase_order: 'Purchase order', grn: 'Goods receipt', supplier_bill: 'Supplier bill',
  purchase_return: 'Purchase return', journal: 'Journal entry', expense: 'Expense',
};
const TREATMENT: Record<string, string> = { gst: 'GST', exempt: 'Exempt', nil_rated: 'Nil rated', zero_rated: 'Zero rated', non_gst: 'Non-GST' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (v == null ? '' : String(v));
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

type Form = Record<string, string>;
const toForm = (b: Business): Form => ({
  legal_name: str(b.legal_name), trade_name: str(b.trade_name), registration_type: str(b.registration_type) || 'unregistered',
  gstin: str(b.gstin), pan: str(b.pan), state_code: str(b.state_code), address_line1: str(b.address_line1),
  address_line2: str(b.address_line2), city: str(b.city), pincode: str(b.pincode), phone: str(b.phone), email: str(b.email),
  website: str(b.website), bank_name: str(b.bank_name), bank_account_no: str(b.bank_account_no), bank_ifsc: str(b.bank_ifsc),
  bank_branch: str(b.bank_branch), upi_id: str(b.upi_id), logo_url: str(b.logo_url), signature_url: str(b.signature_url),
  fy_start_month: str(b.fy_start_month) || '4', invoice_footer: str(b.invoice_footer), payment_instructions: str(b.payment_instructions),
});

// Business & Tax Setup: the legal issuer on every document, its numbering, the
// tax rates, the service-income posting date and the WhatsApp templates.
export default function BusinessSettingsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('business');
  const [info, setInfo] = useState<BusinessInfo | null>(null);
  const [form, setForm] = useState<Form>({});
  const [confirmed, setConfirmed] = useState(false);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [rates, setRates] = useState<TaxRateRow[]>([]);
  const [service, setService] = useState<ServiceLedgerStatus | null>(null);
  const [serviceFrom, setServiceFrom] = useState('');
  const [wa, setWa] = useState<WaSettings | null>(null);
  const [waLog, setWaLog] = useState<WaLogRow[]>([]);
  const [waTest, setWaTest] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statePick, setStatePick] = useState(false);
  const [seriesEdit, setSeriesEdit] = useState<SeriesRow | null>(null);
  const [sf, setSf] = useState({ prefix: '', suffix: '', padding: '4', next: '1', reason: '' });
  const [taxEdit, setTaxEdit] = useState<{ open: boolean; from: TaxRateRow | null }>({ open: false, from: null });
  const [tf, setTf] = useState({ name: '', treatment: 'gst', rate: '', from: todayIso(), reason: '' });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const biz = await fetchBusiness();
      if (mine !== seq.current) return;
      setInfo(biz);
      setForm(toForm(biz.business));
      setConfirmed(!!Number(biz.business.setup_complete));
      if (tab === 'numbering') setSeries(await fetchSeries());
      if (tab === 'tax') setRates(await fetchTaxRateRows());
      if (tab === 'service') {
        const s = await fetchServiceLedger();
        setService(s);
        setServiceFrom(s.from || todayIso());
      }
      if (tab === 'whatsapp') {
        const [s, l] = await Promise.all([fetchWaSettings(), fetchWaLog().catch(() => [] as WaLogRow[])]);
        setWa(s);
        setWaLog(l);
      }
      if (mine === seq.current) setError(null);
    } catch (e: unknown) {
      if (mine === seq.current) setError(errText(e, 'Could not load business settings'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: string, label: string, extra: Partial<React.ComponentProps<typeof Field>> = {}) => (
    <Field key={k} label={label} value={form[k] || ''} onChangeText={set(k)} {...extra} />
  );

  const saveBiz = async () => {
    const legal = form.legal_name.trim();
    if (!legal) return Alert.alert('Legal name needed', 'The legal name prints on every invoice.');
    if (form.registration_type === 'regular' && !form.gstin.trim()) {
      return Alert.alert('GSTIN needed', 'A GST-registered business needs its GSTIN.');
    }
    setBusy('business');
    try {
      await saveBusiness({
        ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])),
        gstin: form.gstin.trim().toUpperCase(),
        pan: form.pan.trim().toUpperCase(),
        bank_ifsc: form.bank_ifsc.trim().toUpperCase(),
        fy_start_month: Number(form.fy_start_month) || 4,
        setup_complete: confirmed ? 1 : 0,
      });
      await load();
      Alert.alert('Saved', 'Business details updated.');
    } catch (e: unknown) {
      Alert.alert('Not saved', errText(e, 'Could not save'));
    } finally {
      setBusy(null);
    }
  };

  const openSeries = (r: SeriesRow) => {
    setSeriesEdit(r);
    setSf({ prefix: str(r.prefix), suffix: str(r.suffix), padding: String(r.padding || 4), next: String(r.next_number), reason: '' });
  };
  const saveSeriesRow = async () => {
    if (!seriesEdit) return;
    setBusy('series');
    try {
      await saveSeries(seriesEdit.id, {
        prefix: sf.prefix,
        suffix: sf.suffix,
        padding: Number(sf.padding) || 1,
        next_number: Number(sf.next) || 1,
        reason: sf.reason.trim(),
      });
      setSeriesEdit(null);
      await load();
    } catch (e: unknown) {
      Alert.alert('Not saved', errText(e, 'Could not save the series'));
    } finally {
      setBusy(null);
    }
  };

  const openTax = (from: TaxRateRow | null) => {
    setTaxEdit({ open: true, from });
    setTf({
      name: from?.name || '',
      treatment: from?.treatment || 'gst',
      rate: from ? String(Number(from.rate_bps) / 100) : '',
      from: todayIso(),
      reason: '',
    });
  };
  const saveTax = async () => {
    const rate_bps = Math.round((Number(tf.rate) || 0) * 100);
    if (!DATE_RE.test(tf.from)) return Alert.alert('Date needed', 'Enter the date this rate starts as YYYY-MM-DD.');
    if (!tf.name.trim()) return Alert.alert('Name needed', 'Give the rate a name, for example GST 18%.');
    if (tf.treatment === 'gst' && !rate_bps && !tf.name.includes('0')) return Alert.alert('Rate needed', 'Enter the rate percentage.');
    setBusy('tax');
    try {
      await saveTaxRate({
        name: tf.name.trim(),
        treatment: tf.treatment,
        rate_bps,
        effective_from: tf.from,
        reason: tf.reason.trim(),
        supersedes_id: taxEdit.from?.id,
      });
      setTaxEdit({ open: false, from: null });
      await load();
    } catch (e: unknown) {
      Alert.alert('Not saved', errText(e, 'Could not save the tax rate'));
    } finally {
      setBusy(null);
    }
  };

  const saveService = async (from: string | null, done: string) => {
    if (from && !DATE_RE.test(from)) return Alert.alert('Date needed', 'Enter the date as YYYY-MM-DD.');
    setBusy('service');
    try {
      await setServiceLedgerFrom(from);
      await load();
      Alert.alert('Done', done);
    } catch (e: unknown) {
      Alert.alert('Not saved', errText(e, 'Could not save'));
    } finally {
      setBusy(null);
    }
  };
  const syncNow = async () => {
    setBusy('sync');
    try {
      const out = await syncServiceLedger();
      await load();
      Alert.alert('Synced', out.checked ? `${out.synced} posted, ${out.blocked} need attention` : 'Everything is already up to date');
    } catch (e: unknown) {
      Alert.alert('Sync failed', errText(e, 'Could not sync'));
    } finally {
      setBusy(null);
    }
  };

  const collectWa = () =>
    wa && {
      enabled: wa.enabled,
      phone_number_id: str(wa.phone_number_id).trim(),
      templates: wa.templates.map((t) => ({ purpose: t.purpose, message_id: str(t.message_id).trim(), enabled: !!t.enabled })),
    };
  const patchTemplate = (purpose: string, patch: Partial<WaSettings['templates'][number]>) =>
    setWa((w) => (w ? { ...w, templates: w.templates.map((t) => (t.purpose === purpose ? { ...t, ...patch } : t)) } : w));
  const saveWa = async () => {
    const body = collectWa();
    if (!body) return;
    setBusy('wa');
    try {
      await saveWaSettings(body);
      await load();
      Alert.alert('Saved', 'WhatsApp settings saved.');
    } catch (e: unknown) {
      Alert.alert('Not saved', errText(e, 'Could not save'));
    } finally {
      setBusy(null);
    }
  };
  const testWa = async (purpose: string) => {
    const phone = (waTest[purpose] || '').trim();
    const body = collectWa();
    if (!phone) return Alert.alert('Number needed', 'Type your own mobile number to receive the test.');
    if (!body) return;
    setBusy(`test-${purpose}`);
    try {
      await saveWaSettings(body);
      await sendWaTest(purpose, phone);
      Alert.alert('Test sent', 'Check your WhatsApp.');
    } catch (e: unknown) {
      Alert.alert('Test failed', errText(e, 'Could not send the test'));
    } finally {
      setBusy(null);
      load();
    }
  };

  const b = info?.business;
  const byYear = series.reduce<Record<string, SeriesRow[]>>((acc, s) => {
    (acc[s.fy_label] ||= []).push(s);
    return acc;
  }, {});
  const live = rates.filter((r) => !r.effective_to);
  const past = rates.filter((r) => r.effective_to);
  const waReady = !!wa && wa.enabled && !!wa.phone_number_id && wa.api_key_set && wa.templates.some((t) => t.message_id && t.enabled);

  const rateRow = (r: TaxRateRow) => (
    <ListRow
      key={r.id}
      icon="pricetag"
      title={r.name}
      subtitle={`${TREATMENT[r.treatment] || r.treatment}${r.treatment === 'gst' ? ` · ${Number(r.rate_bps) / 100}%` : ''}`}
      meta={`From ${shortDate(r.effective_from)} · ${r.effective_to ? `to ${shortDate(r.effective_to)}` : 'current'}`}
      badge={r.is_default ? { label: 'Default', color: semantic.success } : undefined}
      footer={r.effective_to ? undefined : <ActionButton label="Change rate" tone="neutral" onPress={() => openTax(r)} />}
    />
  );

  return (
    <AdminScreen
      title="Business & Tax Setup"
      subtitle={b ? (Number(b.setup_complete) ? 'Setup confirmed' : 'Setup incomplete') : undefined}
      onBack={onBack}
      onRefresh={load}
      loading={loading && !info}
      error={error}
      toolbar={<FilterChips items={TABS} activeKey={tab} onSelect={(k) => setTab(k as Tab)} />}
    >
      {info && (info.setup_pending || []).length > 0 ? (
        <>
          <SectionLabel>Still needed before tax documents can be issued</SectionLabel>
          {(info.setup_pending || []).map((p) => (
            <ListRow key={p} icon="alert" iconColor={semantic.warning} title={p} />
          ))}
        </>
      ) : null}

      {tab === 'business' && info ? (
        <View>
          <SectionLabel>Legal identity</SectionLabel>
          {text('legal_name', 'Legal name *', { hint: 'Exactly as registered — prints on the invoice' })}
          {text('trade_name', 'Trade name')}
          <Text style={[styles.cap, { color: theme.text2 }]}>Registration</Text>
          <FilterChips
            items={[
              { key: 'unregistered', label: 'Not GST registered' },
              { key: 'regular', label: 'Regular (GST)' },
              { key: 'composition', label: 'Composition' },
            ]}
            activeKey={form.registration_type}
            onSelect={set('registration_type')}
          />
          {text('gstin', 'GSTIN', { autoCapitalize: 'characters', hint: '15 characters — checked before it is saved' })}
          {text('pan', 'PAN', { autoCapitalize: 'characters' })}
          <ActionButton
            label={`State: ${STATES.find(([c]) => c === form.state_code)?.[1] || 'Not set'}`}
            tone="neutral"
            onPress={() => setStatePick(true)}
          />
          <Text style={[styles.hint, { color: theme.text3 }]}>Decides CGST+SGST versus IGST on every sale</Text>

          <SectionLabel>Address & contact</SectionLabel>
          {text('address_line1', 'Address line 1')}
          {text('address_line2', 'Address line 2')}
          {text('city', 'City')}
          {text('pincode', 'Pincode', { keyboardType: 'number-pad' })}
          {text('phone', 'Phone', { keyboardType: 'phone-pad' })}
          {text('email', 'Email', { keyboardType: 'email-address', autoCapitalize: 'none' })}
          {text('website', 'Website', { autoCapitalize: 'none' })}

          <SectionLabel>Money & documents</SectionLabel>
          {text('bank_name', 'Bank name')}
          {text('bank_account_no', 'Account number', { keyboardType: 'number-pad' })}
          {text('bank_ifsc', 'IFSC', { autoCapitalize: 'characters' })}
          {text('bank_branch', 'Branch')}
          {text('upi_id', 'UPI ID', { autoCapitalize: 'none' })}
          <ImageUploadField label="Logo" value={form.logo_url || null} onChange={(u) => set('logo_url')(u || '')} hint="Printed top-left on every document. A PNG about 400px wide works well." />
          <ImageUploadField label="Signature" value={form.signature_url || null} onChange={(u) => set('signature_url')(u || '')} hint="Printed above Authorised signatory. A transparent PNG looks best." />
          <Text style={[styles.cap, { color: theme.text2 }]}>Financial year starts</Text>
          <FilterChips
            items={[
              { key: '4', label: 'April (India)' },
              { key: '1', label: 'January' },
            ]}
            activeKey={String(Number(form.fy_start_month) || 4)}
            onSelect={set('fy_start_month')}
          />
          <Text style={[styles.hint, { color: theme.text3 }]}>Current year: {info.fy_label}</Text>
          {text('invoice_footer', 'Invoice footer / terms', { multiline: true })}
          {text('payment_instructions', 'Payment instructions', { multiline: true })}

          <View style={styles.switchRow}>
            <Switch value={confirmed} onValueChange={setConfirmed} trackColor={{ true: brand.primary }} />
            <Text style={[styles.switchText, { color: theme.text }]}>I confirm these are the correct legal details for issuing documents</Text>
          </View>
          <ActionButton label="Save business details" busy={busy === 'business'} onPress={saveBiz} />
          <Text style={[styles.hint, { color: theme.text3 }]}>
            Tax features stay locked until this is confirmed. An invoice issuer is a legal fact, not a default.
          </Text>
        </View>
      ) : null}

      {tab === 'numbering' ? (
        <View>
          {series.length === 0 ? <EmptyNote text="No series yet — they are created the first time each document type is raised" icon="list" /> : null}
          {Object.entries(byYear)
            .sort((a, c) => c[0].localeCompare(a[0]))
            .map(([year, list]) => (
              <View key={year}>
                <SectionLabel>{`${year} · ${list.length} series`}</SectionLabel>
                {list.map((s) => (
                  <ListRow
                    key={s.id}
                    icon="list"
                    title={DOC_LABEL[s.doc_type] || s.doc_type}
                    subtitle={`Next: ${s.prefix || ''}${String(s.next_number).padStart(s.padding || 1, '0')}${s.suffix || ''}`}
                    meta={`Prefix ${s.prefix || '—'}`}
                    onPress={() => openSeries(s)}
                  />
                ))}
              </View>
            ))}
          <Text style={[styles.hint, { color: theme.text3 }]}>
            Numbers are handed out one at a time by the database, so two documents can never share a number. Lowering the next number asks for a reason and is recorded.
          </Text>
        </View>
      ) : null}

      {tab === 'tax' ? (
        <View>
          <ActionButton label="Add rate" onPress={() => openTax(null)} />
          <SectionLabel>{`In force · ${live.length}`}</SectionLabel>
          {live.length === 0 ? <EmptyNote text="No tax rates" icon="pricetag" /> : live.map(rateRow)}
          {past.length ? <SectionLabel>{`Superseded · ${past.length}`}</SectionLabel> : null}
          {past.map(rateRow)}
          <Text style={[styles.hint, { color: theme.text3 }]}>
            Changing a rate never rewrites an old document: it closes the current rate the day before the new one starts.
          </Text>
        </View>
      ) : null}

      {tab === 'service' && service ? (
        <View>
          <ListRow
            icon={service.enabled ? 'check-circle' : 'alert'}
            iconColor={service.enabled ? semantic.success : semantic.warning}
            title="Service & installation income in the ledger"
            subtitle={service.enabled ? `On from ${shortDate(service.from)}` : 'Off — tickets are not being posted'}
          />
          <Text style={[styles.hint, { color: theme.text3 }]}>
            Every billed ticket and installation is written into the books: the bill, the payment and the cash handed in. Only tickets billed on or after the date below are posted.
          </Text>
          <Field label="Post tickets billed from" value={serviceFrom} onChangeText={setServiceFrom} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
          <View style={styles.actions}>
            <ActionButton label="Save date" busy={busy === 'service'} onPress={() => saveService(serviceFrom, `Posting tickets billed from ${serviceFrom}`)} />
            <ActionButton label="Sync now" tone="neutral" busy={busy === 'sync'} onPress={syncNow} />
            {service.enabled ? <ActionButton label="Switch off" tone="danger" onPress={() => saveService(null, 'Switched off')} /> : null}
          </View>
          <StatGrid
            items={[
              { label: 'Bills in the books', value: service.billed },
              { label: 'Payments recorded', value: service.collected },
              { label: 'Need attention', value: service.attention.length, color: service.attention.length ? semantic.danger : undefined },
            ]}
          />
          {service.attention.length ? <SectionLabel>Could not be posted</SectionLabel> : null}
          {service.attention.map((a) => (
            <ListRow
              key={a.source_id}
              icon="alert"
              iconColor={semantic.danger}
              title={a.ticket_ref || a.source_id.slice(0, 8)}
              subtitle={a.note || undefined}
              meta={a.source_type === 'installation' ? 'Installation' : 'Service'}
            />
          ))}
        </View>
      ) : null}

      {tab === 'whatsapp' && wa ? (
        <View>
          <ListRow
            icon="whatsapp"
            iconColor={waReady ? semantic.success : semantic.warning}
            title="WhatsApp sending (Fast2SMS)"
            subtitle={waReady ? 'Ready' : 'Not set up'}
          />
          {wa.api_key_set ? null : <ListRow icon="alert" iconColor={semantic.danger} title="The Fast2SMS API key is not set on the server, so nothing can be sent." />}
          <Text style={[styles.hint, { color: theme.text3 }]}>
            Create each template in your Fast2SMS dashboard with the suggested wording, wait for approval, then paste its MESSAGE ID here.
          </Text>
          <View style={styles.switchRow}>
            <Switch value={wa.enabled} onValueChange={(v) => setWa({ ...wa, enabled: v })} trackColor={{ true: brand.primary }} />
            <Text style={[styles.switchText, { color: theme.text }]}>Sending is switched on</Text>
          </View>
          <Field
            label="WhatsApp phone number id"
            value={str(wa.phone_number_id)}
            onChangeText={(v) => setWa({ ...wa, phone_number_id: v })}
            keyboardType="number-pad"
            hint="The long number shown against your WhatsApp number in Fast2SMS"
          />
          {wa.templates.map((t) => (
            <View key={t.purpose}>
              <SectionLabel>{t.label}</SectionLabel>
              <Field
                label="Message ID"
                value={str(t.message_id)}
                onChangeText={(v) => patchTemplate(t.purpose, { message_id: v })}
                keyboardType="number-pad"
                hint="The short MESSAGE ID in Fast2SMS — not the long Template ID"
              />
              <View style={styles.switchRow}>
                <Switch value={!!t.enabled} onValueChange={(v) => patchTemplate(t.purpose, { enabled: v })} trackColor={{ true: brand.primary }} />
                <Text style={[styles.switchText, { color: theme.text }]}>Use it</Text>
              </View>
              <Text style={[styles.hint, { color: theme.text3 }]}>
                Variables in order: {t.vars.map((v, i) => `{{${i + 1}}} ${v}`).join(' · ')}
              </Text>
              <Text style={[styles.hint, { color: theme.text2 }]} selectable>
                {t.suggested}
              </Text>
              <Field
                label="Try it on your own phone"
                value={waTest[t.purpose] || ''}
                onChangeText={(v) => setWaTest((m) => ({ ...m, [t.purpose]: v }))}
                keyboardType="phone-pad"
                placeholder="Your 10-digit mobile"
              />
              <ActionButton label="Send test" tone="neutral" busy={busy === `test-${t.purpose}`} onPress={() => testWa(t.purpose)} />
            </View>
          ))}
          <View style={styles.saveGap}>
            <ActionButton label="Save WhatsApp settings" busy={busy === 'wa'} onPress={saveWa} />
          </View>
          <SectionLabel>Recent messages</SectionLabel>
          {waLog.length === 0 ? <EmptyNote text="Nothing sent yet" icon="chat" /> : null}
          {waLog.map((m, i) => (
            <ListRow
              key={`${m.created_at}-${i}`}
              icon="chat"
              title={wa.templates.find((t) => t.purpose === m.purpose)?.label || m.purpose}
              subtitle={`${m.phone}${m.party_name ? ` · ${m.party_name}` : ''}`}
              meta={`${dateTime(m.created_at)}${m.error ? ` · ${m.error}` : ''}`}
              badge={
                m.status === 'sent'
                  ? { label: 'Accepted', color: semantic.success }
                  : m.status === 'failed'
                    ? { label: 'Failed', color: semantic.danger }
                    : { label: m.status, color: semantic.warning }
              }
            />
          ))}
        </View>
      ) : null}

      <FormSheet visible={statePick} title="State" onClose={() => setStatePick(false)}>
        <ListRow
          title="Not set"
          onPress={() => {
            set('state_code')('');
            setStatePick(false);
          }}
        />
        {STATES.map(([code, name]) => (
          <ListRow
            key={code}
            title={name}
            subtitle={code}
            onPress={() => {
              set('state_code')(code);
              setStatePick(false);
            }}
          />
        ))}
      </FormSheet>

      <FormSheet
        visible={!!seriesEdit}
        title={seriesEdit ? DOC_LABEL[seriesEdit.doc_type] || seriesEdit.doc_type : ''}
        subtitle={seriesEdit?.fy_label}
        onClose={() => setSeriesEdit(null)}
        footer={<ActionButton label="Save" busy={busy === 'series'} onPress={saveSeriesRow} grow />}
      >
        <Field label="Prefix" value={sf.prefix} onChangeText={(v) => setSf({ ...sf, prefix: v })} autoCapitalize="characters" />
        <Field label="Suffix" value={sf.suffix} onChangeText={(v) => setSf({ ...sf, suffix: v })} />
        <Field label="Digits" value={sf.padding} onChangeText={(v) => setSf({ ...sf, padding: v })} keyboardType="number-pad" />
        <Field label="Next number" value={sf.next} onChangeText={(v) => setSf({ ...sf, next: v })} keyboardType="number-pad" />
        <Field label="Reason" value={sf.reason} onChangeText={(v) => setSf({ ...sf, reason: v })} hint="Needed if you lower the next number" />
        <Text style={[styles.hint, { color: theme.text2 }]}>
          Next document: {sf.prefix}
          {String(Number(sf.next) || 1).padStart(Number(sf.padding) || 1, '0')}
          {sf.suffix}
        </Text>
      </FormSheet>

      <FormSheet
        visible={taxEdit.open}
        title={taxEdit.from ? `Change ${taxEdit.from.name}` : 'New tax rate'}
        onClose={() => setTaxEdit({ open: false, from: null })}
        footer={<ActionButton label="Save" busy={busy === 'tax'} onPress={saveTax} grow />}
      >
        {taxEdit.from ? (
          <Text style={[styles.hint, { color: theme.text3 }]}>
            The current rate stays on record and closes the day before the new one starts. Documents already raised keep the rate they were raised at.
          </Text>
        ) : null}
        <Field label="Name" value={tf.name} onChangeText={(v) => setTf({ ...tf, name: v })} placeholder="e.g. GST 18%" />
        <Text style={[styles.cap, { color: theme.text2 }]}>Treatment</Text>
        {taxEdit.from ? (
          <Text style={[styles.hint, { color: theme.text3 }]}>{TREATMENT[tf.treatment] || tf.treatment}</Text>
        ) : (
          <FilterChips
            items={Object.entries(TREATMENT).map(([key, label]) => ({ key, label }))}
            activeKey={tf.treatment}
            onSelect={(v) => setTf({ ...tf, treatment: v })}
          />
        )}
        <Field label="Rate %" value={tf.rate} onChangeText={(v) => setTf({ ...tf, rate: v })} keyboardType="decimal-pad" />
        <Field label="Effective from" value={tf.from} onChangeText={(v) => setTf({ ...tf, from: v })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        <Field label="Reason" value={tf.reason} onChangeText={(v) => setTf({ ...tf, reason: v })} placeholder="e.g. notification 0X/2026" />
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  cap: { ...typography.caption, fontWeight: '700', marginTop: spacing(2), marginBottom: spacing(1) },
  hint: { ...typography.caption, marginVertical: spacing(1) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginVertical: spacing(2) },
  switchText: { ...typography.body, flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) },
  saveGap: { marginTop: spacing(3) },
});
