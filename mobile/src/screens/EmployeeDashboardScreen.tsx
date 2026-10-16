import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import StatusBadge from '../components/admin/StatusBadge';
import GlassTabBar, { TabItem } from '../components/GlassTabBar';
import AppHeaderBar from '../components/AppHeaderBar';
import PulseDot from '../components/PulseDot';
import GlowButton from '../components/GlowButton';
import Icon from '../components/Icon';
import PendingAssignments from '../components/PendingAssignments';
import ClockOutConfirmModal from '../components/ClockOutConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useAttendanceStatus } from '../context/AttendanceContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { ApiError } from '../api/client';
import {
  fetchTodayAttendance,
  fetchAttendanceHistory,
  clockIn,
  clockOut,
  AttendanceRow,
} from '../api/attendance';
import { fetchMyTickets, TicketRow } from '../api/employee';
import { fetchActiveNotices, Notice } from '../api/notices';
import { fetchNotifications } from '../api/notifications';
import { syncAppBadge } from '../notifications';
import { fetchEodReports, EodReport } from '../api/eod';
import { fetchMyTasks, TaskItem } from '../api/tasks';
import EmployeePopupAd from '../components/EmployeePopupAd';

interface Props {
  onOpenTask: (ticketId: string) => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onGoProfile: () => void;
  onOpenNotifications: () => void;
  onOpenGigPool: () => void;
}

