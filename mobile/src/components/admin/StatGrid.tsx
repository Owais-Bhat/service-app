import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';

export interface StatItem {
  label: string;
  value: string | number;
  color?: string;
}

// Design metric card: solid panel, r18, 14 dp padding — a 12/600 label above
// a 26 JetBrains Mono KPI. Two across, wraps.
export default function StatGrid({ items }: { items: StatItem[] }) {
  const { theme } = useTheme();
  return (
    <View style={styles.grid}>
      {items.map((s) => (
        <View key={s.label} style={[styles.tile, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.text2 }]} numberOfLines={1}>{s.label}</Text>
          <Text style={[styles.value, { color: s.color || theme.text }]} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5), marginBottom: spacing(3) },
  tile: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5) },
  label: { ...typography.caption, fontSize: 12 },
  value: { ...typography.kpi, marginTop: 2 },
});
