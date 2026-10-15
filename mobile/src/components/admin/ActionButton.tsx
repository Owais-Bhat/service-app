import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import PressScale from '../PressScale';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';

type Tone = 'primary' | 'success' | 'danger' | 'neutral';

interface Props {
  label: string;
  onPress: () => void;
  tone?: Tone;
  busy?: boolean;
  disabled?: boolean;
  /** Fill the remaining row width (footer button pairs). */
  grow?: boolean;
}

// List-row and form action. Design buttons: primary/success are filled
// Primary 600, danger is filled red, neutral is the bordered secondary.
// 48 dp touch height, r14, Manrope 700.
export default function ActionButton({ label, onPress, tone = 'primary', busy, disabled, grow = true }: Props) {
  const { theme } = useTheme();
  const filled = tone !== 'neutral';
  const bg = tone === 'danger' ? '#c42c47' : tone === 'neutral' ? theme.panel : brand.fill;
  const fg = filled ? '#ffffff' : theme.text;
  const off = !!disabled && !busy;
  return (
    <PressScale onPress={onPress} disabled={busy || disabled} style={grow ? styles.grow : undefined}>
      <View
        style={[
          styles.btn,
          { backgroundColor: off ? theme.panel2 : bg, borderColor: filled ? 'transparent' : theme.border },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <Text style={[styles.label, { color: off ? theme.text3 : fg }]} numberOfLines={1}>{label}</Text>
        )}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  btn: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing(3) },
  label: { ...typography.button, fontSize: 14, textAlign: 'center' },
});
