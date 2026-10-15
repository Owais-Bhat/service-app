import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';

const STATS = [
  { value: '12hr', label: 'Avg. resolution' },
  { value: '4,200+', label: 'Jobs completed' },
  { value: '4.9★', label: 'Customer rating' },
];

// Shown instead of the ad carousel when there are no active ads — mirrors
// web's `.promo` fallback block in the same slot. A flat solid panel (r18):
// glass is reserved for the hero/request cards.
export default function PromoPanel() {
  const { theme } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
      <Text style={[typography.overline, { color: theme.accent }]}>NEST smart security</Text>
      <Text style={[styles.title, { color: theme.text }]}>
        CCTV, networking &amp; automation — installed and supported by experts.
      </Text>
      <View style={styles.statsRow}>
        {STATS.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.accent }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: theme.text3 }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.lg, borderWidth: 1, padding: spacing(4) },
  title: { ...typography.rowTitle, lineHeight: 22, marginTop: spacing(1.5), marginBottom: spacing(4) },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start' },
  statValue: { ...typography.heading, fontSize: 17 },
  statLabel: { ...typography.supporting, fontSize: 12, lineHeight: 16, marginTop: spacing(0.5) },
});
