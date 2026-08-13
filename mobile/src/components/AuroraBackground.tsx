import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas, Rect, RadialGradient, vec } from '@shopify/react-native-skia';
import { colors } from '../theme';

// Skia radial-gradient blooms over a near-black base — the "Aurora Deep"
// background used behind every screen so the app reads as one continuous
// material instead of separate flat-colored screens.
export default function AuroraBackground() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height} color={colors.bg} />
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={vec(width * 0.78, height * 0.02)} r={width * 0.9} colors={[colors.auroraViolet, 'transparent']} />
        </Rect>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={vec(width * 0.5, height * 0.32)} r={width} colors={[colors.auroraNavy, 'transparent']} />
        </Rect>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={vec(width * 0.28, height * 0.78)} r={width * 0.7} colors={['#0e3a33', 'transparent']} />
        </Rect>
      </Canvas>
    </View>
  );
}
