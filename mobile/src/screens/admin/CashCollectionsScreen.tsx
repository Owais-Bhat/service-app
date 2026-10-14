import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import StatGrid from '../../components/admin/StatGrid';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { BilledJob, fetchCashJobs, fetchPeople, recordCashSubmission } from '../../api/adminMoney';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { inr, shortDate } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

// Cash the technicians collected, per person. Tick what you were handed and
// press Record — that stamps cash_submitted_at, exactly as the web page does.
export default function CashCollectionsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const data = useLoader(async () => {
    const [jobs, people] = await Promise.all([fetchCashJobs(), fetchPeople()]);
    return { jobs, names: new Map(people.map((p) => [p.id, p.full_name || 'Employee'])) };
  }, 'Could not load cash collections');

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; pending: BilledJob[]; submitted: BilledJob[] }>();
    (data.data?.jobs ?? []).forEach((j) => {
      if (!j.assigned_employee_id || !j.cash_collected_at) return;
      if (!map.has(j.assigned_employee_id)) {
        map.set(j.assigned_employee_id, { id: j.assigned_employee_id, name: data.data!.names.get(j.assigned_employee_id) || 'Employee', pending: [], submitted: [] });
      }
      const g = map.get(j.assigned_employee_id)!;
      (j.cash_submitted_at ? g.submitted : g.pending).push(j);
    });
    return [...map.values()].sort((a, b) => b.pending.length - a.pending.length);
  }, [data.data]);

  const sum = (list: BilledJob[]) => list.reduce((s, j) => s + (Number(j.bill_total) || 0), 0);
  const allPending = groups.flatMap((g) => g.pending);
  const allSubmitted = groups.flatMap((g) => g.submitted);

  const isOn = (id: string) => picked[id] !== false; // everything pending is ticked by default
  const toggle = (id: string) => setPicked((p) => ({ ...p, [id]: !isOn(id) }));

  const record = (g: { id: string; name: string; pending: BilledJob[] }) => {
    const ids = g.pending.filter((j) => isOn(j.id));
    if (ids.length === 0) {
      Alert.alert('Nothing selected', 'Tick at least one record');
      return;
    }
    Alert.alert('Record submission', `${inr(sum(ids))} received from ${g.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Record',
        onPress: async () => {
          setBusy(g.id);
          try {
            await recordCashSubmission(ids.map((j) => j.id), user?.id ?? null);
            setPicked({});
            await data.reload();
          } catch (e) {
            Alert.alert('Could not record', e instanceof Error ? e.message : 'Try again');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <AdminScreen
      title="Cash Collections"
      subtitle="Cash held by technicians"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
    >
      <StatGrid
        items={[
          { label: 'Pending', value: inr(sum(allPending)), color: semantic.warning },
          { label: 'Submitted', value: inr(sum(allSubmitted)), color: semantic.success },
          { label: 'Pending records', value: allPending.length },
          { label: 'Employees', value: groups.length },
        ]}
      />
      {groups.length === 0 ? <EmptyNote text="No cash collected yet" icon="cash" /> : null}
      {groups.map((g) => {
        const chosen = g.pending.filter((j) => isOn(j.id));
        return (
          <View key={g.id} style={[styles.card, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
            <View style={styles.head}>
              <View style={styles.headText}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{g.name}</Text>
                <Text style={[styles.sub, { color: theme.text3 }]}>
                  Submitted {inr(sum(g.submitted))} · {g.submitted.length} records
                </Text>
              </View>
              <Text style={[styles.pending, { color: g.pending.length ? semantic.warning : theme.text3 }]}>{inr(sum(g.pending))}</Text>
            </View>
            {g.pending.length === 0 ? (
              <Text style={[styles.sub, { color: theme.text3 }]}>No pending cash from this employee.</Text>
            ) : (
              <>
                {g.pending.map((j) => {
                  const on = isOn(j.id);
                  return (
                    <Pressable key={j.id} onPress={() => toggle(j.id)} style={[styles.line, { borderTopColor: theme.line }]}>
                      <Icon name={on ? 'check-circle' : 'tasks'} size={20} color={on ? brand.primary : theme.text3} filled={on} />
                      <View style={styles.headText}>
                        <Text style={[styles.lineTitle, { color: theme.text }]} numberOfLines={1}>{j.full_name || 'Customer'}</Text>
                        <Text style={[styles.sub, { color: theme.text3 }]} numberOfLines={1}>
                          {j.ticket_no || ''} · {shortDate(j.cash_collected_at)}
                        </Text>
                      </View>
                      <Text style={[styles.lineAmt, { color: theme.text }]}>{inr(j.bill_total)}</Text>
                    </Pressable>
                  );
                })}
                <View style={styles.actions}>
                  <ActionButton label={`Record ${inr(sum(chosen))}`} tone="success" busy={busy === g.id} onPress={() => record(g)} />
                </View>
              </>
            )}
          </View>
        );
      })}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5), marginBottom: spacing(3) },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2) },
  headText: { flex: 1, minWidth: 0 },
  name: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  sub: { ...typography.caption, fontSize: 11 },
  pending: { ...typography.heading, fontSize: 18 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2.5), borderTopWidth: 1 },
  lineTitle: { ...typography.body, fontSize: 14 },
  lineAmt: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  actions: { flexDirection: 'row', marginTop: spacing(2) },
});
