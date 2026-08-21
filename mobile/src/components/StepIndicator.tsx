import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  steps: string[];
  activeIndex: number;
}

// Mirrors web's `.stepper` — a labelled progress bar above the request
// wizard's active step.
export default function StepIndicator({ steps, activeIndex }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      {steps.map((label, i) => {
        const on = i <= activeIndex;
        return (
          <View key={label} style={styles.col}>
            <View
              style={[
                styles.bar,
                { backgroundColor: on ? brand.primary : theme.line },
                i === activeIndex && { shadowColor: brand.primary, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
              ]}
            />
            <Text style={[styles.label, { color: on ? brand.primary : theme.text3 }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(4) },
  col: { flex: 1, gap: spacing(1.5) },
  bar: { height: 4, borderRadius: 2 },
  label: { ...typography.caption, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
});
