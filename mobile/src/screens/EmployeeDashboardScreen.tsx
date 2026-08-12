import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedStatCard from '../components/AnimatedStatCard';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';
import { fetchMyTickets, fetchTodayAttendance, AttendanceRow, TicketRow } from '../api/employee';

export default function EmployeeDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(10), paddingHorizontal: spacing(4) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={typography.title}>Hi, {user?.full_name?.split(' ')[0] || 'there'}</Text>
      <Text style={typography.caption}>{user?.worker_type === 'gig' ? 'Gig worker' : 'Fixed employee'}</Text>

      {error ? <Text style={{ color: colors.danger, marginTop: spacing(3) }}>{error}</Text> : null}

      <View style={styles.row}>
        <AnimatedStatCard
          label={clockedIn ? 'Clocked In' : 'Not Clocked In'}
          value={clockedIn ? '●' : '○'}
          accentColor={clockedIn ? colors.success : colors.textDim}
          delayMs={0}
        />
        <AnimatedStatCard label="Open Tickets" value={openTickets} accentColor={colors.warning} delayMs={100} />
      </View>

      <Text style={[typography.heading, { marginTop: spacing(6), marginBottom: spacing(2) }]}>My Tickets</Text>
      {tickets.length === 0 ? (
        <Text style={typography.caption}>No tickets assigned right now.</Text>
      ) : (
        tickets.slice(0, 8).map((t) => (
          <View key={t.id} style={styles.ticketRow}>
            <Text style={typography.body}>#{t.id.slice(0, 8)}</Text>
            <Text style={[typography.caption, { textTransform: 'capitalize' }]}>{t.status}</Text>
          </View>
        ))
      )}

      <GlowButton label="Sign Out" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
