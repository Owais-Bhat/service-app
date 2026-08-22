import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlassSurface from '../components/GlassSurface';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import PressScale from '../components/PressScale';
import TaskStatusModal from '../components/TaskStatusModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchMyTasks, acceptAssignment, declineAssignment, TaskItem } from '../api/tasks';

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

function DeclineModal({ onDismiss, onConfirm }: { onDismiss: () => void; onConfirm: (reason: string) => void }) {
  const { theme } = useTheme();
  const [reason, setReason] = useState('');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.modalCard} borderRadius={radius.lg}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Decline Assignment</Text>
          <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(2) }]}>Reason (required)</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.line }]}
            placeholder="Why can't you take this job?"
            placeholderTextColor={theme.text3}
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onDismiss} style={[styles.cancelBtn, { borderColor: theme.line }]}>
              <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <PressScale onPress={() => reason.trim() && onConfirm(reason.trim())} style={{ flex: 1 }}>
              <View style={[styles.saveBtn, { backgroundColor: semantic.danger }]}>
                <Text style={styles.saveBtnText}>Decline</Text>
              </View>
            </PressScale>
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
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
  const [declineTarget, setDeclineTarget] = useState<TaskItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const handleAccept = async (item: TaskItem) => {
    setBusyId(item.key);
    try {
      await acceptAssignment(item);
      await load();
    } catch {
      setError('Could not accept — check your connection');
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (reason: string) => {
    if (!declineTarget?.inquiryId) return;
    setBusyId(declineTarget.key);
    try {
      await declineAssignment(declineTarget.inquiryId, reason);
      setDeclineTarget(null);
      await load();
    } catch {
      setError('Could not decline — check your connection');
    } finally {
      setBusyId(null);
    }
  };

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

        {pending.length > 0 && (
          <View style={{ marginBottom: spacing(5) }}>
            <View style={styles.pendingHeader}>
              <Icon name="alert" size={18} color={brand.primary} />
              <Text style={[styles.sectionHeading, { color: brand.primary }]}>New Assignments Pending</Text>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pending.length}</Text>
              </View>
            </View>

            {pending.map((p, idx) => (
              <Animated.View key={p.key} entering={FadeInUp.delay(idx * 80).duration(450).springify()}>
                <GlassCard shadow style={styles.pendingCard}>
                  <View style={styles.rowHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.eyebrow, { color: brand.primary }]}>Service Request</Text>
                      <Text style={[styles.name, { color: theme.text }]}>{p.fullName}</Text>
                    </View>
                    {p.serviceItem ? (
                      <View style={styles.serviceChip}>
                        <Text style={styles.serviceChipText} numberOfLines={1}>{p.serviceItem}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={[styles.ticketBox, { borderColor: theme.line }]}>
                    <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Ticket</Text>
                    <Text style={[styles.ticketNo, { color: brand.primary }]}>{p.ticketNo || 'Pending'}</Text>
                  </View>

                  <View style={styles.metaGrid}>
                    <View style={styles.metaCell}>
                      <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Created</Text>
                      <Text style={[styles.metaValue, { color: theme.text }]}>{timeAgo(p.createdAt)}</Text>
                    </View>
                    <View style={styles.metaCell}>
                      <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Preferred Time</Text>
                      <Text style={[styles.metaValue, { color: brand.primary }]}>{p.preferredTime || 'Flexible'}</Text>
                    </View>
                  </View>

                  {p.location ? (
                    <View style={styles.locationRow}>
                      <Icon name="pin" size={14} color={brand.primary} />
                      <Text style={[styles.metaValue, { color: theme.text, flex: 1 }]} numberOfLines={2}>{p.location}</Text>
                    </View>
                  ) : null}

                  <View style={styles.pendingActions}>
                    <PressScale onPress={() => handleAccept(p)} disabled={busyId === p.key} style={{ flex: 1 }}>
                      <View style={[styles.acceptBtn, { opacity: busyId === p.key ? 0.7 : 1 }]}>
                        <Icon name="check" size={16} color="#fff" />
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      </View>
                    </PressScale>
                    <PressScale onPress={() => setDeclineTarget(p)} disabled={busyId === p.key} style={{ flex: 1 }}>
                      <View style={[styles.declineBtn, { opacity: busyId === p.key ? 0.7 : 1 }]}>
                        <Icon name="close" size={16} color="#fff" />
                        <Text style={styles.acceptBtnText}>Decline</Text>
                      </View>
                    </PressScale>
                  </View>
                </GlassCard>
              </Animated.View>
            ))}
          </View>
        )}

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
      {declineTarget && <DeclineModal onDismiss={() => setDeclineTarget(null)} onConfirm={handleDecline} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginTop: spacing(4) },
  caption: { ...typography.caption },
  sectionHeading: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, flex: 1 },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginBottom: spacing(3) },
  pendingBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  pendingBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#fff' },
  pendingCard: { marginBottom: spacing(3), borderWidth: 1.5, borderColor: brand.primary },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(2.5), gap: spacing(2) },
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing(0.5) },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  companyText: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(0.5) },
  metaLine: { fontSize: 12, marginTop: spacing(0.5) },
  serviceChip: { backgroundColor: brand.primary, borderRadius: radius.full, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), maxWidth: 140 },
  serviceChipText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#fff' },
  ticketBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing(2.5), marginBottom: spacing(2.5) },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14, marginTop: spacing(0.5) },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(3), marginBottom: spacing(1) },
  metaGrid: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(2.5) },
  metaCell: { flex: 1 },
  metaValue: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1.5), marginBottom: spacing(3) },
  pendingActions: { flexDirection: 'row', gap: spacing(2.5) },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), backgroundColor: semantic.success, height: 42, borderRadius: radius.sm },
  declineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), backgroundColor: semantic.danger, height: 42, borderRadius: radius.sm },
  acceptBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  modalCard: { width: '100%', maxWidth: 440, maxHeight: '86%', padding: spacing(5) },
  modalTitle: { ...typography.heading, fontSize: 18 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  error: { fontSize: 12, color: semantic.danger, marginTop: spacing(2.5) },
  modalActions: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(4) },
  cancelBtn: { paddingHorizontal: spacing(4), height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  saveBtn: { height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
});
