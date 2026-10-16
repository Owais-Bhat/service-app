import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import ToolHeader from '../components/ToolHeader';
import Field from '../components/admin/Field';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { submitLeaveRequest } from '../api/attendance';
import { ApiError } from '../api/client';

interface Props {
  onBack: () => void;
}

// "2 days · Thu – Fri" under the date fields, once both parse and are in order.
function spanLabel(start: string, end: string): string | null {
  const a = new Date(`${start.trim()}T00:00:00`);
  const b = new Date(`${end.trim()}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${days} day${days === 1 ? '' : 's'} · ${days === 1 ? day(a) : `${day(a)} – ${day(b)}`}`;
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

  const span = spanLabel(startDate, endDate);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title="Request leave" subtitle="Your manager is notified when you send" onBack={onBack} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.dates}>
          <View style={styles.dateCell}>
            <Field label="From" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" required />
          </View>
          <View style={styles.dateCell}>
            <Field label="To" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" required />
          </View>
        </View>
        {span ? <Text style={[styles.span, { color: theme.text2 }]}>{span}</Text> : null}

        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Why do you need leave?" multiline required />

        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.sticky, { backgroundColor: theme.surfaceStrong, borderTopColor: theme.line, paddingBottom: insets.bottom + 22 }]}>
        <View style={{ flex: 1 }}>
          <GlowButton label="Send request" onPress={handleSubmit} loading={loading} icon="arrow-right" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), paddingBottom: spacing(6), gap: spacing(5) },
  dates: { flexDirection: 'row', gap: spacing(2.5) },
  dateCell: { flex: 1 },
  span: { ...typography.caption, marginTop: -spacing(2.5) },
  error: { ...typography.caption },
  sticky: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing(1), paddingHorizontal: spacing(4), borderTopWidth: 1 },
});
