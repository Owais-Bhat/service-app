import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal as Modal } from './AppModal';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { useAttendanceStatus } from '../context/AttendanceContext';
import { clockIn } from '../api/attendance';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { ApiError } from '../api/client';

// Prompts the employee to clock in for the day. It can be dismissed (Not now /
// back button) so they can still browse task details, but task status
// updates stay disabled until they clock in — tapping a disabled Update
// Status button calls showGate() to bring this back. Only shows while
// there's no clock_in yet today — once set (including after clocking out,
// a completed day) it stays hidden.
//
// Layout follows the design's clock-in primer sheet (e_clock_primer): two
// icon tiles, a Space Grotesk title, reassurance lines, Continue / Not now.
export default function ClockInGateModal() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { attendance, loaded, refresh, gateDismissed, dismissGate } = useAttendanceStatus();
  const [clocking, setClocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wait for a confirmed fetch before ever gating (see AttendanceContext's
  // `loaded` comment) — and once confirmed, gate exactly when there's no
  // clock_in yet today (including no row at all — attendance === null).
  if (!loaded || attendance?.clock_in || gateDismissed) return null;

  const handleClockIn = async () => {
    if (!user) return;
    setClocking(true);
    setError(null);
    try {
      await clockIn(user.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not clock in — check your connection');
    } finally {
      setClocking(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={dismissGate}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissGate} disabled={clocking} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />

          <View style={styles.tiles}>
            <View style={[styles.tile, { backgroundColor: theme.infoS }]}>
              <Icon name="pin" size={22} color={theme.info} />
            </View>
            <View style={[styles.tile, { backgroundColor: theme.okS }]}>
              <Icon name="camera" size={22} color={theme.ok} />
            </View>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Clock in to update tasks</Text>
          <Text style={[styles.body, { color: theme.text2 }]}>
            You need to clock in before you can update any task today. Your location (and a selfie, if your office asks for one) is checked when you clock in.
          </Text>

          {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

          <Pressable
            onPress={handleClockIn}
            disabled={clocking}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, { backgroundColor: pressed ? brand.pressed : brand.fill }, clocking && styles.busy]}
          >
            {clocking ? <ActivityIndicator color="#ffffff" size="small" /> : null}
            <Text style={styles.primaryText}>{clocking ? 'Clocking in…' : 'Clock in now'}</Text>
          </Pressable>
          <Pressable onPress={dismissGate} disabled={clocking} accessibilityRole="button" style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: theme.text2 }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderTopWidth: 1, paddingHorizontal: spacing(5), paddingTop: spacing(2.5), paddingBottom: spacing(9) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing(4.5) },
  tiles: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3.5) },
  tile: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.heading, fontSize: 20, lineHeight: 26 },
  body: { ...typography.body, fontSize: 14, lineHeight: 20, marginTop: spacing(2), marginBottom: spacing(4) },
  error: { ...typography.caption, marginBottom: spacing(3) },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 52, borderRadius: radius.md },
  busy: { opacity: 0.7 },
  primaryText: { ...typography.button, color: '#ffffff' },
  secondary: { height: 48, marginTop: spacing(2), alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
});
