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

        <Text style={[styles.sectionLabel, { color: theme.text3, marginTop: spacing(3) }]}>Lessons</Text>

        {detail.lessons.map((lesson, i) => {
          const done = detail.doneLessonIds.includes(lesson.id);
          const isVideo = lesson.type === 'video' && !!lesson.media_url;
          const expanded = expandedId === lesson.id;
          const typeColor = isVideo ? '#2e9bff' : '#0ea5a5';
          const accent = done ? brand.primary : typeColor;
          const isLast = i === detail.lessons.length - 1 && detail.quiz.length === 0;
          return (
            <Animated.View key={lesson.id} entering={FadeInUp.delay(Math.min(i, 10) * 60).duration(420).springify().damping(15)}>
              <View style={styles.timelineRow}>
                <View style={styles.timelineCol}>
                  <View style={[styles.timelineDot, { backgroundColor: done ? brand.primary : `${typeColor}22`, borderColor: done ? brand.primary : typeColor }]}>
                    {done ? <Icon name="check" size={15} color="#fff" /> : <Text style={[styles.timelineDotText, { color: typeColor }]}>{i + 1}</Text>}
                  </View>
                  {!isLast ? <View style={[styles.timelineLine, { backgroundColor: done ? brand.primary : theme.line }]} /> : null}
                </View>

                <View style={[styles.lessonOuter, { shadowColor: accent }]}>
                  <PressScale onPress={() => openLesson(lesson)}>
                    <GlassCard shadow style={styles.lessonCard}>
                      {isVideo ? (
                        <View style={[styles.videoThumb, { backgroundColor: `${typeColor}22` }]}>
                          <View style={[styles.videoPlayChip, { backgroundColor: typeColor }]}>
                            <Icon name="tutorial" size={20} color="#fff" filled />
                          </View>
                          <Text style={[styles.videoThumbLabel, { color: typeColor }]}>Tap to watch</Text>
                        </View>
                      ) : null}
                      <View style={styles.lessonBody}>
                        <View style={[styles.typePill, { backgroundColor: `${typeColor}1c` }]}>
                          <Icon name={isVideo ? 'tutorial' : 'report'} size={10} color={typeColor} />
                          <Text style={[styles.typePillText, { color: typeColor }]}>{isVideo ? 'Video' : 'Reading'}</Text>
                        </View>
                        <View style={styles.lessonTitleRow}>
                          <Text style={[styles.lessonTitle, { color: theme.text, flex: 1 }]}>{lesson.title}</Text>
                          {!isVideo ? <Icon name={expanded ? 'chevron-left' : 'chevron-right'} size={15} color={theme.text3} /> : null}
                        </View>

                        {expanded && lesson.content ? (
                          <Animated.Text entering={FadeInUp.duration(250)} style={[styles.lessonContent, { color: theme.text2, borderTopColor: theme.line }]}>
                            {lesson.content}
                          </Animated.Text>
                        ) : null}

                        <PressScale onPress={() => !done && handleComplete(lesson.id)} disabled={done || completingId === lesson.id}>
                          <View style={[styles.completeButton, { backgroundColor: done ? `${brand.primary}18` : brand.primary, opacity: completingId === lesson.id ? 0.7 : 1 }]}>
                            <Icon name="check" size={13} color={done ? brand.primary : '#fff'} />
                            <Text style={[styles.completeButtonText, { color: done ? brand.primary : '#fff' }]}>
                              {completingId === lesson.id ? 'Saving…' : done ? 'Completed' : 'Mark Done'}
                            </Text>
                          </View>
                        </PressScale>
                      </View>
                    </GlassCard>
                  </PressScale>
                </View>
              </View>
            </Animated.View>
          );
        })}

        {detail.quiz.length > 0 ? (() => {
          const done = !!detail.completion;
          const typeColor = '#7c5cfc';
          const accent = done ? brand.primary : typeColor;
          return (
            <Animated.View entering={FadeInUp.delay(Math.min(detail.lessons.length, 10) * 60).duration(420).springify().damping(15)}>
              <View style={styles.timelineRow}>
                <View style={styles.timelineCol}>
                  <View style={[styles.timelineDot, { backgroundColor: done ? brand.primary : `${typeColor}22`, borderColor: done ? brand.primary : typeColor }]}>
                    {done ? <Icon name="check" size={15} color="#fff" /> : <Icon name="shield" size={14} color={typeColor} />}
                  </View>
                </View>

                <View style={[styles.lessonOuter, { shadowColor: accent }]}>
                  <PressScale onPress={() => setShowQuiz(true)}>
                    <GlassCard shadow style={styles.lessonCard}>
                      <View style={[styles.videoThumb, { backgroundColor: `${typeColor}22` }]}>
                        <View style={[styles.videoPlayChip, { backgroundColor: typeColor }]}>
                          <Icon name="shield" size={20} color="#fff" />
                        </View>
                        <Text style={[styles.videoThumbLabel, { color: typeColor }]}>{detail.quiz.length} question{detail.quiz.length > 1 ? 's' : ''} · 70% to pass</Text>
                      </View>
                      <View style={styles.lessonBody}>
                        <View style={[styles.typePill, { backgroundColor: `${typeColor}1c` }]}>
                          <Icon name="shield" size={10} color={typeColor} />
                          <Text style={[styles.typePillText, { color: typeColor }]}>Quiz</Text>
                        </View>
                        <View style={styles.lessonTitleRow}>
                          <Text style={[styles.lessonTitle, { color: theme.text, flex: 1 }]}>Course Quiz</Text>
                        </View>

                        <View style={[styles.completeButton, { backgroundColor: done ? `${brand.primary}18` : typeColor }]}>
                          <Icon name={done ? 'check' : 'arrow-right'} size={13} color={done ? brand.primary : '#fff'} />
                          <Text style={[styles.completeButtonText, { color: done ? brand.primary : '#fff' }]}>
                            {done ? 'Passed — Retake' : 'Take Quiz'}
                          </Text>
                        </View>
                      </View>
                    </GlassCard>
                  </PressScale>
                </View>
              </View>
            </Animated.View>
          );
        })() : null}
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
  lessonTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, lineHeight: 20 },
  lessonContent: { fontSize: 13, lineHeight: 19, marginTop: spacing(3), paddingTop: spacing(3), borderTopWidth: 1 },
  completeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 38, borderRadius: 10, marginTop: spacing(3) },
  completeButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },

  timelineRow: { flexDirection: 'row', gap: spacing(3) },
  timelineCol: { alignItems: 'center', width: 34 },
  timelineDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  timelineDotText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  timelineLine: { width: 2.5, flex: 1, minHeight: spacing(4), marginTop: spacing(1), borderRadius: 2 },
  lessonOuter: { flex: 1, marginBottom: spacing(4), shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 3 },
  lessonCard: { padding: 0, overflow: 'hidden' },
  videoThumb: { height: 96, alignItems: 'center', justifyContent: 'center', gap: spacing(1.5) },
  videoPlayChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  videoThumbLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10.5 },
  lessonBody: { padding: spacing(4) },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), alignSelf: 'flex-start', paddingHorizontal: spacing(2), paddingVertical: spacing(0.75), borderRadius: radius.full, marginBottom: spacing(2) },
  typePillText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase' },
  lessonTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
});
