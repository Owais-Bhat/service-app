import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, RadialGradient, SweepGradient, vec } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  size?: number;
}

// Not used by any screen under the NEST design — NEST's KPI/stat cards use
// a plain icon chip, not a floating 3D orb (see AnimatedStatCard). Kept as
// a working Skia component (the same self-blur/gradient technique NEST's
// own conic-gradient course-progress rings use) for a future screen.
export default function AccentOrb({ size = 28 }: Props) {
  const { theme } = useTheme();
  const tilt = useSharedValue(0);

  useEffect(() => {
    tilt.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [tilt]);

  const wobbleStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 200 },
      { rotateX: `${tilt.value * 10 - 5}deg` },
      { rotateY: `${tilt.value * 14 - 7}deg` },
    ],
  }));

  const r = size / 2;

  return (
    <Animated.View style={[{ width: size, height: size }, wobbleStyle]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={r} cy={r} r={r}>
          <SweepGradient c={vec(r, r)} colors={['#15a05a', '#7c5cfc', '#0ea5a5', '#15a05a']} />
        </Circle>
        <Circle cx={r} cy={r} r={r * 0.62} color={theme.bg} />
        <Circle cx={r * 0.7} cy={r * 0.65} r={r * 0.22}>
          <RadialGradient c={vec(r * 0.7, r * 0.65)} r={r * 0.22} colors={['rgba(255,255,255,0.85)', 'transparent']} />
        </Circle>
      </Canvas>
    </Animated.View>
  );
}
