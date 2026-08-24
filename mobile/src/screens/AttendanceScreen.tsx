import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import PulseDot from '../components/PulseDot';
import GlowButton from '../components/GlowButton';
import AppHeaderBar from '../components/AppHeaderBar';
import AnimatedStatCard from '../components/AnimatedStatCard';
import PressScale from '../components/PressScale';
import Icon from '../components/Icon';
import { IconName } from '../theme/icons';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useAttendanceStatus } from '../context/AttendanceContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';
import { brand, semantic } from '../theme/tokens';
import { ApiError } from '../api/client';
import {
  AttendanceRow,
  LeaveRequest,
  fetchTodayAttendance,
  fetchAttendanceHistory,
  fetchLeaveRequests,
  clockInGig,
  clockInFixed,
  clockOut,
} from '../api/attendance';

interface Props {
  onGoDashboard: () => void;
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onGoProfile: () => void;
  onOpenLeaveForm: () => void;
}

const LEAVE_STATUS_STYLE: Record<string, { color: string; bg: string; label: string; icon: IconName }> = {
  pending: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)', label: 'Pending', icon: 'clock' },
  approved: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)', label: 'Approved', icon: 'check-circle' },
  rejected: { color: '#f0556d', bg: 'rgba(240,85,109,0.14)', label: 'Rejected', icon: 'alert' },
};

function hoursBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? ms / 3600000 : 0;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
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
  const { attendance: sharedAttendance, refresh: refreshHeaderAttendance } = useAttendanceStatus();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [segment, setSegment] = useState<'attendance' | 'leave'>('attendance');
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [clocking, setClocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [t, h, l] = await Promise.all([
        fetchTodayAttendance(user.id),
        fetchAttendanceHistory(user.id),
        fetchLeaveRequests(user.id),
      ]);
      setToday(t);
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

  // Keeps this screen's own attendance state in sync when clock-in happens
  // elsewhere — e.g. the blocking ClockInGateModal — instead of only
  // updating on this screen's next manual refresh/poll.
  useEffect(() => {
    if (sharedAttendance) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedAttendance?.clock_in, sharedAttendance?.clock_out]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const clockedIn = !!today?.clock_in && !today?.clock_out;

  // Live stopwatch while clocked in — ticks every second for the "since"
  // duration shown on the clock card.
  useEffect(() => {
    if (!clockedIn) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [clockedIn]);
  const elapsedMs = clockedIn && today?.clock_in ? now - new Date(today.clock_in).getTime() : 0;

  const handleClock = async () => {
    if (!user) return;
    setClocking(true);
    setError(null);
    try {
      if (clockedIn && today) {
        await clockOut(today.id);
      } else if (user.worker_type === 'gig') {
        await clockInGig(user.id);
      } else {
        await clockInFixed();
      }
      await load();
      refreshHeaderAttendance();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update attendance';
      setError(
        message.toLowerCase().includes('photo')
          ? "Photo clock-in isn't supported in the mobile app yet — use the web app."
          : message,
      );
    } finally {
      setClocking(false);
    }
  };

  const last7 = [...history]
    .filter((r) => new Date(r.date).getTime() >= Date.now() - 7 * 24 * 3600 * 1000)
    .sort((a, b) => a.date.localeCompare(b.date));
  const maxHours = Math.max(1, ...last7.map((r) => hoursBetween(r.clock_in, r.clock_out)));
  const weekHours = last7.reduce((sum, r) => sum + hoursBetween(r.clock_in, r.clock_out), 0);
  const presentDays = history.filter((r) => r.clock_in).length;
  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;

  const topInset = headerHeight > 0 ? headerHeight : insets.top + 100;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Attendance" subtitle="Clock in, hours & leave" onLayout={setHeaderHeight} />
      <ScrollView
        contentContainerStyle={{ paddingTop: topInset + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll} contentContainerStyle={styles.statsRow}>
          <AnimatedStatCard label="This Week" value={`${weekHours.toFixed(1)}h`} accentColor={brand.primary} icon="clock" delayMs={0} />
          <AnimatedStatCard label="Present Days" value={presentDays} accentColor="#2e9bff" icon="check-circle" delayMs={80} />
          <AnimatedStatCard label="Leave Requests" value={pendingLeaves} accentColor={semantic.warning} icon="calendar" delayMs={160} />
        </ScrollView>

        <View style={[styles.segmentRow, { backgroundColor: theme.panel2 }]}>
          <PressScale onPress={() => setSegment('attendance')} style={{ flex: 1 }}>
            <View style={[styles.segment, segment === 'attendance' && styles.segmentActive, segment === 'attendance' && styles.segmentActiveShadow]}>
              <Icon name="clock" size={14} color={segment === 'attendance' ? '#ffffff' : theme.text2} />
              <Text style={[styles.segmentText, { color: segment === 'attendance' ? '#ffffff' : theme.text2 }]}>Attendance</Text>
            </View>
          </PressScale>
          <PressScale onPress={() => setSegment('leave')} style={{ flex: 1 }}>
            <View style={[styles.segment, segment === 'leave' && styles.segmentActive, segment === 'leave' && styles.segmentActiveShadow]}>
              <Icon name="calendar" size={14} color={segment === 'leave' ? '#ffffff' : theme.text2} />
              <Text style={[styles.segmentText, { color: segment === 'leave' ? '#ffffff' : theme.text2 }]}>Leave</Text>
            </View>
          </PressScale>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {segment === 'attendance' ? (
          <>
            <Animated.View entering={FadeInUp.duration(450).springify().damping(15)}>
              <GlassCard shadow style={styles.clockCard}>
                <View style={[styles.clockIconChip, { backgroundColor: clockedIn ? `${brand.primary}24` : `${theme.text3}1f` }]}>
                  {clockedIn ? <PulseDot color={brand.primary} size={10} /> : <Icon name="clock" size={26} color={theme.text3} />}
                </View>

                <View style={[styles.clockChip, { backgroundColor: clockedIn ? 'rgba(21,160,90,0.14)' : theme.panel2 }]}>
                  <Text style={[styles.clockChipText, { color: clockedIn ? brand.primary : theme.text3 }]}>
                    {clockedIn ? 'Clocked in' : 'Clocked out'}
                  </Text>
                </View>

                {clockedIn ? (
                  <>
                    <Text style={[styles.elapsedText, { color: theme.text }]}>{formatElapsed(elapsedMs)}</Text>
                    {today?.clock_in ? (
                      <Text style={[styles.sinceText, { color: theme.text3 }]}>
                        Since {new Date(today.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    ) : null}
                  </>
                ) : null}

                {today?.location ? (
                  <View style={styles.locationRow}>
                    <Icon name="pin" size={13} color={theme.text3} />
                    <Text style={[styles.caption, { color: theme.text3 }]} numberOfLines={1}>{today.location}</Text>
                  </View>
                ) : null}

                {clockedIn ? (
                  <PressScale onPress={handleClock} disabled={clocking} style={{ width: '100%', marginTop: spacing(3) }}>
                    <View style={[styles.clockOutBtn, { backgroundColor: semantic.danger, opacity: clocking ? 0.7 : 1 }]}>
                      {clocking ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="logout" size={16} color="#fff" filled />}
                      <Text style={styles.clockOutBtnText}>{clocking ? 'Please wait…' : 'Clock Out'}</Text>
                    </View>
                  </PressScale>
                ) : (
                  <View style={{ width: '100%', marginTop: spacing(3) }}>
                    <GlowButton label={clocking ? 'Please wait…' : 'Clock In'} onPress={handleClock} disabled={clocking} loading={clocking} icon="clock" />
                  </View>
                )}
              </GlassCard>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(90).duration(450).springify().damping(15)}>
              <Panel style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Icon name="chart" size={13} color={theme.text3} />
                  <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Hours this week</Text>
                </View>
                <View style={styles.barsRow}>
                  {last7.length === 0 ? (
                    <Text style={[styles.caption, { color: theme.text3 }]}>No attendance yet this week.</Text>
                  ) : (
                    last7.map((r, i) => {
                      const h = hoursBetween(r.clock_in, r.clock_out);
                      return (
                        <View key={r.id} style={styles.barCol}>
                          <Text style={[styles.barValue, { color: theme.text3 }]}>{h > 0 ? h.toFixed(1) : ''}</Text>
                          <View style={styles.barTrack}>
                            <HoursBar heightTarget={Math.max(6, (h / maxHours) * 64)} delayMs={i * 60} color={brand.primary} />
                          </View>
                          <Text style={[styles.barLabel, { color: theme.text3 }]}>
                            {new Date(r.date).toLocaleDateString('en-US', { weekday: 'narrow' })}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              </Panel>
            </Animated.View>

            <View style={[styles.sectionHeaderRow, { marginTop: spacing(5) }]}>
              <Icon name="report" size={13} color={theme.text3} />
              <Text style={[styles.sectionLabel, { color: theme.text3 }]}>History</Text>
            </View>
            {history.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3 }]}>No attendance history yet.</Text>
            ) : (
              history.slice(0, 14).map((r, idx) => {
                const complete = !!r.clock_out;
                const accent = complete ? brand.primary : semantic.warning;
                return (
                  <Animated.View key={r.id} entering={FadeInUp.delay(Math.min(idx, 8) * 50).duration(400).springify().damping(15)}>
                    <View style={[styles.rowOuter, { shadowColor: accent }]}>
                      <View style={[styles.rowAccent, { backgroundColor: accent }]} />
                      <GlassCard style={styles.historyCard}>
                        <View style={styles.historyRow}>
                          <View style={[styles.rowIconChip, { backgroundColor: `${accent}24` }]}>
                            <Icon name="calendar" size={15} color={accent} />
                          </View>
                          <View style={styles.historyInfo}>
                            <Text style={[styles.historyDate, { color: theme.text }]}>{r.date}</Text>
                            {r.location ? (
                              <View style={styles.miniLocationRow}>
                                <Icon name="pin" size={10} color={theme.text3} />
                                <Text style={[styles.caption, { color: theme.text3 }]} numberOfLines={1}>{r.location}</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.historyTimes}>
                            <Text style={[styles.historyTime, { color: theme.text }]}>
                              {r.clock_in ? new Date(r.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                              {' – '}
                              {r.clock_out ? new Date(r.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                            </Text>
                            <Text style={[styles.historyHours, { color: brand.primary }]}>{hoursBetween(r.clock_in, r.clock_out).toFixed(1)}h</Text>
                          </View>
                        </View>
                      </GlassCard>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </>
        ) : (
          <>
            <GlowButton label="New Leave Request" onPress={onOpenLeaveForm} icon="edit" />
            {leaves.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3 }]}>No leave requests yet.</Text>
            ) : (
              leaves.map((l, idx) => {
                const s = LEAVE_STATUS_STYLE[l.status] || LEAVE_STATUS_STYLE.pending;
                return (
                  <Animated.View key={l.id} entering={FadeInUp.delay(Math.min(idx, 8) * 60).duration(400).springify().damping(15)}>
                    <View style={[styles.rowOuter, { shadowColor: s.color }]}>
                      <View style={[styles.rowAccent, { backgroundColor: s.color }]} />
                      <GlassCard style={styles.leaveCard}>
                        <View style={styles.leaveHeader}>
                          <View style={[styles.rowIconChip, { backgroundColor: s.bg }]}>
                            <Icon name={s.icon} size={14} color={s.color} />
                          </View>
                          <Text style={[styles.leaveDates, { color: theme.text }]}>{l.start_date} – {l.end_date}</Text>
                          <View style={[styles.leaveBadge, { backgroundColor: s.bg }]}>
                            <Text style={[styles.leaveBadgeText, { color: s.color }]}>{s.label}</Text>
                          </View>
                        </View>
                        <Text style={[styles.caption, { color: theme.text2 }]}>{l.reason}</Text>
                      </GlassCard>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </>
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
  caption: { ...typography.caption },
  statsScroll: { marginBottom: spacing(4) },
  statsRow: { flexDirection: 'row', gap: spacing(2.5) },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginBottom: spacing(2.5) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  section: { marginTop: spacing(5) },
  segmentRow: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: spacing(4), gap: spacing(1) },
  segment: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), paddingVertical: spacing(2.5), borderRadius: 11 },
  segmentActive: { backgroundColor: brand.primary },
  segmentActiveShadow: { shadowColor: brand.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  segmentText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  error: { ...typography.caption, color: semantic.danger, marginBottom: spacing(3) },
  clockCard: { alignItems: 'center', paddingVertical: spacing(6) },
  clockIconChip: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  clockChip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3.5), paddingVertical: spacing(1.75), borderRadius: radius.full, marginBottom: spacing(2) },
  clockChipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  elapsedText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 32, marginBottom: spacing(0.5) },
  sinceText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, marginBottom: spacing(2) },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginTop: spacing(1) },
  clockOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 52, borderRadius: radius.md },
  clockOutBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2), height: 110 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing(1) },
  barValue: { fontFamily: 'Manrope_700Bold', fontSize: 9, height: 12 },
  barTrack: { width: '100%', height: 64, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 20, borderRadius: 6 },
  barLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, marginTop: spacing(0.5) },
  rowOuter: { flexDirection: 'row', marginBottom: spacing(3), shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 12, elevation: 3 },
  rowAccent: { width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  historyCard: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  rowIconChip: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  historyInfo: { flex: 1, minWidth: 0 },
  historyDate: { fontFamily: 'Manrope_700Bold', fontSize: 13, marginBottom: spacing(0.5) },
  miniLocationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  historyTimes: { alignItems: 'flex-end' },
  historyTime: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12 },
  historyHours: { fontFamily: 'Manrope_700Bold', fontSize: 12, marginTop: spacing(0.5) },
  leaveCard: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  leaveHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginBottom: spacing(1.5) },
  leaveDates: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  leaveBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(0.75), borderRadius: 8 },
  leaveBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
});
