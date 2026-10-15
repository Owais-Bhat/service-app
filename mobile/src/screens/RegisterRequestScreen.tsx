import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import AdminScreen from '../components/admin/AdminScreen';
import ActionButton from '../components/admin/ActionButton';
import Field from '../components/admin/Field';
import SectionLabel from '../components/admin/SectionLabel';
import { useAuth } from '../context/AuthContext';
import { fetchServicePricing } from '../api/servicePricing';
import { registerWalkInRequest } from '../api/employeeExtra';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  onBack: () => void;
}

function Choice({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.chips}>
      {items.map((c) => {
        const on = c === value;
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
          >
            <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]} numberOfLines={1}>{c}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A customer who walked in or phoned in: register it and take the job in one
// step. The same three writes the web "Register & Accept" button performs.
export default function RegisterRequestScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [categories, setCategories] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [issue, setIssue] = useState('');
  const [customIssue, setCustomIssue] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [description, setDescription] = useState('');
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchServicePricing()
      .then((rows) => {
        const cats = [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))];
        setCategories(cats);
        if (cats.length === 0) setIssue('Other');
      })
      .catch(() => setIssue('Other'));
  }, []);

  const issueChoices = useMemo(() => [...categories, 'Other'], [categories]);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Location', 'Allow location access to capture the customer address.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = pos.coords;
      setCoords({ lat, lng });
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const text = [place?.name, place?.street, place?.district, place?.city, place?.region].filter(Boolean).join(', ');
        setLocation(text || `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      } catch {
        setLocation(`GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    } catch {
      Alert.alert('Location', 'Could not detect your location. Type the address instead.');
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    const digits = phone.replace(/\D/g, '');
    const serviceItem = issue === 'Other' ? customIssue.trim() : issue;
    if (!name.trim()) return Alert.alert('Customer name', 'Enter the customer name');
    if (digits.length !== 10) return Alert.alert('Phone number', 'Enter a valid 10-digit mobile number');
    if (!serviceItem) return Alert.alert('Issue', 'Choose or describe the issue');
    if (!location.trim()) return Alert.alert('Location', 'The address is required');
    if (!user) return;

    setBusy(true);
    try {
      const no = await registerWalkInRequest({
        employeeId: user.id,
        name: name.trim(),
        phone10: digits,
        serviceItem,
        location: location.trim(),
        description: description.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      Alert.alert('Request registered', `${no} is registered and accepted — it is in your tasks now.`, [{ text: 'OK', onPress: onBack }]);
    } catch (e) {
      Alert.alert('Could not register', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminScreen title="Register Customer" subtitle="Walk-in or phone request, accepted by you" onBack={onBack}>
      <View style={styles.form}>
        <Field label="Customer name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10 digits" />

        <SectionLabel>Issue</SectionLabel>
        <Choice items={issueChoices} value={issue} onChange={setIssue} />
        {issue === 'Other' ? <Field label="Describe the issue" value={customIssue} onChangeText={setCustomIssue} /> : null}

        <SectionLabel>Where</SectionLabel>
        <Field label="Address" value={location} onChangeText={setLocation} multiline hint={coords ? `GPS ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : undefined} />
        <ActionButton label={locating ? 'Finding…' : 'Use my current location'} tone="neutral" busy={locating} onPress={useMyLocation} />

        <Field label="Notes (optional)" value={description} onChangeText={setDescription} multiline />

        <Text style={[styles.note, { color: theme.text3 }]}>The request is created already assigned to you and accepted.</Text>
        <ActionButton label="Register & accept" tone="success" busy={busy} onPress={submit} />
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
