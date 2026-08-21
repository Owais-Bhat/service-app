import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import PulseDot from '../components/PulseDot';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
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

const LEAVE_STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)', label: 'Pending' },
  approved: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)', label: 'Approved' },
  rejected: { color: '#f0556d', bg: 'rgba(240,85,109,0.14)', label: 'Rejected' },
};

function hoursBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? ms / 3600000 : 0;
}

export default function AttendanceScreen({ onGoDashboard, onGoJobTools, onGoEarnings, onGoProfile, onOpenLeaveForm }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [segment, setSegment] = useState<'attendance' | 'leave'>('attendance');
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [clocking, setClocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const clockedIn = !!today?.clock_in && !today?.clock_out;

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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={[styles.title, { color: theme.text }]}>Attendance</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>Clock in, hours & leave</Text>

        <View style={[styles.segmentRow, { backgroundColor: theme.panel2 }]}>
          <Pressable onPress={() => setSegment('attendance')} style={[styles.segment, segment === 'attendance' && styles.segmentActive]}>
            <Text style={[styles.segmentText, { color: segment === 'attendance' ? '#ffffff' : theme.text2 }]}>Attendance</Text>
          </Pressable>
          <Pressable onPress={() => setSegment('leave')} style={[styles.segment, segment === 'leave' && styles.segmentActive]}>
            <Text style={[styles.segmentText, { color: segment === 'leave' ? '#ffffff' : theme.text2 }]}>Leave</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {segment === 'attendance' ? (
          <>
            <GlassCard style={styles.clockCard}>
              <View style={[styles.clockChip, { backgroundColor: clockedIn ? 'rgba(21,160,90,0.14)' : theme.panel2 }]}>
                {clockedIn ? (
                  <PulseDot color={brand.primary} size={7} />
                ) : (
                  <View style={[styles.clockDot, { backgroundColor: theme.text3 }]} />
                )}
                <Text style={[styles.clockChipText, { color: clockedIn ? brand.primary : theme.text3 }]}>
                  {clockedIn ? 'Clocked in' : 'Clocked out'}
                </Text>
              </View>
              <Pressable
                onPress={handleClock}
                disabled={clocking}
                style={({ pressed }) => [
                  styles.clockButton,
                  { backgroundColor: clockedIn ? theme.panel2 : brand.primary, borderColor: theme.line, borderWidth: clockedIn ? 1 : 0 },
                  pressed && styles.pressed,
                  clocking && styles.disabled,
                ]}
              >
                <Text style={[styles.clockButtonText, { color: clockedIn ? theme.text : '#ffffff' }]}>
                  {clocking ? 'Please wait…' : clockedIn ? 'Clock Out' : 'Clock In'}
                </Text>
              </Pressable>
            </GlassCard>

            <Panel style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Hours this week</Text>
              <View style={styles.barsRow}>
                {last7.length === 0 ? (
                  <Text style={[styles.caption, { color: theme.text3 }]}>No attendance yet this week.</Text>
                ) : (
                  last7.map((r) => {
                    const h = hoursBetween(r.clock_in, r.clock_out);
                    return (
                      <View key={r.id} style={styles.barCol}>
                        <View style={[styles.bar, { height: Math.max(6, (h / maxHours) * 64), backgroundColor: brand.primary }]} />
                        <Text style={[styles.barLabel, { color: theme.text3 }]}>
                          {new Date(r.date).toLocaleDateString('en-US', { weekday: 'narrow' })}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </Panel>

            <Text style={[styles.sectionLabel, { color: theme.text3, marginTop: spacing(5) }]}>History</Text>
            {history.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3 }]}>No attendance history yet.</Text>
            ) : (
              history.slice(0, 14).map((r) => (
                <Panel key={r.id} style={styles.historyRow}>
                  <View style={styles.historyInfo}>
                    <Text style={[styles.historyDate, { color: theme.text }]}>{r.date}</Text>
                    {r.location ? <Text style={[styles.caption, { color: theme.text3 }]}>{r.location}</Text> : null}
                  </View>
                  <View style={styles.historyTimes}>
                    <Text style={[styles.historyTime, { color: theme.text }]}>
                      {r.clock_in ? new Date(r.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {' – '}
                      {r.clock_out ? new Date(r.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                    </Text>
                    <Text style={[styles.historyHours, { color: brand.primary }]}>{hoursBetween(r.clock_in, r.clock_out).toFixed(1)}h</Text>
                  </View>
                </Panel>
              ))
            )}
          </>
        ) : (
          <>
            <Pressable onPress={onOpenLeaveForm} style={({ pressed }) => [styles.newLeaveButton, pressed && styles.pressed]}>
              <Text style={styles.newLeaveButtonText}>+ New Leave Request</Text>
            </Pressable>
            {leaves.length === 0 ? (
              <Text style={[styles.caption, { color: theme.text3 }]}>No leave requests yet.</Text>
            ) : (
              leaves.map((l) => {
                const s = LEAVE_STATUS_STYLE[l.status] || LEAVE_STATUS_STYLE.pending;
                return (
                  <Panel key={l.id} style={styles.leaveRow}>
                    <View style={styles.leaveHeader}>
                      <Text style={[styles.leaveDates, { color: theme.text }]}>{l.start_date} – {l.end_date}</Text>
                      <View style={[styles.leaveBadge, { backgroundColor: s.bg }]}>
                        <Text style={[styles.leaveBadgeText, { color: s.color }]}>{s.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.caption, { color: theme.text2 }]}>{l.reason}</Text>
                  </Panel>
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
  title: { ...typography.title },
  caption: { ...typography.caption },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  section: { marginTop: spacing(5) },
  segmentRow: { flexDirection: 'row', borderRadius: 14, padding: 4, marginTop: spacing(4), marginBottom: spacing(4) },
  segment: { flex: 1, paddingVertical: spacing(2.5), borderRadius: 11, alignItems: 'center' },
  segmentActive: { backgroundColor: brand.primary },
  segmentText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  clockCard: { alignItems: 'center', paddingVertical: spacing(6) },
  clockChip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3.5), paddingVertical: spacing(1.75), borderRadius: radius.full, marginBottom: spacing(4) },
  clockDot: { width: 7, height: 7, borderRadius: 4 },
  clockChipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  clockButton: { width: '100%', paddingVertical: spacing(3.5), borderRadius: 14, alignItems: 'center' },
  clockButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2), height: 90 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing(1.5) },
  bar: { width: '100%', maxWidth: 20, borderRadius: 6 },
  barLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) },
  historyInfo: { flex: 1 },
  historyDate: { fontFamily: 'Manrope_700Bold', fontSize: 13, marginBottom: spacing(0.5) },
  historyTimes: { alignItems: 'flex-end' },
  historyTime: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12 },
  historyHours: { fontFamily: 'Manrope_700Bold', fontSize: 12, marginTop: spacing(0.5) },
  newLeaveButton: { padding: spacing(3.5), borderRadius: 14, backgroundColor: brand.primary, alignItems: 'center', marginBottom: spacing(4) },
  newLeaveButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#ffffff' },
  leaveRow: { marginBottom: spacing(2.5) },
  leaveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) },
  leaveDates: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  leaveBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(0.75), borderRadius: 8 },
  leaveBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
});
