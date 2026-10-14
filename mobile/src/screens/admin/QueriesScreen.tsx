import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import Icon from '../../components/Icon';
import { createQuery, deleteQuery, fetchQueries, QueryRow, setEstimateSent } from '../../api/adminPeople';
import { radius } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { dateTime } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'all' | 'pending' | 'sent';

// Customer queries to chase — someone asked for a quote or a visit and has not
// had an estimate yet. Add one while on the phone, tick it off when sent.
export default function QueriesScreen({ onBack }: Props) {
  const list = useLoader(fetchQueries, 'Could not load queries');
  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', address: '', details: '' });
  const [busy, setBusy] = useState(false);

  const rows = list.data ?? [];
  const sent = (r: QueryRow) => Number(r.estimate_sent) === 1 || r.estimate_sent === true;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (filter === 'all' ? true : filter === 'sent' ? sent(r) : !sent(r)))
      .filter((r) => !q || `${r.full_name} ${r.phone} ${r.query_details}`.toLowerCase().includes(q));
  }, [rows, filter, query]);

  const save = async () => {
    const phone = form.phone.replace(/\D/g, '');
    if (!form.full_name.trim()) return Alert.alert('Name needed', 'Enter the customer name');
    if (phone.length < 10) return Alert.alert('Phone needed', 'Enter a 10-digit phone number');
    if (!form.details.trim()) return Alert.alert('Details needed', 'Write what the customer asked for');
    setBusy(true);
    try {
      await createQuery({ full_name: form.full_name.trim(), phone: phone.slice(-10), address: form.address.trim() || null, query_details: form.details.trim() });
      setAdding(false);
      setForm({ full_name: '', phone: '', address: '', details: '' });
      await list.reload();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r: QueryRow) => {
    try {
      await setEstimateSent(r.id, !sent(r));
      await list.reload();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    }
  };

  const remove = (r: QueryRow) =>
    Alert.alert('Delete query?', r.full_name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteQuery(r.id);
            await list.reload();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);

  return (
    <AdminScreen
      title="Queries & Follow-ups"
      subtitle={`${rows.filter((r) => !sent(r)).length} waiting for an estimate`}
      onBack={onBack}
      onRefresh={list.reload}
      loading={list.loading}
      error={list.error}
      headerRight={
        <Pressable onPress={() => setAdding(true)} hitSlop={8} style={[styles.add, { backgroundColor: brand.primary }]} accessibilityLabel="Add query">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Name, phone or details" />
          <FilterChips
            activeKey={filter}
            onSelect={(k) => setFilter(k as Filter)}
            items={[
              { key: 'pending', label: 'Waiting', count: rows.filter((r) => !sent(r)).length },
              { key: 'sent', label: 'Estimate sent', count: rows.filter(sent).length },
              { key: 'all', label: 'All', count: rows.length },
            ]}
          />
        </>
      }
    >
      {visible.length === 0 ? <EmptyNote text="No queries here" icon="chat" /> : null}
      {visible.map((r) => (
        <ListRow
          key={r.id}
          icon="chat"
          iconColor={sent(r) ? semantic.success : semantic.warning}
          title={r.full_name}
          subtitle={r.query_details}
          meta={`${r.phone}${r.address ? ` · ${r.address}` : ''} · ${dateTime(r.created_at)}`}
          badge={{ label: sent(r) ? 'Estimate sent' : 'Waiting', color: sent(r) ? semantic.success : semantic.warning }}
          footer={
            <>
              <ActionButton label="Call" tone="neutral" onPress={() => Linking.openURL(`tel:${r.phone}`)} />
              <ActionButton label={sent(r) ? 'Mark waiting' : 'Mark sent'} tone="success" onPress={() => toggle(r)} />
              <ActionButton label="Delete" tone="danger" onPress={() => remove(r)} />
            </>
          }
        />
      ))}

      <FormSheet
        visible={adding}
        title="New query"
        onClose={() => setAdding(false)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setAdding(false)} />
            <ActionButton label="Save" onPress={save} busy={busy} />
          </>
        }
      >
        <Field label="Customer name" value={form.full_name} onChangeText={(v) => setForm((f) => ({ ...f, full_name: v }))} autoCapitalize="words" />
        <Field label="Phone" value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
        <Field label="Address (optional)" value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} multiline />
        <Field label="What did they ask for?" value={form.details} onChangeText={(v) => setForm((f) => ({ ...f, details: v }))} multiline />
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
