import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChoiceChips, ToggleSwitch } from './FinanceKit';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import FormSheet from './FormSheet';
import Field from './Field';
import ActionButton from './ActionButton';
import SearchField from './SearchField';
import ListRow from './ListRow';
import Icon from '../Icon';
import { fetchItems, fetchParties, ItemRow, PartyRow, rupees } from '../../api/adminBooks';
import {
  amendSales,
  createSales,
  fetchTaxRates,
  issueSales,
  Priced,
  previewSales,
  reviseSales,
  SalesLoaded,
  SalesPayload,
  TaxRate,
  updateSales,
} from '../../api/adminSales';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';
import { inr, todayIso } from '../../utils/format';

interface Props {
  visible: boolean;
  docType: 'invoice' | 'estimate' | 'credit_note';
  existing: SalesLoaded | null;
  onClose: () => void;
  onSaved: (id: string, issued: boolean) => void;
}

interface Line {
  key: string;
  item_id: string | null;
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  rate: string;
  disc: string;
  tax: string; // a rate in basis points, or a treatment name
}

let counter = 0;
const newKey = () => `l${++counter}`;
const blankLine = (tax: string): Line => ({ key: newKey(), item_id: null, description: '', hsn: '', qty: '1', unit: 'pcs', rate: '', disc: '', tax });

const BILL_TYPES: { key: string; label: string; hint: string }[] = [
  { key: 'gst', label: 'GST invoice', hint: 'GST columns (CGST/SGST or IGST) are shown and it counts in the GST returns.' },
  { key: 'non_gst', label: 'Non-GST bill', hint: 'No GST is charged and the bill stays out of the GST returns.' },
  { key: 'service', label: 'Service bill', hint: 'For services. Tick "Charge GST" to show GST on it.' },
];

