import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import GlowButton from '../components/GlowButton';
import BackLink from '../components/BackLink';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>EOD Report</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>Submit end-of-day summary</Text>

        <GlassCard>
          <TextInput
            style={[styles.input, styles.textArea, { color: theme.text }]}
            placeholder="What did you complete today?"
            placeholderTextColor={theme.text3}
            value={content}
            onChangeText={setContent}
            multiline
          />
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <GlowButton label="Submit EOD Report" onPress={handleSubmit} loading={loading} />

        <Text style={[styles.sectionLabel, { color: theme.text3, marginTop: spacing(5) }]}>Recent Reports</Text>
        {reports.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No reports yet.</Text>
        ) : (
          reports.map((r) => (
            <Panel key={r.id} style={styles.reportRow}>
              <Text style={[styles.reportDate, { color: brand.primary }]}>{r.date}</Text>
              <Text style={[styles.body, { color: theme.text2, marginTop: spacing(1) }]}>{r.content}</Text>
            </Panel>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  body: { ...typography.body },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  input: { ...typography.body, borderRadius: 16, paddingHorizontal: spacing(4), paddingVertical: spacing(3) },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  reportRow: { marginBottom: spacing(2.5) },
  reportDate: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
});
