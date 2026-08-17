import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

// Maps to NEST's `--panel2` material: flat, unblurred — used for list rows
// and secondary info blocks. GlassCard (blurred, `--surface`) is the other
// tier; NEST consistently uses both, unlike the single-tier Aurora system.
export default function Panel({ children, style }: Props) {
  const { theme } = useTheme();
  return <View style={[styles.wrapper, { backgroundColor: theme.panel2, borderColor: theme.line }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: radius.md, borderWidth: 1, padding: spacing(4) },
});
