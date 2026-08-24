import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import GlassCard from './GlassCard';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import Icon from './Icon';

const PHONE_DISPLAY = '+91 88991 33144';
const PHONE_TEL = 'tel:+918899133144';
const WHATSAPP_URL =
  'https://wa.me/918899133144?text=' +
  encodeURIComponent('Hello Networking Experts, I need help with a service request.');

// Mirrors web's `.srf-contact-section` — same number, same two actions.
export default function ContactCard() {
  const { theme } = useTheme();
  return (
    <GlassCard>
      <Text style={[styles.kicker, { color: brand.primary }]}>24×7 HELPLINE</Text>
      <Text style={[styles.number, { color: theme.text }]}>{PHONE_DISPLAY}</Text>
      <Text style={[styles.note, { color: theme.text2 }]}>
        Service requests, billing and technician updates.
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => Linking.openURL(PHONE_TEL)}
          style={({ pressed }) => [styles.action, { backgroundColor: theme.surfaceStrong }, pressed && styles.pressed]}
        >
          <Icon name="phone" size={16} color={theme.text} />
          <Text style={[styles.actionLabel, { color: theme.text }]}>Call</Text>
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL(WHATSAPP_URL)}
          style={({ pressed }) => [styles.action, { backgroundColor: `${semantic.success}33` }, pressed && styles.pressed]}
        >
          <Icon name="whatsapp" size={16} color={semantic.success} filled />
          <Text style={[styles.actionLabel, { color: semantic.success }]}>WhatsApp</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  kicker: { ...typography.caption, fontSize: 10, letterSpacing: 2 },
  number: { ...typography.heading, fontSize: 20, marginTop: spacing(1) },
  note: { ...typography.body, fontSize: 12, marginTop: spacing(1), marginBottom: spacing(4) },
  row: { flexDirection: 'row', gap: spacing(3) },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    paddingVertical: spacing(3),
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.75 },
  actionLabel: { ...typography.caption, fontSize: 12 },
});
