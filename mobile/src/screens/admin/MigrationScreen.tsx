import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import Field from '../../components/admin/Field';
import { rupees } from '../../api/adminBooks';
import { postOpeningBalances } from '../../api/adminLedger';
import {
  applyServiceLog,
  applyStock,
  applyTickets,
  Automation,
  BeforeAfter,
  emailBackup,
  fetchAutomation,
  fetchRuns,
  fetchVyaparStatus,
  LogPreview,
  MigrationRun,
  previewServiceLog,
  previewStock,
  previewTickets,
  runVyaparStep,
  sendDigestNow,
  setDigest,
  StockPreview,
  TicketPreview,
  uploadVyapar,
  VyaparStatus,
  VyaparSummary,
} from '../../api/adminMigration';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { dateTime, inr, shortDate, todayIso } from '../../utils/format';

interface Props {
  onBack: () => void;
}

type Tab = 'backup' | 'vyapar' | 'tickets' | 'stock' | 'log' | 'history' | 'auto';
const TABS: { key: Tab; label: string }[] = [
  { key: 'backup', label: 'Backup' },
  { key: 'vyapar', label: 'From Vyapar' },
  { key: 'tickets', label: 'Older Tickets' },
  { key: 'stock', label: 'Stock on the Shelf' },
  { key: 'log', label: 'Service Register' },
  { key: 'history', label: 'History' },
  { key: 'auto', label: 'Evening Summary' },
];
const TYPE_NAMES: Record<string, string> = {
  sale: 'Invoices', estimate: 'Quotations', payment_in: 'Payments received', purchase: 'Purchases', payment_out: 'Payments made',
  sale_return: 'Credit notes', purchase_return: 'Purchase returns', expense: 'Expenses', delivery_challan: 'Delivery challans', other: 'Other',
};
const KIND: Record<string, string> = { tickets: 'Older tickets', stock: 'Stock on the shelf', service_log: 'Service register' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const money = (p: number) => inr(rupees(p));
const errText = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);
const num = (v: unknown) => Number(v) || 0;

