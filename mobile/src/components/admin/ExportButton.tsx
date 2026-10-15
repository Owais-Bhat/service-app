import React from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import Icon from '../Icon';
import { shareCsv } from '../../utils/shareCsv';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme';

interface Props {
  /** File name, shown as the share title. */
  name: string;
  rows: Record<string, unknown>[];
  label?: string;
}

// "Export CSV": hands the rows currently on screen to the phone's share sheet.
// Design report toolbar: a 44 dp bordered button with the share glyph, r12.
export default function ExportButton({ name, rows, label = 'Export CSV' }: Props) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={async () => {
        if (rows.length === 0) return Alert.alert('Nothing to export', 'There are no rows on screen.');
        try {
          await shareCsv(name, rows);
        } catch (e) {
          Alert.alert('Could not export', e instanceof Error ? e.message : 'Try again');
        }
      }}
      style={({ pressed }) => [styles.btn, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && { opacity: 0.75 }]}
    >
      <Icon name="document" size={16} color={theme.text} />
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), height: 44, paddingHorizontal: spacing(3), borderWidth: 1, borderRadius: radius.sm, marginBottom: spacing(3) },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
