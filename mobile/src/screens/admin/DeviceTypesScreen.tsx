import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import Icon from '../../components/Icon';
import {
  fetchCompanyList,
  fetchDeviceTypes,
  NamedRow,
  removeCompany,
  removeDeviceType,
  saveCompany,
  saveDeviceType,
} from '../../api/adminManage';
import { radius } from '../../theme';
import { brand } from '../../theme/tokens';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Tab = 'types' | 'companies';

const DEFAULT_COMPANY = 'networking experts';

// The two pick-lists technicians fill in on a job: device types and companies.
// The default company is protected, as on the web.
export default function DeviceTypesScreen({ onBack }: Props) {
  const data = useLoader(async () => {
    const [types, companies] = await Promise.all([fetchDeviceTypes(), fetchCompanyList()]);
    return { types, companies };
  }, 'Could not load the lists');
  const [tab, setTab] = useState<Tab>('types');
  const [editing, setEditing] = useState<NamedRow | 'new' | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = (tab === 'types' ? data.data?.types : data.data?.companies) ?? [];

  const open = (row: NamedRow | 'new') => {
    setName(row === 'new' ? '' : row.name);
    setDesc(row === 'new' ? '' : row.description || '');
    setEditing(row);
  };

  const save = async () => {
    const n = name.trim();
    if (!n) return Alert.alert('Name needed', 'Enter a name');
    setBusy(true);
    try {
      const id = editing && editing !== 'new' ? editing.id : undefined;
      if (tab === 'types') await saveDeviceType({ id, name: n, description: desc.trim() || null });
      else await saveCompany({ id, name: n });
      setEditing(null);
      await data.reload();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const remove = (row: NamedRow) => {
    if (tab === 'companies' && row.name.trim().toLowerCase() === DEFAULT_COMPANY) {
      return Alert.alert('Protected', 'The default company cannot be deleted.');
    }
    Alert.alert('Delete?', row.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (tab === 'types') await removeDeviceType(row.id);
            else await removeCompany(row.id);
            await data.reload();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);
  };

  return (
    <AdminScreen
      title="Device Types"
      subtitle="Pick-lists for devices and companies"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      headerRight={
        <Pressable onPress={() => open('new')} hitSlop={8} style={[styles.add, { backgroundColor: brand.primary }]} accessibilityLabel="Add">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
      toolbar={
        <FilterChips
          activeKey={tab}
          onSelect={(k) => setTab(k as Tab)}
          items={[
            { key: 'types', label: 'Device types', count: data.data?.types.length },
            { key: 'companies', label: 'Companies', count: data.data?.companies.length },
          ]}
        />
      }
    >
      {rows.length === 0 ? <EmptyNote text="Nothing here yet — tap + to add" icon="device" /> : null}
      {rows.map((r) => (
        <ListRow
          key={r.id}
          icon={tab === 'types' ? 'device' : 'storefront'}
          title={r.name}
          subtitle={r.description || undefined}
          onPress={() => open(r)}
          footer={
            <>
              <ActionButton label="Edit" tone="neutral" onPress={() => open(r)} />
              <ActionButton label="Delete" tone="danger" onPress={() => remove(r)} />
            </>
          }
        />
      ))}

      <FormSheet
        visible={editing !== null}
        title={`${editing === 'new' ? 'New' : 'Edit'} ${tab === 'types' ? 'device type' : 'company'}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} />
            <ActionButton label="Save" onPress={save} busy={busy} />
          </>
        }
      >
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
        {tab === 'types' ? <Field label="Description (optional)" value={desc} onChangeText={setDesc} multiline /> : null}
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
