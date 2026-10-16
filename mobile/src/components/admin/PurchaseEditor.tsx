import React, { useEffect, useMemo, useState } from 'react';
import { ChoiceChips, ToggleSwitch, TotalsBox } from './FinanceKit';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import FormSheet from './FormSheet';
import Field from './Field';
import ActionButton from './ActionButton';
import SearchField from './SearchField';
import ListRow from './ListRow';
import Icon from '../Icon';
import NewPartyButton from './NewPartyButton';
import { fetchItems, fetchParties, ItemRow, PartyRow } from '../../api/adminBooks';
import { fetchLocations, StockLocationRow } from '../../api/adminStock';
import { createPurchase, issuePurchase, PurchaseLoaded, PurchasePayload, updatePurchase } from '../../api/adminPurchases';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';
import { inr, todayIso } from '../../utils/format';

interface Props {
  visible: boolean;
  docType: 'purchase_order' | 'goods_receipt' | 'supplier_bill' | 'purchase_return';
  existing: PurchaseLoaded | null;
  /** Set when a supplier bill answers a goods receipt. */
  grnId?: string | null;
  poId?: string | null;
  onClose: () => void;
  onSaved: (id: string, issued: boolean) => void;
}

interface Line {
  key: string;
  item_id: string | null;
  description: string;
  qty: string;
  unit: string;
  rate: string;
  tax: string;
  serials: string;
}

let n = 0;
const blank = (): Line => ({ key: `p${++n}`, item_id: null, description: '', qty: '1', unit: '', rate: '', tax: '1800', serials: '' });

const TAXES = [
  { key: '0', label: '0%' },
  { key: '500', label: '5%' },
  { key: '1200', label: '12%' },
  { key: '1800', label: '18%' },
  { key: '2800', label: '28%' },
  { key: 'exempt', label: 'Exempt' },
];

const LABEL: Record<string, string> = {
  purchase_order: 'purchase order',
  goods_receipt: 'goods receipt',
  supplier_bill: 'supplier bill',
  purchase_return: 'purchase return',
};

