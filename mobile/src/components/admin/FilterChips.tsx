import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../KeyboardAware';
import Icon from '../Icon';
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
// Design: selected chips are filled Primary 600 with a check; unselected sit
// on the solid panel with a border. 36 dp tall.
export default function FilterChips({ items, activeKey, onSelect }: Props) {
  const { theme } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const fg = active ? '#ffffff' : theme.text;
        return (
          <Pressable
            key={item.key}
            onPress={() => onSelect(item.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.chip,
              active
                ? { backgroundColor: brand.fill, borderColor: brand.fill }
                : { backgroundColor: theme.panel, borderColor: theme.border },
              pressed && styles.pressed,
            ]}
          >
            {active ? <Icon name="check" size={14} color={fg} /> : null}
            <Text style={[styles.label, { color: fg }]}>{item.label}</Text>
            {typeof item.count === 'number' ? (
              <Text style={[styles.count, { color: fg, opacity: active ? 0.85 : 0.6 }]}>{item.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing(2), paddingRight: spacing(4) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), height: 36, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3) },
  label: { ...typography.caption, fontFamily: 'Manrope_700Bold' },
  count: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  pressed: { opacity: 0.75 },
});
