import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { createNotice, deleteNotice, fetchAllNotices, NoticeRow, updateNotice } from '../../api/adminPeople';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { humanize, shortDate } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

const PRIORITY_COLOR: Record<string, string> = { normal: semantic.info, high: semantic.warning, urgent: semantic.danger };
const BLANK = { title: '', body: '', priority: 'normal', expires: '', active: true };

// Notices shown on the employee dashboard: priority-coloured, optional expiry,
// hide/show without deleting.
export default function NoticesAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const list = useLoader(fetchAllNotices, 'Could not load notices');
  const [editing, setEditing] = useState<NoticeRow | 'new' | null>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const rows = list.data ?? [];
  const expired = (n: NoticeRow) => !!n.expires_at && new Date(n.expires_at).getTime() < Date.now();

  const open = (n: NoticeRow | 'new') => {
    setForm(
      n === 'new'
        ? BLANK
        : { title: n.title, body: n.body, priority: n.priority, expires: n.expires_at ? String(n.expires_at).replace('T', ' ').slice(0, 16) : '', active: Number(n.active) === 1 },
    );
    setEditing(n);
  };

  const save = async () => {
    const exp = form.expires.trim();
    if (!form.title.trim()) return Alert.alert('Title needed', 'Give the notice a title');
    if (!form.body.trim()) return Alert.alert('Message needed', 'Write the notice message');
    if (exp && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(exp)) return Alert.alert('Expiry', 'Use YYYY-MM-DD or YYYY-MM-DD HH:MM');
    const payload = {
      title: form.title.trim().slice(0, 160),
      body: form.body.trim(),
      priority: form.priority,
      active: form.active ? 1 : 0,
      expires_at: exp ? `${exp.length === 10 ? `${exp} 23:59` : exp}:00` : null,
    };
    setBusy(true);
    try {
      if (editing && editing !== 'new') await updateNotice(editing.id, payload);
      else await createNotice(payload, user?.id ?? null);
      setEditing(null);
      await list.reload();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (n: NoticeRow) => {
    try {
      await updateNotice(n.id, { active: Number(n.active) === 1 ? 0 : 1 });
      await list.reload();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    }
  };

  const remove = (n: NoticeRow) =>
    Alert.alert('Delete notice?', n.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNotice(n.id);
            await list.reload();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);

  return (
    <AdminScreen
      title="Notices"
      subtitle="Shown on the employee dashboard"
      onBack={onBack}
      onRefresh={list.reload}
      loading={list.loading}
      error={list.error}
      headerRight={
        <Pressable onPress={() => open('new')} hitSlop={8} style={[styles.add, { backgroundColor: brand.primary }]} accessibilityLabel="New notice">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
    >
      <StatGrid
        items={[
          { label: 'Total', value: rows.length },
          { label: 'Live', value: rows.filter((n) => Number(n.active) === 1 && !expired(n)).length, color: semantic.success },
          { label: 'Hidden', value: rows.filter((n) => Number(n.active) !== 1).length },
        ]}
      />
      {rows.length === 0 ? <EmptyNote text="No notices yet — tap + to post one" icon="notification" /> : null}
      {rows.map((n) => {
        const live = Number(n.active) === 1 && !expired(n);
        return (
          <ListRow
            key={n.id}
            icon="notification"
            iconColor={PRIORITY_COLOR[n.priority] ?? semantic.info}
            title={n.title}
            subtitle={n.body}
            meta={`Posted ${shortDate(n.created_at)}${n.expires_at ? ` · expires ${shortDate(n.expires_at)}` : ''}`}
            badge={{ label: live ? humanize(n.priority) : expired(n) ? 'Expired' : 'Hidden', color: live ? PRIORITY_COLOR[n.priority] ?? semantic.info : '#6d8278' }}
            onPress={() => open(n)}
            footer={
              <>
                <ActionButton label={Number(n.active) === 1 ? 'Hide' : 'Show'} tone="neutral" onPress={() => toggle(n)} />
                <ActionButton label="Delete" tone="danger" onPress={() => remove(n)} />
              </>
            }
          />
        );
      })}

      <FormSheet
        visible={editing !== null}
        title={editing === 'new' ? 'New notice' : 'Edit notice'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} />
            <ActionButton label="Publish" onPress={save} busy={busy} />
          </>
        }
      >
        <Field label="Title" value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
        <Field label="Message" value={form.body} onChangeText={(v) => setForm((f) => ({ ...f, body: v }))} multiline />
        <Text style={[styles.label, { color: theme.text3 }]}>Priority</Text>
        <View style={styles.chipRow}>
          {(['normal', 'high', 'urgent'] as const).map((p) => {
            const on = form.priority === p;
            return (
              <Pressable
                key={p}
                onPress={() => setForm((f) => ({ ...f, priority: p }))}
                style={[styles.chip, { borderColor: on ? PRIORITY_COLOR[p] : theme.line, backgroundColor: on ? PRIORITY_COLOR[p] + '22' : theme.panel2 }]}
              >
                <Text style={[styles.chipText, { color: on ? PRIORITY_COLOR[p] : theme.text2 }]}>{humanize(p)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Expires (optional)" value={form.expires} onChangeText={(v) => setForm((f) => ({ ...f, expires: v }))} hint="YYYY-MM-DD or YYYY-MM-DD HH:MM" />
        <Pressable onPress={() => setForm((f) => ({ ...f, active: !f.active }))} style={styles.check}>
          <Icon name={form.active ? 'check-circle' : 'tasks'} size={20} color={form.active ? brand.primary : theme.text3} filled={form.active} />
          <Text style={[styles.checkText, { color: theme.text }]}>Publish to the employee dashboard</Text>
        </Pressable>
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.caption, fontSize: 12 },
  chipRow: { flexDirection: 'row', gap: spacing(2) },
  chip: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing(2.5), alignItems: 'center' },
  chipText: { ...typography.caption, fontFamily: 'Manrope_700Bold' },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  checkText: { ...typography.body, flex: 1 },
});
