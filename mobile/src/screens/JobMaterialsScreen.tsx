import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import ActionButton from '../components/admin/ActionButton';
import Field from '../components/admin/Field';
import SearchField from '../components/admin/SearchField';
import SectionLabel from '../components/admin/SectionLabel';
import ListRow from '../components/admin/ListRow';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { fetchItems, ItemRow } from '../api/adminBooks';
import {
  fetchHeldItems,
  fetchStockPlaces,
  JobSearchRow,
  MaterialLine,
  searchJobs,
  StockPlace,
  submitMaterials,
} from '../api/employeeExtra';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';

interface Props {
  onBack: () => void;
}

interface Line {
  item: ItemRow;
  qty: string;
  rate: string;
}

type Kind = 'used' | 'returned';

// Records the stock a technician fitted on a job (or brought back from it). The
// office checks the record and approves it; only then does it leave the van and
// reach the books — the technician never sees a rate total.
export default function JobMaterialsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [kind, setKind] = useState<Kind>('used');
  const [jobQuery, setJobQuery] = useState('');
  const [jobs, setJobs] = useState<JobSearchRow[]>([]);
  const [job, setJob] = useState<JobSearchRow | null>(null);
  const [places, setPlaces] = useState<StockPlace[]>([]);
  const [placeId, setPlaceId] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [held, setHeld] = useState<Map<string, number>>(new Map());
  const [itemQuery, setItemQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [extra, setExtra] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([fetchStockPlaces(), fetchItems()])
      .then(([p, i]) => {
        const owned = p.filter((l) => l.owned);
        const mine = owned.length ? owned : p;
        setPlaces(mine);
        setPlaceId((mine.find((l) => l.employee_id === user?.id) || mine.find((l) => l.is_default) || mine[0])?.id || '');
        setItems(i.filter((r) => Number(r.active) === 1));
      })
      .catch(() => Alert.alert('Could not load stock', 'Check your connection and reopen this screen.'));
  }, [user?.id]);

  useEffect(() => {
    if (!placeId) return;
    fetchHeldItems(placeId)
      .then((rows) => setHeld(new Map(rows.map((r) => [r.id, Number(r.held_qty)]))))
      .catch(() => setHeld(new Map()));
  }, [placeId]);

  const onJobQuery = (q: string) => {
    setJobQuery(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (q.trim().length < 2) return setJobs([]);
      searchJobs(q.trim()).then(setJobs).catch(() => setJobs([]));
    }, 300);
  };

  const matches = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return items.filter((i) => `${i.name} ${i.sku || ''} ${i.brand || ''} ${i.model || ''}`.toLowerCase().includes(q)).slice(0, 8);
  }, [items, itemQuery]);

  const add = (item: ItemRow) => {
    setLines((prev) => (prev.some((l) => l.item.id === item.id) ? prev : [...prev, { item, qty: '1', rate: String(Number(item.selling_rate) || '') }]));
    setItemQuery('');
  };

  const patch = (id: string, p: Partial<Line>) => setLines((prev) => prev.map((l) => (l.item.id === id ? { ...l, ...p } : l)));

  const save = async () => {
    if (!job) return Alert.alert('Choose the job', 'Search for the ticket these materials were used on.');
    const valid: MaterialLine[] = lines
      .map((l) => ({
        item_id: l.item.id,
        description: l.item.name,
        quantity: Number(l.qty) || 0,
        unit: l.item.unit,
        ...(kind === 'used' ? { sell_rate: Number(l.rate) || 0 } : {}),
      }))
      .filter((l) => l.quantity > 0);
    if (valid.length === 0) return Alert.alert('Add items', 'Choose at least one item and a quantity.');
    const place = places.find((p) => p.id === placeId);

    setBusy(true);
    try {
      const out = await submitMaterials({
        job_type: job.job_type,
        job_id: job.job_id,
        location_id: placeId,
        employee_id: place?.employee_id || job.assigned_employee_id || undefined,
        kind,
        note: note.trim() || undefined,
        customer_approved: kind === 'used' && extra,
        lines: valid,
      });
      Alert.alert(
        out.issue.status === 'submitted' ? 'Sent for approval' : 'Recorded',
        out.issue.status === 'submitted' ? 'The office will check this and approve it.' : 'The materials are recorded on the job.',
        [{ text: 'OK', onPress: onBack }],
      );
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminScreen title="Materials Used" subtitle="Stock fitted on, or brought back from, a job" onBack={onBack}>
      <View style={styles.form}>
        <View style={styles.chips}>
          {(['used', 'returned'] as Kind[]).map((k) => {
            const on = kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[styles.kind, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
              >
                <Text style={[styles.kindText, { color: on ? brand.primary : theme.text2 }]}>{k === 'used' ? 'Used on the job' : 'Returned from job'}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>Job</SectionLabel>
        {job ? (
          <ListRow
            icon="ticket"
            title={`${job.ticket_no || '—'} · ${job.full_name}`}
            subtitle={`${job.job_type === 'installation' ? 'Installation' : 'Service'}${job.what ? `: ${job.what}` : ''}`}
            meta={[job.phone, job.employee_name && `technician ${job.employee_name}`].filter(Boolean).join(' · ')}
            footer={<ActionButton label="Change job" tone="neutral" onPress={() => { setJob(null); setJobs([]); }} />}
          />
        ) : (
          <>
            <SearchField value={jobQuery} onChangeText={onJobQuery} placeholder="Ticket number, customer or phone" />
            {jobs.map((j) => (
              <ListRow
                key={`${j.job_type}-${j.job_id}`}
                icon="ticket"
                title={`${j.ticket_no || '—'} · ${j.full_name}`}
                subtitle={`${j.what || ''}${j.status ? ` · ${j.status}` : ''}`}
                onPress={() => {
                  setJob(j);
                  setJobs([]);
                  setJobQuery('');
                  const van = places.find((p) => p.kind === 'van' && p.employee_id && p.employee_id === j.assigned_employee_id);
                  if (van) setPlaceId(van.id);
                }}
              />
            ))}
          </>
        )}

        <SectionLabel>{kind === 'used' ? 'Taken from' : 'Goes back into'}</SectionLabel>
        <View style={styles.chips}>
          {places.map((p) => {
            const on = p.id === placeId;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPlaceId(p.id)}
                style={[styles.kind, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
              >
                <Text style={[styles.kindText, { color: on ? brand.primary : theme.text2 }]} numberOfLines={1}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>Items</SectionLabel>
        <SearchField value={itemQuery} onChangeText={setItemQuery} placeholder="Search item name, brand or SKU" />
        {matches.map((i) => (
          <ListRow
            key={i.id}
            icon="box"
            title={i.name}
            subtitle={[i.brand, i.model].filter(Boolean).join(' ') || undefined}
            meta={kind === 'used' && held.has(i.id) ? `${held.get(i.id)} here` : i.unit || undefined}
            onPress={() => add(i)}
          />
        ))}
        {lines.map((l) => {
          const have = held.get(l.item.id);
          const over = kind === 'used' && have !== undefined && Number(l.qty) > have;
          return (
            <View key={l.item.id} style={[styles.line, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
              <View style={styles.lineHead}>
                <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={1}>{l.item.name}</Text>
                <Pressable onPress={() => setLines((p) => p.filter((x) => x.item.id !== l.item.id))} hitSlop={10} accessibilityLabel="Remove item">
                  <Icon name="close" size={18} color={theme.text3} />
                </Pressable>
              </View>
              <View style={styles.lineFields}>
                <View style={styles.qty}>
                  <Field label={`Qty${l.item.unit ? ` (${l.item.unit})` : ''}`} value={l.qty} onChangeText={(v) => patch(l.item.id, { qty: v })} keyboardType="numeric" />
                </View>
                {kind === 'used' ? (
                  <View style={styles.qty}>
                    <Field label="Rate ₹" value={l.rate} onChangeText={(v) => patch(l.item.id, { rate: v })} keyboardType="numeric" />
                  </View>
                ) : null}
              </View>
              {over ? <Text style={[styles.warn, { color: semantic.danger }]}>Only {have} recorded here</Text> : null}
            </View>
          );
        })}

        <Field label="Note (optional)" value={note} onChangeText={setNote} multiline />
        {kind === 'used' ? (
          <Pressable onPress={() => setExtra((v) => !v)} style={styles.check}>
            <Icon name={extra ? 'check-circle' : 'tasks'} size={20} color={extra ? brand.primary : theme.text3} filled={extra} />
            <Text style={[styles.checkText, { color: theme.text }]}>Customer approved this as extra work</Text>
          </Pressable>
        ) : null}
        <ActionButton label="Send for approval" tone="success" busy={busy} onPress={save} />
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  kind: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3.5), paddingVertical: spacing(2.5), maxWidth: '100%' },
  kindText: { ...typography.caption, fontSize: 12 },
  line: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5), gap: spacing(2) },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  lineName: { ...typography.body, fontFamily: 'Manrope_700Bold', flex: 1 },
  lineFields: { flexDirection: 'row', gap: spacing(3) },
  qty: { flex: 1 },
  warn: { ...typography.caption, fontSize: 11 },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  checkText: { ...typography.body, flex: 1, fontSize: 14 },
});
