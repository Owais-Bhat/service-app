import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import ToolHeader from '../components/ToolHeader';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { fetchLeaderboard, LeaderboardEntry } from '../api/leaderboard';

interface Props {
  onBack: () => void;
}

type Period = 'monthly' | 'allTime';

function initials(name: string): string {
  return (
    String(name || '?')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

// Competition ranking by review count — the server already sorts by count,
// then average rating, then 5-stars. Equal counts share the rank and show a
// leading "=" (design: "the tied technicians share the rank").
function rankLabels(entries: LeaderboardEntry[]): string[] {
  return entries.map((e, i) => {
    const first = entries.findIndex((o) => o.count === e.count);
    const tied = entries.filter((o) => o.count === e.count).length > 1;
    return `${tied ? '=' : ''}${first + 1}`;
  });
}

export default function LeaderboardScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [monthly, setMonthly] = useState<LeaderboardEntry[]>([]);
  const [allTime, setAllTime] = useState<LeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<Period>('monthly');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchLeaderboard();
      setMonthly(res.monthly || []);
      setAllTime(res.allTime || []);
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

  const entries = period === 'monthly' ? monthly : allTime;
  const labels = rankLabels(entries);
  const myIndex = entries.findIndex((e) => e.id === user?.id);
  const me = myIndex >= 0 ? entries[myIndex] : undefined;
  const myRank = myIndex >= 0 ? labels[myIndex].replace('=', '') : null;
  const ahead = myIndex > 0 ? entries[myIndex - 1] : undefined;
  const behind = ahead && me ? ahead.count - me.count : 0;
  const hasAnyReviews = monthly.some((e) => e.count > 0);
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title="Leaderboard" subtitle={monthName} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.ok} />}
      >
        <View style={[styles.segment, { backgroundColor: theme.panel2 }]}>
          {([['monthly', monthName.split(' ')[0]], ['allTime', 'All time']] as [Period, string][]).map(([key, label]) => {
            const active = period === key;
            return (
              <Text
                key={key}
                onPress={() => setPeriod(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.segItem,
                  active
                    ? { backgroundColor: theme.panel, color: theme.text, fontFamily: 'Manrope_700Bold', borderColor: theme.border }
                    : { color: theme.text2, fontFamily: 'Manrope_600SemiBold', borderColor: 'transparent' },
                ]}
              >
                {label}
              </Text>
            );
          })}
        </View>

        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

        {!loading && !hasAnyReviews ? (
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIconChip, { backgroundColor: theme.okS }]}>
              <Icon name="leaderboard" size={22} color={theme.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No verified reviews yet</Text>
            <Text style={[styles.emptyBody, { color: theme.text3 }]}>Complete jobs and collect customer feedback to climb the board.</Text>
          </View>
        ) : (
          <>
            <GlassCard style={styles.hero}>
              <View style={styles.heroRow}>
                <Text style={[styles.heroRank, { color: theme.accent }]}>{myRank ? `#${myRank}` : '—'}</Text>
                <View style={styles.heroText}>
                  <Text style={[styles.heroTitle, { color: theme.text }]}>
                    You · {me?.count ?? 0} review{(me?.count ?? 0) === 1 ? '' : 's'}
                  </Text>
                  <Text style={[styles.heroSub, { color: theme.text2 }]}>
                    {me && behind > 0
                      ? `${behind} review${behind === 1 ? '' : 's'} behind #${labels[myIndex - 1].replace('=', '')}. Ranked by most reviews received.`
                      : 'Ranked by most reviews received, then average rating.'}
                  </Text>
                </View>
              </View>
            </GlassCard>

            <Panel style={styles.list}>
              {entries.map((e, i) => {
                const isYou = e.id === user?.id;
                const last = i === entries.length - 1;
                return (
                  <View
                    key={e.id}
                    style={[
                      styles.row,
                      !last && { borderBottomColor: theme.line, borderBottomWidth: 1 },
                      isYou && { backgroundColor: theme.okS },
                    ]}
                  >
                    <Text style={[styles.rank, { color: theme.text2 }]}>{labels[i]}</Text>
                    <View style={[styles.avatar, { backgroundColor: theme.panel2 }]}>
                      <Text style={[styles.avatarText, { color: theme.text }]}>{initials(e.name)}</Text>
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{isYou ? `${e.name} (you)` : e.name}</Text>
                      <Text style={[styles.meta, { color: theme.text3 }]}>
                        {e.count > 0 ? `${e.avg.toFixed(1)}★ avg · ${e.fiveStars} five-star` : 'No reviews yet'}
                      </Text>
                    </View>
                    <Text style={[styles.points, { color: theme.text }]}>{e.count}</Text>
                  </View>
                );
              })}
            </Panel>
            <Text style={[styles.footnote, { color: theme.text3 }]}>"=2" means a tie on reviews; the tied technicians share the rank.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), gap: 18 },
  segment: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 16 },
  segItem: { flex: 1, height: 40, lineHeight: 38, textAlign: 'center', fontSize: 13, borderRadius: radius.sm, borderWidth: 1, overflow: 'hidden' },
  error: { ...typography.caption },
  emptyBox: { alignItems: 'center', paddingVertical: spacing(9), gap: spacing(1) },
  emptyIconChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  emptyTitle: { ...typography.rowTitle, marginBottom: spacing(0.5) },
  emptyBody: { ...typography.caption, textAlign: 'center' },
  hero: { borderRadius: radius.xl },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroRank: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 36, lineHeight: 44 },
  heroText: { flex: 1 },
  heroTitle: { ...typography.rowTitle },
  heroSub: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  list: { padding: 0, overflow: 'hidden', borderRadius: radius.xl - 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rank: { width: 32, fontFamily: 'JetBrainsMono_700Bold', fontSize: 15 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  rowText: { flex: 1, minWidth: 0 },
  name: { ...typography.rowTitle, fontSize: 14, lineHeight: 19 },
  meta: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  points: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
  footnote: { ...typography.supporting, fontSize: 12, lineHeight: 18 },
});
