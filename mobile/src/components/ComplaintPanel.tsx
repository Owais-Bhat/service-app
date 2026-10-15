import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlowButton from './GlowButton';
import { CardHeader, FieldError, GuestCard, GuestInput } from './GuestFields';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { submitComplaint } from '../api/complaints';

const MAX_LENGTH = 2000;

export default function ComplaintPanel() {
  const { theme } = useTheme();
  const [ticketNo, setTicketNo] = useState('');
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!ticketNo.trim() || !phone.trim() || !text.trim()) {
      setError('Fill in your ticket number, phone number, and what went wrong');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await submitComplaint({
        ticket_no: ticketNo.trim(),
        phone: '+91' + phone.trim(),
        complaint_text: text.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit complaint — please try again');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View>
        <View style={[styles.successIcon, { backgroundColor: theme.okS }]}>
          <Ionicons name="checkmark-circle-outline" size={40} color={theme.ok} />
        </View>
        <Text style={[typography.largeTitle, { color: theme.text }]}>Complaint received</Text>
        <Text style={[typography.body, styles.successBody, { color: theme.text2 }]}>
          Our team has been notified and will follow up on ticket{' '}
          <Text style={{ color: theme.text, fontFamily: 'JetBrainsMono_700Bold' }}>{ticketNo}</Text> soon.
        </Text>
        <View style={{ marginTop: spacing(6) }}>
          <GlowButton
            label="Done"
            onPress={() => { setSubmitted(false); setTicketNo(''); setPhone(''); setText(''); }}
          />
        </View>
      </View>
    );
  }

  return (
    <GuestCard>
      <CardHeader
        title="Tell us what went wrong"
        body="For an existing ticket — the issue came back, the technician didn't show, billing was wrong. We check the ticket against your phone number, then a supervisor reviews it."
      />
      <View style={styles.fields}>
        <GuestInput
          label="Ticket number"
          mono
          autoCapitalize="characters"
          placeholder="NE-260506-1234"
          value={ticketNo}
          onChangeText={setTicketNo}
        />
        <GuestInput
          label="Phone number"
          prefix="+91"
          mono
          keyboardType="number-pad"
          placeholder="98765 43210"
          value={phone}
          onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
        />
        <GuestInput
          label="What went wrong?"
          multiline
          minHeight={96}
          placeholder="Describe what went wrong…"
          value={text}
          onChangeText={(v) => setText(v.slice(0, MAX_LENGTH))}
          counter={`${text.length} / ${MAX_LENGTH}`}
        />
      </View>
      {error && <FieldError text={error} />}
      <View style={{ marginTop: spacing(2) }}>
        <GlowButton label={loading ? 'Submitting…' : 'Send complaint'} onPress={handleSubmit} loading={loading} />
      </View>
    </GuestCard>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, marginTop: spacing(4) },
  successIcon: { width: 72, height: 72, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(5) },
  successBody: { marginTop: spacing(2) },
});
