import React, { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import Icon from '../../components/Icon';
import { fetchTracker, resendAssignment, TrackerRow } from '../../api/adminManage';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme';
import { dateTime } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'not_seen' | 'not_accepted' | 'all';

function waiting(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60 ? `${min % 60} min` : ''}`.trim();
  return `${Math.floor(h / 24)} days`;
}

// The four delivery steps of an assignment: WhatsApp sent -> delivered -> read,
// then the technician accepting it (design a_queue).
function stepsFor(r: TrackerRow): { label: string; done: boolean; note: string }[] {
  const state = r.whatsapp.state;
  const sent = ['sent', 'delivered', 'read'].includes(state);
  const delivered = ['delivered', 'read'].includes(state);
  const read = state === 'read' || !!r.app_opened_at;
  return [
    { label: 'Sent', done: sent, note: sent && r.whatsapp.at ? dateTime(r.whatsapp.at) : state === 'failed' ? 'Failed' : '—' },
    { label: 'Delivered', done: delivered, note: delivered ? 'Yes' : '—' },
    { label: 'Read', done: read, note: r.app_opened_at ? 'In app' : read ? 'WhatsApp' : '—' },
    { label: 'Accepted', done: r.accepted, note: r.accepted ? 'Yes' : '—' },
  ];
}

// Who has noticed the job they were given? A job is "seen" once the technician
// read the WhatsApp, opened it in the app, or accepted it.
export default function AssignmentTrackerScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState<Filter>('not_seen');
  const fetcher = useCallback(() => fetchTracker(filter), [filter]);
  const data = useLoader(fetcher, 'Could not load the tracker');
  const [busy, setBusy] = useState<string | null>(null);

  const resend = async (kind: string, id: string) => {
    setBusy(id);
    try {
      await resendAssignment(kind, id);
      Alert.alert('Sent', 'The WhatsApp was sent again.');
      await data.reload();
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const counts = data.data?.counts;
  const rows = data.data?.rows ?? [];

  return (
    <AdminScreen
      title="Assignment Tracker"
      subtitle="Sent → delivered → read → accepted"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      toolbar={
        <FilterChips
          activeKey={filter}
          onSelect={(k) => setFilter(k as Filter)}
          items={[
            { key: 'not_seen', label: 'Not seen', count: counts?.not_seen },
            { key: 'not_accepted', label: 'Not accepted', count: counts?.not_accepted },
            { key: 'all', label: 'All open jobs', count: counts?.all },
          ]}
        />
      }
    >
      {rows.length === 0 ? <EmptyNote text={filter === 'not_seen' ? 'Everyone has seen the jobs they were given' : 'Nothing here'} icon="check-circle" /> : null}
      {rows.map((r) => {
        const steps = stepsFor(r);
        return (
          <View key={r.id} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            <View style={styles.head}>
              <View style={styles.headText}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{r.customer_name}</Text>
                <Text style={[styles.sub, { color: theme.text3 }]} numberOfLines={1}>
                  <Text style={styles.mono}>{r.ticket_no || '—'}</Text>
                  {` · ${r.employee_name || 'Unassigned'}${r.service ? ` · ${r.service}` : ''}`}
                </Text>
              </View>
              <Text style={[styles.age, { color: r.seen ? theme.text2 : theme.warn }]}>{waiting(r.minutes_waiting)}</Text>
            </View>
            <View style={styles.steps}>
              {steps.map((p) => (
                <View key={p.label} style={styles.step}>
                  <View style={[styles.bar, { backgroundColor: p.done ? theme.accent : theme.line }]} />
                  <View style={styles.stepLabel}>
                    <Icon name={p.done ? 'check-circle' : 'dot'} size={12} color={p.done ? theme.accent : theme.text3} filled={p.done} />
                    <Text style={[styles.stepText, { color: p.done ? theme.text : theme.text3 }]} numberOfLines={1}>{p.label}</Text>
                  </View>
                  <Text style={[styles.stepNote, { color: theme.text3 }]} numberOfLines={1}>{p.note}</Text>
                </View>
              ))}
            </View>
            <View style={styles.actions}>
              <ActionButton label="Share to group" tone="neutral" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(r.group_text)}`)} />
              <ActionButton label="Send again" busy={busy === r.id} onPress={() => resend(r.kind, r.id)} />
            </View>
          </View>
        );
      })}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5), marginBottom: spacing(2.5), gap: spacing(3) },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2) },
  headText: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 15, lineHeight: 20 },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16, marginTop: 1 },
  mono: { fontFamily: 'JetBrainsMono_700Bold' },
  age: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  steps: { flexDirection: 'row', gap: spacing(1) },
  step: { flex: 1, gap: spacing(1.5) },
  bar: { height: 4, borderRadius: 2 },
  stepLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepText: { fontFamily: 'Manrope_700Bold', fontSize: 11, flexShrink: 1 },
  stepNote: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 10 },
  actions: { flexDirection: 'row', gap: spacing(2.5) },
});
