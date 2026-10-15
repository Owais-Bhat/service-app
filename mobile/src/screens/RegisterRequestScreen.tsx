import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import AdminScreen from '../components/admin/AdminScreen';
import FilterChips from '../components/admin/FilterChips';
import GlowButton from '../components/GlowButton';
import Icon from '../components/Icon';
import Field from '../components/admin/Field';
import SectionLabel from '../components/admin/SectionLabel';
import { useAuth } from '../context/AuthContext';
import { fetchServicePricing } from '../api/servicePricing';
import { registerWalkInRequest } from '../api/employeeExtra';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';

interface Props {
  onBack: () => void;
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
    <AdminScreen title="Register Customer" subtitle="Walk-in request" onBack={onBack}>
      <View style={styles.form}>
        <View style={[styles.infoBanner, { backgroundColor: theme.infoS }]}>
          <Icon name="alert" size={18} color={theme.info} />
          <Text style={[styles.infoText, { color: theme.text }]}>For walk-in customers. The request is created and accepted by you right away.</Text>
        </View>

        <Field label="Customer name" required value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="Mobile number" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10 digits" />

        <SectionLabel>Issue</SectionLabel>
        <FilterChips items={issueChoices.map((c) => ({ key: c, label: c }))} activeKey={issue} onSelect={setIssue} />
        {issue === 'Other' ? <Field label="Describe the issue" required value={customIssue} onChangeText={setCustomIssue} /> : null}

        <SectionLabel>Where</SectionLabel>
        <Field label="Address" required value={location} onChangeText={setLocation} multiline hint={coords ? `GPS ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : undefined} />
        <GlowButton label={locating ? 'Finding…' : 'Use my current location'} onPress={useMyLocation} loading={locating} variant="secondary" icon="crosshair" />

        <Field label="Notes (optional)" value={description} onChangeText={setDescription} multiline />

        <Text style={[styles.note, { color: theme.text3 }]}>The request is created already assigned to you and accepted.</Text>
        <GlowButton label="Register & accept" onPress={submit} loading={busy} icon="add" />
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing(3.5) },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md },
  infoText: { ...typography.caption, fontSize: 12, lineHeight: 16, flex: 1 },
  note: { ...typography.supporting, fontSize: 12 },
});
