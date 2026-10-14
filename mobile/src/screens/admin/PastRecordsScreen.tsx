import React, { useCallback, useEffect, useState } from 'react';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import { rupees } from '../../api/adminBooks';
import { fetchPastRecord, fetchPastRecords, PastRecord, PastRecordFull } from '../../api/adminExtra';
import FormSheet from '../../components/admin/FormSheet';
import SectionLabel from '../../components/admin/SectionLabel';
import { Alert } from 'react-native';
import { semantic } from '../../theme/tokens';
import { humanize, inr, shortDate } from '../../utils/format';

interface Props {
  onBack: () => void;
}

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'sale', label: 'Invoices' },
  { key: 'estimate', label: 'Quotations' },
  { key: 'payment_in', label: 'Received' },
  { key: 'purchase', label: 'Purchases' },
  { key: 'payment_out', label: 'Paid out' },
  { key: 'sale_return', label: 'Credit notes' },
];

const LABEL: Record<string, string> = {
  sale: 'Invoice',
  estimate: 'Quotation',
  purchase: 'Purchase',
  payment_in: 'Payment received',
  payment_out: 'Payment made',
  sale_return: 'Credit note',
  purchase_return: 'Purchase return',
  expense: 'Expense',
  delivery_challan: 'Delivery challan',
};

// Read-only history brought over from Vyapar. It changes no balance, stock count
// or tax return — it is here to look things up.
export default function PastRecordsScreen({ onBack }: Props) {
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<PastRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<PastRecordFull | null>(null);

  const openRecord = async (id: string) => {
    try {
      setRec(await fetchPastRecord(id));
    } catch (e) {
      Alert.alert('Could not open the record', e instanceof Error ? e.message : 'Try again');
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (reset: boolean, offset = 0) => {
      try {
        const page = await fetchPastRecords(type, debounced, reset ? 0 : offset);
        setRows((prev) => (reset ? page.rows : prev.concat(page.rows)));
        setTotal(page.total);
        setSum(page.total_paise);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load records');
      } finally {
        setLoading(false);
        setMore(false);
      }
    },
    [type, debounced],
  );

  useEffect(() => {
    setLoading(true);
    load(true);
  }, [load]);

  return (
    <AdminScreen
      title="Past Records"
      subtitle={total ? `${total.toLocaleString('en-IN')} records · ${inr(rupees(sum))}` : 'Imported from Vyapar'}
      onBack={onBack}
      onRefresh={() => load(true)}
      loading={loading}
      error={error}
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Number, customer or phone" />
          <FilterChips items={TYPES} activeKey={type} onSelect={setType} />
        </>
      }
    >
      {rows.length === 0 ? <EmptyNote text="Nothing here. Bring Vyapar data in from the web portal first." icon="book" /> : null}
      {rows.map((r) => (
        <ListRow
          key={r.id}
          icon="book"
          title={r.party_name || '—'}
          subtitle={`${LABEL[r.doc_type] || humanize(r.doc_type)}${r.doc_no ? ` · ${r.doc_no}` : ''}`}
          meta={`${shortDate(r.doc_date)}${r.party_phone ? ` · ${r.party_phone}` : ''}${r.payment_mode ? ` · ${r.payment_mode}` : ''}`}
          value={inr(rupees(r.total_paise))}
          badge={r.payment_state ? { label: humanize(r.payment_state), color: r.payment_state === 'paid' ? semantic.success : semantic.warning } : undefined}
          onPress={() => openRecord(r.id)}
        />
      ))}
      {rows.length > 0 && rows.length < total ? (
        <ActionButton
          label={`Show more (${(total - rows.length).toLocaleString('en-IN')} left)`}
          tone="neutral"
          busy={more}
          onPress={() => {
            setMore(true);
            load(false, rows.length);
          }}
        />
      ) : null}
      <FormSheet
        visible={!!rec}
        title={rec ? `${LABEL[rec.document.doc_type] || humanize(rec.document.doc_type)} ${rec.document.doc_no || ''}` : ''}
        subtitle="A Vyapar record, kept to look at"
        onClose={() => setRec(null)}
      >
        {rec ? (
          <>
            <ListRow title={rec.document.party_name || '—'} subtitle={rec.document.party_phone || undefined} meta={shortDate(rec.document.doc_date)} value={inr(rupees(rec.document.total_paise))} />
            {rec.document.payment_mode || rec.document.reference || Number(rec.document.paid_paise) ? (
              <ListRow
                title="Payment"
                subtitle={[rec.document.payment_mode, rec.document.reference].filter(Boolean).join(' · ') || undefined}
                value={Number(rec.document.paid_paise) ? inr(rupees(rec.document.paid_paise)) : undefined}
              />
            ) : null}
            {rec.lines.length ? <SectionLabel>Items</SectionLabel> : null}
            {rec.lines.map((l) => (
              <ListRow
                key={l.line_no}
                icon="box"
                title={l.item_name}
                subtitle={`${Number(l.quantity)} ${l.unit || ''} × ${inr(rupees(l.rate_paise))}${l.tax_rate_bps ? ` · ${Number(l.tax_rate_bps) / 100}% tax` : ''}${l.hsn_sac ? ` · HSN ${l.hsn_sac}` : ''}`}
                meta={l.serial_no ? `Serial ${l.serial_no}` : undefined}
                value={inr(rupees(l.amount_paise))}
              />
            ))}
            {(rec.document.charges || []).map((c, i) => (
              <ListRow key={i} title={c.name} value={inr(rupees(c.amount_paise))} />
            ))}
            {Number(rec.document.discount_paise) ? <ListRow title="Discount" value={inr(rupees(rec.document.discount_paise))} /> : null}
            {rec.document.notes ? <ListRow title="Notes" subtitle={rec.document.notes} /> : null}
            {rec.related.length ? <SectionLabel>Linked records</SectionLabel> : null}
            {rec.related.map((r, i) => (
              <ListRow
                key={i}
                icon="book"
                title={{ payment: 'Payment against it', converted_to: 'Became', converted_from: 'Came from' }[r.kind] || humanize(r.kind)}
                subtitle={r.record ? `${LABEL[r.record.doc_type] || humanize(r.record.doc_type)} ${r.record.doc_no || ''} · ${shortDate(r.record.doc_date)}` : undefined}
                value={r.amount_paise != null ? inr(rupees(r.amount_paise)) : undefined}
                onPress={r.record ? () => openRecord((r.record as { id: string }).id) : undefined}
              />
            ))}
          </>
        ) : null}
      </FormSheet>
    </AdminScreen>
  );
}
