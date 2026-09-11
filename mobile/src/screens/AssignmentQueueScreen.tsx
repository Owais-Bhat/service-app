import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import GlassCard from '../components/GlassCard';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchAssignmentQueue, AssignmentQueueRow } from '../api/admin';

interface Props {
  onBack: () => void;
}

const STATUS_PILL: Record<string, { label: string; color: string }> = {
  none: { label: 'Unassigned', color: semantic.danger },
  pending: { label: 'Pending', color: semantic.warning },
  accepted: { label: 'Accepted', color: semantic.success },
  declined: { label: 'Declined', color: semantic.danger },
};

const FILTERS = ['All', 'Unassigned', 'Pending', 'Accepted'];

export default function AssignmentQueueScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [rows, setRows] = useState<AssignmentQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => {
    if (filter === 'All') return true;
    if (filter === 'Unassigned') return r.assignment_status === 'none';
    if (filter === 'Pending') return r.assignment_status === 'pending';
    if (filter === 'Accepted') return r.assignment_status === 'accepted';
    return true;
  });

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Assignment Queue" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(16), paddingBottom: spacing(8), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={semantic.success} />}
      >
        {/* Filter pills */}
        <View style={styles.pills}>
          {FILTERS.map((f) => (
            <Text
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.pill, { backgroundColor: filter === f ? brand.primary + '22' : theme.neuDark, color: filter === f ? brand.primary : theme.text3, borderColor: filter === f ? brand.primary : 'transparent' }]}
            >
              {f}
            </Text>
          ))}
        </View>

        {loading && <Text style={[styles.dim, { color: theme.text3 }]}>Loading…</Text>}
        {error && <Text style={[styles.dim, { color: semantic.danger }]}>{error}</Text>}
        {!loading && !error && filtered.length === 0 && (
          <Text style={[styles.dim, { color: theme.text3 }]}>No items</Text>
        )}

        {filtered.map((r) => {
          const pill = STATUS_PILL[r.assignment_status] ?? { label: r.assignment_status, color: theme.text3 };
          return (
            <GlassCard key={r.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={[styles.ticket, { color: brand.primary }]}>#{r.ticket_no}</Text>
                <View style={[styles.badge, { backgroundColor: pill.color + '22' }]}>
                  <Text style={[styles.badgeText, { color: pill.color }]}>{pill.label}</Text>
                </View>
              </View>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{r.full_name}</Text>
              {r.service_item ? <Text style={[styles.sub, { color: theme.text3 }]} numberOfLines={1}>{r.service_item}</Text> : null}
              {r.employee_name ? (
                <Text style={[styles.employee, { color: semantic.success }]}>→ {r.employee_name}</Text>
              ) : (
                <Text style={[styles.employee, { color: semantic.danger }]}>No employee assigned</Text>
              )}
              <Text style={[styles.date, { color: theme.text3 }]}>{new Date(r.created_at).toLocaleDateString('en-IN')}</Text>
            </GlassCard>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(4) },
  pill: { ...typography.caption, fontWeight: '600', borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderWidth: 1, overflow: 'hidden' },
  dim: { ...typography.body, textAlign: 'center', marginTop: spacing(8) },
  card: { marginBottom: spacing(3) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) },
  ticket: { ...typography.caption, fontWeight: '700' },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing(2), paddingVertical: 3 },
  badgeText: { ...typography.caption, fontSize: 11, fontWeight: '600' },
  name: { ...typography.body, fontWeight: '700' as const, marginBottom: 2 },
  sub: { ...typography.caption, marginBottom: spacing(1) },
  employee: { ...typography.caption, fontWeight: '600', marginTop: spacing(1) },
  date: { ...typography.caption, marginTop: spacing(1) },
});
