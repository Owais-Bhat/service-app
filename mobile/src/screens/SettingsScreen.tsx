import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme, mode, toggleTheme } = useTheme();

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

        <Panel style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Dark mode</Text>
            <Text style={[styles.caption, { color: theme.text3 }]}>Aurora hero on a near-black base</Text>
          </View>
          <Pressable
            onPress={toggleTheme}
            style={[styles.switch, { backgroundColor: mode === 'dark' ? brand.primary : theme.panel2, borderColor: theme.line }]}
          >
            <View style={[styles.knob, { alignSelf: mode === 'dark' ? 'flex-end' : 'flex-start' }]} />
          </Pressable>
        </Panel>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginBottom: spacing(4) },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowInfo: { flex: 1, minWidth: 0, paddingRight: spacing(3) },
  rowLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  switch: { width: 46, height: 27, borderRadius: 14, borderWidth: 1, padding: 3, justifyContent: 'center' },
  knob: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#ffffff' },
});
