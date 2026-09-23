import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import AppHeaderBar from '../components/AppHeaderBar';
import AnimatedStatCard from '../components/AnimatedStatCard';
import PressScale from '../components/PressScale';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { dataGet } from '../api/client';
import { patchUser } from '../api/admin';

interface Props {
  employeeId: string;
  employeeName: string;
  employeeRole?: string;
  onBack: () => void;
}

interface RawInquiry {
  id: string;
  ticket_no: string | null;
  full_name: string | null;
  service_item: string | null;
  status: string | null;
  created_at: string;
}

type FilterKey = 'all' | 'in_progress' | 'resolved';

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

function normalizeStatus(status: string | null): string {
  return status || 'open';
}

function isResolved(status: string | null): boolean {
  const s = normalizeStatus(status);
  return ['resolved', 'case_closed', 'foc'].includes(s);
}

function isInProgress(status: string | null): boolean {
  return !isResolved(status);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function statusLabel(status: string | null): string {
  const s = normalizeStatus(status);
  if (s === 'in_progress') return 'In Progress';
  if (s === 'resolved' || s === 'foc') return 'Resolved';
  if (s === 'case_closed') return 'Closed';
  if (s === 'issue_not_resolved') return 'Issue';
  if (s === 'reopened') return 'Reopened';
  return s;
}

export default function EmployeePanelScreen({ employeeId, employeeName, employeeRole, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [inquiries, setInquiries] = useState<RawInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [currentRole, setCurrentRole] = useState(employeeRole ?? 'employee');
  const [roleUpdating, setRoleUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await dataGet<RawInquiry[]>('inquiries', {
        eq: [`assigned_employee_id:${employeeId}`],
        order: 'created_at:desc',
      });
      setInquiries(data);
      setError(null);
    } catch {
      setError('Could not load tasks — pull to retry');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleRole = async () => {
    const newRole = currentRole === 'team_lead' ? 'employee' : 'team_lead';
    setRoleUpdating(true);
    try {
      await patchUser(employeeId, { role: newRole });
      setCurrentRole(newRole);
    } catch {
      // silent — user can retry
    } finally {
      setRoleUpdating(false);
    }
  };

  const total = inquiries.length;
  const inProgressCount = inquiries.filter((i) => isInProgress(i.status)).length;
  const resolvedCount = inquiries.filter((i) => isResolved(i.status)).length;

  const filtered = inquiries.filter((i) => {
    if (filter === 'all') return true;
    if (filter === 'in_progress') return isInProgress(i.status);
    if (filter === 'resolved') return isResolved(i.status);
    return true;
  });

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title={employeeName} subtitle="Employee Panel" onBack={onBack} />

      <ScrollView
        contentContainerStyle={{ paddingTop: spacing(4), paddingBottom: spacing(16), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.primary} />}
      >
        {/* Role toggle */}
        <PressScale onPress={toggleRole} style={{ marginBottom: spacing(4) }}>
          <View style={[styles.roleBtn, {
            backgroundColor: currentRole === 'team_lead' ? `${semantic.warning}22` : `${brand.primary}18`,
            borderColor: currentRole === 'team_lead' ? semantic.warning : brand.primary,
          }]}>
            <Text style={[styles.roleBtnText, { color: currentRole === 'team_lead' ? semantic.warning : brand.primary }]}>
              {roleUpdating ? 'Updating…' : currentRole === 'team_lead' ? '★ Team Lead — Tap to revert to Employee' : 'Promote to Team Lead'}
            </Text>
          </View>
        </PressScale>

        {/* Stat tiles */}
        <View style={styles.statRow}>
          <AnimatedStatCard label="Total" value={total} accentColor={brand.primary} delayMs={0} />
          <AnimatedStatCard label="In Progress" value={inProgressCount} accentColor={semantic.warning} delayMs={80} />
          <AnimatedStatCard label="Resolved" value={resolvedCount} accentColor={semantic.success} delayMs={160} />
        </View>

        {/* Filter pills */}
        <View style={styles.pillRow}>
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
            const active = filter === key;
            return (
              <PressScale key={key} onPress={() => setFilter(key)}>
                <View style={[styles.pill, { borderColor: active ? brand.primary : theme.line, backgroundColor: active ? `${brand.primary}20` : theme.panel2 }]}>
                  <Text style={[styles.pillText, { color: active ? brand.primary : theme.text2 }]}>{FILTER_LABELS[key]}</Text>
                </View>
              </PressScale>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={brand.primary} style={{ marginTop: spacing(10) }} />
        ) : error ? (
          <Text style={[styles.errorText, { color: semantic.danger }]}>{error}</Text>
        ) : filtered.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.text3 }]}>No requests found.</Text>
        ) : (
          <>
            <Text style={[styles.resultCount, { color: theme.text3 }]}>{filtered.length} of {total} requests</Text>
            {filtered.map((item, idx) => {
              const statusStyle = statusColors[normalizeStatus(item.status)] || DEFAULT_STATUS_STYLE;
              const initial = (item.full_name || '?').trim().charAt(0).toUpperCase();
              return (
                <Animated.View key={item.id} entering={FadeInUp.delay(Math.min(idx, 8) * 70).duration(450).springify().damping(14)}>
                  <View style={[styles.cardOuter, { shadowColor: statusStyle.color }]}>
                    <View style={[styles.accentBar, { backgroundColor: statusStyle.color }]} />
                    <GlassCard shadow style={styles.taskCard}>
                      <View style={styles.rowHeader}>
                        <View style={[styles.avatar, { backgroundColor: `${statusStyle.color}26`, borderColor: `${statusStyle.color}40` }]}>
                          <Text style={[styles.avatarText, { color: statusStyle.color }]}>{initial}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.name, { color: theme.text }]}>{item.full_name || '—'}</Text>
                          {item.service_item ? (
                            <Text style={[styles.caption, { color: theme.text3 }]} numberOfLines={1}>{item.service_item}</Text>
                          ) : null}
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{statusLabel(item.status)}</Text>
                        </View>
                      </View>

                      <View style={styles.chipRow}>
                        <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                          <Text style={[styles.metaChipText, { color: theme.text2 }]}>{item.ticket_no || 'No ticket'}</Text>
                        </View>
                        <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                          <Text style={[styles.metaChipText, { color: theme.text2 }]}>{formatDate(item.created_at)}</Text>
                        </View>
                      </View>
                    </GlassCard>
                  </View>
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  roleBtn: { borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing(3), paddingHorizontal: spacing(4), alignItems: 'center' },
  roleBtnText: { ...typography.body, fontWeight: '700' as const },
  statRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(4) },
  pillRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3), flexWrap: 'wrap' },
  pill: { paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: radius.full, borderWidth: 1 },
  pillText: { ...typography.caption, fontWeight: '600' },
  resultCount: { ...typography.caption, marginBottom: spacing(2) },
  errorText: { ...typography.caption, marginTop: spacing(6), textAlign: 'center' },
  emptyText: { ...typography.caption, marginTop: spacing(6), textAlign: 'center' },
  cardOuter: {
    marginBottom: spacing(3),
    borderRadius: radius.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
    flexDirection: 'row',
  },
  accentBar: { width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  taskCard: { flex: 1, padding: spacing(4), borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(3) },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  avatarText: { fontSize: 16, fontWeight: '700' },
  name: { ...typography.body, fontWeight: '700' as const },
  caption: { ...typography.caption },
  statusBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: radius.sm },
  statusBadgeText: { ...typography.caption, fontWeight: '700', fontSize: 11 },
  chipRow: { flexDirection: 'row', gap: spacing(2), flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: radius.sm, borderWidth: 1 },
  metaChipText: { ...typography.caption, fontSize: 11 },
});
