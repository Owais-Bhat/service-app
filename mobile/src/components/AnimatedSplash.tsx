import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const AnimatedImage = Animated.createAnimatedComponent(Image);

// Shown in place of a bare spinner while the auth session is being restored
// (RootNavigator's `loading` state) — same dark background as the native
// splash screen (app.json) so there's no color flash handing off between them.
export default function AnimatedSplash() {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.72);
  const breathe = useSharedValue(1);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    scale.value = withSpring(1, { damping: 9, stiffness: 90 }, () => {
      breathe.value = withRepeat(
        withSequence(
          withTiming(1.045, { duration: 950, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 950, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
    });
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value * breathe.value }],
  }));

  return (
    <View style={styles.root}>
      <AnimatedImage
        source={require('../../assets/splash-icon.png')}
        style={[styles.logo, style]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#06100b' },
  logo: { width: 190, height: 190 },
});