// Shared by every employee top-level screen so the tab bar is identical
// (not duplicated) across all of them. Matches NEST's real 5-tab design —
// see docs/superpowers/specs/2026-08-19-nest-profile.md §3. "More" is
// gone: Profile is a real tab now, not a placeholder holding area.
export const EMPLOYEE_TABS: TabItem[] = [
  { key: 'dashboard', label: 'Home', icon: 'home' },
  { key: 'attendance', label: 'Attendance', icon: 'clock' },
  { key: 'jobtools', label: 'Job Tools', icon: 'wrench' },
  { key: 'earnings', label: 'Earnings', icon: 'wallet' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];

type NoticeTone = 'accent' | 'warn' | 'err';

const PRIORITY_STYLE: Record<string, { tone: NoticeTone; label: string }> = {
  normal: { tone: 'accent', label: 'Notice' },
  high: { tone: 'warn', label: 'Important' },
  urgent: { tone: 'err', label: 'Urgent' },
};

function elapsed(fromIso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

// A notice opens as a bottom sheet (design: 28 dp top radius, grabber) — same
// tap-to-open pattern as NotificationsScreen's detail.
function NoticeDetail({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const { theme } = useTheme();
  const p = PRIORITY_STYLE[notice.priority] || PRIORITY_STYLE.normal;
  const color = theme[p.tone === 'accent' ? 'accent' : p.tone];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text style={[styles.overline, { color }]}>{p.label}</Text>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{notice.title}</Text>
          {notice.body ? <Text style={[styles.sheetBody, { color: theme.text2 }]}>{notice.body}</Text> : null}
          <Text style={[styles.sheetMeta, { color: theme.text3 }]}>{new Date(notice.created_at).toLocaleString('en-IN')}</Text>
          <GlowButton label="Dismiss" onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

export default function EmployeeDashboardScreen({
  onOpenTask,
  onGoAttendance,
  onGoJobTools,
  onGoEarnings,
  onGoProfile,
  onOpenNotifications,
  onOpenGigPool,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { attendance: sharedAttendance, refresh: refreshHeaderAttendance } = useAttendanceStatus();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRow[]>([]);
  const [eodReports, setEodReports] = useState<EodReport[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [pending, setPending] = useState<TaskItem[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [clocking, setClocking] = useState(false);
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const isGigWorker = user?.worker_type === 'gig';

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [att, hist, eods, tix, notes, notifs, tasks] = await Promise.all([
        fetchTodayAttendance(user.id),
        fetchAttendanceHistory(user.id),
        fetchEodReports(user.id).catch(() => []),
        fetchMyTickets(user.id),
        fetchActiveNotices().catch(() => []),
        fetchNotifications().catch(() => ({ items: [], unread: 0 })),
        fetchMyTasks(user.id).catch(() => ({ pending: [], items: [] })),
      ]);
      setAttendance(att);
      setAttendanceHistory(hist);
      setEodReports(eods);
      setTickets(tix);
      setNotices(notes);
      setUnread(notifs.unread);
      setPending(tasks.pending);
      setError(null);
    } catch (err) {
      setError('Could not load dashboard — pull to retry');
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Keeps the phone's home-screen app icon badge in sync with the real
  // unread count every time this (usually first-opened) screen loads.
  useEffect(() => {
    syncAppBadge(unread);
  }, [unread]);

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

  const activeTickets = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'case_closed');
  const routeTickets = [...activeTickets].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const clockedIn = !!attendance?.clock_in && !attendance?.clock_out;

  // A day the employee clocked out of without ever filing that day's EOD —
  // mirrors web's missed-EOD warning, computed client-side since there's no
  // dedicated "warning" flag from the server.
  const eodDates = new Set(eodReports.map((r) => r.date));
  const missedEodCount = attendanceHistory.filter((r) => r.clock_out && !eodDates.has(r.date)).length;

  const handleClock = async () => {
    if (!user) return;
    setClocking(true);
    setError(null);
    try {
      if (clockedIn && attendance) {
        await clockOut(attendance.id);
      } else {
        await clockIn(user.id);
      }
      await load();
      refreshHeaderAttendance();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update attendance');
    } finally {
      setClocking(false);
    }
  };

  // Clock-in fires immediately; clock-out is a one-way action for the day
  // (ends the shift), so it's guarded behind a confirmation instead.
  const onClockPress = () => {
    if (clockedIn) setShowClockOutConfirm(true);
    else handleClock();
  };

  // Drives the hero timer while the shift is running.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!clockedIn) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [clockedIn]);

  const topInset = headerHeight > 0 ? headerHeight : insets.top + 110;
  const clockedOut = !!attendance?.clock_in && !!attendance?.clock_out;
  const stateLabel = clockedIn ? (isGigWorker ? 'Online' : 'Clocked in') : 'Not clocked in';
  const chipBg = clockedIn ? theme.okS : theme.greyS;
  const chipFg = clockedIn ? theme.ok : theme.grey;
  const sinceLine = clockedIn && attendance?.clock_in
    ? `Since ${new Date(attendance.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : clockedOut ? 'Shift ended for today' : 'Not started today';

  return (
    <View style={styles.root}>
      <MeshBackground />
      <EmployeePopupAd />

      <AppHeaderBar
        title={`Hi, ${user?.full_name?.split(' ')[0] || 'there'}`}
        subtitle={isGigWorker ? 'Gig worker' : 'Fixed employee'}
        onRefresh={onRefresh}
        refreshing={refreshing}
        unread={unread}
        onOpenNotifications={onOpenNotifications}
        onLayout={setHeaderHeight}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topInset + spacing(4) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        {error ? <Text style={[styles.caption, { color: theme.err }]}>{error}</Text> : null}

        {missedEodCount > 0 ? (
          <View accessibilityRole="alert" style={[styles.alertBanner, { backgroundColor: theme.warnS, borderColor: theme.warn }]}>
            <Icon name="alert" size={20} color={theme.warn} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>EOD report missing</Text>
              <Text style={[styles.supporting, { color: theme.text2, marginTop: 2 }]}>
                {missedEodCount === 1
                  ? 'A day you clocked out was left without an EOD report.'
                  : `${missedEodCount} days you clocked out were left without an EOD report.`}
              </Text>
            </View>
          </View>
        ) : null}

        <GlassCard>
          <View style={styles.heroTop}>
            <Text style={[styles.heroDate, { color: theme.text2 }]}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
            </Text>
            {attendance?.location ? (
              <View style={styles.heroGeo}>
                <Icon name="pin" size={13} color={theme.text3} />
                <Text style={[styles.heroGeoText, { color: theme.text3 }]} numberOfLines={1}>{attendance.location}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.heroMid}>
            <View style={{ flex: 1 }}>
              <View style={[styles.stateChip, { backgroundColor: chipBg }]}>
                {clockedIn ? <PulseDot color={chipFg} size={7} /> : <View style={[styles.stateDot, { backgroundColor: chipFg }]} />}
                <Text style={[styles.stateChipText, { color: chipFg }]}>{stateLabel}</Text>
              </View>
              <Text style={[styles.supporting, { color: theme.text2, marginTop: spacing(2) }]}>{sinceLine}</Text>
            </View>
            <Text style={[styles.timer, { color: clockedIn ? theme.text : theme.text3 }]}>
              {clockedIn && attendance?.clock_in ? elapsed(attendance.clock_in, now) : '—'}
            </Text>
          </View>

          <Pressable
            onPress={onClockPress}
            disabled={clocking}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.heroButton,
              clockedIn
                ? { backgroundColor: theme.panel, borderColor: theme.border, borderWidth: 1 }
                : { backgroundColor: pressed ? brand.pressed : brand.fill },
              clocking && styles.disabled,
            ]}
          >
            <Icon name={clockedIn ? 'logout' : 'clock'} size={20} color={clockedIn ? theme.text : '#ffffff'} />
            <Text style={[styles.heroButtonText, { color: clockedIn ? theme.text : '#ffffff' }]}>
              {clocking ? 'Please wait…' : clockedIn ? 'Clock Out' : 'Clock In'}
            </Text>
          </Pressable>
          {!clockedIn && !clockedOut ? (
            <Text style={[styles.hint, { color: theme.text3 }]}>Your location is checked when you clock in</Text>
          ) : null}
        </GlassCard>

        {isGigWorker ? (
          <Pressable
            onPress={onOpenGigPool}
            style={({ pressed }) => [styles.gigCard, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && styles.pressed]}
          >
            <View style={[styles.gigIcon, { backgroundColor: theme.vioS }]}>
              <Icon name="briefcase" size={22} color={theme.vio} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionRowTitle, { color: theme.text }]}>Public Jobs</Text>
              <Text style={[styles.supporting, { color: theme.text2 }]}>See unclaimed jobs open to gig workers</Text>
            </View>
            <Icon name="chevron-right" size={18} color={theme.text3} />
          </Pressable>
        ) : null}

        <PendingAssignments pending={pending} onChanged={load} />

        {routeTickets.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.heading, { color: theme.text }]}>Today's jobs</Text>
              <Pressable onPress={onGoJobTools} hitSlop={8} style={styles.linkBtn}>
                <Text style={[styles.linkText, { color: theme.accent }]}>All tasks</Text>
              </Pressable>
            </View>
            <View style={[styles.listPanel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              {routeTickets.map((t, i) => {
                const statusStyle = statusColors[t.status] || DEFAULT_STATUS_STYLE;
                const isLast = i === routeTickets.length - 1;
                const inq = t.inquiries?.[0];
                const ticketNo = inq?.ticket_no || `#${t.id.slice(0, 8).toUpperCase()}`;
                const customerName = inq?.full_name || t.title;
                const service = inq?.service_item || t.category;
                const created = new Date(t.created_at);
                const [clock, ampm] = created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).split(' ');
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => onOpenTask(t.id)}
                    style={({ pressed }) => [styles.jobRow, !isLast && { borderBottomColor: theme.line, borderBottomWidth: 1 }, pressed && styles.pressed]}
                  >
                    <View style={styles.jobTime}>
                      <Text style={[styles.jobClock, { color: theme.text }]}>{clock}</Text>
                      <Text style={[styles.jobAmPm, { color: theme.text3 }]}>{ampm}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{customerName}</Text>
                      <Text style={[styles.metaLine, { color: theme.text2 }]} numberOfLines={1}>{ticketNo} · {service}</Text>
                      <View style={styles.badgeRow}>
                        <StatusBadge label={statusStyle.label} color={statusStyle.color} />
                        <Text style={[styles.jobDate, { color: theme.text3 }]}>
                          {created.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                    </View>
                    <Icon name="chevron-right" size={18} color={theme.text3} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {notices.map((n) => {
          const p = PRIORITY_STYLE[n.priority] || PRIORITY_STYLE.normal;
          const color = theme[p.tone === 'accent' ? 'accent' : p.tone];
          return (
            <Pressable key={n.id} onPress={() => setSelectedNotice(n)} style={({ pressed }) => [pressed && styles.pressed]}>
              <Panel style={styles.noticeCard}>
                <View style={styles.noticeOverline}>
                  <Icon name="megaphone" size={14} color={color} />
                  <Text style={[styles.overline, { color }]}>{p.label}</Text>
                </View>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{n.title}</Text>
                <Text style={[styles.supporting, { color: theme.text2 }]} numberOfLines={2}>{n.body}</Text>
              </Panel>
            </Pressable>
          );
        })}
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey="dashboard"
        onSelect={(key) => {
          if (key === 'attendance') onGoAttendance();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'earnings') onGoEarnings();
          else if (key === 'profile') onGoProfile();
        }}
      />

      {selectedNotice && <NoticeDetail notice={selectedNotice} onDismiss={() => setSelectedNotice(null)} />}

      {showClockOutConfirm && (
        <ClockOutConfirmModal
          since={attendance?.clock_in ?? null}
          onCancel={() => setShowClockOutConfirm(false)}
          onConfirm={() => {
            setShowClockOutConfirm(false);
            handleClock();
          }}
        />
      )}
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
  disabled: { opacity: 0.6 },
  alertBanner: { flexDirection: 'row', gap: spacing(2.5), padding: spacing(4), borderRadius: 20, borderWidth: 1.5 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2) },
  heroDate: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  heroGeo: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), flexShrink: 1 },
  heroGeoText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, flexShrink: 1 },
  heroMid: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing(3), marginTop: spacing(3.5), marginBottom: spacing(1) },
  stateChip: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: spacing(1.5), height: 26, paddingHorizontal: spacing(2.5), borderRadius: radius.full },
  stateDot: { width: 7, height: 7, borderRadius: 4 },
  stateChipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  timer: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 32, lineHeight: 36, letterSpacing: -1 },
  heroButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 56, borderRadius: 16, marginTop: spacing(3.5) },
  heroButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  hint: { ...typography.supporting, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: spacing(2) },
  gigCard: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(4), borderRadius: 20, borderWidth: 1 },
  gigIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionRowTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  section: { gap: spacing(2.5) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkBtn: { minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  listPanel: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3.5) },
  jobTime: { width: 40, alignItems: 'center' },
  jobClock: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
  jobAmPm: { fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  metaLine: { fontFamily: 'Manrope_500Medium', fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(2) },
  jobDate: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  noticeCard: { gap: spacing(1.5), borderRadius: 20 },
  noticeOverline: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderTopWidth: 1, paddingHorizontal: spacing(5), paddingTop: spacing(2.5), paddingBottom: spacing(9) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing(4.5) },
  sheetTitle: { ...typography.heading, fontSize: 20, lineHeight: 26, marginTop: spacing(1) },
  sheetBody: { ...typography.body, fontSize: 14, lineHeight: 20, marginTop: spacing(2) },
  sheetMeta: { ...typography.supporting, fontSize: 12, marginTop: spacing(3), marginBottom: spacing(3) },
});
