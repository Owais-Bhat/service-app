import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';

export interface StatItem {
  label: string;
  value: string | number;
  color?: string;
}

// Compact 2-column summary tiles for the top of a list screen.
export default function StatGrid({ items }: { items: StatItem[] }) {
  const { theme } = useTheme();
  return (
    <View style={styles.grid}>
      {items.map((s) => (
        <View key={s.label} style={[styles.tile, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
          <Text style={[styles.value, { color: s.color || theme.text }]} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>
          <Text style={[styles.label, { color: theme.text3 }]} numberOfLines={1}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5), marginBottom: spacing(3) },
  tile: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5) },
  value: { ...typography.heading, fontSize: 22 },
  label: { ...typography.caption, fontSize: 11, marginTop: 2 },
});
