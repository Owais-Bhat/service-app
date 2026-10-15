import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import BackLink from '../components/BackLink';
import GlowButton from '../components/GlowButton';
import { CardHeader, FieldError, GuestCard, GuestInput } from '../components/GuestFields';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: insets.top + spacing(12), paddingBottom: insets.bottom + spacing(10), paddingHorizontal: spacing(6) }}
        >
          <View style={[styles.successIcon, { backgroundColor: theme.okS }]}>
            <Ionicons name="checkmark-circle-outline" size={40} color={theme.ok} />
          </View>
          <Text style={[typography.largeTitle, { color: theme.text }]}>Request received</Text>
          <Text style={[typography.body, { color: theme.text2, marginTop: spacing(2) }]}>
            We&apos;ll assign a technician shortly and send you an SMS when they&apos;re on the way.
          </Text>
          <View style={{ marginTop: spacing(6) }}>
            <GuestCard>
              <Text style={[typography.overline, { color: theme.text3 }]}>Your ticket number</Text>
              <Text style={[styles.ticketNo, { color: theme.accent }]} selectable>{result.ticket_no}</Text>
              <Text style={[typography.supporting, { color: theme.text2, fontSize: 12, lineHeight: 16 }]}>
                Save this number — you can track your request status with it any time.
              </Text>
            </GuestCard>
          </View>
          <View style={{ marginTop: spacing(6) }}>
            <GlowButton label="Back" onPress={onBack} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + spacing(2), paddingBottom: insets.bottom + spacing(10), paddingHorizontal: spacing(5) }}
      >
        <BackLink onPress={onBack} />
        <Text style={[typography.title, { color: theme.text }]}>Submit a Service Request</Text>

        <View style={{ marginTop: spacing(4) }}>
          <GuestCard>
            <CardHeader title="Your details" body="We'll use them to send a technician and keep you updated." />
            <View style={styles.fields}>
              <GuestInput label="Your name" required placeholder="Full name" value={name} onChangeText={setName} />
              <GuestInput label="Phone number" required mono placeholder="98765 43210" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              <GuestInput label="Location" required placeholder="Location / address" value={location} onChangeText={setLocation} />
              <GuestInput label="What's the issue?" required placeholder="e.g. CCTV not recording" value={issue} onChangeText={setIssue} />
              <GuestInput
                label="Additional details"
                optional
                multiline
                placeholder="Anything our technician should know…"
                value={description}
                onChangeText={setDescription}
              />
            </View>
            {error ? <FieldError text={error} /> : null}
            <View style={{ marginTop: spacing(3) }}>
              <GlowButton label="Submit request" onPress={handleSubmit} loading={loading} />
            </View>
          </GuestCard>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fields: { gap: 14, marginTop: spacing(4) },
  successIcon: { width: 72, height: 72, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(5) },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 28, letterSpacing: 0.5, marginTop: spacing(1.5), marginBottom: spacing(3) },
});
