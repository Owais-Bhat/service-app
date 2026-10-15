import React, { useMemo, useState } from 'react';
import { ChoiceChips, DangerButton, HeaderAction, Overline, RowPanel, SwitchRow } from '../../components/admin/FinanceKit';
import { Alert, Linking, StyleSheet, Text } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import UserEditor from '../../components/admin/UserEditor';
import { deleteUser, fetchUsers, patchUserAccess, UserPatch, UserRow } from '../../api/adminPeople';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { semantic } from '../../theme/tokens';
import { humanize, inr } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type RoleFilter = 'all' | 'admin' | 'team_lead' | 'employee' | 'client';

const ROLE_COLOR: Record<string, string> = {
  admin: semantic.danger,
  team_lead: semantic.warning,
  employee: semantic.success,
  client: semantic.info,
};

// Switches the admin can flip per person. `key` is the field the server's
// PATCH /admin/users/:id expects; `column` is where its current value is read.
const SWITCHES: { key: keyof UserPatch; column: keyof UserRow; label: string; hint: string }[] = [
  { key: 'can_add_service', column: 'can_add_service', label: 'Can add services', hint: 'Edit the price list' },
  { key: 'can_assign_tickets', column: 'can_assign_tickets', label: 'Can assign requests', hint: 'Hand requests to technicians' },
  { key: 'can_update_profile', column: 'can_update_profile', label: 'Can edit own profile', hint: 'Name, phone and company' },
  { key: 'alwaysAssign', column: 'always_assign', label: 'Always assign', hint: 'Gets jobs even when clocked out' },
  { key: 'eodExempt', column: 'eod_exempt', label: 'EOD exempt', hint: 'Not blocked for missed EOD' },
  { key: 'photoClockinExempt', column: 'photo_clockin_exempt', label: 'Selfie exempt', hint: 'No photo at clock-in' },
  { key: 'geofenceClockinExempt', column: 'geofence_clockin_exempt', label: 'Location exempt', hint: 'No office-radius check' },
  { key: 'installationsEnabled', column: 'installations_enabled', label: 'Sees installations', hint: 'Installations tab visible' },
  { key: 'allowFoc', column: 'allow_foc', label: 'Can mark FOC', hint: 'Free-of-cost on reopened jobs' },
];

