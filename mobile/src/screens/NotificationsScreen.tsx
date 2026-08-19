import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchNotifications, markNotificationRead, NotificationItem } from '../api/notifications';

interface Props {
  onBack: () => void;
}

export default function NotificationsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Text style={styles.link} onPress={onBack}>← Back</Text>
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
                </View>
                {item.body ? <Text style={[styles.body, { color: theme.text2 }]}>{item.body}</Text> : null}
                <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(1) }]}>
                  {new Date(item.created_at).toLocaleString('en-IN')}
                </Text>
              </Panel>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginBottom: spacing(4) },
  body: { ...typography.body, marginTop: spacing(0.5) },
  caption: { ...typography.caption },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  pressed: { opacity: 0.7 },
  row: { marginBottom: spacing(2.5) },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  name: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brand.primary },
});
