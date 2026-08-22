import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import GlassCard from './GlassCard';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

const STATS = [
  { value: '12hr', label: 'Avg. resolution' },
  { value: '4,200+', label: 'Jobs completed' },
  { value: '4.9★', label: 'Customer rating' },
];

// Shown instead of the ad carousel when there are no active ads — mirrors
// web's `.promo` fallback block in the same slot.
export default function PromoPanel() {
  const { theme } = useTheme();
  return (
    <GlassCard>
      <Text style={[styles.tag, { color: brand.primary }]}>NEST SMART SECURITY</Text>
      <Text style={[styles.title, { color: theme.text }]}>
        CCTV, networking &amp; automation — installed and supported by experts.
      </Text>
      <View style={styles.statsRow}>
        {STATS.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={[styles.statValue, { color: brand.primary }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: theme.text3 }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  tag: { ...typography.caption, fontSize: 10, letterSpacing: 1.5, marginBottom: spacing(2) },
  title: { ...typography.heading, fontSize: 16, lineHeight: 22, marginBottom: spacing(4) },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start' },
  statValue: { ...typography.heading, fontSize: 16 },
  statLabel: { ...typography.caption, fontSize: 10, marginTop: spacing(0.5) },
});
