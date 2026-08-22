import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import Icon from './Icon';
import { IconName } from '../theme/icons';

export interface SegmentedTabItem {
  key: string;
  label: string;
  icon: IconName;
}

interface Props {
  items: SegmentedTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

// Glass segmented control for the landing screen's 4 request modes —
// mirrors web's `.srf-mode-tab` row. Distinct from GlassTabBar (that one's
// the app's persistent bottom nav chrome); this is a same-screen mode
// switch, so it reads as a panel within the surrounding glass card.
export default function SegmentedTabs({ items, activeKey, onSelect }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.panel2 }]}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [
              styles.tab,
              active && { backgroundColor: theme.surfaceStrong },
              pressed && styles.pressed,
            ]}
            hitSlop={4}
          >
            <Icon name={item.icon} size={15} color={active ? brand.primary : theme.text3} />
            <Text style={[styles.label, { color: active ? brand.primary : theme.text3 }]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing(1),
    gap: spacing(1),
  },
  tab: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(2.5),
    borderRadius: radius.sm,
  },
  pressed: { opacity: 0.7 },
  label: { ...typography.caption, fontSize: 11 },
});
