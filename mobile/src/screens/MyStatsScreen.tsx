import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import AnimatedStatCard from '../components/AnimatedStatCard';
import GlassCard from '../components/GlassCard';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="My Stats" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(16), paddingBottom: spacing(8), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={semantic.success} />}
      >
        {loading && <Text style={[styles.dim, { color: theme.text3 }]}>Loading…</Text>}
        {error && <Text style={[styles.dim, { color: semantic.danger }]}>{error}</Text>}

        {!loading && !error && (
          <>
            <Text style={[styles.section, { color: theme.text3 }]}>Service Tasks</Text>
            <View style={styles.row}>
              <AnimatedStatCard label="Total" value={allTasks.length} accentColor={brand.primary} delayMs={0} />
              <AnimatedStatCard label="In Progress" value={inProgress.length} accentColor={semantic.warning} delayMs={80} />
            </View>
            <View style={[styles.row, { marginTop: spacing(3) }]}>
              <AnimatedStatCard label="Resolved" value={resolved.length} accentColor={semantic.success} delayMs={160} />
              <AnimatedStatCard label="SLA Breach" value={slaBreached} accentColor={semantic.danger} delayMs={240} />
            </View>

            <Text style={[styles.section, { color: theme.text3 }]}>Attendance</Text>
            <View style={styles.row}>
              <AnimatedStatCard label="Present Days" value={presentDays} accentColor={semantic.success} delayMs={0} />
              <AnimatedStatCard label="Approved Leave" value={approvedLeave} accentColor={brand.primary} delayMs={80} />
            </View>
            {pendingLeave > 0 && (
              <View style={[styles.row, { marginTop: spacing(3) }]}>
                <AnimatedStatCard label="Pending Leave" value={pendingLeave} accentColor={semantic.warning} delayMs={0} />
              </View>
            )}

            <Text style={[styles.section, { color: theme.text3 }]}>Collections</Text>
            <GlassCard style={styles.cashCard}>
              <Text style={[styles.cashLabel, { color: theme.text3 }]}>Total Cash Collected</Text>
              <Text style={[styles.cashValue, { color: brand.primary }]}>{money(totalCash)}</Text>
              <Text style={[styles.cashSub, { color: theme.text3 }]}>{cash.length} paid jobs</Text>
            </GlassCard>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { ...typography.body, textAlign: 'center', marginTop: spacing(8) },
  section: { ...typography.caption, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing(5), marginBottom: spacing(2) },
  row: { flexDirection: 'row', gap: spacing(3) },
  cashCard: { alignItems: 'center', paddingVertical: spacing(5) },
  cashLabel: { ...typography.caption },
  cashValue: { ...typography.title, fontSize: 36, fontWeight: '700', marginVertical: spacing(1) },
  cashSub: { ...typography.caption },
});
