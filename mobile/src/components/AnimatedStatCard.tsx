import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';

interface Props {
  label: string;
  value: string | number;
  accentColor?: string;
  delayMs?: number;
}

// Same public API as before (label/value/accentColor/delayMs) — dashboard
// call sites don't change. The 3D AccentOrb is gone: NEST's own KPI cards
// use a plain colored icon chip with a simple glyph, so that's what this
// renders instead (see design spec §6).
export default function AnimatedStatCard({ label, value, accentColor, delayMs = 0 }: Props) {
  const { theme, mode } = useTheme();
  const color = accentColor || theme.text;
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
    <Animated.View style={[styles.card, { borderColor: theme.border }, animatedStyle]}>
      <BlurView intensity={mode === 'dark' ? 40 : 55} tint={mode} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface }]} pointerEvents="none" />
      <View style={[styles.iconChip, { backgroundColor: color + '29' }]}>
        <View style={[styles.iconDot, { borderColor: color }]} />
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={[styles.label, { color: theme.text3 }]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing(4), minWidth: 140, overflow: 'hidden' },
  iconChip: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  iconDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 2 },
  value: { ...typography.title, fontSize: 26 },
  label: { ...typography.caption },
});
