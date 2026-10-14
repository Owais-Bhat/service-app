import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import ExportButton from '../../components/admin/ExportButton';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import { amounts, BillLine, CollectionRow, fetchBillLines, fetchCollections, paidDay } from '../../api/adminCollections';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';
import { semantic } from '../../theme/tokens';
import { inr, shortDate, todayIso } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'all';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: 'This week' },
  { key: 'monthly', label: 'This month' },
  { key: 'yearly', label: 'This year' },
  { key: 'custom', label: 'Custom' },
  { key: 'all', label: 'All time' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rangeFor(period: Period): { from: string; to: string } {
  const now = new Date();
  const end = todayIso();
  const start = new Date(now);
  if (period === 'daily') return { from: end, to: end };
  if (period === 'weekly') start.setDate(now.getDate() - 6);
  else if (period === 'monthly') start.setMonth(now.getMonth(), 1);
  else if (period === 'yearly') start.setMonth(0, 1);
  else return { from: '', to: '' };
  return { from: start.toLocaleDateString('en-CA'), to: end };
}

const sum = (rows: CollectionRow[]) =>
  rows.reduce(
    (a, r) => {
      const m = amounts(r);
      a.service += m.service;
      a.travel += m.travel;
      a.platform += m.platform;
      a.gst += m.gst;
      a.discount += m.discount;
      a.net += m.net;
      a.count += 1;
      return a;
    },
    { service: 0, travel: 0, platform: 0, gst: 0, discount: 0, net: 0, count: 0 },
  );

// Collection Reports: what was actually paid, by employee and by ticket, with
// the service / travel / platform / GST / discount split and the gig pool.
export default function CollectionsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(fetchCollections, 'Could not load collections');
  const [period, setPeriod] = useState<Period>('monthly');
  const [employee, setEmployee] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<CollectionRow | null>(null);
  const [lines, setLines] = useState<BillLine[] | null>(null);

  const d = data.data;
  const names = useMemo(() => new Map((d?.employees || []).map((e) => [e.id, e.full_name || e.phone || 'Employee'])), [d]);

  const range = useMemo(() => {
    if (period !== 'custom') return rangeFor(period);
    return { from: DATE_RE.test(from) ? from : '', to: DATE_RE.test(to) ? to : '' };
  }, [period, from, to]);

  const inRange = useMemo(
    () => (r: CollectionRow) => {
      const day = paidDay(r);
      if (range.from && day && day < range.from) return false;
      if (range.to && day && day > range.to) return false;
      return true;
    },
    [range],
  );

  const visible = useMemo(
    () => (d?.paid || []).filter((r) => inRange(r) && (employee === 'all' || r.assigned_employee_id === employee)),
    [d, inRange, employee],
  );
  const totals = useMemo(() => sum(visible), [visible]);

  const byEmployee = useMemo(() => {
    const groups = new Map<string, CollectionRow[]>();
    visible.forEach((r) => {
      const id = r.assigned_employee_id || 'unassigned';
      groups.set(id, [...(groups.get(id) || []), r]);
    });
    return [...groups.entries()].map(([id, list]) => ({ id, name: names.get(id) || 'Unassigned', ...sum(list) })).sort((a, b) => b.net - a.net);
  }, [visible, names]);

  const gig = useMemo(() => {
    const rows = (d?.gig || []).filter(inRange);
    const payout = rows.reduce((n, r) => n + (Number(r.gig_payout_amount) || 0), 0);
    const net = rows.reduce((n, r) => n + (Number(r.bill_total) || 0), 0);
    const workers = new Map<string, { count: number; payout: number; net: number }>();
    rows.forEach((r) => {
      const id = r.claimed_by_gig_worker_id || r.assigned_employee_id || 'unknown';
      const g = workers.get(id) || { count: 0, payout: 0, net: 0 };
      g.count += 1;
      g.payout += Number(r.gig_payout_amount) || 0;
      g.net += Number(r.bill_total) || 0;
      workers.set(id, g);
    });
    return {
      rows,
      payout,
      net,
      unpaid: rows.filter((r) => r.payment_status !== 'paid').length,
      workers: [...workers.entries()].map(([id, g]) => ({ id, name: names.get(id) || 'Gig worker', ...g })).sort((a, b) => b.payout - a.payout),
    };
  }, [d, inRange, names]);

  const openBill = (r: CollectionRow) => {
    setOpen(r);
    setLines(null);
    fetchBillLines(r.id)
      .then(setLines)
      .catch(() => setLines([]));
  };
  const m = open ? amounts(open) : null;

  const employeeChips = [{ key: 'all', label: 'All employees' }, ...(d?.employees || []).map((e) => ({ key: e.id, label: e.full_name || e.phone || 'Employee' }))];

  return (
    <AdminScreen
      title="Collection Reports"
      subtitle={range.from ? `${shortDate(range.from)} to ${shortDate(range.to || todayIso())}` : 'All time'}
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      toolbar={
        <View>
          <FilterChips items={PERIODS} activeKey={period} onSelect={(k) => setPeriod(k as Period)} />
          <FilterChips items={employeeChips} activeKey={employee} onSelect={setEmployee} />
          {period === 'custom' ? (
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
      {d ? (
        <>
          <StatGrid
            items={[
              { label: `Service · ${totals.count} ticket${totals.count === 1 ? '' : 's'}`, value: inr(totals.service) },
              { label: 'Travel', value: inr(totals.travel) },
              { label: 'Platform fee', value: inr(totals.platform) },
              { label: 'GST', value: inr(totals.gst) },
              { label: 'Discount given', value: inr(totals.discount), color: totals.discount ? semantic.danger : undefined },
              { label: 'Net collected', value: inr(totals.net), color: semantic.success },
            ]}
          />

          {gig.rows.length > 0 ? (
            <>
              <SectionLabel>{`Gig pool earnings${gig.unpaid ? ` · ${gig.unpaid} unpaid` : ''}`}</SectionLabel>
              <StatGrid
                items={[
                  { label: `Gig jobs billed · ${gig.rows.length}`, value: inr(gig.net) },
                  { label: 'Company keeps', value: inr(gig.net - gig.payout) },
                  { label: 'Gig worker payouts', value: inr(gig.payout), color: semantic.warning },
                ]}
              />
              {gig.workers.map((g) => (
                <ListRow key={g.id} icon="user" title={g.name} subtitle={`${g.count} job${g.count === 1 ? '' : 's'} · collected ${inr(g.net)}`} value={inr(g.payout)} />
              ))}
            </>
          ) : null}

          <SectionLabel>By employee</SectionLabel>
          {byEmployee.length === 0 ? <EmptyNote text="No collections found" icon="wallet" /> : null}
          {byEmployee.map((e) => (
            <ListRow
              key={e.id}
              icon="user"
              title={e.name}
              subtitle={`Service ${inr(e.service)} · travel ${inr(e.travel)} · platform ${inr(e.platform)} · GST ${inr(e.gst)}`}
              meta={`${e.count} ticket${e.count === 1 ? '' : 's'}${e.discount ? ` · discount −${inr(e.discount)}` : ''}`}
              value={inr(e.net)}
              onPress={e.id === 'unassigned' ? undefined : () => setEmployee(e.id)}
            />
          ))}

          <ExportButton
            name="collection-report.csv"
            rows={visible.map((r) => {
              const a = amounts(r);
              return { Date: paidDay(r), Ticket: r.ticket_no, Customer: r.full_name, Employee: r.assigned_employee_id ? names.get(r.assigned_employee_id) : '', Service: a.service, Travel: a.travel, Platform: a.platform, GST: a.gst, Discount: a.discount, Net: a.net, Method: r.payment_method === 'cash' ? 'cash' : 'online' };
            })}
          />
          <SectionLabel>Tickets</SectionLabel>
          {visible.map((r) => {
            const a = amounts(r);
            return (
              <ListRow
                key={r.id}
                icon="receipt"
                title={`${r.ticket_no || '—'} · ${r.full_name || 'Client'}`}
                subtitle={`${r.service_item || ''}${r.assigned_employee_id ? ` · ${names.get(r.assigned_employee_id) || 'Employee'}` : ''}`}
                meta={`${paidDay(r) ? shortDate(paidDay(r)) : '—'} · ${r.payment_method === 'cash' ? 'Cash' : 'Online'}${a.discount ? ` · discount −${inr(a.discount)}` : ''}`}
                value={inr(a.net)}
                onPress={() => openBill(r)}
              />
            );
          })}
        </>
      ) : null}

      <FormSheet visible={!!open} title={`Bill ${open?.ticket_no || ''}`} subtitle={open?.full_name || undefined} onClose={() => setOpen(null)}>
        {open && m ? (
          <View>
            <Text style={[styles.sub, { color: theme.text3 }]}>
              {open.service_item || ''}
              {paidDay(open) ? ` · ${shortDate(paidDay(open))}` : ''}
            </Text>
            <SectionLabel>Services</SectionLabel>
            {lines === null ? <Text style={[styles.sub, { color: theme.text3 }]}>Loading…</Text> : null}
            {lines && lines.length === 0 ? <ListRow title="Service charge" value={inr(Math.max(0, m.service - m.extra))} /> : null}
            {(lines || []).map((l, i) => (
              <ListRow key={`${l.name}-${i}`} title={l.name} value={inr(l.cost)} />
            ))}
            {m.extra > 0 ? <ListRow title={`Additional charges${open.extra_cost_reason ? ` (${open.extra_cost_reason})` : ''}`} value={inr(m.extra)} /> : null}
            {m.platform > 0 ? <ListRow title="Platform fee" value={inr(m.platform)} /> : null}
            <ListRow title="Travel" value={inr(m.travel)} />
            {m.discount > 0 ? <ListRow title="Discount given (your profit cut)" value={`−${inr(m.discount)}`} valueColor={semantic.danger} /> : null}
            <ListRow title="Taxable" value={inr(m.taxable)} />
            {m.gst > 0 ? <ListRow title={`GST${m.gstRate ? ` (${m.gstRate}%)` : ''}`} value={inr(m.gst)} /> : null}
            <ListRow title="Net collected" value={inr(m.net)} valueColor={semantic.success} subtitle={open.payment_method === 'cash' ? 'Paid in cash' : 'Paid online'} />
          </View>
        ) : null}
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  dates: { flexDirection: 'row', gap: spacing(3), paddingHorizontal: spacing(4) },
  cell: { flex: 1 },
  sub: { ...typography.caption, marginBottom: spacing(2) },
});
