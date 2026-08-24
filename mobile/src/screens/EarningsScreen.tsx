import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import AppHeaderBar from '../components/AppHeaderBar';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchAttendanceHistory, fetchLeaveRequests } from '../api/attendance';
import { fetchCashInquiries, cashAmount, CashInquiry } from '../api/earnings';

interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
  onGoProfile: () => void;
}

type Segment = 'cash' | 'collections' | 'salary';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'cash', label: 'My Cash' },
  { key: 'collections', label: 'Collections' },
  { key: 'salary', label: 'Salary' },
];

export default function EarningsScreen({ onGoDashboard, onGoAttendance, onGoJobTools, onGoProfile }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [segment, setSegment] = useState<Segment>('cash');
  const [cashRows, setCashRows] = useState<CashInquiry[]>([]);
  const [daysPresent, setDaysPresent] = useState(0);
  const [leaveDays, setLeaveDays] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [cash, history, leaves] = await Promise.all([
        fetchCashInquiries(user.id),
        fetchAttendanceHistory(user.id),
        fetchLeaveRequests(user.id),
      ]);
      setCashRows(cash);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      setDaysPresent(
        history.filter((r) => {
          const d = new Date(r.date);
          return d.getFullYear() === year && d.getMonth() === month && r.clock_in;
        }).length,
      );

      let leaveCount = 0;
      leaves
        .filter((l) => l.status === 'approved')
        .forEach((l) => {
          const start = new Date(l.start_date);
          const end = new Date(l.end_date);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getFullYear() === year && d.getMonth() === month) leaveCount++;
          }
        });
      setLeaveDays(leaveCount);
      setError(null);
    } catch {
      setError('Could not load earnings — pull to retry');
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const pendingCash = cashRows.filter((r) => !r.cash_submitted_at);
  const pendingTotal = pendingCash.reduce((sum, r) => sum + cashAmount(r), 0);
  const collectionsTotal = cashRows.reduce((sum, r) => sum + cashAmount(r), 0);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const salary = Number(user?.salary) || 0;
  const payableDays = daysPresent + leaveDays;
  const estimated = daysInMonth > 0 ? (salary * payableDays) / daysInMonth : 0;

  const topInset = headerHeight > 0 ? headerHeight : insets.top + 100;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Earnings" subtitle="Cash, collections & salary" onLayout={setHeaderHeight} />
      <ScrollView
        contentContainerStyle={{ paddingTop: topInset + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >

        <View style={[styles.segmentRow, { backgroundColor: theme.panel2 }]}>
          {SEGMENTS.map((s) => {
            const active = segment === s.key;
            return (
              <Pressable key={s.key} onPress={() => setSegment(s.key)} style={[styles.segment, active && styles.segmentActive]}>
                <Text style={[styles.segmentText, { color: active ? '#ffffff' : theme.text2 }]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {segment === 'cash' ? (
          <>
            <GlassCard style={styles.heroCard}>
              <Text style={[styles.heroLabel, { color: theme.text2 }]}>Pending to deposit</Text>
              <Text style={styles.heroValue}>₹{pendingTotal.toLocaleString('en-IN')}</Text>
            </GlassCard>
            {pendingCash.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3 }]}>Nothing pending — all caught up.</Text>
            ) : (
              pendingCash.map((r) => (
                <Panel key={r.id} style={styles.cashRow}>
                  <View style={styles.cashInfo}>
                    <Text style={[styles.cashName, { color: theme.text }]}>{r.full_name}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>{r.ticket_no}</Text>
                  </View>
                  <Text style={[styles.cashAmount, { color: theme.text }]}>₹{cashAmount(r).toLocaleString('en-IN')}</Text>
                </Panel>
              ))
            )}
          </>
        ) : null}

        {segment === 'collections' ? (
          cashRows.length === 0 ? (
            <Text style={[styles.caption, { color: theme.text3 }]}>No cash collections yet.</Text>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Total collected: ₹{collectionsTotal.toLocaleString('en-IN')}</Text>
              {cashRows.map((r) => (
                <Panel key={r.id} style={styles.cashRow}>
                  <View style={styles.cashInfo}>
                    <Text style={[styles.cashName, { color: theme.text }]}>{r.full_name}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>
                      {r.ticket_no} · {r.cash_submitted_at ? 'Submitted' : 'Pending'}
                    </Text>
                  </View>
                  <Text style={[styles.cashAmount, { color: theme.text }]}>₹{cashAmount(r).toLocaleString('en-IN')}</Text>
                </Panel>
              ))}
            </>
          )
        ) : null}

        {segment === 'salary' ? (
          <GlassCard style={styles.salaryCard}>
            <Text style={[styles.heroLabel, { color: theme.text2 }]}>Estimated this month</Text>
            <Text style={styles.heroValue}>₹{Math.round(estimated).toLocaleString('en-IN')}</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={[styles.caption, { color: theme.text3 }]}>Monthly</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>₹{salary.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.caption, { color: theme.text3 }]}>Days present</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{daysPresent}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.caption, { color: theme.text3 }]}>Leave taken</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{leaveDays} day{leaveDays === 1 ? '' : 's'}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.caption, { color: theme.text3 }]}>Payable days</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{payableDays} / {daysInMonth}</Text>
              </View>
            </View>
          </GlassCard>
        ) : null}
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey="earnings"
        onSelect={(key) => {
          if (key === 'dashboard') onGoDashboard();
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'profile') onGoProfile();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3), marginBottom: spacing(2) },
  segmentRow: { flexDirection: 'row', borderRadius: 14, padding: 4, marginTop: spacing(4), marginBottom: spacing(4) },
  segment: { flex: 1, paddingVertical: spacing(2.5), borderRadius: 11, alignItems: 'center' },
  segmentActive: { backgroundColor: brand.primary },
  segmentText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  heroCard: { alignItems: 'center', paddingVertical: spacing(6), marginBottom: spacing(4) },
  heroLabel: { ...typography.caption, marginBottom: spacing(1.5) },
  heroValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30, color: brand.primary },
  cashRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2.5) },
  cashInfo: { flex: 1, minWidth: 0 },
  cashName: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  cashAmount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
  sectionLabel: { ...typography.caption, fontSize: 12, marginBottom: spacing(3) },
  salaryCard: { paddingVertical: spacing(5) },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing(5), gap: spacing(4) },
  statCell: { width: '42%' },
  statValue: { fontFamily: 'Manrope_700Bold', fontSize: 15, marginTop: spacing(0.5) },
});
