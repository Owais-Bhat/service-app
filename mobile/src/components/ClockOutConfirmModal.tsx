import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal as Modal } from './AppModal';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
  /** ISO time the shift started — shown in the summary when given. */
  since?: string | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Guards against an accidental tap on the clock toggle. Design (e_clockout):
// a bottom sheet with a summary block, Cancel (flex 1) and Clock out (flex 1.4).
export default function ClockOutConfirmModal({ onCancel, onConfirm, since }: Props) {
  const { theme } = useTheme();
  const now = new Date().toISOString();
  const mins = since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000)) : 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text style={[styles.title, { color: theme.text }]}>Clock out at {fmt(now)}?</Text>
          <Text style={[styles.body, { color: theme.text2 }]}>
            This ends today's shift. You can't clock in again until tomorrow.
          </Text>

          {since ? (
            <View style={[styles.summary, { backgroundColor: theme.panel2 }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.text2 }]}>Shift</Text>
                <Text style={[styles.summaryValue, { color: theme.text }]}>
                  {fmt(since)} – {fmt(now)} · {Math.floor(mins / 60)}h {String(mins % 60).padStart(2, '0')}m
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, { flex: 1, borderColor: theme.border, borderWidth: 1 }, pressed && styles.pressed]}
            >
              <Text style={[styles.btnText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, { flex: 1.4, backgroundColor: pressed ? brand.pressed : brand.fill }]}
            >
              <Text style={[styles.btnText, { color: '#ffffff' }]}>Clock out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderTopWidth: 1, paddingHorizontal: spacing(5), paddingTop: spacing(2.5), paddingBottom: spacing(9) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing(4.5) },
  title: { ...typography.heading, fontSize: 20, lineHeight: 26 },
  body: { ...typography.body, fontSize: 14, lineHeight: 20, marginTop: spacing(1.5), marginBottom: spacing(4) },
  summary: { borderRadius: 16, paddingHorizontal: spacing(3.5), paddingVertical: spacing(3), marginBottom: spacing(4.5) },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(3) },
  summaryLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 14 },
  summaryValue: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 13, flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: spacing(3) },
  btn: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { ...typography.button },
  pressed: { opacity: 0.8 },
});
