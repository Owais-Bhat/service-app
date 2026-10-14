import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AdminScreen from '../../components/admin/AdminScreen';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import Icon from '../../components/Icon';
import { resolveUploadUrl } from '../../api/client';
import { uploadMedia } from '../../api/upload';
import {
  createTutorial,
  deleteTutorial,
  fetchTutorials,
  fetchWatchProgress,
  saveTutorial,
  TutorialItem,
  WatchRow,
} from '../../api/adminTutorials';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { timeAgo } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

interface Draft {
  title: string;
  description: string;
  category: string;
  position: string;
  required: boolean;
  active: boolean;
  url: string;
  kind: 'image' | 'video';
}
const blank: Draft = { title: '', description: '', category: 'General', position: '0', required: true, active: true, url: '', kind: 'video' };

// Employee Tutorials: upload training media, edit or hide it, see who has
// finished each one and who is watching a video right now.
export default function TutorialsAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(fetchTutorials, 'Could not load tutorials');
  const [watch, setWatch] = useState<WatchRow[] | null>(null);
  const [editing, setEditing] = useState<{ item: TutorialItem | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const d = data.data;
  const items = d?.items ?? [];
  const employees = d?.employees ?? [];
  const watchRows = watch ?? d?.watch ?? [];

  const doneBy = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (d?.completions ?? []).forEach((c) => m.set(c.item_id, (m.get(c.item_id) || new Set()).add(c.employee_id)));
    return m;
  }, [d]);

  const pct = (item: TutorialItem) => (employees.length ? Math.round(((doneBy.get(item.id)?.size || 0) / employees.length) * 100) : 0);
  const avg = items.length ? Math.round(items.reduce((s, i) => s + pct(i), 0) / items.length) : 0;
  const fullyDone = items.filter((i) => employees.length > 0 && (doneBy.get(i.id)?.size || 0) >= employees.length).length;
  const videos = items.filter((i) => i.kind === 'video');

  const refreshWatch = async () => {
    try {
      setWatch(await fetchWatchProgress());
    } catch {
      /* keep what is on screen */
    }
  };

  const open = (item: TutorialItem | null) => {
    setEditing({ item });
    setDraft(
      item
        ? {
            title: item.title,
            description: item.description || '',
            category: item.category || 'General',
            position: String(item.position ?? 0),
            required: Number(item.required) !== 0,
            active: Number(item.active) === 1,
            url: item.url,
            kind: item.kind === 'image' ? 'image' : 'video',
          }
        : blank,
    );
  };

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo library access to choose a file.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const kind = asset.type === 'video' ? 'video' : 'image';
    setUploading(true);
    try {
      const url = await uploadMedia(asset.uri, kind);
      setDraft((x) => ({ ...x, url, kind }));
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Check your connection and try again');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!draft.title.trim()) return Alert.alert('Title needed', 'Give the tutorial a title.');
    if (!draft.url) return Alert.alert('Media needed', 'Choose an image or video file.');
    const body = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category.trim() || 'General',
      required: draft.required ? 1 : 0,
      kind: draft.kind,
      url: draft.url,
      position: Number(draft.position) || 0,
      active: draft.active ? 1 : 0,
    };
    setSaving(true);
    try {
      if (editing?.item) await saveTutorial(editing.item.id, body);
      else await createTutorial(body);
      setEditing(null);
      await data.reload();
    } catch (e: unknown) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (i: TutorialItem) => {
    try {
      await saveTutorial(i.id, { active: Number(i.active) === 1 ? 0 : 1 });
      await data.reload();
    } catch (e: unknown) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    }
  };

  const remove = (i: TutorialItem) =>
    Alert.alert('Delete this tutorial?', 'Completion records for it will also be removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTutorial(i.id);
            await data.reload();
          } catch (e: unknown) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);

  return (
    <AdminScreen
      title="Employee Tutorials"
      subtitle="Upload training media and watch completion"
      onBack={onBack}
      onRefresh={async () => {
        await data.reload();
        setWatch(null);
      }}
      loading={data.loading}
      error={data.error}
      headerRight={
        <Pressable onPress={() => open(null)} hitSlop={8} style={[styles.add, { backgroundColor: brand.primary }]} accessibilityLabel="Upload tutorial">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
    >
      {d ? (
        <>
          <StatGrid
            items={[
              { label: 'Tutorials', value: items.length },
              { label: 'Employees', value: employees.length },
              { label: 'Avg completion', value: `${avg}%`, color: semantic.success },
              { label: 'Fully completed', value: fullyDone, color: semantic.warning },
            ]}
          />
          {items.length === 0 ? <EmptyNote text="No tutorials uploaded yet — add your first" icon="tutorial" /> : null}
          {items.map((i) => {
            const done = doneBy.get(i.id) || new Set<string>();
            const pending = employees.filter((e) => !done.has(e.id)).map((e) => e.full_name || 'Employee');
            return (
              <View key={i.id}>
                {i.kind === 'image' ? <Image source={{ uri: resolveUploadUrl(i.url) }} style={styles.thumb} resizeMode="cover" /> : null}
                <ListRow
                  icon="tutorial"
                  iconColor={Number(i.active) === 1 ? semantic.success : '#6d8278'}
                  title={i.title}
                  subtitle={`${i.category || 'General'} · ${i.kind === 'video' ? 'Video' : 'Image'} · ${Number(i.required) !== 0 ? 'Required' : 'Optional'}`}
                  meta={
                    pending.length
                      ? `${done.size} / ${employees.length} completed · pending: ${pending.slice(0, 4).join(', ')}${pending.length > 4 ? ` +${pending.length - 4}` : ''}`
                      : `All ${employees.length} employees complete`
                  }
                  value={`${pct(i)}%`}
                  valueColor={pct(i) === 100 ? semantic.success : undefined}
                  badge={Number(i.active) === 1 ? undefined : { label: 'Hidden', color: '#6d8278' }}
                  footer={
                    <>
                      <ActionButton label={i.kind === 'video' ? 'Watch' : 'View'} tone="neutral" onPress={() => Linking.openURL(resolveUploadUrl(i.url))} />
                      <ActionButton label="Edit" tone="neutral" onPress={() => open(i)} />
                      <ActionButton label={Number(i.active) === 1 ? 'Hide' : 'Show'} tone="neutral" onPress={() => toggle(i)} />
                      <ActionButton label="Delete" tone="danger" onPress={() => remove(i)} />
                    </>
                  }
                />
              </View>
            );
          })}

          {videos.length ? (
            <>
              <SectionLabel>Live watch tracking</SectionLabel>
              <ActionButton label="Refresh watch progress" tone="neutral" onPress={refreshWatch} />
              {videos.map((v) => {
                const rows = watchRows.filter((r) => r.item_id === v.id).slice().sort((a, b) => (b.percent || 0) - (a.percent || 0));
                return (
                  <View key={v.id}>
                    <Text style={[styles.videoTitle, { color: theme.text }]}>
                      {v.title} · {rows.length} of {employees.length} started
                    </Text>
                    {rows.length === 0 ? (
                      <Text style={[styles.hint, { color: theme.text3 }]}>No one has opened this video yet.</Text>
                    ) : (
                      rows.map((r, n) => (
                        <ListRow
                          key={`${v.id}-${r.employee_id || n}`}
                          icon="user"
                          title={r.full_name || 'Employee'}
                          meta={r.updated_at ? timeAgo(r.updated_at) : undefined}
                          value={`${r.percent || 0}%`}
                          valueColor={(r.percent || 0) >= 90 ? semantic.success : undefined}
                        />
                      ))
                    )}
                  </View>
                );
              })}
            </>
          ) : null}
        </>
      ) : null}

      <FormSheet
        visible={!!editing}
        title={editing?.item ? 'Edit tutorial' : 'Upload tutorial'}
        onClose={() => setEditing(null)}
        footer={<ActionButton label={editing?.item ? 'Save' : 'Upload tutorial'} busy={saving} onPress={save} grow />}
      >
        <Field label="Title" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="e.g. How to bill a service" />
        <Field label="Description" value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} multiline placeholder="What should the employee learn from this?" />
        <View style={styles.pair}>
          <View style={styles.half}>
            <Field label="Category" value={draft.category} onChangeText={(v) => setDraft({ ...draft, category: v })} />
          </View>
          <View style={styles.half}>
            <Field label="Position" value={draft.position} onChangeText={(v) => setDraft({ ...draft, position: v })} keyboardType="number-pad" />
          </View>
        </View>
        <View style={[styles.media, { borderColor: draft.url ? brand.primary : theme.line, backgroundColor: theme.panel2 }]}>
          <View style={styles.mediaText}>
            <Text style={[styles.mediaTitle, { color: theme.text }]}>{draft.url ? (draft.kind === 'video' ? 'Video ready' : 'Image ready') : 'No file chosen'}</Text>
            <Text style={[styles.hint, { color: theme.text3 }]}>Keep videos under 3 minutes, max 50 MB.</Text>
          </View>
          <Pressable onPress={pick} disabled={uploading} style={[styles.pick, { borderColor: theme.line }]} accessibilityLabel="Choose file">
            {uploading ? <ActivityIndicator size="small" color={brand.primary} /> : <Text style={[styles.pickText, { color: brand.primary }]}>{draft.url ? 'Replace' : 'Choose'}</Text>}
          </Pressable>
        </View>
        <View style={styles.switchRow}>
          <Switch value={draft.required} onValueChange={(v) => setDraft({ ...draft, required: v })} trackColor={{ true: brand.primary }} />
          <Text style={[styles.switchText, { color: theme.text }]}>Required for all employees</Text>
        </View>
        <View style={styles.switchRow}>
          <Switch value={draft.active} onValueChange={(v) => setDraft({ ...draft, active: v })} trackColor={{ true: brand.primary }} />
          <Text style={[styles.switchText, { color: theme.text }]}>Active (visible to employees)</Text>
        </View>
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: '100%', height: 120, borderRadius: radius.md, marginBottom: spacing(2) },
  videoTitle: { ...typography.body, fontWeight: '700', marginTop: spacing(3), marginBottom: spacing(1) },
  hint: { ...typography.caption },
  pair: { flexDirection: 'row', gap: spacing(3) },
  half: { flex: 1 },
  media: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginVertical: spacing(3) },
  mediaText: { flex: 1 },
  mediaTitle: { ...typography.body, fontWeight: '700' },
  pick: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(2), minWidth: 72, alignItems: 'center' },
  pickText: { ...typography.caption, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginVertical: spacing(2) },
  switchText: { ...typography.body, flex: 1 },
});
