import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import FormSheet from './FormSheet';
import Field from './Field';
import ActionButton from './ActionButton';
import { createUser, EMPLOYEE_TABS, updateUser, UserRow, UserSave } from '../../api/adminPeople';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';

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
  { key: 'alwaysAssign', label: 'Always auto-assign', from: 'always_assign' },
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
  }, [visible, user]);

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
      eodExempt: flags.eodExempt ? 1 : 0,
      photoClockinExempt: flags.photoClockinExempt ? 1 : 0,
      geofenceClockinExempt: flags.geofenceClockinExempt ? 1 : 0,
      workerType: worker,
      installationsEnabled: !!flags.installationsEnabled,
      allowFoc: !!flags.allowFoc,
      allowed_tabs: all ? null : [...tabs],
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

      <Text style={[styles.label, { color: theme.text3 }]}>Role</Text>
      <View style={styles.chips}>
        {[
          { k: 'employee', l: 'Staff' },
          { k: 'team_lead', l: 'Team lead' },
          { k: 'admin', l: 'Admin' },
        ].map((r) => {
          const on = role === r.k;
          return (
            <Pressable
              key={r.k}
              onPress={() => setRole(r.k)}
              style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
            >
              <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{r.l}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field label="Phone (10 digits)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      {staff ? <Field label="Monthly salary (₹)" value={salary} onChangeText={setSalary} keyboardType="numeric" /> : null}
      <Field label="Company / building" value={company} onChangeText={setCompany} />
      <Field label="Address" value={address} onChangeText={setAddress} multiline />

      {staff ? (
        <>
          <Text style={[styles.label, { color: theme.text3 }]}>Worker type</Text>
          <View style={styles.chips}>
            {[
              { k: 'fixed', l: 'Fixed employee' },
              { k: 'gig', l: 'Gig (public pool, online-only payment)' },
            ].map((r) => {
              const on = worker === r.k;
              return (
                <Pressable
                  key={r.k}
                  onPress={() => setWorker(r.k)}
                  style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
                >
                  <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{r.l}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: theme.text3 }]}>Access</Text>
          {SWITCHES.map((s) => (
            <View key={s.key} style={[styles.switchRow, { borderBottomColor: theme.line }]}>
              <Text style={[styles.switchLabel, { color: theme.text }]}>{s.label}</Text>
              <Switch
                value={!!flags[s.key]}
                onValueChange={(v) => setFlags((p) => ({ ...p, [s.key]: v }))}
                trackColor={{ true: brand.primary, false: theme.line }}
              />
            </View>
          ))}

          <Text style={[styles.label, { color: theme.text3 }]}>Tabs this person can see</Text>
          <Text style={[styles.hint, { color: theme.text3 }]}>Dashboard, notifications and profile are always visible.</Text>
          {EMPLOYEE_TABS.map((t) => (
            <View key={t.id} style={[styles.switchRow, { borderBottomColor: theme.line }]}>
              <Text style={[styles.switchLabel, { color: theme.text }]}>{t.label}</Text>
              <Switch value={tabs.has(t.id)} onValueChange={() => toggleTab(t.id)} trackColor={{ true: brand.primary, false: theme.line }} />
            </View>
          ))}
        </>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, fontSize: 12 },
  hint: { ...typography.caption, fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3.5), paddingVertical: spacing(2) },
  chipText: { ...typography.caption, fontSize: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(3), paddingVertical: spacing(2), borderBottomWidth: 1 },
  switchLabel: { ...typography.body, fontSize: 14, flex: 1 },
});
