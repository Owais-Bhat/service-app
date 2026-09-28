import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import GlassCard from '../components/GlassCard';
import PressScale from '../components/PressScale';
import InstallationDetailSheet, { EmployeeOption } from '../components/InstallationDetailSheet';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { dataGet } from '../api/client';
import { fetchAllInstallations, InstallationJob } from '../api/installations';

interface Props {
  onBack: () => void;
}

const FILTERS = ['Open', 'Unassigned', 'Unpaid', 'All'] as const;
type Filter = typeof FILTERS[number];

const num = (v: unknown) => Number(v || 0);

// Pill colour for the plain "assigned, nothing has happened yet" case.
const NEUTRAL = '#8aa79a';

// What state this booking is really in, in the order that matters to the
// office: unassigned first, then waiting on the technician, then money owed.
function pill(job: InstallationJob): { label: string; color: string } {
  if (!job.assigned_employee_id) return { label: 'Unassigned', color: semantic.danger };
  if (job.assignment_status === 'pending') return { label: 'Awaiting accept', color: semantic.warning };
  if (job.assignment_status === 'declined') return { label: 'Declined', color: semantic.danger };
  if (num(job.bill_total) > 0 && String(job.payment_status || '').toLowerCase() !== 'paid') {
    return { label: `₹${Math.round(num(job.bill_total))} unpaid`, color: semantic.warning };
  }
  if (job.completed_at) return { label: 'Completed', color: semantic.success };
  if (job.started_at) return { label: 'In progress', color: brand.primary };
  return { label: 'Assigned', color: NEUTRAL };
}

// Admin's own view of every installation: assign it, push the status along,
// and mark the bill paid when the money lands — the same sheet the technician
// uses on site, so both sides see one history.
export default function AdminInstallationsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [rows, setRows] = useState<InstallationJob[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [filter, setFilter] = useState<Filter>('Open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchAllInstallations());
      setError(null);
    } catch {
      setError('Could not load installations — pull to retry');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    dataGet<EmployeeOption[]>('profiles', { eq: ['role:employee'], order: 'full_name:asc' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  const nameOf = (empId?: string | null) => employees.find((e) => e.id === empId)?.full_name || '';

  const filtered = useMemo(() => rows.filter((r) => {
    const paid = String(r.payment_status || '').toLowerCase() === 'paid';
    if (filter === 'Unassigned') return !r.assigned_employee_id;
    if (filter === 'Unpaid') return num(r.bill_total) > 0 && !paid;
    if (filter === 'Open') return !r.completed_at || (num(r.bill_total) > 0 && !paid);
    return true;
  }), [rows, filter]);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Installations" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(16), paddingBottom: spacing(8), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={semantic.success} />}
      >
        <View style={styles.pills}>
          {FILTERS.map((f) => (
            <Text
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.pill, {
                backgroundColor: filter === f ? brand.primary + '22' : theme.neuDark,
                color: filter === f ? brand.primary : theme.text3,
                borderColor: filter === f ? brand.primary : 'transparent',
              }]}
            >
              {f}
            </Text>
          ))}
        </View>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginBottom: spacing(3) }]}>{error}</Text> : null}

        {filtered.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>Nothing here right now.</Text>
        ) : (
          filtered.map((job) => {
            const tag = pill(job);
            return (
              <PressScale key={job.id} onPress={() => setOpenId(job.id)}>
                <GlassCard style={styles.card}>
                  <View style={styles.headerRow}>
                    <Text style={[styles.ticketNo, { color: brand.primary }]}>{job.ticket_no}</Text>
                    <View style={[styles.badge, { backgroundColor: `${tag.color}22` }]}>
                      <Text style={[styles.badgeText, { color: tag.color }]}>{tag.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.installType, { color: theme.text }]}>{job.installation_type}</Text>
                  <Text style={[styles.body, { color: theme.text2 }]}>{job.full_name}</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>{job.location}</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>
                    {job.preferred_date} · {job.preferred_time}
                    {nameOf(job.assigned_employee_id) ? ` · ${nameOf(job.assigned_employee_id)}` : ''}
                  </Text>
                </GlassCard>
              </PressScale>
            );
          })
        )}
      </ScrollView>

      {openId ? (
        <InstallationDetailSheet
          id={openId}
          isAdmin
          employees={employees}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pills: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(4), flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: spacing(3.5), paddingVertical: spacing(1.5), borderRadius: radius.sm, borderWidth: 1,
    fontFamily: 'Manrope_700Bold', fontSize: 12, overflow: 'hidden',
  },
  card: { marginBottom: spacing(3.5) },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
  badge: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.sm },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  installType: { ...typography.heading, fontSize: 15, marginBottom: spacing(1) },
  body: { ...typography.body },
  caption: { ...typography.caption },
});
