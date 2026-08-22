import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassSurface from '../components/GlassSurface';
import GlassCard from '../components/GlassCard';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import { IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  NotificationItem,
} from '../api/notifications';

interface Props {
  onBack: () => void;
}

type FilterKey = 'all' | 'unread' | 'payments';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'payments', label: 'Payments' },
];

// Subject -> icon/color/label — the label+dot pairing is the same pattern
// as the dashboard's Notice Board (priority dot + tag), reused here for
// visual consistency across the two lists instead of a different layout.
function subjectStyle(subject: string | null): { icon: IconName; color: string; label: string } {
  const s = (subject || '').toLowerCase();
  if (s.includes('payment') || s.includes('cash') || s.includes('bill')) return { icon: 'wallet', color: semantic.success, label: 'Payment' };
  if (s.includes('complaint')) return { icon: 'shield', color: semantic.danger, label: 'Complaint' };
  if (s.includes('device')) return { icon: 'device', color: semantic.info, label: 'Device' };
  if (s.includes('leave')) return { icon: 'clock', color: semantic.warning, label: 'Leave' };
  if (s.includes('leaderboard') || s.includes('rank') || s.includes('award')) return { icon: 'leaderboard', color: '#7c5cfc', label: 'Award' };
  if (s.includes('training') || s.includes('tutorial')) return { icon: 'training', color: '#0ea5a5', label: 'Training' };
  if (s.includes('eod')) return { icon: 'report', color: semantic.warning, label: 'EOD' };
  if (s.includes('pool') || s.includes('claim')) return { icon: 'star', color: '#7c5cfc', label: 'Public Job' };
  if (s.includes('assign') || s.includes('task') || s.includes('service_request') || s.includes('installation')) {
    return { icon: 'tasks', color: brand.primary, label: 'Task' };
  }
  return { icon: 'notification', color: brand.primary, label: 'Update' };
}

// Turns snake_case/camelCase data keys into readable labels, and ₹-formats
// anything that looks like a rupee amount — same intent as web's
// notify-center.js detail overlay (pretty-printed key/value list).
function prettyLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && /amount|total|price|cost|fee/i.test(key)) {
    return `₹${value.toLocaleString('en-IN')}`;
  }
  return String(value);
}

