import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import SectionLabel from '../../components/admin/SectionLabel';
import PurchaseEditor from '../../components/admin/PurchaseEditor';
import Icon from '../../components/Icon';
import { fetchPayables, fetchPurchaseDocs, rupees } from '../../api/adminBooks';
import { fetchLocations, StockLocationRow } from '../../api/adminStock';
import {
  cancelPurchase,
  issuePurchase,
  loadPurchase,
  PurchaseLoaded,
  paySupplier,
  receiveOrder,
} from '../../api/adminPurchases';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { humanize, inr, shortDate, todayIso } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type PView = 'purchase_order' | 'goods_receipt' | 'supplier_bill' | 'purchase_return' | 'owed';
type PType = Exclude<PView, 'owed'>;

const STATUS_COLOR: Record<string, string> = {
  draft: '#6d8278',
  issued: semantic.info,
  received: semantic.success,
  partially_received: semantic.warning,
  paid: semantic.success,
  cancelled: semantic.danger,
};

const TYPE_LABEL: Record<PType, string> = {
  purchase_order: 'Purchase order',
  goods_receipt: 'Goods received',
  supplier_bill: 'Supplier bill',
  purchase_return: 'Purchase return',
};

const METHODS = ['cash', 'upi', 'bank', 'card', 'cheque', 'other'];

