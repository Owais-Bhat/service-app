import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlassTabBar, { tabBarSpace } from '../components/GlassTabBar';
import FilterChips from '../components/admin/FilterChips';
import StatusBadge from '../components/admin/StatusBadge';
import AppHeaderBar from '../components/AppHeaderBar';
import Icon from '../components/Icon';
import { IconName } from '../theme/icons';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useAttendanceStatus } from '../context/AttendanceContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';
import { semantic } from '../theme/tokens';
import { AttendanceRow, LeaveRequest, fetchAttendanceHistory, fetchLeaveRequests } from '../api/attendance';

interface Props {
  onGoDashboard: () => void;
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onGoProfile: () => void;
  onOpenLeaveForm: () => void;
}

type Period = 'week' | 'month' | 'all';

const PERIOD_LABEL: Record<Period, string> = { week: 'This Week', month: 'This Month', all: 'All Time' };

const LEAVE_STATUS: Record<string, { tone: 'warn' | 'ok' | 'err'; label: string; icon: IconName }> = {
  pending: { tone: 'warn', label: 'Pending', icon: 'hourglass' },
  approved: { tone: 'ok', label: 'Approved', icon: 'check-circle' },
  rejected: { tone: 'err', label: 'Rejected', icon: 'close' },
};

function hoursBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? ms / 3600000 : 0;
}

