import React from 'react';
import { StyleSheet, Text } from 'react-native';
import PressScale from '../PressScale';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';

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

const TONE: Record<Tone, string> = {
  primary: brand.primary,
  success: semantic.success,
  danger: semantic.danger,
  neutral: '#6d8278',
};

// Compact outlined action used in list-row footers (Approve / Reject / Mark paid).
export default function ActionButton({ label, onPress, tone = 'primary', busy, disabled, grow = true }: Props) {
  const color = TONE[tone];
  return (
    <PressScale onPress={onPress} disabled={busy || disabled} style={grow ? styles.grow : undefined}>
      <Text style={[styles.btn, { color, borderColor: color, backgroundColor: color + '1f' }]}>
        {busy ? '…' : label}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  btn: { ...typography.caption, fontFamily: 'Manrope_700Bold', textAlign: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing(2.5), overflow: 'hidden' },
});
