import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import BackLink from '../components/BackLink';
import PressScale from '../components/PressScale';
import Icon from '../components/Icon';
import ProgressRing from '../components/ProgressRing';
import VideoPlayerModal from '../components/VideoPlayerModal';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { resolveUploadUrl } from '../api/client';
import { radius, spacing, typography } from '../theme';
import { springs } from '../theme/motion';
import { brand, semantic } from '../theme/tokens';
import {
  fetchTrainingItems,
  fetchWatchProgress,
  fetchMyCompletions,
  markTutorialComplete,
  TrainingItem,
  WatchProgress,
} from '../api/training';

interface Props {
  onBack: () => void;
}

type Filter = 'all' | 'pending' | 'completed';

// Watch-progress bar for a video card — springs to its real width instead
// of appearing pre-filled, same language as Attendance's HoursBar.
function WatchBar({ percent }: { percent: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(150, withSpring(percent, springs.move));
  }, [percent, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={styles.watchTrack}>
      <Animated.View style={[styles.watchFill, style]} />
    </View>
  );
}

export default function TutorialsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [progress, setProgress] = useState<Record<string, WatchProgress>>({});
  const [completions, setCompletions] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [marking, setMarking] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingItem, setPlayingItem] = useState<TrainingItem | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [rows, watch, comps] = await Promise.all([
        fetchTrainingItems(),
        fetchWatchProgress(),
        fetchMyCompletions(user.id),
      ]);
      setItems(rows);
      setProgress(Object.fromEntries(watch.map((w) => [w.item_id, w])));
      setCompletions(new Set(comps.map((c) => c.item_id)));
      setError(null);
    } catch {
      setError('Could not load tutorials — pull to retry');
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleMarkComplete = async (itemId: string) => {
    if (!user) return;
    setMarking(itemId);
    try {
      await markTutorialComplete(itemId, user.id);
      await load();
    } catch {
      setError('Could not mark this complete — try again');
    } finally {
      setMarking(null);
    }
  };

  const total = items.length;
  const completedCount = items.filter((i) => completions.has(i.id)).length;
  const pct = total ? Math.round((completedCount / total) * 100) : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const done = completions.has(item.id);
      if (filter === 'pending' && done) return false;
      if (filter === 'completed' && !done) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
    });
  }, [items, completions, filter, search]);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(12) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Tutorials</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>Complete your image & video training</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {total > 0 ? (
          <Animated.View entering={FadeInUp.duration(450).springify().damping(15)}>
            <GlassCard shadow style={styles.progressCard}>
              <ProgressRing percent={pct} color="#ffffff" trackColor="rgba(255,255,255,0.28)" labelColor="#ffffff" />
              <View style={styles.progressMeta}>
                <Text style={styles.progressTitle}>Your training progress</Text>
                <View style={styles.progressChips}>
                  <View style={[styles.progressChip, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                    <Icon name="check-circle" size={11} color="#fff" />
                    <Text style={styles.progressChipText}>{completedCount} completed</Text>
                  </View>
                  <View style={[styles.progressChip, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                    <Text style={styles.progressChipText}>{total - completedCount} pending</Text>
                  </View>
                </View>
              </View>
            </GlassCard>
          </Animated.View>
        ) : null}

        <View style={styles.filterRow}>
          {(['all', 'pending', 'completed'] as Filter[]).map((f) => {
            const active = filter === f;
            const count = f === 'all' ? total : f === 'pending' ? total - completedCount : completedCount;
            return (
              <PressScale key={f} onPress={() => setFilter(f)}>
                <View style={[styles.filterPill, active && styles.filterPillActiveShadow, { backgroundColor: active ? brand.primary : theme.panel2, borderColor: active ? brand.primary : theme.line }]}>
                  <Text style={[styles.filterPillText, { color: active ? '#fff' : theme.text2 }]}>{f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Completed'}</Text>
                  <View style={[styles.filterCountBubble, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.panel2 }]}>
                    <Text style={[styles.filterCountText, { color: active ? '#fff' : theme.text3 }]}>{count}</Text>
                  </View>
                </View>
              </PressScale>
            );
          })}
        </View>

        {total > 0 ? (
          <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
            <Icon name="search" size={16} color={theme.text3} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search tutorials…"
              placeholderTextColor={theme.text3}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        ) : null}

        {total === 0 ? (
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIconChip, { backgroundColor: `${brand.primary}1f` }]}>
              <Icon name="tutorial" size={22} color={brand.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No tutorials assigned yet</Text>
            <Text style={[styles.caption, { color: theme.text3, textAlign: 'center' }]}>Your trainer hasn't added any tutorials. Check back soon.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, textAlign: 'center', marginTop: spacing(6) }]}>No tutorials match this filter.</Text>
        ) : (
          filtered.map((item, idx) => {
            const done = completions.has(item.id);
            const isVideo = item.kind === 'video';
            const watchPct = isVideo ? progress[item.id]?.percent || 0 : 0;
            const mediaUrl = resolveUploadUrl(item.url);
            const openMedia = () => (isVideo ? setPlayingItem(item) : Linking.openURL(mediaUrl));
            return (
              <Animated.View key={item.id} entering={FadeInUp.delay(Math.min(idx, 8) * 60).duration(400).springify().damping(15)}>
                <View style={[styles.cardOuter, { shadowColor: done ? brand.primary : theme.text3 }]}>
                  <GlassCard shadow style={styles.card}>
                    <PressScale onPress={openMedia}>
                      <View style={styles.thumbWrap}>
                        {isVideo ? (
                          <View style={[styles.thumbVideo, { backgroundColor: `${brand.primary}22` }]}>
                            <View style={styles.playChip}>
                              <Icon name="tutorial" size={22} color="#fff" filled />
                            </View>
                          </View>
                        ) : (
                          <Image source={{ uri: mediaUrl }} style={styles.thumbImg} resizeMode="cover" />
                        )}
                        <View style={[styles.typeBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                          <Icon name={isVideo ? 'tutorial' : 'box'} size={11} color="#fff" />
                          <Text style={styles.typeBadgeText}>{isVideo ? 'Video' : 'Image'}</Text>
                        </View>
                        {done ? (
                          <View style={[styles.doneTick, { backgroundColor: brand.primary }]}>
                            <Icon name="check" size={13} color="#fff" />
                          </View>
                        ) : null}
                      </View>
                    </PressScale>

                    {isVideo && watchPct > 0 ? <WatchBar percent={watchPct} /> : null}

                    <View style={styles.cardBody}>
                      <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                      {item.description ? (
                        <Text style={[styles.caption, { color: theme.text3 }]} numberOfLines={2}>{item.description}</Text>
                      ) : null}

                      <View style={styles.actionRow}>
                        <PressScale onPress={openMedia} style={{ flex: 1 }}>
                          <View style={[styles.watchBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                            <Icon name="tutorial" size={14} color={theme.text} />
                            <Text style={[styles.watchBtnText, { color: theme.text }]}>{isVideo ? 'Watch' : 'View'}</Text>
                          </View>
                        </PressScale>
                        <PressScale onPress={() => !done && handleMarkComplete(item.id)} disabled={done || marking === item.id} style={{ flex: 1 }}>
                          <View style={[styles.markBtn, { backgroundColor: done ? theme.panel2 : brand.primary, opacity: marking === item.id ? 0.7 : 1 }]}>
                            <Icon name="check" size={14} color={done ? theme.text3 : '#fff'} />
                            <Text style={[styles.markBtnText, { color: done ? theme.text3 : '#fff' }]}>
                              {marking === item.id ? 'Saving…' : done ? 'Completed' : 'Mark Complete'}
                            </Text>
                          </View>
                        </PressScale>
                      </View>
                    </View>
                  </GlassCard>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {playingItem && (
        <VideoPlayerModal
          itemId={playingItem.id}
          title={playingItem.title}
          mediaUrl={resolveUploadUrl(playingItem.url)}
          onProgress={(pct) => {
            setProgress((prev) => ({
              ...prev,
              [playingItem.id]: { item_id: playingItem.id, percent: pct, seconds_watched: 0, duration_seconds: 0 },
            }));
          }}
          onDismiss={() => {
            setPlayingItem(null);
            load();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginTop: spacing(1) },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: semantic.danger, marginBottom: spacing(3) },
  progressCard: { flexDirection: 'row', alignItems: 'center', gap: spacing(4), backgroundColor: brand.primary, marginBottom: spacing(4) },
  progressMeta: { flex: 1, minWidth: 0 },
  progressTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff', marginBottom: spacing(2) },
  progressChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) },
  progressChip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.full },
  progressChipText: { fontFamily: 'Manrope_700Bold', fontSize: 10.5, color: '#fff' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3), paddingVertical: spacing(1.75), borderRadius: radius.full, borderWidth: 1 },
  filterPillText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  filterCountBubble: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterCountText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  filterPillActiveShadow: { shadowColor: brand.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 44, marginBottom: spacing(4) },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  emptyBox: { alignItems: 'center', paddingVertical: spacing(9), gap: spacing(1) },
  emptyIconChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  emptyTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, marginBottom: spacing(0.5) },
  cardOuter: { marginBottom: spacing(3.5), shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 3 },
  card: { padding: 0, overflow: 'hidden' },
  thumbWrap: { height: 140, width: '100%' },
  thumbVideo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  playChip: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  typeBadge: { position: 'absolute', top: spacing(2.5), left: spacing(2.5), flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(2), paddingVertical: spacing(0.75), borderRadius: radius.full },
  typeBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: '#fff' },
  doneTick: { position: 'absolute', top: spacing(2.5), right: spacing(2.5), width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  watchTrack: { height: 3, backgroundColor: 'rgba(21,160,90,0.18)' },
  watchFill: { height: 3, backgroundColor: brand.primary },
  cardBody: { padding: spacing(4) },
  cardTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, marginBottom: spacing(1) },
  actionRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) },
  watchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 40, borderRadius: radius.sm, borderWidth: 1 },
  watchBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  markBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 40, borderRadius: radius.sm },
  markBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
});
