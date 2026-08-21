import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import Icon from '../components/Icon';
import { IconName } from '../theme/icons';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onOpenLeaderboard: () => void;
  onOpenTraining: () => void;
  onOpenTutorials: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
}

const MENU: { key: string; label: string; icon?: IconName }[] = [
  { key: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
  { key: 'training', label: 'Training Courses', icon: 'training' },
  { key: 'tutorials', label: 'Tutorials', icon: 'tutorial' },
  { key: 'notifications', label: 'Notifications', icon: 'notification' },
  { key: 'settings', label: 'Settings' },
];

export default function ProfileScreen({
  onGoDashboard,
  onGoAttendance,
  onGoJobTools,
  onGoEarnings,
  onOpenLeaderboard,
  onOpenTraining,
  onOpenTutorials,
  onOpenNotifications,
  onOpenSettings,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();

  const initials = (user?.full_name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const openRow = (key: string) => {
    if (key === 'leaderboard') onOpenLeaderboard();
    else if (key === 'training') onOpenTraining();
    else if (key === 'tutorials') onOpenTutorials();
    else if (key === 'notifications') onOpenNotifications();
    else onOpenSettings();
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{user?.full_name}</Text>
          <Text style={[styles.caption, { color: theme.text3 }]}>{user?.email}</Text>
        </View>

        {MENU.map((item) => (
          <Pressable key={item.key} onPress={() => openRow(item.key)} style={({ pressed }) => [pressed && styles.pressed]}>
            <Panel style={styles.row}>
              <View style={styles.rowLeft}>
                {item.icon ? (
                  <View style={styles.rowIconChip}>
                    <Icon name={item.icon} size={16} color={brand.primary} />
                  </View>
                ) : null}
                <Text style={[styles.rowLabel, { color: theme.text }]}>{item.label}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={theme.text3} />
            </Panel>
          </Pressable>
        ))}

        <Pressable onPress={logout} style={({ pressed }) => [pressed && styles.pressed]}>
          <View style={styles.logoutRow}>
            <Text style={styles.logoutText}>Log Out</Text>
          </View>
        </Pressable>
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey="profile"
        onSelect={(key) => {
          if (key === 'dashboard') onGoDashboard();
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'jobtools') onGoJobTools();
          else if (key === 'earnings') onGoEarnings();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: 'center', marginBottom: spacing(6) },
  avatar: { width: 68, height: 68, borderRadius: 20, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  avatarText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, color: '#ffffff' },
  name: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17 },
  caption: { ...typography.caption, marginTop: spacing(0.5) },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(2.5) },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  rowIconChip: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(21,160,90,0.14)' },
  rowLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(4),
    borderRadius: 16,
    backgroundColor: 'rgba(240,85,109,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(240,85,109,0.25)',
    marginTop: spacing(2),
  },
  logoutText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: brand.danger },
});