// The document editor. Lines are typed here but every figure comes back from the
// server's pricing call, so a quotation and the invoice made from it can never
// drift apart. An issued invoice is corrected in place (needs a reason); a sent
// quotation is revised and keeps its number.
export default function SalesEditor({ visible, docType, existing, onClose, onSaved }: Props) {
  const { theme } = useTheme();
  const doc = existing?.document ?? null;
  const type = doc?.doc_type || docType;
  const amending = !!doc && doc.status === 'issued' && doc.doc_type !== 'estimate';
  const revising = !!doc && doc.status !== 'draft' && doc.doc_type === 'estimate';

  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyName, setPartyName] = useState('');
  const [partyQ, setPartyQ] = useState('');
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [date, setDate] = useState(todayIso());
  const [due, setDue] = useState('');
  const [valid, setValid] = useState('');
  const [reference, setReference] = useState('');
  const [billType, setBillType] = useState('gst');
  const [serviceGst, setServiceGst] = useState(true);
  const [showGst, setShowGst] = useState(false);
  const [inclusive, setInclusive] = useState(false);
  const [docDisc, setDocDisc] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [itemQ, setItemQ] = useState('');
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [priced, setPriced] = useState<Priced | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gstRates = useMemo(() => taxRates.filter((t) => t.treatment === 'gst' && !t.effective_to), [taxRates]);
  const defaultTax = String(gstRates.find((r) => Number(r.rate_bps) === 1800)?.rate_bps ?? gstRates[0]?.rate_bps ?? 1800);
  const noTax = billType === 'non_gst' || (billType === 'service' && !serviceGst);
  const infoGst = billType === 'non_gst' && showGst;

  useEffect(() => {
    if (!visible) return;
    Promise.all([fetchTaxRates().catch(() => []), fetchItems().catch(() => [])]).then(([t, i]) => {
      setTaxRates(t);
      setItems(i.filter((x) => Number(x.active) === 1));
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const d = existing?.document;
    setPartyId(d?.party_id || null);
    setPartyName(d?.party_snapshot?.display_name || d?.party_name || '');
    setPartyQ('');
    setDate((d?.doc_date || todayIso()).slice(0, 10));
    setDue((d?.due_date || '').slice(0, 10));
    setValid((d?.valid_until || '').slice(0, 10));
    setReference(d?.reference || '');
    setBillType(d?.bill_type || 'gst');
    setServiceGst(
      d?.bill_type === 'service' ? Number(d.cgst_paise) + Number(d.sgst_paise) + Number(d.utgst_paise) + Number(d.igst_paise) > 0 : true,
    );
    setShowGst(d?.bill_type === 'non_gst' && !!Number(d.show_gst));
    setInclusive(!!d?.prices_include_tax);
    setDocDisc(d?.doc_discount_paise ? String(Number(d.doc_discount_paise) / 100) : '');
    setNotes(d?.notes || '');
    setTerms(d?.terms || '');
    setReason('');
    setPriced(null);
    setPriceError(null);
    setPickFor(null);
    const src = existing?.lines.filter((l) => !l.kind || l.kind === 'item') ?? [];
    setLines(
      src.length
        ? src.map((l) => ({
            key: newKey(),
            item_id: l.item_id,
            description: l.description,
            hsn: l.hsn_sac || '',
            qty: String(Number(l.quantity)),
            unit: l.unit || '',
            rate: l.rate_paise !== undefined ? String(Number(l.rate_paise) / 100) : '',
            disc: l.discount_bps ? String(Number(l.discount_bps) / 100) : '',
            tax: l.tax_treatment && l.tax_treatment !== 'gst' ? l.tax_treatment : String(Number(l.info_tax_bps || l.tax_rate_bps) || 1800),
          }))
        : [blankLine('1800')],
    );
  }, [visible, existing]);

  useEffect(() => {
    if (!partyQ.trim()) return setParties([]);
    const t = setTimeout(() => fetchParties('customer', partyQ.trim()).then((r) => setParties(r.slice(0, 8))).catch(() => setParties([])), 250);
    return () => clearTimeout(t);
  }, [partyQ]);

  const collect = useCallback((): SalesPayload => {
    const cleaned = lines
      .map((l) => {
        const taxValue = noTax && !infoGst ? 'non_gst' : l.tax;
        const isTreatment = Number.isNaN(Number(taxValue));
        return {
          item_id: l.item_id,
          description: l.description.trim(),
          hsn_sac: l.hsn.trim() || null,
          quantity: Number(l.qty) || 0,
          unit: l.unit.trim() || null,
          rate: l.rate || 0,
          discount_bps: Math.round((Number(l.disc) || 0) * 100),
          tax_rate_bps: isTreatment ? 0 : Number(taxValue),
          tax_treatment: isTreatment ? taxValue : 'gst',
        };
      })
      .filter((l) => l.description && l.quantity > 0);
    return {
      doc_type: type,
      bill_type: type === 'credit_note' ? 'gst' : billType,
      show_gst: infoGst,
      party_id: partyId,
      doc_date: date,
      due_date: type === 'estimate' ? null : due || null,
      valid_until: type === 'estimate' ? valid || null : null,
      reference: reference.trim(),
      prices_include_tax: !noTax && inclusive,
      doc_discount: docDisc || 0,
      notes: notes.trim(),
      terms: terms.trim(),
      lines: cleaned,
    };
  }, [lines, noTax, infoGst, type, billType, partyId, date, due, valid, reference, inclusive, docDisc, notes, terms]);

  // Re-price on every change, debounced.
  useEffect(() => {
    if (!visible) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const p = collect();
      if (!p.lines.length) {
        setPriced(null);
        setPriceError(null);
        return;
      }
      try {
        setPriced(await previewSales(p));
        setPriceError(null);
      } catch (e) {
        setPriced(null);
        setPriceError(e instanceof Error ? e.message : 'Could not price this document');
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [visible, collect]);

  const patch = (key: string, p: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const pickItem = (it: ItemRow) => {
    if (!pickFor) return;
    patch(pickFor, {
      item_id: it.id,
      description: it.name,
      unit: it.unit || 'pcs',
      rate: String(Number(it.selling_rate) || ''),
      tax: String(Math.round((Number(it.gst_rate) || 18) * 100)),
    });
    setPickFor(null);
    setItemQ('');
  };

  const matches = useMemo(() => {
    const q = itemQ.trim().toLowerCase();
    if (!pickFor || q.length < 2) return [];
    return items.filter((i) => `${i.name} ${i.sku || ''} ${i.brand || ''} ${i.model || ''}`.toLowerCase().includes(q)).slice(0, 6);
  }, [items, itemQ, pickFor]);

  const taxOptions = useMemo(
    () => [
      ...gstRates.map((r) => ({ key: String(r.rate_bps), label: `${Number(r.rate_bps) / 100}%` })),
      { key: 'exempt', label: 'Exempt' },
      { key: 'nil_rated', label: 'Nil rated' },
      { key: 'non_gst', label: 'Non-GST' },
    ],
    [gstRates],
  );

  const save = async (mode: 'draft' | 'issue' | 'amend' | 'revise') => {
    const p = collect();
    if (!p.party_id) return Alert.alert('Customer', 'Choose the customer');
    if (!p.lines.length) return Alert.alert('Lines', 'Add at least one line with a description and quantity');
    if (mode === 'amend') {
      if (!reason.trim()) return Alert.alert('Reason', 'Say what is being corrected');
      p.reason = reason.trim();
    }
    setBusy(true);
    try {
      if (mode === 'amend' && doc) {
        await amendSales(doc.id, p);
        return onSaved(doc.id, false);
      }
      if (mode === 'revise' && doc) {
        await reviseSales(doc.id, p);
        return onSaved(doc.id, false);
      }
      const saved = doc ? await updateSales(doc.id, p) : await createSales(p);
      const id = saved.document.id;
      if (mode === 'issue') await issueSales(id);
      onSaved(id, mode === 'issue');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const label = type === 'estimate' ? 'quotation' : type === 'credit_note' ? 'credit note' : 'invoice';
  const t = priced?.totals;

  return (
    <FormSheet
      visible={visible}
      title={amending ? `Correct ${label} ${doc?.doc_no || ''}` : revising ? `Revise quotation ${doc?.doc_no || ''}` : doc ? `Edit ${label}` : `New ${label}`}
      onClose={onClose}
      footer={
        <>
          <ActionButton label="Cancel" tone="neutral" onPress={onClose} />
          {amending ? (
            <ActionButton label="Save correction" onPress={() => save('amend')} busy={busy} />
          ) : revising ? (
            <ActionButton label="Save revision" onPress={() => save('revise')} busy={busy} />
          ) : (
            <>
              <ActionButton label="Save draft" tone="neutral" onPress={() => save('draft')} busy={busy} />
              <ActionButton label="Save & issue" tone="success" onPress={() => save('issue')} busy={busy} />
            </>
          )}
        </>
      }
    >
      {amending ? (
        <View style={[styles.notice, { borderColor: theme.warn, backgroundColor: theme.warn + '18' }]}>
          <Text style={[styles.noticeText, { color: theme.text }]}>
            Saving corrects this {label} in place — it keeps its number ({doc?.doc_no}); the old entry in the books is reversed and the corrected one posted.
          </Text>
          <Field label="What is being corrected? (required)" value={reason} onChangeText={setReason} />
        </View>
      ) : null}

      <Text style={[styles.label, { color: theme.text3 }]}>Customer</Text>
      {partyId ? (
        <ListRow
          icon="user"
          title={partyName || 'Customer'}
          footer={revising ? undefined : <ActionButton label="Change customer" tone="neutral" onPress={() => { setPartyId(null); setPartyName(''); }} />}
        />
      ) : (
        <>
          <SearchField value={partyQ} onChangeText={setPartyQ} placeholder="Search customer by name or phone" />
          {parties.map((p) => (
            <ListRow
              key={p.id}
              icon="user"
              title={p.display_name}
              subtitle={p.phone || undefined}
              onPress={() => {
                setPartyId(p.id);
                setPartyName(p.display_name);
                setParties([]);
                setPartyQ('');
              }}
            />
          ))}
        </>
      )}

      <Field label="Date" value={date} onChangeText={setDate} hint="YYYY-MM-DD" />
      {type === 'estimate' ? (
        <Field label="Valid until" value={valid} onChangeText={setValid} hint="YYYY-MM-DD" />
      ) : (
        <Field label="Due date" value={due} onChangeText={setDue} hint="YYYY-MM-DD — from credit terms if blank" />
      )}
      <Field label="Reference" value={reference} onChangeText={setReference} placeholder="Their PO / job no" />

      {type !== 'credit_note' ? (
        <>
          <Text style={[styles.label, { color: theme.text3 }]}>Type of bill</Text>
          <ChoiceChips
            items={BILL_TYPES.map((b) => [b.key, b.label] as [string, string])}
            value={billType}
            onChange={(k) => setBillType(k as typeof billType)}
          />
          <Text style={[styles.hint, { color: theme.text3 }]}>{BILL_TYPES.find((b) => b.key === billType)?.hint}</Text>
          {billType === 'service' ? (
            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: theme.text }]}>Charge GST on this bill</Text>
              <ToggleSwitch value={serviceGst} onValueChange={setServiceGst} />
            </View>
          ) : null}
          {billType === 'non_gst' ? (
            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: theme.text }]}>Show the GST inside the price</Text>
              <ToggleSwitch value={showGst} onValueChange={setShowGst} />
            </View>
          ) : null}
        </>
      ) : null}

      {!noTax ? (
        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: theme.text }]}>The rates below already include tax</Text>
          <ToggleSwitch value={inclusive} onValueChange={setInclusive} />
        </View>
      ) : null}

      <Text style={[styles.label, { color: theme.text3 }]}>Lines</Text>
      {lines.map((l, idx) => (
        <View key={l.key} style={[styles.line, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={styles.lineHead}>
            <Text style={[styles.lineNo, { color: theme.text3 }]}>Line {idx + 1}</Text>
            <View style={styles.lineAmount}>
              <Text style={[styles.amount, { color: theme.text }]}>{priced?.lines[idx] ? inr(rupees(priced.lines[idx].amount_paise)) : '—'}</Text>
              <Pressable
                onPress={() => (lines.length > 1 ? setLines((p) => p.filter((x) => x.key !== l.key)) : Alert.alert('Lines', 'A document needs at least one line'))}
                hitSlop={10}
                accessibilityLabel="Remove line"
              >
                <Icon name="close" size={18} color={theme.text3} />
              </Pressable>
            </View>
          </View>
          <Field
            label="Description"
            value={l.description}
            onChangeText={(v) => {
              patch(l.key, { description: v, item_id: null });
              setPickFor(l.key);
              setItemQ(v);
            }}
            placeholder="Item or work done — type to search items"
          />
          {pickFor === l.key
            ? matches.map((i) => (
                <ListRow key={i.id} icon="box" title={i.name} subtitle={`${inr(i.selling_rate)} · GST ${Number(i.gst_rate) || 0}%`} onPress={() => pickItem(i)} />
              ))
            : null}
          <View style={styles.row}>
            <View style={styles.cell}><Field label="Qty" value={l.qty} onChangeText={(v) => patch(l.key, { qty: v })} keyboardType="numeric" /></View>
            <View style={styles.cell}><Field label="Unit" value={l.unit} onChangeText={(v) => patch(l.key, { unit: v })} /></View>
            <View style={styles.cell}><Field label="Rate ₹" value={l.rate} onChangeText={(v) => patch(l.key, { rate: v })} keyboardType="numeric" /></View>
          </View>
          <View style={styles.row}>
            <View style={styles.cell}><Field label="Disc %" value={l.disc} onChangeText={(v) => patch(l.key, { disc: v })} keyboardType="numeric" /></View>
            {!(noTax && !infoGst) ? <View style={styles.cell}><Field label="HSN/SAC" value={l.hsn} onChangeText={(v) => patch(l.key, { hsn: v })} /></View> : null}
          </View>
          {!(noTax && !infoGst) ? (
            <View style={styles.chips}>
              {taxOptions.map((o) => {
                const on = l.tax === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => patch(l.key, { tax: o.key })}
                    style={[styles.taxChip, on ? { borderColor: brand.fill, backgroundColor: brand.fill } : { borderColor: theme.border, backgroundColor: theme.panel }]}
                  >
                    <Text style={[styles.chipText, { color: on ? '#ffffff' : theme.text2 }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ))}
      <ActionButton label="+ Add line" tone="neutral" onPress={() => setLines((p) => [...p, blankLine(defaultTax)])} />

      <Field label="Document discount ₹" value={docDisc} onChangeText={setDocDisc} keyboardType="numeric" />
      <Field label="Notes for the customer" value={notes} onChangeText={setNotes} multiline />
      <Field label="Terms" value={terms} onChangeText={setTerms} multiline />

      <View style={[styles.totals, { backgroundColor: theme.panel2 }]}>
        {t ? (
          <>
            <TotalRow label="Taxable value" value={inr(rupees(t.taxable_paise))} />
            {t.cgst_paise ? <TotalRow label="CGST" value={inr(rupees(t.cgst_paise))} /> : null}
            {t.sgst_paise || t.utgst_paise ? <TotalRow label={t.utgst_paise ? 'UTGST' : 'SGST'} value={inr(rupees(t.sgst_paise + t.utgst_paise))} /> : null}
            {t.igst_paise ? <TotalRow label="IGST" value={inr(rupees(t.igst_paise))} /> : null}
            {t.round_off_paise ? <TotalRow label="Rounding" value={inr(rupees(t.round_off_paise))} /> : null}
            <TotalRow label="Total" value={inr(rupees(t.total_paise))} strong />
            <Text style={[styles.hint, { color: theme.text3 }]}>
              {priced?.info ? 'GST shown for information — it is inside the total, not added to it' : priced?.supply_type === 'inter' ? 'Inter-state supply — IGST' : 'Intra-state supply — CGST + SGST'}
            </Text>
          </>
        ) : priceError ? (
          <Text style={[styles.hint, { color: theme.err }]}>{priceError}</Text>
        ) : (
          <Text style={[styles.hint, { color: theme.text3 }]}>Add a line to see the total</Text>
        )}
      </View>
    </FormSheet>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.totalRow, strong && { borderTopWidth: 1, borderTopColor: theme.line, paddingTop: spacing(2), marginTop: spacing(1) }]}>
      <Text style={[styles.totalLabel, { color: theme.text2 }, strong && { fontFamily: 'Manrope_700Bold', fontSize: 16, color: theme.text }]}>{label}</Text>
      <Text style={[styles.totalValue, { color: theme.text }, strong && styles.totalStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, fontSize: 13 },
  hint: { ...typography.caption, fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  taxChip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), height: 32, justifyContent: 'center' },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(3) },
  switchLabel: { ...typography.body, fontSize: 14, flex: 1 },
  notice: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3), gap: spacing(2) },
  noticeText: { ...typography.caption, fontSize: 12 },
  line: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3), gap: spacing(2) },
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineNo: { ...typography.caption, fontSize: 11 },
  lineAmount: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  amount: { ...typography.monoId, fontSize: 14 },
  row: { flexDirection: 'row', gap: spacing(2) },
  cell: { flex: 1 },
  totals: { borderRadius: radius.lg, padding: spacing(3.5), gap: spacing(1.5) },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { ...typography.body, fontSize: 13 },
  totalValue: { ...typography.monoId, fontSize: 13 },
  totalStrong: { ...typography.kpi, fontSize: 18, lineHeight: 24 },
});
