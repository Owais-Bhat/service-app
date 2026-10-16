import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../Icon';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned under the scrolling form: Save / Cancel buttons. */
  footer?: React.ReactNode;
}

// Bottom sheet for admin forms and details. The body scrolls inside the sheet
// and the footer stays pinned; there is no KeyboardAvoidingView on purpose —
// the window resizes on Android and the body is scrollable, so a focused field
// can always be reached.
export default function FormSheet({ visible, title, subtitle, onClose, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.border, paddingBottom: insets.bottom + spacing(3) }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={[styles.subtitle, { color: theme.text3 }]} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Icon name="close" size={20} color={theme.text2} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1, paddingTop: spacing(2.5), paddingHorizontal: spacing(5) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing(3.5) },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(3) },
  headText: { flex: 1, minWidth: 0 },
  title: { ...typography.heading },
  subtitle: { ...typography.caption, marginTop: 2 },
  body: { flexGrow: 0 },
  bodyContent: { paddingBottom: spacing(4), gap: spacing(3) },
  footer: { flexDirection: 'row', gap: spacing(3), paddingTop: spacing(3) },
});
