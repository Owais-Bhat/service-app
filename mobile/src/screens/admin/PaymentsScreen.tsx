import React, { useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import { BilledJob, fetchBilledJobs, markJobPaid } from '../../api/adminMoney';
import { semantic } from '../../theme/tokens';
import { inr, shortDate } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'all' | 'unpaid' | 'paid';

// Payment tracker: every billed job and whether the money is in. "Mark paid"
// applies exactly what the web button does — it records cash unless a method
// is already set, and resolves the job if it was still open.
export default function PaymentsScreen({ onBack }: Props) {
  const jobs = useLoader(fetchBilledJobs, 'Could not load payments');
  const [filter, setFilter] = useState<Filter>('unpaid');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => (jobs.data ?? []).filter((r) => Number(r.bill_amount) > 0 || Number(r.bill_total) > 0), [jobs.data]);
  const paid = rows.filter((r) => r.payment_status === 'paid');
  const unpaid = rows.filter((r) => r.payment_status !== 'paid');
  const amt = (r: BilledJob) => Number(r.bill_total) || Number(r.bill_amount) || 0;
  const total = (list: BilledJob[]) => list.reduce((s, r) => s + amt(r), 0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (filter === 'all' ? true : filter === 'paid' ? r.payment_status === 'paid' : r.payment_status !== 'paid'))
      .filter((r) => !q || `${r.full_name || ''} ${r.ticket_no || ''} ${r.phone || ''}`.toLowerCase().includes(q));
  }, [rows, filter, query]);

  const confirmPaid = (job: BilledJob) =>
    Alert.alert('Mark as paid?', `${job.full_name || 'Customer'} · ${inr(amt(job))}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark paid',
        onPress: async () => {
          setBusy(job.id);
          try {
            await markJobPaid(job);
            await jobs.reload();
          } catch (e) {
            Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <AdminScreen
      title="Payments"
      subtitle={`${rows.length} billed jobs`}
      onBack={onBack}
      onRefresh={jobs.reload}
      loading={jobs.loading}
      error={jobs.error}
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Customer, ticket or phone" />
          <FilterChips
            activeKey={filter}
            onSelect={(k) => setFilter(k as Filter)}
            items={[
              { key: 'unpaid', label: 'Unpaid', count: unpaid.length },
              { key: 'paid', label: 'Paid', count: paid.length },
              { key: 'all', label: 'All', count: rows.length },
            ]}
          />
        </>
      }
    >
      <StatGrid
        items={[
          { label: 'Received', value: inr(total(paid)), color: semantic.success },
          { label: 'Pending', value: inr(total(unpaid)), color: semantic.warning },
        ]}
      />
      {visible.length === 0 ? <EmptyNote text="No payment records here" icon="cash" /> : null}
      {visible.map((r) => {
        const isPaid = r.payment_status === 'paid';
        return (
          <ListRow
            key={r.id}
            icon="cash"
            iconColor={isPaid ? semantic.success : semantic.warning}
            title={r.full_name || 'Customer'}
            subtitle={r.service_item || undefined}
            meta={`${r.ticket_no || ''} · ${shortDate(r.bill_generated_at || r.created_at)}${r.payment_method ? ` · ${r.payment_method}` : ''}`}
            value={inr(amt(r))}
            badge={{ label: isPaid ? 'Paid' : 'Unpaid', color: isPaid ? semantic.success : semantic.warning }}
            footer={
              !isPaid || r.payment_link ? (
                <>
                  {r.payment_link ? <ActionButton label="Pay link" tone="neutral" onPress={() => Linking.openURL(r.payment_link as string)} /> : null}
                  {!isPaid ? <ActionButton label="Mark paid" tone="success" busy={busy === r.id} onPress={() => confirmPaid(r)} /> : null}
                </>
              ) : undefined
            }
          />
        );
      })}
    </AdminScreen>
  );
}
