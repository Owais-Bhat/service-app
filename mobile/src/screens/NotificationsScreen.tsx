import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassSurface from '../components/GlassSurface';
import Panel from '../components/Panel';
import ToolHeader from '../components/ToolHeader';
import FilterChips from '../components/admin/FilterChips';
import SectionLabel from '../components/admin/SectionLabel';
import Icon from '../components/Icon';
import { IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import type { ThemeTokens } from '../theme/tokens';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  NotificationItem,
} from '../api/notifications';
import { syncAppBadge } from '../notifications';

interface Props {
  onBack: () => void;
}

type FilterKey = 'all' | 'unread' | 'payments';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'payments', label: 'Payments' },
];

// Subject -> icon/colour/label, drawn from the active theme so the tile's
// soft fill (`bg`) and glyph colour stay readable in both modes.
function subjectStyle(subject: string | null, t: ThemeTokens): { icon: IconName; color: string; bg: string; label: string } {
  const s = (subject || '').toLowerCase();
  if (s.includes('payment') || s.includes('cash') || s.includes('bill')) return { icon: 'wallet', color: t.ok, bg: t.okS, label: 'Payment' };
  if (s.includes('complaint')) return { icon: 'shield', color: t.err, bg: t.errS, label: 'Complaint' };
  if (s.includes('device')) return { icon: 'device', color: t.info, bg: t.infoS, label: 'Device' };
  if (s.includes('leave')) return { icon: 'clock', color: t.warn, bg: t.warnS, label: 'Leave' };
  if (s.includes('leaderboard') || s.includes('rank') || s.includes('award')) return { icon: 'leaderboard', color: t.vio, bg: t.vioS, label: 'Award' };
  if (s.includes('training') || s.includes('tutorial')) return { icon: 'training', color: t.teal, bg: t.tealS, label: 'Training' };
  if (s.includes('eod')) return { icon: 'report', color: t.warn, bg: t.warnS, label: 'EOD' };
  if (s.includes('pool') || s.includes('claim')) return { icon: 'star', color: t.vio, bg: t.vioS, label: 'Public Job' };
  if (s.includes('assign') || s.includes('task') || s.includes('service_request') || s.includes('installation')) {
    return { icon: 'tasks', color: t.vio, bg: t.vioS, label: 'Task' };
  }
  return { icon: 'notification', color: t.accent, bg: t.okS, label: 'Update' };
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
  const style = subjectStyle(item.subject, theme);
  const dataEntries =
    item.data && typeof item.data === 'object' && !Array.isArray(item.data)
      ? Object.entries(item.data as Record<string, unknown>)
      : [];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.detailCard} borderRadius={radius.lg}>
          <View style={[styles.detailIconWrap, { backgroundColor: style.bg }]}>
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
            style={({ pressed }) => [styles.dismissBtn, { backgroundColor: brand.fill }, pressed && styles.pressed]}
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
  // Keeps the phone's home-screen app icon badge in sync as items load and
  // as the user reads them (handlePress/handleMarkAllRead above update
  // `items` optimistically, which flows straight through to this count).
  useEffect(() => {
    syncAppBadge(unreadCount);
  }, [unreadCount]);
  const paymentsCount = items.filter((n) => (n.subject || '').toLowerCase().includes('payment')).length;
  const filterCounts: Record<FilterKey, number> = { all: items.length, unread: unreadCount, payments: paymentsCount };
  const filteredItems = items.filter((n) => {
    if (filter === 'unread') return !n.read_at;
    if (filter === 'payments') return (n.subject || '').toLowerCase().includes('payment');
    return true;
  });

  const unreadItems = filteredItems.filter((n) => !n.read_at);
  const readItems = filteredItems.filter((n) => !!n.read_at);

  const renderRow = (item: NotificationItem, unread: boolean, last: boolean) => {
    const style = subjectStyle(item.subject, theme);
    return (
      <Pressable
        key={item.id}
        onPress={() => handlePress(item)}
        style={({ pressed }) => [styles.row, !last && { borderBottomColor: theme.line, borderBottomWidth: 1 }, pressed && styles.pressed]}
      >
        <View style={[styles.tile, { backgroundColor: unread ? style.bg : theme.panel2 }]}>
          <Icon name={style.icon} size={20} color={unread ? style.color : theme.text2} />
        </View>
        <View style={styles.rowText}>
          <Text style={[unread ? styles.rowTitleUnread : styles.rowTitleRead, { color: unread ? theme.text : theme.text2 }]} numberOfLines={2}>
            {item.title}
          </Text>
          {item.body ? <Text style={[styles.rowBody, { color: theme.text3 }]} numberOfLines={2}>{item.body}</Text> : null}
          <Text style={[styles.rowWhen, { color: theme.text3 }]}>{new Date(item.created_at).toLocaleString('en-IN')}</Text>
        </View>
        {unread ? <View accessibilityLabel="Unread" style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader
        title="Notifications"
        subtitle={`${unreadCount} unread`}
        onBack={onBack}
        actions={
          unreadCount > 0 && !markingAll
            ? [{ icon: 'check-done', label: 'Mark all read', text: 'Read all', color: theme.accent, onPress: handleMarkAllRead }]
            : undefined
        }
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.ok} />}
      >
        <FilterChips
          items={FILTERS.map((f) => ({ key: f.key, label: f.label, count: filterCounts[f.key] }))}
          activeKey={filter}
          onSelect={(k) => setFilter(k as FilterKey)}
        />

        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

        {filteredItems.length === 0 ? (
          <Text style={[styles.empty, { color: theme.text3 }]}>
            {filter === 'all' ? 'No notifications yet.' : `No ${filter} notifications.`}
          </Text>
        ) : (
          <>
            {unreadItems.length > 0 ? (
              <View>
                <SectionLabel>New</SectionLabel>
                <Panel style={styles.list}>{unreadItems.map((n, i) => renderRow(n, true, i === unreadItems.length - 1))}</Panel>
              </View>
            ) : null}
            {readItems.length > 0 ? (
              <View>
                <SectionLabel>Earlier</SectionLabel>
                <Panel style={styles.list}>{readItems.map((n, i) => renderRow(n, false, i === readItems.length - 1))}</Panel>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {detailItem && <NotificationDetail item={detailItem} onDismiss={() => setDetailItem(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), gap: spacing(3) },
  empty: { ...typography.supporting, marginTop: spacing(3) },
  error: { ...typography.caption },
  pressed: { opacity: 0.7 },
  list: { padding: 0, overflow: 'hidden', borderRadius: radius.xl - 4 },
  row: { flexDirection: 'row', gap: 12, padding: 14 },
  tile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitleUnread: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 19 },
  rowTitleRead: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, lineHeight: 19 },
  rowBody: { ...typography.supporting, fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowWhen: { fontFamily: 'Manrope_500Medium', fontSize: 12, marginTop: 2 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  caption: { ...typography.caption },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(6) },
  detailCard: { width: '100%', maxWidth: 400, padding: spacing(5) },
  detailIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  detailTitle: { ...typography.heading, fontSize: 17, marginBottom: spacing(1.5) },
  detailBody: { ...typography.body, marginBottom: spacing(2) },
  detailDataBlock: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(4) },
  detailDataRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(3), paddingVertical: spacing(1.5) },
  detailDataKey: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  detailDataValue: { fontFamily: 'Manrope_700Bold', fontSize: 12, flexShrink: 1, textAlign: 'right' },
  dismissBtn: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dismissBtnText: { ...typography.button, color: '#ffffff' },
});
