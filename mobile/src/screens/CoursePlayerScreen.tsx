import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import BackLink from '../components/BackLink';
import PressScale from '../components/PressScale';
import Icon from '../components/Icon';
import ProgressRing from '../components/ProgressRing';
import VideoPlayerModal from '../components/VideoPlayerModal';
import QuizModal from '../components/QuizModal';
import { useTheme } from '../theme/ThemeContext';
import { resolveUploadUrl } from '../api/client';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchCourseDetail, completeLesson, CourseDetail, Lesson } from '../api/training';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playingLesson, setPlayingLesson] = useState<Lesson | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);

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

  const openLesson = (lesson: Lesson) => {
    if (lesson.type === 'video' && lesson.media_url) {
      setPlayingLesson(lesson);
    } else {
      setExpandedId((prev) => (prev === lesson.id ? null : lesson.id));
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={styles.centered}>
          <ActivityIndicator color={brand.primary} size="large" />
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
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(12) }}>
        <BackLink onPress={onBack} />

        <Animated.View entering={FadeInUp.duration(450).springify().damping(15)}>
          <View style={styles.headerCard}>
            <View style={styles.headerRow}>
              <ProgressRing percent={pct} color="#ffffff" trackColor="rgba(255,255,255,0.28)" labelColor="#ffffff" size={72} strokeWidth={7} />
              <View style={styles.headerInfo}>
                <Text style={styles.courseTitle}>{detail.course.title}</Text>
                {detail.course.description ? (
                  <Text style={styles.courseDesc} numberOfLines={3}>{detail.course.description}</Text>
                ) : null}
                <Text style={styles.progressLabel}>{doneCount} of {detail.lessons.length} lessons done</Text>
              </View>
            </View>
            {detail.completion ? (
              <View style={styles.passedChip}>
                <Icon name="check-circle" size={13} color="#fff" filled />
                <Text style={styles.passedChipText}>Course passed</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {detail.quiz.length > 0 ? (
          <Animated.View entering={FadeInUp.delay(60).duration(400).springify().damping(15)}>
            <PressScale onPress={() => setShowQuiz(true)}>
              <View style={[styles.quizOuter, { shadowColor: detail.completion ? brand.primary : semantic.warning }]}>
                <View style={[styles.rowAccent, { backgroundColor: detail.completion ? brand.primary : semantic.warning }]} />
                <GlassCard shadow style={styles.quizCard}>
                  <View style={styles.lessonHeader}>
                    <View style={[styles.lessonIndex, { backgroundColor: detail.completion ? `${brand.primary}22` : `${semantic.warning}22` }]}>
                      <Icon name="shield" size={15} color={detail.completion ? brand.primary : semantic.warning} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.lessonTitle, { color: theme.text }]}>Course Quiz</Text>
                      <Text style={[styles.caption, { color: theme.text3 }]}>{detail.quiz.length} question{detail.quiz.length > 1 ? 's' : ''} · 70% to pass</Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={theme.text3} />
                  </View>
                </GlassCard>
              </View>
            </PressScale>
          </Animated.View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: theme.text3, marginTop: spacing(3) }]}>Lessons</Text>

        {detail.lessons.map((lesson, i) => {
          const done = detail.doneLessonIds.includes(lesson.id);
          const isVideo = lesson.type === 'video' && !!lesson.media_url;
          const expanded = expandedId === lesson.id;
          const accent = done ? brand.primary : theme.text3;
          return (
            <Animated.View key={lesson.id} entering={FadeInUp.delay(Math.min(i, 10) * 50).duration(400).springify().damping(15)}>
              <View style={[styles.rowOuter, { shadowColor: accent }]}>
                <View style={[styles.rowAccent, { backgroundColor: accent }]} />
                <GlassCard shadow style={styles.lessonCard}>
                  <PressScale onPress={() => openLesson(lesson)}>
                    <View style={styles.lessonHeader}>
                      <View style={[styles.lessonIndex, { backgroundColor: done ? brand.primary : `${theme.text3}22` }]}>
                        {done ? <Icon name="check" size={14} color="#fff" /> : <Text style={[styles.lessonIndexText, { color: theme.text2 }]}>{i + 1}</Text>}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.lessonTitle, { color: theme.text }]} numberOfLines={1}>{lesson.title}</Text>
                        <View style={styles.lessonMetaRow}>
                          <Icon name={isVideo ? 'tutorial' : 'report'} size={11} color={theme.text3} />
                          <Text style={[styles.caption, { color: theme.text3 }]}>{isVideo ? 'Video' : 'Reading'}</Text>
                        </View>
                      </View>
                      <Icon name={isVideo ? 'tutorial' : expanded ? 'chevron-left' : 'chevron-right'} size={16} color={theme.text3} />
                    </View>
                  </PressScale>

                  {expanded && lesson.content ? (
                    <Text style={[styles.lessonContent, { color: theme.text2, borderTopColor: theme.line }]}>{lesson.content}</Text>
                  ) : null}

                  <PressScale onPress={() => !done && handleComplete(lesson.id)} disabled={done || completingId === lesson.id}>
                    <View style={[styles.completeButton, { backgroundColor: done ? theme.panel2 : brand.primary, opacity: completingId === lesson.id ? 0.7 : 1 }]}>
                      <Icon name="check" size={13} color={done ? theme.text3 : '#fff'} />
                      <Text style={[styles.completeButtonText, { color: done ? theme.text3 : '#fff' }]}>
                        {completingId === lesson.id ? 'Saving…' : done ? 'Completed' : 'Mark Done'}
                      </Text>
                    </View>
                  </PressScale>
                </GlassCard>
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>

      {playingLesson && (
        <VideoPlayerModal
          title={playingLesson.title}
          mediaUrl={resolveUploadUrl(playingLesson.media_url!)}
          onDismiss={() => setPlayingLesson(null)}
        />
      )}

      {showQuiz && (
        <QuizModal
          courseId={courseId}
          questions={detail.quiz}
          onDismiss={() => {
            setShowQuiz(false);
            load();
          }}
          onPassed={load}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing(3) },
  body: { ...typography.body },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: semantic.danger, marginTop: spacing(3) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  headerCard: {
    backgroundColor: brand.primary,
    borderRadius: 20,
    padding: spacing(4),
    shadowColor: brand.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(4) },
  headerInfo: { flex: 1, minWidth: 0 },
  courseTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: '#fff', marginBottom: spacing(1) },
  courseDesc: { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17, marginBottom: spacing(1.5) },
  progressLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: 'rgba(255,255,255,0.9)' },
  passedChip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.full, marginTop: spacing(3) },
  passedChipText: { fontFamily: 'Manrope_700Bold', fontSize: 10.5, color: '#fff' },
  quizOuter: { flexDirection: 'row', marginBottom: spacing(3), shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 3 },
  quizCard: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  rowOuter: { flexDirection: 'row', marginBottom: spacing(3), shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 3 },
  rowAccent: { width: 4, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
  lessonCard: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  lessonHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  lessonIndex: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  lessonIndexText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  lessonTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  lessonMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  lessonContent: { fontSize: 13, lineHeight: 19, marginTop: spacing(3), paddingTop: spacing(3), borderTopWidth: 1 },
  completeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 38, borderRadius: 10, marginTop: spacing(3) },
  completeButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
});
