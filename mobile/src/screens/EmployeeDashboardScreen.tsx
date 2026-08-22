import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import AnimatedStatCard from '../components/AnimatedStatCard';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlassTabBar, { TabItem } from '../components/GlassTabBar';
import NotificationBell from '../components/NotificationBell';
import PulseDot from '../components/PulseDot';
import ThemeToggleButton from '../components/ThemeToggleButton';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
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
  const { user } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

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

  const topInset = headerHeight > 0 ? headerHeight : insets.top + 78;

  return (
    <View style={styles.root}>
      <MeshBackground />

      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={[styles.headerFixed, { paddingTop: insets.top + spacing(3), borderColor: theme.line, backgroundColor: theme.bg }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Hi, {user?.full_name?.split(' ')[0] || 'there'}</Text>
          <Text style={[styles.caption, { color: theme.text3 }]}>{isGigWorker ? 'Gig worker' : 'Fixed employee'}</Text>
        </View>
        <View style={styles.headerActions}>
          <RefreshButton spinning={refreshing} onPress={onRefresh} />
          <NotificationBell unread={unread} onPress={onOpenNotifications} />
          <ThemeToggleButton />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: topInset + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        {error ? <Text style={[styles.caption, { color: semantic.danger, marginBottom: spacing(3) }]}>{error}</Text> : null}

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
            <View style={styles.routeHeadingRow}>
              <Text style={[styles.heading, { color: theme.text, marginTop: spacing(6) }]}>Today's Route</Text>
              <View style={[styles.stopsPill, { backgroundColor: theme.panel2, marginTop: spacing(6) }]}>
                <Text style={[styles.caption, { color: theme.text2 }]}>{routeTickets.length} stops</Text>
              </View>
            </View>
            <GlassCard style={{ marginTop: spacing(3) }}>
              {routeTickets.map((t, i) => {
                const statusStyle = statusColors[t.status] || DEFAULT_STATUS_STYLE;
                const isLast = i === routeTickets.length - 1;
                const inq = t.inquiries?.[0];
                const ticketNo = inq?.ticket_no || `#${t.id.slice(0, 8).toUpperCase()}`;
                const customerName = inq?.full_name || t.title;
                const service = inq?.service_item || t.category;
                const when = new Date(t.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
                return (
                  <Animated.View key={t.id} entering={FadeInUp.delay(180 + i * 90).duration(450)} style={styles.routeRow}>
                    <View style={styles.routeTimeline}>
                      {t.status === 'in_progress' ? (
                        <PulseDot color={statusStyle.color} size={12} />
                      ) : (
                        <View style={[styles.routeDot, { borderColor: statusStyle.color, backgroundColor: 'transparent' }]} />
                      )}
                      {!isLast && <View style={[styles.routeLine, { backgroundColor: theme.line }]} />}
                    </View>
                    <View style={[styles.routeInfo, isLast && { marginBottom: 0 }]}>
                      <Text style={[styles.taskTitle, { color: theme.text }]} numberOfLines={1}>{customerName}</Text>
                      <Text style={[styles.caption, { color: theme.text3 }]} numberOfLines={1}>
                        <Text style={styles.routeTicketNo}>{ticketNo}</Text> · {service}
                      </Text>
                      <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(2) }]}>{when}</Text>
                      <View style={styles.routeActionRow}>
                        <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
                          <View style={[styles.statusPillDot, { backgroundColor: statusStyle.color }]} />
                          <Text style={[styles.statusPillText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                        </View>
                        <Pressable
                          onPress={() => onOpenTask(t.id)}
                          style={({ pressed }) => [styles.openBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }, pressed && styles.pressed]}
                        >
                          <Icon name="edit" size={13} color={theme.text} />
                          <Text style={[styles.openBtnText, { color: theme.text }]}>Open</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Animated.View>
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
  headerFixed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(3),
    borderBottomWidth: 1,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
  title: { ...typography.title },
  heading: { ...typography.heading },
  caption: { ...typography.caption },
  body: { ...typography.body, fontSize: 13 },
  pressed: { opacity: 0.7 },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  routeRow: { flexDirection: 'row', gap: spacing(3) },
  routeTimeline: { alignItems: 'center', width: 16 },
  routeDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  routeLine: { width: 2, flex: 1, marginTop: spacing(1) },
  routeInfo: { flex: 1, minWidth: 0, marginBottom: spacing(4) },
  taskTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  routeHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stopsPill: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.full },
  routeTicketNo: { fontFamily: 'JetBrainsMono_700Bold', color: brand.primary },
  routeActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(1) },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.full },
  statusPillDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: radius.sm, borderWidth: 1 },
  openBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  noticeCard: { marginBottom: spacing(2.5) },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginBottom: spacing(1.5) },
  noticeDot: { width: 6, height: 6, borderRadius: 3 },
  noticeTag: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  noticeTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(1) },
  gigTeaser: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginTop: spacing(5) },
  gigIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
