import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import Icon from './Icon';
import { IconName } from '../theme/icons';

export interface TabItem {
  key: string;
  label: string;
  // Optional so screens outside this phase's scope (e.g. AdminDashboardScreen)
  // keep their current generic-dot look unchanged.
  icon?: IconName;
}

interface Props {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

// NEST's tab bar is opaque (background: var(--bg), no border, no blur) with
// a neumorphic drop shadow — a different material from the glass surfaces.
// RN can't do the dual light+dark shadow or a true inset shadow on one
// View, so this approximates: one outer drop shadow, and a solid two-tone
// fill instead of an inset shadow for the active icon (design spec §5.3).
export default function GlassTabBar({ items, activeKey, onSelect }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.wrapper,
        {
          bottom: spacing(3.5) + insets.bottom,
          backgroundColor: theme.bg,
          shadowColor: theme.neuDark,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 10,
        },
      ]}
    >
      <View style={styles.row}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
              hitSlop={8}
            >
              <View style={[styles.iconWrap, active && { backgroundColor: theme.neuDark }]}>
                {item.icon ? (
                  <Icon name={item.icon} size={20} color={active ? brand.primary : theme.text3} />
                ) : (
                  <View style={[styles.dot, { borderColor: active ? brand.primary : theme.text3 }]} />
                )}
              </View>
              <Text style={[styles.label, { color: active ? brand.primary : theme.text3 }]}>{item.label}</Text>
              <View style={[styles.indicator, active && { backgroundColor: brand.primary }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing(3),
    right: spacing(3),
    borderRadius: radius.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(1.5),
  },
  tab: { alignItems: 'center', gap: 6, flex: 1 },
  tabPressed: { opacity: 0.7 },
  iconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  label: { ...typography.caption, fontSize: 11 },
  indicator: { width: 16, height: 3, borderRadius: 2, marginTop: 2, backgroundColor: 'transparent' },
});
