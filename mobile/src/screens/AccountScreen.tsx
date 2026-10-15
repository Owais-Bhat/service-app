import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import Field from '../components/admin/Field';
import GlowButton from '../components/GlowButton';
import Icon from '../components/Icon';
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

// Presentational only — the server still enforces the real rule. One bar per
// satisfied check: 8+ characters, mixed case, a digit, a symbol.
function passwordStrength(pw: string): { score: number; label: string } {
  const checks = [pw.length >= 8, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)];
  const score = pw ? checks.filter(Boolean).length : 0;
  const label = score <= 1 ? 'Weak · use 8+ characters with letters and numbers' : score === 2 ? 'Fair · mix upper and lower case' : score === 3 ? 'Good · add a symbol to make it strong' : 'Strong';
  return { score, label };
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
  const [reveal, setReveal] = useState(false);

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

  const strength = passwordStrength(pass);
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
      {canEdit ? <GlowButton label="Save changes" onPress={saveProfile} loading={busy === 'profile'} icon="check" /> : null}

      <SectionLabel>Change password</SectionLabel>
      <Field label="New password" value={pass} onChangeText={setPass} placeholder="Min 8 characters" autoCapitalize="none" secure={!reveal} />
      {pass ? (
        <View>
          <View style={styles.meter}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.meterBar, { backgroundColor: i < strength.score ? (strength.score >= 3 ? theme.ok : theme.warn) : theme.line }]} />
            ))}
          </View>
          <Text style={[styles.strengthText, { color: strength.score >= 3 ? theme.ok : theme.text2 }]}>{strength.label}</Text>
        </View>
      ) : null}
      <Field label="Repeat new password" value={again} onChangeText={setAgain} autoCapitalize="none" secure={!reveal} />
      <Pressable onPress={() => setReveal((v) => !v)} style={styles.reveal} accessibilityRole="button" accessibilityLabel={reveal ? 'Hide passwords' : 'Show passwords'}>
        <Icon name={reveal ? 'eye-off' : 'eye'} size={18} color={theme.text2} />
        <Text style={[styles.revealText, { color: theme.text2 }]}>{reveal ? 'Hide passwords' : 'Show passwords'}</Text>
      </Pressable>
      <GlowButton label="Update password" onPress={savePassword} loading={busy === 'password'} variant="secondary" />
      <View style={styles.gap}>
        <Text style={[styles.note, { color: theme.text3 }]}>You stay signed in on this phone after changing it.</Text>
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing(2) },
  note: { ...typography.supporting },
  meter: { flexDirection: 'row', gap: 4 },
  meterBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthText: { ...typography.caption, fontSize: 12, marginTop: spacing(1.5) },
  reveal: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), height: 44 },
  revealText: { ...typography.caption },
});
