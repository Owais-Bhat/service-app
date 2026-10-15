import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import ActionButton from '../../components/admin/ActionButton';
import FormSheet from '../../components/admin/FormSheet';
import Icon from '../../components/Icon';
import { fetchAutoAssignLogs, fetchAutoAssignStatus, setAutoAssign } from '../../api/adminManage';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';
import { dateTime, shortTime } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

// Round-robin on whoever is clocked in today: the queue, who is next, the
// on/off switch and the audit log of every automatic assignment. Turning it
// off asks first (design a_auto_off); turning it on is immediate.
export default function AutoAssignmentScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(async () => {
    const [status, logs] = await Promise.all([fetchAutoAssignStatus(), fetchAutoAssignLogs()]);
    return { status, logs };
  }, 'Could not load auto-assignment');
  const [saving, setSaving] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const status = data.data?.status;
  const queue = status?.queue ?? [];
  const next = queue.find((q) => q.is_next);

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      await setAutoAssign(enabled);
      await data.reload();
    } catch (e) {
      Alert.alert('Could not change', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  const onSwitch = (enabled: boolean) => {
    if (enabled) toggle(true);
    else setConfirmOff(true);
  };

  return (
    <AdminScreen title="Auto Assignment" subtitle="Round-robin on employees clocked in today" onBack={onBack} onRefresh={data.reload} loading={data.loading} error={data.error}>
      {status ? (
        <>
          <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: theme.text }]}>Auto assign new requests</Text>
              <Text style={[styles.heroHint, { color: status.auto_assignment_enabled ? theme.ok : theme.text2 }]}>
                {status.auto_assignment_enabled ? 'ON — requests go to the next person in the queue' : 'OFF — requests wait for you to assign them'}
              </Text>
            </View>
            <Switch
              value={!!status.auto_assignment_enabled}
              disabled={saving}
              onValueChange={onSwitch}
              trackColor={{ true: brand.fill, false: theme.line }}
              thumbColor="#ffffff"
            />
          </View>

          <StatGrid
            items={[
              { label: 'Clocked in', value: queue.length, color: theme.info },
              { label: 'Assigned today', value: status.total_today || 0, color: theme.ok },
              { label: 'Next up', value: next?.full_name || '—' },
            ]}
          />

          <SectionLabel>Round-robin queue</SectionLabel>
          {queue.length === 0 ? <EmptyNote text="Nobody is clocked in right now" icon="people" /> : null}
          {queue.length > 0 ? (
            <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              {queue.map((q, idx) => (
                <View key={q.id} style={[styles.qRow, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
                  <Text style={[styles.qIndex, { color: theme.text3 }]}>{q.queue_position}</Text>
                  <View style={styles.qText}>
                    <Text style={[styles.qName, { color: theme.text }]} numberOfLines={1}>{q.full_name || 'Employee'}</Text>
                    <Text style={[styles.qMeta, { color: theme.text3 }]} numberOfLines={1}>
                      {q.clock_in ? `Clocked in ${shortTime(q.clock_in)}` : 'Offline — always assign'} · {q.assignments_today || 0} assigned today
                    </Text>
                  </View>
                  {q.is_next ? (
                    <View style={[styles.badge, { backgroundColor: theme.okS }]}>
                      <Icon name="check-circle" size={12} color={theme.ok} filled />
                      <Text style={[styles.badgeText, { color: theme.ok }]}>Next</Text>
                    </View>
                  ) : Number(q.always_assign) ? (
                    <View style={[styles.badge, { backgroundColor: theme.okS }]}>
                      <Text style={[styles.badgeText, { color: theme.accent }]}>Priority</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <SectionLabel>Recent assignments</SectionLabel>
          {(data.data?.logs ?? []).length === 0 ? <EmptyNote text="No automatic assignments yet" icon="swap" /> : null}
          {(data.data?.logs ?? []).map((l, i) => (
            <ListRow
              key={`${l.inquiry_id}-${i}`}
              icon="swap"
              title={l.customer_name || 'Customer'}
              subtitle={`${l.ticket_no || ''}${l.service_item ? ` · ${l.service_item}` : ''}`}
              meta={`${l.employee_name || 'Employee'} · position #${l.queue_position} · ${dateTime(l.assigned_at)}`}
              badge={{ label: l.inquiry_status || 'open', color: theme.info }}
            />
          ))}
        </>
      ) : null}

      <FormSheet
        visible={confirmOff}
        title="Turn off auto-assignment?"
        onClose={() => setConfirmOff(false)}
        footer={
          <>
            <ActionButton label="Keep on" tone="neutral" onPress={() => setConfirmOff(false)} />
            <ActionButton
              label="Turn off"
              onPress={() => {
                setConfirmOff(false);
                toggle(false);
              }}
            />
          </>
        }
      >
        <View style={[styles.offTile, { backgroundColor: theme.warnS }]}>
          <Icon name="alert" size={24} color={theme.warn} />
        </View>
        <Text style={[styles.offBody, { color: theme.text2 }]}>
          New requests will wait unassigned until someone assigns them.
        </Text>
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.xl, padding: spacing(4), marginBottom: spacing(3) },
  heroText: { flex: 1, minWidth: 0 },
  heroTitle: { ...typography.rowTitle, fontSize: 16 },
  heroHint: { ...typography.supporting, fontSize: 12, lineHeight: 16, marginTop: 2 },
  panel: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing(3) },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(3.5), paddingVertical: spacing(3) },
  qIndex: { width: 24, fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
  qText: { flex: 1, minWidth: 0 },
  qName: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 19 },
  qMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, borderRadius: radius.full, paddingHorizontal: spacing(2.5) },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  offTile: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  offBody: { ...typography.supporting, fontSize: 14, lineHeight: 20 },
});
