import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  label: string;
  value: string | number;
  accentColor?: string;
  delayMs?: number;
}

export default function AnimatedStatCard({ label, value, accentColor = colors.primary, delayMs = 0 }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
    );
  }, [delayMs, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 18 },
      { scale: 0.92 + progress.value * 0.08 },
    ],
  }));

  return (
    <Animated.View style={[styles.card, animatedStyle, { borderColor: accentColor + '55' }]}>
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      <Text style={[typography.title, { color: accentColor, fontSize: 26 }]}>{value}</Text>
      <Text style={typography.caption}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing(4),
    minWidth: 140,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
});
