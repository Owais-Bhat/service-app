import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurMask, Canvas, Circle } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

// Alpha-blends a hex color with an 0-1 opacity by appending an 8-digit hex
// alpha suffix — React Native's color parser supports #RRGGBBAA.
function withOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}

interface BlobProps {
  size: number;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  color: string;
  duration: number;
}

// One floating, self-blurred circle — NEST's ".nest-blob" (CSS blur(50px) +
// a ping-pong translate/scale float). Skia's BlurMask is the RN equivalent
// of a shape blurring its own edges (expo-blur only blurs what's *behind*
// a view, which isn't what a glowing blob needs). Durations differ per
// blob (20s/24s/26s) so they drift out of phase naturally — CSS's negative
// animation-delay trick (start already partway through the cycle) has no
// clean Reanimated equivalent, so this is the practical substitute.
function Blob({ size, left, top, right, bottom, color, duration }: BlobProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [reducedMotion, duration, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * size * 0.04 },
      { translateY: progress.value * size * 0.05 },
      { scale: 1 + progress.value * 0.15 },
    ],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size, left, top, right, bottom }, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} color={color}>
          <BlurMask blur={25} style="normal" />
        </Circle>
      </Canvas>
    </Animated.View>
  );
}

export default function MeshBackground() {
  const { theme } = useTheme();

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, overflow: 'hidden' }]} pointerEvents="none">
      <Blob size={220} left={-60} top={-40} color={withOpacity('#15a05a', theme.meshOp)} duration={20000} />
      <Blob size={200} right={-50} top={120} color={withOpacity('#0ea5a5', theme.meshOp2)} duration={24000} />
      <Blob size={180} left={40} bottom={60} color={withOpacity('#6366f1', theme.meshOp3)} duration={26000} />
    </View>
  );
}
