import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlowButton from '../components/GlowButton';
import ToolHeader from '../components/ToolHeader';
import Icon from '../components/Icon';
import SectionLabel from '../components/admin/SectionLabel';
import StatusBadge from '../components/admin/StatusBadge';
import VideoPlayerModal from '../components/VideoPlayerModal';
import QuizModal from '../components/QuizModal';
import { useTheme } from '../theme/ThemeContext';
import { resolveUploadUrl } from '../api/client';
import { radius, spacing, typography } from '../theme';
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
        <ToolHeader title="Course" onBack={onBack} />
        <View style={styles.centered}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <ToolHeader title="Course" onBack={onBack} />
        <View style={styles.centered}>
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Course not found'}</Text>
        </View>
      </View>
    );
  }

  const doneCount = detail.doneLessonIds.length;
  const pct = detail.lessons.length > 0 ? Math.round((doneCount / detail.lessons.length) * 100) : 0;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader
        title={detail.course.title}
        subtitle={`${doneCount} of ${detail.lessons.length} lessons done`}
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}>
        <Panel style={styles.summary}>
          {detail.course.description ? (
            <Text style={[styles.courseDesc, { color: theme.text2 }]} numberOfLines={3}>{detail.course.description}</Text>
          ) : null}
          <View style={styles.summaryHead}>
            <Text style={[styles.summaryLabel, { color: theme.text2 }]}>Course progress</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{pct}%</Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.panel2 }]}>
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.accent }]} />
          </View>
          {detail.completion ? (
            <View style={styles.passedRow}>
              <StatusBadge label="Course passed" color={theme.ok} icon="check-circle" />
            </View>
          ) : null}
        </Panel>

        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

        <View>
          <SectionLabel>Lessons</SectionLabel>
          <Panel style={styles.list}>
            {detail.lessons.map((lesson, i) => {
              const done = detail.doneLessonIds.includes(lesson.id);
              const isVideo = lesson.type === 'video' && !!lesson.media_url;
              const expanded = expandedId === lesson.id;
              const last = i === detail.lessons.length - 1;
              const tint = isVideo ? theme.info : theme.teal;
              const tintBg = isVideo ? theme.infoS : theme.tealS;
              return (
                <View key={lesson.id} style={[styles.lesson, !last && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                  <Pressable onPress={() => openLesson(lesson)} style={({ pressed }) => [styles.lessonTop, pressed && styles.pressed]} accessibilityRole="button">
                    <View style={[styles.tile, { backgroundColor: done ? theme.okS : tintBg }]}>
                      {done ? <Icon name="check" size={20} color={theme.ok} /> : <Icon name={isVideo ? 'tutorial' : 'report'} size={20} color={tint} />}
                    </View>
                    <View style={styles.lessonText}>
                      <Text style={[styles.lessonTitle, { color: theme.text }]} numberOfLines={2}>{i + 1}. {lesson.title}</Text>
                      <Text style={[styles.lessonMeta, { color: done ? theme.ok : theme.text3 }]}>
                        {isVideo ? 'Video · tap to watch' : 'Reading'}{done ? ' · Completed' : ''}
                      </Text>
                    </View>
                    {!isVideo ? <Icon name={expanded ? 'chevron-left' : 'chevron-right'} size={16} color={theme.text3} /> : null}
                  </Pressable>

                  {expanded && lesson.content ? (
                    <Text style={[styles.lessonContent, { color: theme.text2, borderTopColor: theme.line }]}>{lesson.content}</Text>
                  ) : null}

                  {!done ? (
                    <Pressable
                      onPress={() => handleComplete(lesson.id)}
                      disabled={completingId === lesson.id}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.markBtn, { borderColor: theme.border, opacity: completingId === lesson.id ? 0.6 : 1 }, pressed && styles.pressed]}
                    >
                      <Icon name="check" size={14} color={theme.accent} />
                      <Text style={[styles.markText, { color: theme.accent }]}>{completingId === lesson.id ? 'Saving…' : 'Mark done'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </Panel>
        </View>

        {detail.quiz.length > 0 ? (
          <Panel style={styles.quiz}>
            <View style={styles.lessonTop}>
              <View style={[styles.tile, { backgroundColor: theme.vioS }]}>
                <Icon name="shield" size={20} color={theme.vio} />
              </View>
              <View style={styles.lessonText}>
                <Text style={[styles.lessonTitle, { color: theme.text }]}>Course quiz</Text>
                <Text style={[styles.lessonMeta, { color: theme.text3 }]}>
                  {detail.quiz.length} question{detail.quiz.length > 1 ? 's' : ''} · 70% to pass
                </Text>
              </View>
              {detail.completion ? <StatusBadge label="Passed" color={theme.ok} /> : null}
            </View>
            <GlowButton
              label={detail.completion ? 'Passed — Retake' : 'Take Quiz'}
              onPress={() => setShowQuiz(true)}
              variant={detail.completion ? 'secondary' : 'primary'}
              icon={detail.completion ? 'check' : 'arrow-right'}
            />
          </Panel>
        ) : null}
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
  content: { padding: spacing(4), gap: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing(3) },
  body: { ...typography.body },
  error: { ...typography.caption },
  pressed: { opacity: 0.75 },
  summary: { gap: spacing(2), borderRadius: radius.xl - 4, padding: spacing(4) },
  courseDesc: { ...typography.supporting, marginBottom: spacing(1) },
  summaryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  summaryLabel: { ...typography.caption },
  summaryValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  passedRow: { marginTop: spacing(1) },
  list: { padding: 0, overflow: 'hidden', borderRadius: radius.xl - 4 },
  lesson: { padding: 14, gap: spacing(2.5) },
  lessonTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  lessonText: { flex: 1, minWidth: 0 },
  lessonTitle: { ...typography.rowTitle, fontSize: 14, lineHeight: 19 },
  lessonMeta: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  lessonContent: { ...typography.supporting, lineHeight: 19, paddingTop: spacing(3), borderTopWidth: 1 },
  markBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: radius.sm, borderWidth: 1 },
  markText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  quiz: { gap: spacing(2), borderRadius: radius.xl - 4, padding: spacing(3.5) },
});
