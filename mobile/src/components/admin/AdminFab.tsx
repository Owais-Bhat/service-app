import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../Icon';
import { IconName } from '../../theme/icons';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';

interface Props {
  label: string;
  onPress: () => void;
  icon?: IconName;
  accessibilityLabel?: string;
}

// The List template's floating action: 56 dp, r18, Primary 600, icon + label,
// pinned bottom-right. Render it as a sibling of AdminScreen inside a flex:1
// View so it floats over the scrolling list.
export default function AdminFab({ label, onPress, icon = 'add', accessibilityLabel }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      style={({ pressed }) => [styles.fab, { backgroundColor: pressed ? brand.pressed : brand.fill, bottom: insets.bottom + spacing(5) }]}
    >
      <Icon name={icon} size={20} color="#ffffff" />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing(4),
    height: 56,
    paddingHorizontal: spacing(5),
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  label: { ...typography.button, color: '#ffffff' },
});
