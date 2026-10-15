import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme';

export interface ToolHeaderAction {
  icon: IconName;
  label: string;
  /** Visible text beside the icon (design: "Reset", "Today", "Read all"). */
  text?: string;
  /** Defaults to the muted text colour; pass theme.accent for the primary action. */
  color?: string;
  onPress: () => void;
}

interface Props {
  title: string;
  subtitle?: string;
  onBack: () => void;
  actions?: ToolHeaderAction[];
}

// The design's in-flow screen header for employee tool screens: a 44 dp back
// chevron, Space Grotesk 18 title with a 12 dp muted subtitle, and optional
// 44 dp-tall text/icon actions on the right, over a solid bar with a hairline.
// Sits above the screen's ScrollView (not absolutely positioned).
export default function ToolHeader({ title, subtitle, onBack, actions }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 4, backgroundColor: theme.surfaceStrong, borderBottomColor: theme.line }]}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={4}>
        <Icon name="chevron-left" size={24} color={theme.text} />
      </Pressable>
      <View style={styles.titles}>
        <Text style={[typography.heading, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.sub, { color: theme.text3 }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {actions?.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={a.label}
        >
          <Icon name={a.icon} size={22} color={a.color ?? theme.text2} />
          {a.text ? <Text style={[styles.actionText, { color: a.color ?? theme.text2 }]}>{a.text}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: 1 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0 },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16 },
  action: { height: 44, minWidth: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  pressed: { opacity: 0.6 },
});
