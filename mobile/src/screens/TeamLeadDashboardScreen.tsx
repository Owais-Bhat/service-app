import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import GlassCard from '../components/GlassCard';
import AnimatedStatCard from '../components/AnimatedStatCard';
import PressScale from '../components/PressScale';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Team Lead" subtitle={user?.full_name} />

      <ScrollView
        contentContainerStyle={{ paddingTop: spacing(4), paddingBottom: spacing(16), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={brand.primary} />}
      >
        <View style={styles.statRow}>
          <AnimatedStatCard label="Total" value={total} accentColor={brand.primary} delayMs={0} />
          <AnimatedStatCard label="Unassigned" value={unassigned} accentColor={semantic.danger} delayMs={80} />
          <AnimatedStatCard label="Assigned" value={assigned} accentColor={semantic.success} delayMs={160} />
        </View>

        <View style={styles.pillRow}>
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
            const active = filter === key;
            return (
              <PressScale key={key} onPress={() => setFilter(key)}>
                <View style={[styles.pill, {
                  borderColor: active ? brand.primary : theme.line,
                  backgroundColor: active ? `${brand.primary}20` : theme.panel2,
                }]}>
                  <Text style={[styles.pillText, { color: active ? brand.primary : theme.text2 }]}>{FILTER_LABELS[key]}</Text>
                </View>
              </PressScale>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={brand.primary} style={{ marginTop: spacing(10) }} />
        ) : error ? (
          <Text style={[styles.dim, { color: semantic.danger }]}>{error}</Text>
        ) : filtered.length === 0 ? (
          <Text style={[styles.dim, { color: theme.text3 }]}>No tickets found</Text>
        ) : (
          filtered.map((item) => {
            const statusStyle = statusColors[normalizeStatus(item.status)] || DEFAULT_STATUS_STYLE;
            const isUnassigned = !item.assigned_employee_id || item.assignment_status === 'none';
            return (
              <GlassCard key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.ticket, { color: brand.primary }]}>#{item.ticket_no || '—'}</Text>
                  <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.badgeText, { color: statusStyle.color }]}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.full_name || '—'}</Text>
                {item.service_item ? <Text style={[styles.sub, { color: theme.text3 }]} numberOfLines={1}>{item.service_item}</Text> : null}
                <View style={styles.footer}>
                  <Text style={[styles.sub, { color: isUnassigned ? semantic.danger : semantic.success }]}>
                    {isUnassigned ? 'Unassigned' : 'Assigned'}
                  </Text>
                  <PressScale onPress={() => openAssign(item)}>
                    <View style={[styles.assignBtn, { backgroundColor: `${brand.primary}20`, borderColor: brand.primary }]}>
                      <Text style={[styles.assignBtnText, { color: brand.primary }]}>
                        {isUnassigned ? 'Assign' : 'Reassign'}
                      </Text>
                    </View>
                  </PressScale>
                </View>
              </GlassCard>
            );
          })
        )}

        <PressScale onPress={logout} style={{ marginTop: spacing(6) }}>
          <View style={[styles.signOutBtn, { borderColor: semantic.danger }]}>
            <Text style={[styles.signOutText, { color: semantic.danger }]}>Sign Out</Text>
          </View>
        </PressScale>
      </ScrollView>

      <Modal visible={!!assignTarget} transparent animationType="slide" onRequestClose={() => setAssignTarget(null)}>
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAssignTarget(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.panel, paddingBottom: insets.bottom + spacing(4) }]}>
            <View style={[styles.grabber, { backgroundColor: theme.line }]} />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Assign to Employee</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {empLoading || assigning ? (
                <ActivityIndicator color={brand.primary} style={{ marginTop: spacing(6) }} />
              ) : employees.length === 0 ? (
                <Text style={[styles.dim, { color: theme.text3, textAlign: 'center', marginTop: spacing(6) }]}>No employees found</Text>
              ) : (
                employees.map((emp) => (
                  <Pressable
                    key={emp.id}
                    onPress={() => doAssign(emp)}
                    style={({ pressed }) => [styles.empRow, { borderBottomColor: theme.line, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <View style={[styles.avatar, { backgroundColor: `${brand.primary}20` }]}>
                      <Text style={[styles.avatarText, { color: brand.primary }]}>
                        {(emp.full_name || '?').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.empName, { color: theme.text }]}>{emp.full_name}</Text>
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
  statRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(4) },
  pillRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3), flexWrap: 'wrap' },
  pill: { paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: radius.full, borderWidth: 1 },
  pillText: { ...typography.caption, fontWeight: '600' },
  dim: { ...typography.body, textAlign: 'center', marginTop: spacing(8) },
  card: { marginBottom: spacing(3) },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) },
  ticket: { ...typography.caption, fontWeight: '700' },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing(2), paddingVertical: 3 },
  badgeText: { ...typography.caption, fontSize: 11, fontWeight: '600' },
  name: { ...typography.body, fontWeight: '700' as const, marginBottom: 2 },
  sub: { ...typography.caption },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(2) },
  assignBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5) },
  assignBtnText: { ...typography.caption, fontWeight: '700' },
  signOutBtn: { borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing(3), alignItems: 'center' },
  signOutText: { ...typography.body, fontWeight: '700' as const },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing(5), paddingTop: spacing(4) },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing(3) },
  sheetTitle: { ...typography.heading, marginBottom: spacing(3) },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(3), borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700' },
  empName: { ...typography.body },
});
