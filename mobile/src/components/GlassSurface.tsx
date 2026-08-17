import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  borderRadius?: number;
}

// Maps to NEST's `--surfaceStrong` material: the heavier blur used for the
// role-sheet/sidebar-drawer look. Only MoreSheet uses this now — the tab
// bar switched to an opaque neumorphic chrome (see GlassTabBar), matching
// NEST's own distinction between the two.
export default function GlassSurface({ children, style, borderRadius = radius.lg }: Props) {
  const { theme, mode } = useTheme();
  return (
    <View style={[styles.wrapper, { borderRadius, borderColor: theme.border }, style]}>
      <BlurView intensity={mode === 'dark' ? 55 : 70} tint={mode} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surfaceStrong, borderRadius }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderWidth: 1, overflow: 'hidden' },
});
