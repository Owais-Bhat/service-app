import React, { useCallback, useMemo, useState } from 'react';
import { ChoiceChips, DocHero, HeaderAction, KvLine, LinesPanel, Overline, RowPanel, TotalsBox } from '../../components/admin/FinanceKit';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import SalesEditor from '../../components/admin/SalesEditor';
import { fetchReceivables, fetchSalesDocs, rupees, OpenInvoice } from '../../api/adminBooks';
import {
  acceptSales,
  allocatePayment,
  cancelSales,
  convertSales,
  fetchReceipts,
  issueSales,
  loadPayment,
  loadSalesDoc,
  PaymentLoaded,
  recordReceipt,
  salesShareLink,
  SalesLoaded,
  sendSalesWhatsapp,
} from '../../api/adminSales';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';
import { humanize, inr, shortDate, todayIso } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type SalesView = 'invoice' | 'estimate' | 'credit_note' | 'receipts' | 'owed';
type DocKind = 'invoice' | 'estimate' | 'credit_note';

const METHODS = ['cash', 'upi', 'bank', 'card', 'cheque', 'other'];

// Quotations, invoices, credit notes, receipts and who still owes — the whole
// selling side. Every figure is priced by the server as it is typed, so what the
// customer is quoted and what the invoice carries are the same numbers.
export default function SalesScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const STATUS_COLOR: Record<string, string> = {
    draft: theme.grey,
    issued: theme.info,
    paid: theme.ok,
    accepted: theme.ok,
    cancelled: theme.err,
    rejected: theme.err,
    expired: theme.warn,
  };
  const [payment, setPayment] = useState<PaymentLoaded | null>(null);
  const [payOpen, setPayOpen] = useState<OpenInvoice[]>([]);
  const [payTarget, setPayTarget] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [view, setView] = useState<SalesView>('invoice');
  const [query, setQuery] = useState('');
  const [chooser, setChooser] = useState(false);
  const [editor, setEditor] = useState<{ type: DocKind; existing: SalesLoaded | null } | null>(null);
  const [detail, setDetail] = useState<SalesLoaded | null>(null);
  const [receipt, setReceipt] = useState<{ partyId: string; partyName: string; docId: string | null; balance: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelId, setCancelAsk] = useState<string | null>(null);
  const [cancelWhy, setCancelWhy] = useState('');
  const [acceptId, setAcceptId] = useState<string | null>(null);
  const [recAmount, setRecAmount] = useState('');
  const [recMethod, setRecMethod] = useState('cash');
  const [recRef, setRecRef] = useState('');
  const [recNote, setRecNote] = useState('');
  const [recDate, setRecDate] = useState(todayIso());

  const fetcher = useCallback(async () => {
    if (view === 'owed') return { docs: [], owed: await fetchReceivables(), receipts: [] };
    if (view === 'receipts') return { docs: [], owed: [], receipts: await fetchReceipts() };
    return { docs: await fetchSalesDocs(view), owed: [], receipts: [] };
  }, [view]);
  const data = useLoader(fetcher, 'Could not load sales');

  const q = query.trim().toLowerCase();
  const docs = useMemo(() => (data.data?.docs ?? []).filter((d) => !q || `${d.doc_no} ${d.party_name || ''} ${d.party_phone || ''}`.toLowerCase().includes(q)), [data.data, q]);
  const owed: OpenInvoice[] = useMemo(() => (data.data?.owed ?? []).filter((d) => !q || `${d.doc_no} ${d.party_name || ''} ${d.party_phone || ''}`.toLowerCase().includes(q)), [data.data, q]);
  const receipts = useMemo(() => (data.data?.receipts ?? []).filter((r) => !q || `${r.payment_no || ''} ${r.party_name || ''} ${r.reference || ''}`.toLowerCase().includes(q)), [data.data, q]);

  const billed = docs.filter((d) => d.status !== 'cancelled').reduce((s, d) => s + d.total_paise, 0);
  const paid = docs.filter((d) => d.status !== 'cancelled').reduce((s, d) => s + d.paid_paise, 0);

  const openDoc = async (id: string) => {
    setBusy(id);
    try {
      setDetail(await loadSalesDoc(id));
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

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

  const reopen = async (id: string) => setDetail(await loadSalesDoc(id));

  const openPdf = async (id: string) => {
    setBusy('pdf');
    try {
      const { url } = await salesShareLink(id);
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Could not open the PDF', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const startReceipt = (partyId: string, partyName: string, docId: string | null, balancePaise: number) => {
    setRecAmount(balancePaise ? (balancePaise / 100).toFixed(2) : '');
    setRecMethod('cash');
    setRecRef('');
    setRecNote('');
    setRecDate(todayIso());
    setReceipt({ partyId, partyName, docId, balance: balancePaise });
  };

  const saveReceipt = async () => {
    if (!receipt) return;
    const amount = Number(recAmount);
    if (!(amount > 0)) return Alert.alert('Amount', 'Enter the amount received');
    await act(
      'receipt',
      () =>
        recordReceipt({
          party_id: receipt.partyId,
          payment_date: recDate,
          method: recMethod,
          amount: String(amount),
          reference: recRef.trim(),
          notes: recNote.trim(),
          idempotency_key: `receipt:${receipt.partyId}:${recDate}:${amount}:${Date.now()}`,
          allocations: receipt.docId ? [{ document_id: receipt.docId, amount: String(amount) }] : [],
        }),
      () => {
        setReceipt(null);
        setDetail(null);
      },
    );
  };

  const d = detail?.document;
  const isDraft = d?.status === 'draft';
  const canPay = !!d && d.doc_type === 'invoice' && d.status === 'issued' && (detail?.balance_paise ?? 0) > 0;
  const partyName = d?.party_snapshot?.display_name || d?.party_name || 'Customer';

  const openPayment = async (id: string) => {
    try {
      const p = await loadPayment(id);
      setPayment(p);
      setPayTarget('');
      setPayAmount('');
      if (p.unallocated_paise > 0) {
        const open = await fetchReceivables().catch(() => [] as OpenInvoice[]);
        setPayOpen(open.filter((o) => (o as OpenInvoice & { party_id?: string }).party_id === p.payment.party_id));
      } else {
        setPayOpen([]);
      }
    } catch (e) {
      Alert.alert('Could not open the receipt', e instanceof Error ? e.message : 'Try again');
    }
  };

  const applyPayment = async () => {
    if (!payment || !payTarget) return Alert.alert('Pick an invoice', 'Choose the invoice to apply it to.');
    if (!(Number(payAmount) > 0)) return Alert.alert('Amount', 'Enter the amount to apply.');
    setPayBusy(true);
    try {
      await allocatePayment(payment.payment.id, payTarget, payAmount);
      Alert.alert('Applied', 'The receipt was put against the invoice.');
      setPayment(null);
      await data.reload();
    } catch (e) {
      Alert.alert('Not applied', e instanceof Error ? e.message : 'Try again');
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <AdminScreen
      title="Invoices & Quotations"
      subtitle="Sales documents"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      headerRight={
        <HeaderAction icon="add" label="New document" onPress={() => setChooser(true)} />
      }
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Document no., customer or phone" />
          <FilterChips
            activeKey={view}
            onSelect={(k) => setView(k as SalesView)}
            items={[
              { key: 'invoice', label: 'Invoices' },
              { key: 'estimate', label: 'Quotations' },
              { key: 'credit_note', label: 'Credit notes' },
              { key: 'receipts', label: 'Receipts' },
              { key: 'owed', label: 'Owed to us' },
            ]}
          />
        </>
      }
    >
      {view === 'owed' ? (
        <>
          <StatGrid items={[{ label: 'Outstanding', value: inr(rupees(owed.reduce((s, x) => s + x.outstanding_paise, 0))), color: theme.warn }, { label: 'Open invoices', value: owed.length }]} />
          {owed.length === 0 ? <EmptyNote text="Nothing is owed" icon="check-circle" /> : null}
          {owed.map((x) => (
            <ListRow
              key={x.id}
              icon="receipt"
              iconColor={x.days_overdue > 0 ? theme.err : theme.warn}
              title={x.party_name || 'Customer'}
              subtitle={`${x.doc_no} · ${shortDate(x.doc_date)}`}
              meta={x.days_overdue > 0 ? `${x.days_overdue} days overdue` : 'Not yet due'}
              value={inr(rupees(x.outstanding_paise))}
              badge={{ label: x.days_overdue > 0 ? 'Overdue' : 'Open', color: x.days_overdue > 0 ? theme.err : theme.info }}
              onPress={() => openDoc(x.id)}
              footer={
                <>
                  {x.party_phone ? <ActionButton label="Call" tone="neutral" onPress={() => Linking.openURL(`tel:${x.party_phone}`)} /> : null}
                  <ActionButton label="Open" onPress={() => openDoc(x.id)} />
                </>
              }
            />
          ))}
        </>
      ) : view === 'receipts' ? (
        <>
          {receipts.length === 0 ? <EmptyNote text="No receipts recorded" icon="cash" /> : null}
          {receipts.map((r) => (
            <ListRow
              key={r.id}
              icon="cash"
              iconColor={theme.ok}
              title={r.party_name || 'Customer'}
              subtitle={`${r.payment_no || ''} · ${shortDate(r.payment_date)}`}
              meta={`${humanize(r.method)}${r.reference ? ` · ${r.reference}` : ''}${r.unallocated_paise > 0 ? ` · ${inr(rupees(r.unallocated_paise))} on account` : ''}`}
              value={inr(rupees(r.amount_paise))}
              valueColor={theme.ok}
              onPress={() => openPayment(r.id)}
            />
          ))}
        </>
      ) : (
        <>
          {view === 'invoice' ? (
            <StatGrid items={[{ label: 'Billed', value: inr(rupees(billed)) }, { label: 'Received', value: inr(rupees(paid)), color: theme.ok }]} />
          ) : null}
          {docs.length === 0 ? <EmptyNote text="No documents here — tap + to create one" icon="receipt" /> : null}
          {docs.map((x) => (
            <ListRow
              key={x.id}
              icon="receipt"
              iconColor={STATUS_COLOR[x.status]}
              title={x.party_name || 'Customer'}
              subtitle={`${x.doc_no || 'Draft'} · ${shortDate(x.doc_date)}`}
              meta={x.doc_type === 'invoice' && x.paid_paise > 0 ? `Paid ${inr(rupees(x.paid_paise))} of ${inr(rupees(x.total_paise))}` : x.bill_type ? humanize(x.bill_type) : undefined}
              value={inr(rupees(x.total_paise))}
              badge={{ label: humanize(x.status), color: STATUS_COLOR[x.status] ?? theme.info }}
              onPress={() => openDoc(x.id)}
            />
          ))}
        </>
      )}

      {/* Receipt detail: what it covers and what is still on account */}
      <FormSheet
        visible={!!payment}
        title={payment?.payment.payment_no || 'Receipt'}
        subtitle={payment ? `${payment.payment.party_name || ''} · ${shortDate(payment.payment.payment_date)}` : undefined}
        onClose={() => setPayment(null)}
      >
        {payment ? (
          <View>
            <Text style={[styles.payAmount, { color: theme.text }]}>{inr(rupees(payment.payment.amount_paise))}</Text>
            <Text style={[styles.payNote, { color: theme.text3 }]}>
              {humanize(payment.payment.method)}
              {payment.payment.reference ? ` · ${payment.payment.reference}` : ''}
            </Text>
            <Overline>Put against</Overline>
            {payment.allocations.length === 0 ? <Text style={[styles.payNote, { color: theme.text3 }]}>Not put against any invoice yet.</Text> : null}
            {payment.allocations.map((a, i) => (
              <ListRow key={i} icon="receipt" title={a.doc_no || 'Invoice'} subtitle={a.doc_date ? shortDate(a.doc_date) : undefined} value={inr(rupees(a.amount_paise))} />
            ))}
            {payment.unallocated_paise > 0 ? (
              <View>
                <Overline>{`On account: ${inr(rupees(payment.unallocated_paise))}`}</Overline>
                {payOpen.length === 0 ? (
                  <Text style={[styles.payNote, { color: theme.text3 }]}>This customer has no outstanding invoices to apply it to.</Text>
                ) : (
                  <View>
                    {payOpen.map((o) => (
                      <ListRow
                        key={o.id}
                        icon={payTarget === o.id ? 'check-circle' : 'receipt'}
                        iconColor={payTarget === o.id ? theme.ok : undefined}
                        title={o.doc_no}
                        subtitle={`${inr(rupees(o.outstanding_paise))} due`}
                        onPress={() => {
                          setPayTarget(o.id);
                          setPayAmount((Math.min(payment.unallocated_paise, o.outstanding_paise) / 100).toFixed(2));
                        }}
                      />
                    ))}
                    <Field label="Amount ₹" value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" />
                    <ActionButton label="Apply" busy={payBusy} onPress={applyPayment} />
                  </View>
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </FormSheet>

      {/* New-document chooser */}
      <FormSheet visible={chooser} title="New document" onClose={() => setChooser(false)}>
        {(
          [
            ['invoice', 'Invoice', 'A bill for work done or goods sold', 'receipt'],
            ['estimate', 'Quotation', 'A price for the customer to accept', 'document'],
            ['credit_note', 'Credit note', 'Reduce what a customer owes', 'swap'],
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
        <ActionButton
          label="Record a receipt (money received)"
          tone="success"
          onPress={() => {
            setChooser(false);
            setView('owed');
          }}
        />
      </FormSheet>

      {/* Detail */}
      <FormSheet
        visible={!!detail}
        title={d ? `${d.doc_no || 'Draft'}` : 'Document'}
        subtitle={d ? `${humanize(d.doc_type === 'estimate' ? 'quotation' : d.doc_type)} · ${humanize(d.status)}${Number(d.revision_no) > 0 ? ` · revision ${d.revision_no}` : ''}` : undefined}
        onClose={() => setDetail(null)}
      >
        {detail && d ? (
          <>
            <DocHero
              party={partyName}
              total={inr(rupees(d.total_paise))}
              note={d.doc_type === 'invoice' && !isDraft ? (detail.balance_paise > 0 ? `Paid ${inr(rupees(detail.paid_paise))} · ${inr(rupees(detail.balance_paise))} due` : 'Paid in full') : undefined}
              noteColor={detail.balance_paise > 0 ? theme.warn : theme.ok}
              meta={`${shortDate(d.doc_date)}${d.due_date ? ` · due ${shortDate(d.due_date)}` : ''}${d.supply_type ? ` · ${d.supply_type === 'inter' ? 'inter-state (IGST)' : 'intra-state (CGST+SGST)'}` : ''}`}
            />

            <Overline>Lines</Overline>
            <LinesPanel
              rows={detail.lines.map((l, i) => ({
                key: String(l.id || i),
                name: l.description,
                meta: `${Number(l.quantity)}${l.unit ? ` ${l.unit}` : ''} × ${inr(rupees(l.rate_paise))}${l.tax_treatment && l.tax_treatment !== 'gst' ? ` · ${humanize(l.tax_treatment)}` : ` · GST ${Number(l.tax_rate_bps) / 100}%`}`,
                amount: inr(rupees(l.amount_paise)),
              }))}
            />
            <TotalsBox
              rows={[
                ['Taxable value', inr(rupees(d.taxable_paise))],
                ...(Number(d.cgst_paise) ? [['CGST + SGST', inr(rupees(Number(d.cgst_paise) + Number(d.sgst_paise) + Number(d.utgst_paise)))] as [string, string]] : []),
                ...(Number(d.igst_paise) ? [['IGST', inr(rupees(d.igst_paise))] as [string, string]] : []),
              ]}
              grand={['Total', inr(rupees(d.total_paise))]}
            />

            {detail.allocations.length ? (
              <>
                <Overline>Payments received</Overline>
                <RowPanel>
                  {detail.allocations.map((a, i, all) => (
                    <KvLine key={i} label={`${a.payment_no || ''} ${shortDate(a.payment_date)} · ${humanize(a.method)}${a.reference ? ` · ${a.reference}` : ''}`} value={inr(rupees(a.amount_paise))} mono last={i === all.length - 1} />
                  ))}
                </RowPanel>
              </>
            ) : null}

            {d.status === 'cancelled' ? <Text style={[styles.meta, { color: theme.err }]}>Cancelled {shortDate(d.cancelled_at)} — {d.cancel_reason}. The ledger entry was reversed.</Text> : null}
            {d.converted_to_id ? <Text style={[styles.meta, { color: theme.text3 }]}>This quotation has already been converted.</Text> : null}
            {d.doc_type === 'estimate' && d.accepted_at ? <Text style={[styles.meta, { color: theme.text3 }]}>Accepted {shortDate(d.accepted_at)}{d.acceptance_method ? ` via ${d.acceptance_method}` : ''}.</Text> : null}

            <Overline>Actions</Overline>
            <View style={styles.actions}>
              {!isDraft ? <ActionButton label="Open PDF" tone="neutral" busy={busy === 'pdf'} onPress={() => openPdf(d.id)} /> : null}
              {!isDraft && d.status !== 'cancelled' && d.doc_type !== 'credit_note' ? (
                <ActionButton
                  label="WhatsApp"
                  tone="success"
                  busy={busy === 'wa'}
                  onPress={() =>
                    Alert.alert('Send on WhatsApp?', `${d.doc_no} (${inr(rupees(d.total_paise))}) with its PDF to ${partyName}.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Send', onPress: () => act('wa', () => sendSalesWhatsapp(d.id).then((r) => { if (r && r.ok === false) throw new Error(r.error || 'WhatsApp could not send it'); })) },
                    ])
                  }
                />
              ) : null}
            </View>
            <View style={styles.actions}>
              {isDraft || (d.status === 'issued' && d.doc_type !== 'credit_note') || (d.doc_type === 'estimate' && ['accepted', 'rejected', 'expired'].includes(d.status) && !d.converted_to_id) ? (
                <ActionButton
                  label={isDraft ? 'Edit' : 'Edit / correct'}
                  tone="neutral"
                  onPress={() => {
                    setEditor({ type: d.doc_type as DocKind, existing: detail });
                    setDetail(null);
                  }}
                />
              ) : null}
              {isDraft ? (
                <ActionButton
                  label="Issue"
                  busy={busy === 'issue'}
                  onPress={() =>
                    Alert.alert('Issue this document?', 'Once issued it takes its number and can only be corrected, not deleted.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Issue', onPress: () => act('issue', () => issueSales(d.id), () => reopen(d.id)) },
                    ])
                  }
                />
              ) : null}
            </View>
            {d.doc_type === 'estimate' && ['issued', 'accepted'].includes(d.status) && !d.converted_to_id ? (
              <View style={styles.actions}>
                <ActionButton label="Mark accepted" tone="neutral" onPress={() => setAcceptId(d.id)} />
                <ActionButton
                  label="Convert to invoice"
                  busy={busy === 'convert'}
                  onPress={() =>
                    act('convert', () => convertSales(d.id), () => {
                      setDetail(null);
                      setView('invoice');
                    })
                  }
                />
              </View>
            ) : null}
            {canPay ? <ActionButton label="Record payment" tone="success" onPress={() => d.party_id && startReceipt(d.party_id, partyName, d.id, detail.balance_paise)} /> : null}
            {!isDraft && d.status !== 'cancelled' ? (
              <ActionButton
                label="Cancel document"
                tone="danger"
                busy={busy === 'cancel'}
                onPress={() => setCancelAsk(d.id)}
              />
            ) : null}
          </>
        ) : null}
      </FormSheet>

      {/* How the customer accepted a quotation */}
      <FormSheet visible={acceptId !== null} title="Accepted how?" onClose={() => setAcceptId(null)}>
        {['Call', 'WhatsApp', 'Email', 'Signed copy'].map((m) => (
          <ListRow
            key={m}
            icon="check-circle"
            title={m}
            onPress={() => {
              const id = acceptId as string;
              setAcceptId(null);
              act('accept', () => acceptSales(id, m), () => reopen(id));
            }}
          />
        ))}
      </FormSheet>

      {/* Cancel reason */}
      <FormSheet
        visible={cancelId !== null}
        title="Cancel document"
        onClose={() => setCancelAsk(null)}
        footer={
          <>
            <ActionButton label="Back" tone="neutral" onPress={() => setCancelAsk(null)} />
            <ActionButton
              label="Cancel it"
              tone="danger"
              busy={busy === 'cancel'}
              onPress={() => {
                if (!cancelWhy.trim()) return Alert.alert('Reason', 'A posted document is cancelled, not deleted — say why.');
                act('cancel', () => cancelSales(cancelId as string, cancelWhy.trim()), () => {
                  setCancelAsk(null);
                  setCancelWhy('');
                  setDetail(null);
                });
              }}
            />
          </>
        }
      >
        <Text style={[styles.meta, { color: theme.text2 }]}>Its ledger entry is reversed and both entries stay on record.</Text>
        <Field label="Why is it being cancelled?" value={cancelWhy} onChangeText={setCancelWhy} multiline />
      </FormSheet>

      {/* Receipt */}
      <FormSheet
        visible={!!receipt}
        title="Record a receipt"
        subtitle={receipt ? `${receipt.partyName}${receipt.balance ? ` · ${inr(receipt.balance / 100)} outstanding` : ''}` : undefined}
        onClose={() => setReceipt(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setReceipt(null)} />
            <ActionButton label="Record receipt" tone="success" busy={busy === 'receipt'} onPress={saveReceipt} />
          </>
        }
      >
        <Field label="Amount received ₹" value={recAmount} onChangeText={setRecAmount} keyboardType="numeric" />
        <Field label="Date" value={recDate} onChangeText={setRecDate} hint="YYYY-MM-DD" />
        <Text style={[styles.k, { color: theme.text3 }]}>Method</Text>
        <ChoiceChips items={METHODS.map((m) => [m, humanize(m)] as [string, string])} value={recMethod} onChange={setRecMethod} />
        <Field label="Reference" value={recRef} onChangeText={setRecRef} placeholder="UPI ref, cheque no" />
        <Field label="Note" value={recNote} onChangeText={setRecNote} />
      </FormSheet>

      <SalesEditor
        visible={!!editor}
        docType={editor?.type ?? 'invoice'}
        existing={editor?.existing ?? null}
        onClose={() => setEditor(null)}
        onSaved={(id, issued) => {
          setEditor(null);
          data.reload();
          if (view !== (editor?.type ?? 'invoice') && !['owed', 'receipts'].includes(view)) setView((editor?.type ?? 'invoice') as SalesView);
          openDoc(id);
          if (issued) Alert.alert('Issued', 'The document has its number now.');
        }}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  payAmount: { ...typography.kpi },
  payNote: { ...typography.caption, marginVertical: spacing(1) },
  meta: { ...typography.caption, fontSize: 12 },
  k: { ...typography.caption, fontSize: 12 },
  actions: { flexDirection: 'row', gap: spacing(2.5), marginBottom: spacing(2) },
});
