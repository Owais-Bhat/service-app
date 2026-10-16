import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import BackLink from '../components/BackLink';
import GlowButton from '../components/GlowButton';
import StatusBadge from '../components/admin/StatusBadge';
import { CardHeader, FieldError, GuestCard, GuestInput } from '../components/GuestFields';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { trackInquiry, Inquiry } from '../api/inquiries';

interface Props {
  onBack: () => void;
}

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
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + spacing(2), paddingBottom: insets.bottom + spacing(10), paddingHorizontal: spacing(5) }}
      >
        <BackLink onPress={onBack} />
        <Text style={[typography.title, { color: theme.text }]}>Track Your Request</Text>

        <View style={{ marginTop: spacing(4) }}>
          <GuestCard>
            <CardHeader title="Track a request" body="Enter both the ticket number and the phone number used to book." />
            <View style={styles.fields}>
              <GuestInput
                label="Ticket number"
                mono
                autoCapitalize="characters"
                placeholder="NE-260812-1234"
                value={ticketNo}
                onChangeText={setTicketNo}
              />
              <GuestInput label="Phone number" mono keyboardType="phone-pad" placeholder="98765 43210" value={phone} onChangeText={setPhone} />
            </View>
            {error ? <FieldError text={error} /> : null}
            <View style={{ marginTop: spacing(2) }}>
              <GlowButton label="Find my request" onPress={handleTrack} loading={loading} icon="search" />
            </View>
          </GuestCard>
        </View>

        {results?.map((r) => {
          const s = statusColors[r.status] || DEFAULT_STATUS_STYLE;
          return (
            <View key={r.id} style={{ marginTop: spacing(4) }}>
              <GuestCard padding={18}>
                <View style={styles.headRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.overline, { color: theme.text3 }]}>Ticket</Text>
                    <Text style={[styles.ticketNo, { color: theme.accent }]} selectable>{r.ticket_no}</Text>
                  </View>
                  <StatusBadge label={s.label} color={s.color} />
                </View>
                <Text style={[typography.rowTitle, { color: theme.text, marginTop: spacing(2.5) }]}>{r.service_item}</Text>
              </GuestCard>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fields: { gap: 14, marginTop: spacing(4) },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 18 },
});
