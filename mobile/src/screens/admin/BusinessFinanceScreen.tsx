import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import Field from '../../components/admin/Field';
import { askFinanceAi, buildInsights, fetchFinanceSummary, FinanceSummary } from '../../api/adminFinance';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { inr, shortDate } from '../../utils/format';

interface Props {
  onBack: () => void;
}

type Preset = 'this-month' | 'last-month' | 'this-year' | 'all';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'this-year', label: 'This year' },
  { key: 'all', label: 'All time' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymd = (d: Date) => d.toLocaleDateString('en-CA');

function rangeOf(p: Preset): { from?: string; to?: string } {
  const now = new Date();
  if (p === 'this-month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  if (p === 'last-month') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (p === 'this-year') return { from: ymd(new Date(now.getFullYear(), 0, 1)), to: ymd(now) };
  return {};
}

const monthShort = (ym: string) => {
  const [y, m] = String(ym).split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]}${m === 1 ? ` '${String(y).slice(2)}` : ''}`;
};

// A thin horizontal bar: `value` as a share of `max`, with an optional
// second fill (received inside billed).
function Bar({ value, max, inner, color }: { value: number; max: number; inner?: number; color: string }) {
  const { theme } = useTheme();
  const w = Math.max(2, (value / Math.max(1, max)) * 100);
  const iw = value > 0 && inner != null ? Math.min(100, (inner / value) * 100) : 0;
  return (
    <View style={[styles.track, { backgroundColor: theme.line }]}>
      <View style={[styles.fill, { width: `${w}%`, backgroundColor: color + '55' }]}>
        {inner != null ? <View style={{ width: `${iw}%`, height: '100%', backgroundColor: color, borderRadius: radius.sm }} /> : null}
      </View>
    </View>
  );
}

// The business-health view: billed, received, pending, trends, who collected
// what, how old the unpaid money is, plus a Growth Advisor and an AI report.
export default function BusinessFinanceScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [preset, setPreset] = useState<Preset>('this-month');
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = rangeOf(preset);
      const d = await fetchFinanceSummary(r.from, r.to);
      if (mine !== seq.current) return;
      setData(d);
      setError(null);
    } catch (e: unknown) {
      if (mine === seq.current) setError(e instanceof Error && e.message ? e.message : 'Could not load the finance summary');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    setAnswer('');
    load();
  }, [load]);

  const ask = async (q: string | null) => {
    setAsking(true);
    try {
      const r = rangeOf(preset);
      const res = await askFinanceAi(r.from || null, r.to || null, q);
      setAnswer(res.answer || 'No answer came back.');
    } catch (e: unknown) {
      Alert.alert('AI report failed', e instanceof Error && e.message ? e.message : 'Try again');
    } finally {
      setAsking(false);
    }
  };

  const t = data?.totals;
  const delta = (cur: number, prev: number | undefined) => {
    if (prev == null || prev <= 0) return null;
    const g = ((cur - prev) / prev) * 100;
    return `${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(0)}% vs previous`;
  };
  const insights = data ? buildInsights(data) : [];
  const toneColor = { good: semantic.success, warn: semantic.warning, bad: semantic.danger } as const;
  const maxTrend = Math.max(1, ...(data?.trend.map((m) => m.billed) ?? [1]));
  const maxTech = Math.max(1, ...(data?.byTechnician.map((m) => m.billed) ?? [1]));
  const maxCat = Math.max(1, ...(data?.byCategory.map((m) => m.revenue) ?? [1]));
  const aging = data?.aging;
  const agingTotal = aging ? aging['0-7'] + aging['8-30'] + aging['31+'] : 0;

  return (
    <AdminScreen
      title="Finance"
      subtitle={data?.range.from ? `${shortDate(data.range.from)} to ${shortDate(data.range.to || '')}` : 'All time'}
      onBack={onBack}
      onRefresh={load}
      loading={loading && !data}
      error={error}
      toolbar={<FilterChips items={PRESETS} activeKey={preset} onSelect={(k) => setPreset(k as Preset)} />}
    >
      {data && t ? (
        <>
          <SectionLabel>Business health</SectionLabel>
          <StatGrid
            items={[
              { label: 'Total billed', value: inr(t.billed) },
              { label: 'Received', value: inr(t.received), color: semantic.success },
              { label: 'Pending', value: inr(t.pending), color: t.pending ? semantic.warning : undefined },
              { label: 'Collection rate', value: `${t.billed ? Math.round((t.received / t.billed) * 100) : 0}%` },
              { label: `Bills · ${t.paidCount} paid`, value: t.billsCount },
              { label: 'Average ticket', value: inr(t.avgTicket) },
              { label: 'GST collected', value: inr(t.gst) },
              { label: 'Discounts given', value: inr(t.discounts), color: t.discounts ? semantic.danger : undefined },
              { label: 'Cash not deposited', value: inr(t.cashInHand), color: t.cashInHand ? semantic.warning : undefined },
            ]}
          />
          {data.previous ? (
            <Text style={[styles.note, { color: theme.text3 }]}>
              Billed {delta(t.billed, data.previous.billed) || '—'} · received {delta(t.received, data.previous.received) || '—'} (previous {shortDate(data.previous.from)} to {shortDate(data.previous.to)})
            </Text>
          ) : null}

          <SectionLabel>Revenue trend — last 12 months</SectionLabel>
          {data.trend.length === 0 ? <EmptyNote text="No billed work in the last 12 months" icon="chart" /> : null}
          {data.trend.map((m) => (
            <View key={m.month} style={styles.rowBlock}>
              <View style={styles.rowTop}>
                <Text style={[styles.rowName, { color: theme.text }]}>{monthShort(m.month)}</Text>
                <Text style={[styles.rowVal, { color: theme.text2 }]}>
                  {inr(m.received)} of {inr(m.billed)}
                </Text>
              </View>
              <Bar value={m.billed} inner={m.received} max={maxTrend} color={brand.primary} />
            </View>
          ))}

          <SectionLabel>Receivables aging — how old is the pending money</SectionLabel>
          {aging && agingTotal > 0 ? (
            <>
              <Bar value={aging['0-7']} max={agingTotal} color={semantic.success} />
              <StatGrid
                items={[
                  { label: '0–7 days', value: inr(aging['0-7']), color: semantic.success },
                  { label: '8–30 days', value: inr(aging['8-30']), color: semantic.warning },
                  { label: '31+ days', value: inr(aging['31+']), color: aging['31+'] ? semantic.danger : undefined },
                ]}
              />
            </>
          ) : (
            <EmptyNote text="Nothing pending" icon="check-circle" />
          )}

          <SectionLabel>Payment method</SectionLabel>
          <StatGrid
            items={[
              { label: 'Cash', value: inr(data.byMethod.cash) },
              { label: 'Online', value: inr(data.byMethod.online) },
              ...(data.byMethod.unknown ? [{ label: 'Unspecified', value: inr(data.byMethod.unknown) }] : []),
            ]}
          />

          <SectionLabel>Revenue by category</SectionLabel>
          {data.byCategory.length === 0 ? <EmptyNote text="No category data in this period" icon="box" /> : null}
          {data.byCategory.map((c) => (
            <View key={c.category} style={styles.rowBlock}>
              <View style={styles.rowTop}>
                <Text style={[styles.rowName, { color: theme.text }]}>{c.category || 'Unspecified'}</Text>
                <Text style={[styles.rowVal, { color: theme.text2 }]}>
                  {inr(c.revenue)} · {c.items} item{c.items === 1 ? '' : 's'}
                </Text>
              </View>
              <Bar value={c.revenue} max={maxCat} color={semantic.info} />
            </View>
          ))}

          <SectionLabel>Technician performance — collected vs billed</SectionLabel>
          {data.byTechnician.length === 0 ? <EmptyNote text="No technician data in this period" icon="people" /> : null}
          {data.byTechnician.slice(0, 12).map((r) => (
            <View key={r.name} style={styles.rowBlock}>
              <View style={styles.rowTop}>
                <Text style={[styles.rowName, { color: theme.text }]}>
                  {r.name} · {r.jobs} job{r.jobs === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.rowVal, { color: theme.text2 }]}>
                  {inr(r.received)} of {inr(r.billed)}
                </Text>
              </View>
              <Bar value={r.billed} inner={r.received} max={maxTech} color={brand.primary} />
            </View>
          ))}

          {data.byCompany.length ? <SectionLabel>By company</SectionLabel> : null}
          {data.byCompany.slice(0, 10).map((c) => (
            <ListRow key={c.company} icon="people" title={c.company} subtitle={`Received ${inr(c.received)}`} value={inr(c.billed)} />
          ))}

          {data.gig.count > 0 ? (
            <>
              <SectionLabel>{`Gig worker pool — ${data.gig.count} job${data.gig.count === 1 ? '' : 's'}`}</SectionLabel>
              <StatGrid
                items={[
                  { label: 'Gig billed', value: inr(data.gig.billed) },
                  { label: 'Company keeps (GST + platform)', value: inr(data.gig.companyKeeps), color: semantic.success },
                  { label: 'Worker payouts', value: inr(data.gig.payout) },
                  { label: 'Awaiting payout', value: inr(data.gig.unpaidPayout), color: data.gig.unpaidPayout ? semantic.warning : undefined },
                ]}
              />
            </>
          ) : null}

          <SectionLabel>Job card activity — this month</SectionLabel>
          <StatGrid
            items={[
              { label: 'Jobs logged', value: data.jobCards.logged },
              { label: 'Awaiting verification', value: data.jobCards.awaitingVerification, color: data.jobCards.awaitingVerification ? semantic.warning : undefined },
              { label: 'Verified', value: data.jobCards.verified, color: semantic.success },
              { label: 'Monthly award', value: data.jobCards.award ? `₹${data.jobCards.award.amount} — ${data.jobCards.award.name}` : 'Not yet awarded' },
            ]}
          />

          <SectionLabel>Growth advisor — what to do next</SectionLabel>
          {insights.map((x) => (
            <ListRow key={x.title} icon={x.tone === 'good' ? 'check-circle' : 'alert'} iconColor={toneColor[x.tone]} title={x.title} subtitle={x.text} />
          ))}

          <SectionLabel>AI business report</SectionLabel>
          <ActionButton label="Generate report" busy={asking} onPress={() => ask(null)} />
          <Field label="Or ask a question about these numbers" value={question} onChangeText={setQuestion} placeholder="e.g. Why is pending money high?" />
          <ActionButton label="Ask" tone="neutral" busy={asking} onPress={() => ask(question.trim() || null)} />
          {answer ? (
            <Text selectable style={[styles.answer, { color: theme.text, backgroundColor: theme.panel2, borderColor: theme.line }]}>
              {answer.replace(/\*\*(.+?)\*\*/g, '$1')}
            </Text>
          ) : null}
        </>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.caption, marginVertical: spacing(2) },
  rowBlock: { marginBottom: spacing(3) },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1), gap: spacing(2) },
  rowName: { ...typography.body, fontWeight: '700', flexShrink: 1 },
  rowVal: { ...typography.caption },
  track: { height: 10, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm, overflow: 'hidden' },
  answer: { ...typography.body, lineHeight: 21, borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginTop: spacing(3) },
});
