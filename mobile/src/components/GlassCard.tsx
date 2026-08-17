import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  /** NEST applies the drop shadow selectively (e.g. task rows), not to every card. */
  shadow?: boolean;
}

// Maps to NEST's `--surface` material: a blurred hero-style container.
export default function GlassCard({ children, style, shadow = false }: Props) {
  const { theme, mode } = useTheme();
  return (
    <View style={[styles.wrapper, { borderColor: theme.border }, shadow && styles.shadow, style]}>
      <BlurView intensity={mode === 'dark' ? 40 : 55} tint={mode} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface }]} pointerEvents="none" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.5,
    shadowRadius: 34,
    elevation: 8,
  },
  content: { padding: spacing(4) },
});
