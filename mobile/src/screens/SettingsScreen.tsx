import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import ToolHeader from '../components/ToolHeader';
import Icon from '../components/Icon';
import SectionLabel from '../components/admin/SectionLabel';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';

interface Props {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme, mode, toggleTheme } = useTheme();
  const version = Constants.expoConfig?.version;

  // The provider only exposes a toggle, so picking the segment that is not
  // already active flips the mode.
  const choose = (next: 'light' | 'dark') => {
    if (next !== mode) toggleTheme();
  };

  const options: { key: 'light' | 'dark'; label: string; icon: 'sun' | 'moon' }[] = [
    { key: 'light', label: 'Light', icon: 'sun' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title="Settings" subtitle="App preferences" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}>
        <View>
          <SectionLabel>Theme</SectionLabel>
          <View style={[styles.segment, { backgroundColor: theme.panel2 }]}>
            {options.map((o) => {
              const active = mode === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => choose(o.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.segItem, active && { backgroundColor: theme.panel, borderColor: theme.border }]}
                >
                  <Icon name={o.icon} size={16} color={active ? theme.text : theme.text2} />
                  <Text style={[styles.segText, { color: active ? theme.text : theme.text2, fontFamily: active ? 'Manrope_700Bold' : 'Manrope_600SemiBold' }]}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {version ? (
          <Panel style={styles.list}>
            <View style={styles.row}>
              <Icon name="settings" size={20} color={theme.text2} />
              <Text style={[styles.rowLabel, { color: theme.text }]}>App version</Text>
              <Text style={[styles.rowMeta, { color: theme.text3 }]}>{version}</Text>
            </View>
          </Panel>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), gap: 18 },
  segment: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 16 },
  segItem: { flex: 1, height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segText: { ...typography.caption },
  list: { padding: 0, overflow: 'hidden', borderRadius: radius.xl - 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14 },
  rowLabel: { ...typography.rowTitle, flex: 1 },
  rowMeta: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
});
