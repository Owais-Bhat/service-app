import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';
import Icon from './Icon';

export const PHONE_TEL = 'tel:+918899133144';
export const WHATSAPP_URL =
  'https://wa.me/918899133144?text=' +
  encodeURIComponent('Hello Networking Experts, I need help with a service request.');

// Design guest shell: a sticky bottom bar (glass strong, hairline above) with
// the two contact actions side by side — 48 dp, r14, labelled. Same number
// and WhatsApp deep link as web's `.srf-contact-section`. Absolutely
// positioned: the parent screen pads its scroll content to clear it.
export default function ContactCard() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.surfaceStrong, borderTopColor: theme.line, paddingBottom: Math.max(30, insets.bottom + spacing(3)) },
      ]}
    >
      <Pressable
        onPress={() => Linking.openURL(PHONE_TEL)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.action, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && styles.pressed]}
      >
        <Icon name="phone" size={18} color={theme.text} />
        <Text style={[styles.actionLabel, { color: theme.text }]}>Call support</Text>
      </Pressable>
      <Pressable
        onPress={() => Linking.openURL(WHATSAPP_URL)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.action, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && styles.pressed]}
      >
        <Icon name="whatsapp" size={18} color={theme.text} filled />
        <Text style={[styles.actionLabel, { color: theme.text }]}>WhatsApp</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing(2.5),
    paddingTop: spacing(3),
    paddingHorizontal: spacing(4),
    borderTopWidth: 1,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pressed: { opacity: 0.75 },
  actionLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
});
