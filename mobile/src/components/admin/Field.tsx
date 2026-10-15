import React, { useState } from 'react';
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
  /** Shows the red asterisk. */
  required?: boolean;
  /** Inline validation message; turns the border red. */
  error?: string;
  /** Read-only, dashed and muted (e.g. a GSTIN that cannot change). */
  locked?: boolean;
}

// Labelled text input used by every admin form. Design: 52 dp, r14, border
// --bd on --p2; focus = 1.5 dp accent border with a soft ring; error = red.
export default function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, hint, autoCapitalize, secure, required, error, locked }: Props) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const ring = focused && !error;
  return (
    <View>
      <Text style={[styles.label, { color: locked ? theme.text3 : theme.text2 }]}>
        {label}
        {required ? <Text style={{ color: theme.err }}> *</Text> : null}
      </Text>
      <View style={[styles.ringWrap, ring && { backgroundColor: theme.okS }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.text3}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secure}
          editable={!locked}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[
            styles.input,
            {
              color: locked ? theme.text3 : theme.text,
              borderColor: error ? theme.err : ring ? theme.accent : theme.border,
              borderWidth: error || ring ? 1.5 : 1,
              backgroundColor: locked ? 'transparent' : theme.panel2,
              borderStyle: locked ? 'dashed' : 'solid',
            },
            multiline && styles.multiline,
          ]}
        />
      </View>
      {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}
      {hint && !error ? <Text style={[styles.hint, { color: theme.text3 }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, marginBottom: spacing(1.5) },
  // The ring is a 3 dp halo around the input, since RN has no box-shadow spread.
  ringWrap: { borderRadius: radius.md + 3, padding: 3, margin: -3 },
  input: { ...typography.body, fontFamily: 'Manrope_500Medium', borderRadius: radius.md, paddingHorizontal: spacing(3.5), paddingVertical: spacing(2.5), minHeight: 52 },
  multiline: { minHeight: 96, paddingTop: spacing(3) },
  hint: { ...typography.supporting, fontSize: 12, marginTop: spacing(1.5) },
  error: { ...typography.caption, fontFamily: 'Manrope_600SemiBold', fontSize: 12, marginTop: spacing(1.5) },
});
