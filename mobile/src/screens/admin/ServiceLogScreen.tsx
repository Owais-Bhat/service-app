import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ExportButton from '../../components/admin/ExportButton';
import EmptyNote from '../../components/admin/EmptyNote';
import ActionButton from '../../components/admin/ActionButton';
import ServiceLogEntrySheet from '../../components/admin/ServiceLogEntrySheet';
import Icon from '../../components/Icon';
import { api } from '../../api/client';
import { fetchServiceLogs, ServiceLogRow } from '../../api/adminOps';
import { radius } from '../../theme';
import { brand } from '../../theme/tokens';
import { semantic } from '../../theme/tokens';
import { inr, shortDate } from '../../utils/format';
import { todayIso } from '../../utils/format';
import { RANGE_CHIPS, RangeKey, rangeStart, useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Status = 'all' | 'paid' | 'pending' | 'unpaid';

const STATUS_COLOR: Record<string, string> = { paid: semantic.success, pending: semantic.warning, unpaid: semantic.danger };

// The service register: same columns as the old Service_Log sheet with the
// Paid / Pending / Unpaid totals on top. Read and filter here; entries are
// still typed in on the web where the full form lives.
export default function ServiceLogScreen({ onBack }: Props) {
  const [range, setRange] = useState<RangeKey>('month');
  const [status, setStatus] = useState<Status>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ServiceLogRow | 'new' | null>(null);

  const remove = (r: ServiceLogRow) =>
    Alert.alert('Delete entry?', `${r.customer_name} (${r.log_date.slice(0, 10)})`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/service-logs/${r.id}`);
            await logs.reload();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);

  const fetcher = useCallback(() => fetchServiceLogs(rangeStart(range), todayIso()), [range]);
  const logs = useLoader(fetcher, 'Could not load the service log');

  const rows = logs.data ?? [];
  const sum = (list: typeof rows) => list.reduce((s, r) => s + Number(r.amount || 0), 0);
  const by = (s: string) => rows.filter((r) => r.payment_status === s);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => status === 'all' || r.payment_status === status)
      .filter((r) => !q || `${r.customer_name} ${r.technician_name || ''} ${r.ticket_no || ''} ${r.service_type || ''}`.toLowerCase().includes(q));
  }, [rows, status, query]);

  return (
    <AdminScreen
      title="Service Log"
      subtitle={`${rows.length} entries · ${inr(sum(rows))}`}
      onBack={onBack}
      onRefresh={logs.reload}
      loading={logs.loading}
      error={logs.error}
      headerRight={
        <Pressable onPress={() => setEditing('new')} hitSlop={8} style={[styles.add, { backgroundColor: brand.fill }]} accessibilityLabel="New entry">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Customer, technician or ticket" />
          <FilterChips items={RANGE_CHIPS.filter((c) => c.key !== 'today')} activeKey={range} onSelect={(k) => setRange(k as RangeKey)} />
          <FilterChips
            activeKey={status}
            onSelect={(k) => setStatus(k as Status)}
            items={[
              { key: 'all', label: 'All', count: rows.length },
              { key: 'paid', label: 'Paid', count: by('paid').length },
              { key: 'pending', label: 'Pending', count: by('pending').length },
              { key: 'unpaid', label: 'Unpaid', count: by('unpaid').length },
            ]}
          />
        </>
      }
    >
      <StatGrid
        items={[
          { label: 'Paid', value: inr(sum(by('paid'))), color: semantic.success },
          { label: 'Pending', value: inr(sum(by('pending'))), color: semantic.warning },
          { label: 'Unpaid', value: inr(sum(by('unpaid'))), color: semantic.danger },
          { label: 'Total', value: inr(sum(rows)) },
        ]}
      />
      <ExportButton
        name="service-log.csv"
        rows={visible.map((r) => ({ Date: String(r.log_date).slice(0, 10), Ticket: r.ticket_no, Technician: r.technician_name, Customer: r.customer_name, Phone: r.customer_phone, Service: r.service_type, Problem: r.problem, Items: r.items_used, Amount: r.amount, Payment: r.payment_status }))}
      />
      {visible.length === 0 ? <EmptyNote text="No entries for these filters" icon="list" /> : null}
      {visible.map((r) => (
        <ListRow
          key={r.id}
          icon="list"
          iconColor={STATUS_COLOR[r.payment_status]}
          title={r.customer_name}
          subtitle={[r.service_type, r.problem].filter(Boolean).join(' — ') || undefined}
          meta={`${shortDate(r.log_date)} · ${r.technician_name || 'No technician'}${r.ticket_no ? ` · ${r.ticket_no}` : ''}`}
          value={inr(r.amount)}
          badge={{ label: r.payment_status, color: STATUS_COLOR[r.payment_status] ?? semantic.info }}
          onPress={() => setEditing(r)}
          footer={
            <>
              <ActionButton label="Edit" tone="neutral" onPress={() => setEditing(r)} />
              <ActionButton label="Delete" tone="danger" onPress={() => remove(r)} />
            </>
          }
        />
      ))}
      <ServiceLogEntrySheet
        visible={editing !== null}
        entry={editing && editing !== 'new' ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          logs.reload();
        }}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
