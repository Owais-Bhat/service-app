import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { submitLeaveRequest } from '../api/attendance';
import { ApiError } from '../api/client';

interface Props {
  onBack: () => void;
}

export default function LeaveFormScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!user) return;
    if (!startDate.trim() || !endDate.trim() || !reason.trim()) {
      setError('Fill in the start date, end date, and reason');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await submitLeaveRequest(user.id, startDate.trim(), endDate.trim(), reason.trim());
      onBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your request — check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
          <Text style={styles.link} onPress={onBack}>← Back</Text>
          <Text style={[styles.title, { color: theme.text }]}>New Leave Request</Text>

          <GlassCard style={styles.formCard}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Start date (YYYY-MM-DD)"
              placeholderTextColor={theme.text3}
              value={startDate}
              onChangeText={setStartDate}
            />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="End date (YYYY-MM-DD)"
              placeholderTextColor={theme.text3}
              value={endDate}
              onChangeText={setEndDate}
            />
            <TextInput
              style={[styles.input, styles.textArea, { color: theme.text, marginBottom: 0 }]}
              placeholder="Reason"
              placeholderTextColor={theme.text3}
              value={reason}
              onChangeText={setReason}
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
  formCard: { marginTop: spacing(4) },
  title: { ...typography.title },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
});
