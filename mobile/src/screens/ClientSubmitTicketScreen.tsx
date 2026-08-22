import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { submitInquiry, Inquiry } from '../api/inquiries';

interface Props {
  onBack: () => void;
}

export default function ClientSubmitTicketScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [issue, setIssue] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Inquiry | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim() || !location.trim() || !issue.trim()) {
      setError('Please fill in name, phone, location, and the issue');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const inquiry = await submitInquiry({
        full_name: name.trim(),
        phone: phone.trim().startsWith('+') ? phone.trim() : `+91${phone.trim()}`,
        location: location.trim(),
        service_item: issue.trim(),
        description: description.trim() || null,
      });
      setResult(inquiry);
    } catch (err) {
      setError('Could not submit your request — check your connection and try again');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <GlassCard style={styles.resultCard}>
            <Text style={[styles.title, { color: theme.text }]}>Request Submitted</Text>
            <Text style={[styles.body, { color: theme.text, marginTop: spacing(3), textAlign: 'center' }]}>
              Your ticket number is
            </Text>
            <Text style={styles.ticketNo}>{result.ticket_no}</Text>
            <Text style={[styles.caption, { color: theme.text3, textAlign: 'center', marginTop: spacing(2) }]}>
              Save this number — you can track your request status with it any time.
            </Text>
          </GlassCard>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MeshBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
          <Text style={[styles.title, { color: theme.text }]}>Submit a Service Request</Text>

          <GlassCard style={styles.formCard}>
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="Your name" placeholderTextColor={theme.text3} value={name} onChangeText={setName} />
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="Phone number" placeholderTextColor={theme.text3} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="Location / address" placeholderTextColor={theme.text3} value={location} onChangeText={setLocation} />
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="What's the issue?" placeholderTextColor={theme.text3} value={issue} onChangeText={setIssue} />
            <TextInput
              style={[styles.input, styles.textArea, { color: theme.text, marginBottom: 0 }]}
              placeholder="Additional details (optional)"
              placeholderTextColor={theme.text3}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </GlassCard>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <GlowButton label="Submit Request" onPress={handleSubmit} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing(6) },
  formCard: { marginTop: spacing(4) },
  resultCard: { alignItems: 'center', paddingVertical: spacing(6) },
  title: { ...typography.title },
  body: { ...typography.body },
  caption: { ...typography.caption },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  ticketNo: { ...typography.title, fontFamily: 'JetBrainsMono_700Bold', color: brand.primary, marginTop: spacing(2), letterSpacing: 1 },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
});
