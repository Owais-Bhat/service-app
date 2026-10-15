import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AdminScreen from '../../components/admin/AdminScreen';
import ActionButton from '../../components/admin/ActionButton';
import FilterChips from '../../components/admin/FilterChips';
import GlowButton from '../../components/GlowButton';
import Field from '../../components/admin/Field';
import SectionLabel from '../../components/admin/SectionLabel';
import { createAdminRequest, fetchOnlineEmployees, OnlineEmployee } from '../../api/adminManage';
import { getLandingBootstrap } from '../../api/landing';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';

interface Props {
  onBack: () => void;
}

// Admin creates a ticket for a customer who rang in — no OTP. It can be handed
// to an employee who is clocked in right now, or left unassigned for the queue.
export default function AdminRegisterRequestScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<string[]>([]);
  const [online, setOnline] = useState<OnlineEmployee[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [issue, setIssue] = useState('');
  const [other, setOther] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [bill, setBill] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [description, setDescription] = useState('');
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLandingBootstrap()
      .then((b) => setCategories(b.categories || []))
      .catch(() => {});
    fetchOnlineEmployees().then(setOnline).catch(() => {});
  }, []);

  const issueChoices = useMemo(() => [...categories, 'Other'].map((c) => ({ key: c, label: c })), [categories]);
  const people = useMemo(() => [{ key: '', label: 'Leave unassigned' }, ...online.map((e) => ({ key: e.id, label: e.full_name || 'Employee' }))], [online]);

  const locate = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return Alert.alert('Location', 'Allow location access to capture the customer pin.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      try {
        const [p] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const text = [p?.name, p?.street, p?.district, p?.city].filter(Boolean).join(', ');
        if (text && !location) setLocation(text);
      } catch {
        /* the pin alone is enough */
      }
    } catch {
      Alert.alert('Location', 'Could not detect the location. Type the address instead.');
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    const service = issue === 'Other' ? `Other: ${other.trim()}` : issue;
    if (!name.trim()) return Alert.alert('Customer name', 'Enter the customer name');
    if (digits.length !== 10) return Alert.alert('Phone number', 'Enter a valid 10-digit mobile number');
    if (!location.trim()) return Alert.alert('Location', 'Location is required');
    if (!issue) return Alert.alert('Issue', 'Select the issue');
    if (issue === 'Other' && !other.trim()) return Alert.alert('Issue', 'Describe the issue');

    setBusy(true);
    try {
      const no = await createAdminRequest({
        name: name.trim(),
        phone10: digits,
        location: location.trim(),
        serviceItem: service,
        description: description.trim(),
        billNo: bill.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        employeeId,
      });
      Alert.alert('Request created', `${no} is registered.`, [{ text: 'OK', onPress: onBack }]);
    } catch (e) {
      Alert.alert('Could not create', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AdminScreen title="Register request" subtitle="On behalf of a customer — no OTP" onBack={onBack}>
        <View style={styles.form}>
          <Text style={[styles.note, { color: theme.text3 }]}>
            The customer gets the ticket confirmation SMS, and the technician gets the job message if you assign one.
          </Text>
          <Field label="Customer name" value={name} onChangeText={setName} autoCapitalize="words" required />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10 digit mobile number" required />

          <SectionLabel>Issue</SectionLabel>
          <FilterChips items={issueChoices} activeKey={issue} onSelect={setIssue} />
          {issue === 'Other' ? <Field label="Describe the issue" value={other} onChangeText={setOther} required /> : null}

          <SectionLabel>Assign</SectionLabel>
          <FilterChips items={people} activeKey={employeeId} onSelect={setEmployeeId} />
          <Text style={[styles.note, { color: theme.text3 }]}>
            {online.length === 0 ? 'Nobody is clocked in, so it will be created unassigned.' : 'Only employees clocked in right now can receive it.'}
          </Text>

          <SectionLabel>Where</SectionLabel>
          <Field label="Location" value={location} onChangeText={setLocation} multiline required hint={coords ? `Pin ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : undefined} />
          <ActionButton label={locating ? 'Finding…' : 'Capture exact pin'} tone="neutral" busy={locating} onPress={locate} />

          <Field label="Device bill no. (optional)" value={bill} onChangeText={setBill} />
          <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline />
        </View>
      </AdminScreen>
      <View style={[styles.sticky, { backgroundColor: theme.surfaceStrong, borderTopColor: theme.line, paddingBottom: insets.bottom + spacing(3) }]}>
        <GlowButton label="Register request" icon="check" loading={busy} onPress={submit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { gap: spacing(3) },
  note: { ...typography.caption, fontSize: 12 },
  sticky: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1 },
});