// What was ordered, received, billed and returned, and what is still owed to
// suppliers. Receiving puts goods on the shelf; the bill records what is owed.
export default function PurchasesScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [view, setView] = useState<PView>('purchase_order');
  const [query, setQuery] = useState('');
  const [chooser, setChooser] = useState(false);
  const [editor, setEditor] = useState<{ type: PType; existing: PurchaseLoaded | null; grnId?: string | null; poId?: string | null } | null>(null);
  const [detail, setDetail] = useState<PurchaseLoaded | null>(null);
  const [receiving, setReceiving] = useState<PurchaseLoaded | null>(null);
  const [rvLoc, setRvLoc] = useState('');
  const [rvRef, setRvRef] = useState('');
  const [rvQty, setRvQty] = useState<Record<string, string>>({});
  const [rvSerials, setRvSerials] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<StockLocationRow[]>([]);
  const [paying, setPaying] = useState<{ partyId: string; name: string; docId: string | null; balance: number } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('bank');
  const [payRef, setPayRef] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelWhy, setCancelWhy] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchLocations().then((l) => setLocations(l.filter((x) => x.owned !== false && x.owned !== 0))).catch(() => {});
  }, []);

  const fetcher = useCallback(async () => {
    if (view === 'owed') return { docs: [], owed: await fetchPayables() };
    return { docs: await fetchPurchaseDocs(view), owed: [] };
  }, [view]);
  const data = useLoader(fetcher, 'Could not load purchases');

  const q = query.trim().toLowerCase();
  const docs = useMemo(() => (data.data?.docs ?? []).filter((d) => !q || `${d.doc_no} ${d.supplier_ref || ''} ${d.party_name || ''}`.toLowerCase().includes(q)), [data.data, q]);
  const owed = useMemo(() => (data.data?.owed ?? []).filter((d) => !q || `${d.doc_no} ${d.supplier_ref || ''} ${d.party_name || ''}`.toLowerCase().includes(q)), [data.data, q]);

  const act = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key);
    try {
      await fn();
      after?.();
      await data.reload();
    } catch (e) {
      Alert.alert('Could not complete', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const open = async (id: string) => {
    setBusy(id);
    try {
      setDetail(await loadPurchase(id));
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const d = detail?.document;
  const isDraft = d?.status === 'draft';
  const isOrder = d?.doc_type === 'purchase_order';
  const canReceive = !!d && isOrder && ['issued', 'partially_received'].includes(d.status);
  const canBill = !!d && d.doc_type === 'goods_receipt' && d.status === 'issued';
  const canPay = !!d && d.doc_type === 'supplier_bill' && d.status === 'issued' && (detail?.balance_paise ?? 0) > 0;

  const startReceive = (loaded: PurchaseLoaded) => {
    const qty: Record<string, string> = {};
    loaded.lines
      .filter((l) => !l.kind || l.kind === 'item')
      .forEach((l) => {
        const left = Math.max(0, Number(l.quantity) - Number(l.received_qty || 0));
        if (l.id) qty[l.id] = String(left);
      });
    setRvQty(qty);
    setRvSerials({});
    setRvRef('');
    setRvLoc((locations.find((l) => l.is_default) || locations[0])?.id || '');
    setReceiving(loaded);
    setDetail(null);
  };

  const doReceive = async () => {
    if (!receiving) return;
    const lines = Object.entries(rvQty)
      .map(([id, v]) => ({
        po_line_id: id,
        quantity: Number(v) || 0,
        serial_numbers: (rvSerials[id] || '').split(',').map((s) => s.trim()).filter(Boolean),
      }))
      .filter((l) => l.quantity > 0)
      .map((l) => ({ ...l, serial_numbers: l.serial_numbers.length ? l.serial_numbers : null }));
    if (!lines.length) return Alert.alert('Nothing to receive', 'Enter a quantity for at least one line.');
    await act(
      'receive',
      () => receiveOrder(receiving.document.id, { doc_date: todayIso(), location_id: rvLoc, supplier_ref: rvRef.trim() || null, lines }),
      () => {
        setReceiving(null);
        setView('goods_receipt');
      },
    );
  };

  const startPay = (partyId: string, name: string, docId: string | null, balance: number) => {
    setPayAmount(balance ? (balance / 100).toFixed(2) : '');
    setPayMethod('bank');
    setPayRef('');
    setPaying({ partyId, name, docId, balance });
    setDetail(null);
  };

  const doPay = async () => {
    if (!paying) return;
    const amount = Number(payAmount);
    if (!(amount > 0)) return Alert.alert('Amount', 'Enter the amount paid');
    await act(
      'pay',
      () =>
        paySupplier({
          party_id: paying.partyId,
          payment_date: todayIso(),
          method: payMethod,
          amount: String(amount),
          reference: payRef.trim(),
          idempotency_key: `supplier:${paying.partyId}:${todayIso()}:${amount}:${Date.now()}`,
          allocations: paying.docId ? [{ document_id: paying.docId, amount: String(amount) }] : [],
        }),
      () => setPaying(null),
    );
  };

  return (
    <AdminScreen
      title="Purchases"
      subtitle="Orders, receipts, bills and payables"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      headerRight={
        <Pressable onPress={() => setChooser(true)} hitSlop={8} style={[styles.add, { backgroundColor: brand.primary }]} accessibilityLabel="New document">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Document no., supplier or ref" />
          <FilterChips
            activeKey={view}
            onSelect={(k) => setView(k as PView)}
            items={[
              { key: 'purchase_order', label: 'Orders' },
              { key: 'goods_receipt', label: 'Received' },
              { key: 'supplier_bill', label: 'Bills' },
              { key: 'purchase_return', label: 'Returns' },
              { key: 'owed', label: 'We owe' },
            ]}
          />
        </>
      }
    >
      {view === 'owed' ? (
        <>
          <StatGrid items={[{ label: 'Payable', value: inr(rupees(owed.reduce((s, x) => s + x.outstanding_paise, 0))), color: semantic.danger }, { label: 'Open bills', value: owed.length }]} />
          {owed.length === 0 ? <EmptyNote text="No supplier bill is outstanding" icon="check-circle" /> : null}
          {owed.map((x) => (
            <ListRow
              key={x.id}
              icon="cart"
              iconColor={x.days_overdue > 0 ? semantic.danger : semantic.warning}
              title={x.party_name || 'Supplier'}
              subtitle={`${x.doc_no}${x.supplier_ref ? ` · ref ${x.supplier_ref}` : ''} · ${shortDate(x.doc_date)}`}
              meta={x.days_overdue > 0 ? `${x.days_overdue} days overdue` : 'Not yet due'}
              value={inr(rupees(x.outstanding_paise))}
              badge={{ label: x.days_overdue > 0 ? 'Overdue' : 'Open', color: x.days_overdue > 0 ? semantic.danger : semantic.info }}
              onPress={() => open(x.id)}
              footer={<ActionButton label="Open" onPress={() => open(x.id)} />}
            />
          ))}
        </>
      ) : (
        <>
          {docs.length === 0 ? <EmptyNote text="No documents here — tap + to create one" icon="cart" /> : null}
          {docs.map((x) => (
            <ListRow
              key={x.id}
              icon="cart"
              iconColor={STATUS_COLOR[x.status]}
              title={x.party_name || 'Supplier'}
              subtitle={`${x.doc_no || 'Draft'}${x.supplier_ref ? ` · ref ${x.supplier_ref}` : ''} · ${shortDate(x.doc_date)}`}
              meta={`${x.location_name || ''}${x.paid_paise > 0 ? ` · paid ${inr(rupees(x.paid_paise))}` : ''}`.replace(/^ · /, '') || undefined}
              value={inr(rupees(x.total_paise))}
              badge={{ label: humanize(x.status), color: STATUS_COLOR[x.status] ?? semantic.info }}
              onPress={() => open(x.id)}
            />
          ))}
        </>
      )}

      <FormSheet visible={chooser} title="New purchase document" onClose={() => setChooser(false)}>
        {(
          [
            ['purchase_order', 'Purchase order', 'Ordering moves nothing', 'document'],
            ['goods_receipt', 'Goods receipt', 'Goods arrive and go on the shelf', 'cube'],
            ['supplier_bill', 'Supplier bill', 'What is owed — touches no stock', 'receipt'],
            ['purchase_return', 'Purchase return', 'Send goods back to the supplier', 'swap'],
          ] as const
        ).map(([k, l, h, icon]) => (
          <ListRow
            key={k}
            icon={icon}
            title={l}
            subtitle={h}
            onPress={() => {
              setChooser(false);
              setEditor({ type: k, existing: null });
            }}
          />
        ))}
      </FormSheet>

      <FormSheet
        visible={!!detail}
        title={d ? d.doc_no || 'Draft' : 'Document'}
        subtitle={d ? `${TYPE_LABEL[d.doc_type as PType] || humanize(d.doc_type)} · ${humanize(d.status)}` : undefined}
        onClose={() => setDetail(null)}
      >
        {detail && d ? (
          <>
            <StatGrid
              items={[
                { label: d.party_name || 'Supplier', value: inr(rupees(d.total_paise)) },
                ...(d.doc_type === 'supplier_bill' && !isDraft
                  ? [{ label: detail.balance_paise > 0 ? `Paid ${inr(rupees(detail.paid_paise))}` : 'Paid in full', value: detail.balance_paise > 0 ? `${inr(rupees(detail.balance_paise))} due` : '✓', color: detail.balance_paise > 0 ? semantic.warning : semantic.success }]
                  : []),
              ]}
            />
            <Text style={[styles.meta, { color: theme.text3 }]}>
              {shortDate(d.doc_date)}
              {d.supplier_ref ? ` · their ref ${d.supplier_ref}` : ''}
              {d.location_name ? ` · ${d.location_name}` : ''}
            </Text>
            {d.grn_id ? <Text style={[styles.meta, { color: theme.text3 }]}>Billed against a goods receipt — the stock came in there.</Text> : null}

            <SectionLabel>Lines</SectionLabel>
            {detail.lines.map((l, i) => (
              <View key={l.id || i} style={[styles.kv, { borderBottomColor: theme.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.v, { color: theme.text, textAlign: 'left' }]} numberOfLines={2}>{l.description}</Text>
                  <Text style={[styles.k, { color: theme.text3 }]}>
                    {Number(l.quantity)}{l.unit ? ` ${l.unit}` : ''} × {inr(rupees(l.rate_paise))}
                    {isOrder ? ` · received ${Number(l.received_qty || 0)}` : ''}
                    {l.serial_numbers?.length ? ` · ${l.serial_numbers.join(', ')}` : ''}
                  </Text>
                </View>
                <Text style={[styles.v, { color: theme.text }]}>{inr(rupees(l.amount_paise))}</Text>
              </View>
            ))}
            <View style={styles.kv}><Text style={[styles.k, { color: theme.text3 }]}>Taxable</Text><Text style={[styles.v, { color: theme.text }]}>{inr(rupees(d.taxable_paise))}</Text></View>
            {Number(d.cgst_paise) ? <View style={styles.kv}><Text style={[styles.k, { color: theme.text3 }]}>CGST + SGST</Text><Text style={[styles.v, { color: theme.text }]}>{inr(rupees(Number(d.cgst_paise) + Number(d.sgst_paise)))}</Text></View> : null}
            {Number(d.igst_paise) ? <View style={styles.kv}><Text style={[styles.k, { color: theme.text3 }]}>IGST</Text><Text style={[styles.v, { color: theme.text }]}>{inr(rupees(d.igst_paise))}</Text></View> : null}
            <View style={styles.kv}><Text style={[styles.k, { color: theme.text }]}>Total</Text><Text style={[styles.v, { color: semantic.success }]}>{inr(rupees(d.total_paise))}</Text></View>

            {detail.allocations.length ? (
              <>
                <SectionLabel>Payments made</SectionLabel>
                {detail.allocations.map((a, i) => (
                  <View key={i} style={[styles.kv, { borderBottomColor: theme.line }]}>
                    <Text style={[styles.k, { color: theme.text2, flex: 1 }]}>{a.payment_no || ''} {shortDate(a.payment_date)} · {humanize(a.method)}{a.reference ? ` · ${a.reference}` : ''}</Text>
                    <Text style={[styles.v, { color: theme.text }]}>{inr(rupees(a.amount_paise))}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {d.status === 'cancelled' ? <Text style={[styles.meta, { color: semantic.danger }]}>Cancelled — {d.cancel_reason}</Text> : null}
            {d.input_credit_eligible === 0 ? <Text style={[styles.meta, { color: theme.text3 }]}>Input credit not claimed on this bill — the tax stays in the cost.</Text> : null}

            <SectionLabel>Actions</SectionLabel>
            <View style={styles.actions}>
              {isDraft ? (
                <>
                  <ActionButton label="Edit" tone="neutral" onPress={() => { setEditor({ type: d.doc_type as PType, existing: detail }); setDetail(null); }} />
                  <ActionButton
                    label={d.doc_type === 'goods_receipt' ? 'Receive' : 'Issue'}
                    busy={busy === 'issue'}
                    onPress={() => act('issue', () => issuePurchase(d.id), async () => setDetail(await loadPurchase(d.id)))}
                  />
                </>
              ) : null}
              {canReceive ? <ActionButton label="Receive goods" onPress={() => startReceive(detail)} /> : null}
              {canBill ? (
                <ActionButton
                  label="Enter supplier bill"
                  onPress={() => {
                    setEditor({
                      type: 'supplier_bill',
                      grnId: d.id,
                      poId: d.po_id || null,
                      existing: {
                        document: { ...d, doc_type: 'supplier_bill', id: '', doc_no: null, status: 'draft', grn_id: d.id, input_credit_eligible: 1, doc_date: todayIso(), due_date: null, supplier_ref: null },
                        lines: detail.lines.filter((l) => !l.kind || l.kind === 'item'),
                        allocations: [],
                        paid_paise: 0,
                        balance_paise: 0,
                      },
                    });
                    setDetail(null);
                  }}
                />
              ) : null}
              {canPay && d.party_id ? <ActionButton label="Pay supplier" tone="success" onPress={() => startPay(d.party_id as string, d.party_name || 'Supplier', d.id, detail.balance_paise)} /> : null}
            </View>
            {!isDraft && d.status !== 'cancelled' ? <ActionButton label="Cancel document" tone="danger" onPress={() => setCancelId(d.id)} /> : null}
          </>
        ) : null}
      </FormSheet>

      <FormSheet
        visible={!!receiving}
        title="Receive goods"
        subtitle={receiving ? `${receiving.document.doc_no || ''} · ${receiving.document.party_name || ''}` : undefined}
        onClose={() => setReceiving(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setReceiving(null)} />
            <ActionButton label="Receive into stock" tone="success" busy={busy === 'receive'} onPress={doReceive} />
          </>
        }
      >
        <Text style={[styles.k, { color: theme.text3 }]}>Into</Text>
        <View style={styles.chips}>
          {locations.map((l) => {
            const on = rvLoc === l.id;
            return (
              <Pressable key={l.id} onPress={() => setRvLoc(l.id)} style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}>
                <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{l.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Their delivery note" value={rvRef} onChangeText={setRvRef} />
        {receiving?.lines
          .filter((l) => (!l.kind || l.kind === 'item') && l.id)
          .map((l) => {
            const left = Math.max(0, Number(l.quantity) - Number(l.received_qty || 0));
            return (
              <View key={l.id} style={[styles.card, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                <Text style={[styles.v, { color: theme.text, textAlign: 'left' }]} numberOfLines={2}>{l.description}</Text>
                <Text style={[styles.k, { color: theme.text3 }]}>Ordered {Number(l.quantity)} · received {Number(l.received_qty || 0)} · left {left}</Text>
                <Field label="Receiving now" value={rvQty[l.id as string] ?? ''} onChangeText={(v) => setRvQty((p) => ({ ...p, [l.id as string]: v }))} keyboardType="numeric" />
                <Field label="Serial numbers (optional)" value={rvSerials[l.id as string] ?? ''} onChangeText={(v) => setRvSerials((p) => ({ ...p, [l.id as string]: v }))} placeholder="comma separated" />
              </View>
            );
          })}
      </FormSheet>

      <FormSheet
        visible={!!paying}
        title="Pay supplier"
        subtitle={paying ? `${paying.name}${paying.balance ? ` · ${inr(paying.balance / 100)} due` : ''}` : undefined}
        onClose={() => setPaying(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setPaying(null)} />
            <ActionButton label="Record payment" tone="success" busy={busy === 'pay'} onPress={doPay} />
          </>
        }
      >
        <Field label="Amount ₹" value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" />
        <Text style={[styles.k, { color: theme.text3 }]}>Method</Text>
        <View style={styles.chips}>
          {METHODS.map((m) => {
            const on = payMethod === m;
            return (
              <Pressable key={m} onPress={() => setPayMethod(m)} style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}>
                <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{humanize(m)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Reference" value={payRef} onChangeText={setPayRef} />
      </FormSheet>

      <FormSheet
        visible={cancelId !== null}
        title="Cancel document"
        onClose={() => setCancelId(null)}
        footer={
          <>
            <ActionButton label="Back" tone="neutral" onPress={() => setCancelId(null)} />
            <ActionButton
              label="Cancel it"
              tone="danger"
              busy={busy === 'cancel'}
              onPress={() => {
                if (!cancelWhy.trim()) return Alert.alert('Reason', 'A posted document is cancelled, not deleted — say why.');
                act('cancel', () => cancelPurchase(cancelId as string, cancelWhy.trim()), () => {
                  setCancelId(null);
                  setCancelWhy('');
                  setDetail(null);
                });
              }}
            />
          </>
        }
      >
        <Text style={[styles.meta, { color: theme.text2 }]}>Its ledger entry is reversed and any stock it brought in comes back off.</Text>
        <Field label="Why is it being cancelled?" value={cancelWhy} onChangeText={setCancelWhy} multiline />
      </FormSheet>

      <PurchaseEditor
        visible={!!editor}
        docType={editor?.type ?? 'purchase_order'}
        existing={editor?.existing ?? null}
        grnId={editor?.grnId}
        poId={editor?.poId}
        onClose={() => setEditor(null)}
        onSaved={(id) => {
          const type = editor?.type;
          setEditor(null);
          if (type) setView(type);
          open(id);
        }}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  meta: { ...typography.caption, fontSize: 12 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2), borderBottomWidth: StyleSheet.hairlineWidth },
  k: { ...typography.caption, fontSize: 12 },
  v: { ...typography.body, fontSize: 14, fontFamily: 'Manrope_700Bold', textAlign: 'right' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5), marginBottom: spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  chipText: { ...typography.caption, fontSize: 12 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), gap: spacing(1.5) },
});
