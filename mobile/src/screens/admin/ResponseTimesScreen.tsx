import React, { useMemo, useState } from 'react';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ExportButton from '../../components/admin/ExportButton';
import EmptyNote from '../../components/admin/EmptyNote';
import { fetchResponseTimes } from '../../api/adminOps';
import { semantic } from '../../theme/tokens';
import { dateTime } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Kind = 'all' | 'assignment' | 'employee';

// Two clocks, two working hours each: the office to assign a request, then the
// technician to post a first update. A row exists only when a clock ran out.
const WORKING_ALLOWANCE_MIN = 120;

function lateBy(minutes: number | null): string {
  if (minutes == null) return '—';
  const over = Math.max(0, minutes - WORKING_ALLOWANCE_MIN);
  if (over < 60) return `${over} min late`;
  return `${Math.floor(over / 60)}h ${over % 60}m late`;
}

export default function ResponseTimesScreen({ onBack }: Props) {
  const list = useLoader(fetchResponseTimes, 'Could not load response times');
  const [kind, setKind] = useState<Kind>('all');

  const rows = list.data ?? [];
  const visible = useMemo(() => rows.filter((r) => kind === 'all' || r.kind === kind), [rows, kind]);
  const stillOpen = rows.filter((r) => !r.responded_at).length;
  const answered = rows.filter((r) => r.responded_at && r.response_minutes != null);
  const avg = answered.length ? Math.round(answered.reduce((s, r) => s + (r.response_minutes || 0), 0) / answered.length) : null;

  return (
    <AdminScreen
      title="Response Time"
      subtitle="Who was late and by how much"
      onBack={onBack}
      onRefresh={list.reload}
      loading={list.loading}
      error={list.error}
      toolbar={
        <FilterChips
          activeKey={kind}
          onSelect={(k) => setKind(k as Kind)}
          items={[
            { key: 'all', label: 'All', count: rows.length },
            { key: 'assignment', label: 'Late to assign', count: rows.filter((r) => r.kind === 'assignment').length },
            { key: 'employee', label: 'Late update', count: rows.filter((r) => r.kind === 'employee').length },
          ]}
        />
      }
    >
      <StatGrid
        items={[
          { label: 'Still waiting', value: stillOpen, color: stillOpen ? semantic.danger : undefined },
          { label: 'Avg response (late ones)', value: avg == null ? '—' : avg < 60 ? `${avg}m` : `${Math.floor(avg / 60)}h ${avg % 60}m` },
        ]}
      />
      <ExportButton name="response-times.csv" rows={visible as unknown as Record<string, unknown>[]} />
      {visible.length === 0 ? <EmptyNote text="No missed response times" icon="check-circle" /> : null}
      {visible.map((r) => {
        const waiting = !r.responded_at;
        return (
          <ListRow
            key={r.id}
            icon="clock"
            iconColor={waiting ? semantic.danger : semantic.warning}
            title={r.full_name || 'Customer'}
            subtitle={`${r.kind === 'assignment' ? 'Office to assign' : r.employee_name || 'Technician'}${r.service_item ? ` · ${r.service_item}` : ''}`}
            meta={`${r.ticket_no || ''} · started ${dateTime(r.started_at)}`}
            badge={waiting ? { label: 'Still waiting', color: semantic.danger } : { label: lateBy(r.response_minutes), color: semantic.warning }}
          />
        );
      })}
    </AdminScreen>
  );
}
