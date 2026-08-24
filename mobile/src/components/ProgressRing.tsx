import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import { springs } from '../theme/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
  labelColor: string;
}

// Spring-filled circular progress — used for tutorial completion, same
// "arrives with motion" language as HoursBar / AnimatedStatCard elsewhere.
export default function ProgressRing({ percent, size = 92, strokeWidth = 9, color, trackColor, labelColor }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(percent, springs.move);
  }, [percent, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value / 100),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          fill="none"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={[styles.label, { color: labelColor, fontSize: Math.max(11, Math.round(size * 0.24)), width: size }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {Math.round(percent)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_800ExtraBold', textAlign: 'center' },
});
