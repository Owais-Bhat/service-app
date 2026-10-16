import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import MeshBackground from '../components/MeshBackground';
import ToolHeader from '../components/ToolHeader';
import FilterChips from '../components/admin/FilterChips';
import StatusBadge from '../components/admin/StatusBadge';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
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

  const kpis = [
    { v: total, l: 'Total', c: theme.text },
    { v: inProgressCount, l: 'In progress', c: theme.warn },
    { v: resolvedCount, l: 'Resolved', c: theme.ok },
  ];
  const chips = (Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => ({
    key,
    label: FILTER_LABELS[key],
    count: key === 'all' ? total : key === 'in_progress' ? inProgressCount : resolvedCount,
  }));
  const isLead = currentRole === 'team_lead';

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title={employeeName} subtitle="Employee panel" onBack={onBack} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.primary} />}
      >
        <Pressable
          onPress={toggleRole}
          disabled={roleUpdating}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.roleBtn,
            isLead
              ? { backgroundColor: theme.warnS, borderColor: theme.warn }
              : { backgroundColor: theme.panel, borderColor: theme.border },
            pressed && styles.pressed,
          ]}
        >
          <Icon name={isLead ? 'star' : 'people'} size={18} color={isLead ? theme.warn : theme.text} filled={isLead} />
          <Text style={[styles.roleBtnText, { color: isLead ? theme.warn : theme.text }]}>
            {roleUpdating ? 'Updating…' : isLead ? 'Team Lead — tap to revert to Employee' : 'Promote to Team Lead'}
          </Text>
        </Pressable>

        <View style={styles.kpiRow}>
          {kpis.map((k) => (
            <View key={k.l} style={[styles.kpi, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <Text style={[styles.kpiValue, { color: k.c }]}>{k.v}</Text>
              <Text style={[styles.kpiLabel, { color: theme.text2 }]}>{k.l}</Text>
            </View>
          ))}
        </View>

        <FilterChips items={chips} activeKey={filter} onSelect={(k) => setFilter(k as FilterKey)} />

        {loading ? (
          <ActivityIndicator color={brand.primary} style={{ marginTop: spacing(6) }} />
        ) : error ? (
          <Text style={[styles.note, { color: theme.err }]}>{error}</Text>
        ) : filtered.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No requests found.</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.note, { color: theme.text3, textAlign: 'left' }]}>{filtered.length} of {total} requests</Text>
            <View style={[styles.listPanel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              {filtered.map((item, idx) => {
                const statusStyle = statusColors[normalizeStatus(item.status)] || DEFAULT_STATUS_STYLE;
                return (
                  <View key={item.id} style={[styles.row, idx < filtered.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                    <View style={styles.rowTop}>
                      <Text style={[styles.ticketNo, { color: theme.accent }]}>{item.ticket_no || 'No ticket'}</Text>
                      <StatusBadge label={statusLabel(item.status)} color={statusStyle.color} />
                    </View>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.full_name || '—'}</Text>
                    {item.service_item ? (
                      <Text style={[styles.supporting, { color: theme.text2 }]} numberOfLines={1}>{item.service_item}</Text>
                    ) : null}
                    <View style={styles.metaItem}>
                      <Icon name="calendar" size={14} color={theme.text3} />
                      <Text style={[styles.metaText, { color: theme.text3 }]}>{formatDate(item.created_at)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), paddingBottom: spacing(16), gap: spacing(4) },
  pressed: { opacity: 0.7 },
  roleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 52, borderRadius: radius.md, borderWidth: 1 },
  roleBtnText: { ...typography.button },
  kpiRow: { flexDirection: 'row', gap: spacing(2) },
  kpi: { flex: 1, borderRadius: 16, borderWidth: 1, padding: spacing(2.5) },
  kpiValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22 },
  kpiLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  note: { ...typography.caption, textAlign: 'center' },
  empty: { borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', padding: spacing(6), alignItems: 'center' },
  emptyTitle: { ...typography.rowTitle },
  listPanel: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { padding: spacing(3.5), gap: spacing(1) },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketNo: { ...typography.monoId },
  name: { ...typography.rowTitle, fontSize: 16 },
  supporting: { ...typography.supporting },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginTop: spacing(1) },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
});
