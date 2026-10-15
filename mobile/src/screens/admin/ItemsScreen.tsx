import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import Icon from '../../components/Icon';
import { fetchItems, ItemRow } from '../../api/adminBooks';
import {
  bulkActive,
  createItem,
  DeletePlan,
  fetchMovements,
  Movement,
  MOVEMENT_LABEL,
  MovementType,
  planBulkDelete,
  recordMovement,
  runBulkDelete,
  updateItem,
} from '../../api/adminItems';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { dateTime, inr } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'live' | 'low' | 'hidden' | 'all' | 'ledger';

const isLow = (i: ItemRow) => Number(i.min_stock) > 0 && Number(i.quantity) <= Number(i.min_stock);

const BLANK = { name: '', sku: '', category: '', unit: 'pcs', purchase: '', selling: '', gst: '18', min: '0', opening: '', active: true };
const MOVES: { key: MovementType; label: string }[] = [
  { key: 'purchase', label: 'Purchase (stock in)' },
  { key: 'return', label: 'Return' },
  { key: 'adjust_in', label: 'Adjust in' },
  { key: 'adjust_out', label: 'Adjust out' },
  { key: 'damage', label: 'Damage' },
];

// The item master: rates, GST and stock level with the same low-stock rule the
// server uses to notify the admin. Add and edit items, record a stock movement,
// switch several on or off at once, and read the stock ledger.
export default function ItemsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(fetchItems, 'Could not load items');
  const [filter, setFilter] = useState<Filter>('live');
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ItemRow | 'new' | null>(null);
  const [form, setForm] = useState(BLANK);
  const [moving, setMoving] = useState<ItemRow | null>(null);
  const [moveType, setMoveType] = useState<MovementType>('purchase');
  const [moveQty, setMoveQty] = useState('');
  const [moveRate, setMoveRate] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [ledger, setLedger] = useState<Movement[] | null>(null);
  const [plan, setPlan] = useState<DeletePlan | null>(null);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = data.data ?? [];
  const live = rows.filter((i) => Number(i.active) === 1);
  const lowCount = live.filter(isLow).length;

  useEffect(() => {
    if (filter === 'ledger' && ledger === null) fetchMovements().then(setLedger).catch(() => setLedger([]));
  }, [filter, ledger]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((i) => {
        if (filter === 'live') return Number(i.active) === 1;
        if (filter === 'hidden') return Number(i.active) !== 1;
        if (filter === 'low') return Number(i.active) === 1 && isLow(i);
        return true;
      })
      .filter((i) => !q || `${i.name} ${i.sku || ''} ${i.brand || ''} ${i.model || ''} ${i.category || ''}`.toLowerCase().includes(q));
  }, [rows, filter, query]);

  const openEditor = (i: ItemRow | 'new') => {
    setForm(
      i === 'new'
        ? BLANK
        : {
            name: i.name,
            sku: i.sku || '',
            category: i.category || '',
            unit: i.unit || 'pcs',
            purchase: i.purchase_rate != null ? String(Number(i.purchase_rate)) : '',
            selling: String(Number(i.selling_rate) || 0),
            gst: String(Number(i.gst_rate) || 0),
            min: String(Number(i.min_stock) || 0),
            opening: '',
            active: Number(i.active) === 1,
          },
    );
    setEditing(i);
  };

  const saveItem = async () => {
    if (!form.name.trim()) return Alert.alert('Name', 'Item name is required');
    if (form.selling === '' || Number.isNaN(Number(form.selling))) return Alert.alert('Selling rate', 'Selling rate is required');
    if (form.purchase === '' || Number.isNaN(Number(form.purchase))) return Alert.alert('Purchase rate', 'Purchase rate is required');
    const body = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category.trim(),
      unit: form.unit.trim() || 'pcs',
      purchase_rate: Number(form.purchase),
      selling_rate: Number(form.selling),
      gst_rate: Number(form.gst) || 0,
      min_stock: Number(form.min) || 0,
      active: form.active,
      ...(editing === 'new' && form.opening ? { opening_stock: Number(form.opening) || 0 } : {}),
    };
    setBusy(true);
    try {
      if (editing && editing !== 'new') await updateItem(editing.id, body);
      else await createItem(body);
      setEditing(null);
      await data.reload();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const saveMove = async () => {
    if (!moving) return;
    const q = Number(moveQty);
    if (!(q > 0)) return Alert.alert('Quantity', 'Quantity must be more than zero');
    setBusy(true);
    try {
      await recordMovement({ item_id: moving.id, type: moveType, quantity: q, rate: moveRate === '' ? null : Number(moveRate), note: moveNote.trim() || undefined });
      setMoving(null);
      setLedger(null);
      await data.reload();
    } catch (e) {
      Alert.alert('Could not record', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setActive = async (active: boolean) => {
    const ids = [...picked];
    if (!ids.length) return;
    setBusy(true);
    try {
      const out = await bulkActive(ids, active);
      Alert.alert('Done', `${out.changed} item${out.changed === 1 ? '' : 's'} ${active ? 'activated' : 'hidden'}.`);
      setPicked(new Set());
      await data.reload();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const startDelete = async () => {
    const ids = [...picked];
    if (!ids.length) return;
    setBusy(true);
    try {
      setPlan(await planBulkDelete(ids));
      setWord('');
    } catch (e) {
      Alert.alert('Could not prepare', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const out = await runBulkDelete([...picked]);
      Alert.alert('Done', `${out.deleted} deleted${out.hidden ? `, ${out.hidden} hidden` : ''}.`);
      setPlan(null);
      setPicked(new Set());
      setSelecting(false);
      await data.reload();
    } catch (e) {
      Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminScreen
      title="Items"
      subtitle={`${live.length} live items`}
      onBack={onBack}
      onRefresh={async () => {
        setLedger(null);
        await data.reload();
      }}
      loading={data.loading}
      error={data.error}
      headerRight={
        <>
          <Pressable
            onPress={() => {
              setSelecting((v) => !v);
              setPicked(new Set());
            }}
            hitSlop={8}
            style={[styles.add, { backgroundColor: selecting ? brand.primary + '33' : theme.panel2, borderColor: theme.line, borderWidth: 1 }]}
            accessibilityLabel="Select items"
          >
            <Icon name="check-circle" size={18} color={selecting ? brand.primary : theme.text2} />
          </Pressable>
          <Pressable onPress={() => openEditor('new')} hitSlop={8} style={[styles.add, { backgroundColor: brand.fill }]} accessibilityLabel="New item">
            <Icon name="add" size={20} color="#fff" />
          </Pressable>
        </>
      }
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Name, SKU, brand or model" />
          <FilterChips
            activeKey={filter}
            onSelect={(k) => setFilter(k as Filter)}
            items={[
              { key: 'live', label: 'Live', count: live.length },
              { key: 'low', label: 'Low stock', count: lowCount },
              { key: 'hidden', label: 'Hidden', count: rows.length - live.length },
              { key: 'all', label: 'All', count: rows.length },
              { key: 'ledger', label: 'Stock ledger' },
            ]}
          />
        </>
      }
    >
      {selecting ? (
        <View style={[styles.bar, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
          <Text style={[styles.barText, { color: theme.text }]}>{picked.size} selected</Text>
          <View style={styles.barActions}>
            <ActionButton label="Activate" tone="success" busy={busy} disabled={!picked.size} onPress={() => setActive(true)} />
            <ActionButton label="Hide" tone="neutral" busy={busy} disabled={!picked.size} onPress={() => setActive(false)} />
            <ActionButton label="Delete" tone="danger" busy={busy} disabled={!picked.size} onPress={startDelete} />
          </View>
        </View>
      ) : null}

      {filter === 'ledger' ? (
        <>
          {(ledger ?? []).length === 0 ? <EmptyNote text={ledger === null ? 'Loading…' : 'No stock movements yet'} icon="swap" /> : null}
          {(ledger ?? []).map((m) => (
            <ListRow
              key={m.id}
              icon="swap"
              iconColor={Number(m.quantity) > 0 ? semantic.success : semantic.warning}
              title={m.item_name}
              subtitle={`${MOVEMENT_LABEL[m.type] || m.type}${m.note ? ` · ${m.note}` : ''}`}
              meta={`${dateTime(m.created_at)}${m.employee_name ? ` · ${m.employee_name}` : ''}${m.rate != null ? ` · @ ${inr(m.rate)}` : ''}`}
              value={`${Number(m.quantity) > 0 ? '+' : ''}${Number(m.quantity)} ${m.unit || ''}`}
              valueColor={Number(m.quantity) > 0 ? semantic.success : semantic.danger}
            />
          ))}
        </>
      ) : (
        <>
          <StatGrid items={[{ label: 'Live items', value: live.length }, { label: 'Low stock', value: lowCount, color: lowCount ? semantic.danger : semantic.success }]} />
          {visible.length === 0 ? <EmptyNote text="No item matches" icon="box" /> : null}
          {visible.map((i) => {
            const low = isLow(i);
            const on = picked.has(i.id);
            return (
              <ListRow
                key={i.id}
                icon={selecting ? (on ? 'check-circle' : 'tasks') : 'box'}
                iconColor={selecting ? (on ? brand.primary : undefined) : low ? semantic.danger : undefined}
                title={i.name}
                subtitle={[i.brand, i.model, i.category].filter(Boolean).join(' · ') || undefined}
                meta={`${i.sku ? `${i.sku} · ` : ''}${i.purchase_rate != null ? `buy ${inr(i.purchase_rate)} · ` : ''}GST ${Number(i.gst_rate) || 0}%`}
                value={inr(i.selling_rate)}
                badge={{
                  label: Number(i.active) !== 1 ? 'Hidden' : `${Number(i.quantity) || 0} ${i.unit || 'pcs'}${low ? ' · low' : ''}`,
                  color: Number(i.active) !== 1 ? brand.grey : low ? semantic.danger : semantic.success,
                }}
                onPress={() => (selecting ? toggle(i.id) : openEditor(i))}
                footer={
                  selecting ? undefined : (
                    <>
                      <ActionButton label="Edit" tone="neutral" onPress={() => openEditor(i)} />
                      <ActionButton
                        label="Stock in/out"
                        onPress={() => {
                          setMoving(i);
                          setMoveType('purchase');
                          setMoveQty('');
                          setMoveRate('');
                          setMoveNote('');
                        }}
                      />
                    </>
                  )
                }
              />
            );
          })}
        </>
      )}

      <FormSheet
        visible={editing !== null}
        title={editing === 'new' ? 'New item' : 'Edit item'}
        subtitle={editing && editing !== 'new' ? editing.name : undefined}
        onClose={() => setEditing(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} />
            <ActionButton label="Save" onPress={saveItem} busy={busy} />
          </>
        }
      >
        <Field label="Item name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} autoCapitalize="words" />
        <Field label="SKU" value={form.sku} onChangeText={(v) => setForm((f) => ({ ...f, sku: v }))} autoCapitalize="characters" />
        <Field label="Category" value={form.category} onChangeText={(v) => setForm((f) => ({ ...f, category: v }))} />
        <Field label="Unit" value={form.unit} onChangeText={(v) => setForm((f) => ({ ...f, unit: v }))} placeholder="pcs" />
        <Field label="Purchase rate (₹)" value={form.purchase} onChangeText={(v) => setForm((f) => ({ ...f, purchase: v }))} keyboardType="numeric" />
        <Field label="Selling rate (₹)" value={form.selling} onChangeText={(v) => setForm((f) => ({ ...f, selling: v }))} keyboardType="numeric" />
        <Field label="GST %" value={form.gst} onChangeText={(v) => setForm((f) => ({ ...f, gst: v }))} keyboardType="numeric" />
        <Field label="Minimum stock" value={form.min} onChangeText={(v) => setForm((f) => ({ ...f, min: v }))} keyboardType="numeric" hint="You are alerted when stock falls to this" />
        {editing === 'new' ? (
          <Field label="Opening stock (optional)" value={form.opening} onChangeText={(v) => setForm((f) => ({ ...f, opening: v }))} keyboardType="numeric" />
        ) : null}
        <View style={[styles.switchRow, { borderBottomColor: theme.line }]}>
          <Text style={[styles.switchLabel, { color: theme.text }]}>Active</Text>
          <Switch value={form.active} onValueChange={(v) => setForm((f) => ({ ...f, active: v }))} trackColor={{ true: brand.primary, false: theme.line }} />
        </View>
      </FormSheet>

      <FormSheet
        visible={!!moving}
        title="Stock movement"
        subtitle={moving ? `${moving.name} · ${Number(moving.quantity) || 0} ${moving.unit || 'pcs'} on hand` : undefined}
        onClose={() => setMoving(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setMoving(null)} />
            <ActionButton label="Record" onPress={saveMove} busy={busy} />
          </>
        }
      >
        <View style={styles.chips}>
          {MOVES.map((m) => {
            const on = moveType === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => setMoveType(m.key)}
                style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
              >
                <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Quantity" value={moveQty} onChangeText={setMoveQty} keyboardType="numeric" />
        <Field label="Rate (₹, optional)" value={moveRate} onChangeText={setMoveRate} keyboardType="numeric" hint="Leave blank to use the purchase rate" />
        <Field label="Note (optional)" value={moveNote} onChangeText={setMoveNote} multiline />
      </FormSheet>

      <FormSheet
        visible={!!plan}
        title={`Delete ${picked.size} item${picked.size === 1 ? '' : 's'}`}
        onClose={() => setPlan(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setPlan(null)} />
            <ActionButton label="Delete" tone="danger" disabled={word.trim() !== 'DELETE'} busy={busy} onPress={confirmDelete} />
          </>
        }
      >
        {plan ? (
          <>
            <Text style={[styles.note, { color: theme.text }]}>
              {plan.will_delete} will be deleted for good
              {plan.reverse_value_paise ? `, and their opening stock worth ${inr(plan.reverse_value_paise / 100)} is taken back out of the books` : ''}. This cannot be undone.
            </Text>
            {plan.will_keep ? (
              <>
                <Text style={[styles.note, { color: theme.text2 }]}>
                  {plan.will_keep} cannot be deleted because bills, purchases, jobs or stock counts still refer to them — they will be hidden instead:
                </Text>
                {plan.keep.slice(0, 20).map((k, idx) => (
                  <Text key={idx} style={[styles.reason, { color: theme.text3 }]}>• {k.name} — {k.reason}</Text>
                ))}
              </>
            ) : null}
            <Field label="Type DELETE to confirm" value={word} onChangeText={setWord} autoCapitalize="characters" />
          </>
        ) : null}
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  bar: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(3), gap: spacing(2) },
  barText: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  barActions: { flexDirection: 'row', gap: spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  chipText: { ...typography.caption, fontSize: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(2), borderBottomWidth: 1 },
  switchLabel: { ...typography.body, fontSize: 14 },
  note: { ...typography.body, fontSize: 14 },
  reason: { ...typography.caption, fontSize: 12 },
});
