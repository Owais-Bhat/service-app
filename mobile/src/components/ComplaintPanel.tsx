import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { submitComplaint } from '../api/complaints';

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
      <GlassCard>
        <Text style={[styles.title, { color: theme.text }]}>Complaint received</Text>
        <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>
          Our team has been notified and will follow up on ticket <Text style={{ color: theme.text, fontFamily: 'JetBrainsMono_700Bold' }}>{ticketNo}</Text> soon.
        </Text>
        <Pressable onPress={() => { setSubmitted(false); setTicketNo(''); setPhone(''); setText(''); }} style={{ marginTop: spacing(4) }}>
          <Text style={{ color: brand.primary, fontSize: 12, fontFamily: 'Manrope_700Bold' }}>File another complaint</Text>
        </Pressable>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <Text style={[styles.title, { color: theme.text }]}>File a complaint</Text>
      <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
        For an existing ticket — the issue came back, the technician didn&apos;t show, billing was wrong, etc.
      </Text>

      <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
        <Icon name="search" size={16} color={theme.text3} />
        <TextInput value={ticketNo} onChangeText={setTicketNo} autoCapitalize="characters" placeholder="NE-260506-1234" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
      </View>
      <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2, marginTop: spacing(3) }]}>
        <Icon name="phone" size={16} color={theme.text3} />
        <TextInput value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" placeholder="98765 43210" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
      </View>
      <TextInput
        value={text}
        onChangeText={(v) => setText(v.slice(0, 2000))}
        placeholder="Describe what went wrong…"
        placeholderTextColor={theme.text3}
        multiline
        numberOfLines={4}
        style={[styles.textarea, { borderColor: theme.line, backgroundColor: theme.panel2, color: theme.text, marginTop: spacing(3) }]}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <GlowButton label={loading ? 'Submitting…' : 'Submit complaint'} onPress={handleSubmit} loading={loading} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, fontSize: 17 },
  body: { ...typography.body, fontSize: 12.5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(1) },
  input: { flex: 1, paddingVertical: spacing(2.5), fontSize: 14, fontFamily: 'Manrope_400Regular' },
  textarea: { borderWidth: 1, borderRadius: radius.sm, padding: spacing(3), fontSize: 13, minHeight: 100, textAlignVertical: 'top', fontFamily: 'Manrope_400Regular' },
  error: { color: semantic.danger, fontSize: 12, marginTop: spacing(2), marginBottom: spacing(1) },
});
