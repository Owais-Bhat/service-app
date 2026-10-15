import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import StatGrid from '../../components/admin/StatGrid';
import { Overline, ReportHero, ReportRow, ReportTable } from '../../components/admin/FinanceKit';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import ExportButton from '../../components/admin/ExportButton';
import FilterChips from '../../components/admin/FilterChips';
import SearchField from '../../components/admin/SearchField';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import { fetchOwnerSummary, OwnerSummary, rupees } from '../../api/adminBooks';
import { Account, fetchAccounts } from '../../api/adminLedger';
import {
  AccountLedger,
  Ageing,
  BalanceSheet,
  fetchAccountLedger,
  fetchAgeing,
  fetchBalanceSheet,
  fetchGstHsn,
  fetchGstPurchases,
  fetchGstSales,
  fetchGstSummary,
  fetchJobProfit,
  fetchPartyOptions,
  fetchPartyStatement,
  fetchProfitLoss,
  fetchReconciliation,
  fetchReminders,
  fetchStockValuation,
  GstPurchaseRow,
  GstSalesRow,
  GstSummary,
  HsnRow,
  JobProfit,
  LedgerRow,
  markReminded,
  PartyOption,
  PartyStatement,
  ProfitLoss,
  Reconciliation,
  Reminders,
  sendPaymentReminder,
  StockValuation,
} from '../../api/adminReports';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';
import { inr, shortDate, timeAgo, todayIso } from '../../utils/format';

interface Props {
  onBack: () => void;
}

type Tab = 'summary' | 'reminders' | 'pnl' | 'balance' | 'ageing' | 'ledger' | 'statement' | 'gst' | 'stock' | 'jobs' | 'health';
type GstTab = 'summary' | 'sales' | 'hsn' | 'purchases';

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'pnl', label: 'Profit & Loss' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'ageing', label: 'Who Owes' },
  { key: 'ledger', label: 'Account Ledger' },
  { key: 'statement', label: 'Party Statement' },
  { key: 'gst', label: 'GST' },
  { key: 'stock', label: 'Stock Value' },
  { key: 'jobs', label: 'Job Margins' },
  { key: 'health', label: 'Health Check' },
];
const GST_TABS: { key: GstTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'sales', label: 'Sales' },
  { key: 'hsn', label: 'HSN' },
  { key: 'purchases', label: 'Purchases' },
];

