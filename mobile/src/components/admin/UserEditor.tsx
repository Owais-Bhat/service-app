import React, { useEffect, useState } from 'react';
import { ChoiceChips, Overline, RowPanel, SwitchRow } from './FinanceKit';
import { Alert, StyleSheet, Text } from 'react-native';
import FormSheet from './FormSheet';
import Field from './Field';
import ActionButton from './ActionButton';
import { AdminModule, createUser, EMPLOYEE_TABS, fetchAdminModules, updateUser, UserRow, UserSave } from '../../api/adminPeople';
import { parseModuleList } from '../../navigation/adminAccess';
import { useTheme } from '../../theme/ThemeContext';
import { typography } from '../../theme';

interface Props {
  visible: boolean;
  /** null creates a new account. */
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const SWITCHES: { key: string; label: string; from: keyof UserRow; staffOnly?: boolean; defaultOn?: boolean }[] = [
  { key: 'can_add_service', label: 'Add service access', from: 'can_add_service' },
  { key: 'can_assign_tickets', label: 'Assign service requests', from: 'can_assign_tickets' },
  { key: 'can_update_profile', label: 'Profile edit access', from: 'can_update_profile' },
  { key: 'autoAssignEnabled', label: 'Include in auto-assignment (off = never auto-assigned)', from: 'auto_assign_enabled', defaultOn: true },
  { key: 'alwaysAssign', label: 'Also auto-assign when clocked out', from: 'always_assign' },
  { key: 'eodExempt', label: 'EOD exempt', from: 'eod_exempt' },
  { key: 'photoClockinExempt', label: 'Photo clock-in exempt', from: 'photo_clockin_exempt' },
  { key: 'geofenceClockinExempt', label: 'Location clock-in exempt', from: 'geofence_clockin_exempt' },
  { key: 'installationsEnabled', label: 'Installations tab', from: 'installations_enabled', defaultOn: true },
  { key: 'allowFoc', label: 'Can mark FOC', from: 'allow_foc', defaultOn: true },
];

function parseTabs(raw: UserRow['allowed_tabs']): Set<string> | null {
  if (!raw) return null;
  try {
    const a = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(a) ? new Set(a.map(String)) : null;
  } catch {
    return null;
  }
}

// Create or edit an account: identity, role, pay, worker type, access switches
// and which employee tabs are visible — the same fields the web form posts.
export default function UserEditor({ visible, user, onClose, onSaved }: Props) {
  const { theme } = useTheme();
  const isEdit = !!user;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('employee');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('0');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [worker, setWorker] = useState('fixed');
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [tabs, setTabs] = useState<Set<string>>(new Set(EMPLOYEE_TABS.map((t) => t.id)));
  const [busy, setBusy] = useState(false);
  // Admin accounts: limited to chosen modules, or a full admin.
  const [limit, setLimit] = useState(false);
  const [modules, setModules] = useState<Set<string>>(new Set());
  const [catalogue, setCatalogue] = useState<AdminModule[] | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(user?.full_name || '');
    setEmail(user?.email || '');
    setPassword('');
    setRole(user ? (user.role === 'client' ? 'employee' : user.role) : 'employee');
    setPhone((user?.phone || '').replace(/^\+91\s*/, ''));
    setSalary(String(Number(user?.salary) || 0));
    setCompany(user?.company || '');
    setAddress(user?.address || '');
    setWorker(user?.worker_type === 'gig' ? 'gig' : 'fixed');
    const f: Record<string, boolean> = {};
    SWITCHES.forEach((s) => {
      const v = user ? user[s.from] : undefined;
      f[s.key] = v === undefined || v === null ? !!s.defaultOn : Number(v) === 1;
    });
    setFlags(f);
    setTabs(parseTabs(user?.allowed_tabs) ?? new Set(EMPLOYEE_TABS.map((t) => t.id)));
    const limited = parseModuleList(user?.admin_modules);
    setLimit(limited !== null);
    setModules(limited ?? new Set());
  }, [visible, user]);

  // The module list comes from the server, so the phone, the web form and the
  // server's own checks can never disagree about what exists.
  useEffect(() => {
    if (!visible || role !== 'admin' || catalogue) return;
    fetchAdminModules()
      .then((m) => {
        setCatalogue(m);
        setCatalogueError(null);
      })
      .catch(() => setCatalogueError('Could not load the module list'));
  }, [visible, role, catalogue]);

  const toggleModule = (id: string) =>
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleTab = (id: string) =>
    setTabs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    const rawPhone = phone.replace(/\D/g, '').slice(-10);
    if (!name.trim()) return Alert.alert('Full name', 'Full name is required');
    if (!email.trim()) return Alert.alert('Email', 'Email is required');
    if (!isEdit && password.length < 8) return Alert.alert('Password', 'Password must be at least 8 characters');
    if (isEdit && password && password.length < 8) return Alert.alert('Password', 'Password must be at least 8 characters');
    if (rawPhone && !/^[6-9]\d{9}$/.test(rawPhone)) return Alert.alert('Phone', 'Enter a valid 10-digit Indian mobile number');

    if (role === 'admin' && limit && !catalogue) return Alert.alert('Modules', 'The module list has not loaded yet');
    const all = tabs.size === EMPLOYEE_TABS.length;
    const body: UserSave = {
      fullName: name.trim(),
      email: email.trim(),
      role,
      phone: rawPhone ? `+91${rawPhone}` : null,
      salary: Number(salary) || 0,
      company: company.trim() || null,
      address: address.trim() || null,
      can_add_service: flags.can_add_service ? 1 : 0,
      can_assign_tickets: flags.can_assign_tickets ? 1 : 0,
      can_update_profile: flags.can_update_profile ? 1 : 0,
      alwaysAssign: flags.alwaysAssign ? 1 : 0,
      autoAssignEnabled: !!flags.autoAssignEnabled,
      eodExempt: flags.eodExempt ? 1 : 0,
      photoClockinExempt: flags.photoClockinExempt ? 1 : 0,
      geofenceClockinExempt: flags.geofenceClockinExempt ? 1 : 0,
      workerType: worker,
      installationsEnabled: !!flags.installationsEnabled,
      allowFoc: !!flags.allowFoc,
      allowed_tabs: all ? null : [...tabs],
      // Sent for admins only, so a limited admin editing staff is never refused.
      ...(role === 'admin' ? { admin_modules: limit ? [...modules] : null } : {}),
      ...(password ? { password } : {}),
    };
    setBusy(true);
    try {
      if (user) await updateUser(user.id, body);
      else await createUser(body);
      onSaved();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const staff = role === 'employee' || role === 'team_lead';

  return (
    <FormSheet
      visible={visible}
      title={isEdit ? 'Edit user' : 'New user'}
      subtitle={isEdit ? user?.email || undefined : undefined}
      onClose={onClose}
      footer={
        <>
          <ActionButton label="Cancel" tone="neutral" onPress={onClose} />
          <ActionButton label={isEdit ? 'Save changes' : 'Create user'} onPress={save} busy={busy} />
        </>
      }
    >
      <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <Field
        label={isEdit ? 'New password (leave blank to keep)' : 'Password'}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        hint="At least 8 characters"
      />

      <Text style={[styles.label, { color: theme.text2 }]}>Role</Text>
      <ChoiceChips
        items={[['employee', 'Staff'], ['team_lead', 'Team lead'], ['admin', 'Admin']]}
        value={role}
        onChange={setRole}
      />

      <Field label="Phone (10 digits)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      {staff ? <Field label="Monthly salary (₹)" value={salary} onChangeText={setSalary} keyboardType="numeric" /> : null}
      <Field label="Company / building" value={company} onChangeText={setCompany} />
      <Field label="Address" value={address} onChangeText={setAddress} multiline />

      {role === 'admin' ? (
        <>
          <Overline>What this admin can use</Overline>
          <Text style={[styles.hint, { color: theme.text3 }]}>
            Dashboard, notifications and profile are always available. Off = a full admin. The server refuses every call to a module that is not ticked, on the web and in this app.
          </Text>
          <RowPanel>
            <SwitchRow label="Limit to the modules ticked below" value={limit} onValueChange={setLimit} last />
          </RowPanel>
          {limit ? (
            catalogue ? (
              <>
                <ActionButton label="Tick all" tone="neutral" onPress={() => setModules(new Set(catalogue.map((m) => m.id)))} />
                <ActionButton label="Clear all" tone="neutral" onPress={() => setModules(new Set())} />
                {[...new Set(catalogue.map((m) => m.group))].map((group) => {
                  const rows = catalogue.filter((m) => m.group === group);
                  return (
                    <React.Fragment key={group}>
                      <Overline>{group}</Overline>
                      <RowPanel>
                        {rows.map((m, i) => (
                          <SwitchRow key={m.id} label={m.label} value={modules.has(m.id)} onValueChange={() => toggleModule(m.id)} last={i === rows.length - 1} />
                        ))}
                      </RowPanel>
                    </React.Fragment>
                  );
                })}
              </>
            ) : (
              <Text style={[styles.hint, { color: catalogueError ? theme.err : theme.text3 }]}>{catalogueError || 'Loading modules…'}</Text>
            )
          ) : null}
        </>
      ) : null}

      {staff ? (
        <>
          <Text style={[styles.label, { color: theme.text2 }]}>Worker type</Text>
          <ChoiceChips
            items={[['fixed', 'Fixed employee'], ['gig', 'Gig (public pool, online-only payment)']]}
            value={worker}
            onChange={setWorker}
          />

          <Overline>Work policy</Overline>
          <RowPanel>
            {SWITCHES.map((s, i) => (
              <SwitchRow key={s.key} label={s.label} value={!!flags[s.key]} onValueChange={(v) => setFlags((p) => ({ ...p, [s.key]: v }))} last={i === SWITCHES.length - 1} />
            ))}
          </RowPanel>

          <Overline>Tabs this person can see</Overline>
          <Text style={[styles.hint, { color: theme.text3 }]}>Dashboard, notifications and profile are always visible.</Text>
          <RowPanel>
            {EMPLOYEE_TABS.map((t, i) => (
              <SwitchRow key={t.id} label={t.label} value={tabs.has(t.id)} onValueChange={() => toggleTab(t.id)} last={i === EMPLOYEE_TABS.length - 1} />
            ))}
          </RowPanel>
        </>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, fontSize: 13 },
  hint: { ...typography.caption, fontSize: 11 },
});
