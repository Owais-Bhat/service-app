import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import Icon from '../components/Icon';
import ToolHeader from '../components/ToolHeader';
import StatusBadge from '../components/admin/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { fetchEmployeeDevices, EmployeeDevice } from '../api/deviceTracking';

interface Props {
  onBack: () => void;
  onOpenDevice: (inquiryId: string) => void;
}

// Filters to inquiries actually relevant to device tracking (design spec
// §2) — the underlying endpoint returns every inquiry assigned to this
// employee, not just device-related ones.
export default function DeviceFollowUpScreen({ onBack, onOpenDevice }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [devices, setDevices] = useState<EmployeeDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await fetchEmployeeDevices(user.id);
      setDevices(rows.filter((d) => d.device_status === 'taken'));
      setError(null);
    } catch {
      setError('Could not load devices — pull to retry');
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

  const statusOf = (status: string | null): { label: string; color: string } => {
    if (status === 'taken') return { label: 'Taken', color: theme.warn };
    if (status === 'returned') return { label: 'Returned', color: theme.ok };
    return { label: 'Pending', color: theme.grey };
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader
        title="Device Follow-up"
        subtitle={`${devices.length} ${devices.length === 1 ? 'device' : 'devices'} in your custody`}
        onBack={onBack}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.ok} />}
      >
        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

        {devices.length === 0 ? (
          <Text style={[styles.empty, { color: theme.text3 }]}>No devices under service right now.</Text>
        ) : (
          devices.map((d) => {
            const s = statusOf(d.device_status);
            return (
              <Pressable key={d.id} onPress={() => onOpenDevice(d.id)} style={({ pressed }) => [pressed && styles.pressed]}>
                <Panel style={styles.deviceRow}>
                  <View style={[styles.tile, { backgroundColor: theme.tealS }]}>
                    <Icon name="device" size={22} color={theme.teal} />
                  </View>
                  <View style={styles.deviceInfo}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.deviceService, { color: theme.text }]} numberOfLines={1}>{d.service_item}</Text>
                      <StatusBadge label={s.label} color={s.color} />
                    </View>
                    <Text style={[styles.customer, { color: theme.text2 }]} numberOfLines={1}>
                      {d.full_name} · <Text style={styles.ticket}>{d.ticket_no}</Text>
                    </Text>
                  </View>
                </Panel>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), gap: spacing(3) },
  error: { ...typography.caption },
  empty: { ...typography.supporting },
  pressed: { opacity: 0.7 },
  deviceRow: { flexDirection: 'row', gap: spacing(3), borderRadius: radius.xl - 4, padding: spacing(3.5) },
  tile: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2) },
  deviceService: { ...typography.rowTitle, flex: 1 },
  customer: { ...typography.supporting },
  ticket: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
});
