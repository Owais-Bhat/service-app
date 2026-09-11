import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import GlassCard from '../components/GlassCard';
import PressScale from '../components/PressScale';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchAllLeaveRequests, updateLeaveStatus, LeaveRequestWithProfile } from '../api/attendance';

interface Props {
  onBack: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  pending: semantic.warning,
  approved: semantic.success,
  rejected: semantic.danger,
};

export default function LeaveAdminScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [leaves, setLeaves] = useState<LeaveRequestWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAllLeaveRequests();
      setLeaves(data);
      setError(null);
    } catch {
      setError('Could not load leave requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, status: 'approved' | 'rejected') => {
    setActing(id + status);
    try {
      await updateLeaveStatus(id, status);
      setLeaves((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
    } catch {
      // silently ignore — list will refresh on pull
    } finally {
      setActing(null);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Leave Requests" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(16), paddingBottom: spacing(8), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={semantic.success} />}
      >
        {loading && <Text style={[styles.dim, { color: theme.text3 }]}>Loading…</Text>}
        {error && <Text style={[styles.dim, { color: semantic.danger }]}>{error}</Text>}
        {!loading && !error && leaves.length === 0 && (
          <Text style={[styles.dim, { color: theme.text3 }]}>No leave requests</Text>
        )}
        {leaves.map((l) => (
          <GlassCard key={l.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={[styles.name, { color: theme.text }]}>{l.employee_name ?? 'Unknown'}</Text>
              <View style={[styles.badge, { backgroundColor: (STATUS_COLOR[l.status] ?? theme.text3) + '22' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[l.status] ?? theme.text3 }]}>{l.status}</Text>
              </View>
            </View>
            <Text style={[styles.dates, { color: theme.text2 }]}>{l.start_date} → {l.end_date}</Text>
            <Text style={[styles.reason, { color: theme.text3 }]} numberOfLines={2}>{l.reason}</Text>
            {l.status === 'pending' && (
              <View style={styles.actions}>
                <PressScale
                  onPress={() => act(l.id, 'approved')}
                  style={[styles.btn, { backgroundColor: semantic.success + '22', borderColor: semantic.success }]}
                >
                  <Text style={[styles.btnText, { color: semantic.success }]}>
                    {acting === l.id + 'approved' ? '…' : 'Approve'}
                  </Text>
                </PressScale>
                <PressScale
                  onPress={() => act(l.id, 'rejected')}
                  style={[styles.btn, { backgroundColor: semantic.danger + '22', borderColor: semantic.danger }]}
                >
                  <Text style={[styles.btnText, { color: semantic.danger }]}>
                    {acting === l.id + 'rejected' ? '…' : 'Reject'}
                  </Text>
                </PressScale>
              </View>
            )}
          </GlassCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { ...typography.body, textAlign: 'center', marginTop: spacing(8) },
  card: { marginBottom: spacing(3) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) },
  name: { ...typography.bodyBold, flex: 1 },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing(2), paddingVertical: 3 },
  badgeText: { ...typography.caption, fontSize: 11, fontWeight: '600' },
  dates: { ...typography.caption, marginBottom: spacing(1) },
  reason: { ...typography.caption },
  actions: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(3) },
  btn: { flex: 1, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing(2) },
  btnText: { ...typography.caption, fontWeight: '700' },
});
