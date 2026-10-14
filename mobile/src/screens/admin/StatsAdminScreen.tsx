import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import { dataGet } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { inr, todayIso } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';
import {
  categories,
  collection,
  monthRevenue,
  operations,
  pipeline,
  RangeKey,
  StatInquiry,
  technicians,
  trend,
  withinRange,
  isOpen,
  isUnpaid,
  amountOf,
} from '../../utils/adminStats';
import { calculateSlaDeadline } from '../../api/adminInquiries';

interface Props {
  onBack: () => void;
}

interface Profile {
  id: string;
  full_name: string | null;
  role: string | null;
}

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

// The owner's live operations overview: today's counters, what needs attention,
// money, the pipeline, technician performance, categories and the trend.
export default function StatsAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(async () => {
    const today = todayIso();
    const [inquiries, profiles, attendance, eod, complaints] = await Promise.all([
      dataGet<StatInquiry[]>('inquiries', { select: '*', order: 'created_at:desc', limit: '6000' }),
      dataGet<Profile[]>('profiles', { select: 'id,full_name,role' }),
      dataGet<{ user_id: string }[]>('attendance', { select: 'user_id', eq: `date:${today}` }),
      dataGet<{ employee_id: string }[]>('eod_reports', { select: 'employee_id', eq: `date:${today}` }),
      dataGet<{ status: string | null }[]>('complaints', { select: 'status' }),
    ]);
    return { inquiries, profiles, attendance, eod, complaints };
  }, 'Could not load stats');
  const [range, setRange] = useState<RangeKey>('today');
  const [days, setDays] = useState(7);

  const all = data.data?.inquiries ?? [];
  const view = useMemo(() => {
    if (!data.data) return null;
    const open = all.filter(isOpen);
    const unassigned = open.filter((r) => !r.assigned_employee_id);
    const overdue = open.filter((r) => r.assigned_at && new Date() > calculateSlaDeadline(r.assigned_at));
    const unpaid = all.filter(isUnpaid);
    const attended = new Set(data.data.attendance.map((a) => a.user_id));
    const eodDone = new Set(data.data.eod.map((e) => e.employee_id));
    return {
      ops: operations(all, range),
      unassigned: unassigned.length,
      overdue: overdue.length,
      unpaid: unpaid.length,
      unpaidTotal: unpaid.reduce((s, r) => s + amountOf(r), 0),
      eodPending: [...attended].filter((id) => id && !eodDone.has(id)).length,
      complaints: data.data.complaints.filter((c) => !['resolved', 'closed'].includes((c.status || 'open').toLowerCase())).length,
      pipe: pipeline(all),
      coll: collection(all),
      month: monthRevenue(all),
      techs: technicians(all, data.data.profiles),
      cats: categories(withinRange(all, range)),
      series: trend(all, days),
    };
  }, [data.data, all, range, days]);

  const W = 300;
  const H = 90;
  const max = Math.max(1, ...(view?.series.map((b) => b.n) ?? [1]));
  const pts = (view?.series ?? []).map((b, i, arr) => [arr.length === 1 ? W / 2 : (i / (arr.length - 1)) * W, H - (b.n / max) * (H - 12) - 6]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = pts.length ? `${line} L${W},${H} L0,${H} Z` : '';

  return (
    <AdminScreen
      title="Stats"
      subtitle="Live operations overview"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      toolbar={<FilterChips items={RANGES} activeKey={range} onSelect={(k) => setRange(k as RangeKey)} />}
    >
      {view ? (
        <>
          <SectionLabel>Operations</SectionLabel>
          <StatGrid
            items={[
              { label: 'New requests', value: view.ops.newCount, color: semantic.info },
              { label: 'Pending assignment', value: view.ops.pendingAssign, color: view.ops.pendingAssign ? semantic.warning : undefined },
              { label: 'In progress', value: view.ops.inProgress, color: '#7c5cfc' },
              { label: 'Resolved today', value: view.ops.resolvedToday, color: semantic.success },
              { label: 'Overdue (SLA)', value: view.ops.overdue, color: view.ops.overdue ? semantic.danger : undefined },
            ]}
          />

          <SectionLabel>Attention required</SectionLabel>
          <ListRow icon="alert" iconColor={view.unassigned ? semantic.danger : semantic.success} title="Unassigned requests" value={String(view.unassigned)} />
          <ListRow icon="clock" iconColor={view.overdue ? semantic.danger : semantic.success} title="Overdue requests" subtitle="Beyond the 12-hour working SLA" value={String(view.overdue)} />
          <ListRow icon="receipt" iconColor={view.unpaid ? semantic.warning : semantic.success} title="Unpaid bills" subtitle={`${inr(view.unpaidTotal)} pending`} value={String(view.unpaid)} />
          <ListRow icon="report" iconColor={view.eodPending ? semantic.warning : semantic.success} title="EOD pending" subtitle="Technicians who clocked in" value={String(view.eodPending)} />
          <ListRow icon="shield" iconColor={view.complaints ? semantic.danger : semantic.success} title="Open complaints" value={String(view.complaints)} />

          <SectionLabel>Collection today</SectionLabel>
          <StatGrid
            items={[
              { label: "Today's billing", value: inr(view.coll.billedToday) },
              { label: 'Collected today', value: inr(view.coll.collectedToday), color: semantic.success },
              { label: 'Pending collection', value: inr(view.coll.pending), color: semantic.warning },
              { label: 'Unpaid bills', value: view.coll.unpaidCount, color: semantic.danger },
            ]}
          />

          <SectionLabel>Service pipeline</SectionLabel>
          <View style={styles.pipe}>
            {view.pipe.map((p) => (
              <View key={p.label} style={[styles.pipeCell, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                <Text style={[styles.pipeValue, { color: theme.text }]}>{p.n}</Text>
                <Text style={[styles.pipeLabel, { color: theme.text3 }]} numberOfLines={1}>{p.label}</Text>
              </View>
            ))}
          </View>

          <SectionLabel>Technician performance</SectionLabel>
          {view.techs.length === 0 ? <EmptyNote text="No technician activity yet" icon="people" /> : null}
          {view.techs.map((t) => (
            <ListRow
              key={t.id}
              icon="user"
              title={t.name}
              subtitle={`${t.active} active · ${t.completed} completed · ${t.pending} awaiting update`}
              badge={
                t.onTime == null
                  ? undefined
                  : { label: `${t.onTime}% on time`, color: t.onTime >= 90 ? semantic.success : t.onTime >= 75 ? semantic.warning : semantic.danger }
              }
            />
          ))}

          <SectionLabel>Service categories</SectionLabel>
          {view.cats.length === 0 ? <EmptyNote text="No requests in this range" icon="box" /> : null}
          {view.cats.map((c) => (
            <View key={c.key} style={styles.catRow}>
              <Text style={[styles.catName, { color: theme.text }]}>{c.key}</Text>
              <View style={[styles.catTrack, { backgroundColor: theme.line }]}>
                <View style={[styles.catFill, { width: `${c.pct}%`, backgroundColor: brand.primary }]} />
              </View>
              <Text style={[styles.catN, { color: theme.text2 }]}>{c.n} · {c.pct}%</Text>
            </View>
          ))}

          <SectionLabel>Requests trend</SectionLabel>
          <FilterChips
            items={[{ key: '7', label: '7 days' }, { key: '30', label: '30 days' }, { key: '90', label: '90 days' }]}
            activeKey={String(days)}
            onSelect={(k) => setDays(Number(k))}
          />
          <View style={[styles.chart, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
            <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={brand.primary} stopOpacity="0.3" />
                  <Stop offset="1" stopColor={brand.primary} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              {area ? <Path d={area} fill="url(#trendFill)" /> : null}
              {line ? <Path d={line} fill="none" stroke={brand.primary} strokeWidth={2} /> : null}
            </Svg>
            <View style={styles.chartFoot}>
              <Text style={[styles.chartNote, { color: theme.text2 }]}>
                <Text style={{ fontFamily: 'Manrope_700Bold' }}>{view.series.reduce((s, b) => s + b.n, 0)}</Text> requests in {days} days
              </Text>
              <Text style={[styles.chartNote, { color: theme.text2 }]}>Peak {max} in a day</Text>
            </View>
          </View>

          <SectionLabel>Revenue this month</SectionLabel>
          <StatGrid
            items={[
              { label: 'Total billed', value: inr(view.month.billedToday) },
              { label: 'Collected', value: inr(view.month.collectedToday), color: semantic.success },
              { label: 'Pending', value: inr(view.month.pending), color: semantic.warning },
              { label: 'Unpaid bills', value: view.month.unpaidCount, color: semantic.danger },
            ]}
          />
        </>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  pipe: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  pipeCell: { flexBasis: '30%', flexGrow: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing(3), alignItems: 'center' },
  pipeValue: { ...typography.heading, fontSize: 20 },
  pipeLabel: { ...typography.caption, fontSize: 11 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(1.5) },
  catName: { ...typography.caption, width: 104, fontSize: 12 },
  catTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  catFill: { height: 8, borderRadius: 4 },
  catN: { ...typography.caption, fontSize: 11, width: 66, textAlign: 'right' },
  chart: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginTop: spacing(3) },
  chartFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(2) },
  chartNote: { ...typography.caption, fontSize: 12 },
});
