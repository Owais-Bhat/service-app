import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import SectionLabel from '../../components/admin/SectionLabel';
import Icon from '../../components/Icon';
import {
  awardTechnician,
  fetchJobCardLeaderboard,
  fetchJobCards,
  JobCardRow,
  logVerificationCall,
  saveJobCard,
  VerificationOutcome,
} from '../../api/adminOps';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { categoryColors, semantic } from '../../theme/tokens';
import { shortDate, timeAgo } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type JobView = 'pending' | 'verify' | 'board';

const CATEGORIES = Object.keys(categoryColors);
const OUTCOMES: { key: VerificationOutcome; label: string }[] = [
  { key: 'confirmed_ok', label: 'Confirmed OK' },
  { key: 'issue_found', label: 'Issue found' },
  { key: 'call_later', label: 'Call later' },
  { key: 'unreachable', label: 'No answer' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const STAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function lastMonths(n: number) {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

// Job cards: write up a finished job, log the 3-day verification call, and
// award the monthly top technician — the three steps the web Job Cards page has.
export default function JobCardsAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [view, setView] = useState<JobView>('pending');
  const [month, setMonth] = useState(currentMonth());

  const pending = useLoader(() => fetchJobCards('pending'), 'Could not load pending job cards');
  const verify = useLoader(() => fetchJobCards('awaiting-verification'), 'Could not load verification calls');
  const board = useLoader(() => fetchJobCardLeaderboard(month), 'Could not load the leaderboard');

  const [entry, setEntry] = useState<JobCardRow | null>(null);
  const [call, setCall] = useState<JobCardRow | null>(null);

  const active = view === 'pending' ? pending : view === 'verify' ? verify : board;
  const reloadAll = useCallback(async () => {
    await Promise.all([pending.reload(), verify.reload(), board.reload()]);
  }, [pending, verify, board]);

  return (
    <AdminScreen
      title="Job Cards"
      subtitle="Write-up, verification call, bonus"
      onBack={onBack}
      onRefresh={reloadAll}
      loading={active.loading}
      error={active.error}
      toolbar={
        <FilterChips
          activeKey={view}
          onSelect={(k) => setView(k as JobView)}
          items={[
            { key: 'pending', label: 'Pending entry', count: pending.data?.length },
            { key: 'verify', label: 'Verification', count: verify.data?.length },
            { key: 'board', label: 'Leaderboard' },
          ]}
        />
      }
    >
      {view === 'pending' ? (
        (pending.data ?? []).length === 0 ? (
          <EmptyNote text="No jobs are waiting for a job card" icon="check-circle" />
        ) : (
          (pending.data ?? []).map((r) => (
            <ListRow
              key={r.id}
              icon="ticket"
              title={r.full_name || 'Customer'}
              subtitle={r.service_item || undefined}
              meta={`${r.ticket_no || ''} · ${[r.assigned_name, r.secondary_name].filter(Boolean).join(', ') || 'Unassigned'} · ${shortDate(r.created_at)}`}
              footer={<ActionButton label="Enter job card" onPress={() => setEntry(r)} />}
            />
          ))
        )
      ) : null}

      {view === 'verify' ? (
        (verify.data ?? []).length === 0 ? (
          <EmptyNote text="No verification calls are due" icon="phone" />
        ) : (
          (verify.data ?? []).map((r) => {
            const due = r.verification_due_at ? new Date(r.verification_due_at) : null;
            const overdue = !!due && due.getTime() <= Date.now();
            const tries = Number(r.verification_attempts) || 0;
            return (
              <ListRow
                key={r.id}
                icon="phone"
                iconColor={overdue ? semantic.danger : semantic.warning}
                title={r.full_name || 'Customer'}
                subtitle={r.phone || undefined}
                meta={
                  r.verification_call_status
                    ? `${r.verification_call_status === 'call_later' ? 'Asked to call later' : 'No answer'} · ${tries} ${tries === 1 ? 'try' : 'tries'}${r.verification_call_note ? ` · ${r.verification_call_note}` : ''}`
                    : `Not called yet${due ? ` · due ${timeAgo(r.verification_due_at).replace(' ago', '')}` : ''}`
                }
                badge={{ label: overdue ? 'Call now' : due ? shortDate(r.verification_due_at) : 'Due', color: overdue ? semantic.danger : semantic.info }}
                footer={
                  <>
                    {r.phone ? <ActionButton label="Call" tone="neutral" onPress={() => Linking.openURL(`tel:${r.phone}`)} /> : null}
                    <ActionButton label={r.verification_call_status ? 'Call again' : 'Log call'} onPress={() => setCall(r)} />
                  </>
                }
              />
            );
          })
        )
      ) : null}

      {view === 'board' ? (
        <>
          <FilterChips items={lastMonths(6)} activeKey={month} onSelect={setMonth} />
          <SectionLabel>{`Leaderboard ${month}`}</SectionLabel>
          {(board.data?.leaderboard ?? []).length === 0 ? <EmptyNote text="No verified jobs this month" icon="leaderboard" /> : null}
          {(board.data?.leaderboard ?? []).map((r, i) => {
            const awarded = board.data?.awarded?.employee_id === r.employeeId;
            return (
              <ListRow
                key={r.employeeId}
                icon={i === 0 ? 'star' : 'user'}
                iconColor={i === 0 ? semantic.warning : undefined}
                title={`${i + 1}. ${r.name}`}
                subtitle={`${r.jobsCount} verified · rating ${r.avgRating != null ? r.avgRating.toFixed(1) : '—'} · time ${r.avgTimeEfficiency != null ? Math.round(r.avgTimeEfficiency * 100) + '%' : '—'}`}
                meta={r.bonusPoints ? `+${r.bonusPoints} bonus points` : undefined}
                value={String(r.totalScore)}
                footer={
                  awarded ? (
                    <Text style={[styles.awarded, { color: semantic.success }]}>Awarded ₹{board.data?.awarded?.amount}</Text>
                  ) : board.data?.awarded ? undefined : (
                    <ActionButton
                      label="Award ₹2000"
                      onPress={() =>
                        Alert.alert('Award technician', `Award ₹2000 to ${r.name} for ${month}?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Award',
                            onPress: async () => {
                              try {
                                await awardTechnician(month, r.employeeId);
                                board.reload();
                              } catch (e) {
                                Alert.alert('Could not award', e instanceof Error ? e.message : 'Try again');
                              }
                            },
                          },
                        ])
                      }
                    />
                  )
                }
              />
            );
          })}
        </>
      ) : null}

      <EntrySheet job={entry} onClose={() => setEntry(null)} onSaved={() => { setEntry(null); pending.reload(); verify.reload(); }} />
      <CallSheet job={call} onClose={() => setCall(null)} onSaved={() => { setCall(null); verify.reload(); board.reload(); }} />
    </AdminScreen>
  );
}

function Chips<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.chipRow}>
      {items.map((c) => {
        const on = c.key === value;
        return (
          <Pressable
            key={c.key}
            onPress={() => onChange(c.key)}
            style={[styles.chip, { borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.okS : theme.panel }]}
          >
            <Text style={[styles.chipText, { color: on ? theme.accent : theme.text2 }]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EntrySheet({ job, onClose, onSaved }: { job: JobCardRow | null; onClose: () => void; onSaved: () => void }) {
  const { theme } = useTheme();
  const [type, setType] = useState<'installation' | 'service'>('service');
  const [category, setCategory] = useState('CCTV');
  const [start, setStart] = useState(stamp(new Date(Date.now() - 2 * 3600000)));
  const [end, setEnd] = useState(stamp(new Date()));
  const [expected, setExpected] = useState('');
  const [note, setNote] = useState('');
  const [rework, setRework] = useState(false);
  const [items, setItems] = useState<{ item_name: string; quantity: string; notes: string }[]>([{ item_name: '', quantity: '', notes: '' }]);
  const [busy, setBusy] = useState(false);

  const setItem = (i: number, patch: Partial<(typeof items)[number]>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const save = async () => {
    if (!job) return;
    if (!STAMP_RE.test(start) || !STAMP_RE.test(end)) {
      Alert.alert('Check the times', 'Use the format YYYY-MM-DD HH:MM');
      return;
    }
    setBusy(true);
    try {
      await saveJobCard(job.id, {
        job_card_type: type,
        category,
        secondary_employee_id: null,
        job_start_time: `${start}:00`,
        job_end_time: `${end}:00`,
        expected_time_minutes: Number(expected) || null,
        work_done_note: note.trim(),
        rework_required: rework,
        items: items.filter((it) => it.item_name.trim()).map((it) => ({ ...it, item_name: it.item_name.trim() })),
      });
      onSaved();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      visible={!!job}
      title="Job card"
      subtitle={job ? `${job.ticket_no || ''} · ${job.full_name || ''}` : undefined}
      onClose={onClose}
      footer={
        <>
          <ActionButton label="Cancel" tone="neutral" onPress={onClose} />
          <ActionButton label="Save job card" onPress={save} busy={busy} />
        </>
      }
    >
      <Text style={[styles.label, { color: theme.text3 }]}>Job type</Text>
      <Chips items={[{ key: 'service', label: 'Service' }, { key: 'installation', label: 'Installation' }]} value={type} onChange={setType} />
      <Text style={[styles.label, { color: theme.text3 }]}>Category</Text>
      <Chips items={CATEGORIES.map((c) => ({ key: c, label: c }))} value={category} onChange={setCategory} />
      <Field label="Started" value={start} onChangeText={setStart} hint="YYYY-MM-DD HH:MM" />
      <Field label="Finished" value={end} onChangeText={setEnd} hint="YYYY-MM-DD HH:MM" />
      <Field label="Expected time (minutes)" value={expected} onChangeText={setExpected} keyboardType="numeric" />
      <Field label="Work done" value={note} onChangeText={setNote} multiline />
      <Pressable onPress={() => setRework((v) => !v)} style={styles.checkRow}>
        <Icon name={rework ? 'check-circle' : 'tasks'} size={20} color={rework ? theme.accent : theme.text3} filled={rework} />
        <Text style={[styles.checkText, { color: theme.text }]}>Rework needed</Text>
      </Pressable>
      <Text style={[styles.label, { color: theme.text3 }]}>Items installed / used</Text>
      {items.map((it, i) => (
        <View key={i} style={styles.itemBox}>
          <Field label="Item" value={it.item_name} onChangeText={(v) => setItem(i, { item_name: v })} />
          <View style={styles.itemRow}>
            <View style={styles.itemQty}>
              <Field label="Qty" value={it.quantity} onChangeText={(v) => setItem(i, { quantity: v })} />
            </View>
            <View style={styles.itemNote}>
              <Field label="Notes" value={it.notes} onChangeText={(v) => setItem(i, { notes: v })} />
            </View>
          </View>
        </View>
      ))}
      <ActionButton label="+ Add item" tone="neutral" onPress={() => setItems((p) => [...p, { item_name: '', quantity: '', notes: '' }])} />
    </FormSheet>
  );
}

function CallSheet({ job, onClose, onSaved }: { job: JobCardRow | null; onClose: () => void; onSaved: () => void }) {
  const { theme } = useTheme();
  const [outcome, setOutcome] = useState<VerificationOutcome>('confirmed_ok');
  const [rating, setRating] = useState('5');
  const [note, setNote] = useState('');
  const tomorrow = useMemo(() => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(11, 0, 0, 0);
    return stamp(d);
  }, []);
  const [again, setAgain] = useState(tomorrow);
  const [busy, setBusy] = useState(false);
  const retry = outcome === 'call_later' || outcome === 'unreachable';

  const save = async () => {
    if (!job) return;
    if (retry && !STAMP_RE.test(again)) {
      Alert.alert('Check the time', 'Use the format YYYY-MM-DD HH:MM');
      return;
    }
    setBusy(true);
    try {
      await logVerificationCall(job.id, {
        status: outcome,
        rating: !retry ? Number(rating) || null : null,
        note: note.trim(),
        ...(retry ? { call_again_at: again } : {}),
      });
      setNote('');
      onSaved();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      visible={!!job}
      title="Verification call"
      subtitle={job ? `${job.full_name || ''} · ${job.phone || ''}` : undefined}
      onClose={onClose}
      footer={
        <>
          <ActionButton label="Cancel" tone="neutral" onPress={onClose} />
          <ActionButton label="Save" onPress={save} busy={busy} />
        </>
      }
    >
      <Text style={[styles.label, { color: theme.text3 }]}>Outcome</Text>
      <Chips items={OUTCOMES} value={outcome} onChange={setOutcome} />
      {retry ? (
        <Field label="Call again on" value={again} onChangeText={setAgain} hint="YYYY-MM-DD HH:MM — the job stays in Verification until then" />
      ) : (
        <>
          <Text style={[styles.label, { color: theme.text3 }]}>Customer rating</Text>
          <Chips items={['1', '2', '3', '4', '5'].map((n) => ({ key: n, label: `${n} ★` }))} value={rating} onChange={setRating} />
        </>
      )}
      <Field label="Note" value={note} onChangeText={setNote} multiline />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  awarded: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  label: { ...typography.caption, fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  chipText: { ...typography.caption, fontSize: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  checkText: { ...typography.body },
  itemBox: { gap: spacing(2) },
  itemRow: { flexDirection: 'row', gap: spacing(2) },
  itemQty: { width: 90 },
  itemNote: { flex: 1 },
});
