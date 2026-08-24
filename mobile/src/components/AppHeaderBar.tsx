import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackLink from './BackLink';
import Icon from './Icon';
import PulseDot from './PulseDot';
import NotificationBell from './NotificationBell';
import RefreshButton from './RefreshButton';
import ThemeToggleButton from './ThemeToggleButton';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { useAttendanceStatus } from '../context/AttendanceContext';
import { useAuth } from '../context/AuthContext';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  unread?: number;
  onOpenNotifications?: () => void;
  onLayout?: (height: number) => void;
}

// Fixed header used across every employee tab (Dashboard, Manage Tasks, Job
// Tools, Attendance, Earnings, Profile) so the same greeting/action chrome
// AND the same live date/time/location/clock-status strip show up
// everywhere — not just buried in Dashboard's clock-in card.
export default function AppHeaderBar({ title, subtitle, onBack, onRefresh, refreshing, unread, onOpenNotifications, onLayout }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { attendance } = useAttendanceStatus();
  const { logout } = useAuth();
  const [now, setNow] = useState(new Date());

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clockedIn = !!attendance?.clock_in && !attendance?.clock_out;
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <View
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.height)}
      style={[styles.wrap, { paddingTop: insets.top + spacing(3), borderColor: theme.line, backgroundColor: theme.bg }]}
    >
      {onBack ? <BackLink onPress={onBack} /> : null}

      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.caption, { color: theme.text3 }]}>{subtitle}</Text> : null}
        </View>
        <View style={styles.actions}>
          {onRefresh ? <RefreshButton spinning={!!refreshing} onPress={onRefresh} /> : null}
          {onOpenNotifications ? <NotificationBell unread={unread || 0} onPress={onOpenNotifications} /> : null}
          <ThemeToggleButton />
          <Pressable
            onPress={confirmLogout}
            style={({ pressed }) => [styles.logoutBtn, { backgroundColor: semantic.danger }, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityLabel="Log out"
          >
            <Icon name="logout" size={16} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <Icon name="calendar" size={12} color={theme.text3} />
          <Text style={[styles.statusText, { color: theme.text3 }]}>{dateStr}</Text>
        </View>
        <View style={styles.statusItem}>
          <Icon name="clock" size={12} color={theme.text3} />
          <Text style={[styles.statusText, styles.statusMono, { color: theme.text3 }]}>{timeStr}</Text>
        </View>
        <View style={styles.statusItem}>
          {clockedIn ? <PulseDot color={brand.primary} size={6} /> : <View style={[styles.staticDot, { backgroundColor: theme.text3 }]} />}
          <Text style={[styles.statusText, { color: clockedIn ? brand.primary : theme.text3 }]}>{clockedIn ? 'Clocked in' : 'Clocked out'}</Text>
        </View>
        {attendance?.location ? (
          <View style={[styles.statusItem, { flex: 1, minWidth: 0 }]}>
            <Icon name="pin" size={12} color={theme.text3} />
            <Text style={[styles.statusText, { color: theme.text3 }]} numberOfLines={1}>{attendance.location}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, borderBottomWidth: 1, paddingHorizontal: spacing(4), paddingBottom: spacing(3) },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2) },
  title: { ...typography.title, fontSize: 22 },
  caption: { ...typography.caption },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginTop: spacing(2.5), flexWrap: 'wrap' },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) },
  statusText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  statusMono: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 11 },
  staticDot: { width: 6, height: 6, borderRadius: 3 },
  logoutBtn: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
