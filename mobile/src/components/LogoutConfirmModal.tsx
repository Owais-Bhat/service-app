import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal as Modal } from './AppModal';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
}

// Confirm before signing out. A bottom sheet (design: r28, grabber) with the
// same 52 dp Cancel / confirm pair as the other confirmation sheets; the
// destructive action is tinted with the error tokens, not a brand fill.
export default function LogoutConfirmModal({ onCancel, onConfirm }: Props) {
  const { theme } = useTheme();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text style={[styles.title, { color: theme.text }]}>Sign out?</Text>
          <Text style={[styles.body, { color: theme.text2 }]}>You'll need to sign in again to access your account.</Text>

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
              style={({ pressed }) => [
                styles.btn,
                { flex: 1.4, backgroundColor: theme.errS, borderColor: theme.err, borderWidth: 1 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.btnText, { color: theme.err }]}>Sign out</Text>
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
  body: { ...typography.body, fontSize: 14, lineHeight: 20, marginTop: spacing(1.5), marginBottom: spacing(5) },
  actions: { flexDirection: 'row', gap: spacing(3) },
  btn: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { ...typography.button },
  pressed: { opacity: 0.8 },
});
