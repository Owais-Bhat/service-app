import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { categoryColors, CategoryStyle } from '../theme/tokens';

export interface InstallType {
  key: string;
  label: string;
  tagline: string;
  style: CategoryStyle;
}

// Ported verbatim (labels/taglines) from web's INSTALL_TYPES
// (src/pages/landing.js) — colors mapped onto the app's existing
// categoryColors where a direct match exists, reused creatively where it
// doesn't (WiFi/AP -> Networking's teal, Smart Home -> Gate Automation's
// amber) rather than introducing new hues.
export const INSTALL_TYPES: InstallType[] = [
  { key: 'cctv', label: 'CCTV Camera Installation', tagline: 'HD/IP cameras, DVR/NVR & remote viewing', style: categoryColors.CCTV },
  { key: 'networking', label: 'Networking & LAN Setup', tagline: 'Structured cabling, switches & routers', style: categoryColors.Networking },
  { key: 'wifi', label: 'WiFi / Access Point Setup', tagline: 'Whole-home / office coverage', style: categoryColors.Networking },
  { key: 'biometric', label: 'Biometric & Access Control', tagline: 'Fingerprint, RFID & door locks', style: categoryColors['Access Control / Biometric'] },
  { key: 'vdp', label: 'Video Door Phone / Intercom', tagline: 'See & speak to visitors', style: categoryColors['Video Door Phone'] },
  { key: 'smart-home', label: 'Smart Home Automation', tagline: 'Lights, sensors & smart control', style: categoryColors['Gate Automation'] },
];

interface Props {
  onSelect: (type: InstallType) => void;
}

export default function InstallTypeGrid({ onSelect }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.grid}>
      {INSTALL_TYPES.map((t) => (
        <Pressable
          key={t.key}
          onPress={() => onSelect(t)}
          style={({ pressed }) => [
            styles.card,
            { borderColor: theme.line, backgroundColor: theme.panel2 },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: t.style.bg }]}>
            <Text style={[styles.initials, { color: t.style.color }]}>{t.style.initials}</Text>
          </View>
          <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>{t.label}</Text>
          <Text style={[styles.tagline, { color: theme.text3 }]} numberOfLines={2}>{t.tagline}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5) },
  card: { width: '47%', borderRadius: radius.md, borderWidth: 1, padding: spacing(3.5), gap: spacing(1.5) },
  pressed: { opacity: 0.75 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  label: { ...typography.caption, fontSize: 12 },
  tagline: { ...typography.body, fontSize: 10.5, lineHeight: 14 },
});
