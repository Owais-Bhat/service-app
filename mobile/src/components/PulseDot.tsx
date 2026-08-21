import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';

interface Props {
  color: string;
  size?: number;
}

// A small looping "live status" dot — matches the glow-pulse treatment
// from the liquid-glass reference (opacity 0.65→1, scale 1→1.35, looping).
// A plain looping timing animation, not a spring — springs settle to a
// target, which isn't what an infinite ambient pulse needs.
export default function PulseDot({ color, size = 7 }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.65 + progress.value * 0.35,
    transform: [{ scale: 1 + progress.value * 0.35 }],
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animatedStyle]} />
      <View style={[styles.core, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
  core: {},
});
