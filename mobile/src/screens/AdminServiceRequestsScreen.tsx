import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AdminFab from '../components/admin/AdminFab';
import AdminScreen from '../components/admin/AdminScreen';
import FilterChips from '../components/admin/FilterChips';
import SearchField from '../components/admin/SearchField';
import StatusBadge from '../components/admin/StatusBadge';
import EmptyNote from '../components/admin/EmptyNote';
import Icon from '../components/Icon';
import AdminServiceRequestDetailModal from '../components/AdminServiceRequestDetailModal';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchInquiries, AdminInquiryRow } from '../api/adminInquiries';

interface Props {
  onBack: () => void;
  /** Opens the "register a request for a customer" form. */
  onRegister?: () => void;
}

type FilterKey = 'active' | 'resolved' | 'issues' | 'reopened' | 'unpaid' | 'paid' | 'all';

const FILTER_LABEL: Record<FilterKey, string> = {
  active: 'Active',
  resolved: 'Resolved',
  issues: 'Issue Not Resolved',
  reopened: 'Reopened',
  unpaid: 'Awaiting Payment',
  paid: 'Paid',
  all: 'All',
};

function displayStatus(status: string): string {
  return status === 'closed' ? 'resolved' : status || 'open';
}

function matchesFilter(row: AdminInquiryRow, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return !['resolved', 'closed', 'issue_not_resolved'].includes(row.status);
  if (filter === 'resolved') return ['resolved', 'closed'].includes(row.status);
  if (filter === 'issues') return row.status === 'issue_not_resolved';
  if (filter === 'reopened') return Number(row.reopened) === 1;
  if (filter === 'unpaid') return !!row.bill_amount && row.payment_status !== 'paid';
  if (filter === 'paid') return row.payment_status === 'paid';
  return true;
}

// Design "List" template: status chips with counts, search, record cards, and
// a Register FAB. Tapping a card opens the request's detail sheet.
export default function AdminServiceRequestsScreen({ onBack, onRegister }: Props) {
  const { theme } = useTheme();
  const [rows, setRows] = useState<AdminInquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('active');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchInquiries();
      setRows(data);
      setError(null);
    } catch {
      setError('Could not load service requests — pull to retry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { active: 0, resolved: 0, issues: 0, reopened: 0, unpaid: 0, paid: 0, all: rows.length };
    rows.forEach((r) => {
      (Object.keys(c) as FilterKey[]).forEach((key) => {
        if (key !== 'all' && matchesFilter(r, key)) c[key]++;
      });
    });
    return c;
  }, [rows]);

  const filters: FilterKey[] = ['active', 'unpaid', ...(counts.reopened ? (['reopened'] as FilterKey[]) : []), 'issues', 'resolved', 'paid', 'all'];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const c = companyFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesFilter(r, filter)) return false;
      if (c && !(r.company_name || '').toLowerCase().includes(c)) return false;
      if (!q) return true;
      return (
        (r.full_name || '').toLowerCase().includes(q) ||
        (r.ticket_no || '').toLowerCase().includes(q) ||
        (r.service_item || '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search, companyFilter]);

  return (
    <View style={styles.root}>
      <AdminScreen
        title="Service Requests"
        subtitle={`${FILTER_LABEL[filter]} · ${filtered.length} of ${rows.length} requests`}
        onBack={onBack}
        onRefresh={load}
        loading={loading && rows.length === 0}
        error={rows.length === 0 ? error : null}
        toolbar={
          <>
            <FilterChips
              items={filters.map((f) => ({ key: f, label: FILTER_LABEL[f], count: counts[f] }))}
              activeKey={filter}
              onSelect={(k) => setFilter(k as FilterKey)}
            />
            <SearchField value={search} onChangeText={setSearch} placeholder="Search by name, ticket, or service…" />
          </>
        }
      >
        {error && rows.length > 0 ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}
        <SearchField value={companyFilter} onChangeText={setCompanyFilter} placeholder="Filter by company…" />
        <View style={styles.list}>
          {filtered.length === 0 ? (
            <EmptyNote text="No requests match this view." icon="report" />
          ) : (
            filtered.map((row) => {
              const statusStyle = statusColors[displayStatus(row.status)] || DEFAULT_STATUS_STYLE;
              const paid = row.payment_status === 'paid';
              const assigned = !!row.assigned_employee_id;
              return (
                <Pressable
                  key={row.id}
                  onPress={() => setSelectedId(row.id)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.card, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && styles.pressed]}
                >
                  <View style={styles.cardHead}>
                    <Text style={[styles.ticket, { color: theme.accent }]} numberOfLines={1}>{row.ticket_no || row.id.slice(0, 8)}</Text>
                    <StatusBadge label={statusStyle.label} color={statusStyle.color} />
                  </View>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{row.full_name}</Text>
                  {row.service_item ? (
                    <Text style={[styles.service, { color: theme.text2 }]} numberOfLines={1}>{row.service_item}</Text>
                  ) : null}
                  <View style={styles.meta}>
                    <View style={styles.metaItem}>
                      <Icon name="user" size={14} color={assigned ? theme.text2 : theme.warn} />
                      <Text style={[styles.metaText, { color: assigned ? theme.text2 : theme.warn }]}>{assigned ? 'Assigned' : 'Unassigned'}</Text>
                    </View>
                    {row.bill_amount ? (
                      <View style={styles.metaItem}>
                        <Icon name="wallet" size={14} color={paid ? theme.ok : theme.warn} />
                        <Text style={[styles.metaText, { color: paid ? theme.ok : theme.warn }]}>{paid ? 'Paid' : 'Unpaid'}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </AdminScreen>

      {onRegister ? <AdminFab label="Register" accessibilityLabel="Register request for a customer" onPress={onRegister} /> : null}

      {selectedId && (
        <AdminServiceRequestDetailModal
          inquiryId={selectedId}
          onDismiss={() => setSelectedId(null)}
          onSaved={() => {
            setSelectedId(null);
            load();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { ...typography.caption, marginBottom: spacing(3) },
  list: { marginTop: spacing(3), paddingBottom: spacing(16) },
  pressed: { opacity: 0.75 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5), marginBottom: spacing(2.5), gap: spacing(1.5) },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2) },
  ticket: { ...typography.monoId, flexShrink: 1 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16, lineHeight: 22 },
  service: { ...typography.supporting },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginTop: spacing(0.5) },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, lineHeight: 16 },
});
