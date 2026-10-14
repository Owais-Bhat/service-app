import React, { useMemo, useState } from 'react';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import { DeviceTrackingRow, fetchDeviceTracking } from '../../api/adminOps';
import { semantic } from '../../theme/tokens';
import { dateTime, humanize } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
  onOpenDevice: (inquiryId: string) => void;
}

type Filter = 'all' | 'taken' | 'returned' | 'flagged';

const CLOSED = new Set(['resolved', 'closed', 'case_closed', 'foc', 'issue_not_resolved']);

// A job that closed while the device trail never reached "returned" — the gap
// left when device service is switched off instead of a real return logged.
function closedWithoutReturn(r: DeviceTrackingRow): boolean {
  const returned = r.device_status === 'returned' || r.follow_up_status === 'returned' || (r.device_return_logs?.length ?? 0) > 0;
  return CLOSED.has((r.status || '').toLowerCase()) && !returned;
}

const FOLLOW: Record<string, { label: string; color: string }> = {
  awaiting_parts: { label: 'Awaiting parts', color: semantic.danger },
  repair_progress: { label: 'In repair', color: semantic.info },
  ready_return: { label: 'Ready to return', color: semantic.warning },
  returned: { label: 'Returned', color: semantic.success },
};

export default function DeviceTrackingAdminScreen({ onBack, onOpenDevice }: Props) {
  const list = useLoader(fetchDeviceTracking, 'Could not load device tracking');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const rows = list.data ?? [];
  const counts = useMemo(
    () => ({
      all: rows.length,
      taken: rows.filter((r) => r.device_status !== 'returned' && r.follow_up_status !== 'returned').length,
      returned: rows.filter((r) => r.device_status === 'returned' || r.follow_up_status === 'returned').length,
      flagged: rows.filter(closedWithoutReturn).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const returned = r.device_status === 'returned' || r.follow_up_status === 'returned';
      if (filter === 'taken' && returned) return false;
      if (filter === 'returned' && !returned) return false;
      if (filter === 'flagged' && !closedWithoutReturn(r)) return false;
      return !q || `${r.ticket_no || ''} ${r.full_name || ''} ${r.phone || ''}`.toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  return (
    <AdminScreen
      title="Device Tracking"
      subtitle="Devices taken for service"
      onBack={onBack}
      onRefresh={list.reload}
      loading={list.loading}
      error={list.error}
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Ticket, phone or customer" />
          <FilterChips
            activeKey={filter}
            onSelect={(k) => setFilter(k as Filter)}
            items={[
              { key: 'all', label: 'All', count: counts.all },
              { key: 'taken', label: 'With us', count: counts.taken },
              { key: 'returned', label: 'Returned', count: counts.returned },
              { key: 'flagged', label: 'Closed, not returned', count: counts.flagged },
            ]}
          />
        </>
      }
    >
      {visible.length === 0 ? <EmptyNote text="No devices in this view" icon="device" /> : null}
      {visible.map((r) => {
        const flagged = closedWithoutReturn(r);
        const follow = r.follow_up_status ? FOLLOW[r.follow_up_status] : undefined;
        const taken = r.device_taken_logs?.[0];
        return (
          <ListRow
            key={r.id}
            icon="device"
            iconColor={flagged ? semantic.danger : undefined}
            title={r.full_name || 'Customer'}
            subtitle={r.service_item || undefined}
            meta={`${r.ticket_no || ''}${taken ? ` · ${taken.profiles?.full_name || 'Staff'}, ${dateTime(taken.taken_at)}` : ''}`}
            badge={
              flagged
                ? { label: 'Closed, not returned', color: semantic.danger }
                : follow ?? { label: humanize(r.device_status) || 'Taken', color: semantic.warning }
            }
            onPress={() => onOpenDevice(r.id)}
          />
        );
      })}
    </AdminScreen>
  );
}
