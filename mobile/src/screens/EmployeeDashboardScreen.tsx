import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedStatCard from '../components/AnimatedStatCard';
import MeshBackground from '../components/MeshBackground';
import GlassTabBar from '../components/GlassTabBar';
import MoreSheet from '../components/MoreSheet';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { semantic } from '../theme/tokens';
import { fetchMyTickets, fetchTodayAttendance, AttendanceRow, TicketRow } from '../api/employee';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'more', label: 'More' },
];

// The web app's employee-relevant sections not yet ported to mobile — see
// design spec §5/§8. Each becomes a real route in a later phase.
const MORE_SECTIONS = [
  { label: 'Job Cards' },
  { label: 'Device Tracking' },
  { label: 'Training' },
  { label: 'Media Training' },
  { label: 'Notifications' },
  { label: 'Profile' },
];

export default function EmployeeDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

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
            value={clockedIn ? '●' : '○'}
            accentColor={clockedIn ? semantic.success : theme.text3}
            delayMs={0}
          />
          <AnimatedStatCard label="Open Tickets" value={openTickets} accentColor={semantic.warning} delayMs={100} />
        </View>

        <Text style={[styles.heading, { color: theme.text, marginTop: spacing(6), marginBottom: spacing(2) }]}>My Tickets</Text>
        {tickets.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No tickets assigned right now.</Text>
        ) : (
          tickets.slice(0, 8).map((t) => (
            <View key={t.id} style={[styles.ticketRow, { borderBottomColor: theme.line }]}>
              <Text style={[styles.body, { color: theme.text }]}>#{t.id.slice(0, 8)}</Text>
              <Text style={[styles.caption, { color: theme.text3, textTransform: 'capitalize' }]}>{t.status}</Text>
            </View>
          ))
        )}

        <GlowButton label="Sign Out" onPress={logout} />
      </ScrollView>

      <GlassTabBar
        items={TABS}
        activeKey={moreVisible ? 'more' : 'dashboard'}
        onSelect={(key) => setMoreVisible(key === 'more')}
      />
      <MoreSheet visible={moreVisible} sections={MORE_SECTIONS} onClose={() => setMoreVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
  title: { ...typography.title },
  heading: { ...typography.heading },
  body: { ...typography.body },
  caption: { ...typography.caption },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(2),
    borderBottomWidth: 1,
  },
});
