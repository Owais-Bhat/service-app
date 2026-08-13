import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import GlassSurface from './GlassSurface';
import { colors, radius, spacing, typography } from '../theme';

export interface TabItem {
  key: string;
  label: string;
}

interface Props {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

// Floating glass bottom tab bar. Generic and config-driven — it doesn't
// know about "Dashboard" or "More" specifically — so later phases can add
// tabs per role without touching this component.
export default function GlassTabBar({ items, activeKey, onSelect }: Props) {
  return (
    <GlassSurface style={styles.wrapper} borderRadius={radius.full}>
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
              <View style={[styles.dot, active && styles.dotActive]} />
              <Text style={[typography.caption, active && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing(4),
    right: spacing(4),
    bottom: spacing(4),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing(3),
  },
  tab: { alignItems: 'center', gap: 4 },
  tabPressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.8, shadowRadius: 6 },
  labelActive: { color: colors.text, fontWeight: '700' },
});
