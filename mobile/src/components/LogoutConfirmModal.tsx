import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { semantic } from '../theme/tokens';

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
}

// Replaces the plain native Alert.alert confirm with the same animated
// glass-card language as ClockInGateModal / TaskStatusModal — a spring
// zoom-in card instead of a flat OS dialog.
export default function LogoutConfirmModal({ onCancel, onConfirm }: Props) {
  const { theme } = useTheme();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Animated.View entering={ZoomIn.duration(320).springify().damping(15).mass(0.85)} style={styles.cardWrap}>
          <GlassSurface style={styles.card} borderRadius={radius.lg}>
            <View style={[styles.iconChip, { backgroundColor: `${semantic.danger}24` }]}>
              <Icon name="logout" size={24} color={semantic.danger} filled />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>Log Out?</Text>
            <Text style={[styles.body, { color: theme.text3 }]}>
              You'll need to sign in again to access your account.
            </Text>

            <View style={styles.actions}>
              <PressScale onPress={onCancel} style={{ flex: 1 }}>
                <View style={[styles.cancelBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                  <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
                </View>
              </PressScale>
              <PressScale onPress={onConfirm} style={{ flex: 1 }}>
                <View style={[styles.confirmBtn, { backgroundColor: semantic.danger, shadowColor: semantic.danger }]}>
                  <Icon name="logout" size={15} color="#fff" filled />
                  <Text style={styles.confirmBtnText}>Log Out</Text>
                </View>
              </PressScale>
            </View>
          </GlassSurface>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  cardWrap: { width: '100%', maxWidth: 380 },
  card: { width: '100%', padding: spacing(6), alignItems: 'center' },
  iconChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  title: { ...typography.heading, fontSize: 18, marginBottom: spacing(1.5), textAlign: 'center' },
  body: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: spacing(5) },
  actions: { flexDirection: 'row', gap: spacing(2.5), width: '100%' },
  cancelBtn: { height: 48, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 48, borderRadius: radius.md, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  confirmBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
});
