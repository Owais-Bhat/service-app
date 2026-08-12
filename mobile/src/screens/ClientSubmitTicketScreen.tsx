import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlowButton from '../components/GlowButton';
import { colors, radius, spacing, typography } from '../theme';
import { submitInquiry, Inquiry } from '../api/inquiries';

interface Props {
  onBack: () => void;
}

export default function ClientSubmitTicketScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
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
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={typography.title}>Request Submitted</Text>
        <Text style={[typography.body, { marginTop: spacing(3), textAlign: 'center' }]}>
          Your ticket number is
        </Text>
        <Text style={styles.ticketNo}>{result.ticket_no}</Text>
        <Text style={[typography.caption, { textAlign: 'center', marginTop: spacing(2) }]}>
          Save this number — you can track your request status with it any time.
        </Text>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={typography.title}>Submit a Service Request</Text>

        <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={colors.textDim} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor={colors.textDim} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
        <TextInput style={styles.input} placeholder="Location / address" placeholderTextColor={colors.textDim} value={location} onChangeText={setLocation} />
        <TextInput style={styles.input} placeholder="What's the issue?" placeholderTextColor={colors.textDim} value={issue} onChangeText={setIssue} />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Additional details (optional)"
          placeholderTextColor={colors.textDim}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        {error ? <Text style={{ color: colors.danger, marginBottom: spacing(2) }}>{error}</Text> : null}

        <GlowButton label="Submit Request" onPress={handleSubmit} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing(6) },
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
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  link: { ...typography.caption, color: colors.primary, marginBottom: spacing(3) },
  ticketNo: { ...typography.title, color: colors.primary, marginTop: spacing(2), letterSpacing: 1 },
});
