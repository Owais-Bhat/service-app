import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import { dataGet } from '../../api/client';
import { semantic } from '../../theme/tokens';
import { humanize } from '../../utils/format';

export interface EmployeeSummary {
  id: string;
  full_name: string;
  role: string;
  phone?: string | null;
  worker_type?: string | null;
}

interface Props {
  onBack: () => void;
  onOpen: (employee: EmployeeSummary) => void;
}

type Filter = 'all' | 'employee' | 'team_lead' | 'gig';

// Picker in front of the per-employee panel: everyone who works jobs, with the
// role / worker-type filters the web Employees page offers.
export default function EmployeesScreen({ onBack, onOpen }: Props) {
  const [rows, setRows] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      const data = await dataGet<EmployeeSummary[]>('profiles', { select: 'id,full_name,role,phone,worker_type', order: 'full_name:asc' });
      setRows(data.filter((r) => r.role === 'employee' || r.role === 'team_lead'));
      setError(null);
    } catch {
      setError('Could not load employees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      employee: rows.filter((r) => r.role === 'employee').length,
      team_lead: rows.filter((r) => r.role === 'team_lead').length,
      gig: rows.filter((r) => r.worker_type === 'gig').length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'employee' && r.role !== 'employee') return false;
      if (filter === 'team_lead' && r.role !== 'team_lead') return false;
      if (filter === 'gig' && r.worker_type !== 'gig') return false;
      return !q || (r.full_name || '').toLowerCase().includes(q) || (r.phone || '').includes(q);
    });
  }, [rows, query, filter]);

  return (
    <AdminScreen
      title="Employees"
      subtitle={`${rows.length} people`}
      onBack={onBack}
      onRefresh={load}
      loading={loading}
      error={error}
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search name or phone" />
          <FilterChips
            activeKey={filter}
            onSelect={(k) => setFilter(k as Filter)}
            items={[
              { key: 'all', label: 'All', count: counts.all },
              { key: 'employee', label: 'Technicians', count: counts.employee },
              { key: 'team_lead', label: 'Team leads', count: counts.team_lead },
              { key: 'gig', label: 'Gig', count: counts.gig },
            ]}
          />
        </>
      }
    >
      {visible.length === 0 ? <EmptyNote text="No employee matches" icon="people" /> : null}
      {visible.map((r) => (
        <ListRow
          key={r.id}
          icon="user"
          iconColor={r.role === 'team_lead' ? semantic.warning : undefined}
          title={r.full_name || 'Unnamed'}
          subtitle={r.phone || undefined}
          badge={{ label: r.role === 'team_lead' ? 'Team lead' : humanize(r.worker_type || 'fixed'), color: r.role === 'team_lead' ? semantic.warning : semantic.info }}
          onPress={() => onOpen(r)}
        />
      ))}
    </AdminScreen>
  );
}
