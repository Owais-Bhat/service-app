import React, { useState } from 'react';
import { Image, Modal, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from './KeyboardAware';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import Panel from './Panel';
import GlowButton from './GlowButton';
import Icon from './Icon';
import PressScale from './PressScale';
import ProgressRing from './ProgressRing';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { decodeQuestion, questionLabel, submitQuiz, QuizQuestion, QuizSubmitResult } from '../api/training';
import { ApiError, resolveUploadUrl } from '../api/client';

interface Props {
  courseId: string;
  questions: QuizQuestion[];
  onDismiss: () => void;
  onPassed: () => void;
}

export default function QuizModal({ courseId, questions, onDismiss, onPassed }: Props) {
  const { theme } = useTheme();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitQuiz(courseId, answers);
      setResult(res);
      if (res.passed) onPassed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the quiz — check your connection');
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    setResult(null);
    setAnswers({});
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Animated.View entering={ZoomIn.duration(340).springify().damping(15).mass(0.85)} style={styles.cardWrap}>
          <GlassSurface style={styles.card} borderRadius={radius.sheet}>
            <View style={[styles.headerRow, { borderBottomColor: theme.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text }]}>Course Quiz</Text>
                <Text style={[styles.subtitle, { color: theme.text3 }]}>
                  {result ? (result.passed ? 'You passed!' : 'Not quite — 70% needed to pass') : `${answeredCount} of ${questions.length} answered`}
                </Text>
              </View>
              <PressScale onPress={onDismiss}>
                <View style={[styles.closeBtn, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                  <Icon name="close" size={13} color={theme.text3} />
                </View>
              </PressScale>
            </View>

            {!result ? (
              <View style={[styles.progressTrack, { backgroundColor: theme.panel2 }]}>
                <View style={[styles.progressFill, { width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`, backgroundColor: theme.accent }]} />
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
              {result ? (
                <View style={styles.resultWrap}>
                  <ProgressRing
                    percent={result.score}
                    size={100}
                    strokeWidth={9}
                    color={result.passed ? theme.accent : theme.err}
                    trackColor={theme.line}
                    labelColor={theme.text}
                  />
                  <View style={[styles.passBanner, { backgroundColor: result.passed ? theme.okS : theme.errS }]}>
                    <Icon name={result.passed ? 'check-circle' : 'alert'} size={16} color={result.passed ? theme.ok : theme.err} filled />
                    <Text style={[styles.passBannerText, { color: result.passed ? theme.ok : theme.err }]}>
                      {result.passed ? 'Course passed' : 'Quiz not passed yet'}
                    </Text>
                  </View>

                  {questions.map((q, idx) => {
                    const r = result.results.find((x) => x.id === q.id);
                    const ok = !!r?.correct;
                    const chosenText = r && r.chosen !== null && r.chosen !== undefined ? q.options[r.chosen] : null;
                    const correctText = r ? q.options[r.correct_index] : null;
                    return (
                      <Animated.View key={q.id} entering={FadeInUp.delay(idx * 60).duration(350).springify().damping(15)} style={{ width: '100%' }}>
                        <Panel style={{ ...styles.resultCard, borderColor: ok ? theme.ok : theme.err }}>
                          <View style={styles.resultRow}>
                            <View style={[styles.resultIconChip, { backgroundColor: ok ? theme.okS : theme.errS }]}>
                              <Icon name={ok ? 'check' : 'close'} size={12} color={ok ? theme.ok : theme.err} />
                            </View>
                            <Text style={[styles.resultQuestion, { color: theme.text }]}>{questionLabel(decodeQuestion(q.question))}</Text>
                          </View>
                          {!ok ? (
                            <View style={styles.resultAnswers}>
                              <Text style={[styles.resultAnswerLine, { color: theme.err }]}>
                                Your answer: {chosenText || 'No answer'}
                              </Text>
                              <Text style={[styles.resultAnswerLine, { color: theme.ok }]}>
                                Correct answer: {correctText}
                              </Text>
                            </View>
                          ) : null}
                        </Panel>
                      </Animated.View>
                    );
                  })}

                  {!result.passed ? (
                    <View style={{ width: '100%', marginTop: spacing(2) }}>
                      <GlowButton label="Retake Quiz" onPress={retake} icon="refresh" />
                    </View>
                  ) : null}
                </View>
              ) : (
                <>
                  {questions.map((q, idx) => {
                    const dq = decodeQuestion(q.question);
                    const prev = idx > 0 ? decodeQuestion(questions[idx - 1].question) : null;
                    const startsGroup = dq.kind === 'match' && (!prev || prev.group !== dq.group);
                    return (
                    <Animated.View key={q.id} entering={FadeInUp.delay(idx * 70).duration(350).springify().damping(15)}>
                      {startsGroup && dq.groupTitle ? (
                        <Text style={[styles.groupTitle, { color: theme.text2 }]}>Match the following: {dq.groupTitle}</Text>
                      ) : null}
                      <Panel style={styles.questionCard}>
                        {dq.img ? <Image source={{ uri: resolveUploadUrl(dq.img) }} style={styles.questionImage} resizeMode="contain" /> : null}
                        <View style={styles.questionHeader}>
                          <View style={[styles.questionIndex, { backgroundColor: theme.okS }]}>
                            <Text style={[styles.questionIndexText, { color: theme.accent }]}>{idx + 1}</Text>
                          </View>
                          <Text style={[styles.questionText, { color: theme.text }]}>{questionLabel(dq)}</Text>
                        </View>
                        {q.options.map((opt, optIdx) => {
                          const selected = answers[q.id] === optIdx;
                          return (
                            <PressScale key={optIdx} onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}>
                              <View
                                style={[
                                  styles.optionRow,
                                  { borderColor: selected ? theme.accent : theme.border, borderWidth: selected ? 2 : 1, backgroundColor: selected ? theme.okS : theme.panel },
                                ]}
                              >
                                <View style={[styles.optionDot, { borderColor: selected ? theme.accent : theme.text3, backgroundColor: selected ? brand.fill : 'transparent' }]}>
                                  {selected ? <Icon name="check" size={12} color="#fff" /> : null}
                                </View>
                                <Text style={[styles.optionText, { color: theme.text }]}>{opt}</Text>
                              </View>
                            </PressScale>
                          );
                        })}
                      </Panel>
                    </Animated.View>
                    );
                  })}

                  {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

                  <GlowButton
                    label={allAnswered ? 'Submit Quiz' : `Answer all ${questions.length} questions`}
                    onPress={handleSubmit}
                    disabled={!allAnswered}
                    loading={submitting}
                    icon="check-circle"
                  />
                </>
              )}
            </ScrollView>
          </GlassSurface>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  cardWrap: { width: '100%', maxWidth: 440 },
  card: { width: '100%', padding: spacing(5) },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), paddingBottom: spacing(3), marginBottom: spacing(3), borderBottomWidth: 1 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.heading, fontSize: 17 },
  subtitle: { fontSize: 12, marginTop: spacing(0.5) },
  error: { ...typography.caption, marginBottom: spacing(2), textAlign: 'center' },
  progressTrack: { height: 6, borderRadius: 3, marginBottom: spacing(3), overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  questionCard: { marginBottom: spacing(3), borderRadius: radius.lg },
  questionImage: { width: '100%', height: 160, borderRadius: radius.md, marginBottom: spacing(3) },
  groupTitle: { fontFamily: 'Manrope_700Bold', fontSize: 12, marginBottom: spacing(2), marginTop: spacing(1) },
  questionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2.5), marginBottom: spacing(3) },
  questionIndex: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  questionIndexText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  questionText: { flex: 1, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, lineHeight: 22 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), minHeight: 56, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), marginBottom: spacing(2) },
  optionDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 14, lineHeight: 19 },
  resultWrap: { alignItems: 'center', paddingBottom: spacing(2) },
  passBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), paddingHorizontal: spacing(3.5), paddingVertical: spacing(2), borderRadius: radius.full, marginTop: spacing(3), marginBottom: spacing(4) },
  passBannerText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  resultCard: { width: '100%', marginBottom: spacing(2.5) },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2.5) },
  resultIconChip: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: spacing(0.5) },
  resultQuestion: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 13, lineHeight: 18 },
  resultAnswers: { marginTop: spacing(2.5), paddingTop: spacing(2.5), borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.18)', gap: spacing(1) },
  resultAnswerLine: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, lineHeight: 17 },
});