const RANGE_TABS: Tab[] = ['pnl', 'ledger', 'statement', 'gst', 'jobs'];
const AS_ON_TABS: Tab[] = ['reminders', 'balance', 'ageing', 'health'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const money = (p: number) => inr(rupees(p));
const monthStart = () => `${todayIso().slice(0, 8)}01`;

type Payload =
  | { kind: 'summary'; v: OwnerSummary }
  | { kind: 'reminders'; v: Reminders }
  | { kind: 'pnl'; v: ProfitLoss }
  | { kind: 'balance'; v: BalanceSheet }
  | { kind: 'ageing'; v: Ageing }
  | { kind: 'ledger'; v: AccountLedger }
  | { kind: 'statement'; v: PartyStatement }
  | { kind: 'gst-summary'; v: GstSummary }
  | { kind: 'gst-sales'; v: GstSalesRow[] }
  | { kind: 'gst-hsn'; v: { rows: HsnRow[]; note: string } }
  | { kind: 'gst-purchases'; v: GstPurchaseRow[] }
  | { kind: 'stock'; v: StockValuation }
  | { kind: 'jobs'; v: JobProfit }
  | { kind: 'health'; v: Reconciliation };

// The books read back: owner summary, reminders, P&L, balance sheet, ageing,
// account ledger, party statement, GST, stock value, job margins and the
// health check — the same reports the web Financial Reports page offers.
export default function FinReportsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('summary');
  const [gstTab, setGstTab] = useState<GstTab>('summary');
  const [kind, setKind] = useState<'receivable' | 'payable'>('receivable');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [asOn, setAsOn] = useState(todayIso());
  const [account, setAccount] = useState<Account | null>(null);
  const [party, setParty] = useState<PartyOption | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [picker, setPicker] = useState<'account' | 'party' | null>(null);
  const [pickQ, setPickQ] = useState('');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  const rangeOk = DATE_RE.test(from) && DATE_RE.test(to);
  const asOnOk = DATE_RE.test(asOn);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      let next: Payload | null = null;
      if (tab === 'summary') next = { kind: 'summary', v: await fetchOwnerSummary() };
      else if (tab === 'stock') next = { kind: 'stock', v: await fetchStockValuation() };
      else if (AS_ON_TABS.includes(tab) && !asOnOk) next = null;
      else if (RANGE_TABS.includes(tab) && !rangeOk) next = null;
      else if (tab === 'reminders') next = { kind: 'reminders', v: await fetchReminders(asOn) };
      else if (tab === 'balance') next = { kind: 'balance', v: await fetchBalanceSheet(asOn) };
      else if (tab === 'ageing') next = { kind: 'ageing', v: await fetchAgeing(kind, asOn) };
      else if (tab === 'health') next = { kind: 'health', v: await fetchReconciliation(asOn) };
      else if (tab === 'pnl') next = { kind: 'pnl', v: await fetchProfitLoss(from, to) };
      else if (tab === 'jobs') next = { kind: 'jobs', v: await fetchJobProfit(from, to) };
      else if (tab === 'ledger') {
        if (account) next = { kind: 'ledger', v: await fetchAccountLedger(account.code, from, to) };
      } else if (tab === 'statement') {
        if (party) next = { kind: 'statement', v: await fetchPartyStatement(party.id, from, to) };
      } else if (tab === 'gst') {
        if (gstTab === 'summary') next = { kind: 'gst-summary', v: await fetchGstSummary(from, to) };
        else if (gstTab === 'sales') next = { kind: 'gst-sales', v: await fetchGstSales(from, to) };
        else if (gstTab === 'hsn') next = { kind: 'gst-hsn', v: await fetchGstHsn(from, to) };
        else next = { kind: 'gst-purchases', v: await fetchGstPurchases(from, to) };
      }
      if (mine !== seq.current) return;
      setPayload(next);
      setError(null);
    } catch (e: unknown) {
      if (mine !== seq.current) return;
      const msg = e instanceof Error ? e.message : '';
      setPayload(null);
      setError(msg && !/network request failed|failed to fetch/i.test(msg) ? msg : 'Could not load this report');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [tab, gstTab, kind, from, to, asOn, asOnOk, rangeOk, account, party]);

  useEffect(() => {
    load();
  }, [load]);

  // The pickers' option lists load once, the first time their tab opens.
  useEffect(() => {
    if (tab === 'ledger' && accounts.length === 0) {
      fetchAccounts()
        .then((a) => {
          setAccounts(a);
          if (a[0]) setAccount((cur) => cur || a[0]);
        })
        .catch(() => undefined);
    }
    if (tab === 'statement' && parties.length === 0) {
      fetchPartyOptions()
        .then((p) => {
          setParties(p);
          if (p[0]) setParty((cur) => cur || p[0]);
        })
        .catch(() => undefined);
    }
  }, [tab, accounts.length, parties.length]);

  const sendReminder = async (partyId: string, name: string, amount: number) => {
    setBusy(partyId);
    try {
      const res = await sendPaymentReminder(partyId);
      if (res && res.ok === false) throw new Error(res.error || 'WhatsApp could not send it');
      Alert.alert('Reminder sent', `${name} was reminded of ${money(amount)} on WhatsApp.`);
      await load();
    } catch (e: unknown) {
      Alert.alert('Not sent', e instanceof Error ? e.message : 'Could not send the reminder');
    } finally {
      setBusy(null);
    }
  };

  const noteReminded = async (partyId: string, amount: number, channel: string) => {
    setBusy(partyId);
    try {
      await markReminded(partyId, amount, channel);
      await load();
    } catch (e: unknown) {
      Alert.alert('Could not note it', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const pickList = useMemo(() => {
    const needle = pickQ.trim().toLowerCase();
    if (picker === 'account') {
      return accounts.filter((a) => !needle || `${a.code} ${a.name}`.toLowerCase().includes(needle)).slice(0, 80);
    }
    return parties.filter((p) => !needle || p.display_name.toLowerCase().includes(needle)).slice(0, 80);
  }, [picker, pickQ, accounts, parties]);

  const dateRow = (label: string, value: string, set: (v: string) => void, bad: boolean) => (
    <View style={styles.dateCell}>
      <Field label={label} value={value} onChangeText={set} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" hint={bad ? 'Use YYYY-MM-DD' : undefined} />
    </View>
  );

  const toolbar = (
    <View>
      <FilterChips items={TABS} activeKey={tab} onSelect={(k) => setTab(k as Tab)} />
      {tab === 'gst' ? <FilterChips items={GST_TABS} activeKey={gstTab} onSelect={(k) => setGstTab(k as GstTab)} /> : null}
      {tab === 'ageing' ? (
        <FilterChips
          items={[
            { key: 'receivable', label: 'Customers owe us' },
            { key: 'payable', label: 'We owe suppliers' },
          ]}
          activeKey={kind}
          onSelect={(k) => setKind(k as 'receivable' | 'payable')}
        />
      ) : null}
      {RANGE_TABS.includes(tab) ? (
        <View style={styles.dateRow}>
          {dateRow('From', from, setFrom, !DATE_RE.test(from))}
          {dateRow('To', to, setTo, !DATE_RE.test(to))}
        </View>
      ) : null}
      {AS_ON_TABS.includes(tab) ? <View style={styles.dateRow}>{dateRow('As on', asOn, setAsOn, !asOnOk)}</View> : null}
      {tab === 'ledger' ? (
        <View style={styles.pickRow}>
          <ActionButton label={account ? `${account.code} · ${account.name}` : 'Pick an account'} tone="neutral" onPress={() => { setPickQ(''); setPicker('account'); }} grow />
        </View>
      ) : null}
      {tab === 'statement' ? (
        <View style={styles.pickRow}>
          <ActionButton label={party ? party.display_name : 'Pick a customer or supplier'} tone="neutral" onPress={() => { setPickQ(''); setPicker('party'); }} grow />
        </View>
      ) : null}
    </View>
  );

  const subtitle = useMemo(() => {
    if (RANGE_TABS.includes(tab) && rangeOk) return `${shortDate(from)} to ${shortDate(to)}`;
    if (AS_ON_TABS.includes(tab) && asOnOk) return `As on ${shortDate(asOn)}`;
    return undefined;
  }, [tab, from, to, asOn, rangeOk, asOnOk]);

  const rowsOf = (rows: LedgerRow[], withParty: boolean, dr: (v: number) => string) =>
    rows.length === 0 ? (
      <EmptyNote text="No entries in this period" icon="document" />
    ) : (
      rows.map((x, i) => (
        <ListRow
          key={`${x.journal_no}-${i}`}
          icon="document"
          title={x.narration || x.journal_no}
          subtitle={[withParty ? x.party : null, x.debit_paise ? `Dr ${money(x.debit_paise)}` : `Cr ${money(x.credit_paise)}`].filter(Boolean).join(' · ')}
          meta={`${shortDate(x.date)} · ${x.journal_no}${x.status === 'reversed' ? ' · reversed' : ''}`}
          value={dr(x.balance_paise)}
          valueColor={x.status === 'reversed' ? theme.err : undefined}
        />
      ))
    );

  const body = () => {
    if (!payload) {
      if (loading || error) return null;
      if (RANGE_TABS.includes(tab) && !rangeOk) return <EmptyNote text="Enter both dates as YYYY-MM-DD" icon="calendar" />;
      if (AS_ON_TABS.includes(tab) && !asOnOk) return <EmptyNote text="Enter the date as YYYY-MM-DD" icon="calendar" />;
      if (tab === 'ledger') return <EmptyNote text="Pick an account to read its ledger" icon="document" />;
      if (tab === 'statement') return <EmptyNote text="Pick a customer or supplier" icon="user" />;
      return null;
    }

    switch (payload.kind) {
      case 'summary': {
        const s = payload.v;
        return (
          <>
            {s.attention.failing_checks.length > 0 || s.attention.unposted_tickets > 0 ? (
              <>
                <Overline>Needs attention</Overline>
                {s.attention.failing_checks.map((c) => (
                  <ListRow key={c} icon="alert" iconColor={theme.err} title={c} subtitle="A books check is failing" />
                ))}
                {s.attention.unposted_tickets > 0 ? (
                  <ListRow icon="alert" iconColor={theme.warn} title={`${s.attention.unposted_tickets} billed tickets not posted to the books`} />
                ) : null}
              </>
            ) : null}
            <Overline>Today</Overline>
            <StatGrid
              items={[
                { label: 'Sales', value: money(s.today.sales_paise) },
                { label: 'Collected', value: money(s.today.collected_paise), color: theme.ok },
              ]}
            />
            <Overline>This month</Overline>
            <StatGrid
              items={[
                { label: 'Sales', value: money(s.month.sales_paise) },
                { label: 'Collected', value: money(s.month.collected_paise), color: theme.ok },
                { label: 'Expenses', value: money(s.month.expenses_paise), color: theme.warn },
                { label: 'Profit', value: money(s.month.profit_paise), color: s.month.profit_paise >= 0 ? theme.ok : theme.err },
              ]}
            />
            <Overline>Where the money is</Overline>
            <StatGrid
              items={[
                { label: 'Cash in hand', value: money(s.money.cash_in_hand_paise) },
                { label: 'Bank', value: money(s.money.bank_paise) },
                { label: `With technicians (${s.money.technician_cash_tickets})`, value: money(s.money.with_technicians_paise), color: theme.warn },
                { label: 'Stock value', value: money(s.stock.value_paise) },
              ]}
            />
            <Overline>Owed to us</Overline>
            <StatGrid
              items={[
                { label: 'Receivable', value: money(s.receivable.total_paise), color: theme.warn },
                { label: 'Overdue', value: money(s.receivable.overdue_paise), color: s.receivable.overdue_paise ? theme.err : undefined },
                { label: 'Payable', value: money(s.payable.total_paise) },
                { label: 'Payable overdue', value: money(s.payable.overdue_paise), color: s.payable.overdue_paise ? theme.err : undefined },
              ]}
            />
            {s.receivable.top.length === 0 ? <EmptyNote text="Nobody owes anything" icon="check-circle" /> : null}
            {s.receivable.top.map((p) => (
              <ListRow
                key={`${p.party}-${p.phone}`}
                icon="user"
                title={p.party}
                subtitle={p.phone || undefined}
                meta={`Oldest ${p.oldest_days} days`}
                value={money(p.outstanding_paise)}
                footer={p.phone ? <ActionButton label="Call" tone="neutral" onPress={() => Linking.openURL(`tel:${p.phone}`)} /> : undefined}
              />
            ))}
            <Overline>GST this month</Overline>
            <StatGrid
              items={[
                { label: 'Collected', value: money(s.gst.collected_paise) },
                { label: 'Claimable', value: money(s.gst.claimable_paise), color: theme.ok },
                { label: 'Payable', value: money(s.gst.month_payable_paise), color: theme.warn },
                { label: 'Low-stock items', value: s.stock.low_items, color: s.stock.low_items ? theme.err : undefined },
              ]}
            />
          </>
        );
      }

      case 'reminders': {
        const r = payload.v;
        return (
          <>
            <Text style={[styles.note, { color: theme.text3 }]}>{r.scope.basis}</Text>
            <StatGrid
              items={[
                { label: 'Overdue from customers', value: money(r.totals.customers_paise), color: r.totals.customers_paise ? theme.err : undefined },
                { label: 'Overdue to suppliers', value: money(r.totals.suppliers_paise) },
              ]}
            />
            <Overline>Customers to remind</Overline>
            {r.customers.length === 0 ? <EmptyNote text="Nobody is overdue" icon="check-circle" /> : null}
            {r.customers.map((c) => (
              <ListRow
                key={c.party_id}
                icon="user"
                title={c.party}
                subtitle={c.phone || 'No phone number'}
                meta={`Oldest ${c.oldest_days} days · ${c.times_reminded ? `reminded ${timeAgo(c.last_reminded_at)} (${c.times_reminded}×)` : 'never reminded'}`}
                value={money(c.overdue_paise)}
                valueColor={theme.err}
                footer={
                  <View style={styles.actions}>
                    {c.phone ? (
                      <ActionButton
                        label="Send now"
                        busy={busy === c.party_id}
                        onPress={() =>
                          Alert.alert('Send reminder', `Send a payment reminder for ${money(c.outstanding_paise)} to ${c.party} on WhatsApp?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Send', onPress: () => sendReminder(c.party_id, c.party, c.outstanding_paise) },
                          ])
                        }
                      />
                    ) : null}
                    {c.whatsapp_url ? (
                      <ActionButton
                        label="Open chat"
                        tone="neutral"
                        onPress={() => {
                          Linking.openURL(c.whatsapp_url as string);
                          noteReminded(c.party_id, c.outstanding_paise, 'whatsapp');
                        }}
                      />
                    ) : null}
                    <ActionButton label="Mark reminded" tone="neutral" busy={busy === c.party_id} onPress={() => noteReminded(c.party_id, c.outstanding_paise, 'call')} />
                  </View>
                }
              />
            ))}
            {r.suppliers.length > 0 ? <Overline>Suppliers you owe</Overline> : null}
            {r.suppliers.map((s) => (
              <ListRow key={s.party} icon="user" title={s.party} meta={`Oldest ${s.oldest_days} days · total ${money(s.outstanding_paise)}`} value={money(s.overdue_paise)} />
            ))}
          </>
        );
      }

      case 'pnl': {
        const r = payload.v;
        const t = r.totals;
        const section = (title: string, rows: { code: string; name: string; amount_paise: number }[]) =>
          rows.length ? (
            <>
              <Overline>{title}</Overline>
              <ReportTable rows={rows.map((a): ReportRow => ({ label: a.name, sub: a.code, value: money(a.amount_paise) }))} />
            </>
          ) : null;
        return (
          <>
            <ReportHero label="Net profit" value={money(t.net_profit_paise)} valueColor={t.net_profit_paise >= 0 ? theme.ok : theme.err} insight={r.scope.basis} />
            <ReportTable
              rows={[
                { label: 'Income', value: money(t.income_paise), tone: 'ok' },
                { label: 'Gross profit', value: money(t.gross_profit_paise) },
                { label: 'Expenses', value: money(t.expenses_paise), tone: 'warn' },
                { label: 'Net profit', value: money(t.net_profit_paise), strong: true, tone: t.net_profit_paise >= 0 ? 'ok' : 'err' },
              ]}
            />
            {section('Income', r.income)}
            {section('Cost of goods sold', r.cogs)}
            {section('Expenses', r.expenses)}
          </>
        );
      }

      case 'balance': {
        const r = payload.v;
        const t = r.totals;
        return (
          <>
            <Text style={[styles.note, { color: theme.text3 }]}>{r.scope.basis}</Text>
            {!r.balanced ? <ListRow icon="alert" iconColor={theme.err} title={`Out by ${money(t.difference_paise)}`} subtitle="This should not be possible — see Health Check" /> : null}
            <ReportTable
              rows={[
                { label: 'Assets', value: money(t.assets_paise), strong: true },
                { label: 'Liabilities & equity', value: money(t.liabilities_and_equity_paise), strong: true },
              ]}
            />
            <Overline>Assets</Overline>
            <ReportTable rows={r.assets.map((a): ReportRow => ({ label: a.name, sub: a.code, value: money(a.balance_paise) }))} />
            <Overline>Liabilities</Overline>
            <ReportTable rows={r.liabilities.map((a): ReportRow => ({ label: a.name, sub: a.code, value: money(a.balance_paise) }))} />
            <Overline>Equity</Overline>
            <ReportTable rows={r.equity.map((a): ReportRow => ({ label: a.name, sub: a.code, value: money(a.balance_paise) }))} />
            <ReportTable rows={[{ label: 'Profit / (loss) to date', value: money(t.profit_to_date_paise), strong: true, tone: t.profit_to_date_paise >= 0 ? 'ok' : 'err' }]} />
          </>
        );
      }

      case 'ageing': {
        const r = payload.v;
        const t = r.totals;
        return (
          <>
            <Text style={[styles.note, { color: theme.text3 }]}>{r.scope.basis}</Text>
            <StatGrid
              items={[
                { label: '0–30 days', value: money(t.d0_30) },
                { label: '31–60 days', value: money(t.d31_60) },
                { label: '61–90 days', value: money(t.d61_90), color: t.d61_90 ? theme.warn : undefined },
                { label: '90+ days', value: money(t.d90_plus), color: t.d90_plus ? theme.err : undefined },
                { label: 'Outstanding', value: money(t.outstanding_paise) },
                { label: 'Paid ahead', value: money(t.advance_paise) },
              ]}
            />
            {r.parties.length === 0 ? <EmptyNote text="Nothing outstanding" icon="check-circle" /> : null}
            {r.parties.map((p) => (
              <ListRow
                key={`${p.party}-${p.phone}`}
                icon="user"
                title={p.party}
                subtitle={`0–30 ${money(p.d0_30)} · 31–60 ${money(p.d31_60)} · 61–90 ${money(p.d61_90)} · 90+ ${money(p.d90_plus)}`}
                meta={[p.phone, p.advance_paise ? `paid ahead ${money(p.advance_paise)}` : null].filter(Boolean).join(' · ') || undefined}
                value={money(p.outstanding_paise)}
                valueColor={p.d90_plus ? theme.err : undefined}
                footer={p.phone ? <ActionButton label="Call" tone="neutral" onPress={() => Linking.openURL(`tel:${p.phone}`)} /> : undefined}
              />
            ))}
          </>
        );
      }

      case 'ledger': {
        const r = payload.v;
        return (
          <>
            <StatGrid
              items={[
                { label: 'Opening', value: money(r.opening_paise) },
                { label: 'Closing', value: money(r.closing_paise) },
                { label: 'Debit', value: money(r.totals.debit_paise) },
                { label: 'Credit', value: money(r.totals.credit_paise) },
              ]}
            />
            {rowsOf(r.rows, true, money)}
          </>
        );
      }

      case 'statement': {
        const r = payload.v;
        const dr = (v: number) => (v >= 0 ? `${money(v)} Dr` : `${money(-v)} Cr`);
        return (
          <>
            <Text style={[styles.note, { color: theme.text3 }]}>Dr means they owe us; Cr means we owe them (or they paid ahead).</Text>
            <StatGrid
              items={[
                { label: 'Opening', value: dr(r.opening_paise) },
                { label: 'Closing', value: dr(r.closing_paise) },
                { label: 'Debit', value: money(r.totals.debit_paise) },
                { label: 'Credit', value: money(r.totals.credit_paise) },
              ]}
            />
            {rowsOf(r.rows, false, dr)}
          </>
        );
      }

      case 'gst-summary': {
        const s = payload.v;
        const against = Object.entries(s.against_ledger);
        return (
          <>
            <Text style={[styles.note, { color: theme.text3 }]}>{s.scope.basis}</Text>
            <StatGrid
              items={[
                { label: 'Tax on sales', value: money(s.output.tax_paise) },
                { label: 'Tax you can claim', value: money(s.input.tax_paise), color: theme.ok },
                { label: 'Net payable', value: money(s.payable.total_paise), color: s.payable.total_paise > 0 ? theme.err : undefined },
              ]}
            />
            <Overline>Sales</Overline>
            <ListRow title="Taxable value" value={money(s.output.taxable_paise)} subtitle={`CGST ${money(s.output.cgst_paise)} · SGST ${money(s.output.sgst_paise)} · IGST ${money(s.output.igst_paise)}`} />
            <Overline>Purchases (claimable)</Overline>
            <ListRow title="Taxable value" value={money(s.input.taxable_paise)} subtitle={`CGST ${money(s.input.cgst_paise)} · SGST ${money(s.input.sgst_paise)} · IGST ${money(s.input.igst_paise)}`} />
            {s.input.ineligible_tax_paise ? (
              <Text style={[styles.note, { color: theme.text3 }]}>{money(s.input.ineligible_tax_paise)} of purchase tax was marked not claimable and is kept in the cost.</Text>
            ) : null}
            <Overline>Payable</Overline>
            <ListRow title="Net tax payable" value={money(s.payable.total_paise)} subtitle={`CGST ${money(s.payable.cgst_paise)} · SGST ${money(s.payable.sgst_paise)} · IGST ${money(s.payable.igst_paise)}`} />
            <Overline>Sales by category</Overline>
            {s.output.by_category.map((c) => (
              <ListRow key={c.category} title={c.category} subtitle={`${c.documents} documents · taxable ${money(c.taxable_paise)}`} value={money(c.total_paise)} />
            ))}
            <Overline>Do the documents agree with the tax accounts?</Overline>
            {against.map(([k, v]) => (
              <ListRow
                key={k}
                icon={v.difference_paise ? 'alert' : 'check-circle'}
                iconColor={v.difference_paise ? theme.err : theme.ok}
                title={k.replace('_', ' ').toUpperCase()}
                subtitle={`Documents ${money(v.documents_paise)} · ledger ${money(v.ledger_paise)}`}
                value={v.difference_paise ? money(v.difference_paise) : 'Agrees'}
                valueColor={v.difference_paise ? theme.err : theme.ok}
              />
            ))}
          </>
        );
      }

      case 'gst-sales': {
        const rows = payload.v;
        const sum = (k: 'taxable_paise' | 'total_paise') => rows.reduce((n, r) => n + r[k], 0);
        return (
          <>
            <StatGrid items={[{ label: 'Taxable', value: money(sum('taxable_paise')) }, { label: 'Total', value: money(sum('total_paise')) }]} />
            {rows.length === 0 ? <EmptyNote text="No sales documents in this period" icon="document" /> : null}
            {rows.map((r, i) => (
              <ListRow
                key={`${r.doc_no}-${i}`}
                icon="document"
                title={`${r.doc_no} · ${r.party}`}
                subtitle={`${r.category}${r.gstin ? ` · ${r.gstin}` : ''}`}
                meta={`${shortDate(r.date)} · taxable ${money(r.taxable_paise)} · CGST ${money(r.cgst_paise)} · SGST ${money(r.sgst_paise)} · IGST ${money(r.igst_paise)}`}
                value={money(r.total_paise)}
                badge={r.source === 'ticket' ? { label: 'Ticket', color: theme.warn } : undefined}
              />
            ))}
          </>
        );
      }

      case 'gst-hsn': {
        const { rows, note } = payload.v;
        return (
          <>
            <Text style={[styles.note, { color: theme.text3 }]}>{note}</Text>
            {rows.length === 0 ? <EmptyNote text="Nothing sold in this period" icon="document" /> : null}
            {rows.map((r, i) => (
              <ListRow
                key={`${r.hsn_sac}-${r.rate_pct}-${i}`}
                icon="document"
                title={r.hsn_sac || 'No HSN / SAC'}
                subtitle={`${r.quantity} ${r.unit} · ${r.rate_pct}% · CGST ${money(r.cgst_paise)} · SGST ${money(r.sgst_paise)} · IGST ${money(r.igst_paise)}`}
                value={money(r.taxable_paise)}
                badge={r.hsn_sac ? undefined : { label: 'Missing', color: theme.warn }}
              />
            ))}
          </>
        );
      }

      case 'gst-purchases': {
        const rows = payload.v;
        return (
          <>
            <Text style={[styles.note, { color: theme.text3 }]}>Supplier bills and purchase returns. Tax marked not claimable stays in the cost of the goods.</Text>
            {rows.length === 0 ? <EmptyNote text="No purchase bills in this period" icon="document" /> : null}
            {rows.map((r, i) => (
              <ListRow
                key={`${r.doc_no}-${i}`}
                icon="document"
                title={`${r.doc_no} · ${r.party}`}
                subtitle={[r.supplier_ref ? `Bill ${r.supplier_ref}` : null, r.gstin].filter(Boolean).join(' · ') || undefined}
                meta={`${shortDate(r.date)} · CGST ${money(r.cgst_paise)} · SGST ${money(r.sgst_paise)} · IGST ${money(r.igst_paise)}`}
                value={money(r.taxable_paise)}
                badge={r.eligible ? undefined : { label: 'Not claimable', color: theme.warn }}
              />
            ))}
          </>
        );
      }

      case 'stock': {
        const v = payload.v;
        const items = v.items.filter((i) => i.quantity || i.value_paise);
        return (
          <>
            <Text style={[styles.note, { color: theme.text3 }]}>{v.scope.basis}</Text>
            <StatGrid
              items={[
                { label: 'Stock on hand', value: money(v.total_value_paise) },
                { label: 'Inventory account', value: money(v.ledger_inventory_paise) },
              ]}
            />
            {v.difference_paise ? (
              <ListRow
                icon="alert"
                iconColor={theme.warn}
                title={`${money(v.difference_paise)} gap`}
                subtitle="Stock the books have not been told about — usually stock on the shelf before accounting started."
              />
            ) : (
              <ListRow icon="check-circle" iconColor={theme.ok} title="Stock and the Inventory account agree" />
            )}
            {items.map((i, n) => (
              <ListRow
                key={`${i.sku || i.name}-${n}`}
                icon="box"
                title={i.name}
                subtitle={`${i.quantity} ${i.unit || ''} × ${money(i.avg_cost_paise)}${i.sku ? ` · ${i.sku}` : ''}`}
                value={money(i.value_paise)}
                badge={i.quantity_matches === false ? { label: 'Ledger mismatch', color: theme.err } : undefined}
              />
            ))}
          </>
        );
      }

      case 'jobs': {
        const r = payload.v;
        const t = r.totals;
        return (
          <>
            <Text style={[styles.note, { color: theme.text3 }]}>{r.scope.basis}</Text>
            <StatGrid
              items={[
                { label: 'Revenue', value: money(t.revenue_paise) },
                { label: 'Cost', value: money(t.cost_paise) },
                { label: 'Margin', value: money(t.margin_paise), color: t.margin_paise < 0 ? theme.err : theme.ok },
                ...(t.unbilled_jobs ? [{ label: `Not billed (${t.unbilled_jobs})`, value: money(t.unbilled_cost_paise), color: theme.warn }] : []),
              ]}
            />
            {r.jobs.length === 0 ? <EmptyNote text="No jobs in this period" icon="wrench" /> : null}
            {r.jobs.map((j, i) => (
              <ListRow
                key={`${j.ticket_no}-${i}`}
                icon="wrench"
                title={`${j.ticket_no || '—'} · ${j.customer || 'Customer'}`}
                subtitle={j.unbilled ? `Not billed · cost ${money(j.total_cost_paise)}` : `Revenue ${money(j.revenue_paise)} · cost ${money(j.total_cost_paise)}`}
                meta={`${shortDate(j.job_date)}${j.margin_pct === null ? '' : ` · ${j.margin_pct}%`}`}
                value={money(j.margin_paise)}
                valueColor={j.margin_paise < 0 ? theme.err : undefined}
                badge={j.unbilled ? { label: 'Not billed', color: theme.warn } : undefined}
              />
            ))}
          </>
        );
      }

      case 'health': {
        const r = payload.v;
        const show = (c: Reconciliation['checks'][number], v: number) => (c.count ? String(v) : money(v));
        return (
          <>
            <ListRow
              icon={r.ok ? 'check-circle' : 'alert'}
              iconColor={r.ok ? theme.ok : theme.err}
              title={r.ok ? 'The books agree with themselves' : 'Something does not agree'}
              subtitle="Each line sets two independent sources side by side."
            />
            {r.checks.map((c) => (
              <ListRow
                key={c.label}
                icon={c.ok ? 'check-circle' : 'alert'}
                iconColor={c.ok ? theme.ok : theme.err}
                title={c.label}
                subtitle={c.note || undefined}
                meta={`One side ${show(c, c.a_paise)} · other side ${show(c, c.b_paise)}`}
                value={c.ok ? 'OK' : show(c, c.difference_paise)}
                valueColor={c.ok ? theme.ok : theme.err}
              />
            ))}
          </>
        );
      }
      default:
        return null;
    }
  };

  // What "Export CSV" hands over: the rows of whichever report is on screen.
  const rp = (p: number) => (p / 100).toFixed(2);
  const exportRows = (): Record<string, unknown>[] => {
    if (!payload) return [];
    switch (payload.kind) {
      case 'reminders':
        return payload.v.customers.map((c) => ({ Customer: c.party, Phone: c.phone || '', Overdue: rp(c.overdue_paise), 'Total owed': rp(c.outstanding_paise), 'Oldest days': c.oldest_days, Reminded: c.times_reminded }));
      case 'pnl':
        return [
          ...payload.v.income.map((a) => ({ Section: 'Income', Code: a.code, Account: a.name, Amount: rp(a.amount_paise) })),
          ...payload.v.cogs.map((a) => ({ Section: 'Cost of goods sold', Code: a.code, Account: a.name, Amount: rp(a.amount_paise) })),
          ...payload.v.expenses.map((a) => ({ Section: 'Expenses', Code: a.code, Account: a.name, Amount: rp(a.amount_paise) })),
          { Section: 'Net profit', Code: '', Account: '', Amount: rp(payload.v.totals.net_profit_paise) },
        ];
      case 'balance':
        return [
          ...payload.v.assets.map((a) => ({ Side: 'Assets', Code: a.code, Account: a.name, Amount: rp(a.balance_paise) })),
          ...payload.v.liabilities.map((a) => ({ Side: 'Liabilities', Code: a.code, Account: a.name, Amount: rp(a.balance_paise) })),
          ...payload.v.equity.map((a) => ({ Side: 'Equity', Code: a.code, Account: a.name, Amount: rp(a.balance_paise) })),
        ];
      case 'ageing':
        return payload.v.parties.map((p) => ({ Party: p.party, Phone: p.phone || '', '0-30': rp(p.d0_30), '31-60': rp(p.d31_60), '61-90': rp(p.d61_90), '90+': rp(p.d90_plus), Outstanding: rp(p.outstanding_paise), 'Paid ahead': rp(p.advance_paise) }));
      case 'ledger':
      case 'statement':
        return payload.v.rows.map((x) => ({ Date: x.date, Journal: x.journal_no, Narration: x.narration || '', Party: x.party || '', Debit: rp(x.debit_paise), Credit: rp(x.credit_paise), Balance: rp(x.balance_paise) }));
      case 'gst-sales':
        return payload.v.map((r) => ({ Date: r.date, Document: r.doc_no, Party: r.party, GSTIN: r.gstin || '', Category: r.category, Taxable: rp(r.taxable_paise), CGST: rp(r.cgst_paise), SGST: rp(r.sgst_paise), IGST: rp(r.igst_paise), Total: rp(r.total_paise) }));
      case 'gst-purchases':
        return payload.v.map((r) => ({ Date: r.date, Document: r.doc_no, 'Supplier bill': r.supplier_ref || '', Supplier: r.party, GSTIN: r.gstin || '', Taxable: rp(r.taxable_paise), CGST: rp(r.cgst_paise), SGST: rp(r.sgst_paise), IGST: rp(r.igst_paise), Claim: r.eligible ? 'Yes' : 'No' }));
      case 'gst-hsn':
        return payload.v.rows.map((r) => ({ 'HSN/SAC': r.hsn_sac || '', Unit: r.unit, 'Rate %': r.rate_pct, Quantity: r.quantity, Taxable: rp(r.taxable_paise), CGST: rp(r.cgst_paise), SGST: rp(r.sgst_paise), IGST: rp(r.igst_paise) }));
      case 'stock':
        return payload.v.items.map((i) => ({ Item: i.name, SKU: i.sku || '', Unit: i.unit || '', 'On hand': i.quantity, 'Avg cost': rp(i.avg_cost_paise), Value: rp(i.value_paise) }));
      case 'jobs':
        return payload.v.jobs.map((j) => ({ Date: String(j.job_date || '').slice(0, 10), Ticket: j.ticket_no || '', Customer: j.customer || '', Revenue: rp(j.revenue_paise), Cost: rp(j.total_cost_paise), Margin: rp(j.margin_paise), 'Margin %': j.margin_pct ?? '' }));
      case 'health':
        return payload.v.checks.map((c) => ({ Check: c.label, OK: c.ok ? 'Yes' : 'No', 'One side': c.a_paise, 'Other side': c.b_paise, Difference: c.difference_paise }));
      default:
        return [];
    }
  };
  const exportable = payload && payload.kind !== 'summary' && payload.kind !== 'gst-summary';

  return (
    <AdminScreen title="Financial Reports" subtitle={subtitle} onBack={onBack} onRefresh={load} loading={loading && !payload} error={error} toolbar={toolbar}>
      {exportable ? <ExportButton name={`${tab}-report.csv`} rows={exportRows()} /> : null}
      {body()}
      <FormSheet
        visible={picker !== null}
        title={picker === 'account' ? 'Pick an account' : 'Pick a customer or supplier'}
        onClose={() => setPicker(null)}
      >
        <SearchField value={pickQ} onChangeText={setPickQ} placeholder={picker === 'account' ? 'Account code or name' : 'Name'} />
        {pickList.length === 0 ? <EmptyNote text="No matches" icon="search" /> : null}
        {picker === 'account'
          ? (pickList as Account[]).map((a) => (
              <ListRow
                key={a.id}
                title={a.name}
                subtitle={a.code}
                onPress={() => {
                  setAccount(a);
                  setPicker(null);
                }}
              />
            ))
          : (pickList as PartyOption[]).map((p) => (
              <ListRow
                key={p.id}
                title={p.display_name}
                onPress={() => {
                  setParty(p);
                  setPicker(null);
                }}
              />
            ))}
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.caption, marginVertical: spacing(1) },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  dateRow: { flexDirection: 'row', gap: spacing(3), paddingHorizontal: spacing(4) },
  dateCell: { flex: 1 },
  pickRow: { flexDirection: 'row', paddingHorizontal: spacing(4), paddingBottom: spacing(2) },
});
