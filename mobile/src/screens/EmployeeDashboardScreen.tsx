import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import AnimatedStatCard from '../components/AnimatedStatCard';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlassTabBar, { TabItem } from '../components/GlassTabBar';
import GlowButton from '../components/GlowButton';
import NotificationBell from '../components/NotificationBell';
import ThemeToggleButton from '../components/ThemeToggleButton';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, categoryColors, semantic, statusColors, DEFAULT_CATEGORY_STYLE, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchTodayAttendance, AttendanceRow } from '../api/attendance';
import { fetchMyTickets, TicketRow } from '../api/employee';
import { fetchActiveNotices, Notice } from '../api/notices';
import { fetchNotifications } from '../api/notifications';

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

const PRIORITY_STYLE: Record<string, { color: string; label: string }> = {
  normal: { color: brand.primary, label: 'Notice' },
  high: { color: semantic.warning, label: 'Important' },
  urgent: { color: semantic.danger, label: 'Urgent' },
};

function RefreshButton({ spinning, onPress }: { spinning: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.linear }), -1, false);
    } else {
      rotation.value = 0;
    }
  }, [spinning, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={spinning}
      style={({ pressed }) => [
        styles.iconBtn,
        { borderColor: theme.line, backgroundColor: theme.panel2 },
        pressed && styles.pressed,
      ]}
      hitSlop={8}
      accessibilityLabel="Refresh"
    >
      <Animated.View style={animatedStyle}>
        <Icon name="refresh" size={16} color={theme.text2} />
      </Animated.View>
    </Pressable>
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
  const { user, logout } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const isGigWorker = user?.worker_type === 'gig';

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [att, tix, notes, notifs] = await Promise.all([
        fetchTodayAttendance(user.id),
        fetchMyTickets(user.id),
        fetchActiveNotices().catch(() => []),
        fetchNotifications().catch(() => ({ items: [], unread: 0 })),
      ]);
      setAttendance(att);
      setTickets(tix);
      setNotices(notes);
      setUnread(notifs.unread);
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

  const activeTickets = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'case_closed');
  const routeTickets = [...activeTickets].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const openTickets = activeTickets.length;
  const clockedIn = !!attendance?.clock_in && !attendance?.clock_out;
  const statusFiltered = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);
  const filteredTickets = search.trim()
    ? statusFiltered.filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()))
    : statusFiltered;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Animated.View entering={FadeInUp.duration(550)} style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Hi, {user?.full_name?.split(' ')[0] || 'there'}</Text>
            <Text style={[styles.caption, { color: theme.text3 }]}>{isGigWorker ? 'Gig worker' : 'Fixed employee'}</Text>
          </View>
          <View style={styles.headerActions}>
            <RefreshButton spinning={refreshing} onPress={onRefresh} />
            <NotificationBell unread={unread} onPress={onOpenNotifications} />
            <ThemeToggleButton />
          </View>
        </Animated.View>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginTop: spacing(3) }]}>{error}</Text> : null}

        <Animated.View entering={FadeInUp.delay(80).duration(550)} style={styles.row}>
          <AnimatedStatCard
            label={clockedIn ? 'Clocked In' : 'Not Clocked In'}
            value={clockedIn ? 'Active' : 'Off'}
            accentColor={clockedIn ? semantic.success : theme.text3}
            icon={clockedIn ? 'check-circle' : 'clock'}
            iconFilled={clockedIn}
            delayMs={0}
          />
          <AnimatedStatCard label="Open Tickets" value={openTickets} accentColor={semantic.warning} icon="tasks" delayMs={100} />
        </Animated.View>

        {routeTickets.length > 0 && (
          <Animated.View entering={FadeInUp.delay(120).duration(550)}>
            <Text style={[styles.heading, { color: theme.text, marginTop: spacing(6), marginBottom: spacing(3) }]}>Today's Route</Text>
            <GlassCard>
              {routeTickets.map((t, i) => {
                const statusStyle = statusColors[t.status] || DEFAULT_STATUS_STYLE;
                const isLast = i === routeTickets.length - 1;
                return (
                  <Pressable key={t.id} onPress={() => onOpenTask(t.id)} style={styles.routeRow}>
                    <View style={styles.routeTimeline}>
                      <View style={[styles.routeDot, { borderColor: statusStyle.color, backgroundColor: t.status === 'in_progress' ? statusStyle.color : 'transparent' }]} />
                      {!isLast && <View style={[styles.routeLine, { backgroundColor: theme.line }]} />}
                    </View>
                    <View style={[styles.routeInfo, isLast && { marginBottom: 0 }]}>
                      <Text style={[styles.taskTitle, { color: theme.text }]} numberOfLines={1}>{t.title}</Text>
                      <Text style={[styles.caption, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </GlassCard>
          </Animated.View>
        )}

        {notices.length > 0 && (
          <Animated.View entering={FadeInUp.delay(150).duration(550)}>
            <Text style={[styles.heading, { color: theme.text, marginTop: spacing(6), marginBottom: spacing(2) }]}>Notice Board</Text>
            {notices.map((n) => {
              const p = PRIORITY_STYLE[n.priority] || PRIORITY_STYLE.normal;
              return (
                <GlassCard key={n.id} style={styles.noticeCard}>
                  <View style={styles.noticeHeader}>
                    <View style={[styles.noticeDot, { backgroundColor: p.color }]} />
                    <Text style={[styles.noticeTag, { color: p.color }]}>{p.label}</Text>
                  </View>
                  <Text style={[styles.noticeTitle, { color: theme.text }]}>{n.title}</Text>
                  <Text style={[styles.body, { color: theme.text2 }]}>{n.body}</Text>
                </GlassCard>
              );
            })}
          </Animated.View>
        )}

        {isGigWorker && (
          <Animated.View entering={FadeInUp.delay(200).duration(550)}>
            <Pressable onPress={onOpenGigPool} style={({ pressed }) => [pressed && styles.pressed]}>
              <GlassCard style={styles.gigTeaser}>
                <View style={[styles.gigIcon, { backgroundColor: 'rgba(124,92,252,0.18)' }]}>
                  <Icon name="star" size={18} color="#7c5cfc" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.noticeTitle, { color: theme.text }]}>Public Jobs</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>See unclaimed jobs open to gig workers</Text>
                </View>
                <Icon name="chevron-right" size={18} color={theme.text3} />
              </GlassCard>
            </Pressable>
          </Animated.View>
        )}

        <Animated.View entering={FadeInUp.delay(250).duration(550)}>
          <Text style={[styles.heading, { color: theme.text, marginTop: spacing(6), marginBottom: spacing(2) }]}>My Tasks</Text>

          <View style={[styles.searchWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
            <Icon name="search" size={15} color={theme.text3} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search tasks…"
              placeholderTextColor={theme.text3}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>

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
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(550)}>
          <GlowButton label="Sign Out" onPress={logout} />
        </Animated.View>
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
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
  title: { ...typography.title },
  heading: { ...typography.heading },
  caption: { ...typography.caption },
  body: { ...typography.body, fontSize: 13 },
  pressed: { opacity: 0.7 },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), marginBottom: spacing(3) },
  searchInput: { flex: 1, paddingVertical: spacing(2.5), fontSize: 14, fontFamily: 'Manrope_400Regular' },
  routeRow: { flexDirection: 'row', gap: spacing(3) },
  routeTimeline: { alignItems: 'center', width: 16 },
  routeDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  routeLine: { width: 2, flex: 1, marginTop: spacing(1) },
  routeInfo: { flex: 1, minWidth: 0, marginBottom: spacing(4) },
  filterRow: { marginBottom: spacing(3) },
  filterChip: { paddingHorizontal: spacing(3.5), paddingVertical: spacing(2), borderRadius: 12, borderWidth: 1 },
  filterChipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3.5), borderRadius: 18, borderWidth: 1, marginBottom: spacing(2.5) },
  taskIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  taskIconText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  taskInfo: { flex: 1, minWidth: 0 },
  taskTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  statusBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8 },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  noticeCard: { marginBottom: spacing(2.5) },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginBottom: spacing(1.5) },
  noticeDot: { width: 6, height: 6, borderRadius: 3 },
  noticeTag: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  noticeTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(1) },
  gigTeaser: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginTop: spacing(5) },
  gigIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
