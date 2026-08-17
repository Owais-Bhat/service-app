import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Canvas, RoundedRect, LinearGradient, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const HEIGHT = 52;

// Skia-rendered gradient background with a Reanimated-driven pulsing glow —
// the two animation systems doing what each is best at: Skia for the GPU
// shader-drawn gradient, Reanimated for the UI-thread opacity/scale pulse.
export default function GlowButton({ label, onPress, disabled, loading }: Props) {
  const pulse = useSharedValue(0.6);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.5 : pulse.value,
    transform: [{ scale: 0.98 + pulse.value * 0.02 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
    >
      <Animated.View style={[styles.canvasWrap, glowStyle]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <RoundedRect x={0} y={0} width={320} height={HEIGHT} r={radius.md}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(320, HEIGHT)}
              colors={[brand.primary, brand.primaryGradientEnd]}
            />
          </RoundedRect>
        </Canvas>
      </Animated.View>
      <Text style={[typography.heading, styles.label]}>{loading ? 'Please wait…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: HEIGHT,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing(2),
  },
  pressed: { transform: [{ scale: 0.97 }] },
  canvasWrap: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  label: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
