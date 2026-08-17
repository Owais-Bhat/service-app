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
import { fetchAllUsers, fetchOpenInquiries, AdminUserRow, InquiryRow } from '../api/admin';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'more', label: 'More' },
];

// The web app's admin sections not yet ported to mobile — see design
// spec §5/§8. Each becomes a real route in a later phase.
const MORE_SECTIONS = [
  { label: 'Job Cards' },
  { label: 'Finance' },
  { label: 'Discounts' },
  { label: 'Device Tracking' },
  { label: 'Training' },
  { label: 'Media Training' },
  { label: 'Stats' },
  { label: 'Admin Notices' },
  { label: 'Collections' },
  { label: 'AI Assistant' },
  { label: 'Notifications' },
  { label: 'Dashboard Widgets' },
  { label: 'Profile' },
];

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, inq] = await Promise.all([fetchAllUsers(), fetchOpenInquiries()]);
      setUsers(u);
      setInquiries(inq);
      setError(null);
    } catch {
      setError('Could not load dashboard — pull to retry');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const employeeCount = users.filter((u) => u.role === 'employee').length;
  const openCount = inquiries.filter((i) => i.status !== 'resolved' && i.status !== 'case_closed').length;
  const unassignedCount = inquiries.filter((i) => i.assignment_status === 'none' || i.assignment_status === 'pending').length;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={[styles.title, { color: theme.text }]}>Admin</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>{user?.full_name}</Text>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginTop: spacing(3) }]}>{error}</Text> : null}

        <View style={styles.row}>
          <AnimatedStatCard label="Employees" value={employeeCount} accentColor={semantic.success} delayMs={0} />
          <AnimatedStatCard label="Open Tickets" value={openCount} accentColor={semantic.warning} delayMs={100} />
        </View>
        <View style={[styles.row, { marginTop: spacing(3) }]}>
          <AnimatedStatCard label="Needs Assignment" value={unassignedCount} accentColor={semantic.danger} delayMs={200} />
        </View>

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
  caption: { ...typography.caption },
});
