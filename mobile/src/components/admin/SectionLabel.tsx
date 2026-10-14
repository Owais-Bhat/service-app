import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';

export default function SectionLabel({ children }: { children: string }) {
  const { theme } = useTheme();
  return <Text style={[styles.label, { color: theme.text3 }]}>{children.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  label: { ...typography.caption, fontSize: 11, letterSpacing: 1, marginTop: spacing(5), marginBottom: spacing(2) },
});
