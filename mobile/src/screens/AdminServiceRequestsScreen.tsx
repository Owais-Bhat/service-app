import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import AppHeaderBar from '../components/AppHeaderBar';
import Icon from '../components/Icon';
import PressScale from '../components/PressScale';
import AdminServiceRequestDetailModal from '../components/AdminServiceRequestDetailModal';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchInquiries, AdminInquiryRow } from '../api/adminInquiries';

interface Props {
  onBack: () => void;
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

export default function AdminServiceRequestsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [rows, setRows] = useState<AdminInquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('active');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { active: 0, resolved: 0, issues: 0, reopened: 0, unpaid: 0, paid: 0, all: rows.length };
    rows.forEach((r) => {
      (Object.keys(c) as FilterKey[]).forEach((key) => {
        if (key !== 'all' && matchesFilter(r, key)) c[key]++;
      });
    });
    return c;
  }, [rows]);

  const filters: FilterKey[] = ['active', 'resolved', 'issues', ...(counts.reopened ? (['reopened'] as FilterKey[]) : []), 'unpaid', 'paid', 'all'];

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

  const topInset = headerHeight > 0 ? headerHeight : insets.top + 100;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Service Requests" subtitle="Every customer request, filterable and assignable" onBack={onBack} onLayout={setHeaderHeight} />
      <ScrollView
        contentContainerStyle={{ paddingTop: topInset + spacing(4), paddingBottom: insets.bottom + spacing(10), paddingHorizontal: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        {error ? <Text style={[styles.caption, { color: semantic.danger, marginBottom: spacing(3) }]}>{error}</Text> : null}

        <View style={styles.filterRow}>
          {filters.map((f) => {
            const active = filter === f;
            return (
              <PressScale key={f} onPress={() => setFilter(f)}>
                <View style={[styles.filterPill, { backgroundColor: active ? brand.primary : theme.panel2, borderColor: active ? brand.primary : theme.line }]}>
                  <Text style={[styles.filterPillText, { color: active ? '#fff' : theme.text2 }]}>{FILTER_LABEL[f]}</Text>
                  <View style={[styles.filterCountBubble, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.panel2 }]}>
                    <Text style={[styles.filterCountText, { color: active ? '#fff' : theme.text3 }]}>{counts[f]}</Text>
                  </View>
                </View>
              </PressScale>
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
          {search.length > 0 ? (
            <PressScale onPress={() => setSearch('')}>
              <View style={[styles.clearBtn, { backgroundColor: theme.line }]}>
                <Icon name="close" size={11} color={theme.text3} />
              </View>
            </PressScale>
          ) : null}
        </View>

        <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.panel2, marginBottom: spacing(4) }]}>
          <Icon name="box" size={16} color={theme.text3} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Filter by company…"
            placeholderTextColor={theme.text3}
            value={companyFilter}
            onChangeText={setCompanyFilter}
          />
          {companyFilter.length > 0 ? (
            <PressScale onPress={() => setCompanyFilter('')}>
              <View style={[styles.clearBtn, { backgroundColor: theme.line }]}>
                <Icon name="close" size={11} color={theme.text3} />
              </View>
            </PressScale>
          ) : null}
        </View>

        {loading && rows.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={brand.primary} />
            <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(3) }]}>Loading service requests…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIconChip, { backgroundColor: `${brand.primary}1f` }]}>
              <Icon name="report" size={22} color={brand.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing here</Text>
            <Text style={[styles.caption, { color: theme.text3, textAlign: 'center' }]}>No requests match this view.</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.resultCount, { color: theme.text3 }]}>{filtered.length} of {rows.length} requests</Text>
            {filtered.map((row, idx) => {
              const statusStyle = statusColors[displayStatus(row.status)] || DEFAULT_STATUS_STYLE;
              const paid = row.payment_status === 'paid';
              return (
                <Animated.View key={row.id} entering={FadeInUp.delay(Math.min(idx, 8) * 60).duration(400)}>
                  <PressScale onPress={() => setSelectedId(row.id)}>
                    <View style={[styles.cardOuter, { shadowColor: statusStyle.color }]}>
                      <View style={[styles.accentBar, { backgroundColor: statusStyle.color }]} />
                      <GlassCard shadow style={styles.card}>
                        <View style={styles.rowHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.name, { color: theme.text }]}>{row.full_name}</Text>
                            <Text style={[styles.ticketNo, { color: theme.text3 }]}>{row.ticket_no || row.id.slice(0, 8)}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                          </View>
                        </View>
                        {row.service_item ? (
                          <Text style={[styles.serviceItem, { color: theme.text2 }]} numberOfLines={1}>{row.service_item}</Text>
                        ) : null}
                        <View style={styles.chipRow}>
                          <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                            <Icon name="user" size={11} color={theme.text3} />
                            <Text style={[styles.metaChipText, { color: theme.text2 }]}>
                              {row.assigned_employee_id ? 'Assigned' : 'Unassigned'}
                            </Text>
                          </View>
                          {row.bill_amount ? (
                            <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: paid ? `${semantic.success}18` : `${semantic.warning}18` }]}>
                              <Text style={[styles.metaChipText, { color: paid ? semantic.success : semantic.warning }]}>{paid ? 'Paid' : 'Unpaid'}</Text>
                            </View>
                          ) : null}
                        </View>
                      </GlassCard>
                    </View>
                  </PressScale>
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>

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
  caption: { ...typography.caption },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3), paddingVertical: spacing(1.75), borderRadius: radius.full, borderWidth: 1 },
  filterPillText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  filterCountBubble: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterCountText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 44, marginBottom: spacing(2.5) },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  clearBtn: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  loadingBox: { alignItems: 'center', paddingVertical: spacing(10) },
  emptyBox: { alignItems: 'center', paddingVertical: spacing(9), gap: spacing(1) },
  emptyIconChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) },
  emptyTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, marginBottom: spacing(0.5) },
  resultCount: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, marginBottom: spacing(2.5) },
  cardOuter: { flexDirection: 'row', marginBottom: spacing(3), shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 3 },
  accentBar: { width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  card: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(2), marginBottom: spacing(1.5) },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 11, marginTop: spacing(0.5) },
  statusBadge: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.full },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  serviceItem: { fontSize: 12.5, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing(2) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: radius.full, borderWidth: 1 },
  metaChipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
});
