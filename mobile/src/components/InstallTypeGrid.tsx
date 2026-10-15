import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';

type Tone = 'ok' | 'teal' | 'info' | 'vio' | 'warn';

export interface InstallType {
  key: string;
  label: string;
  tagline: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: Tone;
}

// Labels/taglines ported verbatim from web's INSTALL_TYPES
// (src/pages/landing.js); glyphs and hues follow the NEST guest design.
export const INSTALL_TYPES: InstallType[] = [
  { key: 'cctv', label: 'CCTV Camera Installation', tagline: 'HD/IP cameras, DVR/NVR & remote viewing', icon: 'videocam-outline', tone: 'ok' },
  { key: 'networking', label: 'Networking & LAN Setup', tagline: 'Structured cabling, switches & routers', icon: 'git-network-outline', tone: 'teal' },
  { key: 'wifi', label: 'WiFi / Access Point Setup', tagline: 'Whole-home / office coverage', icon: 'wifi-outline', tone: 'info' },
  { key: 'biometric', label: 'Biometric & Access Control', tagline: 'Fingerprint, RFID & door locks', icon: 'finger-print-outline', tone: 'vio' },
  { key: 'vdp', label: 'Video Door Phone / Intercom', tagline: 'See & speak to visitors', icon: 'tv-outline', tone: 'warn' },
  { key: 'smart-home', label: 'Smart Home Automation', tagline: 'Lights, sensors & smart control', icon: 'home-outline', tone: 'teal' },
];

interface Props {
  onSelect: (type: InstallType) => void;
}

// Design g_install: a section title over a 2-up grid of solid tiles — 44 dp
// tinted icon square, label pinned to the bottom, r20, min height 112.
export default function InstallTypeGrid({ onSelect }: Props) {
  const { theme } = useTheme();
  const tones: Record<Tone, { fg: string; bg: string }> = {
    ok: { fg: theme.ok, bg: theme.okS },
    teal: { fg: theme.teal, bg: theme.tealS },
    info: { fg: theme.info, bg: theme.infoS },
    vio: { fg: theme.vio, bg: theme.vioS },
    warn: { fg: theme.warn, bg: theme.warnS },
  };
  return (
    <View>
      <Text style={[typography.heading, styles.title, { color: theme.text }]}>What would you like installed?</Text>
      <View style={styles.grid}>
        {INSTALL_TYPES.map((t) => {
          const c = tones[t.tone];
          return (
            <Pressable
              key={t.key}
              onPress={() => onSelect(t)}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              style={({ pressed }) => [
                styles.card,
                { borderColor: theme.border, backgroundColor: theme.panel },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: c.bg }]}>
                <Ionicons name={t.icon} size={22} color={c.fg} />
              </View>
              <Text style={[styles.label, { color: theme.text }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing(1), marginBottom: spacing(3) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48.5%',
    flexGrow: 1,
    minHeight: 112,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'space-between',
    gap: 10,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 18 },
});
