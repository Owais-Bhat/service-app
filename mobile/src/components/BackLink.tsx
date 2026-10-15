import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme';

interface Props {
  onPress: () => void;
}

// Design back control: a 44 x 44 chevron button, left-aligned, no text.
export default function BackLink({ onPress }: Props) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.btn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={4}>
      <Icon name="chevron-left" size={24} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing(2.5), marginBottom: spacing(1), alignSelf: 'flex-start' },
});
