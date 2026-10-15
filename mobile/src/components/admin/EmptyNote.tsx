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

// Design empty state: a dashed r20 card, icon at 28, one line of copy.
export default function EmptyNote({ text, icon = 'tasks' }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <Icon name={icon} size={28} color={theme.text3} />
      <Text style={[styles.text, { color: theme.text2 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing(2), padding: spacing(5), marginVertical: spacing(4), borderWidth: 1, borderStyle: 'dashed', borderRadius: 20 },
  text: { ...typography.supporting, textAlign: 'center' },
});
