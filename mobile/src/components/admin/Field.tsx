import React from 'react';
import { KeyboardTypeOptions, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  hint?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Mask the text — passwords. */
  secure?: boolean;
}

// Labelled text input used by every admin form.
export default function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, hint, autoCapitalize, secure }: Props) {
  const { theme } = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color: theme.text3 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.text3}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secure}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.line, backgroundColor: theme.panel2 },
          multiline && styles.multiline,
        ]}
      />
      {hint ? <Text style={[styles.hint, { color: theme.text3 }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, fontSize: 12, marginBottom: spacing(1.5) },
  input: { ...typography.body, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), minHeight: 44 },
  multiline: { minHeight: 88 },
  hint: { ...typography.caption, fontSize: 11, marginTop: spacing(1) },
});
