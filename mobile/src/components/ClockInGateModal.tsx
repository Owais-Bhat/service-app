import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import { useAuth } from '../context/AuthContext';
import { useAttendanceStatus } from '../context/AttendanceContext';
import { clockIn } from '../api/attendance';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { ApiError } from '../api/client';

// Prompts the employee to clock in for the day. It can be closed (X /
// back button) so they can still browse task details, but task status
// updates stay disabled until they clock in — tapping a disabled Update
// Status button calls showGate() to bring this back. Only shows while
// there's no clock_in yet today — once set (including after clocking out,
// a completed day) it stays hidden.
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
    <Modal visible transparent animationType="fade" onRequestClose={dismissGate}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.card} borderRadius={radius.lg}>
          <Pressable onPress={dismissGate} disabled={clocking} hitSlop={10} style={[styles.closeBtn, { backgroundColor: theme.panel2 }]}>
            <Icon name="close" size={16} color={theme.text3} />
          </Pressable>
          <View style={[styles.iconChip, { backgroundColor: `${brand.primary}24` }]}>
            <Icon name="clock" size={26} color={brand.primary} filled />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Clock In Required</Text>
          <Text style={[styles.body, { color: theme.text3 }]}>
            You need to clock in before you can update any task today.
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
  closeBtn: { position: 'absolute', top: spacing(3), right: spacing(3), width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  iconChip: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  title: { ...typography.heading, fontSize: 18, marginBottom: spacing(1.5), textAlign: 'center' },
  body: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: spacing(4) },
  error: { color: semantic.danger, fontSize: 12, textAlign: 'center', marginBottom: spacing(3) },
  clockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 48, borderRadius: radius.md, width: '100%' },
  clockBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
});
