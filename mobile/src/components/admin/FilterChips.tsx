import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';

export interface ChipItem {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  items: ChipItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

// One-line horizontally scrolling status filter. The count (when given) is the
// number of rows the chip would show, so the filter doubles as a summary.
export default function FilterChips({ items, activeKey, onSelect }: Props) {
  const { theme } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: active ? brand.primary : theme.line, backgroundColor: active ? brand.primary + '22' : theme.panel2 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, { color: active ? brand.primary : theme.text2 }]}>
              {item.label}
              {typeof item.count === 'number' ? `  ${item.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing(2), paddingRight: spacing(4) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3.5), paddingVertical: spacing(2) },
  label: { ...typography.caption, fontSize: 12 },
  pressed: { opacity: 0.7 },
});
