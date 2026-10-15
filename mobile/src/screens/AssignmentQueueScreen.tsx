import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import FilterChips from '../components/admin/FilterChips';
import StatusBadge from '../components/admin/StatusBadge';
import EmptyNote from '../components/admin/EmptyNote';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { fetchAssignmentQueue, AssignmentQueueRow } from '../api/admin';

interface Props {
  onBack: () => void;
}

const FILTERS = ['All', 'Unassigned', 'Pending', 'Accepted'];

export default function AssignmentQueueScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [rows, setRows] = useState<AssignmentQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');

  const load = useCallback(async () => {
    try {
      const data = await fetchAssignmentQueue();
      setRows(data);
      setError(null);
    } catch {
      setError('Could not load assignment queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const matches = (r: AssignmentQueueRow, f: string) => {
    if (f === 'All') return true;
    if (f === 'Unassigned') return r.assignment_status === 'none';
    if (f === 'Pending') return r.assignment_status === 'pending';
    if (f === 'Accepted') return r.assignment_status === 'accepted';
    return true;
  };
  const filtered = rows.filter((r) => matches(r, filter));

  const pillFor = (status: string): { label: string; color: string } => {
    switch (status) {
      case 'none': return { label: 'Unassigned', color: theme.err };
      case 'pending': return { label: 'Pending', color: theme.warn };
      case 'accepted': return { label: 'Accepted', color: theme.ok };
      case 'declined': return { label: 'Declined', color: theme.err };
      default: return { label: status, color: theme.grey };
    }
  };

  return (
    <AdminScreen
      title="Assignment Queue"
      subtitle="Requests and who holds them"
      onBack={onBack}
      onRefresh={load}
      loading={loading && rows.length === 0}
      error={error}
      toolbar={
        <FilterChips
          items={FILTERS.map((f) => ({ key: f, label: f, count: rows.filter((r) => matches(r, f)).length }))}
          activeKey={filter}
          onSelect={setFilter}
        />
      }
    >
      {filtered.length === 0 && !loading && !error ? <EmptyNote text="No items" icon="list" /> : null}
      {filtered.map((r) => {
        const pill = pillFor(r.assignment_status);
        return (
          <View key={r.id} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            <View style={styles.head}>
              <Text style={[styles.ticket, { color: theme.accent }]} numberOfLines={1}>{r.ticket_no}</Text>
              <StatusBadge label={pill.label} color={pill.color} />
            </View>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{r.full_name}</Text>
            {r.service_item ? <Text style={[styles.sub, { color: theme.text2 }]} numberOfLines={1}>{r.service_item}</Text> : null}
            <View style={styles.meta}>
              <View style={styles.metaItem}>
                <Icon name="user" size={14} color={r.employee_name ? theme.ok : theme.err} />
                <Text style={[styles.metaText, { color: r.employee_name ? theme.ok : theme.err }]} numberOfLines={1}>
                  {r.employee_name || 'No employee assigned'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Icon name="calendar" size={14} color={theme.text3} />
                <Text style={[styles.metaText, { color: theme.text3 }]}>{new Date(r.created_at).toLocaleDateString('en-IN')}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5), marginBottom: spacing(2.5), gap: spacing(1.5) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2) },
  ticket: { ...typography.monoId, flexShrink: 1 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16, lineHeight: 22 },
  sub: { ...typography.supporting },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginTop: spacing(0.5) },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), flexShrink: 1 },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, lineHeight: 16, flexShrink: 1 },
});
