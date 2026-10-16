import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import AdminTabBar, { AdminTab } from '../../components/admin/AdminTabBar';
import { tabBarSpace } from '../../components/GlassTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SectionLabel from '../../components/admin/SectionLabel';
import StatusBadge from '../../components/admin/StatusBadge';
import EmptyNote from '../../components/admin/EmptyNote';
import GlowButton from '../../components/GlowButton';
import Icon from '../../components/Icon';
import NotificationBell from '../../components/NotificationBell';
import LogoutConfirmModal from '../../components/LogoutConfirmModal';
import { IconName } from '../../theme/icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { statusColors, DEFAULT_STATUS_STYLE } from '../../theme/tokens';
import { AdminDashboardData, fetchAdminDashboard, fetchUnreadCount } from '../../api/adminPortal';
import { AssignmentAlert, fetchAssignmentAlerts } from '../../api/adminOps';
import { fetchAutoAssignStatus } from '../../api/adminManage';
import { humanize, initials, inr, timeAgo } from '../../utils/format';
import { isReportTime, lastReportSent, loadReminderPrefs, ReminderPrefs, timeText } from '../../notifications/dailyReport';

interface Props {
  onTab: (tab: AdminTab) => void;
  onOpen: (route: string) => void;
  onOpenNotifications: () => void;
}

