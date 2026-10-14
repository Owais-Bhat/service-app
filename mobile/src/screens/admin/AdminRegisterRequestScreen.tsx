import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import AdminScreen from '../../components/admin/AdminScreen';
import ActionButton from '../../components/admin/ActionButton';
import Field from '../../components/admin/Field';
import SectionLabel from '../../components/admin/SectionLabel';
import { createAdminRequest, fetchOnlineEmployees, OnlineEmployee } from '../../api/adminManage';
import { getLandingBootstrap } from '../../api/landing';
import { PREFERRED_TIMES } from '../../api/employeeExtra';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';

interface Props {
  onBack: () => void;
}

function Choice({ items, value, onChange }: { items: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.chips}>
      {items.map((c) => {
        const on = c.key === value;
        return (
          <Pressable
            key={c.key}
            onPress={() => onChange(c.key)}
            style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
          >
            <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]} numberOfLines={1}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Admin creates a ticket for a customer who rang in — no OTP. It can be handed
// to an employee who is clocked in right now, or left unassigned for the queue.
export default function AdminRegisterRequestScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [categories, setCategories] = useState<string[]>([]);
  const [online, setOnline] = useState<OnlineEmployee[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [time, setTime] = useState('As soon as possible');
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
        company: company.trim(),
        location: location.trim(),
        serviceItem: service,
        description: description.trim(),
        billNo: bill.trim(),
        preferredTime: time,
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
    <AdminScreen title="Register Request" subtitle="Create a ticket for a customer — no OTP" onBack={onBack}>
      <View style={styles.form}>
        <Text style={[styles.note, { color: theme.text3 }]}>
          The customer gets the ticket confirmation SMS, and the technician gets the job message if you assign one.
        </Text>
        <Field label="Customer name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10 digit mobile number" />
        <Field label="Company (optional)" value={company} onChangeText={setCompany} autoCapitalize="words" />

        <SectionLabel>Issue</SectionLabel>
        <Choice items={issueChoices} value={issue} onChange={setIssue} />
        {issue === 'Other' ? <Field label="Describe the issue" value={other} onChangeText={setOther} /> : null}

        <SectionLabel>Preferred time</SectionLabel>
        <Choice items={PREFERRED_TIMES.map((t) => ({ key: t, label: t }))} value={time} onChange={setTime} />

        <SectionLabel>Assign</SectionLabel>
        <Choice items={people} value={employeeId} onChange={setEmployeeId} />
        <Text style={[styles.note, { color: theme.text3 }]}>
          {online.length === 0 ? 'Nobody is clocked in, so it will be created unassigned.' : 'Only employees clocked in right now can receive it.'}
        </Text>

        <SectionLabel>Where</SectionLabel>
        <Field label="Location" value={location} onChangeText={setLocation} multiline hint={coords ? `Pin ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : undefined} />
        <ActionButton label={locating ? 'Finding…' : 'Capture exact pin'} tone="neutral" busy={locating} onPress={locate} />

        <Field label="Device bill no. (optional)" value={bill} onChangeText={setBill} />
        <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline />
        <ActionButton label="Create request" tone="success" busy={busy} onPress={submit} />
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2), maxWidth: '100%' },
  chipText: { ...typography.caption, fontSize: 12 },
  note: { ...typography.caption, fontSize: 12 },
});
