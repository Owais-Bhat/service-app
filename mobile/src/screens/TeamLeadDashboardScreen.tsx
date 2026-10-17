import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppModal as Modal } from '../components/AppModal';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import FilterChips from '../components/admin/FilterChips';
import StatusBadge from '../components/admin/StatusBadge';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { dataGet, dataPatch } from '../api/client';
import { fetchEmployees, EmployeePickRow } from '../api/admin';

interface InquiryRow {
  id: string;
  ticket_no: string | null;
  full_name: string | null;
  service_item: string | null;
  status: string | null;
  assignment_status: string | null;
  assigned_employee_id: string | null;
  created_at: string;
}

type FilterKey = 'all' | 'unassigned' | 'assigned';

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All',
  unassigned: 'Unassigned',
  assigned: 'Assigned',
};

function normalizeStatus(s: string | null) { return s || 'open'; }

function statusLabel(s: string | null) {
  const st = normalizeStatus(s);
  if (st === 'in_progress') return 'In Progress';
  if (st === 'resolved' || st === 'foc') return 'Resolved';
  if (st === 'case_closed') return 'Closed';
  return st;
}

export default function TeamLeadDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { logout, user } = useAuth();
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const [assignTarget, setAssignTarget] = useState<InquiryRow | null>(null);
  const [employees, setEmployees] = useState<EmployeePickRow[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await dataGet<InquiryRow[]>('inquiries', {
        select: 'id,ticket_no,full_name,service_item,status,assignment_status,assigned_employee_id,created_at',
        order: 'created_at:desc',
      });
      setInquiries(data);
      setError(null);
    } catch {
      setError('Could not load tickets — pull to retry');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAssign = async (row: InquiryRow) => {
    setAssignTarget(row);
    setEmpLoading(true);
    try {
      const list = await fetchEmployees();
      setEmployees(list);
    } catch {
      setEmployees([]);
    } finally {
      setEmpLoading(false);
    }
  };

  const doAssign = async (emp: EmployeePickRow) => {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      await dataPatch('inquiries', `id:${assignTarget.id}`, {
        assigned_employee_id: emp.id,
        assignment_status: 'pending',
      });
      setInquiries((prev) => prev.map((i) =>
        i.id === assignTarget.id ? { ...i, assigned_employee_id: emp.id, assignment_status: 'pending' } : i
      ));
      setAssignTarget(null);
    } catch {
      // silent
    } finally {
      setAssigning(false);
    }
  };

  const total = inquiries.length;
  const unassigned = inquiries.filter((i) => !i.assigned_employee_id || i.assignment_status === 'none').length;
  const assigned = total - unassigned;

  const filtered = inquiries.filter((i) => {
    if (filter === 'unassigned') return !i.assigned_employee_id || i.assignment_status === 'none';
    if (filter === 'assigned') return !!(i.assigned_employee_id && i.assignment_status !== 'none');
    return true;
  });

  const kpis = [
    { v: total, l: 'Total', c: theme.text },
    { v: unassigned, l: 'Unassigned', c: theme.err },
    { v: assigned, l: 'Assigned', c: theme.ok },
  ];
  const chips = (Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => ({
    key,
    label: FILTER_LABELS[key],
    count: key === 'all' ? total : key === 'unassigned' ? unassigned : assigned,
  }));

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Team Lead" subtitle={user?.full_name} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={brand.primary} />}
      >
        <View style={styles.kpiRow}>
          {kpis.map((k) => (
            <View key={k.l} style={[styles.kpi, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <Text style={[styles.kpiValue, { color: k.c }]}>{k.v}</Text>
              <Text style={[styles.kpiLabel, { color: theme.text2 }]}>{k.l}</Text>
            </View>
          ))}
        </View>

        <FilterChips items={chips} activeKey={filter} onSelect={(key) => setFilter(key as FilterKey)} />

        <Text style={[styles.heading, { color: theme.text }]}>Tickets</Text>

        {loading ? (
          <ActivityIndicator color={brand.primary} style={{ marginTop: spacing(6) }} />
        ) : error ? (
          <Text style={[styles.dim, { color: theme.err }]}>{error}</Text>
        ) : filtered.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No tickets found</Text>
            <Text style={[styles.supporting, { color: theme.text2 }]}>Nothing matches this filter right now.</Text>
          </View>
        ) : (
          <View style={[styles.listPanel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            {filtered.map((item, idx) => {
              const statusStyle = statusColors[normalizeStatus(item.status)] || DEFAULT_STATUS_STYLE;
              const isUnassigned = !item.assigned_employee_id || item.assignment_status === 'none';
              return (
                <View key={item.id} style={[styles.ticket, idx < filtered.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                  <View style={styles.ticketTop}>
                    <Text style={[styles.ticketNo, { color: theme.accent }]}>{item.ticket_no || '—'}</Text>
                    <StatusBadge label={statusLabel(item.status)} color={statusStyle.color} />
                  </View>
                  <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{item.full_name || '—'}</Text>
                  {item.service_item ? <Text style={[styles.supporting, { color: theme.text2 }]} numberOfLines={1}>{item.service_item}</Text> : null}
                  <View style={styles.footer}>
                    <View style={styles.assignState}>
                      <Icon name={isUnassigned ? 'alert' : 'check-done'} size={14} color={isUnassigned ? theme.err : theme.ok} />
                      <Text style={[styles.assignText, { color: isUnassigned ? theme.err : theme.ok }]}>
                        {isUnassigned ? 'Unassigned' : 'Assigned'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => openAssign(item)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.assignBtn, { borderColor: theme.border, backgroundColor: theme.panel }, pressed && styles.pressed]}
                    >
                      <Text style={[styles.assignBtnText, { color: theme.text }]}>{isUnassigned ? 'Assign' : 'Reassign'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={logout}
          accessibilityRole="button"
          style={({ pressed }) => [styles.signOut, { borderColor: theme.err, backgroundColor: theme.errS }, pressed && styles.pressed]}
        >
          <Icon name="logout" size={18} color={theme.err} />
          <Text style={[styles.signOutText, { color: theme.err }]}>Sign out</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={!!assignTarget} transparent animationType="slide" onRequestClose={() => setAssignTarget(null)}>
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAssignTarget(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.border, paddingBottom: insets.bottom + spacing(9) }]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Assign to employee</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {empLoading || assigning ? (
                <ActivityIndicator color={brand.primary} style={{ marginTop: spacing(6) }} />
              ) : employees.length === 0 ? (
                <Text style={[styles.dim, { color: theme.text3, marginTop: spacing(6) }]}>No employees found</Text>
              ) : (
                employees.map((emp) => (
                  <Pressable
                    key={emp.id}
                    onPress={() => doAssign(emp)}
                    style={({ pressed }) => [styles.empRow, { borderBottomColor: theme.line }, pressed && styles.pressed]}
                  >
                    <View style={[styles.avatar, { backgroundColor: theme.panel2 }]}>
                      <Text style={[styles.avatarText, { color: theme.text }]}>
                        {(emp.full_name || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]}>{emp.full_name}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: spacing(4), paddingBottom: spacing(16), paddingHorizontal: spacing(4), gap: spacing(5) },
  kpiRow: { flexDirection: 'row', gap: spacing(2) },
  kpi: { flex: 1, borderRadius: 16, borderWidth: 1, padding: spacing(2.5) },
  kpiValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22 },
  kpiLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, lineHeight: 14 },
  heading: { ...typography.heading },
  supporting: { ...typography.supporting },
  rowTitle: { ...typography.rowTitle },
  pressed: { opacity: 0.7 },
  dim: { ...typography.body, textAlign: 'center', marginTop: spacing(6) },
  empty: { borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', padding: spacing(6), alignItems: 'center', gap: spacing(1) },
  emptyTitle: { ...typography.rowTitle, fontSize: 16 },
  listPanel: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  ticket: { padding: spacing(3.5), gap: spacing(1) },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) },
  ticketNo: { ...typography.monoId },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(2) },
  assignState: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  assignText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  assignBtn: { height: 40, paddingHorizontal: spacing(3), borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  assignBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 52, borderRadius: radius.md, borderWidth: 1 },
  signOutText: { ...typography.button },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderTopWidth: 1, paddingHorizontal: spacing(5), paddingTop: spacing(2.5) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing(4.5) },
  sheetTitle: { ...typography.heading, fontSize: 20, lineHeight: 26, marginBottom: spacing(3) },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2.5), minHeight: 56, borderBottomWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
