import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import AccentOrb from './AccentOrb';
import { colors, radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';

interface Props {
  label: string;
  value: string | number;
  accentColor?: string;
  delayMs?: number;
}

// Same public API as before this pass (label/value/accentColor/delayMs) —
// dashboard call sites don't change. Internals move from a flat surface +
// fixed-duration timing curve to GlassCard-style glass + a spring entrance,
// per the design system's motion rules (critically-damped default, no
// fixed-duration animation on anything that mounts/moves).
export default function AnimatedStatCard({ label, value, accentColor = colors.primary, delayMs = 0 }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delayMs, withSpring(1, springs.move));
  }, [delayMs, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 18 },
      { scale: 0.92 + progress.value * 0.08 },
    ],
  }));

  return (
    <Animated.View style={[styles.card, animatedStyle]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} pointerEvents="none" />
      <View style={styles.orbSlot}>
        <AccentOrb size={26} />
      </View>
      <Text style={[typography.title, { color: accentColor, fontSize: 26 }]}>{value}</Text>
      <Text style={typography.caption}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderTopColor: colors.glassHighlight,
    padding: spacing(4),
    minWidth: 140,
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.glassFill,
  },
  orbSlot: {
    position: 'absolute',
    top: spacing(2),
    right: spacing(2),
  },
});
