import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ExportButton from '../components/admin/ExportButton';
import { ActivityIndicator, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import ToolHeader from '../components/ToolHeader';
import FilterChips from '../components/admin/FilterChips';
import StatusBadge from '../components/admin/StatusBadge';
import Icon from '../components/Icon';
import TaskStatusModal from '../components/TaskStatusModal';
import LocationMapModal from '../components/LocationMapModal';
import PendingAssignments from '../components/PendingAssignments';
import { useAuth } from '../context/AuthContext';
import { useAttendanceStatus } from '../context/AttendanceContext';
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
  const { clockedIn, attendance, showGate } = useAttendanceStatus();
  const [pending, setPending] = useState<TaskItem[]>([]);
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('in_progress');
  const [search, setSearch] = useState('');
  const [statusItem, setStatusItem] = useState<TaskItem | null>(null);
  const [mapItem, setMapItem] = useState<TaskItem | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetchMyTasks(user.id);
      setPending(res.pending);
      setItems(res.items);
      setError(null);
    } catch {
      setError('Could not load your tasks — pull to retry');
    } finally {
      setLoading(false);
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

  const chips = filters.map((f) => ({ key: f, label: FILTER_LABEL[f], count: counts[f] }));

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title="My Tasks" subtitle={`${items.length} task${items.length === 1 ? '' : 's'}`} onBack={onBack} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.panel }]}>
          <Icon name="search" size={18} color={theme.text3} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search ticket, customer, service"
            placeholderTextColor={theme.text3}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
              <Icon name="close" size={16} color={theme.text3} />
            </Pressable>
          ) : null}
        </View>

        <FilterChips items={chips} activeKey={filter} onSelect={(k) => setFilter(k as FilterKey)} />

        {error ? <Text style={[styles.caption, { color: theme.err }]}>{error}</Text> : null}

        {!clockedIn && !loading ? (
          <View style={[styles.notice, { backgroundColor: theme.warnS }]}>
            <Icon name="lock" size={16} color={theme.warn} />
            <Text style={[styles.noticeText, { color: theme.text }]}>
              {attendance?.clock_in ? 'You have clocked out — task updates are locked for today.' : 'Clock in to update tasks.'}
            </Text>
          </View>
        ) : null}

        <PendingAssignments pending={pending} onChanged={load} />

        {loading && items.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={brand.primary} />
            <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>Loading your tasks…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: theme.border }]}>
            <View style={[styles.emptyIconChip, { backgroundColor: theme.panel2 }]}>
              <Icon name="filter" size={22} color={theme.text2} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {search ? `No tasks match "${search.trim()}"` : 'Nothing here'}
            </Text>
            <Text style={[styles.supporting, { color: theme.text2, textAlign: 'center' }]}>
              {search ? 'Try a different search, or clear it.' : 'No tasks in this filter right now.'}
            </Text>
            {search ? (
              <Pressable onPress={() => setSearch('')} style={[styles.clearBtn, { borderColor: theme.border, backgroundColor: theme.panel }]}>
                <Text style={[styles.clearBtnText, { color: theme.text }]}>Clear search</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <View style={styles.countRow}>
              <Text style={[styles.supporting, { color: theme.text3 }]}>{filtered.length} of {items.length} tasks</Text>
              <ExportButton
                name="my-tasks.csv"
                label="Export tasks"
                rows={filtered.map((t) => ({ Ticket: t.ticketNo, Customer: t.fullName, Phone: t.phone, Service: t.serviceItem, Location: t.location, Status: t.status, Assignment: t.assignmentStatus, Created: String(t.createdAt).slice(0, 10) }))}
              />
            </View>
            {filtered.map((item) => {
              const statusStyle = statusColors[displayStatus(item.status)] || DEFAULT_STATUS_STYLE;
              const locked = isLocked(item.status);
              const group = groupOf(item.status);
              const ageDays = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86400000);
              const showAge = group === 'in_progress' || group === 'issue_not_resolved';
              const ageColor = ageDays < 1 ? theme.ok : ageDays <= 3 ? theme.warn : theme.err;
              const ageLabel = ageDays < 1 ? 'Fresh' : ageDays <= 3 ? `${ageDays}d open` : `${ageDays}d overdue`;
              return (
                <View key={item.key} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                  <View style={styles.cardBody}>
                    {item.reopened ? (
                      <View style={[styles.reopenedTag, { backgroundColor: theme.warnS }]}>
                        <Icon name="refresh" size={12} color={theme.warn} />
                        <Text style={[styles.reopenedTagText, { color: theme.warn }]}>Reopened — free rework</Text>
                      </View>
                    ) : null}
                    <View style={styles.cardTop}>
                      <Text style={[styles.ticketNo, { color: theme.accent }]}>{item.ticketNo || 'No ticket yet'}</Text>
                      <StatusBadge label={statusStyle.label} color={statusStyle.color} />
                    </View>
                    <Text style={[styles.name, { color: theme.text }]}>{item.fullName}</Text>
                    {item.serviceItem ? <Text style={[styles.supporting, { color: theme.text2 }]}>{item.serviceItem}</Text> : null}
                    {item.location ? (
                      <Text style={[styles.supporting, { color: theme.text2 }]} numberOfLines={2}>{item.location}</Text>
                    ) : null}
                    <View style={styles.metaRow}>
                      {showAge ? (
                        <View style={styles.metaItem}>
                          <Icon name="timer" size={14} color={ageColor} />
                          <Text style={[styles.metaText, { color: ageColor }]}>{ageLabel}</Text>
                        </View>
                      ) : null}
                      <View style={styles.metaItem}>
                        <Icon name="calendar" size={14} color={theme.text3} />
                        <Text style={[styles.metaText, { color: theme.text3 }]}>{timeAgo(item.createdAt)}</Text>
                      </View>
                    </View>

                    {item.employeeUpdateDetail ? (
                      <View style={[styles.updateBox, { backgroundColor: theme.panel2 }]}>
                        <Text style={[styles.overline, { color: theme.text3 }]}>Employee update</Text>
                        <Text style={[styles.supporting, { color: theme.text2 }]}>{item.employeeUpdateDetail}</Text>
                      </View>
                    ) : null}

                    {!locked ? (
                      <Pressable
                        onPress={() => (clockedIn ? setStatusItem(item) : !attendance?.clock_in && showGate())}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.updateBtn,
                          { backgroundColor: clockedIn ? (pressed ? brand.pressed : brand.fill) : theme.panel2 },
                        ]}
                      >
                        <Icon name={clockedIn ? 'swap' : 'lock'} size={16} color={clockedIn ? '#ffffff' : theme.text3} />
                        <Text style={[styles.updateBtnText, { color: clockedIn ? '#ffffff' : theme.text3 }]}>Update status</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {item.phone || item.location ? (
                    <View style={[styles.quickRow, { borderTopColor: theme.line }]}>
                      {item.phone ? (
                        <Pressable onPress={() => call(item.phone!)} style={[styles.quickBtn, { borderRightColor: theme.line }]} accessibilityLabel="Call">
                          <Icon name="phone" size={16} color={theme.text} />
                          <Text style={[styles.quickText, { color: theme.text }]}>Call</Text>
                        </Pressable>
                      ) : null}
                      {item.phone ? (
                        <Pressable onPress={() => whatsapp(item.phone!)} style={[styles.quickBtn, { borderRightColor: theme.line }]} accessibilityLabel="WhatsApp">
                          <Icon name="whatsapp" size={16} color={theme.text} />
                          <Text style={[styles.quickText, { color: theme.text }]}>WhatsApp</Text>
                        </Pressable>
                      ) : null}
                      {item.location ? (
                        <Pressable onPress={() => setMapItem(item)} style={[styles.quickBtn, { borderRightWidth: 0 }]} accessibilityLabel="Directions">
                          <Icon name="pin" size={16} color={theme.text} />
                          <Text style={[styles.quickText, { color: theme.text }]}>Directions</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {statusItem && (
        <TaskStatusModal
          item={statusItem}
          onDismiss={() => setStatusItem(null)}
          onSaved={(savedStatus) => {
            setStatusItem(null);
            load();
            if (savedStatus === 'resolved' || savedStatus === 'case_closed' || savedStatus === 'foc') {
              setFilter('resolved');
            }
          }}
        />
      )}

      {mapItem && (
        <LocationMapModal
          location={mapItem.location}
          lat={mapItem.customerLat}
          lng={mapItem.customerLng}
          onDismiss={() => setMapItem(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), gap: spacing(4) },
  caption: { ...typography.caption },
  supporting: { ...typography.supporting },
  overline: { ...typography.overline, marginBottom: spacing(1) },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 48 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), borderRadius: radius.md },
  noticeText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  loadingBox: { alignItems: 'center', paddingVertical: spacing(10) },
  emptyBox: { alignItems: 'center', borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', paddingVertical: spacing(6), paddingHorizontal: spacing(4), gap: spacing(2) },
  emptyIconChip: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...typography.rowTitle, fontSize: 16, textAlign: 'center' },
  clearBtn: { height: 44, paddingHorizontal: spacing(4), borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  cardBody: { padding: spacing(3.5), gap: spacing(1.5) },
  reopenedTag: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing(2.5), height: 24 },
  reopenedTagText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(2) },
  ticketNo: { ...typography.monoId },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginTop: spacing(0.5) },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  updateBox: { borderRadius: radius.md, padding: spacing(3) },
  updateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 48, borderRadius: radius.md, marginTop: spacing(2) },
  updateBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  quickRow: { flexDirection: 'row', borderTopWidth: 1 },
  quickBtn: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), borderRightWidth: 1 },
  quickText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
