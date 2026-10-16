import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeyboardHeight } from './KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme';
import Icon from './Icon';
import { IconName } from '../theme/icons';

export interface TabItem {
  key: string;
  label: string;
  // Optional so screens outside this phase's scope keep a generic-dot look.
  icon?: IconName;
}

interface Props {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Admin portal uses the tighter 3-tab bar (r20); employees the 5-tab (r26). */
  variant?: 'employee' | 'admin';
}

// Design navigation: a floating bar on --sfs with a hairline border and the
// one allowed shadow. Each tab is 56 dp; the selected one gets the soft green
// pill, the filled icon and a bold label. Unselected tabs use outline icons
// and --t2.
export default function GlassTabBar({ items, activeKey, onSelect, variant = 'employee' }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const admin = variant === 'admin';
  // A floating bar would ride up over the field being typed in, so it steps
  // aside while the keyboard is open.
  if (useKeyboardHeight() > 0) return null;
  return (
    <View
      style={[
        styles.wrapper,
        {
          bottom: spacing(3) + insets.bottom,
          backgroundColor: theme.surfaceStrong,
          borderColor: theme.border,
          borderRadius: admin ? 20 : 26,
          shadowColor: '#000',
          gap: admin ? 6 : 0,
        },
      ]}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        const color = active ? theme.accent : theme.text2;
        return (
          <Pressable
            key={item.key}
            onPress={() => onSelect(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            style={({ pressed }) => [
              styles.tab,
              { borderRadius: admin ? 18 : 20, backgroundColor: active ? theme.okS : 'transparent' },
              pressed && styles.tabPressed,
            ]}
          >
            {item.icon ? (
              <Icon name={item.icon} size={24} color={color} filled={active} />
            ) : (
              <View style={[styles.dot, { borderColor: color }]} />
            )}
            <Text style={[styles.label, { color, fontFamily: active ? 'Manrope_700Bold' : 'Manrope_600SemiBold' }]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing(4),
    right: spacing(4),
    flexDirection: 'row',
    padding: 6,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  tab: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabPressed: { opacity: 0.7 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  label: { fontSize: 11, lineHeight: 14 },
});
