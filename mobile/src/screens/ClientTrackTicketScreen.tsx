import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { trackInquiry, Inquiry } from '../api/inquiries';

interface Props {
  onBack: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  case_closed: 'Closed',
};

export default function ClientTrackTicketScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [ticketNo, setTicketNo] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Inquiry[] | null>(null);

  const handleTrack = async () => {
    if (!ticketNo.trim() || !phone.trim()) {
      setError('Enter both your ticket number and phone number');
      return;
    }
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const phoneNormalized = phone.trim().startsWith('+') ? phone.trim() : `+91${phone.trim()}`;
      const rows = await trackInquiry(ticketNo.trim(), phoneNormalized);
      if (rows.length === 0) setError('No ticket found for that number and phone — double-check and try again');
      else setResults(rows);
    } catch {
      setError('Could not check your ticket — check your connection and try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Track Your Request</Text>

        <GlassCard style={styles.formCard}>
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Ticket number (e.g. NE-260812-1234)"
            placeholderTextColor={theme.text3}
            autoCapitalize="characters"
            value={ticketNo}
            onChangeText={setTicketNo}
          />
          <TextInput
            style={[styles.input, { color: theme.text, marginBottom: 0 }]}
            placeholder="Phone number"
            placeholderTextColor={theme.text3}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <GlowButton label="Check Status" onPress={handleTrack} loading={loading} />

        {results?.map((r) => (
          <GlassCard key={r.id} style={styles.resultCard}>
            <Text style={[styles.heading, { color: theme.text }]}>{r.ticket_no}</Text>
            <Text style={[styles.body, { color: theme.text, marginTop: spacing(1) }]}>{r.service_item}</Text>
            <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(2) }]}>Status</Text>
            <Text style={styles.statusValue}>{STATUS_LABEL[r.status] || r.status}</Text>
          </GlassCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  formCard: { marginTop: spacing(4) },
  title: { ...typography.title },
  heading: { ...typography.heading },
  body: { ...typography.body },
  caption: { ...typography.caption },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  resultCard: { marginTop: spacing(5) },
  statusValue: { ...typography.body, color: brand.primary, fontWeight: '700', fontSize: 16 },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
});
