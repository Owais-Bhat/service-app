import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';
import { brand, semantic } from '../theme/tokens';
import { fetchLeaderboard, LeaderboardEntry } from '../api/leaderboard';

interface Props {
  onBack: () => void;
}

const MEDAL = ['🥇', '🥈', '🥉'];
const PODIUM_HEIGHT = [92, 66, 48]; // rank 0 (1st) tallest
const PODIUM_ORDER = [1, 0, 2]; // display 2nd | 1st | 3rd, matching web

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

// Podium bar that springs to its rank-height instead of appearing flat —
// same "arrives with motion" language as HoursBar/ProgressRing elsewhere.
function PodiumBar({ height, color, delayMs }: { height: number; color: string; delayMs: number }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(delayMs, withSpring(height, springs.move));
  }, [height, delayMs, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[styles.podiumBar, { backgroundColor: color }, style]} />;
}

function RankCard({
  title,
  color,
  name,
  rank,
  reviews,
  avg,
  fiveStars,
  delayMs,
}: {
  title: string;
  color: string;
  name: string;
  rank: number;
  reviews: number;
  avg: number;
  fiveStars: number;
  delayMs: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delayMs).duration(450).springify().damping(15)}>
      <View style={[styles.rankCard, { backgroundColor: color, shadowColor: color }]}>
        <View style={styles.rankCardTop}>
          <View style={styles.rankAvatar}>
            <Text style={styles.rankAvatarText}>{initials(name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rankName} numberOfLines={1}>{name}</Text>
            <Text style={styles.rankSubtitle}>{title}</Text>
          </View>
        </View>
        <View style={styles.rankStatsRow}>
          <View style={styles.rankStat}>
            <Text style={styles.rankStatVal}>{rank > 0 ? `#${rank}` : '—'}</Text>
            <Text style={styles.rankStatLabel}>Rank</Text>
          </View>
          <View style={styles.rankStatDiv} />
          <View style={styles.rankStat}>
            <Text style={styles.rankStatVal}>{reviews}</Text>
            <Text style={styles.rankStatLabel}>Reviews</Text>
          </View>
          <View style={styles.rankStatDiv} />
          <View style={styles.rankStat}>
            <Text style={styles.rankStatVal}>{reviews > 0 ? avg.toFixed(1) : '—'}</Text>
            <Text style={styles.rankStatLabel}>Avg Rating</Text>
          </View>
          <View style={styles.rankStatDiv} />
          <View style={styles.rankStat}>
            <Text style={styles.rankStatVal}>{fiveStars}</Text>
            <Text style={styles.rankStatLabel}>5-Stars</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export default function LeaderboardScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [monthly, setMonthly] = useState<LeaderboardEntry[]>([]);
  const [allTime, setAllTime] = useState<LeaderboardEntry[]>([]);
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

  const myMonthly = monthly.find((e) => e.id === user?.id);
  const myAllTime = allTime.find((e) => e.id === user?.id);
  const myMonthlyRank = monthly.findIndex((e) => e.id === user?.id) + 1;
  const myAllTimeRank = allTime.findIndex((e) => e.id === user?.id) + 1;

  const podiumSlots = PODIUM_ORDER.map((i) => monthly[i] || null);
  const hasAnyReviews = monthly.some((e) => e.count > 0);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(12) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Leaderboard</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>Ranked by most reviews received this month</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && !hasAnyReviews ? (
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIconChip, { backgroundColor: `${brand.primary}1f` }]}>
              <Icon name="leaderboard" size={22} color={brand.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No verified reviews yet</Text>
            <Text style={[styles.caption, { color: theme.text3, textAlign: 'center' }]}>Complete jobs and collect customer feedback to climb the board.</Text>
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInUp.duration(450).springify().damping(15)}>
              <GlassCard shadow style={styles.podiumCard}>
                <View style={styles.podiumHeader}>
                  <Icon name="leaderboard" size={14} color={brand.primary} />
                  <Text style={[styles.podiumHeaderText, { color: theme.text }]}>Top 3 — Most Reviews</Text>
                </View>
                <View style={styles.podiumRow}>
                  {podiumSlots.map((e, slot) => {
                    const rank = PODIUM_ORDER[slot];
                    const isYou = e?.id === user?.id;
                    const color = rank === 0 ? '#e08a14' : rank === 1 ? '#9aa5b1' : '#c47a3f';
                    return (
                      <View key={slot} style={styles.podiumCol}>
                        <Text style={styles.podiumMedal}>{MEDAL[rank]}</Text>
                        <View style={[styles.podiumAvatar, { borderColor: isYou ? brand.primary : theme.line, backgroundColor: e ? `${color}22` : theme.panel2 }]}>
                          <Text style={[styles.podiumAvatarText, { color: e ? color : theme.text3 }]}>{e ? initials(e.name) : '?'}</Text>
                        </View>
                        <Text style={[styles.podiumName, { color: e ? theme.text : theme.text3 }]} numberOfLines={1}>
                          {e ? (isYou ? 'You' : e.name) : 'Available'}
                        </Text>
                        <Text style={[styles.podiumMeta, { color: theme.text3 }]}>
                          {e ? `${e.count} review${e.count === 1 ? '' : 's'}` : 'No one yet'}
                        </Text>
                        {e && e.count > 0 ? (
                          <View style={styles.podiumStarsRow}>
                            <Icon name="star" size={10} color={color} filled />
                            <Text style={[styles.podiumMeta, { color: theme.text2 }]}>{e.avg.toFixed(1)}</Text>
                          </View>
                        ) : null}
                        <View style={styles.podiumBarTrack}>
                          <PodiumBar height={e ? PODIUM_HEIGHT[rank] : PODIUM_HEIGHT[rank] * 0.3} color={e ? color : theme.line} delayMs={rank * 90} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </GlassCard>
            </Animated.View>

            <View style={{ marginTop: spacing(4) }}>
              <RankCard
                title="Your position this month"
                color={brand.primary}
                name={myMonthly?.name || user?.full_name || 'You'}
                rank={myMonthlyRank}
                reviews={myMonthly?.count ?? 0}
                avg={myMonthly?.avg ?? 0}
                fiveStars={myMonthly?.fiveStars ?? 0}
                delayMs={80}
              />
            </View>

            <View style={{ marginTop: spacing(3) }}>
              <RankCard
                title="Your all-time position"
                color="#7c5cfc"
                name={myAllTime?.name || user?.full_name || 'You'}
                rank={myAllTimeRank}
                reviews={myAllTime?.count ?? 0}
                avg={myAllTime?.avg ?? 0}
                fiveStars={myAllTime?.fiveStars ?? 0}
                delayMs={140}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginTop: spacing(1) },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: semantic.danger, marginBottom: spacing(3) },
  emptyBox: { alignItems: 'center', paddingVertical: spacing(9), gap: spacing(1) },
  emptyIconChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  emptyTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, marginBottom: spacing(0.5) },

  podiumCard: { alignItems: 'stretch' },
  podiumHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginBottom: spacing(3) },
  podiumHeaderText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13 },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2) },
  podiumCol: { flex: 1, alignItems: 'center', gap: spacing(0.75) },
  podiumMedal: { fontSize: 22, marginBottom: spacing(0.5) },
  podiumAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(0.5) },
  podiumAvatarText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15 },
  podiumName: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, maxWidth: '100%' },
  podiumMeta: { fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  podiumStarsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(0.75) },
  podiumBarTrack: { width: '100%', height: 92, justifyContent: 'flex-end', marginTop: spacing(1.5) },
  podiumBar: { width: '100%', borderRadius: 8 },

  rankCard: {
    borderRadius: 20,
    padding: spacing(4),
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 20,
    elevation: 6,
  },
  rankCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(3.5) },
  rankAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  rankAvatarText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  rankName: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, color: '#fff' },
  rankSubtitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: spacing(0.5) },
  rankStatsRow: { flexDirection: 'row', alignItems: 'center' },
  rankStat: { flex: 1, alignItems: 'center' },
  rankStatVal: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#fff' },
  rankStatLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 9.5, color: 'rgba(255,255,255,0.75)', marginTop: spacing(0.5) },
  rankStatDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.25)' },
});
