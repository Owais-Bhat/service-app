import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchTrainingItems, fetchWatchProgress, TrainingItem, WatchProgress } from '../api/training';

interface Props {
  onBack: () => void;
}

export default function TutorialsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [progress, setProgress] = useState<Record<string, WatchProgress>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, watch] = await Promise.all([fetchTrainingItems(), fetchWatchProgress()]);
      setItems(rows);
      setProgress(Object.fromEntries(watch.map((w) => [w.item_id, w])));
      setError(null);
    } catch {
      setError('Could not load tutorials — pull to retry');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Tutorials</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {items.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>No tutorials available yet.</Text>
        ) : (
          items.map((item) => {
            const p = progress[item.id];
            return (
              <Pressable key={item.id} onPress={() => Linking.openURL(item.url)} style={({ pressed }) => [pressed && styles.pressed]}>
                <Panel style={styles.row}>
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>
                      {item.kind}{p ? ` · ${p.percent}% watched` : ''}
                    </Text>
                  </View>
                </Panel>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginBottom: spacing(4) },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  pressed: { opacity: 0.7 },
  row: { marginBottom: spacing(2.5) },
  info: { minWidth: 0 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
});
