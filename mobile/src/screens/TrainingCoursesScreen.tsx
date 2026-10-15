import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import ToolHeader from '../components/ToolHeader';
import Icon from '../components/Icon';
import StatusBadge from '../components/admin/StatusBadge';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
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
      <ToolHeader
        title="Training"
        subtitle={`${courses.length} assigned course${courses.length === 1 ? '' : 's'}`}
        onBack={onBack}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.ok} />}
      >
        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

        {courses.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIconChip, { backgroundColor: theme.okS }]}>
              <Icon name="training" size={22} color={theme.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No courses assigned yet</Text>
            <Text style={[styles.emptyBody, { color: theme.text3 }]}>Your trainer hasn't assigned any courses. Check back soon.</Text>
          </View>
        ) : (
          courses.map((c) => {
            const pct = c.lesson_count > 0 ? Math.round((c.done_count / c.lesson_count) * 100) : 0;
            const done = pct >= 100;
            const started = c.done_count > 0;
            const statusLabel = done ? 'Completed' : started ? 'In progress' : 'Not started';
            const statusColor = done ? theme.ok : started ? theme.warn : theme.info;
            const cta = done ? 'Review' : started ? `Continue lesson ${Math.min(c.done_count + 1, c.lesson_count)}` : 'Start course';
            return (
              <Pressable key={c.id} onPress={() => onOpenCourse(c.id)} style={({ pressed }) => [pressed && styles.pressed]}>
                <Panel style={styles.card}>
                  <View style={styles.head}>
                    <View style={[styles.tile, { backgroundColor: theme.vioS }]}>
                      <Icon name="training" size={22} color={theme.vio} />
                    </View>
                    <View style={styles.info}>
                      <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{c.title}</Text>
                      <Text style={[styles.meta, { color: theme.text3 }]} numberOfLines={1}>
                        {c.category} · {c.lesson_count} lessons{c.due_date ? ` · due ${c.due_date}` : ''}
                      </Text>
                    </View>
                    <StatusBadge label={statusLabel} color={statusColor} />
                  </View>
                  <View style={[styles.track, { backgroundColor: theme.panel2 }]}>
                    <View style={[styles.fill, { width: `${pct}%`, backgroundColor: done ? theme.ok : theme.accent }]} />
                  </View>
                  <View style={[styles.cta, { borderColor: theme.border }]}>
                    <Text style={[styles.ctaText, { color: theme.text }]}>{cta}</Text>
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
  content: { padding: spacing(4), gap: spacing(3.5) },
  error: { ...typography.caption },
  pressed: { opacity: 0.75 },
  emptyBox: { alignItems: 'center', paddingVertical: spacing(9), gap: spacing(1) },
  emptyIconChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  emptyTitle: { ...typography.rowTitle, marginBottom: spacing(0.5) },
  emptyBody: { ...typography.caption, textAlign: 'center' },
  card: { gap: 10, borderRadius: radius.xl - 4, padding: spacing(3.5) },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  name: { ...typography.rowTitle },
  meta: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  cta: { height: 44, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
});
