import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import AdminTabBar, { AdminTab } from '../../components/admin/AdminTabBar';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import Icon from '../../components/Icon';
import NotificationBell from '../../components/NotificationBell';
import LogoutConfirmModal from '../../components/LogoutConfirmModal';
import { IconName } from '../../theme/icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../../theme/tokens';
import { AdminDashboardData, fetchAdminDashboard, fetchUnreadCount } from '../../api/adminPortal';
import { humanize, shortTime, timeAgo } from '../../utils/format';

interface Props {
  onTab: (tab: AdminTab) => void;
  onOpen: (route: string) => void;
  onOpenNotifications: () => void;
}

const OPEN = ['pending', 'open', 'assigned', 'in_progress', 'reopened', 'issue_not_resolved'];
const DONE = ['resolved', 'closed', 'case_closed', 'foc'];
const norm = (s: string | null | undefined) => (s || '').toLowerCase();

const QUICK: { label: string; icon: IconName; route: string }[] = [
  { label: 'Requests', icon: 'tasks', route: 'ServiceRequests' },
  { label: 'Attendance', icon: 'clock', route: 'Attendance' },
  { label: 'Live map', icon: 'location', route: 'LiveLocations' },
  { label: 'Finance', icon: 'wallet', route: 'Finance' },
];

export default function AdminHomeScreen({ onTab, onOpen, onOpenNotifications }: Props) {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, n] = await Promise.all([fetchAdminDashboard(), fetchUnreadCount()]);
      setData(d);
      setUnread(n);
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
    const online = (data?.attendance ?? []).filter((a) => a.clock_in && !a.clock_out);
    const installs = (data?.installations ?? []).filter((i) => ['pending', 'assigned', 'in_progress'].includes(norm(i.status)));
    return { open, needsAttention, unpaid, online, installs };
  }, [data]);

  return (
    <View style={styles.root}>
      <AdminScreen
        title="Dashboard"
        subtitle={user?.full_name ? `Welcome back, ${user.full_name}` : 'Admin'}
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
              style={({ pressed }) => [styles.logout, { backgroundColor: semantic.danger }, pressed && styles.pressed]}
            >
              <Icon name="logout" size={16} color="#fff" />
            </Pressable>
          </>
        }
      >
        <StatGrid
          items={[
            { label: 'Open requests', value: view.open.length, color: semantic.info },
            { label: 'Need assignment', value: view.needsAttention.length, color: view.needsAttention.length ? semantic.danger : undefined },
            { label: 'Online now', value: view.online.length, color: semantic.success },
            { label: 'Awaiting payment', value: view.unpaid.length, color: semantic.warning },
            { label: 'Open complaints', value: data?.complaints.length ?? 0, color: (data?.complaints.length ?? 0) ? semantic.danger : undefined },
            { label: 'Active installs', value: view.installs.length },
          ]}
        />

        <View style={styles.quick}>
          {QUICK.map((q) => (
            <Pressable
              key={q.route}
              onPress={() => onOpen(q.route)}
              style={({ pressed }) => [styles.quickTile, { backgroundColor: theme.panel2, borderColor: theme.line }, pressed && styles.pressed]}
            >
              <View style={[styles.quickIcon, { backgroundColor: brand.primary + '22' }]}>
                <Icon name={q.icon} size={18} color={brand.primary} />
              </View>
              <Text style={[styles.quickLabel, { color: theme.text2 }]} numberOfLines={1}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionLabel>Needs attention</SectionLabel>
        {view.needsAttention.length === 0 ? (
          <EmptyNote text="Every open request has a technician" icon="check-circle" />
        ) : (
          view.needsAttention.slice(0, 5).map((i) => {
            const st = statusColors[norm(i.status)] ?? DEFAULT_STATUS_STYLE;
            const declined = norm(i.assignment_status) === 'declined';
            return (
              <ListRow
                key={i.id}
                icon={declined ? 'alert' : 'tasks'}
                iconColor={declined ? semantic.danger : semantic.warning}
                title={i.full_name || 'Customer'}
                subtitle={i.service_item || undefined}
                meta={`${i.ticket_no || ''}${declined ? ' · declined' : ' · unassigned'} · ${timeAgo(i.created_at)}`}
                badge={{ label: st.label === 'Unknown' ? humanize(i.status) : st.label, color: st.color }}
                onPress={() => onOpen('ServiceRequests')}
              />
            );
          })
        )}

        <SectionLabel>Online now</SectionLabel>
        {view.online.length === 0 ? (
          <EmptyNote text="Nobody is clocked in" icon="clock" />
        ) : (
          view.online.map((a) => (
            <ListRow
              key={a.id}
              title={a.profiles?.full_name || 'Employee'}
              subtitle={a.location || undefined}
              meta={`Clocked in ${shortTime(a.clock_in)}`}
              icon="clock"
              iconColor={semantic.success}
            />
          ))
        )}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  logout: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  quick: { flexDirection: 'row', gap: spacing(2.5) },
  quickTile: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing(3), alignItems: 'center', gap: spacing(2) },
  quickIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { ...typography.caption, fontSize: 11 },
});
