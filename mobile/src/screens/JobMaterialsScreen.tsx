import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import ActionButton from '../components/admin/ActionButton';
import FilterChips from '../components/admin/FilterChips';
import Panel from '../components/Panel';
import GlowButton from '../components/GlowButton';
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
        <FilterChips
          items={[{ key: 'used', label: 'Used on the job' }, { key: 'returned', label: 'Returned from job' }]}
          activeKey={kind}
          onSelect={(k) => setKind(k as Kind)}
        />

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
        <FilterChips items={places.map((p) => ({ key: p.id, label: p.name }))} activeKey={placeId} onSelect={setPlaceId} />

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
        {lines.length > 0 ? (
          <Panel style={styles.lines}>
            {lines.map((l, idx) => {
              const have = held.get(l.item.id);
              const qtyNum = Number(l.qty) || 0;
              const over = kind === 'used' && have !== undefined && qtyNum > have;
              const last = idx === lines.length - 1;
              return (
                <View key={l.item.id} style={[styles.line, !last && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                  <View style={styles.lineHead}>
                    <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={1}>{l.item.name}</Text>
                    {have !== undefined ? <Text style={[styles.lineVan, { color: theme.text3 }]}>In van {have}</Text> : null}
                    <Pressable onPress={() => setLines((p) => p.filter((x) => x.item.id !== l.item.id))} hitSlop={10} accessibilityLabel="Remove item">
                      <Icon name="close" size={18} color={theme.text3} />
                    </Pressable>
                  </View>
                  <View style={styles.lineFields}>
                    <View style={[styles.stepper, { borderColor: theme.border }]}>
                      <Text style={[styles.stepLabel, { color: theme.text2 }]}>Qty {kind === 'used' ? 'used' : 'returned'}{l.item.unit ? ` (${l.item.unit})` : ''}</Text>
                      <View style={styles.stepControls}>
                        <Pressable onPress={() => patch(l.item.id, { qty: String(Math.max(0, qtyNum - 1)) })} style={styles.stepBtn} hitSlop={4} accessibilityLabel="Less">
                          <Text style={[styles.stepGlyph, { color: theme.text }]}>−</Text>
                        </Pressable>
                        <Text style={[styles.stepValue, { color: over ? theme.err : theme.text }]}>{qtyNum}</Text>
                        <Pressable onPress={() => patch(l.item.id, { qty: String(qtyNum + 1) })} style={styles.stepBtn} hitSlop={4} accessibilityLabel="More">
                          <Text style={[styles.stepGlyph, { color: theme.text }]}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                    {kind === 'used' ? (
                      <View style={styles.rate}>
                        <Field label="Rate ₹" value={l.rate} onChangeText={(v) => patch(l.item.id, { rate: v })} keyboardType="numeric" />
                      </View>
                    ) : null}
                  </View>
                  {over ? <Text style={[styles.warn, { color: theme.err }]}>Only {have} recorded here</Text> : null}
                </View>
              );
            })}
          </Panel>
        ) : null}

        <Field label="Note (optional)" value={note} onChangeText={setNote} multiline />
        {kind === 'used' ? (
          <Pressable onPress={() => setExtra((v) => !v)} style={styles.check}>
            <Icon name={extra ? 'check-circle' : 'tasks'} size={20} color={extra ? theme.accent : theme.text3} filled={extra} />
            <Text style={[styles.checkText, { color: theme.text }]}>Customer approved this as extra work</Text>
          </Pressable>
        ) : null}
        <GlowButton label="Send for approval" onPress={save} loading={busy} icon="check" />
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing(3) },
  lines: { padding: 0, overflow: 'hidden' },
  line: { padding: spacing(3.5), gap: spacing(2.5) },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  lineName: { ...typography.rowTitle, fontSize: 14, lineHeight: 19, flex: 1 },
  lineVan: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  lineFields: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(3) },
  stepper: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: radius.sm, paddingLeft: 10, paddingRight: 4 },
  stepLabel: { ...typography.caption, fontSize: 12, flexShrink: 1 },
  stepControls: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontFamily: 'Manrope_700Bold', fontSize: 20, lineHeight: 24 },
  stepValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14, minWidth: 28, textAlign: 'center' },
  rate: { flex: 1 },
  warn: { ...typography.caption, fontSize: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  checkText: { ...typography.body, flex: 1, fontSize: 14 },
});
