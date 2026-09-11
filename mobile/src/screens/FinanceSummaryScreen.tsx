import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import AnimatedStatCard from '../components/AnimatedStatCard';
import GlassCard from '../components/GlassCard';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { dataGet } from '../api/client';

interface Props {
  onBack: () => void;
}

interface ProfileRow {
  id: string;
  full_name: string;
  monthly_salary: number | null;
  role: string;
}

interface AttendanceRow {
  user_id: string;
  clock_in: string | null;
}

interface LeaveRow {
  employee_id: string;
  status: string;
}

interface CashRow {
  assigned_employee_id: string | null;
  bill_amount: string | null;
  bill_total: string | null;
}

function money(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const daysInCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

export default function FinanceSummaryScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [cash, setCash] = useState<CashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, att, lv, c] = await Promise.all([
        dataGet<ProfileRow[]>('profiles', { select: 'id,full_name,monthly_salary,role', eq: ['role:employee'], order: 'full_name:asc' }),
        dataGet<AttendanceRow[]>('attendance', { select: 'user_id,clock_in' }),
        dataGet<LeaveRow[]>('leave_requests', { select: 'employee_id,status', eq: ['status:approved'] }),
        dataGet<CashRow[]>('inquiries', { select: 'assigned_employee_id,bill_amount,bill_total', eq: ['payment_status:paid'] }),
      ]);
      setProfiles(p);
      setAttendance(att);
      setLeaves(lv);
      setCash(c);
      setError(null);
    } catch {
      setError('Could not load finance data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalMonthly = profiles.reduce((s, p) => s + (p.monthly_salary ?? 0), 0);
  const totalCash = cash.reduce((s, c) => s + (Number(c.bill_total) || Number(c.bill_amount) || 0), 0);

  const rows = profiles.map((p) => {
    const presentDays = attendance.filter((a) => a.user_id === p.id && a.clock_in).length;
    const approvedLeave = leaves.filter((l) => l.employee_id === p.id).length;
    const payable = presentDays + approvedLeave;
    const daily = (p.monthly_salary ?? 0) / daysInCurrentMonth;
    const estimated = Math.round(daily * payable);
    return { ...p, presentDays, approvedLeave, payable, estimated };
  });
  const totalEstimated = rows.reduce((s, r) => s + r.estimated, 0);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Finance" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(16), paddingBottom: spacing(8), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={semantic.success} />}
      >
        {loading && <Text style={[styles.dim, { color: theme.text3 }]}>Loading…</Text>}
        {error && <Text style={[styles.dim, { color: semantic.danger }]}>{error}</Text>}

        {!loading && !error && (
          <>
            <Text style={[styles.section, { color: theme.text3 }]}>This Month</Text>
            <View style={styles.row}>
              <AnimatedStatCard label="Monthly Payroll" value={money(totalMonthly)} accentColor={brand.primary} delayMs={0} />
              <AnimatedStatCard label="Estimated Earned" value={money(totalEstimated)} accentColor={semantic.warning} delayMs={80} />
            </View>
            <View style={[styles.row, { marginTop: spacing(3) }]}>
              <AnimatedStatCard label="Cash Collected" value={money(totalCash)} accentColor={semantic.success} delayMs={160} />
              <AnimatedStatCard label="Employees" value={profiles.length} accentColor={semantic.danger} delayMs={240} />
            </View>

            <Text style={[styles.section, { color: theme.text3 }]}>Per Employee</Text>
            {rows.map((r) => (
              <GlassCard key={r.id} style={styles.card}>
                <View style={styles.empRow}>
                  <Text style={[styles.empName, { color: theme.text }]} numberOfLines={1}>{r.full_name}</Text>
                  <Text style={[styles.empSalary, { color: brand.primary }]}>{money(r.estimated)}</Text>
                </View>
                <Text style={[styles.empSub, { color: theme.text3 }]}>
                  {r.presentDays}d present · {r.approvedLeave}d leave · {r.payable}/{daysInCurrentMonth} payable
                </Text>
              </GlassCard>
            ))}
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
  card: { marginBottom: spacing(2) },
  empRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empName: { ...typography.body, fontWeight: '600' as const, flex: 1 },
  empSalary: { ...typography.body, fontWeight: '700' as const },
  empSub: { ...typography.caption, marginTop: 4 },
});