// Bringing what already exists into the books: a backup first, then look at
// what would happen (nothing is written), confirm, and read the books' own
// checks from before and after. Each step is safe to run again.
export default function MigrationScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('backup');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const [vyStatus, setVyStatus] = useState<VyaparStatus | null>(null);
  const [vy, setVy] = useState<{ session: string; file: string; summary: VyaparSummary } | null>(null);
  const [vyAsOn, setVyAsOn] = useState(todayIso());
  const [vyResult, setVyResult] = useState<Record<string, string>>({});

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toLocaleDateString('en-CA');
  });
  const [tickets, setTickets] = useState<TicketPreview | null>(null);
  const [ticketAfter, setTicketAfter] = useState<{ text: string; ba: { before: BeforeAfter; after: BeforeAfter } } | null>(null);

  const [stock, setStock] = useState<StockPreview | null>(null);
  const [stockPick, setStockPick] = useState<Set<string>>(new Set());
  const [stockDate, setStockDate] = useState(todayIso());
  const [stockAfter, setStockAfter] = useState<{ text: string; ba: { before: BeforeAfter; after: BeforeAfter } } | null>(null);

  const [log, setLog] = useState<LogPreview | null>(null);
  const [logPick, setLogPick] = useState<Set<string>>(new Set());
  const [paidInto, setPaidInto] = useState<'cash' | 'bank'>('cash');
  const [logAfter, setLogAfter] = useState<string | null>(null);

  const [runs, setRuns] = useState<MigrationRun[]>([]);
  const [auto, setAuto] = useState<Automation | null>(null);
  const [sent, setSent] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError(null);
    if (tab === 'backup' || tab === 'tickets') return;
    setLoading(true);
    try {
      if (tab === 'vyapar') {
        const s = await fetchVyaparStatus().catch(() => null);
        if (mine === seq.current) setVyStatus(s);
      } else if (tab === 'stock') {
        const p = await previewStock();
        if (mine !== seq.current) return;
        setStock(p);
        setStockPick(new Set(p.bookable.map((r) => r.item_id)));
      } else if (tab === 'log') {
        const p = await previewServiceLog();
        if (mine !== seq.current) return;
        setLog(p);
        setLogPick(new Set(p.candidates.map((r) => r.id)));
      } else if (tab === 'history') {
        const r = await fetchRuns();
        if (mine === seq.current) setRuns(r);
      } else if (tab === 'auto') {
        const a = await fetchAutomation();
        if (mine === seq.current) setAuto(a);
      }
    } catch (e: unknown) {
      if (mine === seq.current) setError(errText(e, 'Could not load this step'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const guard = async (key: string, fn: () => Promise<void>, failTitle = 'Something went wrong') => {
    setBusy(key);
    try {
      await fn();
    } catch (e: unknown) {
      Alert.alert(failTitle, errText(e, 'Try again'));
    } finally {
      setBusy(null);
    }
  };

  const confirm = (title: string, message: string, onYes: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Go ahead', onPress: onYes },
    ]);

  const checksBlock = (ba: { before: BeforeAfter; after: BeforeAfter }) => {
    const before = new Map(ba.before.checks.map((c) => [c.key, c]));
    return (
      <>
        <SectionLabel>The books' own checks</SectionLabel>
        {ba.after.checks.map((a) => {
          const b = before.get(a.key) || a;
          const changed = b.difference_paise !== a.difference_paise || b.ok !== a.ok;
          return (
            <ListRow
              key={a.key}
              icon={a.ok ? 'check-circle' : 'alert'}
              iconColor={a.ok ? semantic.success : semantic.danger}
              title={a.label}
              subtitle={`Before: ${b.ok ? 'OK' : `gap ${a.key === 'service_blocked' ? b.a_paise : money(b.difference_paise)}`}`}
              meta={`After: ${a.ok ? 'OK' : `gap ${a.key === 'service_blocked' ? a.a_paise : money(a.difference_paise)}`}${changed ? ' · changed' : ''}`}
            />
          );
        })}
      </>
    );
  };

  const toggleIn = (set: Set<string>, id: string, put: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    put(next);
  };

  // ── actions ───────────────────────────────────────────────────────────
  const sendBackup = () =>
    guard(
      'backup',
      async () => {
        const out = await emailBackup();
        setStatus(`Being prepared — it will arrive at ${out.to} in a minute or two. You will also get a notification.`);
      },
      'Backup not sent',
    );

  const pickVyapar = () =>
    guard(
      'vy-file',
      async () => {
        const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
        if (res.canceled || !res.assets?.[0]) return;
        const f = res.assets[0];
        if (!/\.(vyb|vyp|zip)$/i.test(f.name)) throw new Error('Choose a Vyapar backup file — it ends in .vyb');
        setStatus(`Reading ${f.name}…`);
        try {
          const out = await uploadVyapar(f.uri, f.name);
          setVy({ session: out.session, file: f.name, summary: out.summary });
          setVyResult({});
        } finally {
          setStatus('');
        }
      },
      'Could not read that file',
    );

  const vyStep = (step: 'parties' | 'items' | 'history', label: string) => {
    if (!vy) return;
    if (!DATE_RE.test(vyAsOn)) return Alert.alert('Date needed', 'Enter the as-on date as YYYY-MM-DD.');
    const run = () =>
      guard(
        `vy-${step}`,
        async () => {
          const o = await runVyaparStep(vy.session, step, vyAsOn);
          const text =
            step === 'parties'
              ? `${num(o.created)} parties added${o.matched_existing ? `, ${o.matched_existing} recognised as already here` : ''}.`
              : step === 'items'
                ? `${num(o.created)} items added; ${num(o.with_stock)} with opening stock worth ${money(num(o.stock_value_paise))}.`
                : `${num(o.documents)} records (${num(o.lines)} lines) kept; ${num(o.matched_party)} tied to a customer or supplier.`;
          setVyResult((r) => ({ ...r, [step]: text }));
          fetchVyaparStatus().then(setVyStatus).catch(() => undefined);
        },
        `${label} failed`,
      );
    if (step === 'history') run();
    else confirm(label, `Bring in the ${label.toLowerCase()} as on ${shortDate(vyAsOn)}? Running it again never counts anything twice.`, run);
  };

  const vyOpening = () =>
    confirm('Post the opening balances', `Post them as on ${shortDate(vyAsOn)}? Check the parties and items first. Posting the same date twice changes nothing.`, () =>
      guard(
        'vy-open',
        async () => {
          const out = (await postOpeningBalances(vyAsOn)) as { reused?: boolean; lines?: number };
          setVyResult((r) => ({ ...r, open: `${out.reused ? 'Already posted for this date.' : 'Posted.'}${out.lines ? ` ${out.lines} lines in one entry.` : ''}` }));
        },
        'Not posted',
      ),
    );

  const lookTickets = () => {
    if (!DATE_RE.test(from)) return Alert.alert('Date needed', 'Enter the date as YYYY-MM-DD.');
    setTicketAfter(null);
    guard('tickets-look', async () => setTickets(await previewTickets(from)), 'Could not look');
  };
  const postTickets = () => {
    if (!tickets) return;
    confirm('Bring in older tickets', `Post ${tickets.totals.tickets} ticket(s) billed from ${shortDate(tickets.from)}, totalling ${money(tickets.totals.billed_paise)}, into the books?`, () =>
      guard(
        'tickets-apply',
        async () => {
          const out = await applyTickets(tickets.from);
          setTicketAfter({ text: `${out.posted} ticket(s) posted.${out.blocked ? ` ${out.blocked} could not be posted yet — see Business & Tax Setup → Service Income.` : ''}`, ba: out });
          setTickets(null);
        },
        'Not posted',
      ),
    );
  };

  const postStock = () => {
    const ids = [...stockPick];
    if (!stock || ids.length === 0) return Alert.alert('Nothing ticked', 'Tick at least one item.');
    if (!DATE_RE.test(stockDate)) return Alert.alert('Date needed', 'Enter the stock-count date as YYYY-MM-DD.');
    const total = stock.bookable.filter((r) => stockPick.has(r.item_id)).reduce((s, r) => s + r.unbooked_value_paise, 0);
    confirm('Bring the stock in', `Bring ${ids.length} item(s) worth ${money(total)} into the books?`, () =>
      guard(
        'stock-apply',
        async () => {
          const out = await applyStock(stockDate, ids);
          setStockAfter({ text: `${out.items} item(s), ${money(out.value_paise)} brought in.`, ba: out });
          setStock(null);
        },
        'Not posted',
      ),
    );
  };

  const postLog = () => {
    const ids = [...logPick];
    if (ids.length === 0) return Alert.alert('Nothing ticked', 'Tick at least one entry.');
    confirm('Book register entries', `Book ${ids.length} register entr${ids.length === 1 ? 'y' : 'ies'} as service income (no GST)?`, () =>
      guard(
        'log-apply',
        async () => {
          const out = await applyServiceLog(ids, paidInto);
          const failed = out.results.filter((r) => !r.ok).length;
          setLogAfter(`${out.posted} of ${out.entries} booked — ${money(out.billed_paise)} billed${failed ? `, ${failed} could not be booked` : ''}.`);
          setLog(null);
        },
        'Not booked',
      ),
    );
  };

  const toggleDigest = async (on: boolean) => {
    const prev = auto;
    setAuto(auto ? { ...auto, owner_digest_on: on } : auto);
    try {
      await setDigest(on);
    } catch (e: unknown) {
      setAuto(prev);
      Alert.alert('Not saved', errText(e, 'Try again'));
    }
  };

  const doneLine = (step: string) => {
    const d = vyStatus?.last?.[step];
    return d ? `✔ Done ${dateTime(d.at)}${d.as_on ? ` (as on ${shortDate(d.as_on)})` : ''} — run again any time` : undefined;
  };

  const runLine = (r: MigrationRun) => {
    const s = r.summary;
    if (r.kind === 'tickets') return `${s.posted} of ${s.expected?.tickets ?? '?'} tickets posted from ${shortDate(s.from)}${s.blocked ? `, ${s.blocked} blocked` : ''}`;
    if (r.kind === 'stock') return `${s.items} item(s), ${money(num(s.value_paise))}`;
    return `${s.posted} of ${s.entries} entries, ${money(num(s.billed_paise))} billed`;
  };

  return (
    <AdminScreen
      title="Data Migration"
      subtitle="Look first, then confirm"
      onBack={onBack}
      onRefresh={load}
      loading={loading}
      error={error}
      toolbar={<FilterChips items={TABS} activeKey={tab} onSelect={(k) => setTab(k as Tab)} />}
    >
      {tab === 'backup' ? (
        <View>
          <Text style={[styles.note, { color: theme.text2 }]}>
            Make a copy of all the data in the portal — every table as a spreadsheet inside one ZIP — before moving anything new in. Passwords and login tokens are left out.
          </Text>
          <ActionButton label="Email it to me" busy={busy === 'backup'} onPress={sendBackup} />
          {status ? <Text style={[styles.note, { color: theme.text3 }]}>{status}</Text> : null}
          <Text style={[styles.note, { color: theme.text3 }]}>
            The ZIP is sent to the address you sign in with. It is built on the server and can take a minute or two; on the web portal you can also download it directly.
          </Text>
        </View>
      ) : null}

      {tab === 'vyapar' ? (
        <View>
          <Text style={[styles.note, { color: theme.text2 }]}>
            Bring your Vyapar data in: customers and suppliers with what they owe today, items with the stock really on the shelf, and every old record to look up. Each party's balance becomes its opening balance; old records are kept for lookup and never posted twice.
          </Text>
          <SectionLabel>1. Choose the Vyapar backup file</SectionLabel>
          <ActionButton label={vy ? `Replace ${vy.file}` : 'Choose backup file'} busy={busy === 'vy-file'} onPress={pickVyapar} />
          <Text style={[styles.note, { color: theme.text3 }]}>
            {status || 'In Vyapar: Backup → Backup to device. The file ends in .vyb. It is read here and kept for an hour; it is not saved on the server.'}
          </Text>
          {vy ? (
            <View>
              <StatGrid
                items={[
                  { label: 'Customers & suppliers', value: vy.summary.parties.count },
                  { label: 'They owe you', value: money(vy.summary.parties.owe_us.paise) },
                  { label: 'You owe them', value: money(vy.summary.parties.we_owe.paise) },
                  { label: 'Items', value: vy.summary.items.count },
                  { label: 'Items with stock', value: vy.summary.items.with_stock },
                  { label: 'Stock value (cost)', value: money(vy.summary.items.stock_value_paise) },
                  { label: 'Old records', value: vy.summary.documents.count },
                ]}
              />
              {vy.summary.items.negative_stock ? (
                <ListRow icon="alert" iconColor={semantic.warning} title={`${vy.summary.items.negative_stock} items show negative stock in Vyapar`} subtitle="They come in with zero opening stock" />
              ) : null}
              {vy.summary.warnings_total ? (
                <ListRow icon="alert" iconColor={semantic.warning} title={`${vy.summary.warnings_total} thing(s) to check`} subtitle={vy.summary.warnings.slice(0, 5).join(' · ')} />
              ) : null}
              {Object.entries(vy.summary.documents.by_type)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([k, v]) => (
                  <ListRow key={k} icon="document" title={TYPE_NAMES[k] || k} subtitle={`${shortDate(v.from)} – ${shortDate(v.to)}`} value={`${v.count}`} meta={money(v.total_paise)} />
                ))}

              <SectionLabel>2. Bring it in — in this order</SectionLabel>
              <Field label="Balances and stock are as on" value={vyAsOn} onChangeText={setVyAsOn} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" hint="Use the day the backup was taken" />
              <ListRow
                icon="people"
                title="A. Customers & suppliers, with what they owe today"
                subtitle={vyResult.parties || doneLine('parties') || `Creates ${vy.summary.parties.count} parties; anyone already here is recognised, never duplicated`}
                footer={<ActionButton label="Bring in the parties" busy={busy === 'vy-parties'} onPress={() => vyStep('parties', 'Parties')} />}
              />
              <ListRow
                icon="box"
                title="B. Items, with the stock really on the shelf"
                subtitle={vyResult.items || doneLine('items') || `Creates ${vy.summary.items.count} items and opening stock for ${vy.summary.items.with_stock}`}
                footer={<ActionButton label="Bring in the items and stock" busy={busy === 'vy-items'} onPress={() => vyStep('items', 'Items')} />}
              />
              <ListRow
                icon="book"
                title="C. Old records, to look up"
                subtitle={vyResult.history || doneLine('history') || `Keeps ${vy.summary.documents.count} records under Past Records`}
                footer={<ActionButton label="Keep the old records" busy={busy === 'vy-history'} onPress={() => vyStep('history', 'Old records')} />}
              />
              <ListRow
                icon="receipt"
                title="D. Put the opening balances into the books"
                subtitle={vyResult.open || 'After A and B: one entry for every party’s opening balance'}
                footer={<ActionButton label="Post the opening balances" tone="neutral" busy={busy === 'vy-open'} onPress={vyOpening} />}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === 'tickets' ? (
        <View>
          <Text style={[styles.note, { color: theme.text2 }]}>
            Service and installation bills made before the ledger began are still on their tickets. This posts them — on the day each was billed — so customers' old dues show in the books.
          </Text>
          <Field label="Bring in tickets billed from" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
          <ActionButton label="Look at what would happen" tone="neutral" busy={busy === 'tickets-look'} onPress={lookTickets} />
          {tickets ? (
            <View>
              {tickets.current_from ? (
                <Text style={[styles.note, { color: theme.text3 }]}>
                  Tickets billed from {shortDate(tickets.current_from)} are already being posted. This covers {shortDate(tickets.from)} up to the day before.
                </Text>
              ) : null}
              <StatGrid
                items={[
                  { label: 'Tickets', value: tickets.totals.tickets },
                  { label: 'Customers', value: tickets.totals.customers },
                  { label: 'Billed', value: money(tickets.totals.billed_paise) },
                  { label: 'Already paid', value: money(tickets.totals.collected_paise) },
                  { label: 'Still owed', value: money(tickets.totals.outstanding_paise), color: tickets.totals.outstanding_paise ? semantic.danger : undefined },
                  { label: 'Cash with technicians', value: money(tickets.totals.with_technicians_paise) },
                ]}
              />
              {tickets.warnings.map((w) => (
                <ListRow key={w} icon="alert" iconColor={semantic.warning} title={w} />
              ))}
              {tickets.months.map((m) => (
                <ListRow key={m.month} icon="calendar" title={m.month} subtitle={`${m.tickets} tickets · billed ${money(m.billed_paise)}`} meta={`Paid ${money(m.collected_paise)}`} value={money(m.outstanding_paise)} />
              ))}
              {tickets.skipped.length ? <Text style={[styles.note, { color: theme.text3 }]}>Left out: {tickets.skipped.map((s) => `${s.count} — ${s.reason}`).join('; ')}.</Text> : null}
              {tickets.totals.tickets ? (
                <ActionButton label={`Bring in ${tickets.totals.tickets} ticket${tickets.totals.tickets === 1 ? '' : 's'}`} busy={busy === 'tickets-apply'} onPress={postTickets} />
              ) : (
                <EmptyNote text="No billed tickets in that range" icon="check-circle" />
              )}
              <Text style={[styles.note, { color: theme.text3 }]}>Nothing is deleted or changed on the tickets. Each becomes journal entries you can see and, if needed, reverse.</Text>
            </View>
          ) : null}
          {ticketAfter ? (
            <View>
              <ListRow icon="check-circle" iconColor={semantic.success} title={ticketAfter.text} />
              {checksBlock(ticketAfter.ba)}
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === 'stock' ? (
        <View>
          <Text style={[styles.note, { color: theme.text2 }]}>
            Stock that was on the shelf before the books began is counted in Stock, but the Inventory account was never told about it. This tells it — once — against Opening Balance Equity.
          </Text>
          {stock ? (
            <View>
              <StatGrid
                items={[
                  { label: 'Items to bring in', value: stock.totals.items },
                  { label: 'Value', value: money(stock.totals.value_paise) },
                  { label: 'Need a look first', value: stock.totals.flagged, color: stock.totals.flagged ? semantic.danger : undefined },
                ]}
              />
              {stock.ledger_vs_movements_paise ? (
                <ListRow
                  icon="alert"
                  iconColor={semantic.warning}
                  title="The Inventory account and the stock movements already differ"
                  subtitle={`Account ${money(stock.ledger_inventory_paise)} · movements ${money(stock.movements_value_paise)}`}
                />
              ) : null}
              {stock.bookable.length === 0 ? <EmptyNote text="Every item’s stock is already in the books" icon="check-circle" /> : null}
              {stock.bookable.map((r) => {
                const on = stockPick.has(r.item_id);
                return (
                  <ListRow
                    key={r.item_id}
                    icon={on ? 'check-circle' : 'box'}
                    iconColor={on ? semantic.success : undefined}
                    title={r.name}
                    subtitle={`${r.on_hand} ${r.unit || ''} on hand · ${r.unbooked_qty > 0 ? `${r.unbooked_qty} not in the books` : 'value only'} · ${money(r.avg_cost_paise)} each`}
                    meta={r.sku || undefined}
                    value={money(r.unbooked_value_paise)}
                    onPress={() => toggleIn(stockPick, r.item_id, setStockPick)}
                  />
                );
              })}
              {stock.bookable.length ? (
                <View>
                  <Field label="Stock counts from" value={stockDate} onChangeText={setStockDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                  <ActionButton label={`Bring the ticked items in (${stockPick.size})`} busy={busy === 'stock-apply'} onPress={postStock} />
                </View>
              ) : null}
              {stock.flagged.length ? <SectionLabel>Need a look first — not brought in</SectionLabel> : null}
              {stock.flagged.map((f, i) => (
                <ListRow key={`${f.name}-${i}`} icon="alert" iconColor={semantic.danger} title={f.name} subtitle={f.reason} meta={`On hand ${f.on_hand}`} />
              ))}
            </View>
          ) : null}
          {stockAfter ? (
            <View>
              <ListRow icon="check-circle" iconColor={semantic.success} title={stockAfter.text} />
              {checksBlock(stockAfter.ba)}
              <ActionButton label="Look again" tone="neutral" onPress={load} />
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === 'log' ? (
        <View>
          {log ? (
            <View>
              <Text style={[styles.note, { color: theme.text2 }]}>{log.note}</Text>
              <StatGrid
                items={[
                  { label: 'Entries to bring in', value: log.totals.entries },
                  { label: 'Billed', value: money(log.totals.billed_paise) },
                  { label: 'Paid', value: money(log.totals.paid_paise), color: semantic.success },
                  { label: 'On a ticket already', value: log.counts.on_a_ticket },
                  { label: 'Already brought in', value: log.counts.already_in },
                ]}
              />
              {log.candidates.length === 0 ? <EmptyNote text="Nothing left to bring in" icon="check-circle" /> : null}
              {log.candidates.length ? (
                <View>
                  <FilterChips
                    items={[
                      { key: 'cash', label: 'Paid money → Cash in hand' },
                      { key: 'bank', label: 'Paid money → Bank' },
                    ]}
                    activeKey={paidInto}
                    onSelect={(k) => setPaidInto(k as 'cash' | 'bank')}
                  />
                  <View style={styles.switchRow}>
                    <Switch
                      value={logPick.size === log.candidates.length}
                      onValueChange={(v) => setLogPick(v ? new Set(log.candidates.map((c) => c.id)) : new Set())}
                      trackColor={{ true: brand.primary }}
                    />
                    <Text style={[styles.note, { color: theme.text }]}>Select all ({logPick.size} ticked)</Text>
                  </View>
                  {log.candidates.map((r) => {
                    const on = logPick.has(r.id);
                    return (
                      <ListRow
                        key={r.id}
                        icon={on ? 'check-circle' : 'document'}
                        iconColor={on ? semantic.success : undefined}
                        title={r.customer}
                        subtitle={`${r.service || '—'} · ${r.technician || '—'}`}
                        meta={`${shortDate(r.date)}${r.phone ? ` · ${r.phone}` : ''}`}
                        value={money(r.amount_paise)}
                        badge={{ label: r.status, color: r.status === 'paid' ? semantic.success : semantic.warning }}
                        onPress={() => toggleIn(logPick, r.id, setLogPick)}
                      />
                    );
                  })}
                  <ActionButton label="Bring the ticked entries in" busy={busy === 'log-apply'} onPress={postLog} />
                </View>
              ) : null}
            </View>
          ) : null}
          {logAfter ? (
            <View>
              <ListRow icon="check-circle" iconColor={semantic.success} title={logAfter} />
              <ActionButton label="Look again" tone="neutral" onPress={load} />
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === 'history' ? (
        <View>
          {runs.length === 0 && !loading ? <EmptyNote text="Nothing has been brought in yet" icon="clock" /> : null}
          {runs.map((r, i) => (
            <View key={r.id || `${r.created_at}-${i}`}>
              <ListRow
                icon="clock"
                title={KIND[r.kind] || r.kind}
                subtitle={runLine(r)}
                meta={`${dateTime(r.created_at)}${r.by ? ` · ${r.by}` : ''}`}
                badge={r.status === 'partial' ? { label: 'Partly done', color: semantic.warning } : undefined}
              />
              {r.after?.checks?.filter((c) => !c.ok).map((c) => (
                <ListRow key={c.key} icon="alert" iconColor={semantic.danger} title={c.label} subtitle="Still not agreeing after this run" />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {tab === 'auto' && auto ? (
        <View>
          <Text style={[styles.note, { color: theme.text2 }]}>
            Each evening after 8 pm the admins get one notification: the day's sales and collections, the month so far, what customers owe and cash still with technicians.
          </Text>
          <View style={styles.switchRow}>
            <Switch value={auto.owner_digest_on} onValueChange={toggleDigest} trackColor={{ true: brand.primary }} />
            <Text style={[styles.note, { color: theme.text }]}>Send the evening summary</Text>
          </View>
          <Text style={[styles.note, { color: theme.text3 }]}>{auto.last_digest ? `Last sent for ${shortDate(auto.last_digest)}.` : 'Not sent yet.'}</Text>
          <ActionButton
            label="Send it now to see it"
            tone="neutral"
            busy={busy === 'digest'}
            onPress={() =>
              guard(
                'digest',
                async () => {
                  const out = await sendDigestNow();
                  setSent(out.sent ? `Sent: ${out.text}` : `Not sent — ${out.why}.`);
                },
                'Not sent',
              )
            }
          />
          {sent ? <Text style={[styles.note, { color: theme.text2 }]}>{sent}</Text> : null}
        </View>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.caption, marginVertical: spacing(2), lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginVertical: spacing(2) },
});
