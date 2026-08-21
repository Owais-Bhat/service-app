import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Icon from './Icon';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  onPress: () => void;
}

// Replaces the `← Back` text link duplicated across every drill-down
// screen (design spec §3, item 2) with one shared component.
export default function BackLink({ onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.row} hitSlop={8}>
      <Icon name="chevron-left" size={16} color={brand.primary} />
      <Text style={styles.label}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing(3), alignSelf: 'flex-start' },
  label: { ...typography.caption, color: brand.primary },
});
