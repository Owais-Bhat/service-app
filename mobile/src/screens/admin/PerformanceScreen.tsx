import React, { useState } from 'react';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import { fetchLeaderboard } from '../../api/leaderboard';
import { semantic } from '../../theme/tokens';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Board = 'monthly' | 'allTime';

// Customer-review ranking: how many reviews, average stars and 5-star count per
// technician, this month and all time.
export default function PerformanceScreen({ onBack }: Props) {
  const data = useLoader(fetchLeaderboard, 'Could not load performance');
  const [board, setBoard] = useState<Board>('monthly');

  const rows = (data.data?.[board] ?? []).filter((r) => r.count > 0);
  const reviews = rows.reduce((s, r) => s + r.count, 0);
  const avg = reviews ? rows.reduce((s, r) => s + r.avg * r.count, 0) / reviews : 0;
  const five = rows.reduce((s, r) => s + r.fiveStars, 0);

  return (
    <AdminScreen
      title="Employee Performance"
      subtitle="Customer review ranking"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      toolbar={
        <FilterChips
          activeKey={board}
          onSelect={(k) => setBoard(k as Board)}
          items={[
            { key: 'monthly', label: 'This month' },
            { key: 'allTime', label: 'All time' },
          ]}
        />
      }
    >
      <StatGrid
        items={[
          { label: 'Reviews', value: reviews },
          { label: 'Average rating', value: avg ? avg.toFixed(2) : '—', color: semantic.warning },
          { label: '5-star reviews', value: five, color: semantic.success },
          { label: 'Technicians reviewed', value: rows.length },
        ]}
      />
      {rows.length === 0 ? <EmptyNote text="No customer reviews yet" icon="leaderboard" /> : null}
      {rows.map((r, i) => (
        <ListRow
          key={r.id}
          icon={i === 0 ? 'star' : 'user'}
          iconColor={i === 0 ? semantic.warning : undefined}
          title={`${i + 1}. ${r.name}`}
          subtitle={`${r.count} reviews · ${r.fiveStars} five-star`}
          value={`${r.avg.toFixed(2)} ★`}
          valueColor={semantic.warning}
        />
      ))}
    </AdminScreen>
  );
}
