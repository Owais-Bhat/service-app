import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import Field from '../../components/admin/Field';
import { fetchInstallationReport, fetchServiceReport, RequestReport } from '../../api/adminRequestReports';
import { shareCsv } from '../../utils/shareCsv';
import { spacing } from '../../theme';
import { semantic } from '../../theme/tokens';
import { inr, shortDate, todayIso } from '../../utils/format';

interface Props {
  onBack: () => void;
}

type Kind = 'service' | 'install';
type Preset = 'week' | 'month' | 'lastmonth' | 'custom';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d: Date) => d.toLocaleDateString('en-CA');

function rangeOf(p: Preset): { from: string; to: string } {
  const now = new Date();
  if (p === 'week') {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return { from: ymd(s), to: ymd(now) };
  }
  if (p === 'lastmonth') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
}

// Technician report and most-requested lists for service requests and for
// installations — the "Reports" tab of the web Service Requests / Installations pages.
export default function RequestReportsScreen({ onBack }: Props) {
  const [kind, setKind] = useState<Kind>('service');
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState(rangeOf('month').from);
  const [to, setTo] = useState(todayIso());
  const [report, setReport] = useState<RequestReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = rangeOf(p);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const load = useCallback(async () => {
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = kind === 'service' ? await fetchServiceReport(from, to) : await fetchInstallationReport(from, to);
      if (mine !== seq.current) return;
      setReport(r);
      setError(null);
    } catch (e: unknown) {
      if (mine === seq.current) setError(e instanceof Error && e.message ? e.message : 'Could not build the report');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [kind, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const techs = report?.techs ?? [];
  const sum = (k: 'total' | 'open' | 'done' | 'overdue' | 'billed' | 'pending' | 'upcoming') => techs.reduce((s, t) => s + t[k], 0);

  const exportCsv = async () => {
    if (techs.length === 0) return Alert.alert('Nothing to export', 'There is no data for this range.');
    await shareCsv(
      `${kind === 'service' ? 'service-requests' : 'installations'}-report-${from}-to-${to}.csv`,
      techs.map((t) =>
        kind === 'service'
          ? { Technician: t.name, Requests: t.total, Open: t.open, Completed: t.done, Overdue: t.overdue, Billed: Math.round(t.billed), 'Completion %': t.total ? Math.round((t.done / t.total) * 100) : 0 }
          : { Technician: t.name, Installations: t.total, Pending: t.pending, Upcoming: t.upcoming, Completed: t.done, 'Completion %': t.total ? Math.round((t.done / t.total) * 100) : 0 },
      ),
    );
  };

  return (
    <AdminScreen
      title="Request Reports"
      subtitle={`${shortDate(from)} to ${shortDate(to)}`}
      onBack={onBack}
      onRefresh={load}
      loading={loading && !report}
      error={error}
      toolbar={
        <View>
          <FilterChips
            items={[
              { key: 'service', label: 'Service requests' },
              { key: 'install', label: 'Installations' },
            ]}
            activeKey={kind}
            onSelect={(k) => setKind(k as Kind)}
          />
          <FilterChips items={PRESETS} activeKey={preset} onSelect={(k) => choose(k as Preset)} />
          {preset === 'custom' ? (
            <View style={styles.dates}>
              <View style={styles.cell}>
                <Field label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
              </View>
              <View style={styles.cell}>
                <Field label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
              </View>
            </View>
          ) : null}
        </View>
      }
    >
      {report ? (
        <>
          <StatGrid
            items={
              kind === 'service'
                ? [
                    { label: 'Requests', value: report.total },
                    { label: 'Open', value: sum('open'), color: semantic.warning },
                    { label: 'Completed', value: sum('done'), color: semantic.success },
                    { label: 'Overdue', value: sum('overdue'), color: sum('overdue') ? semantic.danger : undefined },
                  ]
                : [
                    { label: 'Installations', value: report.total },
                    { label: 'Pending', value: sum('pending'), color: semantic.warning },
                    { label: 'Upcoming', value: sum('upcoming') },
                    { label: 'Completed', value: sum('done'), color: semantic.success },
                  ]
            }
          />
          <ActionButton label="Export report" tone="neutral" onPress={exportCsv} />

          <SectionLabel>Technician report</SectionLabel>
          {techs.length === 0 ? <EmptyNote text="Nothing to report for this range" icon="chart" /> : null}
          {techs.map((t) => {
            const rate = t.total ? Math.round((t.done / t.total) * 100) : 0;
            return (
              <ListRow
                key={t.id}
                icon="user"
                title={t.name}
                subtitle={
                  kind === 'service'
                    ? `${t.total} requests · open ${t.open} · completed ${t.done} · overdue ${t.overdue}`
                    : `${t.total} installations · pending ${t.pending} · upcoming ${t.upcoming} · completed ${t.done}`
                }
                meta={kind === 'service' ? `Billed ${inr(t.billed)}` : undefined}
                value={`${rate}%`}
                valueColor={rate >= 80 ? semantic.success : rate >= 50 ? semantic.warning : semantic.danger}
              />
            );
          })}

          <SectionLabel>{kind === 'service' ? 'Most requested services' : 'Most booked installation types'}</SectionLabel>
          {report.top.length === 0 ? <EmptyNote text="No data" icon="list" /> : null}
          {report.top.map((x) => (
            <ListRow key={x.name} icon="list" title={x.name} subtitle={`${x.share}% of ${report.total}`} value={`${x.count}`} />
          ))}
        </>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  dates: { flexDirection: 'row', gap: spacing(3), paddingHorizontal: spacing(4) },
  cell: { flex: 1 },
});
