import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { fetchCourseDetail, completeLesson, CourseDetail } from '../api/training';

interface Props {
  courseId: string;
  onBack: () => void;
}

export default function CoursePlayerScreen({ courseId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchCourseDetail(courseId);
      setDetail(d);
      setError(null);
    } catch {
      setError('Could not load this course — check your connection');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleComplete = async (lessonId: string) => {
    setCompletingId(lessonId);
    try {
      await completeLesson(lessonId);
      await load();
    } catch {
      setError('Could not save — check your connection');
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={styles.centered}>
          <Text style={[styles.caption, { color: theme.text3 }]}>Loading…</Text>
        </View>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Course not found'}</Text>
          <BackLink onPress={onBack} />
        </View>
      </View>
    );
  }

  const doneCount = detail.doneLessonIds.length;
  const pct = detail.lessons.length > 0 ? Math.round((doneCount / detail.lessons.length) * 100) : 0;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <BackLink onPress={onBack} />

        <GlassCard style={styles.headerCard}>
          <Text style={[styles.courseTitle, { color: theme.text }]}>{detail.course.title}</Text>
          {detail.course.description ? (
            <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>{detail.course.description}</Text>
          ) : null}
          <Text style={[styles.caption, { color: brand.primary, marginTop: spacing(2) }]}>{pct}% complete</Text>
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {detail.lessons.map((lesson, i) => {
          const done = detail.doneLessonIds.includes(lesson.id);
          return (
            <Panel key={lesson.id} style={styles.lessonRow}>
              <View style={[styles.lessonIndex, { backgroundColor: done ? brand.primary : theme.line }]}>
                <Text style={[styles.lessonIndexText, { color: done ? '#ffffff' : theme.text2 }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.lessonTitle, { color: theme.text }]}>{lesson.title}</Text>
              {done ? (
                <Text style={[styles.doneLabel, { color: brand.primary }]}>Done</Text>
              ) : (
                <Pressable
                  onPress={() => handleComplete(lesson.id)}
                  disabled={completingId === lesson.id}
                  style={({ pressed }) => [styles.completeButton, pressed && styles.pressed]}
                >
                  <Text style={styles.completeButtonText}>{completingId === lesson.id ? '…' : 'Mark done'}</Text>
                </Pressable>
              )}
            </Panel>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing(3) },
  body: { ...typography.body },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  headerCard: { marginBottom: spacing(4) },
  courseTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 },
  pressed: { opacity: 0.7 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  lessonIndex: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  lessonIndexText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  lessonTitle: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 13, minWidth: 0 },
  doneLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  completeButton: { paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: 8, backgroundColor: brand.primary },
  completeButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#ffffff' },
});
