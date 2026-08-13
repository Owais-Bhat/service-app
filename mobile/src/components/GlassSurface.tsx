import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  borderRadius?: number;
}

// Heavier-blur variant of GlassCard for floating chrome — the tab bar and
// sheets — which sit over busier, scrolling content and need a stronger
// separation per the apple-design "bigger surfaces read as thicker" rule.
export default function GlassSurface({ children, style, borderRadius = radius.lg }: Props) {
  return (
    <View style={[styles.wrapper, { borderRadius }, style]}>
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[styles.tint, { borderRadius }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderTopColor: colors.glassHighlight,
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.glassFill,
  },
});
