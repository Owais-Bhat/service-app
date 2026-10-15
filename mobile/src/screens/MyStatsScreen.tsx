import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import Panel from '../components/Panel';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { fetchMyTasks, TaskItem } from '../api/tasks';
import { fetchAttendanceHistory, fetchLeaveRequests, AttendanceRow, LeaveRequest } from '../api/attendance';
import { fetchCashInquiries, cashAmount, CashInquiry } from '../api/earnings';

interface Props {
  onBack: () => void;
}

function money(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function MyStatsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<{ pending: TaskItem[]; items: TaskItem[] } | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [cash, setCash] = useState<CashInquiry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [t, att, lv, c] = await Promise.all([
        fetchMyTasks(user.id),
        fetchAttendanceHistory(user.id),
        fetchLeaveRequests(user.id),
        fetchCashInquiries(user.id),
      ]);
      setTasks(t);
      setAttendance(att);
      setLeaves(lv);
      setCash(c);
      setError(null);
    } catch {
      setError('Could not load stats — pull to retry');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const allTasks = tasks ? [...tasks.pending, ...tasks.items] : [];
  const resolved = allTasks.filter((t) => t.status === 'resolved' || t.status === 'case_closed' || t.status === 'foc');
  const inProgress = allTasks.filter((t) => t.status === 'in_progress');

  const presentDays = attendance.filter((a) => a.clock_in).length;
  const approvedLeave = leaves.filter((l) => l.status === 'approved').length;
  const pendingLeave = leaves.filter((l) => l.status === 'pending').length;

  const totalCash = cash.reduce((sum, c) => sum + cashAmount(c), 0);

  const slaBreached = allTasks.filter((t) => {
    if (!t.createdAt) return false;
    const ageDays = (Date.now() - new Date(t.createdAt).getTime()) / 86400000;
    return ageDays > 3 && t.status !== 'resolved' && t.status !== 'case_closed' && t.status !== 'foc';
  }).length;

  const otherTasks = Math.max(allTasks.length - resolved.length - inProgress.length, 0);
  const segments = [
    { label: 'Resolved', count: resolved.length, color: theme.ok },
    { label: 'In progress', count: inProgress.length, color: theme.warn },
    { label: 'Other', count: otherTasks, color: theme.info },
  ];

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="My Stats" subtitle={user?.full_name} onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(16), paddingBottom: spacing(8), paddingHorizontal: spacing(4), gap: 18 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ok} />}
      >
        {loading && <Text style={[styles.dim, { color: theme.text3 }]}>Loading…</Text>}
        {error && <Text style={[styles.dim, { color: theme.err }]}>{error}</Text>}

        {!loading && !error && (
          <>
            <Panel style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={[styles.panelTitle, { color: theme.text }]}>Service tasks</Text>
                <Text style={[styles.panelValue, { color: theme.text }]}>{allTasks.length} jobs</Text>
              </View>
              <View style={[styles.bar, { backgroundColor: theme.panel2 }]}>
                {segments.map((seg) => (seg.count > 0 ? <View key={seg.label} style={{ flex: seg.count, backgroundColor: seg.color }} /> : null))}
              </View>
              <View style={styles.legend}>
                {segments.map((seg) => (
                  <View key={seg.label} style={styles.legendRow}>
                    <View style={[styles.swatch, { backgroundColor: seg.color }]} />
                    <Text style={[styles.legendLabel, { color: theme.text }]}>{seg.label}</Text>
                    <Text style={[styles.legendCount, { color: theme.text }]}>{seg.count}</Text>
                  </View>
                ))}
              </View>
            </Panel>

            <View style={styles.tiles}>
              <Tile label="SLA breach" value={slaBreached} hint={slaBreached > 0 ? 'Open more than 3 days' : 'None right now'} hintColor={slaBreached > 0 ? theme.err : theme.ok} />
              <Tile label="Present days" value={presentDays} />
            </View>
            <View style={styles.tiles}>
              <Tile label="Approved leave" value={approvedLeave} />
              {pendingLeave > 0 ? <Tile label="Pending leave" value={pendingLeave} hintColor={theme.warn} /> : <View style={styles.tilePad} />}
            </View>

            <Panel style={styles.panel}>
              <Text style={[styles.overline, { color: theme.text3 }]}>Collections</Text>
              <Text style={[styles.cashLabel, { color: theme.text2 }]}>Total cash collected</Text>
              <Text style={[styles.cashValue, { color: theme.accent }]}>{money(totalCash)}</Text>
              <Text style={[styles.cashSub, { color: theme.text2 }]}>{cash.length} paid jobs</Text>
            </Panel>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Tile({ label, value, hint, hintColor }: { label: string; value: number; hint?: string; hintColor?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.panel2 }]}>
      <Text style={[styles.tileLabel, { color: theme.text2 }]}>{label}</Text>
      <Text style={[styles.tileValue, { color: theme.text }]}>{value}</Text>
      {hint ? <Text style={[styles.tileHint, { color: hintColor ?? theme.text2 }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { ...typography.body, textAlign: 'center', marginTop: spacing(8) },
  panel: { padding: spacing(4), borderRadius: radius.xl - 4 },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  panelTitle: { ...typography.rowTitle },
  panelValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15 },
  bar: { height: 10, borderRadius: 5, marginTop: spacing(2.5), marginBottom: spacing(3), flexDirection: 'row', overflow: 'hidden' },
  legend: { gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { ...typography.caption, flex: 1 },
  legendCount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: radius.lg, padding: spacing(3.5) },
  tilePad: { flex: 1 },
  tileLabel: { ...typography.caption, fontSize: 12 },
  tileValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22, lineHeight: 30 },
  tileHint: { ...typography.caption, fontSize: 12 },
  overline: { ...typography.overline },
  cashLabel: { ...typography.caption, marginTop: spacing(2) },
  cashValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 28, lineHeight: 36 },
  cashSub: { ...typography.supporting },
});
