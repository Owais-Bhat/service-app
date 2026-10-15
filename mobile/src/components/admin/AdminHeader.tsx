import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackLink from '../BackLink';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

// In-flow header for admin screens. Design redline: header = safe area + 44
// row + 10; back 44 x 44, title 18/24 Space Grotesk on pushed screens and
// 24/30 on a root screen. No clock-in strip — that is the employee portal's.
export default function AdminHeader({ title, subtitle, onBack, right }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const pushed = !!onBack;
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + (pushed ? 0 : spacing(2)), borderBottomColor: theme.line, backgroundColor: theme.surfaceStrong }]}>
      <View style={styles.row}>
        {onBack ? <View style={styles.back}><BackLink onPress={onBack} /></View> : null}
        <View style={styles.titleCol}>
          <Text style={[pushed ? typography.heading : typography.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: theme.text3 }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing(4), paddingBottom: spacing(2.5), borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), minHeight: 44 },
  back: { marginRight: spacing(1) },
  titleCol: { flex: 1, minWidth: 0 },
  subtitle: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
});
