import React, { useCallback, useEffect, useState } from 'react';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import { rupees } from '../../api/adminBooks';
import { fetchPastRecords, PastRecord } from '../../api/adminExtra';
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
    </AdminScreen>
  );
}