function NotificationDetail({ item, onDismiss }: { item: NotificationItem; onDismiss: () => void }) {
  const { theme } = useTheme();
  const style = subjectStyle(item.subject);
  const dataEntries =
    item.data && typeof item.data === 'object' && !Array.isArray(item.data)
      ? Object.entries(item.data as Record<string, unknown>)
      : [];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.detailCard} borderRadius={radius.lg}>
          <View style={[styles.detailIconWrap, { backgroundColor: `${style.color}24` }]}>
            <Icon name={style.icon} size={22} color={style.color} />
          </View>
          <Text style={[styles.detailTitle, { color: theme.text }]}>{item.title || 'Notification'}</Text>
          {item.body ? <Text style={[styles.detailBody, { color: theme.text2 }]}>{item.body}</Text> : null}
          <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>
            {new Date(item.created_at).toLocaleString('en-IN')}
          </Text>

          {dataEntries.length > 0 && (
            <View style={[styles.detailDataBlock, { borderColor: theme.line }]}>
              {dataEntries.map(([key, value]) => (
                <View key={key} style={styles.detailDataRow}>
                  <Text style={[styles.detailDataKey, { color: theme.text3 }]}>{prettyLabel(key)}</Text>
                  <Text style={[styles.detailDataValue, { color: theme.text }]} numberOfLines={1}>
                    {prettyValue(key, value)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [styles.dismissBtn, { backgroundColor: brand.primary }, pressed && styles.pressed]}
          >
            <Text style={styles.dismissBtnText}>Dismiss</Text>
          </Pressable>
        </GlassSurface>
      </View>
    </Modal>
  );
}

export default function NotificationsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchNotifications();
      setItems(res.items);
      setError(null);
    } catch {
      setError('Could not load notifications — pull to retry');
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

  const handlePress = async (item: NotificationItem) => {
    setDetailItem(item);
    if (item.read_at) return;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await markNotificationRead(item.id);
    } catch {
      // Non-critical — the next refresh will reconcile the real state.
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = items.filter((n) => !n.read_at).length;
  const paymentsCount = items.filter((n) => (n.subject || '').toLowerCase().includes('payment')).length;
  const filterCounts: Record<FilterKey, number> = { all: items.length, unread: unreadCount, payments: paymentsCount };
  const filteredItems = items.filter((n) => {
    if (filter === 'unread') return !n.read_at;
    if (filter === 'payments') return (n.subject || '').toLowerCase().includes('payment');
    return true;
  });

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <BackLink onPress={onBack} />
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
          {unreadCount > 0 && (
            <Pressable onPress={handleMarkAllRead} disabled={markingAll} hitSlop={8}>
              <Text style={[styles.markAllText, { color: brand.primary, opacity: markingAll ? 0.5 : 1 }]}>Mark all read</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.filterRow, { backgroundColor: theme.panel2 }]}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.filterPill, active && { backgroundColor: brand.primary }]}>
                <Text style={[styles.filterPillText, { color: active ? '#ffffff' : theme.text2 }]}>{f.label}</Text>
                {filterCounts[f.key] > 0 && (
                  <View style={[styles.filterBadge, { backgroundColor: active ? 'rgba(255,255,255,0.28)' : theme.surfaceStrong }]}>
                    <Text style={[styles.filterBadgeText, { color: active ? '#ffffff' : theme.text2 }]}>{filterCounts[f.key]}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {filteredItems.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>
            {filter === 'all' ? 'No notifications yet.' : `No ${filter} notifications.`}
          </Text>
        ) : (
          filteredItems.map((item, i) => {
            const style = subjectStyle(item.subject);
            return (
              <Animated.View key={`${filter}-${item.id}`} entering={FadeInUp.delay(i * 60).duration(400)}>
                <Pressable onPress={() => handlePress(item)} style={({ pressed }) => [pressed && styles.pressed]}>
                  <GlassCard style={styles.rowCard}>
                    <View style={styles.rowHeader}>
                      <View style={[styles.rowDot, { backgroundColor: style.color }]} />
                      <Text style={[styles.rowTag, { color: style.color }]}>{style.label}</Text>
                      {!item.read_at && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    {item.body ? <Text style={[styles.body, { color: theme.text2 }]} numberOfLines={2}>{item.body}</Text> : null}
                    <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(1) }]}>
                      {new Date(item.created_at).toLocaleString('en-IN')}
                    </Text>
                  </GlassCard>
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {detailItem && <NotificationDetail item={detailItem} onDismiss={() => setDetailItem(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(4) },
  title: { ...typography.title },
  markAllText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  filterRow: { flexDirection: 'row', borderRadius: radius.md, padding: spacing(1), marginBottom: spacing(4), gap: spacing(1) },
  filterPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), paddingVertical: spacing(2.5), borderRadius: radius.sm },
  filterPillText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  filterBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  body: { ...typography.body, fontSize: 13, marginTop: spacing(0.5) },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  pressed: { opacity: 0.7 },
  rowCard: { marginBottom: spacing(2.5) },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginBottom: spacing(1.5) },
  rowDot: { width: 6, height: 6, borderRadius: 3 },
  rowTag: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brand.primary },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(6) },
  detailCard: { width: '100%', maxWidth: 400, padding: spacing(5) },
  detailIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  detailTitle: { ...typography.heading, fontSize: 17, marginBottom: spacing(1.5) },
  detailBody: { ...typography.body, marginBottom: spacing(2) },
  detailDataBlock: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(4) },
  detailDataRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(3), paddingVertical: spacing(1.5) },
  detailDataKey: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  detailDataValue: { fontFamily: 'Manrope_700Bold', fontSize: 12, flexShrink: 1, textAlign: 'right' },
  dismissBtn: { paddingVertical: spacing(3.5), borderRadius: radius.md, alignItems: 'center' },
  dismissBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#ffffff' },
});
