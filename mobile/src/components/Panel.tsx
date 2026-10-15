import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

// The design's solid panel (--pn): flat, unblurred, r18 — for dense lists,
// forms and secondary info blocks. Glass (GlassCard) is limited to headers,
// sheets, tab bars and hero cards, and never sits on glass.
export default function Panel({ children, style }: Props) {
  const { theme } = useTheme();
  return <View style={[styles.wrapper, { backgroundColor: theme.panel, borderColor: theme.border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: radius.lg, borderWidth: 1, padding: spacing(3.5) },
});
