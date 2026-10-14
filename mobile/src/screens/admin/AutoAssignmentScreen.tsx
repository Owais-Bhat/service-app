import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import { fetchAutoAssignLogs, fetchAutoAssignStatus, setAutoAssign } from '../../api/adminManage';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { dateTime, shortTime } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

// Round-robin on whoever is clocked in today: the queue, who is next, the
// on/off switch and the audit log of every automatic assignment.
export default function AutoAssignmentScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(async () => {
    const [status, logs] = await Promise.all([fetchAutoAssignStatus(), fetchAutoAssignLogs()]);
    return { status, logs };
  }, 'Could not load auto-assignment');
  const [saving, setSaving] = useState(false);

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

  return (
    <AdminScreen title="Auto Assignment" subtitle="Round-robin on employees clocked in today" onBack={onBack} onRefresh={data.reload} loading={data.loading} error={data.error}>
      {status ? (
        <>
          <View style={[styles.switch, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
            <View style={styles.switchText}>
              <Text style={[styles.switchLabel, { color: theme.text }]}>Auto assign new requests</Text>
              <Text style={[styles.switchHint, { color: status.auto_assignment_enabled ? semantic.success : theme.text3 }]}>
                {status.auto_assignment_enabled ? 'ON — requests go to the next person in the queue' : 'OFF — requests wait for you to assign them'}
              </Text>
            </View>
            <Switch value={!!status.auto_assignment_enabled} disabled={saving} onValueChange={toggle} trackColor={{ true: brand.primary, false: theme.line }} />
          </View>

          <StatGrid
            items={[
              { label: 'Clocked in', value: queue.length, color: semantic.info },
              { label: 'Assigned today', value: status.total_today || 0, color: semantic.success },
              { label: 'Next up', value: next?.full_name || '—' },
            ]}
          />

          <SectionLabel>Current queue</SectionLabel>
          {queue.length === 0 ? <EmptyNote text="Nobody is clocked in right now" icon="people" /> : null}
          {queue.map((q) => (
            <ListRow
              key={q.id}
              icon="user"
              iconColor={q.is_next ? semantic.success : undefined}
              title={`#${q.queue_position}  ${q.full_name || 'Employee'}`}
              subtitle={q.clock_in ? `Clocked in ${shortTime(q.clock_in)}` : 'Offline — always assign'}
              meta={`${q.assignments_today || 0} assigned today`}
              badge={q.is_next ? { label: 'Next', color: semantic.success } : Number(q.always_assign) ? { label: 'Priority', color: brand.primary } : undefined}
            />
          ))}

          <SectionLabel>Recent assignments</SectionLabel>
          {(data.data?.logs ?? []).length === 0 ? <EmptyNote text="No automatic assignments yet" icon="swap" /> : null}
          {(data.data?.logs ?? []).map((l, i) => (
            <ListRow
              key={`${l.inquiry_id}-${i}`}
              icon="swap"
              title={l.customer_name || 'Customer'}
              subtitle={`${l.ticket_no || ''}${l.service_item ? ` · ${l.service_item}` : ''}`}
              meta={`${l.employee_name || 'Employee'} · position #${l.queue_position} · ${dateTime(l.assigned_at)}`}
              badge={{ label: l.inquiry_status || 'open', color: semantic.info }}
            />
          ))}
        </>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5), marginBottom: spacing(3) },
  switchText: { flex: 1, minWidth: 0 },
  switchLabel: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  switchHint: { ...typography.caption, fontSize: 12, marginTop: 2 },
});
