import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { trackInquiry, Inquiry } from '../api/inquiries';
import { submitComplaint } from '../api/complaints';

interface Props {
  reopenButtonEnabled: boolean;
  reopenLimit: number;
}

export default function TrackPanel({ reopenButtonEnabled, reopenLimit }: Props) {
  const { theme } = useTheme();
  const [ticketNo, setTicketNo] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Inquiry[] | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reopened, setReopened] = useState(false);

  const handleTrack = async () => {
    if (!ticketNo.trim() || !phone.trim()) {
      setError('Enter both your ticket number and phone number');
      return;
    }
    setError(null);
    setLoading(true);
    setResults(null);
    setReopened(false);
    try {
      const phoneNormalized = '+91' + phone.trim();
      const rows = await trackInquiry(ticketNo.trim(), phoneNormalized);
      if (rows.length === 0) setError('No ticket found for that number and phone — double-check and try again');
      else setResults(rows);
    } catch {
      setError('Could not check your ticket — check your connection and try again');
    } finally {
      setLoading(false);
    }
  };

  const handleReopen = async (r: Inquiry) => {
    setReopening(true);
    try {
      await submitComplaint({
        ticket_no: r.ticket_no,
        phone: r.phone,
        complaint_text: 'ISSUE NOT RESOLVED: reopened from ticket tracking',
      });
      setReopened(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen — please try again');
    } finally {
      setReopening(false);
    }
  };

  if (results) {
    return (
      <View>
        <Pressable onPress={() => setResults(null)} style={{ marginBottom: spacing(3) }}>
          <Text style={{ color: brand.primary, fontSize: 12, fontFamily: 'Manrope_700Bold' }}>← New search</Text>
        </Pressable>
        {results.map((r) => {
          const s = statusColors[r.status] || DEFAULT_STATUS_STYLE;
          const canReopen = reopenButtonEnabled && (r.status === 'resolved' || r.status === 'case_closed' || r.status === 'closed');
          return (
            <GlassCard key={r.id} style={{ marginBottom: spacing(3) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.ticketNo, { color: theme.text }]}>{r.ticket_no}</Text>
                  <Text style={{ color: theme.text2, fontSize: 12, marginTop: 2 }}>{r.service_item}</Text>
                  <Text style={{ color: theme.text3, fontSize: 11, marginTop: 2 }}>{r.location}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
                  <Text style={{ color: s.color, fontSize: 11, fontFamily: 'Manrope_700Bold' }}>{s.label}</Text>
                </View>
              </View>
              {canReopen && !reopened && (
                <Pressable
                  onPress={() => handleReopen(r)}
                  disabled={reopening}
                  style={[styles.reopenBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}
                >
                  <Text style={{ color: theme.text, fontSize: 12 }}>
                    {reopening ? 'Reopening…' : `Issue not resolved? Reopen (max ${reopenLimit})`}
                  </Text>
                </Pressable>
              )}
              {reopened && <Text style={{ color: semantic.success, fontSize: 12, marginTop: spacing(3) }}>Reopened — our team has been notified.</Text>}
            </GlassCard>
          );
        })}
      </View>
    );
  }

  return (
    <GlassCard>
      <Text style={[styles.title, { color: theme.text }]}>Track your requests</Text>
      <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
        Enter your phone number and ticket number to see its status.
      </Text>
      <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
        <Icon name="phone" size={16} color={theme.text3} />
        <TextInput
          value={phone}
          onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
          keyboardType="number-pad"
          placeholder="98765 43210"
          placeholderTextColor={theme.text3}
          style={[styles.input, { color: theme.text }]}
        />
      </View>
      <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2, marginTop: spacing(3) }]}>
        <Icon name="search" size={16} color={theme.text3} />
        <TextInput
          value={ticketNo}
          onChangeText={setTicketNo}
          autoCapitalize="characters"
          placeholder="NE-260506-1234"
          placeholderTextColor={theme.text3}
          style={[styles.input, { color: theme.text }]}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <GlowButton label={loading ? 'Checking…' : 'Show my ticket'} onPress={handleTrack} loading={loading} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, fontSize: 17 },
  body: { ...typography.body, fontSize: 12.5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(1) },
  input: { flex: 1, paddingVertical: spacing(2.5), fontSize: 14, fontFamily: 'Manrope_400Regular' },
  error: { color: semantic.danger, fontSize: 12, marginTop: spacing(2), marginBottom: spacing(1) },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15 },
  statusPill: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.full },
  reopenBtn: { marginTop: spacing(3), borderWidth: 1, borderRadius: radius.sm, padding: spacing(2.5), alignItems: 'center' },
});
