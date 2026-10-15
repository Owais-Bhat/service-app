import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import StatusBadge from '../../components/admin/StatusBadge';
import Field from '../../components/admin/Field';
import Icon from '../../components/Icon';
import CourseEditorSheet from '../../components/admin/CourseEditorSheet';
import { createCourse, deleteCourse } from '../../api/adminTraining';
import { CourseProgress, fetchCourseProgress, fetchTrainingCompliance, fetchTrainingCourses, setCourseActive } from '../../api/adminSettings';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { shortDate, timeAgo } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

// Courses and who has finished them, plus authoring: create a course, add
// lessons and quiz questions, assign it, hide or delete it.
export default function TrainingAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(async () => {
    const [courses, compliance] = await Promise.all([fetchTrainingCourses(), fetchTrainingCompliance()]);
    return { courses, compliance: new Map(compliance.map((c) => [c.course_id, c])) };
  }, 'Could not load training');
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', category: 'General', description: '' });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!draft.title.trim()) return Alert.alert('Title needed', 'Give the course a title.');
    setSaving(true);
    try {
      const res = await createCourse({ title: draft.title.trim(), category: draft.category.trim() || 'General', description: draft.description.trim() });
      setCreating(false);
      setDraft({ title: '', category: 'General', description: '' });
      await data.reload();
      if (res?.id) setEditId(res.id);
    } catch (e) {
      Alert.alert('Could not create', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  const remove = (id: string, title: string) =>
    Alert.alert('Delete this course?', `${title} — its lessons, quiz, assignments and completions are removed too.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCourse(id);
            await data.reload();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);

  const courses = data.data?.courses ?? [];

  const open = async (id: string) => {
    setOpening(id);
    try {
      setProgress(await fetchCourseProgress(id));
    } catch (e) {
      Alert.alert('Could not load progress', e instanceof Error ? e.message : 'Try again');
    } finally {
      setOpening(null);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    try {
      await setCourseActive(id, !active);
      await data.reload();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    }
  };

  return (
    <AdminScreen
      title="Training Courses"
      subtitle={`${courses.length} courses`}
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      headerRight={
        <Pressable onPress={() => setCreating(true)} hitSlop={8} style={[styles.add, { backgroundColor: brand.fill }]} accessibilityLabel="New course">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
    >
      <StatGrid
        items={[
          { label: 'Courses', value: courses.length },
          { label: 'Lessons', value: courses.reduce((s, c) => s + Number(c.lesson_count || 0), 0) },
          { label: 'Quiz questions', value: courses.reduce((s, c) => s + Number(c.quiz_count || 0), 0) },
          { label: 'Completions', value: [...(data.data?.compliance.values() ?? [])].reduce((s, c) => s + Number(c.completed || 0), 0), color: semantic.success },
        ]}
      />
      {courses.length === 0 ? <EmptyNote text="No courses yet — tap + to create one" icon="training" /> : null}
      {courses.map((c) => {
        const comp = data.data?.compliance.get(c.id);
        return (
          <ListRow
            key={c.id}
            icon="training"
            iconColor={Number(c.active) === 1 ? undefined : brand.grey}
            title={c.title}
            subtitle={`${c.category || 'General'} · ${c.lesson_count} lessons · ${c.quiz_count} questions`}
            meta={`${comp?.completed ?? 0} completed · ${c.assign_count} assignments`}
            badge={Number(c.active) === 1 ? undefined : { label: 'Hidden', color: brand.grey }}
            onPress={() => open(c.id)}
            footer={
              <>
                <ActionButton label="Edit" onPress={() => setEditId(c.id)} />
                <ActionButton label="Progress" tone="neutral" busy={opening === c.id} onPress={() => open(c.id)} />
                <ActionButton label={Number(c.active) === 1 ? 'Hide' : 'Show'} tone="neutral" onPress={() => toggle(c.id, Number(c.active) === 1)} />
                <ActionButton label="Delete" tone="danger" onPress={() => remove(c.id, c.title)} />
              </>
            }
          />
        );
      })}

      <FormSheet
        visible={!!progress}
        title={progress?.course.title || 'Progress'}
        subtitle={progress ? `${progress.lessons.length} lessons · ${progress.quizCount} questions` : undefined}
        onClose={() => setProgress(null)}
        footer={<ActionButton label="Close" tone="neutral" onPress={() => setProgress(null)} />}
      >
        {progress && progress.employees.length === 0 ? <Text style={[styles.note, { color: theme.text3 }]}>Nobody is assigned this course.</Text> : null}
        {progress?.employees.map((e) => {
          const total = progress.lessons.length;
          const done = e.completion ? 'Completed' : e.done_count > 0 ? 'In progress' : 'Not started';
          const color = e.completion ? semantic.success : e.done_count > 0 ? semantic.warning : brand.grey;
          const overdue = !e.completion && !!e.due_date && new Date(e.due_date).getTime() < Date.now();
          return (
            <View key={e.employee_id} style={[styles.person, { borderBottomColor: theme.line }]}>
              <View style={styles.personText}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{e.name}</Text>
                <Text style={[styles.sub, { color: theme.text3 }]}>
                  {e.done_count}/{total} lessons
                  {e.completion?.quiz_score != null ? ` · quiz ${e.completion.quiz_score}%` : ''}
                  {e.last_activity ? ` · ${timeAgo(e.last_activity)}` : ''}
                  {overdue ? ` · due ${shortDate(e.due_date)}` : ''}
                </Text>
              </View>
              <StatusBadge label={overdue ? 'Overdue' : done} color={overdue ? semantic.danger : color} />
            </View>
          );
        })}
      </FormSheet>
      <FormSheet
        visible={creating}
        title="New course"
        onClose={() => setCreating(false)}
        footer={<ActionButton label="Create course" busy={saving} onPress={create} grow />}
      >
        <Field label="Course title" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="e.g. CCTV Installation Basics" />
        <Field label="Category" value={draft.category} onChangeText={(v) => setDraft({ ...draft, category: v })} />
        <Field label="Description" value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} multiline placeholder="What this course teaches" />
      </FormSheet>

      <CourseEditorSheet courseId={editId} onClose={() => setEditId(null)} onChanged={data.reload} />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  note: { ...typography.body, textAlign: 'center', paddingVertical: spacing(4) },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2.5), borderBottomWidth: 1 },
  personText: { flex: 1, minWidth: 0 },
  name: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  sub: { ...typography.caption, fontSize: 11 },
});
