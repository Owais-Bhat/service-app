import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import Icon from './Icon';
import { IconName } from '../theme/icons';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  variant?: Variant;
}

const HEIGHT = 52;
const DANGER_FILL = '#c42c47';

// The design's button: 52 dp, r14, Manrope 700 15. Primary is filled with
// Primary 600 (#0F8A4C) so white text clears AA-large, Primary 700 when
// pressed; there is no glow or gradient.
export default function GlowButton({ label, onPress, disabled, loading, icon, variant = 'primary' }: Props) {
  const { theme } = useTheme();
  const inactive = !!disabled && !loading;
  const fg = inactive ? theme.text3 : variant === 'secondary' ? theme.text : variant === 'tertiary' ? theme.accent : '#ffffff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => {
        let backgroundColor: string = brand.fill;
        let borderColor = 'transparent';
        if (variant === 'primary') backgroundColor = pressed ? brand.pressed : brand.fill;
        if (variant === 'danger') backgroundColor = DANGER_FILL;
        if (variant === 'secondary') { backgroundColor = theme.panel; borderColor = theme.border; }
        if (variant === 'tertiary') backgroundColor = 'transparent';
        if (inactive) { backgroundColor = theme.panel2; borderColor = 'transparent'; }
        return [styles.wrapper, { backgroundColor, borderColor }, pressed && !inactive && styles.pressed];
      }}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color="#ffffff" /> : null}
        {icon && !loading ? <Icon name={icon} size={18} color={fg} /> : null}
        <Text style={[typography.button, { color: fg }]}>{loading ? 'Please wait…' : label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing(2),
    paddingHorizontal: spacing(4),
  },
  pressed: { transform: [{ scale: 0.98 }] },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2) },
});
