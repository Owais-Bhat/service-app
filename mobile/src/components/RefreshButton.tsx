import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme';
import Icon from './Icon';

interface Props {
  spinning: boolean;
  onPress: () => void;
}

// Shared by every header that offers a manual refresh (Dashboard + the
// other employee tabs via AppHeaderBar) — was previously a private
// component duplicated only inside EmployeeDashboardScreen.
export default function RefreshButton({ spinning, onPress }: Props) {
  const { theme } = useTheme();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.linear }), -1, false);
    } else {
      rotation.value = 0;
    }
  }, [spinning, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={spinning}
      style={({ pressed }) => [
        styles.iconBtn,
        { borderColor: theme.line, backgroundColor: theme.panel2 },
        pressed && styles.pressed,
      ]}
      hitSlop={8}
      accessibilityLabel="Refresh"
    >
      <Animated.View style={animatedStyle}>
        <Icon name="refresh" size={16} color={theme.text2} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
