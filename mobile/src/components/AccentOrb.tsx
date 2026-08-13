import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, SweepGradient, RadialGradient, vec } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors } from '../theme';

interface Props {
  size?: number;
}

// The "3D accent" decoration for dashboard cards (design spec §4). This is
// deliberately Skia (a shader-drawn sweep-gradient ring + specular
// highlight, idly tilted via Reanimated) rather than a real three.js
// Canvas per card — mounting a separate WebGL context per visible card
// would hurt performance and risks crashes on lower-end Android once a
// screen has several cards on it at once. NetworkScene3D remains the one
// genuine three.js scene in the app, on the login screen only.
export default function AccentOrb({ size = 28 }: Props) {
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
          <SweepGradient c={vec(r, r)} colors={[colors.primary, colors.accentViolet, colors.accentCyan, colors.primary]} />
        </Circle>
        <Circle cx={r} cy={r} r={r * 0.62} color={colors.auroraNavy} />
        <Circle cx={r * 0.7} cy={r * 0.65} r={r * 0.22}>
          <RadialGradient c={vec(r * 0.7, r * 0.65)} r={r * 0.22} colors={['rgba(255,255,255,0.85)', 'transparent']} />
        </Circle>
      </Canvas>
    </Animated.View>
  );
}
