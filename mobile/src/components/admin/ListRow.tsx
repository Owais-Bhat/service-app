import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon';
import StatusBadge from './StatusBadge';
import { IconName } from '../../theme/icons';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';

interface Props {
  title: string;
  subtitle?: string;
  /** A second muted line (date, ticket number…). */
  meta?: string;
  /** Right-aligned strong value, e.g. an amount. */
  value?: string;
  valueColor?: string;
  badge?: { label: string; color: string };
  icon?: IconName;
  iconColor?: string;
  onPress?: () => void;
  /** Action buttons rendered under the text. */
  footer?: React.ReactNode;
}

// The list card used by every admin list: optional icon chip, two text lines,
// a value + badge column on the right, and an optional action footer.
export default function ListRow({ title, subtitle, meta, value, valueColor, badge, icon, iconColor, onPress, footer }: Props) {
  const { theme } = useTheme();
  const tint = iconColor || brand.primary;
  const body = (
    <>
      <View style={styles.top}>
        {icon ? (
          <View style={[styles.iconChip, { backgroundColor: tint + '22' }]}>
            <Icon name={icon} size={18} color={tint} />
          </View>
        ) : null}
        <View style={styles.text}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: theme.text2 }]} numberOfLines={2}>{subtitle}</Text> : null}
          {meta ? <Text style={[styles.meta, { color: theme.text3 }]} numberOfLines={1}>{meta}</Text> : null}
        </View>
        {value || badge ? (
          <View style={styles.right}>
            {value ? <Text style={[styles.value, { color: valueColor || theme.text }]} numberOfLines={1}>{value}</Text> : null}
            {badge ? <StatusBadge label={badge.label} color={badge.color} /> : null}
          </View>
        ) : null}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  const cardStyle = [styles.card, { backgroundColor: theme.panel2, borderColor: theme.line }];
  if (!onPress) return <View style={cardStyle}>{body}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...cardStyle, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5), marginBottom: spacing(2.5) },
  pressed: { opacity: 0.75 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  iconChip: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  subtitle: { ...typography.caption, marginTop: 2 },
  meta: { ...typography.caption, fontSize: 11, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: spacing(1.5), maxWidth: '40%' },
  value: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  footer: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(3) },
});
