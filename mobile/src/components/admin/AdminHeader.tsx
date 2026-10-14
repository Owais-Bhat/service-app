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

// In-flow header for admin screens. Unlike AppHeaderBar it carries no
// clock-in strip — that belongs to the employee portal.
export default function AdminHeader({ title, subtitle, onBack, right }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing(3), borderBottomColor: theme.line, backgroundColor: theme.bg }]}>
      {onBack ? <BackLink onPress={onBack} /> : null}
      <View style={styles.row}>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: theme.text3 }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing(4), paddingBottom: spacing(3), borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  titleCol: { flex: 1, minWidth: 0 },
  title: { ...typography.title, fontSize: 24 },
  subtitle: { ...typography.caption, marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
});
