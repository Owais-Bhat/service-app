import React, { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import { useAuth } from '../context/AuthContext';
import { useAttendanceStatus } from '../context/AttendanceContext';
import { clockInGig, clockInFixed } from '../api/attendance';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { ApiError } from '../api/client';

// Blocks the whole app until the employee clocks in for the day — no
// backdrop dismiss, no back-button dismiss (onRequestClose is a no-op), and
// it renders as a full-screen native Modal so it sits above every screen
// and the tab bar regardless of which one is currently active underneath.
// Only gates "hasn't clocked in at all today" — once clock_in is set
// (including after clocking out, a completed day) it stays hidden.
export default function ClockInGateModal() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { attendance, loaded, refresh } = useAttendanceStatus();
  const [clocking, setClocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wait for a confirmed fetch before ever gating (see AttendanceContext's
  // `loaded` comment) — and once confirmed, gate exactly when there's no
  // clock_in yet today (including no row at all — attendance === null).
  if (!loaded || attendance?.clock_in) return null;

  const handleClockIn = async () => {
    if (!user) return;
    setClocking(true);
    setError(null);
    try {
      if (user.worker_type === 'gig') await clockInGig(user.id);
      else await clockInFixed();
      await refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not clock in — check your connection';
      setError(
        message.toLowerCase().includes('photo')
          ? "Photo clock-in isn't supported in the mobile app yet — use the web app."
          : message,
      );
    } finally {
      setClocking(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.card} borderRadius={radius.lg}>
          <View style={[styles.iconChip, { backgroundColor: `${brand.primary}24` }]}>
            <Icon name="clock" size={26} color={brand.primary} filled />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Clock In Required</Text>
          <Text style={[styles.body, { color: theme.text3 }]}>
            You need to clock in before you can use the app today.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PressScale onPress={handleClockIn} disabled={clocking} style={{ width: '100%' }}>
            <View style={[styles.clockBtn, { backgroundColor: brand.primary, opacity: clocking ? 0.7 : 1 }]}>
              {clocking ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Icon name="clock" size={16} color="#fff" filled />
              )}
              <Text style={styles.clockBtnText}>{clocking ? 'Clocking in…' : 'Clock In Now'}</Text>
            </View>
          </PressScale>
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  card: { width: '100%', maxWidth: 380, padding: spacing(6), alignItems: 'center' },
  iconChip: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  title: { ...typography.heading, fontSize: 18, marginBottom: spacing(1.5), textAlign: 'center' },
  body: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: spacing(4) },
  error: { color: semantic.danger, fontSize: 12, textAlign: 'center', marginBottom: spacing(3) },
  clockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 48, borderRadius: radius.md, width: '100%' },
  clockBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
});
