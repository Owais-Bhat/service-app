import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchEmployeeDevices, EmployeeDevice } from '../api/deviceTracking';

interface Props {
  onBack: () => void;
  onOpenDevice: (inquiryId: string) => void;
}

const DEVICE_STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  taken: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)', label: 'Taken' },
  returned: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)', label: 'Returned' },
};
const PENDING_STATUS_STYLE = { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'Pending' };

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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Device Follow-up</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>Devices under service</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {devices.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No devices under service right now.</Text>
        ) : (
          devices.map((d) => {
            const s = (d.device_status && DEVICE_STATUS_STYLE[d.device_status]) || PENDING_STATUS_STYLE;
            return (
              <Pressable key={d.id} onPress={() => onOpenDevice(d.id)} style={({ pressed }) => [pressed && styles.pressed]}>
                <Panel style={styles.deviceRow}>
                  <View style={styles.deviceInfo}>
                    <Text style={[styles.deviceService, { color: theme.text }]} numberOfLines={1}>{d.service_item}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>{d.full_name} · {d.ticket_no}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
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
  title: { ...typography.title },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  pressed: { opacity: 0.7 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  deviceInfo: { flex: 1, minWidth: 0 },
  deviceService: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  statusBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8 },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
});
