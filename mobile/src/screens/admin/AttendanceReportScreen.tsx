import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import Field from '../../components/admin/Field';
import { AttendanceReport, fetchAttendanceReport } from '../../api/adminAttendanceReport';
import { shareCsv } from '../../utils/shareCsv';
import { spacing } from '../../theme';
import { semantic } from '../../theme/tokens';
import { shortDate, todayIso } from '../../utils/format';

interface Props {
  onBack: () => void;
}

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

const hoursText = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

// Attendance Report: who was present, absent, late or missed their EOD over a
// date range, with hours and attendance percentage per employee.
export default function AttendanceReportScreen({ onBack }: Props) {
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState(rangeOf('month').from);
  const [to, setTo] = useState(todayIso());
  const [report, setReport] = useState<AttendanceReport | null>(null);
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
      const r = await fetchAttendanceReport(from, to);
      if (mine !== seq.current) return;
      setReport(r);
      setError(null);
    } catch (e: unknown) {
      if (mine === seq.current) setError(e instanceof Error && e.message ? e.message : 'Could not build the report');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = report?.rows ?? [];
  const totals = rows.reduce(
    (a, r) => ({ present: a.present + r.present, absent: a.absent + r.absent, late: a.late + r.late, missing: a.missing + r.missingEod }),
    { present: 0, absent: 0, late: 0, missing: 0 },
  );

  const exportCsv = async () => {
    if (!report || rows.length === 0) return Alert.alert('Nothing to export', 'There is no data for this range.');
    await shareCsv(
      `attendance-report-${report.from}-to-${report.to}.csv`,
      rows.map((r) => ({
        Employee: r.name,
        Type: r.worker,
        Present: r.present,
        Absent: r.absent,
        Late: r.late,
        'Missing EOD': r.missingEod,
        'Total hours': hoursText(r.hours),
        'Avg per day': hoursText(r.avg),
        'Attendance %': r.pct,
      })),
    );
  };

  return (
    <AdminScreen
      title="Attendance Report"
      subtitle={report ? `${shortDate(report.from)} to ${shortDate(report.to)} · ${report.workingDays} working days` : undefined}
      onBack={onBack}
      onRefresh={load}
      loading={loading && !report}
      error={error}
      toolbar={
        <View>
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
            items={[
              { label: 'Present (days)', value: totals.present, color: semantic.success },
              { label: 'Absent (days)', value: totals.absent, color: totals.absent ? semantic.danger : undefined },
              { label: 'Late', value: totals.late, color: totals.late ? semantic.warning : undefined },
              { label: 'Missing EOD', value: totals.missing, color: totals.missing ? semantic.warning : undefined },
            ]}
          />
          <ActionButton label="Export report" tone="neutral" onPress={exportCsv} />
          {rows.length === 0 ? <EmptyNote text="Nothing to report for this range" icon="clock" /> : null}
          {rows.map((r) => (
            <ListRow
              key={r.id}
              icon="user"
              title={r.name}
              subtitle={`${r.worker} · present ${r.present} · absent ${r.absent} · late ${r.late} · no EOD ${r.missingEod}`}
              meta={`${hoursText(r.hours)} total · ${hoursText(r.avg)} per day`}
              value={`${r.pct}%`}
              valueColor={r.pct >= 90 ? semantic.success : r.pct >= 70 ? semantic.warning : semantic.danger}
            />
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
