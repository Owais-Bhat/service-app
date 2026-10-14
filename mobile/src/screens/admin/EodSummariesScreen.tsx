import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import EmptyNote from '../../components/admin/EmptyNote';
import Icon from '../../components/Icon';
import { fetchEodReports } from '../../api/adminOps';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';
import { shortDate } from '../../utils/format';
import { dayOf, RANGE_CHIPS, RangeKey, rangeStart, useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

// End-of-day reports from staff. Each card shows the first lines and expands on
// tap, so a long day does not push everyone else off the screen.
export default function EodSummariesScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const reports = useLoader(fetchEodReports, 'Could not load EOD reports');
  const [range, setRange] = useState<RangeKey>('week');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const visible = useMemo(() => {
    const from = rangeStart(range);
    const q = query.trim().toLowerCase();
    return (reports.data ?? [])
      .filter((r) => !from || dayOf(r.date) >= from)
      .filter((r) => !q || (r.profiles?.full_name || '').toLowerCase().includes(q) || (r.content || '').toLowerCase().includes(q));
  }, [reports.data, range, query]);

  return (
    <AdminScreen
      title="EOD Summaries"
      subtitle={`${visible.length} reports`}
      onBack={onBack}
      onRefresh={reports.reload}
      loading={reports.loading}
      error={reports.error}
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search staff or text" />
          <FilterChips items={RANGE_CHIPS} activeKey={range} onSelect={(k) => setRange(k as RangeKey)} />
        </>
      }
    >
      {visible.length === 0 ? <EmptyNote text="No end-of-day reports for this range" icon="report" /> : null}
      {visible.map((r) => {
        const expanded = open === r.id;
        return (
          <Pressable
            key={r.id}
            onPress={() => setOpen(expanded ? null : r.id)}
            style={({ pressed }) => [styles.card, { backgroundColor: theme.panel2, borderColor: theme.line }, pressed && styles.pressed]}
          >
            <View style={styles.head}>
              <View style={[styles.avatar, { backgroundColor: brand.primary + '22' }]}>
                <Text style={[styles.avatarText, { color: brand.primary }]}>{(r.profiles?.full_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.headText}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{r.profiles?.full_name || 'Staff'}</Text>
                <Text style={[styles.date, { color: theme.text3 }]}>{shortDate(r.date)}</Text>
              </View>
              <Icon name={expanded ? 'contract' : 'expand'} size={16} color={theme.text3} />
            </View>
            <Text style={[styles.body, { color: theme.text2 }]} numberOfLines={expanded ? undefined : 3}>{r.content}</Text>
          </Pressable>
        );
      })}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5), marginBottom: spacing(2.5), gap: spacing(2.5) },
  pressed: { opacity: 0.75 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  headText: { flex: 1, minWidth: 0 },
  name: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  date: { ...typography.caption, fontSize: 11 },
  body: { ...typography.body, fontSize: 14, lineHeight: 20 },
});
