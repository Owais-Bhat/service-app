import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import PressScale from '../components/PressScale';
import TaskStatusModal from '../components/TaskStatusModal';
import PendingAssignments from '../components/PendingAssignments';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchMyTasks, TaskItem } from '../api/tasks';

interface Props {
  onBack: () => void;
}

type FilterKey = 'in_progress' | 'reopened' | 'resolved' | 'issue_not_resolved' | 'case_closed';

const FILTER_LABEL: Record<FilterKey, string> = {
  in_progress: 'In Progress',
  reopened: 'Reopened',
  resolved: 'Resolved',
  issue_not_resolved: 'Issue',
  case_closed: 'Closed',
};

function displayStatus(status: string): string {
  return status === 'closed' ? 'resolved' : status || 'open';
}

function groupOf(status: string): FilterKey {
  const s = displayStatus(status);
  if (s === 'in_progress') return 'in_progress';
  if (s === 'resolved' || s === 'foc') return 'resolved';
  if (s === 'issue_not_resolved') return 'issue_not_resolved';
  if (s === 'case_closed') return 'case_closed';
  return 'in_progress'; // open / assigned — bucketed with in-progress like web's "active"
}

function isLocked(status: string): boolean {
  return ['resolved', 'case_closed', 'foc'].includes(displayStatus(status));
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function ManageTasksScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [pending, setPending] = useState<TaskItem[]>([]);
  const [items, setItems] = useState<TaskItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('in_progress');
  const [search, setSearch] = useState('');
  const [statusItem, setStatusItem] = useState<TaskItem | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetchMyTasks(user.id);
      setPending(res.pending);
      setItems(res.items);
      setError(null);
    } catch {
      setError('Could not load your tasks — pull to retry');
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

  const reopenedCount = items.filter((i) => i.reopened).length;
  const filters: FilterKey[] = ['in_progress', ...(reopenedCount ? (['reopened'] as FilterKey[]) : []), 'resolved', 'issue_not_resolved', 'case_closed'];

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { in_progress: 0, reopened: 0, resolved: 0, issue_not_resolved: 0, case_closed: 0 };
    items.forEach((i) => {
      c[groupOf(i.status)]++;
      if (i.reopened) c.reopened++;
    });
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const matches = filter === 'reopened' ? i.reopened : groupOf(i.status) === filter;
      if (!matches) return false;
      if (!q) return true;
      return (i.fullName || '').toLowerCase().includes(q) || (i.ticketNo || '').toLowerCase().includes(q) || (i.serviceItem || '').toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  const call = (phone: string) => Linking.openURL(`tel:${phone}`);
  const whatsapp = (phone: string) => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`);
  const openMaps = (location: string) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: insets.bottom + spacing(10), paddingHorizontal: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Manage Tasks</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>
          Assigned jobs, service requests, and pending assignments
        </Text>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginBottom: spacing(3) }]}>{error}</Text> : null}

        <PendingAssignments pending={pending} onChanged={load} />

        <View style={styles.filterRow}>
          {filters.map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filterPill, { backgroundColor: active ? brand.primary : theme.panel2, borderColor: active ? brand.primary : theme.line }]}
              >
                <Text style={[styles.filterPillText, { color: active ? '#fff' : theme.text2 }]}>{FILTER_LABEL[f]}</Text>
                <View style={[styles.filterCountBubble, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.panel2 }]}>
                  <Text style={[styles.filterCountText, { color: active ? '#fff' : theme.text3 }]}>{counts[f]}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
          <Icon name="search" size={16} color={theme.text3} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by name, ticket, or service…"
            placeholderTextColor={theme.text3}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {filtered.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, textAlign: 'center', marginTop: spacing(8) }]}>
            Nothing here for this filter.
          </Text>
        ) : (
          filtered.map((item, idx) => {
            const statusStyle = statusColors[displayStatus(item.status)] || DEFAULT_STATUS_STYLE;
            const locked = isLocked(item.status);
            return (
              <Animated.View key={item.key} entering={FadeInUp.delay(Math.min(idx, 8) * 70).duration(420).springify()}>
                <GlassCard shadow style={StyleSheet.flatten([styles.taskCard, item.reopened && styles.taskCardReopened])}>
                  {item.reopened ? (
                    <View style={styles.reopenedTag}>
                      <Text style={styles.reopenedTagText}>🔁 Reopened — free rework</Text>
                    </View>
                  ) : null}

                  <View style={styles.rowHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: theme.text }]}>{item.fullName}</Text>
                      {item.companyName ? <Text style={[styles.companyText, { color: theme.text3 }]}>{item.companyName}</Text> : null}
                      <Text style={[styles.metaLine, { color: theme.text3 }]}>
                        {item.ticketNo ? `Ticket: ${item.ticketNo}` : 'No ticket yet'} · {timeAgo(item.createdAt)}
                      </Text>
                      {item.serviceItem ? <Text style={[styles.metaLine, { color: theme.text2 }]}>{item.serviceItem}</Text> : null}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                    </View>
                  </View>

                  {item.employeeUpdateDetail ? (
                    <View style={[styles.updateBox, { backgroundColor: theme.panel2 }]}>
                      <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Employee update</Text>
                      <Text style={[styles.metaValue, { color: theme.text2 }]}>{item.employeeUpdateDetail}</Text>
                    </View>
                  ) : null}

                  {item.location ? (
                    <View style={styles.locationRow}>
                      <Icon name="pin" size={14} color={brand.primary} />
                      <Text style={[styles.metaValue, { color: theme.text, flex: 1 }]} numberOfLines={2}>{item.location}</Text>
                    </View>
                  ) : null}

                  <View style={styles.actionRow}>
                    {!locked && (
                      <PressScale onPress={() => setStatusItem(item)} style={{ flex: 1, minWidth: 130 }}>
                        <View style={[styles.actionBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                          <Icon name="edit" size={15} color={theme.text} />
                          <Text style={[styles.actionBtnText, { color: theme.text }]}>Update Status</Text>
                        </View>
                      </PressScale>
                    )}
                    {item.phone ? (
                      <>
                        <Pressable onPress={() => call(item.phone!)} style={[styles.iconAction, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                          <Icon name="phone" size={16} color={theme.text} />
                        </Pressable>
                        <Pressable onPress={() => whatsapp(item.phone!)} style={[styles.iconAction, { backgroundColor: '#25D366' }]}>
                          <Icon name="whatsapp" size={16} color="#fff" />
                        </Pressable>
                      </>
                    ) : null}
                    {item.location ? (
                      <Pressable onPress={() => openMaps(item.location!)} style={[styles.iconAction, { backgroundColor: brand.primary }]}>
                        <Icon name="pin" size={16} color="#fff" />
                      </Pressable>
                    ) : null}
                  </View>
                </GlassCard>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {statusItem && (
        <TaskStatusModal
          item={statusItem}
          onDismiss={() => setStatusItem(null)}
          onSaved={() => {
            setStatusItem(null);
            load();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginTop: spacing(4) },
  caption: { ...typography.caption },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(2.5), gap: spacing(2) },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  companyText: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(0.5) },
  metaLine: { fontSize: 12, marginTop: spacing(0.5) },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(3), marginBottom: spacing(1) },
  metaValue: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1.5), marginBottom: spacing(3) },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3), paddingVertical: spacing(1.75), borderRadius: radius.full, borderWidth: 1 },
  filterPillText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  filterCountBubble: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterCountText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 44, marginBottom: spacing(4) },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  taskCard: { marginBottom: spacing(3) },
  taskCardReopened: { borderLeftWidth: 3, borderLeftColor: semantic.warning },
  reopenedTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(224,138,20,0.16)', borderRadius: radius.sm, paddingHorizontal: spacing(2), paddingVertical: spacing(0.75), marginBottom: spacing(2) },
  reopenedTagText: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: semantic.warning },
  statusBadge: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.full },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  updateBox: { borderRadius: radius.md, padding: spacing(2.5), marginBottom: spacing(3) },
  actionRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(1), flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 40, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing(2) },
  actionBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  iconAction: { width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