// Purchase documents: order (moves nothing), goods receipt (puts goods on the
// shelf), supplier bill (records what is owed, touches no stock) and return.
export default function PurchaseEditor({ visible, docType, existing, grnId = null, poId = null, onClose, onSaved }: Props) {
  const { theme } = useTheme();
  const doc = existing?.document ?? null;
  const type = doc?.doc_type || docType;

  const [items, setItems] = useState<ItemRow[]>([]);
  const [locations, setLocations] = useState<StockLocationRow[]>([]);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyName, setPartyName] = useState('');
  const [partyQ, setPartyQ] = useState('');
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [date, setDate] = useState(todayIso());
  const [due, setDue] = useState('');
  const [ref, setRef] = useState('');
  const [locationId, setLocationId] = useState('');
  const [credit, setCredit] = useState(true);
  const [freight, setFreight] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [itemQ, setItemQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    Promise.all([fetchItems().catch(() => []), fetchLocations().catch(() => [])]).then(([i, l]) => {
      setItems(i.filter((x) => Number(x.active) === 1));
      setLocations(l.filter((x) => x.owned !== false && x.owned !== 0));
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const d = existing?.document;
    setPartyId(d?.party_id || null);
    setPartyName(d?.party_name || '');
    setPartyQ('');
    setDate((d?.doc_date || todayIso()).slice(0, 10));
    setDue((d?.due_date || '').slice(0, 10));
    setRef(d?.supplier_ref || '');
    setLocationId(d?.location_id || '');
    setCredit(d ? !!Number(d.input_credit_eligible ?? 1) : true);
    setFreight('');
    setNotes(d?.notes || '');
    setPickFor(null);
    const src = existing?.lines.filter((l) => !l.kind || l.kind === 'item') ?? [];
    setLines(
      src.length
        ? src.map((l) => ({
            key: `p${++n}`,
            item_id: l.item_id,
            description: l.description,
            qty: String(Number(l.quantity)),
            unit: l.unit || '',
            rate: l.rate_paise !== undefined ? String(Number(l.rate_paise) / 100) : '',
            tax: l.tax_treatment && l.tax_treatment !== 'gst' ? l.tax_treatment : String(Number(l.tax_rate_bps) || 0),
            serials: (l.serial_numbers || []).join(', '),
          }))
        : [blank()],
    );
  }, [visible, existing]);

  useEffect(() => {
    if (!locationId && locations.length) setLocationId((locations.find((l) => l.is_default) || locations[0]).id);
  }, [locations, locationId]);

  useEffect(() => {
    if (!partyQ.trim()) return setParties([]);
    const t = setTimeout(() => fetchParties('supplier', partyQ.trim()).then((r) => setParties(r.slice(0, 8))).catch(() => setParties([])), 250);
    return () => clearTimeout(t);
  }, [partyQ]);

  const matches = useMemo(() => {
    const q = itemQ.trim().toLowerCase();
    if (!pickFor || q.length < 2) return [];
    return items.filter((i) => `${i.name} ${i.sku || ''} ${i.brand || ''} ${i.model || ''}`.toLowerCase().includes(q)).slice(0, 6);
  }, [items, itemQ, pickFor]);

  const patch = (key: string, p: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const approx = useMemo(() => {
    let taxable = 0;
    let tax = 0;
    lines.forEach((l) => {
      const amt = (Number(l.rate) || 0) * (Number(l.qty) || 0);
      taxable += amt;
      const bps = Number(l.tax);
      if (!Number.isNaN(bps)) tax += amt * (bps / 10000);
    });
    const f = Number(freight) || 0;
    return { taxable, tax, freight: f, total: taxable + tax + f };
  }, [lines, freight]);

  const save = async (issue: boolean) => {
    if (!partyId) return Alert.alert('Supplier', 'Choose the supplier');
    const cleaned = lines
      .map((l) => {
        const isTreatment = Number.isNaN(Number(l.tax));
        const serials = l.serials.split(',').map((s) => s.trim()).filter(Boolean);
        return {
          item_id: l.item_id,
          description: l.description.trim(),
          quantity: Number(l.qty) || 0,
          unit: l.unit.trim() || null,
          rate: l.rate || 0,
          tax_rate_bps: isTreatment ? 0 : Number(l.tax),
          tax_treatment: isTreatment ? l.tax : 'gst',
          serial_numbers: serials.length ? serials : null,
        };
      })
      .filter((l) => l.description && l.quantity > 0);
    if (!cleaned.length) return Alert.alert('Lines', 'Add at least one line');
    const f = Number(freight) || 0;
    const payload: PurchasePayload = {
      doc_type: type,
      party_id: partyId,
      doc_date: date,
      due_date: type === 'supplier_bill' ? due || null : null,
      location_id: ['goods_receipt', 'purchase_return'].includes(type) ? locationId || null : null,
      supplier_ref: type === 'supplier_bill' ? ref.trim() || null : null,
      grn_id: grnId || doc?.grn_id || null,
      po_id: poId || doc?.po_id || null,
      input_credit_eligible: type === 'supplier_bill' ? credit : true,
      notes: notes.trim(),
      lines: cleaned,
      charges: f ? [{ label: 'Freight', amount: String(f), tax_rate_bps: 0, tax_treatment: 'exempt' }] : [],
    };
    setBusy(true);
    try {
      const saved = doc?.id ? await updatePurchase(doc.id, payload) : await createPurchase(payload);
      const id = saved.document.id;
      if (issue) await issuePurchase(id);
      onSaved(id, issue);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title={`${doc?.id ? 'Edit' : 'New'} ${LABEL[type]}${grnId ? ' — against a goods receipt' : ''}`}
      onClose={onClose}
      footer={
        <>
          <ActionButton label="Cancel" tone="neutral" onPress={onClose} />
          <ActionButton label="Save draft" tone="neutral" onPress={() => save(false)} busy={busy} />
          <ActionButton label={type === 'goods_receipt' ? 'Receive' : 'Save & issue'} tone="success" onPress={() => save(true)} busy={busy} />
        </>
      }
    >
      <Text style={[styles.label, { color: theme.text2 }]}>Supplier</Text>
      {partyId ? (
        <ListRow icon="storefront" title={partyName || 'Supplier'} footer={<ActionButton label="Change supplier" tone="neutral" onPress={() => { setPartyId(null); setPartyName(''); }} />} />
      ) : (
        <>
          <SearchField value={partyQ} onChangeText={setPartyQ} placeholder="Search supplier by name or phone" />
          {parties.map((p) => (
            <ListRow key={p.id} icon="storefront" title={p.display_name} subtitle={p.phone || undefined} onPress={() => { setPartyId(p.id); setPartyName(p.display_name); setParties([]); setPartyQ(''); }} />
          ))}
          <NewPartyButton
            kind="supplier"
            seed={partyQ}
            onCreated={(p) => {
              setPartyId(p.id);
              setPartyName(p.display_name);
              setParties([]);
              setPartyQ('');
            }}
          />
        </>
      )}

      <Field label="Date" value={date} onChangeText={setDate} hint="YYYY-MM-DD" />
      {type === 'supplier_bill' ? (
        <>
          <Field label="Their invoice no." value={ref} onChangeText={setRef} />
          <Field label="Due date" value={due} onChangeText={setDue} hint="YYYY-MM-DD" />
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: theme.text }]}>Tax can be claimed as input credit</Text>
            <ToggleSwitch value={credit} onValueChange={setCredit} />
          </View>
        </>
      ) : null}
      {['goods_receipt', 'purchase_return'].includes(type) ? (
        <>
          <Text style={[styles.label, { color: theme.text2 }]}>{type === 'goods_receipt' ? 'Into' : 'From'}</Text>
          <ChoiceChips items={locations.map((l) => [l.id, l.name] as [string, string])} value={locationId} onChange={setLocationId} />
        </>
      ) : null}

      <Text style={[styles.label, { color: theme.text2 }]}>Lines</Text>
      {lines.map((l, idx) => (
        <View key={l.key} style={[styles.line, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={styles.lineHead}>
            <Text style={[styles.lineNo, { color: theme.text3 }]}>Line {idx + 1}</Text>
            <Pressable onPress={() => (lines.length > 1 ? setLines((p) => p.filter((x) => x.key !== l.key)) : Alert.alert('Lines', 'A document needs at least one line'))} hitSlop={10}>
              <Icon name="close" size={18} color={theme.text3} />
            </Pressable>
          </View>
          <Field
            label="Item"
            value={l.description}
            onChangeText={(v) => {
              patch(l.key, { description: v, item_id: null });
              setPickFor(l.key);
              setItemQ(v);
            }}
            placeholder="What is being bought — type to search"
          />
          {pickFor === l.key
            ? matches.map((i) => (
                <ListRow
                  key={i.id}
                  icon="box"
                  title={i.name}
                  subtitle={`${i.purchase_rate != null ? inr(i.purchase_rate) : '—'} · GST ${Number(i.gst_rate) || 0}%`}
                  onPress={() => {
                    patch(l.key, { item_id: i.id, description: i.name, unit: i.unit || '', rate: i.purchase_rate != null ? String(Number(i.purchase_rate)) : '', tax: String(Math.round((Number(i.gst_rate) || 18) * 100)) });
                    setPickFor(null);
                    setItemQ('');
                  }}
                />
              ))
            : null}
          <View style={styles.row}>
            <View style={styles.cell}><Field label="Qty" value={l.qty} onChangeText={(v) => patch(l.key, { qty: v })} keyboardType="numeric" /></View>
            <View style={styles.cell}><Field label="Unit" value={l.unit} onChangeText={(v) => patch(l.key, { unit: v })} /></View>
            <View style={styles.cell}><Field label="Rate ₹" value={l.rate} onChangeText={(v) => patch(l.key, { rate: v })} keyboardType="numeric" /></View>
          </View>
          <View style={styles.chips}>
            {TAXES.map((t) => {
              const on = l.tax === t.key;
              return (
                <Pressable key={t.key} onPress={() => patch(l.key, { tax: t.key })} style={[styles.taxChip, on ? { borderColor: brand.fill, backgroundColor: brand.fill } : { borderColor: theme.border, backgroundColor: theme.panel }]}>
                  <Text style={[styles.chipText, { color: on ? '#ffffff' : theme.text2 }]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Field label="Serial numbers (optional)" value={l.serials} onChangeText={(v) => patch(l.key, { serials: v })} placeholder="comma separated" />
        </View>
      ))}
      <ActionButton label="+ Add line" tone="neutral" onPress={() => setLines((p) => [...p, blank()])} />

      <Field label="Freight / other charges ₹" value={freight} onChangeText={setFreight} keyboardType="numeric" hint="Freight is added to the cost of the goods" />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />

      <TotalsBox
        rows={[
          ['Goods', inr(approx.taxable)],
          ...(approx.freight ? [['Freight', inr(approx.freight)] as [string, string]] : []),
          ['Tax', inr(approx.tax)],
        ]}
        grand={['Approx. total', inr(approx.total)]}
      />
      <Text style={[styles.hint, { color: theme.text3 }]}>The server works out the exact figure when you save.</Text>
    </FormSheet>
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
  line: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3), gap: spacing(2) },
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineNo: { ...typography.caption, fontSize: 11 },
  row: { flexDirection: 'row', gap: spacing(2) },
  cell: { flex: 1 },
});
