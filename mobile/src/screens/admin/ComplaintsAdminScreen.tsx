import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ExportButton from '../../components/admin/ExportButton';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import { ComplaintRow, fetchComplaints, respondToComplaint } from '../../api/adminPeople';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { semantic } from '../../theme/tokens';
import { dateTime, humanize } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'open' | 'in_progress' | 'resolved' | 'all';

const COLOR: Record<string, string> = { open: semantic.danger, in_progress: semantic.info, resolved: semantic.success };
const STATUSES = ['open', 'in_progress', 'resolved'] as const;

// Complaints filed against a ticket from the public portal. Replying saves the
// response and — as on the web — the server texts it to the customer.
export default function ComplaintsAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const list = useLoader(fetchComplaints, 'Could not load complaints');
  const [filter, setFilter] = useState<Filter>('open');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<ComplaintRow | null>(null);
  const [status, setStatus] = useState<string>('open');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = list.data ?? [];
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => filter === 'all' || r.status === filter)
      .filter((r) => !q || `${r.ticket_no} ${r.phone} ${r.complaint_text}`.toLowerCase().includes(q));
  }, [rows, filter, query]);

  const openSheet = (r: ComplaintRow) => {
    setStatus(r.status || 'open');
    setResponse(r.admin_response || '');
    setTarget(r);
  };

  const save = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await respondToComplaint(target, { status, response });
      setTarget(null);
      await list.reload();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminScreen
      title="Complaints"
      subtitle={`${count('open')} open`}
      onBack={onBack}
      onRefresh={list.reload}
      loading={list.loading}
      error={list.error}
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Ticket, phone or text" />
          <FilterChips
            activeKey={filter}
            onSelect={(k) => setFilter(k as Filter)}
            items={[
              { key: 'open', label: 'Open', count: count('open') },
              { key: 'in_progress', label: 'In progress', count: count('in_progress') },
              { key: 'resolved', label: 'Resolved', count: count('resolved') },
              { key: 'all', label: 'All', count: rows.length },
            ]}
          />
        </>
      }
    >
      <StatGrid
        items={[
          { label: 'Open', value: count('open'), color: count('open') ? semantic.danger : undefined },
          { label: 'Resolved', value: count('resolved'), color: semantic.success },
        ]}
      />
      <ExportButton name="complaints.csv" rows={visible as unknown as Record<string, unknown>[]} label="Export all" />
      {visible.length === 0 ? <EmptyNote text="No complaints here" icon="alert" /> : null}
      {visible.map((r) => (
        <ListRow
          key={r.id}
          icon="alert"
          iconColor={COLOR[r.status]}
          title={r.ticket_no}
          subtitle={r.complaint_text}
          meta={`${r.phone} · ${dateTime(r.created_at)}${r.admin_response ? ' · replied' : ''}`}
          badge={{ label: humanize(r.status), color: COLOR[r.status] ?? semantic.info }}
          footer={
            <>
              <ActionButton label="Call" tone="neutral" onPress={() => Linking.openURL(`tel:${r.phone}`)} />
              <ActionButton label={r.admin_response ? 'Edit reply' : 'Respond'} onPress={() => openSheet(r)} />
            </>
          }
        />
      ))}

      <FormSheet
        visible={!!target}
        title="Respond to complaint"
        subtitle={target ? `${target.ticket_no} · ${target.phone}` : undefined}
        onClose={() => setTarget(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setTarget(null)} />
            <ActionButton label="Save" onPress={save} busy={busy} />
          </>
        }
      >
        {target ? <Text style={[styles.quote, { color: theme.text2, borderLeftColor: theme.line }]}>{target.complaint_text}</Text> : null}
        <Text style={[styles.label, { color: theme.text3 }]}>Status</Text>
        <View style={styles.chipRow}>
          {STATUSES.map((s) => {
            const on = status === s;
            return (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.chip, { borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.okS : theme.panel }]}
              >
                <Text style={[styles.chipText, { color: on ? theme.accent : theme.text2 }]}>{humanize(s)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Reply to customer" value={response} onChangeText={setResponse} multiline hint="Sent to the customer by SMS when saved" />
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  quote: { ...typography.body, fontSize: 14, borderLeftWidth: 3, paddingLeft: spacing(3) },
  label: { ...typography.caption, fontSize: 12 },
  chipRow: { flexDirection: 'row', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3.5), paddingVertical: spacing(2) },
  chipText: { ...typography.caption, fontSize: 12 },
});
