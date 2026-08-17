import React, { useEffect, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';

export interface MoreSheetSection {
  label: string;
}

interface Props {
  visible: boolean;
  sections: MoreSheetSection[];
  onClose: () => void;
}

const DISMISS_DISTANCE = 120;

export default function MoreSheet({ visible, sections, onClose }: Props) {
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(height);
  const scrim = useSharedValue(0);
  const dragStart = useRef(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, springs.drawer);
      scrim.value = withTiming(1, { duration: 220 });
    } else {
      translateY.value = withSpring(height, springs.drawer);
      scrim.value = withTiming(0, { duration: 220 });
    }
  }, [visible, height, translateY, scrim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => {
        dragStart.current = translateY.value;
      },
      onPanResponderMove: (_evt, gesture) => {
        const next = dragStart.current + gesture.dy;
        translateY.value = next < 0 ? 0 : next;
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > 1.2) {
          onClose();
        } else {
          translateY.value = withSpring(0, springs.drawer);
        }
      },
    }),
  ).current;

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrim.value * 0.5,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.sheetWrap, sheetStyle]} {...panResponder.panHandlers}>
        <GlassSurface style={styles.sheet} borderRadius={radius.lg}>
          <View style={[styles.grabber, { backgroundColor: theme.line }]} />
          <Text style={[styles.title, { color: theme.text }]}>More</Text>
          {sections.map((s) => (
            <View key={s.label} style={[styles.row, { borderBottomColor: theme.line }]}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>{s.label}</Text>
              <Text style={[styles.rowMeta, { color: theme.text3 }]}>Coming soon</Text>
            </View>
          ))}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { padding: spacing(5), paddingBottom: spacing(10), borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing(3) },
  title: { ...typography.heading, marginBottom: spacing(3) },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(3), borderBottomWidth: 1 },
  rowLabel: { ...typography.body },
  rowMeta: { ...typography.caption },
});
