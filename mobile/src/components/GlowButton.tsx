import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
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
import Icon from './Icon';
import { IconName } from '../theme/icons';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
}

const HEIGHT = 52;

// Skia-rendered gradient background with a Reanimated-driven pulsing glow —
// the two animation systems doing what each is best at: Skia for the GPU
// shader-drawn gradient, Reanimated for the UI-thread opacity/scale pulse.
export default function GlowButton({ label, onPress, disabled, loading, icon }: Props) {
  const pulse = useSharedValue(0.6);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.5 : pulse.value,
    transform: [{ scale: 0.98 + pulse.value * 0.02 }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      onLayout={handleLayout}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
    >
      {width > 0 && (
        <Animated.View style={[styles.canvasWrap, glowStyle]}>
          <Canvas style={StyleSheet.absoluteFill}>
            <RoundedRect x={0} y={0} width={width} height={HEIGHT} r={radius.md}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(width, HEIGHT)}
                colors={[brand.primary, brand.primaryGradientEnd]}
              />
            </RoundedRect>
          </Canvas>
        </Animated.View>
      )}
      <View style={styles.content}>
        {icon && !loading && <Icon name={icon} size={17} color="#ffffff" />}
        <Text style={[typography.heading, styles.label]}>{loading ? 'Please wait…' : label}</Text>
      </View>
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
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  label: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
