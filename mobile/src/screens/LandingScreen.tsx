import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlowButton from '../components/GlowButton';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, categoryColors, DEFAULT_CATEGORY_STYLE } from '../theme/tokens';

interface Props {
  onStaffLogin: () => void;
  onGoSubmit: () => void;
  onGoTrack: () => void;
}

const SERVICES: { label: string; cat: string }[] = [
  { label: 'CCTV', cat: 'CCTV' },
  { label: 'Networking', cat: 'Networking' },
  { label: 'Biometric & Access', cat: 'Access Control / Biometric' },
  { label: 'Gate Automation', cat: 'Gate Automation' },
  { label: 'VDP Installation', cat: 'Video Door Phone' },
];

const STATS = [
  { value: '4.8★', label: 'Rated' },
  { value: '500+', label: 'Installs' },
  { value: '12hr', label: 'SLA' },
];

// The app's real public entry point (design spec §3): a marketing/
// self-service front door, with staff sign-in reached via a button rather
// than being the default screen. No role-picker here — role comes from
// who successfully authenticates on LoginScreen, not a user's own claim.
export default function LandingScreen({ onStaffLogin, onGoSubmit, onGoTrack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(10), paddingHorizontal: spacing(5) }}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoChip}>
              <Text style={styles.logoLetter}>N</Text>
            </View>
            <Text style={[styles.wordmark, { color: theme.text }]}>NEST</Text>
          </View>
          <Pressable
            onPress={onStaffLogin}
            style={({ pressed }) => [
              styles.loginButton,
              { borderColor: theme.line, backgroundColor: theme.panel2 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.loginButtonText, { color: theme.text2 }]}>Staff Login</Text>
          </Pressable>
        </View>

        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>Resolved in 12 hours, guaranteed</Text>
        </View>

        <Text style={[styles.headline, { color: theme.text }]}>Reliable CCTV, Networking & Access Control</Text>
        <Text style={[styles.subcopy, { color: theme.text2 }]}>
          Installation, service &amp; AMC for CCTV, networking, biometric access and gate automation — one call away.
        </Text>

        <GlowButton label="Raise a Service Request" onPress={onGoSubmit} />
        <Pressable
          onPress={onGoTrack}
          style={({ pressed }) => [
            styles.trackButton,
            { backgroundColor: theme.panel2, borderColor: theme.line },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.trackButtonText, { color: theme.text }]}>Track Your Ticket</Text>
        </Pressable>

        <Panel style={styles.statsRow}>
          {STATS.map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.text3 }]}>{s.label}</Text>
            </View>
          ))}
        </Panel>

        <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Our Services</Text>
        <View style={styles.grid}>
          {SERVICES.map((s) => {
            const c = categoryColors[s.cat] || DEFAULT_CATEGORY_STYLE;
            return (
              <Panel key={s.label} style={styles.serviceRow}>
                <View style={[styles.serviceIcon, { backgroundColor: c.bg }]}>
                  <Text style={[styles.serviceIconText, { color: c.color }]}>{c.initials}</Text>
                </View>
                <Text style={[styles.serviceLabel, { color: theme.text }]}>{s.label}</Text>
              </Panel>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(5) },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  logoChip: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary },
  logoLetter: { ...typography.heading, color: '#ffffff', fontSize: 16 },
  wordmark: { ...typography.heading, fontSize: 18 },
  loginButton: { paddingHorizontal: spacing(4), paddingVertical: spacing(2.5), borderRadius: radius.md, borderWidth: 1 },
  loginButtonText: { ...typography.caption, fontSize: 12 },
  pressed: { opacity: 0.7 },
  badge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(1.75),
    borderRadius: radius.full,
    backgroundColor: 'rgba(21,160,90,0.14)',
    marginBottom: spacing(4),
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: brand.primary },
  badgeText: { ...typography.caption, color: brand.primary, fontSize: 12 },
  headline: { ...typography.title, marginBottom: spacing(3) },
  subcopy: { ...typography.body, marginBottom: spacing(5) },
  trackButton: { padding: spacing(4), borderRadius: radius.md, borderWidth: 1, alignItems: 'center', marginTop: spacing(1), marginBottom: spacing(6) },
  trackButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing(6) },
  statItem: { alignItems: 'center' },
  statValue: { ...typography.heading, color: brand.primary, fontSize: 20 },
  statLabel: { ...typography.caption, fontSize: 11, marginTop: spacing(0.5) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(3) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5) },
  serviceRow: { width: '47%', flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  serviceIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  serviceIconText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  serviceLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12, flexShrink: 1 },
});