// A single week-view bar that springs to its target height on mount/update
// instead of just appearing — small touch, but it's what makes the chart
// read as "alive" rather than a static image.
function HoursBar({ heightTarget, delayMs, color }: { heightTarget: number; delayMs: number; color: string }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(delayMs, withSpring(heightTarget, springs.move));
  }, [heightTarget, delayMs, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

export default function AttendanceScreen({ onGoDashboard, onGoJobTools, onGoEarnings, onGoProfile, onOpenLeaveForm }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { attendance: sharedAttendance } = useAttendanceStatus();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [segment, setSegment] = useState<'attendance' | 'leave'>('attendance');
  const [period, setPeriod] = useState<Period>('week');
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [h, l] = await Promise.all([
        fetchAttendanceHistory(user.id),
        fetchLeaveRequests(user.id),
      ]);
      setHistory(h);
      setLeaves(l);
      setError(null);
    } catch {
      setError('Could not load attendance — pull to retry');
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Clocking in/out happens on Dashboard (or the blocking ClockInGateModal)
  // now — this just keeps History/Leave in sync when that happens elsewhere
  // instead of only updating on this screen's next manual refresh/poll.
  useEffect(() => {
    if (sharedAttendance) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedAttendance?.clock_in, sharedAttendance?.clock_out]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const periodStart =
    period === 'week'
      ? Date.now() - 7 * 24 * 3600 * 1000
      : period === 'month'
        ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
        : 0;
  const periodHistory = [...history]
    .filter((r) => new Date(r.date).getTime() >= periodStart)
    .sort((a, b) => a.date.localeCompare(b.date));
  const maxHours = Math.max(1, ...periodHistory.map((r) => hoursBetween(r.clock_in, r.clock_out)));
  const periodHours = periodHistory.reduce((sum, r) => sum + hoursBetween(r.clock_in, r.clock_out), 0);
  const periodPresentDays = periodHistory.filter((r) => r.clock_in).length;
  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;

  const topInset = headerHeight > 0 ? headerHeight : insets.top + 100;

  const kpis = [
    { v: `${periodHours.toFixed(1)}h`, l: PERIOD_LABEL[period], c: theme.text },
    { v: String(periodPresentDays), l: 'Present days', c: theme.ok },
    { v: String(pendingLeaves), l: 'Leave pending', c: pendingLeaves > 0 ? theme.warn : theme.text2 },
  ];
  const periodChips = (['week', 'month', 'all'] as Period[]).map((p) => ({ key: p, label: PERIOD_LABEL[p] }));

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Attendance" subtitle="Clock in, hours & leave" onLayout={setHeaderHeight} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topInset + spacing(4), paddingBottom: tabBarSpace(insets.bottom) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <View style={styles.kpiRow}>
          {kpis.map((k) => (
            <View key={k.l} style={[styles.kpi, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <Text style={[styles.kpiValue, { color: k.c }]}>{k.v}</Text>
              <Text style={[styles.kpiLabel, { color: theme.text2 }]} numberOfLines={1}>{k.l}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={onOpenLeaveForm}
          accessibilityRole="button"
          style={({ pressed }) => [styles.actionBtn, { borderColor: theme.border, backgroundColor: theme.panel }, pressed && styles.pressed]}
        >
          <Icon name="calendar" size={18} color={theme.text} />
          <Text style={[styles.actionBtnText, { color: theme.text }]}>Request leave</Text>
        </Pressable>

        <View style={[styles.segmentRow, { backgroundColor: theme.panel2 }]}>
          {([
            { key: 'attendance', label: 'Attendance' },
            { key: 'leave', label: 'Leave' },
          ] as const).map((seg) => {
            const active = segment === seg.key;
            return (
              <Pressable
                key={seg.key}
                onPress={() => setSegment(seg.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.segment, active && { backgroundColor: theme.panel, borderColor: theme.border, borderWidth: 1 }]}
              >
                {active ? <Icon name="check" size={14} color={theme.text} /> : null}
                <Text style={[styles.segmentText, { color: active ? theme.text : theme.text2, fontFamily: active ? 'Manrope_700Bold' : 'Manrope_600SemiBold' }]}>
                  {seg.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={[styles.caption, { color: theme.err }]}>{error}</Text> : null}

        {segment === 'attendance' ? (
          <>
            <FilterChips items={periodChips} activeKey={period} onSelect={(k) => setPeriod(k as Period)} />

            <Panel>
              <Text style={[styles.overline, { color: theme.text3, marginBottom: spacing(2.5) }]}>Hours · {PERIOD_LABEL[period]}</Text>
              {periodHistory.length === 0 ? (
                <Text style={[styles.caption, { color: theme.text3 }]}>No attendance in this period.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.barsRow}>
                    {periodHistory.map((r, i) => {
                      const h = hoursBetween(r.clock_in, r.clock_out);
                      return (
                        <View key={r.id} style={styles.barCol}>
                          <Text style={[styles.barValue, { color: theme.text3 }]}>{h > 0 ? h.toFixed(1) : ''}</Text>
                          <View style={styles.barTrack}>
                            <HoursBar heightTarget={Math.max(6, (h / maxHours) * 64)} delayMs={Math.min(i, 20) * 30} color={theme.accent} />
                          </View>
                          <Text style={[styles.barLabel, { color: theme.text3 }]}>
                            {new Date(r.date).toLocaleDateString('en-US', period === 'week' ? { weekday: 'narrow' } : { day: 'numeric' })}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </Panel>

            <View style={styles.section}>
              <Text style={[styles.heading, { color: theme.text }]}>History</Text>
              {periodHistory.length === 0 ? (
                <Text style={[styles.caption, { color: theme.text3 }]}>No attendance history in this period.</Text>
              ) : (
                <View style={[styles.listPanel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                  {[...periodHistory].reverse().slice(0, 30).map((r, idx, arr) => {
                    const complete = !!r.clock_out;
                    const d = new Date(r.date);
                    const hrs = hoursBetween(r.clock_in, r.clock_out);
                    return (
                      <View key={r.id} style={[styles.histRow, idx < arr.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                        <View style={styles.histDate}>
                          <Text style={[styles.histDay, { color: theme.text }]}>{String(d.getDate()).padStart(2, '0')}</Text>
                          <Text style={[styles.histWeekday, { color: theme.text3 }]}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.histTimes, { color: theme.text }]}>
                            {r.clock_in ? new Date(r.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}
                            {' → '}
                            {r.clock_out ? new Date(r.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}
                          </Text>
                          <Text style={[styles.supporting, { color: theme.text3, fontSize: 12 }]} numberOfLines={1}>
                            {complete ? `${Math.floor(hrs)}h ${String(Math.round((hrs % 1) * 60)).padStart(2, '0')}m` : 'In progress'}
                            {r.location ? ` · ${r.location}` : ''}
                          </Text>
                        </View>
                        <StatusBadge label={complete ? 'Present' : 'Working'} color={complete ? theme.ok : theme.warn} />
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.heading, { color: theme.text }]}>Leave requests</Text>
            {leaves.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3 }]}>No leave requests yet.</Text>
            ) : (
              <View style={[styles.listPanel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                {leaves.map((l, idx) => {
                  const s = LEAVE_STATUS[l.status] || LEAVE_STATUS.pending;
                  return (
                    <View key={l.id} style={[styles.leaveRow, idx < leaves.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.rowTitle, { color: theme.text, fontSize: 14 }]}>{l.start_date} – {l.end_date}</Text>
                        <Text style={[styles.supporting, { color: theme.text3, fontSize: 12 }]}>{l.reason}</Text>
                      </View>
                      <StatusBadge label={s.label} color={theme[s.tone]} icon={s.icon} />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey="attendance"
        onSelect={(key) => {
          if (key === 'dashboard') onGoDashboard();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'earnings') onGoEarnings();
          else if (key === 'profile') onGoProfile();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: spacing(30), paddingHorizontal: spacing(4), gap: spacing(5) },
  heading: { ...typography.heading },
  caption: { ...typography.caption },
  supporting: { ...typography.supporting },
  rowTitle: { ...typography.rowTitle },
  overline: { ...typography.overline },
  pressed: { opacity: 0.7 },
  kpiRow: { flexDirection: 'row', gap: spacing(2) },
  kpi: { flex: 1, borderRadius: 16, borderWidth: 1, padding: spacing(2.5) },
  kpiValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 20 },
  kpiLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 48, borderRadius: radius.md, borderWidth: 1 },
  actionBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  segmentRow: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1), height: 44, borderRadius: radius.sm },
  segmentText: { fontSize: 13 },
  section: { gap: spacing(2.5) },
  listPanel: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(3.5), paddingVertical: spacing(3) },
  histDate: { width: 44 },
  histDay: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 16 },
  histWeekday: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  histTimes: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 13 },
  leaveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(3.5), paddingVertical: spacing(3) },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2), height: 110 },
  barCol: { width: 34, alignItems: 'center', justifyContent: 'flex-end', gap: spacing(1) },
  barValue: { fontFamily: 'Manrope_700Bold', fontSize: 9, height: 12 },
  barTrack: { width: '100%', height: 64, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 20, borderRadius: 6 },
  barLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, marginTop: spacing(0.5) },
});
