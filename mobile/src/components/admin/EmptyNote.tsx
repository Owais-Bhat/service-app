import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon';
import { IconName } from '../../theme/icons';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';

interface Props {
  text: string;
  icon?: IconName;
}

export default function EmptyNote({ text, icon = 'tasks' }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      <Icon name={icon} size={28} color={theme.text3} />
      <Text style={[styles.text, { color: theme.text3 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing(2), paddingVertical: spacing(10) },
  text: { ...typography.body, textAlign: 'center' },
});
