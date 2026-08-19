import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchMyCourses, CourseSummary } from '../api/training';

interface Props {
  onBack: () => void;
  onOpenCourse: (courseId: string) => void;
}

export default function TrainingCoursesScreen({ onBack, onOpenCourse }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchMyCourses();
      setCourses(rows);
      setError(null);
    } catch {
      setError('Could not load courses — pull to retry');
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
        <Text style={[styles.title, { color: theme.text }]}>Training Courses</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {courses.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>No courses assigned to you yet.</Text>
        ) : (
          courses.map((c) => {
            const pct = c.lesson_count > 0 ? Math.round((c.done_count / c.lesson_count) * 100) : 0;
            return (
              <Pressable key={c.id} onPress={() => onOpenCourse(c.id)} style={({ pressed }) => [pressed && styles.pressed]}>
                <Panel style={styles.row}>
                  <View style={[styles.ring, { borderColor: theme.line }]}>
                    <Text style={[styles.ringText, { color: theme.text }]}>{pct}%</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{c.title}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>{c.category} · {c.lesson_count} lessons</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  ring: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
});
