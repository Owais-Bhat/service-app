import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import ToolHeader from '../components/ToolHeader';
import Icon from '../components/Icon';
import FilterChips from '../components/admin/FilterChips';
import SearchField from '../components/admin/SearchField';
import VideoPlayerModal from '../components/VideoPlayerModal';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { resolveUploadUrl } from '../api/client';
import { radius, spacing, typography } from '../theme';
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
      <ToolHeader
        title="Tutorials"
        subtitle={total > 0 ? `${total} item${total === 1 ? '' : 's'} · ${completedCount} completed` : 'Image & video training'}
        onBack={onBack}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.ok} />}
      >
        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

        <FilterChips
          items={[
            { key: 'all', label: 'All', count: total },
            { key: 'pending', label: 'Pending', count: total - completedCount },
            { key: 'completed', label: 'Completed', count: completedCount },
          ]}
          activeKey={filter}
          onSelect={(k) => setFilter(k as Filter)}
        />

        {total > 0 ? <SearchField value={search} onChangeText={setSearch} placeholder="Search tutorials…" /> : null}

        {total === 0 ? (
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIconChip, { backgroundColor: theme.okS }]}>
              <Icon name="tutorial" size={22} color={theme.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No tutorials assigned yet</Text>
            <Text style={[styles.emptyBody, { color: theme.text3 }]}>Your trainer hasn't added any tutorials. Check back soon.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <Text style={[styles.emptyBody, { color: theme.text3, marginTop: spacing(6) }]}>No tutorials match this filter.</Text>
        ) : (
          filtered.map((item) => {
            const done = completions.has(item.id);
            const isVideo = item.kind === 'video';
            const watchPct = isVideo ? progress[item.id]?.percent || 0 : 0;
            const mediaUrl = resolveUploadUrl(item.url);
            const openMedia = () => (isVideo ? setPlayingItem(item) : Linking.openURL(mediaUrl));
            const statusText = done ? 'Completed' : watchPct > 0 ? `Watched ${Math.round(watchPct)}%` : isVideo ? 'New' : 'Not viewed';
            const statusColor = done ? theme.ok : watchPct > 0 ? theme.accent : theme.info;
            return (
              <View key={item.id} style={styles.item}>
                <Pressable onPress={openMedia} accessibilityRole="button" accessibilityLabel={`${isVideo ? 'Watch' : 'View'} ${item.title}`}>
                  <View style={[styles.thumb, { backgroundColor: theme.panel2, borderColor: theme.border }]}>
                    {!isVideo ? <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                    {isVideo ? <Icon name="tutorial" size={30} color={theme.text2} /> : null}
                    <View style={styles.kindBadge}>
                      <Text style={styles.kindBadgeText}>{isVideo ? 'Video' : 'Image'}</Text>
                    </View>
                    {isVideo && watchPct > 0 ? <View style={[styles.watchFill, { width: `${Math.min(100, watchPct)}%`, backgroundColor: theme.accent }]} /> : null}
                  </View>
                </Pressable>
                <View style={styles.itemBody}>
                  <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                  {item.description ? <Text style={[styles.itemDesc, { color: theme.text3 }]} numberOfLines={1}>{item.description}</Text> : null}
                  <View style={styles.itemFoot}>
                    <Text style={[styles.itemStatus, { color: statusColor }]}>{marking === item.id ? 'Saving…' : statusText}</Text>
                    {!done ? (
                      <Pressable
                        onPress={() => handleMarkComplete(item.id)}
                        disabled={marking === item.id}
                        hitSlop={8}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.markBtn, { borderColor: theme.border }, pressed && styles.pressed]}
                      >
                        <Icon name="check" size={14} color={theme.accent} />
                        <Text style={[styles.markText, { color: theme.accent }]}>Mark complete</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
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
  content: { padding: spacing(4), gap: 18 },
  error: { ...typography.caption },
  emptyBox: { alignItems: 'center', paddingVertical: spacing(9), gap: spacing(1) },
  emptyIconChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  emptyTitle: { ...typography.rowTitle, marginBottom: spacing(0.5) },
  emptyBody: { ...typography.caption, textAlign: 'center' },
  item: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 120, height: 72, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  kindBadge: { position: 'absolute', right: 6, bottom: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  kindBadgeText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, color: '#fff' },
  watchFill: { position: 'absolute', left: 0, bottom: 0, height: 3 },
  itemBody: { flex: 1, minWidth: 0 },
  itemTitle: { ...typography.rowTitle, fontSize: 14, lineHeight: 18 },
  itemDesc: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  itemFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2), marginTop: 4 },
  itemStatus: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  markBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: spacing(2.5), borderRadius: radius.sm, borderWidth: 1 },
  markText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  pressed: { opacity: 0.7 },
});