// Accounts, roles and per-person access. Creating accounts and passwords stays
// on the web portal; everything an owner changes day to day lives here.
export default function UsersScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const { user: me } = useAuth();
  const users = useLoader(fetchUsers, 'Could not load users');
  const [role, setRole] = useState<RoleFilter>('all');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editor, setEditor] = useState<UserRow | 'new' | null>(null);

  const rows = users.data ?? [];
  const current = rows.find((u) => u.id === picked) || null;

  const counts = useMemo(
    () => ({
      all: rows.length,
      admin: rows.filter((u) => u.role === 'admin').length,
      team_lead: rows.filter((u) => u.role === 'team_lead').length,
      employee: rows.filter((u) => u.role === 'employee').length,
      client: rows.filter((u) => u.role === 'client').length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((u) => role === 'all' || u.role === role)
      .filter((u) => !q || `${u.full_name || ''} ${u.email || ''} ${u.phone || ''}`.toLowerCase().includes(q));
  }, [rows, role, query]);

  const apply = async (u: UserRow, patch: UserPatch, token: string) => {
    setSaving(token);
    try {
      await patchUserAccess(u.id, patch);
      await users.reload();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(null);
    }
  };

  const remove = (u: UserRow) => {
    if (u.id === me?.id) return Alert.alert('Not allowed', 'You cannot delete your own account.');
    Alert.alert('Delete user?', `${u.full_name || u.email} and their sign-in will be removed permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteUser(u.id);
            setPicked(null);
            await users.reload();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);
  };

  const changeRole = (u: UserRow, next: NonNullable<UserPatch['role']>) => {
    if (u.id === me?.id) {
      Alert.alert('Not allowed', 'You cannot change your own role.');
      return;
    }
    if (u.role === next) return;
    Alert.alert('Change role?', `${u.full_name || 'This user'} will become ${humanize(next)}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change', onPress: () => apply(u, { role: next }, 'role') },
    ]);
  };

  return (
    <AdminScreen
      title="Users"
      subtitle={`${rows.length} accounts`}
      onBack={onBack}
      onRefresh={users.reload}
      loading={users.loading}
      error={users.error}
      headerRight={
        <HeaderAction icon="add" label="New user" onPress={() => setEditor('new')} />
      }
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Name, email or phone" />
          <FilterChips
            activeKey={role}
            onSelect={(k) => setRole(k as RoleFilter)}
            items={[
              { key: 'all', label: 'All', count: counts.all },
              { key: 'employee', label: 'Employees', count: counts.employee },
              { key: 'team_lead', label: 'Team leads', count: counts.team_lead },
              { key: 'admin', label: 'Admins', count: counts.admin },
              { key: 'client', label: 'Clients', count: counts.client },
            ]}
          />
        </>
      }
    >
      {visible.length === 0 ? <EmptyNote text="No user matches" icon="people" /> : null}
      {visible.map((u) => (
        <ListRow
          key={u.id}
          icon="user"
          iconColor={ROLE_COLOR[u.role]}
          title={u.full_name || u.email || 'Unnamed'}
          subtitle={u.email || undefined}
          meta={[u.phone, u.role === 'employee' || u.role === 'team_lead' ? `${humanize(u.worker_type || 'fixed')}${Number(u.salary) ? ` · ${inr(u.salary)}` : ''}` : null].filter(Boolean).join(' · ')}
          badge={{ label: humanize(u.role), color: ROLE_COLOR[u.role] ?? theme.info }}
          onPress={() => setPicked(u.id)}
        />
      ))}

      <FormSheet
        visible={!!current}
        title={current?.full_name || 'User'}
        subtitle={current?.email || undefined}
        onClose={() => setPicked(null)}
        footer={
          current ? (
            <>
              {current.phone ? <ActionButton label="Call" tone="neutral" onPress={() => Linking.openURL(`tel:${current.phone}`)} /> : null}
              <ActionButton label="Edit" tone="neutral" onPress={() => { setEditor(current); setPicked(null); }} />
            </>
          ) : undefined
        }
      >
        {current ? (
          <>
            <Overline>Access</Overline>
            <Text style={[styles.label, { color: theme.text2 }]}>Role</Text>
            <ChoiceChips
              items={(['employee', 'team_lead', 'admin', 'client'] as const).map((r) => [r, humanize(r)] as [string, string])}
              value={current.role}
              onChange={(r) => saving !== 'role' && changeRole(current, r as NonNullable<UserPatch['role']>)}
            />

            {current.role === 'employee' || current.role === 'team_lead' ? (
              <>
                <Text style={[styles.label, { color: theme.text2, marginTop: spacing(3) }]}>Worker type</Text>
                <ChoiceChips
                  items={[['fixed', 'Fixed employee'], ['gig', 'Gig (public pool)']]}
                  value={current.worker_type || 'fixed'}
                  onChange={(t) => (current.worker_type || 'fixed') !== t && apply(current, { workerType: t as 'fixed' | 'gig' }, 'worker')}
                />

                <Overline style={{ marginTop: spacing(4) }}>Work policy</Overline>
                <RowPanel>
                  {SWITCHES.map((s, i) => (
                    <SwitchRow
                      key={s.key}
                      label={s.label}
                      hint={s.hint}
                      value={Number(current[s.column]) === 1}
                      disabled={saving === s.key}
                      onValueChange={(v) => apply(current, { [s.key]: v } as UserPatch, String(s.key))}
                      last={i === SWITCHES.length - 1}
                    />
                  ))}
                </RowPanel>
              </>
            ) : null}
            <DangerButton icon="trash" label="Delete account" onPress={() => remove(current)} />
          </>
        ) : null}
      </FormSheet>
      <UserEditor
        visible={editor !== null}
        user={editor && editor !== 'new' ? editor : null}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          users.reload();
        }}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, fontSize: 12 },
});
