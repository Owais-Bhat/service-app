import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import ToolHeader from '../components/ToolHeader';
import Field from '../components/admin/Field';
import GlowButton from '../components/GlowButton';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { ApiError } from '../api/client';
import { fetchEodReports, submitEodReport, EodReport } from '../api/eod';

interface Props {
  onBack: () => void;
}

export default function EodReportScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [reports, setReports] = useState<EodReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await fetchEodReports(user.id);
      setReports(rows);
    } catch {
      setError('Could not load past reports');
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!user) return;
    if (!content.trim()) {
      setError('Describe what you completed today');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await submitEodReport(user.id, content.trim());
      setContent('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit — check your connection');
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title="EOD report" subtitle={today} onBack={onBack} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={[styles.info, { backgroundColor: theme.infoS }]}>
          <Icon name="alert" size={18} color={theme.info} />
          <Text style={[styles.infoText, { color: theme.text }]}>
            Required before you clock out. Tomorrow's clock-in is paused if it's missing.
          </Text>
        </View>

        <Field
          label="What did you complete today?"
          value={content}
          onChangeText={setContent}
          placeholder="Jobs done, cash collected, pending work, issues…"
          multiline
          required
        />

        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={[styles.heading, { color: theme.text }]}>Recent reports</Text>
          {reports.length === 0 ? (
            <Text style={[styles.caption, { color: theme.text3 }]}>No reports yet.</Text>
          ) : (
            <View style={[styles.listPanel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              {reports.map((r, i) => (
                <View key={r.id} style={[styles.reportRow, i < reports.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                  <Text style={[styles.reportDate, { color: theme.accent }]}>{r.date}</Text>
                  <Text style={[styles.body, { color: theme.text2 }]}>{r.content}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.sticky, { backgroundColor: theme.surfaceStrong, borderTopColor: theme.line, paddingBottom: insets.bottom + 22 }]}>
        <View style={{ flex: 1 }}>
          <GlowButton label="Submit EOD report" onPress={handleSubmit} loading={loading} icon="check" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), paddingBottom: spacing(6), gap: spacing(5) },
  info: { flexDirection: 'row', gap: spacing(2.5), padding: spacing(3.5), borderRadius: 16, alignItems: 'flex-start' },
  infoText: { flex: 1, ...typography.supporting },
  heading: { ...typography.heading, fontSize: 16, lineHeight: 22 },
  body: { ...typography.supporting, fontSize: 14, lineHeight: 20 },
  caption: { ...typography.caption },
  error: { ...typography.caption },
  section: { gap: spacing(2) },
  listPanel: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  reportRow: { padding: spacing(3.5), gap: spacing(1) },
  reportDate: { ...typography.monoId },
  sticky: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing(1), paddingHorizontal: spacing(4), borderTopWidth: 1 },
});
