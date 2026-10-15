import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import FilterChips from '../components/admin/FilterChips';
import ListRow from '../components/admin/ListRow';
import ActionButton from '../components/admin/ActionButton';
import EmptyNote from '../components/admin/EmptyNote';
import FormSheet from '../components/admin/FormSheet';
import Field from '../components/admin/Field';
import SectionLabel from '../components/admin/SectionLabel';
import Icon from '../components/Icon';
import InstallationDetailSheet, { EmployeeOption } from '../components/InstallationDetailSheet';
import { radius, spacing } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { api, dataDelete, dataGet, dataPatch, dataPost } from '../api/client';
import { fetchAllInstallations, InstallationJob } from '../api/installations';
import { shortDate, todayIso } from '../utils/format';

interface Props {
  onBack: () => void;
}

const FILTERS = ['Open', 'Unassigned', 'Unpaid', 'All'] as const;
type Filter = typeof FILTERS[number];

const num = (v: unknown) => Number(v || 0);
const NEUTRAL = '#8aa79a';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// What state this booking is really in, in the order that matters to the
// office: unassigned first, then waiting on the technician, then money owed.
function pill(job: InstallationJob): { label: string; color: string } {
  if (!job.assigned_employee_id) return { label: 'Unassigned', color: semantic.danger };
  if (job.assignment_status === 'pending') return { label: 'Awaiting accept', color: semantic.warning };
  if (job.assignment_status === 'declined') return { label: 'Declined', color: semantic.danger };
  if (num(job.bill_total) > 0 && String(job.payment_status || '').toLowerCase() !== 'paid') {
    return { label: `₹${Math.round(num(job.bill_total))} unpaid`, color: semantic.warning };
  }
  if (job.completed_at) return { label: 'Completed', color: semantic.success };
  if (job.started_at) return { label: 'In progress', color: brand.primary };
  return { label: 'Assigned', color: NEUTRAL };
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface Draft {
  name: string;
  phone: string;
  location: string;
  type: string;
  date: string;
  time: string;
  emp: string;
  address: string;
  details: string;
}
const blank = (): Draft => ({ name: '', phone: '', location: '', type: '', date: todayIso(), time: '', emp: '', address: '', details: '' });

// Admin's own view of every installation: book one, edit or delete it, assign
// it, push the status along, and mark the bill paid when the money lands — the
// same sheet the technician uses on site, so both sides see one history.
export default function AdminInstallationsScreen({ onBack }: Props) {
  const [rows, setRows] = useState<InstallationJob[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [filter, setFilter] = useState<Filter>('Open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ job: InstallationJob | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchAllInstallations());
      setError(null);
    } catch {
      setError('Could not load installations — pull to retry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    dataGet<EmployeeOption[]>('profiles', { eq: ['role:employee'], order: 'full_name:asc' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  const nameOf = (empId?: string | null) => employees.find((e) => e.id === empId)?.full_name || '';

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const paid = String(r.payment_status || '').toLowerCase() === 'paid';
        if (filter === 'Unassigned') return !r.assigned_employee_id;
        if (filter === 'Unpaid') return num(r.bill_total) > 0 && !paid;
        if (filter === 'Open') return !r.completed_at || (num(r.bill_total) > 0 && !paid);
        return true;
      }),
    [rows, filter],
  );

  const openEditor = (job: InstallationJob | null) => {
    setEditing({ job });
    setDraft(
      job
        ? {
            name: job.full_name || '',
            phone: job.phone || '',
            location: job.location || '',
            type: job.installation_type || '',
            date: String(job.preferred_date || '').slice(0, 10) || todayIso(),
            time: /^\d{2}:\d{2}/.test(job.preferred_time || '') ? job.preferred_time.slice(0, 5) : '',
            emp: job.assigned_employee_id || '',
            address: job.address || '',
            details: job.description || '',
          }
        : blank(),
    );
  };

  const save = async () => {
    const d = draft;
    if (!d.name.trim() || !d.phone.trim() || !d.location.trim() || !d.address.trim() || !d.type.trim() || !d.date) {
      return Alert.alert('Details needed', 'Name, phone, location, address, type and date are required.');
    }
    if (!DATE_RE.test(d.date)) return Alert.alert('Date', 'Enter the date as YYYY-MM-DD.');
    if (d.time && !TIME_RE.test(d.time)) return Alert.alert('Time', 'Enter the time as HH:MM, or leave it empty for Anytime.');
    const fields = {
      full_name: d.name.trim(),
      phone: d.phone.trim(),
      location: d.location.trim(),
      address: d.address.trim(),
      installation_type: d.type.trim(),
      preferred_date: d.date,
      preferred_time: d.time || 'Anytime',
      assigned_employee_id: d.emp || null,
      description: d.details.trim() || null,
    };
    setSaving(true);
    try {
      if (editing?.job) await dataPatch('installations', `id:${editing.job.id}`, fields);
      else
        await dataPost('installations', [
          { id: uuid(), ticket_no: `INST-${Math.floor(100000 + Math.random() * 900000)}`, ...fields, status: 'pending' },
        ]);
      setEditing(null);
      await load();
    } catch (e: unknown) {
      Alert.alert('Could not save', e instanceof Error && e.message ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  const remove = (job: InstallationJob) =>
    Alert.alert('Delete this installation?', `${job.full_name || 'This customer'} on ${shortDate(job.preferred_date)}. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // Give the parts back to the store before the job disappears.
            await api.post('/bill-items', { ref_type: 'installation', ref_id: job.id, items: [] }).catch(() => undefined);
            await dataDelete('installations', `id:${job.id}`);
            await load();
          } catch (e: unknown) {
            Alert.alert('Could not delete', e instanceof Error && e.message ? e.message : 'Try again');
          }
        },
      },
    ]);

  return (
    <AdminScreen
      title="Installations"
      subtitle={`${filtered.length} shown`}
      onBack={onBack}
      onRefresh={load}
      loading={loading}
      error={error}
      headerRight={
        <Pressable onPress={() => openEditor(null)} hitSlop={8} style={[styles.add, { backgroundColor: brand.fill }]} accessibilityLabel="Add installation">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
      toolbar={<FilterChips items={FILTERS.map((f) => ({ key: f, label: f }))} activeKey={filter} onSelect={(k) => setFilter(k as Filter)} />}
    >
      {filtered.length === 0 && !loading ? <EmptyNote text="Nothing here right now" icon="construct" /> : null}
      {filtered.map((job) => {
        const tag = pill(job);
        return (
          <ListRow
            key={job.id}
            icon="construct"
            iconColor={tag.color}
            title={`${job.ticket_no} · ${job.installation_type}`}
            subtitle={`${job.full_name}${job.location ? ` · ${job.location}` : ''}`}
            meta={`${shortDate(job.preferred_date)} · ${job.preferred_time}${nameOf(job.assigned_employee_id) ? ` · ${nameOf(job.assigned_employee_id)}` : ''}`}
            badge={{ label: tag.label, color: tag.color }}
            onPress={() => setOpenId(job.id)}
            footer={
              <View style={styles.actions}>
                <ActionButton label="Edit" tone="neutral" onPress={() => openEditor(job)} />
                <ActionButton label="Delete" tone="danger" onPress={() => remove(job)} />
              </View>
            }
          />
        );
      })}

      <FormSheet
        visible={!!editing}
        title={editing?.job ? 'Edit installation' : 'New installation'}
        onClose={() => setEditing(null)}
        footer={<ActionButton label={editing?.job ? 'Save changes' : 'Save installation'} busy={saving} onPress={save} grow />}
      >
        <Field label="Customer name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} autoCapitalize="words" />
        <Field label="Phone" value={draft.phone} onChangeText={(v) => setDraft({ ...draft, phone: v })} keyboardType="phone-pad" placeholder="10 digit mobile number" />
        <Field label="Location (city / area)" value={draft.location} onChangeText={(v) => setDraft({ ...draft, location: v })} placeholder="e.g. Rajbagh, Srinagar" />
        <Field label="Installation type" value={draft.type} onChangeText={(v) => setDraft({ ...draft, type: v })} placeholder="e.g. 4 Camera CCTV" />
        <View style={styles.pair}>
          <View style={styles.half}>
            <Field label="Date" value={draft.date} onChangeText={(v) => setDraft({ ...draft, date: v })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.half}>
            <Field label="Time" value={draft.time} onChangeText={(v) => setDraft({ ...draft, time: v })} placeholder="HH:MM" keyboardType="numbers-and-punctuation" hint="Empty means Anytime" />
          </View>
        </View>
        <SectionLabel>Assign technician (optional)</SectionLabel>
        <FilterChips
          items={[{ key: '', label: 'Unassigned' }, ...employees.map((e) => ({ key: e.id, label: e.full_name || 'Employee' }))]}
          activeKey={draft.emp}
          onSelect={(k) => setDraft({ ...draft, emp: k })}
        />
        <Field label="Address" value={draft.address} onChangeText={(v) => setDraft({ ...draft, address: v })} multiline placeholder="Full address / landmark" />
        <Field label="Details (optional)" value={draft.details} onChangeText={(v) => setDraft({ ...draft, details: v })} multiline />
      </FormSheet>

      {openId ? (
        <InstallationDetailSheet id={openId} isAdmin employees={employees} onClose={() => setOpenId(null)} onChanged={load} />
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: spacing(2) },
  pair: { flexDirection: 'row', gap: spacing(3) },
  half: { flex: 1 },
});
