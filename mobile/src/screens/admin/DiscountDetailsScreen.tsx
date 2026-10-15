import React, { useMemo, useState } from 'react';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import { fetchBilledJobs, fetchPeople } from '../../api/adminMoney';
import { useTheme } from '../../theme/ThemeContext';
import { inr, shortDate } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

// Every bill where a technician gave a discount, with who gave it and why — the
// audit view for the "Employee Discount" and coupon paths on the Bill tab.
export default function DiscountDetailsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(async () => {
    const [jobs, people] = await Promise.all([fetchBilledJobs(), fetchPeople()]);
    return { jobs, names: new Map(people.map((p) => [p.id, p.full_name || 'Employee'])) };
  }, 'Could not load discounts');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => (data.data?.jobs ?? []).filter((j) => Number(j.discount_amount) > 0), [data.data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || `${r.full_name || ''} ${r.ticket_no || ''} ${data.data?.names.get(r.assigned_employee_id || '') || ''}`.toLowerCase().includes(q));
  }, [rows, query, data.data]);

  return (
    <AdminScreen
      title="Discount Details"
      subtitle={`${rows.length} discounted bills`}
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      toolbar={<SearchField value={query} onChangeText={setQuery} placeholder="Customer, ticket or employee" />}
    >
      <StatGrid
        items={[
          { label: 'Discounted bills', value: rows.length },
          { label: 'Total discount', value: inr(rows.reduce((s, r) => s + Number(r.discount_amount), 0)), color: theme.ok },
        ]}
      />
      {visible.length === 0 ? <EmptyNote text="No discounts applied" icon="pricetag" /> : null}
      {visible.map((r) => (
        <ListRow
          key={r.id}
          icon="pricetag"
          title={r.full_name || 'Customer'}
          subtitle={r.discount_reason || (r.discount_preset_id ? 'Admin preset — no reason required' : 'Automatic discount')}
          meta={`${r.ticket_no || ''} · ${data.data?.names.get(r.assigned_employee_id || '') || 'Employee'} · ${shortDate(r.bill_generated_at || r.created_at)}`}
          value={inr(r.discount_amount)}
          valueColor={theme.ok}
          badge={r.discount_label ? { label: r.discount_label, color: theme.info } : undefined}
        />
      ))}
    </AdminScreen>
  );
}
