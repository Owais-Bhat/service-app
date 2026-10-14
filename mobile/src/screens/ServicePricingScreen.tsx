import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AdminScreen from '../components/admin/AdminScreen';
import SearchField from '../components/admin/SearchField';
import FilterChips from '../components/admin/FilterChips';
import ListRow from '../components/admin/ListRow';
import ActionButton from '../components/admin/ActionButton';
import EmptyNote from '../components/admin/EmptyNote';
import FormSheet from '../components/admin/FormSheet';
import Field from '../components/admin/Field';
import SectionLabel from '../components/admin/SectionLabel';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import {
  createService,
  deleteService,
  duplicateIds,
  fetchServicePricing,
  importServiceRows,
  parseCsv,
  ServiceInput,
  ServicePricingItem,
  updateService,
} from '../api/servicePricing';
import { inr } from '../utils/format';
import { useLoader } from '../utils/useLoader';

interface Props {
  onBack: () => void;
}

const blank: { category: string; sub: string; leaf: string; cost: string } = { category: '', sub: '', leaf: '', cost: '' };
const errText = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);

// The price list. Everyone can read it; an admin — or an employee the admin
// gave "Add Service" access — can also add, edit, delete, import a CSV and
// remove duplicate lines, exactly as on the web.
export default function ServicePricingScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || !!Number(user?.can_add_service);
  const data = useLoader(fetchServicePricing, 'Could not load service pricing');
  const [search, setSearch] = useState('');
  const [main, setMain] = useState('all');
  const [sub, setSub] = useState('all');
  const [editing, setEditing] = useState<{ item: ServicePricingItem | null } | null>(null);
  const [draft, setDraft] = useState(blank);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const items = data.data ?? [];
  const mains = useMemo(() => [...new Set(items.map((i) => i.category || 'Service'))].sort(), [items]);
  const subs = useMemo(
    () => [...new Set(items.filter((i) => main === 'all' || (i.category || 'Service') === main).map((i) => i.sub_category || '').filter(Boolean))].sort(),
    [items, main],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (main !== 'all' && (i.category || 'Service') !== main) return false;
      if (sub !== 'all' && (i.sub_category || '') !== sub) return false;
      if (!q) return true;
      return `${i.category || ''} ${i.sub_category || ''} ${i.sub_sub_category || ''} ${i.name || ''}`.toLowerCase().includes(q);
    });
  }, [items, main, sub, search]);

  const groups = useMemo(() => {
    const g = new Map<string, ServicePricingItem[]>();
    filtered.forEach((i) => {
      const k = `${i.category || 'Service'}${i.sub_category ? ` › ${i.sub_category}` : ''}`;
      g.set(k, [...(g.get(k) || []), i]);
    });
    return [...g.entries()];
  }, [filtered]);

  const openEditor = (item: ServicePricingItem | null) => {
    setEditing({ item });
    setDraft(
      item
        ? { category: item.category || '', sub: item.sub_category || '', leaf: item.sub_sub_category || item.name || '', cost: String(item.cost) }
        : blank,
    );
  };

  const run = useCallback(
    async (key: string, fn: () => Promise<void>, failTitle: string) => {
      setBusy(key);
      try {
        await fn();
      } catch (e: unknown) {
        Alert.alert(failTitle, errText(e, 'Try again'));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const save = () => {
    const cost = parseFloat(draft.cost);
    if (!draft.leaf.trim()) return Alert.alert('Service needed', 'Enter the specific service or issue.');
    if (!Number.isFinite(cost) || cost < 0) return Alert.alert('Price needed', 'Enter a valid price.');
    const body: ServiceInput = { category: draft.category, sub_category: draft.sub, sub_sub_category: draft.leaf, cost };
    return run(
      'save',
      async () => {
        if (editing?.item) await updateService(editing.item.id, body);
        else await createService(body);
        setEditing(null);
        await data.reload();
      },
      'Not saved',
    );
  };

  const removeOne = (item: ServicePricingItem) =>
    Alert.alert('Delete this service?', `${item.sub_sub_category || item.name} — ${inr(item.cost)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run('del', async () => { await deleteService(item.id); await data.reload(); }, 'Could not delete') },
    ]);

  const removePicked = () => {
    const ids = [...picked];
    if (!ids.length) return;
    Alert.alert(`Delete ${ids.length} service${ids.length === 1 ? '' : 's'}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          run(
            'bulk',
            async () => {
              for (const id of ids) await deleteService(id);
              setPicked(new Set());
              setSelecting(false);
              await data.reload();
            },
            'Could not delete',
          ),
      },
    ]);
  };

  const removeDuplicates = () => {
    const ids = duplicateIds(items);
    if (!ids.length) return Alert.alert('No duplicates', 'Every service appears once.');
    Alert.alert('Remove duplicates?', `${ids.length} repeated line${ids.length === 1 ? '' : 's'} will be removed; the first copy of each stays.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          run(
            'dupes',
            async () => {
              for (const id of ids) await deleteService(id);
              await data.reload();
            },
            'Could not remove',
          ),
      },
    ]);
  };

  const importCsv = () =>
    run(
      'import',
      async () => {
        const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
        if (res.canceled || !res.assets?.[0]) return;
        const f = res.assets[0];
        if (!/\.(csv|txt)$/i.test(f.name)) throw new Error('Choose a .csv file. Save the Excel sheet as CSV first.');
        const text = await (await fetch(f.uri)).text();
        const rows = parseCsv(text);
        if (!rows.length) throw new Error('The file is empty');
        const out = await importServiceRows(rows);
        await data.reload();
        Alert.alert(
          out.inserted ? 'Imported' : 'Nothing imported',
          `${out.inserted} service${out.inserted === 1 ? '' : 's'} added${out.skipped ? `, ${out.skipped} skipped` : ''}.${out.errors.length ? `\n\n${out.errors.slice(0, 4).join('\n')}` : ''}`,
        );
      },
      'Import failed',
    );

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <AdminScreen
      title="Service Pricing"
      subtitle={`${filtered.length} of ${items.length} services`}
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      headerRight={
        canManage ? (
          <Pressable onPress={() => openEditor(null)} hitSlop={8} style={[styles.add, { backgroundColor: brand.primary }]} accessibilityLabel="Add service">
            <Icon name="add" size={20} color="#fff" />
          </Pressable>
        ) : undefined
      }
      toolbar={
        <View>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search service or issue" />
          <FilterChips
            items={[{ key: 'all', label: 'All categories' }, ...mains.map((m) => ({ key: m, label: m }))]}
            activeKey={main}
            onSelect={(k) => {
              setMain(k);
              setSub('all');
            }}
          />
          {subs.length ? (
            <FilterChips items={[{ key: 'all', label: 'All sub categories' }, ...subs.map((s) => ({ key: s, label: s }))]} activeKey={sub} onSelect={setSub} />
          ) : null}
        </View>
      }
    >
      {canManage ? (
        <View style={styles.tools}>
          <ActionButton label="Import CSV" tone="neutral" busy={busy === 'import'} onPress={importCsv} />
          <ActionButton label="Remove duplicates" tone="neutral" busy={busy === 'dupes'} onPress={removeDuplicates} />
          <ActionButton
            label={selecting ? 'Done selecting' : 'Select'}
            tone="neutral"
            onPress={() => {
              setSelecting((s) => !s);
              setPicked(new Set());
            }}
          />
          {selecting && picked.size ? <ActionButton label={`Delete ${picked.size}`} tone="danger" busy={busy === 'bulk'} onPress={removePicked} /> : null}
        </View>
      ) : null}
      {canManage ? (
        <Text style={[styles.hint, { color: theme.text3 }]}>
          CSV columns: Main Category, Sub Category (optional), Sub-Sub Category, Price. A header row is detected; a 2- or 3-column file also works.
        </Text>
      ) : null}

      {groups.length === 0 && !data.loading ? <EmptyNote text="No services match this filter" icon="receipt" /> : null}
      {groups.map(([group, rows]) => (
        <View key={group}>
          <SectionLabel>{group}</SectionLabel>
          {rows.map((i) => {
            const on = picked.has(i.id);
            return (
              <ListRow
                key={i.id}
                icon={selecting ? (on ? 'check-circle' : 'receipt') : 'receipt'}
                iconColor={on ? semantic.success : undefined}
                title={i.sub_sub_category || i.name}
                value={inr(i.cost)}
                onPress={selecting ? () => toggle(i.id) : canManage ? () => openEditor(i) : undefined}
                footer={
                  canManage && !selecting ? (
                    <View style={styles.rowActions}>
                      <ActionButton label="Edit" tone="neutral" onPress={() => openEditor(i)} />
                      <ActionButton label="Delete" tone="danger" onPress={() => removeOne(i)} />
                    </View>
                  ) : undefined
                }
              />
            );
          })}
        </View>
      ))}

      <FormSheet
        visible={!!editing}
        title={editing?.item ? 'Edit service' : 'Add service'}
        onClose={() => setEditing(null)}
        footer={<ActionButton label={editing?.item ? 'Save changes' : 'Add service'} busy={busy === 'save'} onPress={save} grow />}
      >
        <Field label="Main category" value={draft.category} onChangeText={(v) => setDraft({ ...draft, category: v })} placeholder="e.g. CCTV" />
        <Field label="Sub category (optional)" value={draft.sub} onChangeText={(v) => setDraft({ ...draft, sub: v })} />
        <Field label="Sub-sub category (the specific issue)" value={draft.leaf} onChangeText={(v) => setDraft({ ...draft, leaf: v })} />
        <Field label="Price ₹" value={draft.cost} onChangeText={(v) => setDraft({ ...draft, cost: v })} keyboardType="decimal-pad" />
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(2) },
  rowActions: { flexDirection: 'row', gap: spacing(2) },
  hint: { ...typography.caption, marginBottom: spacing(2) },
});
