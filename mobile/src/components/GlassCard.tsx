import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

// The standard card / form / list-row container for the glass design
// system — real native backdrop blur (expo-blur), not a faked
// translucent box, per the design spec's "real blur, not faked" call.
export default function GlassCard({ children, style }: Props) {
  return (
    <View style={[styles.wrapper, style]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} pointerEvents="none" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderTopColor: colors.glassHighlight,
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.glassFill,
  },
  content: {
    padding: spacing(4),
  },
});
