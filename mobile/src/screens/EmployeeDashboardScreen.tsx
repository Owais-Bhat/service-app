import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedStatCard from '../components/AnimatedStatCard';
import MeshBackground from '../components/MeshBackground';
import GlassTabBar, { TabItem } from '../components/GlassTabBar';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, categoryColors, semantic, statusColors, DEFAULT_CATEGORY_STYLE, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchTodayAttendance, AttendanceRow } from '../api/attendance';
import { fetchMyTickets, TicketRow } from '../api/employee';

interface Props {
  onOpenTask: (ticketId: string) => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onGoProfile: () => void;
}

// Shared by every employee top-level screen so the tab bar is identical
// (not duplicated) across all of them. Matches NEST's real 5-tab design —
// see docs/superpowers/specs/2026-08-19-nest-profile.md §3. "More" is
// gone: Profile is a real tab now, not a placeholder holding area.
export const EMPLOYEE_TABS: TabItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home' },
  { key: 'attendance', label: 'Attendance', icon: 'clock' },
  { key: 'jobtools', label: 'Job Tools', icon: 'wrench' },
  { key: 'earnings', label: 'Earnings', icon: 'wallet' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

export default function EmployeeDashboardScreen({ onOpenTask, onGoAttendance, onGoJobTools, onGoEarnings, onGoProfile }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [att, tix] = await Promise.all([fetchTodayAttendance(user.id), fetchMyTickets(user.id)]);
      setAttendance(att);
      setTickets(tix);
      setError(null);
    } catch (err) {
      setError('Could not load dashboard — pull to retry');
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

  const openTickets = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'case_closed').length;
  const clockedIn = !!attendance?.clock_in && !attendance?.clock_out;
  const filteredTickets = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={[styles.title, { color: theme.text }]}>Hi, {user?.full_name?.split(' ')[0] || 'there'}</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>{user?.worker_type === 'gig' ? 'Gig worker' : 'Fixed employee'}</Text>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginTop: spacing(3) }]}>{error}</Text> : null}

        <View style={styles.row}>
          <AnimatedStatCard
            label={clockedIn ? 'Clocked In' : 'Not Clocked In'}
            value={clockedIn ? 'Active' : 'Off'}
            accentColor={clockedIn ? semantic.success : theme.text3}
            icon={clockedIn ? 'check-circle' : 'clock'}
            iconFilled={clockedIn}
            delayMs={0}
          />
          <AnimatedStatCard label="Open Tickets" value={openTickets} accentColor={semantic.warning} icon="tasks" delayMs={100} />
        </View>

        <Text style={[styles.heading, { color: theme.text, marginTop: spacing(6), marginBottom: spacing(2) }]}>My Tasks</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: spacing(2) }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, { borderColor: theme.line, backgroundColor: active ? brand.primary : theme.panel2 }]}
              >
                <Text style={[styles.filterChipText, { color: active ? '#ffffff' : theme.text2 }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredTickets.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>No tasks in this filter.</Text>
        ) : (
          filteredTickets.map((t) => {
            const categoryStyle = categoryColors[t.category] || DEFAULT_CATEGORY_STYLE;
            const statusStyle = statusColors[t.status] || DEFAULT_STATUS_STYLE;
            return (
              <Pressable
                key={t.id}
                onPress={() => onOpenTask(t.id)}
                style={({ pressed }) => [styles.taskRow, { borderColor: theme.line, backgroundColor: theme.panel2 }, pressed && styles.pressed]}
              >
                <View style={[styles.taskIcon, { backgroundColor: categoryStyle.bg }]}>
                  <Text style={[styles.taskIconText, { color: categoryStyle.color }]}>{categoryStyle.initials}</Text>
                </View>
                <View style={styles.taskInfo}>
                  <Text style={[styles.taskTitle, { color: theme.text }]} numberOfLines={1}>{t.title}</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>#{t.id.slice(0, 8).toUpperCase()}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                </View>
              </Pressable>
            );
          })
        )}

        <GlowButton label="Sign Out" onPress={logout} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
  title: { ...typography.title },
  heading: { ...typography.heading },
  caption: { ...typography.caption },
  filterRow: { marginBottom: spacing(3) },
  filterChip: { paddingHorizontal: spacing(3.5), paddingVertical: spacing(2), borderRadius: 12, borderWidth: 1 },
  filterChipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3.5), borderRadius: 18, borderWidth: 1, marginBottom: spacing(2.5) },
  pressed: { opacity: 0.7 },
  taskIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  taskIconText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  taskInfo: { flex: 1, minWidth: 0 },
  taskTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  statusBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8 },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
});
