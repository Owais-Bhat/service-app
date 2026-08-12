import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlowButton from '../components/GlowButton';
import { colors, radius, spacing, typography } from '../theme';
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
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
      <Text style={styles.link} onPress={onBack}>← Back</Text>
      <Text style={typography.title}>Track Your Request</Text>

      <TextInput
        style={styles.input}
        placeholder="Ticket number (e.g. NE-260812-1234)"
        placeholderTextColor={colors.textDim}
        autoCapitalize="characters"
        value={ticketNo}
        onChangeText={setTicketNo}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone number"
        placeholderTextColor={colors.textDim}
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />

      {error ? <Text style={{ color: colors.danger, marginBottom: spacing(2) }}>{error}</Text> : null}

      <GlowButton label="Check Status" onPress={handleTrack} loading={loading} />

      {results?.map((r) => (
        <View key={r.id} style={styles.resultCard}>
          <Text style={typography.heading}>{r.ticket_no}</Text>
          <Text style={[typography.body, { marginTop: spacing(1) }]}>{r.service_item}</Text>
          <Text style={[typography.caption, { marginTop: spacing(2) }]}>Status</Text>
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>
            {STATUS_LABEL[r.status] || r.status}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    color: colors.text,
    marginTop: spacing(3),
    fontSize: 15,
  },
  link: { ...typography.caption, color: colors.primary, marginBottom: spacing(3) },
  resultCard: {
    marginTop: spacing(5),
    padding: spacing(4),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
