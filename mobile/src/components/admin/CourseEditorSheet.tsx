import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import FormSheet from './FormSheet';
import FilterChips from './FilterChips';
import Field from './Field';
import ListRow from './ListRow';
import ActionButton from './ActionButton';
import EmptyNote from './EmptyNote';
import SectionLabel from './SectionLabel';
import {
  addLesson,
  addQuestion,
  assignCourse,
  fetchFullCourse,
  fetchTrainingEmployees,
  FullCourse,
  packQuestion,
  PlainEmployee,
  removeLesson,
  removeQuestion,
  updateCourse,
} from '../../api/adminTraining';
import { decodeQuestion, questionLabel } from '../../api/training';
import { uploadMedia } from '../../api/upload';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';

interface Props {
  courseId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = 'details' | 'lessons' | 'quiz' | 'assign';
const TABS: { key: Tab; label: string }[] = [
  { key: 'lessons', label: 'Lessons' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'assign', label: 'Assign' },
  { key: 'details', label: 'Details' },
];
const LESSON_TYPES = [
  { key: 'video', label: 'Video' },
  { key: 'image', label: 'Image' },
  { key: 'pdf', label: 'PDF / link' },
  { key: 'text', label: 'Text only' },
];
const Q_TYPES = [
  { key: 'mcq', label: 'Multiple choice' },
  { key: 'fill', label: 'Fill in the blank' },
  { key: 'image', label: 'Image question' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const errText = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);

// Lessons, quiz questions, assignment and details of one training course —
// everything the web course editor does, one tab at a time.
export default function CourseEditorSheet({ courseId, onClose, onChanged }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('lessons');
  const [full, setFull] = useState<FullCourse | null>(null);
  const [employees, setEmployees] = useState<PlainEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [details, setDetails] = useState({ title: '', category: '', description: '' });
  const [lesson, setLesson] = useState({ title: '', type: 'video', content: '', media: '' });
  const [q, setQ] = useState({ type: 'mcq', text: '', opts: ['', '', '', ''], correct: 0, img: '' });
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState('');

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const [f, emps] = await Promise.all([fetchFullCourse(courseId), fetchTrainingEmployees()]);
      setFull(f);
      setEmployees(emps);
      setDetails({ title: f.course.title, category: f.course.category || 'General', description: f.course.description || '' });
      setAll(f.assignments.some((a) => !a.employee_id));
      setPicked(new Set(f.assignments.filter((a) => a.employee_id).map((a) => a.employee_id as string)));
      setDue(f.assignments[0]?.due_date ? String(f.assignments[0].due_date).slice(0, 10) : '');
    } catch (e: unknown) {
      Alert.alert('Could not load the course', errText(e, 'Try again'));
      onClose();
    } finally {
      setLoading(false);
    }
  }, [courseId, onClose]);

  useEffect(() => {
    if (courseId) {
      setTab('lessons');
      setFull(null);
      load();
    }
  }, [courseId, load]);

  const pickMedia = async (kinds: ('images' | 'videos')[], onUrl: (url: string) => void) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo library access to choose a file.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      onUrl(await uploadMedia(asset.uri, asset.type === 'video' ? 'video' : 'image'));
    } catch (e: unknown) {
      Alert.alert('Upload failed', errText(e, 'Check your connection and try again'));
    } finally {
      setUploading(false);
    }
  };

  const run = async (key: string, fn: () => Promise<void>, failTitle: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: unknown) {
      Alert.alert(failTitle, errText(e, 'Try again'));
    } finally {
      setBusy(null);
    }
  };

  const saveDetails = () =>
    run(
      'details',
      async () => {
        if (!details.title.trim()) throw new Error('A course needs a title');
        await updateCourse(courseId as string, { title: details.title.trim(), category: details.category.trim() || 'General', description: details.description.trim() });
        await load();
        onChanged();
      },
      'Not saved',
    );

  const saveLesson = () =>
    run(
      'lesson',
      async () => {
        if (!lesson.title.trim()) throw new Error('Give the lesson a title');
        await addLesson(courseId as string, {
          title: lesson.title.trim(),
          type: lesson.type,
          media_url: lesson.media.trim() || null,
          content: lesson.content.trim(),
          position: full?.lessons.length || 0,
        });
        setLesson({ title: '', type: 'video', content: '', media: '' });
        await load();
        onChanged();
      },
      'Lesson not added',
    );

  const dropLesson = (id: string) =>
    Alert.alert('Delete this lesson?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          run(
            `l-${id}`,
            async () => {
              await removeLesson(id);
              await load();
              onChanged();
            },
            'Could not delete',
          ),
      },
    ]);

  const saveQuestion = () =>
    run(
      'quiz',
      async () => {
        const text = q.text.trim();
        const options = q.opts.map((o) => o.trim()).filter(Boolean);
        if (!text || options.length < 2) throw new Error('A question and at least two options are required');
        if (q.type === 'fill' && !/_{2,}/.test(text)) throw new Error('Fill-in-the-blank questions need ___ in the question text');
        if (q.type === 'image' && !q.img) throw new Error('Pick an image for the question');
        const marked = q.opts[q.correct]?.trim();
        if (!marked) throw new Error('The option marked correct is empty');
        const correct_index = q.opts.map((o) => o.trim()).filter(Boolean).indexOf(marked);
        const question = q.type === 'mcq' ? text : packQuestion({ t: q.type as 'fill' | 'image', text, img: q.type === 'image' ? q.img : null });
        await addQuestion(courseId as string, { question, options, correct_index, position: full?.quiz.length || 0 });
        setQ({ type: q.type, text: '', opts: ['', '', '', ''], correct: 0, img: '' });
        await load();
        onChanged();
      },
      'Question not added',
    );

  const dropQuestion = (id: string) =>
    Alert.alert('Delete this question?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          run(
            `q-${id}`,
            async () => {
              await removeQuestion(id);
              await load();
              onChanged();
            },
            'Could not delete',
          ),
      },
    ]);

  const saveAssignment = () =>
    run(
      'assign',
      async () => {
        if (due && !DATE_RE.test(due)) throw new Error('Enter the due date as YYYY-MM-DD');
        const due_date = due || null;
        await assignCourse(courseId as string, all ? { all: true, due_date } : { employee_ids: [...picked], due_date });
        onChanged();
        Alert.alert('Saved', 'Assignment updated.');
      },
      'Not saved',
    );

  return (
    <FormSheet visible={!!courseId} title={full?.course.title || 'Course'} subtitle={full ? `${full.lessons.length} lessons · ${full.quiz.length} questions` : undefined} onClose={onClose}>
      <FilterChips items={TABS} activeKey={tab} onSelect={(k) => setTab(k as Tab)} />
      {loading && !full ? <ActivityIndicator color={brand.primary} style={styles.spin} /> : null}

      {full && tab === 'lessons' ? (
        <View>
          {full.lessons.length === 0 ? <EmptyNote text="No lessons yet — add the first below" icon="training" /> : null}
          {full.lessons.map((l, i) => (
            <ListRow
              key={l.id}
              icon="training"
              title={`${i + 1}. ${l.title}`}
              subtitle={l.type}
              meta={l.content || undefined}
              footer={<ActionButton label="Delete" tone="danger" busy={busy === `l-${l.id}`} onPress={() => dropLesson(l.id)} />}
            />
          ))}
          <SectionLabel>Add a lesson</SectionLabel>
          <Field label="Lesson title" value={lesson.title} onChangeText={(v) => setLesson({ ...lesson, title: v })} placeholder="e.g. How to install a DVR" />
          <FilterChips items={LESSON_TYPES} activeKey={lesson.type} onSelect={(k) => setLesson({ ...lesson, type: k })} />
          {lesson.type !== 'text' ? (
            <View>
              <Field label="Media link (optional)" value={lesson.media} onChangeText={(v) => setLesson({ ...lesson, media: v })} placeholder="https://… or uploaded path" autoCapitalize="none" />
              {lesson.type === 'video' || lesson.type === 'image' ? (
                <Pressable
                  onPress={() => pickMedia(lesson.type === 'video' ? ['videos'] : ['images'], (url) => setLesson((x) => ({ ...x, media: url })))}
                  disabled={uploading}
                  style={[styles.upload, { borderColor: theme.line, backgroundColor: theme.panel2 }]}
                >
                  {uploading ? <ActivityIndicator size="small" color={brand.primary} /> : <Text style={[styles.uploadText, { color: brand.primary }]}>{lesson.media ? 'Replace file' : 'Upload from phone'}</Text>}
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <Field label="Notes / content" value={lesson.content} onChangeText={(v) => setLesson({ ...lesson, content: v })} multiline placeholder="What the employee should learn" />
          <ActionButton label="Add lesson" busy={busy === 'lesson'} onPress={saveLesson} />
        </View>
      ) : null}

      {full && tab === 'quiz' ? (
        <View>
          {full.quiz.length === 0 ? <EmptyNote text="No questions yet — the course finishes when every lesson is done" icon="training" /> : null}
          {full.quiz.map((item, i) => {
            const d = decodeQuestion(item.question);
            return (
              <ListRow
                key={item.id}
                icon="training"
                title={`${i + 1}. ${questionLabel(d)}`}
                subtitle={item.options.map((o, oi) => `${oi === item.correct_index ? '✓' : '○'} ${o}`).join('   ')}
                meta={d.kind === 'mcq' ? 'Multiple choice' : d.kind === 'fill' ? 'Fill in the blank' : d.kind === 'image' ? 'Image question' : 'Match the following'}
                footer={<ActionButton label="Delete" tone="danger" busy={busy === `q-${item.id}`} onPress={() => dropQuestion(item.id)} />}
              />
            );
          })}
          <SectionLabel>Add a question</SectionLabel>
          <FilterChips items={Q_TYPES} activeKey={q.type} onSelect={(k) => setQ({ ...q, type: k })} />
          {q.type === 'image' ? (
            <Pressable
              onPress={() => pickMedia(['images'], (url) => setQ((x) => ({ ...x, img: url })))}
              disabled={uploading}
              style={[styles.upload, { borderColor: q.img ? brand.primary : theme.line, backgroundColor: theme.panel2 }]}
            >
              {uploading ? <ActivityIndicator size="small" color={brand.primary} /> : <Text style={[styles.uploadText, { color: brand.primary }]}>{q.img ? 'Question image ready — replace' : 'Pick the question image'}</Text>}
            </Pressable>
          ) : null}
          <Field
            label={q.type === 'fill' ? 'Question (write the blank as ___)' : 'Question'}
            value={q.text}
            onChangeText={(v) => setQ({ ...q, text: v })}
            multiline
          />
          <Text style={[styles.cap, { color: theme.text3 }]}>Tap the circle to mark the correct answer</Text>
          {q.opts.map((o, i) => (
            <View key={i} style={styles.optRow}>
              <Pressable
                onPress={() => setQ({ ...q, correct: i })}
                style={[styles.dot, { borderColor: q.correct === i ? semantic.success : theme.text3, backgroundColor: q.correct === i ? semantic.success : 'transparent' }]}
                accessibilityLabel={`Mark option ${i + 1} correct`}
              />
              <View style={styles.optField}>
                <Field label={`Option ${i + 1}${i < 2 ? ' (required)' : ''}`} value={o} onChangeText={(v) => setQ({ ...q, opts: q.opts.map((x, n) => (n === i ? v : x)) })} />
              </View>
            </View>
          ))}
          <ActionButton label="Add question" busy={busy === 'quiz'} onPress={saveQuestion} />
        </View>
      ) : null}

      {full && tab === 'assign' ? (
        <View>
          <View style={styles.switchRow}>
            <Switch value={all} onValueChange={setAll} trackColor={{ true: brand.primary }} />
            <Text style={[styles.switchText, { color: theme.text }]}>Assign to all employees (current and future)</Text>
          </View>
          {all ? null : (
            <View>
              {employees.map((e) => {
                const on = picked.has(e.id);
                return (
                  <ListRow
                    key={e.id}
                    icon="user"
                    iconColor={on ? semantic.success : undefined}
                    title={e.full_name || 'Employee'}
                    badge={on ? { label: 'Assigned', color: semantic.success } : undefined}
                    onPress={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(e.id)) next.delete(e.id);
                        else next.add(e.id);
                        return next;
                      })
                    }
                  />
                );
              })}
            </View>
          )}
          <Field label="Due date (optional)" value={due} onChangeText={setDue} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
          <ActionButton label="Save assignment" busy={busy === 'assign'} onPress={saveAssignment} />
        </View>
      ) : null}

      {full && tab === 'details' ? (
        <View>
          <Field label="Course title" value={details.title} onChangeText={(v) => setDetails({ ...details, title: v })} />
          <Field label="Category" value={details.category} onChangeText={(v) => setDetails({ ...details, category: v })} hint="General, CCTV, Video Door Phone, Networking…" />
          <Field label="Description" value={details.description} onChangeText={(v) => setDetails({ ...details, description: v })} multiline />
          <ActionButton label="Save details" busy={busy === 'details'} onPress={saveDetails} />
        </View>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  spin: { marginVertical: spacing(6) },
  upload: { borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing(3), alignItems: 'center', marginBottom: spacing(3) },
  uploadText: { ...typography.caption, fontWeight: '700' },
  cap: { ...typography.caption, marginBottom: spacing(2) },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  optField: { flex: 1 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginTop: spacing(4) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginVertical: spacing(3) },
  switchText: { ...typography.body, flex: 1 },
});
