import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import Field from '../components/admin/Field';
import ActionButton from '../components/admin/ActionButton';
import SectionLabel from '../components/admin/SectionLabel';
import ListRow from '../components/admin/ListRow';
import { api, dataGet, dataPatch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';

interface Props {
  onBack: () => void;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  can_update_profile: number | boolean | null;
}

// My Profile: name, phone, company and password — the same two cards the web
// Profile page has. Editing the details needs the admin-granted profile-edit
// access (admins always have it); the password is always changeable.
export default function AccountScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);

  const load = async () => {
    if (!user) return;
    try {
      const rows = await dataGet<ProfileRow[]>('profiles', { select: 'id,full_name,phone,company,role,can_update_profile', eq: `id:${user.id}`, limit: '1' });
      const p = rows[0] || null;
      setProfile(p);
      setName(p?.full_name || user.full_name || '');
      setPhone(p?.phone || '');
      setCompany(p?.company || '');
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'Could not load your profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const canEdit = user?.role === 'admin' || !!Number(profile?.can_update_profile);

  const saveProfile = async () => {
    if (!user || !canEdit) return;
    if (!name.trim()) return Alert.alert('Name needed', 'Your name cannot be empty.');
    setBusy('profile');
    try {
      await dataPatch('profiles', `id:${user.id}`, { full_name: name.trim(), phone: phone.trim(), company: company.trim() });
      Alert.alert('Saved', 'Your profile was updated.');
      await load();
    } catch (e: unknown) {
      Alert.alert('Not saved', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async () => {
    if (pass.length < 8) return Alert.alert('Too short', 'Use at least 8 characters.');
    if (pass !== again) return Alert.alert('Does not match', 'The two passwords are different.');
    setBusy('password');
    try {
      await api.post('/auth/update-password', { password: pass });
      setPass('');
      setAgain('');
      Alert.alert('Password updated', 'Use the new password the next time you sign in.');
    } catch (e: unknown) {
      Alert.alert('Not updated', e instanceof Error ? e.message : 'Could not change the password');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminScreen title="My Profile" subtitle={user?.email} onBack={onBack} onRefresh={load} loading={loading} error={error}>
      <SectionLabel>Account information</SectionLabel>
      {canEdit ? null : (
        <ListRow icon="lock" title="Profile editing is locked" subtitle="An admin must enable Profile Edit access before you can change these details." />
      )}
      <Field label="Full name" value={name} onChangeText={canEdit ? setName : () => undefined} autoCapitalize="words" />
      <Field label="Email" value={user?.email || ''} onChangeText={() => undefined} hint="Your sign-in email cannot be changed here" />
      <Field label="Phone" value={phone} onChangeText={canEdit ? setPhone : () => undefined} keyboardType="phone-pad" />
      <Field label="Company" value={company} onChangeText={canEdit ? setCompany : () => undefined} />
      {canEdit ? <ActionButton label="Save changes" busy={busy === 'profile'} onPress={saveProfile} /> : null}

      <SectionLabel>Change password</SectionLabel>
      <Field label="New password" value={pass} onChangeText={setPass} placeholder="Min 8 characters" autoCapitalize="none" secure />
      <Field label="Repeat new password" value={again} onChangeText={setAgain} autoCapitalize="none" secure />
      <ActionButton label="Update password" tone="neutral" busy={busy === 'password'} onPress={savePassword} />
      <View style={styles.gap}>
        <Text style={[styles.note, { color: theme.text3 }]}>You stay signed in on this phone after changing it.</Text>
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing(2) },
  note: { ...typography.caption },
});
