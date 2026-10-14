import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '../../theme';

interface Props {
  label: string;
  color: string;
}

export default function StatusBadge({ label, color }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '24' }]}>
      <Text style={[styles.text, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.full, paddingHorizontal: spacing(2.5), paddingVertical: 3, alignSelf: 'flex-start' },
  text: { ...typography.caption, fontSize: 11 },
});
