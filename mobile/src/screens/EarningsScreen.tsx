import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Icon from '../components/Icon';
import GlassTabBar from '../components/GlassTabBar';
import AppHeaderBar from '../components/AppHeaderBar';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { semantic } from '../theme/tokens';
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
  const submittedTotal = Math.max(0, collectionsTotal - pendingTotal);
  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  const row = (r: CashInquiry, last: boolean, withState: boolean) => {
    const submitted = !!r.cash_submitted_at;
    return (
      <View key={r.id} style={[styles.row, !last && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
        <View style={[styles.rowIcon, { backgroundColor: submitted ? theme.okS : theme.warnS }]}>
          <Icon name="cash" size={18} color={submitted ? theme.ok : theme.warn} />
        </View>
        <View style={styles.cashInfo}>
          <Text style={[styles.cashName, { color: theme.text }]} numberOfLines={1}>{r.full_name}</Text>
          <Text style={[styles.cashMeta, { color: theme.text3 }]} numberOfLines={1}>
            {r.ticket_no}{withState ? ` · ${submitted ? 'Submitted' : 'Pending'}` : ''}
          </Text>
        </View>
        <Text style={[styles.cashAmount, { color: theme.text }]}>{money(cashAmount(r))}</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Earnings" subtitle="Cash, collections & salary" onLayout={setHeaderHeight} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topInset + spacing(4) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <GlassCard>
          <Text style={[styles.overline, { color: theme.text3 }]}>My cash</Text>
          <View style={styles.heroGrid}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, { color: theme.text2 }]}>With you · to submit</Text>
              <Text style={[styles.heroValue, { color: pendingTotal > 0 ? theme.warn : theme.text }]}>{money(pendingTotal)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, { color: theme.text2 }]}>Submitted</Text>
              <Text style={[styles.heroValue, { color: theme.text }]}>{money(submittedTotal)}</Text>
            </View>
          </View>
          <Text style={[styles.heroNote, { color: theme.text3 }]}>
            Hand cash to the office; they record the handover and it moves to Submitted.
          </Text>
        </GlassCard>

        <View style={[styles.segmentRow, { backgroundColor: theme.panel2 }]}>
          {SEGMENTS.map((s) => {
            const active = segment === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSegment(s.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.segment, active && { backgroundColor: theme.panel, borderColor: theme.border, borderWidth: 1 }]}
              >
                <Text style={[styles.segmentText, { color: active ? theme.text : theme.text2, fontFamily: active ? 'Manrope_700Bold' : 'Manrope_600SemiBold' }]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={[styles.caption, { color: theme.err }]}>{error}</Text> : null}

        {segment === 'cash' ? (
          pendingCash.length === 0 ? (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <Icon name="check-circle" size={22} color={theme.ok} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing pending — all caught up.</Text>
            </View>
          ) : (
            <View style={[styles.listPanel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              {pendingCash.map((r, i) => row(r, i === pendingCash.length - 1, false))}
            </View>
          )
        ) : null}

        {segment === 'collections' ? (
          cashRows.length === 0 ? (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No cash collections yet.</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.caption, { color: theme.text2 }]}>Total collected: {money(collectionsTotal)}</Text>
              <View style={[styles.listPanel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                {cashRows.map((r, i) => row(r, i === cashRows.length - 1, true))}
              </View>
            </>
          )
        ) : null}

        {segment === 'salary' ? (
          <View style={[styles.salaryCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            <View style={styles.salaryHead}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>
                Salary estimate · {now.toLocaleDateString('en-US', { month: 'long' })}
              </Text>
              <View style={[styles.estimateChip, { backgroundColor: theme.panel2 }]}>
                <Text style={[styles.estimateChipText, { color: theme.text2 }]}>Estimate</Text>
              </View>
            </View>
            <Text style={[styles.salaryValue, { color: theme.text }]}>{money(estimated)}</Text>
            <Text style={[styles.supporting, { color: theme.text2 }]}>
              Based on {daysPresent} day{daysPresent === 1 ? '' : 's'} present and {leaveDays} approved leave day{leaveDays === 1 ? '' : 's'} so far, against your monthly rate. The office finalises salary after leave and late adjustments.
            </Text>
            <View style={styles.statsGrid}>
              <View style={[styles.statCell, { backgroundColor: theme.panel2 }]}>
                <Text style={[styles.statLabel, { color: theme.text3 }]}>Monthly</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{money(salary)}</Text>
              </View>
              <View style={[styles.statCell, { backgroundColor: theme.panel2 }]}>
                <Text style={[styles.statLabel, { color: theme.text3 }]}>Payable days</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{payableDays}<Text style={{ color: theme.text3, fontSize: 13 }}> / {daysInMonth}</Text></Text>
              </View>
            </View>
          </View>
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
  content: { paddingBottom: spacing(30), paddingHorizontal: spacing(4), gap: spacing(5) },
  caption: { ...typography.caption },
  supporting: { ...typography.supporting, fontSize: 12, lineHeight: 18 },
  rowTitle: { ...typography.rowTitle },
  overline: { ...typography.overline },
  heroGrid: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(2.5) },
  heroLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  heroValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 26, lineHeight: 32 },
  heroNote: { ...typography.supporting, fontSize: 12, lineHeight: 16, marginTop: spacing(2.5) },
  segmentRow: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16 },
  segment: { flex: 1, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13 },
  empty: { borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', padding: spacing(6), alignItems: 'center', gap: spacing(2) },
  emptyTitle: { ...typography.rowTitle, textAlign: 'center' },
  listPanel: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(3.5), paddingVertical: spacing(3) },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  cashInfo: { flex: 1, minWidth: 0 },
  cashName: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  cashMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12 },
  cashAmount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
  salaryCard: { borderRadius: 20, borderWidth: 1, padding: spacing(4), gap: spacing(2) },
  salaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2) },
  estimateChip: { height: 24, paddingHorizontal: spacing(2.5), borderRadius: radius.full, justifyContent: 'center' },
  estimateChipText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  salaryValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 26, lineHeight: 32 },
  statsGrid: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(2) },
  statCell: { flex: 1, borderRadius: 16, padding: spacing(3) },
  statLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  statValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 18 },
});
