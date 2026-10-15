import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import StockImportSheet from '../../components/admin/StockImportSheet';
import Field from '../../components/admin/Field';
import SectionLabel from '../../components/admin/SectionLabel';
import { fetchStockValuation, fetchItems, ItemRow, rupees } from '../../api/adminBooks';
import {
  fetchAvailability,
  adjustStock,
  AdjustType,
  approveCount,
  createLocation,
  fetchLocationItems,
  fetchLocations,
  fetchSerials,
  LocationItem,
  saveCount,
  SerialRow,
  StockLocationRow,
  transferStock,
} from '../../api/adminStock';
import { dataGet } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { humanize, inr, todayIso } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Tab = 'onhand' | 'locations' | 'serials' | 'count';
type Mode = 'give' | 'takeback' | 'transfer';

const SERIAL_COLOR: Record<string, string> = { in_stock: semantic.success, with_technician: semantic.warning, installed: brand.grey };

function Choice<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.chips}>
      {items.map((c) => {
        const on = c.key === value;
        return (
          <Pressable
            key={c.key || 'none'}
            onPress={() => onChange(c.key)}
            style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
          >
            <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]} numberOfLines={1}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// What is on the shelf and in the vans, valued at moving-average cost from the
// stock ledger — with the day-to-day moves: give stock to a technician, take it
// back, transfer between places, adjust, count and create locations.
export default function StockScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(async () => {
    const [valuation, locations, items, staff] = await Promise.all([
      fetchStockValuation(),
      fetchLocations(),
      fetchItems().catch(() => [] as ItemRow[]),
      dataGet<{ id: string; full_name: string }[]>('profiles', { select: 'id,full_name', eq: 'role:employee', order: 'full_name:asc' }).catch(() => []),
    ]);
    return { valuation, locations, items: items.filter((i) => Number(i.active) === 1), staff };
  }, 'Could not load stock');

  const [tab, setTab] = useState<Tab>('onhand');
  const [query, setQuery] = useState('');
  const [serials, setSerials] = useState<SerialRow[]>([]);

  // transfer sheet
  const [mode, setMode] = useState<Mode | null>(null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [techId, setTechId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [lines, setLines] = useState<{ item: ItemRow; qty: string }[]>([]);
  const [itemQ, setItemQ] = useState('');
  const [note, setNote] = useState('');

  // adjust sheet
  const [adjusting, setAdjusting] = useState(false);
  const [adjItem, setAdjItem] = useState<ItemRow | null>(null);
  const [adjType, setAdjType] = useState<AdjustType>('adjust_in');
  const [adjQty, setAdjQty] = useState('');
  const [adjLoc, setAdjLoc] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // location sheet
  const [newLoc, setNewLoc] = useState(false);
  const [locName, setLocName] = useState('');
  const [locKind, setLocKind] = useState('store');
  const [locEmp, setLocEmp] = useState('');

  // count sheet
  const [counting, setCounting] = useState(false);
  const [countLoc, setCountLoc] = useState('');
  const [countRows, setCountRows] = useState<(LocationItem & { counted: string })[]>([]);
  const [countNote, setCountNote] = useState('');

  const [locFilter, setLocFilter] = useState('');
  const [held, setHeld] = useState<LocationItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const v = data.data?.valuation;
  const locations = data.data?.locations ?? [];
  const owned = locations.filter((l) => l.owned !== false && l.owned !== 0);
  const stores = owned.filter((l) => l.kind !== 'van');
  const items = data.data?.items ?? [];
  const staff = data.data?.staff ?? [];

  useEffect(() => {
    if (!locFilter) return setHeld(null);
    fetchLocationItems(locFilter).then(setHeld).catch(() => setHeld([]));
  }, [locFilter]);

  useEffect(() => {
    if (tab !== 'serials') return;
    const t = setTimeout(() => fetchSerials(query.trim()).then(setSerials).catch(() => setSerials([])), 250);
    return () => clearTimeout(t);
  }, [tab, query]);

  useEffect(() => {
    if (!counting || !countLoc) return;
    fetchLocationItems(countLoc)
      .then((rows) => setCountRows(rows.map((r) => ({ ...r, counted: '' }))))
      .catch(() => setCountRows([]));
  }, [counting, countLoc]);

  const onHand = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (locFilter && held) {
      return held
        .filter((h) => Number(h.held_qty) !== 0)
        .filter((h) => !q || `${h.name} ${h.sku || ''}`.toLowerCase().includes(q))
        .map((h) => ({ id: h.id, name: h.name, sku: h.sku || null, qty: Number(h.held_qty), unit: h.unit || h.base_unit || '', value: null as number | null, mismatch: false }));
    }
    return (v?.items ?? [])
      .filter((i) => i.active && (i.quantity !== 0 || i.value_paise !== 0))
      .filter((i) => !q || `${i.name} ${i.sku || ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.value_paise - a.value_paise)
      .map((i) => ({ id: i.id, name: i.name, sku: i.sku, qty: i.quantity, unit: i.unit || '', value: i.value_paise, mismatch: !i.quantity_matches }));
  }, [v, query, locFilter, held]);

  const itemMatches = useMemo(() => {
    const q = itemQ.trim().toLowerCase();
    if (q.length < 2) return [];
    return items.filter((i) => `${i.name} ${i.sku || ''} ${i.brand || ''} ${i.model || ''}`.toLowerCase().includes(q)).slice(0, 6);
  }, [items, itemQ]);

  const openTransfer = (m: Mode) => {
    const def = stores.find((l) => l.is_default) || stores[0];
    setMode(m);
    setStoreId(def?.id || '');
    setFromId(def?.id || '');
    setToId(stores.find((l) => l.id !== def?.id)?.id || '');
    setTechId('');
    setLines([]);
    setItemQ('');
    setNote('');
  };

  const addLine = (item: ItemRow) => {
    setLines((p) => (p.some((l) => l.item.id === item.id) ? p : [...p, { item, qty: '1' }]));
    setItemQ('');
  };

  const doTransfer = async () => {
    const valid = lines.map((l) => ({ item_id: l.item.id, quantity: Number(l.qty) || 0 })).filter((l) => l.quantity > 0);
    if (!valid.length) return Alert.alert('Nothing to move', 'Add at least one item with a quantity.');
    setBusy(true);
    try {
      let from = fromId;
      let to = toId;
      let employeeId: string | null = null;
      if (mode === 'transfer') {
        if (from === to) return Alert.alert('Pick two places', 'Choose two different locations.');
        employeeId = locations.find((l) => l.id === to)?.employee_id || null;
      } else {
        const tech = staff.find((s) => s.id === techId);
        if (!tech) return Alert.alert('Technician', 'Choose the technician.');
        let van = locations.find((l) => l.kind === 'van' && l.employee_id === tech.id);
        if (!van) van = await createLocation({ name: `${tech.full_name}'s van`, kind: 'van', employee_id: tech.id });
        employeeId = van.employee_id || tech.id;
        if (mode === 'give') {
          from = storeId;
          to = van.id;
        } else {
          from = van.id;
          to = storeId;
        }
      }
      await transferStock({ from_location_id: from, to_location_id: to, employee_id: employeeId, note: note.trim(), lines: valid });
      Alert.alert('Done', mode === 'give' ? 'Stock given.' : mode === 'takeback' ? 'Stock taken back.' : 'Transferred.');
      setMode(null);
      await data.reload();
    } catch (e) {
      Alert.alert('Could not move stock', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const doAdjust = async () => {
    if (!adjItem) return Alert.alert('Item', 'Choose the item.');
    const q = Number(adjQty);
    if (!(q > 0)) return Alert.alert('Quantity', 'Enter the quantity.');
    if (!adjReason.trim()) return Alert.alert('Reason', 'A reason is required — it is kept in the audit trail.');
    setBusy(true);
    try {
      const made = await adjustStock({ item_id: adjItem.id, type: adjType, quantity: q, location_id: adjLoc, reason: adjReason.trim() });
      Alert.alert('Recorded', `${adjItem.name}: ${Number(made.balance_qty) - Number(made.quantity)} → ${Number(made.balance_qty)}`);
      setAdjusting(false);
      await data.reload();
    } catch (e) {
      Alert.alert('Could not adjust', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const doLocation = async () => {
    if (!locName.trim()) return Alert.alert('Name', 'A name is required.');
    setBusy(true);
    try {
      await createLocation({ name: locName.trim(), kind: locKind, employee_id: locKind === 'van' ? locEmp || null : null });
      setNewLoc(false);
      await data.reload();
    } catch (e) {
      Alert.alert('Could not create', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const doCount = async () => {
    const counted = countRows.filter((r) => r.counted !== '');
    if (!counted.length) return Alert.alert('Nothing counted', 'Enter the counted quantity for at least one item.');
    setBusy(true);
    try {
      const out = await saveCount({
        count_date: todayIso(),
        location_id: countLoc,
        note: countNote.trim(),
        lines: counted.map((r) => ({ item_id: r.id, counted_qty: Number(r.counted) || 0 })),
      });
      const diffs = out.lines.filter((l) => Number(l.difference_qty) !== 0);
      setCounting(false);
      if (!diffs.length) {
        Alert.alert('Count saved', 'Everything matched.');
      } else {
        Alert.alert('Differences found', `${diffs.length} item(s) differ from the system. Approve and post the difference to shrinkage?`, [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Approve',
            onPress: async () => {
              try {
                await approveCount(out.count.id);
                await data.reload();
              } catch (e) {
                Alert.alert('Could not approve', e instanceof Error ? e.message : 'Try again');
              }
            },
          },
        ]);
      }
      await data.reload();
    } catch (e) {
      Alert.alert('Could not save the count', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const [importing, setImporting] = useState(false);

  const showAvailability = async (itemId: string) => {
    try {
      const a = await fetchAvailability(itemId);
      Alert.alert(a.name, `${a.on_hand} on hand\n${a.reserved} reserved for open orders\n${a.available} available to promise`);
    } catch (e) {
      Alert.alert('Could not check', e instanceof Error ? e.message : 'Try again');
    }
  };

  return (
    <AdminScreen
      title="Stock"
      subtitle={v ? `Valued at ${inr(rupees(v.total_value_paise))}` : undefined}
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      toolbar={
        <>
          {tab === 'onhand' || tab === 'serials' ? <SearchField value={query} onChangeText={setQuery} placeholder={tab === 'serials' ? 'Serial number' : 'Item name or SKU'} /> : null}
          <FilterChips
            activeKey={tab}
            onSelect={(k) => setTab(k as Tab)}
            items={[
              { key: 'onhand', label: 'On hand' },
              { key: 'locations', label: 'Locations & vans', count: locations.length },
              { key: 'serials', label: 'Serial numbers' },
              { key: 'count', label: 'Stock count' },
            ]}
          />
        </>
      }
    >
      {v ? (
        <StatGrid
          items={[
            { label: 'Stock value', value: inr(rupees(v.total_value_paise)) },
            { label: 'Count mismatches', value: v.discrepancies.length, color: v.discrepancies.length ? semantic.danger : semantic.success },
          ]}
        />
      ) : null}

      {tab === 'onhand' ? (
        <>
          <View style={styles.actions}>
            <ActionButton label="Give to technician" onPress={() => openTransfer('give')} />
            <ActionButton label="Take back" tone="neutral" onPress={() => openTransfer('takeback')} />
          </View>
          <View style={styles.actions}>
            <ActionButton label="Transfer" tone="neutral" onPress={() => openTransfer('transfer')} />
            <ActionButton label="Import CSV" tone="neutral" onPress={() => setImporting(true)} />
            <ActionButton
              label="Adjust stock"
              tone="neutral"
              onPress={() => {
                setAdjItem(null);
                setAdjType('adjust_in');
                setAdjQty('');
                setAdjReason('');
                setItemQ('');
                setAdjLoc((stores.find((l) => l.is_default) || stores[0])?.id || '');
                setAdjusting(true);
              }}
            />
          </View>
          <FilterChips
            activeKey={locFilter}
            onSelect={setLocFilter}
            items={[{ key: '', label: 'All places' }, ...owned.map((l) => ({ key: l.id, label: l.name }))]}
          />
          {onHand.length === 0 ? <EmptyNote text="No stock on hand" icon="cube" /> : null}
          {onHand.map((i) => (
            <ListRow
              key={i.id}
              icon="cube"
              iconColor={i.mismatch ? semantic.danger : undefined}
              title={i.name}
              subtitle={`${i.qty} ${i.unit}${i.sku ? ` · ${i.sku}` : ''}`}
              value={i.value != null ? inr(rupees(i.value)) : undefined}
              badge={i.mismatch ? { label: 'Ledger differs', color: semantic.danger } : undefined}
              footer={<ActionButton label="Availability" tone="neutral" onPress={() => showAvailability(i.id)} />}
            />
          ))}
        </>
      ) : null}

      {tab === 'locations' ? (
        <>
          <ActionButton
            label="New location or van"
            onPress={() => {
              setLocName('');
              setLocKind('store');
              setLocEmp('');
              setNewLoc(true);
            }}
          />
          <SectionLabel>Places</SectionLabel>
          {locations.map((l: StockLocationRow) => (
            <ListRow
              key={l.id}
              icon={l.kind === 'van' ? 'user' : 'storefront'}
              title={l.name}
              subtitle={l.employee_name ? `Van of ${l.employee_name}` : humanize(l.kind || 'store')}
              badge={Number(l.is_default) === 1 ? { label: 'Default', color: semantic.success } : undefined}
              onPress={() => {
                setLocFilter(l.id);
                setTab('onhand');
              }}
            />
          ))}
        </>
      ) : null}

      {tab === 'serials' ? (
        <>
          {serials.length === 0 ? <EmptyNote text="No serial numbers match" icon="search" /> : null}
          {serials.map((s) => (
            <ListRow
              key={s.id}
              icon="device"
              title={s.serial_no}
              subtitle={s.item_name}
              meta={[s.location_name, s.customer_name && `customer ${s.customer_name}`, s.supplier_name && `supplier ${s.supplier_name}`].filter(Boolean).join(' · ') || undefined}
              badge={{ label: humanize(s.status), color: SERIAL_COLOR[s.status] ?? semantic.info }}
            />
          ))}
        </>
      ) : null}

      {tab === 'count' ? (
        <>
          <Text style={[styles.note, { color: theme.text2 }]}>
            Count what is physically there. The difference to the system is shown, and — if you approve — posted to shrinkage.
          </Text>
          <ActionButton
            label="Start a stock count"
            onPress={() => {
              const def = stores.find((l) => l.is_default) || stores[0];
              setCountLoc(def?.id || '');
              setCountRows([]);
              setCountNote('');
              setCounting(true);
            }}
          />
        </>
      ) : null}

      <FormSheet
        visible={mode !== null}
        title={mode === 'give' ? 'Give stock to a technician' : mode === 'takeback' ? 'Take stock back' : 'Transfer stock'}
        onClose={() => setMode(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setMode(null)} />
            <ActionButton label="Confirm" onPress={doTransfer} busy={busy} />
          </>
        }
      >
        {mode === 'transfer' ? (
          <>
            <Text style={[styles.label, { color: theme.text3 }]}>From</Text>
            <Choice items={owned.map((l) => ({ key: l.id, label: l.name }))} value={fromId} onChange={setFromId} />
            <Text style={[styles.label, { color: theme.text3 }]}>To</Text>
            <Choice items={owned.map((l) => ({ key: l.id, label: l.name }))} value={toId} onChange={setToId} />
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: theme.text3 }]}>Technician</Text>
            <Choice items={staff.map((s) => ({ key: s.id, label: s.full_name }))} value={techId} onChange={setTechId} />
            <Text style={[styles.label, { color: theme.text3 }]}>{mode === 'give' ? 'From the store' : 'Into the store'}</Text>
            <Choice items={stores.map((l) => ({ key: l.id, label: l.name }))} value={storeId} onChange={setStoreId} />
          </>
        )}
        <SearchField value={itemQ} onChangeText={setItemQ} placeholder="Search an item to add" />
        {itemMatches.map((i) => (
          <ListRow key={i.id} icon="box" title={i.name} subtitle={`${Number(i.quantity) || 0} ${i.unit || 'pcs'} on hand`} onPress={() => addLine(i)} />
        ))}
        {lines.map((l) => (
          <View key={l.item.id} style={[styles.line, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
            <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={1}>{l.item.name}</Text>
            <View style={styles.qty}>
              <Field label="Qty" value={l.qty} onChangeText={(t) => setLines((p) => p.map((x) => (x.item.id === l.item.id ? { ...x, qty: t } : x)))} keyboardType="numeric" />
            </View>
          </View>
        ))}
        <Field label="Note (optional)" value={note} onChangeText={setNote} />
      </FormSheet>

      <FormSheet
        visible={adjusting}
        title="Adjust stock"
        onClose={() => setAdjusting(false)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setAdjusting(false)} />
            <ActionButton label="Record adjustment" onPress={doAdjust} busy={busy} />
          </>
        }
      >
        <SearchField value={itemQ} onChangeText={setItemQ} placeholder="Search an item" />
        {adjItem ? <ListRow icon="box" title={adjItem.name} subtitle={`${Number(adjItem.quantity) || 0} ${adjItem.unit || 'pcs'} on hand`} /> : null}
        {!adjItem ? itemMatches.map((i) => <ListRow key={i.id} icon="box" title={i.name} subtitle={`${Number(i.quantity) || 0} on hand`} onPress={() => { setAdjItem(i); setItemQ(''); }} />) : null}
        <Text style={[styles.label, { color: theme.text3 }]}>What happened</Text>
        <Choice
          items={[
            { key: 'adjust_in' as AdjustType, label: 'Found more' },
            { key: 'adjust_out' as AdjustType, label: 'Less than system' },
            { key: 'damage' as AdjustType, label: 'Damaged' },
          ]}
          value={adjType}
          onChange={setAdjType}
        />
        <Field label="Quantity" value={adjQty} onChangeText={setAdjQty} keyboardType="numeric" />
        <Text style={[styles.label, { color: theme.text3 }]}>Location</Text>
        <Choice items={owned.map((l) => ({ key: l.id, label: l.name }))} value={adjLoc} onChange={setAdjLoc} />
        <Field label="Reason (required)" value={adjReason} onChangeText={setAdjReason} hint="Kept in the audit trail with who made it" />
      </FormSheet>

      <FormSheet
        visible={newLoc}
        title="New location"
        onClose={() => setNewLoc(false)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setNewLoc(false)} />
            <ActionButton label="Create" onPress={doLocation} busy={busy} />
          </>
        }
      >
        <Field label="Name" value={locName} onChangeText={setLocName} autoCapitalize="words" />
        <Choice items={[{ key: 'store', label: 'Store / shelf' }, { key: 'van', label: 'Technician van' }]} value={locKind} onChange={setLocKind} />
        {locKind === 'van' ? (
          <>
            <Text style={[styles.label, { color: theme.text3 }]}>Whose van</Text>
            <Choice items={staff.map((s) => ({ key: s.id, label: s.full_name }))} value={locEmp} onChange={setLocEmp} />
          </>
        ) : null}
      </FormSheet>

      <FormSheet
        visible={counting}
        title="Stock count"
        subtitle={todayIso()}
        onClose={() => setCounting(false)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setCounting(false)} />
            <ActionButton label="Save count" onPress={doCount} busy={busy} />
          </>
        }
      >
        <Text style={[styles.label, { color: theme.text3 }]}>Location</Text>
        <Choice items={owned.map((l) => ({ key: l.id, label: l.name }))} value={countLoc} onChange={setCountLoc} />
        {countRows.length === 0 ? <EmptyNote text="Nothing is recorded at this place" icon="cube" /> : null}
        {countRows.map((r) => {
          const diff = r.counted === '' ? null : Number(r.counted) - Number(r.held_qty);
          return (
            <View key={r.id} style={[styles.line, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
              <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={1}>{r.name}</Text>
              <Text style={[styles.note, { color: theme.text3 }]}>System: {Number(r.held_qty)} {r.unit || r.base_unit || ''}</Text>
              <View style={styles.qty}>
                <Field label="Counted" value={r.counted} onChangeText={(t) => setCountRows((p) => p.map((x) => (x.id === r.id ? { ...x, counted: t } : x)))} keyboardType="numeric" />
              </View>
              {diff != null ? (
                <Text style={[styles.note, { color: diff === 0 ? theme.text3 : diff > 0 ? semantic.success : semantic.danger }]}>
                  Difference {diff > 0 ? '+' : ''}{diff}
                </Text>
              ) : null}
            </View>
          );
        })}
        <Field label="Note (optional)" value={countNote} onChangeText={setCountNote} />
      </FormSheet>
      <StockImportSheet visible={importing} onClose={() => setImporting(false)} onDone={() => data.reload()} />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing(2.5), marginBottom: spacing(2.5) },
  label: { ...typography.caption, fontSize: 12 },
  note: { ...typography.caption, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2), maxWidth: '100%' },
  chipText: { ...typography.caption, fontSize: 12 },
  line: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), gap: spacing(1.5) },
  lineName: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  qty: { maxWidth: 160 },
});
