import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme';
import Icon from './Icon';

export default function ThemeToggleButton() {
  const { theme, mode, toggleTheme } = useTheme();
  return (
    <Pressable
      onPress={toggleTheme}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: theme.line, backgroundColor: theme.panel2 },
        pressed && styles.pressed,
      ]}
      hitSlop={8}
      accessibilityLabel="Toggle light/dark theme"
    >
      <Icon name={mode === 'dark' ? 'sun' : 'moon'} size={17} color={theme.text2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
