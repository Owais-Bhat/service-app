import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChoiceChips, DocHero, HeaderAction, KvLine, LinesPanel, Overline, RowPanel, Stepper, StepBar, TotalsBox } from '../../components/admin/FinanceKit';
import { Alert, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import PurchaseEditor from '../../components/admin/PurchaseEditor';
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
import { spacing, typography } from '../../theme';
import { humanize, inr, shortDate, todayIso } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type PView = 'purchase_order' | 'goods_receipt' | 'supplier_bill' | 'purchase_return' | 'owed';
type PType = Exclude<PView, 'owed'>;

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
  const STATUS_COLOR: Record<string, string> = {
    draft: theme.grey,
    issued: theme.info,
    received: theme.ok,
    partially_received: theme.warn,
    paid: theme.ok,
    cancelled: theme.err,
  };
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
        <HeaderAction icon="add" label="New document" onPress={() => setChooser(true)} />
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
          <StatGrid items={[{ label: 'Payable', value: inr(rupees(owed.reduce((s, x) => s + x.outstanding_paise, 0))), color: theme.err }, { label: 'Open bills', value: owed.length }]} />
          {owed.length === 0 ? <EmptyNote text="No supplier bill is outstanding" icon="check-circle" /> : null}
          {owed.map((x) => (
            <ListRow
              key={x.id}
              icon="cart"
              iconColor={x.days_overdue > 0 ? theme.err : theme.warn}
              title={x.party_name || 'Supplier'}
              subtitle={`${x.doc_no}${x.supplier_ref ? ` · ref ${x.supplier_ref}` : ''} · ${shortDate(x.doc_date)}`}
              meta={x.days_overdue > 0 ? `${x.days_overdue} days overdue` : 'Not yet due'}
              value={inr(rupees(x.outstanding_paise))}
              badge={{ label: x.days_overdue > 0 ? 'Overdue' : 'Open', color: x.days_overdue > 0 ? theme.err : theme.info }}
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
              badge={{ label: humanize(x.status), color: STATUS_COLOR[x.status] ?? theme.info }}
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
            <DocHero
              party={d.party_name || 'Supplier'}
              total={inr(rupees(d.total_paise))}
              note={d.doc_type === 'supplier_bill' && !isDraft ? (detail.balance_paise > 0 ? `Paid ${inr(rupees(detail.paid_paise))} · ${inr(rupees(detail.balance_paise))} due` : 'Paid in full') : undefined}
              noteColor={detail.balance_paise > 0 ? theme.warn : theme.ok}
              meta={`${shortDate(d.doc_date)}${d.supplier_ref ? ` · their ref ${d.supplier_ref}` : ''}${d.location_name ? ` · ${d.location_name}` : ''}`}
            />
            {d.grn_id ? <Text style={[styles.meta, { color: theme.text3 }]}>Billed against a goods receipt — the stock came in there.</Text> : null}

            <Overline>Lines</Overline>
            <LinesPanel
              rows={detail.lines.map((l, i) => ({
                key: String(l.id || i),
                name: l.description,
                meta: `${Number(l.quantity)}${l.unit ? ` ${l.unit}` : ''} × ${inr(rupees(l.rate_paise))}${isOrder ? ` · received ${Number(l.received_qty || 0)}` : ''}${l.serial_numbers?.length ? ` · ${l.serial_numbers.join(', ')}` : ''}`,
                amount: inr(rupees(l.amount_paise)),
              }))}
            />
            <TotalsBox
              rows={[
                ['Taxable value', inr(rupees(d.taxable_paise))],
                ...(Number(d.cgst_paise) ? [['CGST + SGST', inr(rupees(Number(d.cgst_paise) + Number(d.sgst_paise)))] as [string, string]] : []),
                ...(Number(d.igst_paise) ? [['IGST', inr(rupees(d.igst_paise))] as [string, string]] : []),
              ]}
              grand={['Total', inr(rupees(d.total_paise))]}
            />

            {detail.allocations.length ? (
              <>
                <Overline>Payments made</Overline>
                <RowPanel>
                  {detail.allocations.map((a, i, all) => (
                    <KvLine key={i} label={`${a.payment_no || ''} ${shortDate(a.payment_date)} · ${humanize(a.method)}${a.reference ? ` · ${a.reference}` : ''}`} value={inr(rupees(a.amount_paise))} mono last={i === all.length - 1} />
                  ))}
                </RowPanel>
              </>
            ) : null}
            {d.status === 'cancelled' ? <Text style={[styles.meta, { color: theme.err }]}>Cancelled — {d.cancel_reason}</Text> : null}
            {d.input_credit_eligible === 0 ? <Text style={[styles.meta, { color: theme.text3 }]}>Input credit not claimed on this bill — the tax stays in the cost.</Text> : null}

            <Overline>Actions</Overline>
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
        <StepBar steps={['Ordered', 'Receive', 'Supplier bill', 'Return']} current={1} />
        <Text style={[styles.heading, { color: theme.text }]}>Receive items</Text>
        <RowPanel>
          {receiving?.lines
            .filter((l) => (!l.kind || l.kind === 'item') && l.id)
            .map((l, i, all) => {
              const left = Math.max(0, Number(l.quantity) - Number(l.received_qty || 0));
              return (
                <View key={l.id} style={[styles.recvRow, { borderBottomColor: theme.line }, i === all.length - 1 && styles.noRule]}>
                  <View style={styles.recvTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.v, { color: theme.text, textAlign: 'left' }]} numberOfLines={2}>{l.description}</Text>
                      <Text style={[styles.mono, { color: theme.text3 }]}>Ordered {Number(l.quantity)} · received before {Number(l.received_qty || 0)} · left {left}</Text>
                    </View>
                    <Stepper value={rvQty[l.id as string] ?? ''} onChange={(v) => setRvQty((p) => ({ ...p, [l.id as string]: v }))} />
                  </View>
                  <Field label="Serial numbers (optional)" value={rvSerials[l.id as string] ?? ''} onChangeText={(v) => setRvSerials((p) => ({ ...p, [l.id as string]: v }))} placeholder="comma separated" />
                </View>
              );
            })}
        </RowPanel>
        <Text style={[styles.k, { color: theme.text2 }]}>Receive into</Text>
        <ChoiceChips items={locations.map((l) => [l.id, l.name] as [string, string])} value={rvLoc} onChange={setRvLoc} />
        <Field label="Their delivery note" value={rvRef} onChangeText={setRvRef} />
        <Text style={[styles.meta, { color: theme.text2 }]}>Partial receipt keeps the order open for the remainder. Add the supplier bill after receiving.</Text>
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
        <Text style={[styles.k, { color: theme.text2 }]}>Method</Text>
        <ChoiceChips items={METHODS.map((m) => [m, humanize(m)] as [string, string])} value={payMethod} onChange={setPayMethod} />
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
  meta: { ...typography.caption, fontSize: 12 },
  k: { ...typography.caption, fontSize: 13 },
  v: { ...typography.body, fontSize: 14, fontFamily: 'Manrope_700Bold', textAlign: 'right' },
  mono: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, marginTop: 2 },
  heading: { ...typography.heading, fontSize: 16, lineHeight: 22 },
  recvRow: { padding: spacing(3.5), gap: spacing(2.5), borderBottomWidth: 1 },
  recvTop: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  noRule: { borderBottomWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5), marginBottom: spacing(2) },
});
