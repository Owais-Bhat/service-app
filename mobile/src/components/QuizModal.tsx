import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import GlassCard from './GlassCard';
import Icon from './Icon';
import PressScale from './PressScale';
import ProgressRing from './ProgressRing';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { submitQuiz, QuizQuestion, QuizSubmitResult } from '../api/training';
import { ApiError } from '../api/client';

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
          <GlassSurface style={styles.card} borderRadius={radius.lg}>
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

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {result ? (
                <View style={styles.resultWrap}>
                  <ProgressRing
                    percent={result.score}
                    size={100}
                    strokeWidth={9}
                    color={result.passed ? brand.primary : semantic.danger}
                    trackColor={theme.line}
                    labelColor={theme.text}
                  />
                  <View style={[styles.passBanner, { backgroundColor: result.passed ? 'rgba(21,160,90,0.14)' : 'rgba(240,85,109,0.14)' }]}>
                    <Icon name={result.passed ? 'check-circle' : 'alert'} size={16} color={result.passed ? brand.primary : semantic.danger} filled />
                    <Text style={[styles.passBannerText, { color: result.passed ? brand.primary : semantic.danger }]}>
                      {result.passed ? 'Course passed' : 'Quiz not passed yet'}
                    </Text>
                  </View>

                  {questions.map((q, idx) => {
                    const r = result.results.find((x) => x.id === q.id);
                    const ok = !!r?.correct;
                    return (
                      <Animated.View key={q.id} entering={FadeInUp.delay(idx * 60).duration(350).springify().damping(15)} style={styles.resultRow}>
                        <View style={[styles.resultIconChip, { backgroundColor: ok ? 'rgba(21,160,90,0.16)' : 'rgba(240,85,109,0.16)' }]}>
                          <Icon name={ok ? 'check' : 'close'} size={12} color={ok ? brand.primary : semantic.danger} />
                        </View>
                        <Text style={[styles.resultQuestion, { color: theme.text2 }]} numberOfLines={2}>{q.question}</Text>
                      </Animated.View>
                    );
                  })}

                  {!result.passed ? (
                    <PressScale onPress={retake} style={{ marginTop: spacing(4) }}>
                      <View style={[styles.submitBtn, { backgroundColor: brand.primary, shadowColor: brand.primary }]}>
                        <Icon name="refresh" size={15} color="#fff" />
                        <Text style={styles.submitBtnText}>Retake Quiz</Text>
                      </View>
                    </PressScale>
                  ) : null}
                </View>
              ) : (
                <>
                  {questions.map((q, idx) => (
                    <Animated.View key={q.id} entering={FadeInUp.delay(idx * 70).duration(350).springify().damping(15)}>
                      <GlassCard style={styles.questionCard}>
                        <View style={styles.questionHeader}>
                          <View style={[styles.questionIndex, { backgroundColor: `${brand.primary}22` }]}>
                            <Text style={[styles.questionIndexText, { color: brand.primary }]}>{idx + 1}</Text>
                          </View>
                          <Text style={[styles.questionText, { color: theme.text }]}>{q.question}</Text>
                        </View>
                        {q.options.map((opt, optIdx) => {
                          const selected = answers[q.id] === optIdx;
                          return (
                            <PressScale key={optIdx} onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}>
                              <View
                                style={[
                                  styles.optionRow,
                                  selected && styles.optionRowActiveShadow,
                                  { borderColor: selected ? brand.primary : theme.line, backgroundColor: selected ? `${brand.primary}16` : theme.panel2 },
                                ]}
                              >
                                <View style={[styles.optionDot, { borderColor: selected ? brand.primary : theme.text3, backgroundColor: selected ? brand.primary : 'transparent' }]}>
                                  {selected ? <Icon name="check" size={10} color="#fff" /> : null}
                                </View>
                                <Text style={[styles.optionText, { color: selected ? brand.primary : theme.text2 }]}>{opt}</Text>
                              </View>
                            </PressScale>
                          );
                        })}
                      </GlassCard>
                    </Animated.View>
                  ))}

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <PressScale onPress={handleSubmit} disabled={!allAnswered || submitting} style={{ marginTop: spacing(2), marginBottom: spacing(2) }}>
                    <View style={[styles.submitBtn, { backgroundColor: allAnswered ? brand.primary : theme.panel2, shadowColor: brand.primary, opacity: submitting ? 0.7 : 1 }]}>
                      <Icon name="check-circle" size={16} color={allAnswered ? '#fff' : theme.text3} filled={allAnswered} />
                      <Text style={[styles.submitBtnText, { color: allAnswered ? '#fff' : theme.text3 }]}>
                        {submitting ? 'Submitting…' : allAnswered ? 'Submit Quiz' : `Answer all ${questions.length} questions`}
                      </Text>
                    </View>
                  </PressScale>
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
  error: { ...typography.caption, color: semantic.danger, marginBottom: spacing(2), textAlign: 'center' },
  questionCard: { marginBottom: spacing(3) },
  questionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2.5), marginBottom: spacing(3) },
  questionIndex: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  questionIndexText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  questionText: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 20 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), marginBottom: spacing(2) },
  optionRowActiveShadow: { shadowColor: brand.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  optionDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 50, borderRadius: radius.md, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  submitBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  resultWrap: { alignItems: 'center', paddingBottom: spacing(2) },
  passBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), paddingHorizontal: spacing(3.5), paddingVertical: spacing(2), borderRadius: radius.full, marginTop: spacing(3), marginBottom: spacing(4) },
  passBannerText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), width: '100%', marginBottom: spacing(2.5) },
  resultIconChip: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  resultQuestion: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, lineHeight: 17 },
});
