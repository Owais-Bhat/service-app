import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlassTabBar, { tabBarSpace } from '../components/GlassTabBar';
import AppHeaderBar from '../components/AppHeaderBar';
import Icon from '../components/Icon';
import { IconName } from '../theme/icons';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';

interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onGoJobTools: () => void;
  onGoEarnings: () => void;
  onOpenLeaderboard: () => void;
  onOpenBonusReviews: () => void;
  onOpenTraining: () => void;
  onOpenTutorials: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
}

type MenuItem = { key: string; label: string; icon: IconName };

const GROUPS: MenuItem[][] = [
  [
    { key: 'account', label: 'Account details & password', icon: 'user' },
    { key: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
    { key: 'bonus-reviews', label: 'Bonus Reviews', icon: 'star' },
    { key: 'training', label: 'Training Courses', icon: 'training' },
    { key: 'tutorials', label: 'Tutorials', icon: 'tutorial' },
  ],
  [
    { key: 'notifications', label: 'Notifications', icon: 'notification' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ],
];

export default function ProfileScreen({
  onGoDashboard,
  onGoAttendance,
  onGoJobTools,
  onGoEarnings,
  onOpenLeaderboard,
  onOpenBonusReviews,
  onOpenTraining,
  onOpenTutorials,
  onOpenNotifications,
  onOpenSettings,
  onOpenAccount,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [headerHeight, setHeaderHeight] = useState(0);

  const initials = (user?.full_name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const openRow = (key: string) => {
    if (key === 'leaderboard') onOpenLeaderboard();
    else if (key === 'bonus-reviews') onOpenBonusReviews();
    else if (key === 'training') onOpenTraining();
    else if (key === 'tutorials') onOpenTutorials();
    else if (key === 'notifications') onOpenNotifications();
    else if (key === 'account') onOpenAccount();
    else onOpenSettings();
  };

  const topInset = headerHeight > 0 ? headerHeight : insets.top + 100;
  const roleLine = [
    user?.role === 'team_lead' ? 'Team lead' : 'Technician',
    user?.worker_type === 'gig' ? 'Gig' : 'Fixed',
  ].join(' · ');

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Profile" onOpenNotifications={onOpenNotifications} onLayout={setHeaderHeight} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset + spacing(4), paddingBottom: tabBarSpace(insets.bottom) }]}>
        <GlassCard>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: theme.okS }]}>
              <Text style={[styles.avatarText, { color: theme.accent }]}>{initials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{user?.full_name}</Text>
              <Text style={[styles.supporting, { color: theme.text2 }]} numberOfLines={1}>{roleLine}</Text>
              {user?.email ? <Text style={[styles.contact, { color: theme.text3 }]} numberOfLines={1}>{user.email}</Text> : null}
            </View>
          </View>
        </GlassCard>

        {GROUPS.map((group, gi) => (
          <View key={gi} style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            {group.map((item, i) => (
              <Pressable
                key={item.key}
                onPress={() => openRow(item.key)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, i < group.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }, pressed && styles.pressed]}
              >
                <Icon name={item.icon} size={20} color={theme.text2} />
                <Text style={[styles.rowLabel, { color: theme.text }]}>{item.label}</Text>
                <Icon name="chevron-right" size={18} color={theme.text3} />
              </Pressable>
            ))}
          </View>
        ))}

        <Pressable
          onPress={logout}
          accessibilityRole="button"
          style={({ pressed }) => [styles.signOut, { borderColor: theme.err, backgroundColor: theme.errS }, pressed && styles.pressed]}
        >
          <Icon name="logout" size={18} color={theme.err} />
          <Text style={[styles.signOutText, { color: theme.err }]}>Sign out</Text>
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
  content: { paddingBottom: spacing(30), paddingHorizontal: spacing(4), gap: spacing(5) },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3.5) },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22 },
  name: { ...typography.heading, fontSize: 20, lineHeight: 26 },
  supporting: { ...typography.supporting },
  contact: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, marginTop: 2 },
  panel: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), minHeight: 56, paddingHorizontal: spacing(3.5), paddingVertical: spacing(3) },
  rowLabel: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 15 },
  pressed: { opacity: 0.7 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 52, borderRadius: radius.md, borderWidth: 1 },
  signOutText: { ...typography.button },
});
