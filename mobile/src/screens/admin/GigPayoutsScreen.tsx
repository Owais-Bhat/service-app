import React, { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import { fetchGigJobs, fetchPeople, markGigPayoutPaid } from '../../api/adminMoney';
import { semantic } from '../../theme/tokens';
import { inr, shortDate } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'unpaid' | 'paid' | 'all';

// Public-pool jobs: the company keeps GST + platform fee, the worker is paid
// the rest. This is where that payout is marked as handed over.
export default function GigPayoutsScreen({ onBack }: Props) {
  const data = useLoader(async () => {
    const [jobs, people] = await Promise.all([fetchGigJobs(), fetchPeople()]);
    return { jobs, names: new Map(people.map((p) => [p.id, p.full_name || 'Worker'])) };
  }, 'Could not load gig payouts');
  const [filter, setFilter] = useState<Filter>('unpaid');
  const [busy, setBusy] = useState<string | null>(null);

  const jobs = data.data?.jobs ?? [];
  const paid = jobs.filter((j) => j.gig_payout_status === 'paid');
  const unpaid = jobs.filter((j) => j.gig_payout_status !== 'paid');
  const payout = (list: typeof jobs) => list.reduce((s, j) => s + (Number(j.gig_payout_amount) || 0), 0);

  const visible = useMemo(
    () => jobs.filter((j) => (filter === 'all' ? true : filter === 'paid' ? j.gig_payout_status === 'paid' : j.gig_payout_status !== 'paid')),
    [jobs, filter],
  );

  const pay = (id: string, who: string, amount: number) =>
    Alert.alert('Mark payout as paid?', `${who} · ${inr(amount)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark paid',
        onPress: async () => {
          setBusy(id);
          try {
            await markGigPayoutPaid(id);
            await data.reload();
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
      title="Gig Payouts"
      subtitle="Public-pool worker payouts"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      toolbar={
        <FilterChips
          activeKey={filter}
          onSelect={(k) => setFilter(k as Filter)}
          items={[
            { key: 'unpaid', label: 'Awaiting payout', count: unpaid.length },
            { key: 'paid', label: 'Paid', count: paid.length },
            { key: 'all', label: 'All', count: jobs.length },
          ]}
        />
      }
    >
      <StatGrid
        items={[
          { label: 'Awaiting payout', value: inr(payout(unpaid)), color: semantic.warning },
          { label: 'Paid out', value: inr(payout(paid)), color: semantic.success },
        ]}
      />
      {visible.length === 0 ? <EmptyNote text="No gig-worker jobs here" icon="wallet" /> : null}
      {visible.map((j) => {
        const isPaid = j.gig_payout_status === 'paid';
        const who = data.data?.names.get(j.claimed_by_gig_worker_id || '') || 'Worker';
        const amount = Number(j.gig_payout_amount) || 0;
        return (
          <ListRow
            key={j.id}
            icon="wallet"
            iconColor={isPaid ? semantic.success : semantic.warning}
            title={who}
            subtitle={`${j.full_name || 'Customer'}${j.service_item ? ` · ${j.service_item}` : ''}`}
            meta={`${j.ticket_no || ''} · billed ${inr(j.bill_total)} · ${shortDate(j.bill_generated_at || j.created_at)}`}
            value={inr(amount)}
            badge={{ label: isPaid ? 'Paid' : 'Awaiting', color: isPaid ? semantic.success : semantic.warning }}
            footer={!isPaid ? <ActionButton label="Mark paid" tone="success" busy={busy === j.id} onPress={() => pay(j.id, who, amount)} /> : undefined}
          />
        );
      })}
    </AdminScreen>
  );
}
