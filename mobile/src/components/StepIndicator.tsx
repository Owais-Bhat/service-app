import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  steps: string[];
  activeIndex: number;
}

// Design stepper: a 4 dp bar per step (accent up to the active one), and
// under it a state glyph + "n. Label" — done is a filled check, active a
// radio dot, upcoming an empty ring.
export default function StepIndicator({ steps, activeIndex }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      {steps.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        const color = active ? theme.text : done ? theme.accent : theme.text3;
        const glyph = done ? 'checkmark-circle' : active ? 'radio-button-on' : 'ellipse-outline';
        return (
          <View key={label} style={styles.col}>
            <View style={[styles.bar, { backgroundColor: i <= activeIndex ? theme.accent : theme.line }]} />
            <View style={styles.labelRow}>
              <Ionicons name={glyph} size={13} color={color} />
              <Text style={[styles.label, { color }]} numberOfLines={1}>{i + 1}. {label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  col: { flex: 1, gap: 6 },
  bar: { height: 4, borderRadius: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11, lineHeight: 15, flexShrink: 1 },
});
