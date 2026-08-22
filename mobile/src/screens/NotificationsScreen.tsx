import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassSurface from '../components/GlassSurface';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchNotifications, markNotificationRead, NotificationItem } from '../api/notifications';

interface Props {
  onBack: () => void;
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
  const dataEntries =
    item.data && typeof item.data === 'object' && !Array.isArray(item.data)
      ? Object.entries(item.data as Record<string, unknown>)
      : [];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.detailCard} borderRadius={radius.lg}>
          <View style={styles.detailIconWrap}>
            <Icon name="notification" size={22} color={brand.primary} />
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {items.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>No notifications yet.</Text>
        ) : (
          items.map((item) => (
            <Pressable key={item.id} onPress={() => handlePress(item)} style={({ pressed }) => [pressed && styles.pressed]}>
              <Panel style={!item.read_at ? { ...styles.row, borderColor: brand.primary } : styles.row}>
                <View style={styles.rowHeader}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                  {!item.read_at ? <View style={styles.dot} /> : null}
                  <Icon name="chevron-right" size={16} color={theme.text3} />
                </View>
                {item.body ? <Text style={[styles.body, { color: theme.text2 }]} numberOfLines={2}>{item.body}</Text> : null}
                <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(1) }]}>
                  {new Date(item.created_at).toLocaleString('en-IN')}
                </Text>
              </Panel>
            </Pressable>
          ))
        )}
      </ScrollView>

      {detailItem && <NotificationDetail item={detailItem} onDismiss={() => setDetailItem(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginBottom: spacing(4) },
  body: { ...typography.body, marginTop: spacing(0.5) },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  pressed: { opacity: 0.7 },
  row: { marginBottom: spacing(2.5) },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  name: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brand.primary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(6) },
  detailCard: { width: '100%', maxWidth: 400, padding: spacing(5) },
  detailIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(21,160,90,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  detailTitle: { ...typography.heading, fontSize: 17, marginBottom: spacing(1.5) },
  detailBody: { ...typography.body, marginBottom: spacing(2) },
  detailDataBlock: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(4) },
  detailDataRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(3), paddingVertical: spacing(1.5) },
  detailDataKey: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  detailDataValue: { fontFamily: 'Manrope_700Bold', fontSize: 12, flexShrink: 1, textAlign: 'right' },
  dismissBtn: { paddingVertical: spacing(3.5), borderRadius: radius.md, alignItems: 'center' },
  dismissBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#ffffff' },
});
