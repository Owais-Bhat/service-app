import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import BackLink from '../components/BackLink';
import PressScale from '../components/PressScale';
import Icon from '../components/Icon';
import ProgressRing from '../components/ProgressRing';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
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
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(12) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Training Courses</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>Structured lessons assigned to you</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {courses.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIconChip, { backgroundColor: `${brand.primary}1f` }]}>
              <Icon name="training" size={22} color={brand.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No courses assigned yet</Text>
            <Text style={[styles.caption, { color: theme.text3, textAlign: 'center' }]}>Your trainer hasn't assigned any courses. Check back soon.</Text>
          </View>
        ) : (
          courses.map((c, idx) => {
            const pct = c.lesson_count > 0 ? Math.round((c.done_count / c.lesson_count) * 100) : 0;
            const done = pct >= 100;
            const accent = done ? brand.primary : c.due_date ? semantic.warning : '#2e9bff';
            return (
              <Animated.View key={c.id} entering={FadeInUp.delay(Math.min(idx, 8) * 60).duration(400).springify().damping(15)}>
                <PressScale onPress={() => onOpenCourse(c.id)}>
                  <View style={[styles.cardOuter, { shadowColor: accent }]}>
                    <View style={[styles.rowAccent, { backgroundColor: accent }]} />
                    <GlassCard shadow style={styles.card}>
                      <View style={styles.cardRow}>
                        <ProgressRing percent={pct} size={68} strokeWidth={6} color={accent} trackColor={theme.line} labelColor={theme.text} />
                        <View style={styles.info}>
                          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{c.title}</Text>
                          <View style={styles.metaRow}>
                            <Icon name="tasks" size={12} color={theme.text3} />
                            <Text style={[styles.metaText, { color: theme.text3 }]}>{c.category} · {c.lesson_count} lessons</Text>
                          </View>
                          {c.due_date ? (
                            <View style={styles.metaRow}>
                              <Icon name="calendar" size={12} color={semantic.warning} />
                              <Text style={[styles.dueText, { color: semantic.warning }]}>Due {c.due_date}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Icon name="chevron-right" size={20} color={theme.text3} />
                      </View>
                    </GlassCard>
                  </View>
                </PressScale>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginTop: spacing(1) },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: semantic.danger, marginBottom: spacing(3) },
  emptyBox: { alignItems: 'center', paddingVertical: spacing(9), gap: spacing(1) },
  emptyIconChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  emptyTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, marginBottom: spacing(0.5) },
  cardOuter: { flexDirection: 'row', marginBottom: spacing(3.5), shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 3 },
  rowAccent: { width: 5, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  card: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3.5), paddingVertical: spacing(1.5) },
  info: { flex: 1, minWidth: 0, gap: spacing(1) },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, marginBottom: spacing(0.5) },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5 },
  dueText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
});
