import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchLeaderboard, LeaderboardEntry } from '../api/leaderboard';

interface Props {
  onBack: () => void;
}

export default function LeaderboardScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchLeaderboard();
      setRows(res.leaderboard);
      setError(null);
    } catch {
      setError('Could not load leaderboard — pull to retry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={styles.link} onPress={onBack}>← Back</Text>
        <Text style={[styles.title, { color: theme.text }]}>Leaderboard</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>This month's verified jobs</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && rows.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No verified jobs yet this month.</Text>
        ) : (
          rows.map((r, i) => {
            const isMe = r.employeeId === user?.id;
            return (
              <Panel key={r.employeeId} style={isMe ? { ...styles.row, borderColor: brand.primary } : styles.row}>
                <Text style={[styles.rank, { color: i === 0 ? '#e08a14' : theme.text3 }]}>#{i + 1}</Text>
                <View style={styles.info}>
                  <Text style={[styles.name, { color: theme.text }]}>{isMe ? 'You' : r.name}</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>{r.jobsCount} job{r.jobsCount === 1 ? '' : 's'}</Text>
                </View>
                <Text style={[styles.score, { color: theme.text2 }]}>{r.avgRating != null ? `★ ${r.avgRating.toFixed(1)}` : '—'}</Text>
              </Panel>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  rank: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14, width: 28 },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  score: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 13 },
});