const OPEN = ['pending', 'open', 'assigned', 'in_progress', 'reopened', 'issue_not_resolved'];
const DONE = ['resolved', 'closed', 'case_closed', 'foc'];
const norm = (s: string | null | undefined) => (s || '').toLowerCase();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function AdminHomeScreen({ onTab, onOpen, onOpenNotifications }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [alerts, setAlerts] = useState<AssignmentAlert[]>([]);
  const [autoOn, setAutoOn] = useState<boolean | null>(null);
  const [reportPrefs, setReportPrefs] = useState<ReminderPrefs | null>(null);
  const [reportSentToday, setReportSentToday] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, n, a, auto] = await Promise.all([
        fetchAdminDashboard(),
        fetchUnreadCount(),
        fetchAssignmentAlerts(),
        fetchAutoAssignStatus().then((s) => !!s.auto_assignment_enabled).catch(() => null),
      ]);
      setData(d);
      setUnread(n);
      setAlerts(a);
      setAutoOn(auto);
      setReportPrefs(await loadReminderPrefs());
      setReportSentToday((await lastReportSent()) === new Date().toLocaleDateString('en-CA'));
      setError(null);
    } catch {
      setError('Could not load the dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const view = useMemo(() => {
    const inquiries = data?.inquiries ?? [];
    const open = inquiries.filter((i) => OPEN.includes(norm(i.status)));
    const needsAttention = open.filter((i) => !i.assigned_employee_id || norm(i.assignment_status) === 'declined');
    const unpaid = inquiries.filter(
      (i) => DONE.includes(norm(i.status)) && Number(i.bill_total) > 0 && norm(i.payment_status) !== 'paid',
    );
    const unpaidTotal = unpaid.reduce((n, i) => n + Number(i.bill_total || 0), 0);
    const online = (data?.attendance ?? []).filter((a) => a.clock_in && !a.clock_out);
    const installs = (data?.installations ?? []).filter((i) => ['pending', 'assigned', 'in_progress'].includes(norm(i.status)));
    const recent = [...inquiries].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 4);

    // Finished jobs per technician over the last 7 days, from the same rows the
    // dashboard already holds.
    const since = Date.now() - WEEK_MS;
    const names = new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name || 'Employee']));
    const tally = new Map<string, number>();
    inquiries.forEach((i) => {
      if (!i.assigned_employee_id || !DONE.includes(norm(i.status))) return;
      if (new Date(i.created_at).getTime() < since) return;
      tally.set(i.assigned_employee_id, (tally.get(i.assigned_employee_id) || 0) + 1);
    });
    const top = [...tally.entries()]
      .map(([id, n]) => ({ id, name: names.get(id) || 'Employee', n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
    return { open, needsAttention, unpaid, unpaidTotal, online, installs, recent, top };
  }, [data]);

  const first = (user?.full_name || '').trim().split(/\s+/)[0];
  const dateLine = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const complaints = data?.complaints.length ?? 0;
  const topMax = Math.max(1, ...view.top.map((t) => t.n));
  const reportDue = !reportSentToday && !!reportPrefs && isReportTime(reportPrefs);

  const kpis: { label: string; value: string | number; icon: IconName; sub: string; subColor: string; route: string }[] = [
    { label: 'Open requests', value: view.open.length, icon: 'tasks', sub: `${view.needsAttention.length} unassigned`, subColor: view.needsAttention.length ? theme.warn : theme.text2, route: 'ServiceRequests' },
    { label: 'Need assignment', value: view.needsAttention.length, icon: 'alert', sub: view.needsAttention.length ? 'Waiting for a technician' : 'All assigned', subColor: view.needsAttention.length ? theme.err : theme.ok, route: 'AssignmentQueue' },
    { label: 'Online now', value: view.online.length, icon: 'user', sub: 'Clocked in today', subColor: theme.ok, route: 'LiveLocations' },
    { label: 'Awaiting payment', value: view.unpaid.length, icon: 'wallet', sub: view.unpaid.length ? `${inr(view.unpaidTotal)} to collect` : 'Nothing due', subColor: view.unpaid.length ? theme.warn : theme.text2, route: 'Payments' },
    { label: 'Open complaints', value: complaints, icon: 'chat', sub: complaints ? 'Needs a response' : 'None open', subColor: complaints ? theme.err : theme.text2, route: 'Complaints' },
    { label: 'Active installs', value: view.installs.length, icon: 'construct', sub: 'Upcoming or running', subColor: theme.text2, route: 'Installations' },
  ];

  return (
    <View style={styles.root}>
      <AdminScreen
        title={first ? `${greeting()}, ${first}` : 'Dashboard'}
        subtitle={dateLine}
        bottomSpace={tabBarSpace(insets.bottom)}
        onRefresh={load}
        loading={loading && !data}
        error={!data ? error : null}
        headerRight={
          <>
            <NotificationBell unread={unread} onPress={onOpenNotifications} />
            <Pressable
              onPress={() => setConfirmLogout(true)}
              hitSlop={8}
              accessibilityLabel="Log out"
              style={({ pressed }) => [styles.logout, { backgroundColor: theme.err }, pressed && styles.pressed]}
            >
              <Icon name="logout" size={16} color="#fff" />
            </Pressable>
          </>
        }
      >
        <View style={styles.actions}>
          <View style={styles.flex}>
            <GlowButton label="Register request" icon="add" onPress={() => onOpen('RegisterRequest')} />
          </View>
          <Pressable
            onPress={() => onOpen('AutoAssignment')}
            accessibilityRole="button"
            accessibilityLabel="Auto assignment"
            style={({ pressed }) => [styles.autoPill, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && styles.pressed]}
          >
            <View style={[styles.dot, { backgroundColor: autoOn ? theme.ok : theme.grey }]} />
            <Text style={[styles.autoText, { color: theme.text }]}>{autoOn === null ? 'Auto-assign' : autoOn ? 'Auto-assign on' : 'Auto-assign off'}</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => onOpen('DailyReport')}
          accessibilityRole="button"
          accessibilityLabel="Daily WhatsApp report"
          style={({ pressed }) => [
            styles.reportCard,
            { backgroundColor: theme.panel, borderColor: reportDue ? theme.accent : theme.border },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.tile, { backgroundColor: theme.okS }]}>
            <Icon name="whatsapp" size={20} color={theme.ok} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Daily report</Text>
            <Text style={[styles.attHint, { color: theme.text2 }]} numberOfLines={2}>
              {reportSentToday
                ? 'Shared today — tap to view again'
                : reportDue
                  ? 'Ready — send the attendance and pending-jobs messages'
                  : `Attendance and pending jobs for WhatsApp${reportPrefs?.enabled ? ` · reminder ${timeText(reportPrefs)}` : ''}`}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={theme.text3} />
        </Pressable>

        {alerts.length > 0 || view.needsAttention.length > 0 ? (
          <>
            <SectionLabel>Needs attention</SectionLabel>
            <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              {alerts.slice(0, 5).map((a, idx) => (
                <AttentionRow
                  key={`alert-${a.id}`}
                  first={idx === 0}
                  icon="alert"
                  tint={theme.err}
                  tintBg={theme.errS}
                  title={a.full_name || 'Customer'}
                  hint={`${a.ticket_no || ''} · nobody assigned, ${Math.round(a.late_minutes)} working minutes past the 2-hour limit`}
                  trailing={<Text style={[styles.count, { color: theme.err }]}>{Math.round(a.late_minutes)}m</Text>}
                  onPress={() => onOpen('ServiceRequests')}
                />
              ))}
              {view.needsAttention.slice(0, 5).map((i, idx) => {
                const st = statusColors[norm(i.status)] ?? DEFAULT_STATUS_STYLE;
                const declined = norm(i.assignment_status) === 'declined';
                return (
                  <AttentionRow
                    key={i.id}
                    first={alerts.length === 0 && idx === 0}
                    icon={declined ? 'alert' : 'tasks'}
                    tint={declined ? theme.err : theme.warn}
                    tintBg={declined ? theme.errS : theme.warnS}
                    title={i.full_name || 'Customer'}
                    hint={`${i.ticket_no || ''}${declined ? ' · declined' : ' · unassigned'} · ${timeAgo(i.created_at)}${i.service_item ? ` · ${i.service_item}` : ''}`}
                    trailing={<StatusBadge label={st.label === 'Unknown' ? humanize(i.status) : st.label} color={st.color} />}
                    onPress={() => onOpen('ServiceRequests')}
                  />
                );
              })}
            </View>
          </>
        ) : (
          <>
            <SectionLabel>Needs attention</SectionLabel>
            <EmptyNote text="Every open request has a technician" icon="check-circle" />
          </>
        )}

        <View style={styles.kpiGrid}>
          {kpis.map((k) => (
            <Pressable
              key={k.label}
              onPress={() => onOpen(k.route)}
              style={({ pressed }) => [styles.kpi, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && styles.pressed]}
            >
              <View style={styles.kpiHead}>
                <Text style={[styles.kpiLabel, { color: theme.text2 }]} numberOfLines={1}>{k.label}</Text>
                <Icon name={k.icon} size={16} color={theme.text3} />
              </View>
              <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1}>{k.value}</Text>
              <Text style={[styles.kpiSub, { color: k.subColor }]} numberOfLines={1}>{k.sub}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => onOpen('LiveLocations')}
          style={({ pressed }) => [styles.liveStrip, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && styles.pressed]}
        >
          {view.online.length === 0 ? (
            <View style={[styles.avatar, { backgroundColor: theme.panel2 }]}>
              <Icon name="clock" size={16} color={theme.text3} />
            </View>
          ) : (
            <View style={styles.avatars}>
              {view.online.slice(0, 5).map((a, i) => (
                <View
                  key={a.id}
                  style={[styles.avatar, { backgroundColor: theme.okS, borderColor: theme.panel, marginLeft: i === 0 ? 0 : -10 }]}
                >
                  <Text style={[styles.avatarText, { color: theme.accent }]}>{initials(a.profiles?.full_name)}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.flex}>
            <Text style={[styles.liveTitle, { color: theme.text }]}>
              {view.online.length === 0 ? 'Nobody is clocked in' : `${view.online.length} online now`}
            </Text>
            <Text style={[styles.liveSub, { color: theme.text2 }]} numberOfLines={1}>
              {view.online.length === 0
                ? 'Open live map'
                : view.online.slice(0, 3).map((a) => a.profiles?.full_name || 'Employee').join(', ')}
            </Text>
          </View>
          <Icon name="map" size={22} color={theme.text2} />
        </Pressable>

        <View style={styles.headRow}>
          <SectionLabel>Recent requests</SectionLabel>
          <Pressable onPress={() => onOpen('ServiceRequests')} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.seeAll, { color: theme.accent }]}>See all</Text>
          </Pressable>
        </View>
        {view.recent.length === 0 ? (
          <EmptyNote text="No requests yet" icon="tasks" />
        ) : (
          <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            {view.recent.map((r, idx) => {
              const st = statusColors[norm(r.status)] ?? DEFAULT_STATUS_STYLE;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => onOpen('ServiceRequests')}
                  style={({ pressed }) => [styles.recentRow, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.line }, pressed && styles.pressed]}
                >
                  <View style={styles.flex}>
                    <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{r.full_name || 'Customer'}</Text>
                    <Text style={[styles.rowHint, { color: theme.text3 }]} numberOfLines={1}>
                      <Text style={styles.mono}>{r.ticket_no || r.id.slice(0, 8)}</Text>
                      {r.service_item ? ` · ${r.service_item}` : ''}
                    </Text>
                  </View>
                  <StatusBadge label={st.label === 'Unknown' ? humanize(r.status) : st.label} color={st.color} />
                </Pressable>
              );
            })}
          </View>
        )}

        {view.top.length > 0 ? (
          <View style={[styles.topCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            <Text style={[styles.topTitle, { color: theme.text }]}>Top technicians · this week</Text>
            <View style={styles.topList}>
              {view.top.map((t) => (
                <View key={t.id} style={styles.topRow}>
                  <Text style={[styles.topName, { color: theme.text }]} numberOfLines={1}>{t.name}</Text>
                  <View style={[styles.track, { backgroundColor: theme.panel2 }]}>
                    <View style={[styles.fill, { width: `${Math.round((t.n / topMax) * 100)}%`, backgroundColor: theme.accent }]} />
                  </View>
                  <Text style={[styles.topValue, { color: theme.text }]}>{t.n}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </AdminScreen>
      <AdminTabBar active="dashboard" onSelect={onTab} />
      {confirmLogout ? (
        <LogoutConfirmModal
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => {
            setConfirmLogout(false);
            logout();
          }}
        />
      ) : null}
    </View>
  );
}

function AttentionRow({
  first,
  icon,
  tint,
  tintBg,
  title,
  hint,
  trailing,
  onPress,
}: {
  first: boolean;
  icon: IconName;
  tint: string;
  tintBg: string;
  title: string;
  hint: string;
  trailing: React.ReactNode;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.attRow, !first && { borderTopWidth: 1, borderTopColor: theme.line }, pressed && styles.pressed]}
    >
      <View style={[styles.tile, { backgroundColor: tintBg }]}>
        <Icon name={icon} size={20} color={tint} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.attHint, { color: theme.text2 }]} numberOfLines={2}>{hint}</Text>
      </View>
      {trailing}
      <Icon name="chevron-right" size={16} color={theme.text3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
  logout: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: spacing(2.5), marginBottom: spacing(1) },
  autoPill: { height: 52, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing(3.5), flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  dot: { width: 8, height: 8, borderRadius: 4 },
  autoText: { ...typography.caption, fontFamily: 'Manrope_700Bold', lineHeight: 16 },
  reportCard: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.lg, padding: spacing(3), marginTop: spacing(2), marginBottom: spacing(1) },
  panel: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  attRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(3.5), paddingVertical: spacing(3), minHeight: 60 },
  tile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 19 },
  attHint: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16, marginTop: 1 },
  rowHint: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16, marginTop: 1 },
  mono: { fontFamily: 'JetBrainsMono_700Bold' },
  count: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 16 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5), marginTop: spacing(5) },
  kpi: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5) },
  kpiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2) },
  kpiLabel: { ...typography.caption, fontSize: 12, flexShrink: 1 },
  kpiValue: { ...typography.kpi, marginTop: 4 },
  kpiSub: { ...typography.caption, fontSize: 12 },
  liveStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5), marginTop: spacing(3) },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  avatarText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  liveTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 19 },
  liveSub: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  seeAll: { ...typography.caption, fontFamily: 'Manrope_700Bold', marginBottom: spacing(2) },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), paddingHorizontal: spacing(3.5), paddingVertical: spacing(3) },
  topCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5), marginTop: spacing(4) },
  topTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, lineHeight: 20 },
  topList: { gap: spacing(2), marginTop: spacing(2.5) },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  topName: { width: 96, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  topValue: { width: 24, textAlign: 'right', fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
});
