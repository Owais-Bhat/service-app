import React, { ReactNode } from 'react';
import { Pressable, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface Props {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

// Shared "3D" tactile press feedback — springs down on press-in, back up on
// release, instead of a flat opacity dim. Used anywhere a button should feel
// physically pressable (Manage Tasks actions, status modal Save/Accept/Decline).
export default function PressScale({ children, onPress, disabled, style }: Props) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        disabled={disabled}
        onPressIn={() => { scale.value = withSpring(0.94, { damping: 14, stiffness: 300 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 220 }); }}
        onPress={onPress}
        style={disabled ? { opacity: 0.6 } : undefined}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
