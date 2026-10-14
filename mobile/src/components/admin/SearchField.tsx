import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Icon from '../Icon';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export default function SearchField({ value, onChangeText, placeholder = 'Search' }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
      <Icon name="search" size={16} color={theme.text3} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.text3}
        style={[styles.input, { color: theme.text }]}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search">
          <Icon name="close" size={16} color={theme.text3} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 44 },
  input: { ...typography.body, flex: 1, paddingVertical: 0 },
});
