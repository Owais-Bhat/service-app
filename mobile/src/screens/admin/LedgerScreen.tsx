import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import SectionLabel from '../../components/admin/SectionLabel';
import Icon from '../../components/Icon';
import { fetchTrialBalance, rupees } from '../../api/adminBooks';
import {
  Account,
  AuditRow,
  createLock,
  fetchAccounts,
  fetchAudit,
  fetchJournals,
  fetchLocks,
  Journal,
  JournalLine,
  loadJournal,
  PeriodLock,
  postJournal,
  postOpeningBalances,
  removeLock,
  reverseJournal,
  saveAccount,
} from '../../api/adminLedger';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { dateTime, humanize, inr, shortDate, todayIso } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Tab = 'journals' | 'trial' | 'coa' | 'opening' | 'locks' | 'audit';

const TYPE_COLOR: Record<string, string> = {
  asset: semantic.info,
  liability: semantic.warning,
  equity: '#7c5cfc',
  income: semantic.success,
  expense: semantic.danger,
};
const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

interface EntryLine {
  key: string;
  account: Account | null;
  debit: string;
  credit: string;
  memo: string;
}
let k = 0;
const blankLine = (): EntryLine => ({ key: `e${++k}`, account: null, debit: '', credit: '', memo: '' });

// The books: journals (with manual entry and reversal), trial balance, chart of
// accounts, opening balances, period locks and the audit trail. A posted
// journal is never edited — a mistake is reversed and both stay visible.
export default function LedgerScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('journals');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    const accounts = await fetchAccounts().catch(() => [] as Account[]);
    if (tab === 'journals') return { accounts, journals: await fetchJournals('', '') };
    if (tab === 'trial') return { accounts, trial: await fetchTrialBalance() };
    if (tab === 'locks') return { accounts, locks: await fetchLocks() };
    if (tab === 'audit') return { accounts, audit: await fetchAudit() };
    return { accounts };
  }, [tab]);
  const data = useLoader(fetcher, 'Could not load the books');
  const d = data.data;

  // journal detail
  const [detail, setDetail] = useState<{ journal: Journal; lines: JournalLine[] } | null>(null);
  const [reverseWhy, setReverseWhy] = useState('');
  const [reversing, setReversing] = useState(false);
  // manual entry
  const [entering, setEntering] = useState(false);
  const [eDate, setEDate] = useState(todayIso());
  const [eNarr, setENarr] = useState('');
  const [eLines, setELines] = useState<EntryLine[]>([blankLine(), blankLine()]);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [acctQ, setAcctQ] = useState('');
  // account editor
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [aCode, setACode] = useState('');
  const [aName, setAName] = useState('');
  const [aType, setAType] = useState('expense');
  const [aSub, setASub] = useState('other');
  const [aOpen, setAOpen] = useState('');
  const [aActive, setAActive] = useState(true);
  // opening / lock
  const [asOn, setAsOn] = useState(todayIso());
  const [lockDate, setLockDate] = useState(todayIso());
  const [lockWhy, setLockWhy] = useState('');
  const [unlock, setUnlock] = useState<PeriodLock | null>(null);
  const [unlockWhy, setUnlockWhy] = useState('');

  const act = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key);
    try {
      await fn();
      after?.();
      await data.reload();
    } catch (e) {
      Alert.alert('Could not complete', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const accounts = d?.accounts ?? [];
  const q = query.trim().toLowerCase();
  const journals = useMemo(() => (d?.journals ?? []).filter((j) => !q || `${j.journal_no || ''} ${j.narration || ''} ${j.source_type}`.toLowerCase().includes(q)), [d, q]);
  const trialRows = useMemo(
    () => (d?.trial?.accounts ?? []).filter((a) => a.debit_paise !== 0 || a.credit_paise !== 0).filter((a) => !q || `${a.code} ${a.name}`.toLowerCase().includes(q)),
    [d, q],
  );
  const coa = useMemo(() => accounts.filter((a) => !q || `${a.code} ${a.name}`.toLowerCase().includes(q)), [accounts, q]);
  const acctMatches = useMemo(() => {
    const s = acctQ.trim().toLowerCase();
    if (!pickFor || s.length < 1) return [];
    return accounts.filter((a) => Number(a.active) === 1 && `${a.code} ${a.name}`.toLowerCase().includes(s)).slice(0, 8);
  }, [accounts, acctQ, pickFor]);

  const debit = eLines.reduce((s, l) => s + Math.round((Number(l.debit) || 0) * 100), 0);
  const credit = eLines.reduce((s, l) => s + Math.round((Number(l.credit) || 0) * 100), 0);
  const balanced = debit > 0 && debit === credit;

  const openJournal = async (id: string) => {
    setBusy(id);
    try {
      setDetail(await loadJournal(id));
      setReversing(false);
      setReverseWhy('');
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const openAccount = (a: Account | 'new') => {
    setACode(a === 'new' ? '' : a.code);
    setAName(a === 'new' ? '' : a.name);
    setAType(a === 'new' ? 'expense' : a.type);
    setASub(a === 'new' ? 'other' : a.subtype || 'other');
    setAOpen(a === 'new' ? '' : String(rupees(a.opening_balance_paise)));
    setAActive(a === 'new' ? true : Number(a.active) === 1);
    setEditing(a);
  };

  const t = d?.trial;
  const balances = t ? t.totals.debit_paise === t.totals.credit_paise : true;

  return (
    <AdminScreen
      title="Ledger & Journals"
      subtitle="The books, read from posted journals"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      headerRight={
        tab === 'journals' || tab === 'coa' ? (
          <Pressable
            onPress={() => {
              if (tab === 'coa') return openAccount('new');
              setEDate(todayIso());
              setENarr('');
              setELines([blankLine(), blankLine()]);
              setEntering(true);
            }}
            hitSlop={8}
            style={[styles.add, { backgroundColor: brand.primary }]}
            accessibilityLabel="Add"
          >
            <Icon name="add" size={20} color="#fff" />
          </Pressable>
        ) : undefined
      }
      toolbar={
        <>
          {tab === 'journals' || tab === 'trial' || tab === 'coa' ? <SearchField value={query} onChangeText={setQuery} placeholder="Code, name or narration" /> : null}
          <FilterChips
            activeKey={tab}
            onSelect={(x) => setTab(x as Tab)}
            items={[
              { key: 'journals', label: 'Journals' },
              { key: 'trial', label: 'Trial balance' },
              { key: 'coa', label: 'Accounts' },
              { key: 'opening', label: 'Opening' },
              { key: 'locks', label: 'Period locks' },
              { key: 'audit', label: 'Audit trail' },
            ]}
          />
        </>
      }
    >
      {tab === 'journals' ? (
        <>
          {journals.length === 0 ? <EmptyNote text="No journals posted yet" icon="book" /> : null}
          {journals.map((j) => (
            <ListRow
              key={j.id}
              icon="book"
              iconColor={j.status === 'reversed' ? semantic.danger : undefined}
              title={`${j.journal_no || 'Journal'} · ${humanize(j.source_type)}`}
              subtitle={j.narration || undefined}
              meta={`${shortDate(j.journal_date)}${j.posted_by_name ? ` · ${j.posted_by_name}` : ''}`}
              value={inr(rupees(j.total_paise))}
              badge={j.status === 'reversed' ? { label: 'Reversed', color: semantic.danger } : j.reversal_of_id ? { label: 'Reversal', color: semantic.warning } : undefined}
              onPress={() => openJournal(j.id)}
            />
          ))}
        </>
      ) : null}

      {tab === 'trial' && t ? (
        <>
          <StatGrid
            items={[
              { label: 'Total debit', value: inr(rupees(t.totals.debit_paise)) },
              { label: 'Total credit', value: inr(rupees(t.totals.credit_paise)) },
              { label: balances ? 'Books balance' : 'Books do NOT balance', value: balances ? '✓' : '!', color: balances ? semantic.success : semantic.danger },
            ]}
          />
          {trialRows.length === 0 ? <EmptyNote text="No account has movement" icon="book" /> : null}
          {trialRows.map((a) => (
            <ListRow
              key={a.id}
              icon="book"
              iconColor={TYPE_COLOR[a.type]}
              title={`${a.code} · ${a.name}`}
              subtitle={`Dr ${inr(rupees(a.debit_paise))} · Cr ${inr(rupees(a.credit_paise))}`}
              value={inr(rupees(a.balance_paise))}
              badge={{ label: humanize(a.type), color: TYPE_COLOR[a.type] ?? semantic.info }}
            />
          ))}
        </>
      ) : null}

      {tab === 'coa' ? (
        <>
          {coa.length === 0 ? <EmptyNote text="No account matches" icon="book" /> : null}
          {coa.map((a) => (
            <ListRow
              key={a.id}
              icon="book"
              iconColor={TYPE_COLOR[a.type]}
              title={`${a.code} · ${a.name}`}
              subtitle={`${humanize(a.type)}${a.subtype ? ` · ${humanize(a.subtype)}` : ''}`}
              meta={Number(a.opening_balance_paise) ? `Opening ${inr(rupees(a.opening_balance_paise))}` : undefined}
              badge={Number(a.is_system) === 1 ? { label: 'System', color: '#6d8278' } : Number(a.active) !== 1 ? { label: 'Inactive', color: semantic.danger } : undefined}
              onPress={() => openAccount(a)}
            />
          ))}
        </>
      ) : null}

      {tab === 'opening' ? (
        <>
          <Text style={[styles.note, { color: theme.text2 }]}>
            Turns the opening figures captured on customers, suppliers and accounts into one posted journal, with Opening Balance Equity as the other side. Running it twice for the same date returns the first journal instead of doubling the books.
          </Text>
          <Field label="As on" value={asOn} onChangeText={setAsOn} hint="YYYY-MM-DD" />
          <ActionButton
            label="Post opening balances"
            tone="success"
            busy={busy === 'open'}
            onPress={() =>
              Alert.alert('Post opening balances?', `As on ${asOn}. Take a backup first if this is the first time.`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Post',
                  onPress: () =>
                    act('open', async () => {
                      const out = await postOpeningBalances(asOn);
                      Alert.alert('Done', out.reused ? 'Opening balances were already posted for this date.' : `Posted${out.journal?.journal_no ? ` as ${out.journal.journal_no}` : ''}.`);
                    }),
                },
              ])
            }
          />
        </>
      ) : null}

      {tab === 'locks' ? (
        <>
          <Text style={[styles.note, { color: theme.text2 }]}>Nothing can be posted, changed or reversed on or before a locked date.</Text>
          <Field label="Lock everything up to" value={lockDate} onChangeText={setLockDate} hint="YYYY-MM-DD" />
          <Field label="Reason" value={lockWhy} onChangeText={setLockWhy} placeholder="e.g. March returns filed" />
          <ActionButton
            label="Lock the period"
            tone="danger"
            busy={busy === 'lock'}
            onPress={() => {
              if (!lockWhy.trim()) return Alert.alert('Reason', 'Say why the period is being locked.');
              act('lock', () => createLock(lockDate, lockWhy.trim()), () => setLockWhy(''));
            }}
          />
          <SectionLabel>Locks</SectionLabel>
          {(d?.locks ?? []).length === 0 ? <EmptyNote text="No period is locked" icon="lock" /> : null}
          {(d?.locks ?? []).map((l) => (
            <ListRow
              key={l.id}
              icon="lock"
              iconColor={semantic.warning}
              title={`Locked up to ${shortDate(l.locked_upto)}`}
              subtitle={l.reason || undefined}
              meta={`${l.locked_by_name || ''} · ${dateTime(l.created_at)}`}
              footer={<ActionButton label="Unlock" tone="neutral" onPress={() => { setUnlock(l); setUnlockWhy(''); }} />}
            />
          ))}
        </>
      ) : null}

      {tab === 'audit' ? (
        <>
          {(d?.audit ?? []).length === 0 ? <EmptyNote text="Nothing recorded yet" icon="shield" /> : null}
          {(d?.audit ?? []).map((a) => (
            <ListRow
              key={a.id}
              icon="shield"
              title={humanize(a.action.replace(/\./g, ' '))}
              subtitle={`${humanize(a.entity_type)}${a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ''}${a.reason ? ` — ${a.reason}` : ''}`}
              meta={`${a.actor_name || humanize(a.actor_role) || ''} · ${dateTime(a.created_at)}`}
            />
          ))}
        </>
      ) : null}

      {/* Journal detail */}
      <FormSheet
        visible={!!detail}
        title={detail?.journal.journal_no || 'Journal'}
        subtitle={detail ? `${shortDate(detail.journal.journal_date)} · ${humanize(detail.journal.source_type)} · ${humanize(detail.journal.status)}` : undefined}
        onClose={() => setDetail(null)}
        footer={
          detail && detail.journal.status === 'posted' && !detail.journal.reversal_of_id ? (
            reversing ? (
              <>
                <ActionButton label="Back" tone="neutral" onPress={() => setReversing(false)} />
                <ActionButton
                  label="Reverse"
                  tone="danger"
                  busy={busy === 'rev'}
                  onPress={() => {
                    if (!reverseWhy.trim()) return Alert.alert('Reason', 'A reversal needs a reason.');
                    act('rev', () => reverseJournal(detail.journal.id, reverseWhy.trim()), () => setDetail(null));
                  }}
                />
              </>
            ) : (
              <ActionButton label="Reverse this entry" tone="danger" onPress={() => setReversing(true)} />
            )
          ) : undefined
        }
      >
        {detail ? (
          <>
            {detail.journal.narration ? <Text style={[styles.note, { color: theme.text }]}>{detail.journal.narration}</Text> : null}
            {detail.lines.map((l) => (
              <View key={l.id} style={[styles.kv, { borderBottomColor: theme.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.v, { color: theme.text, textAlign: 'left' }]} numberOfLines={1}>{l.account_code} · {l.account_name}</Text>
                  <Text style={[styles.k, { color: theme.text3 }]}>{[l.party_name, l.memo].filter(Boolean).join(' · ') || '—'}</Text>
                </View>
                <Text style={[styles.v, { color: Number(l.debit_paise) ? theme.text : semantic.success }]}>
                  {Number(l.debit_paise) ? `Dr ${inr(rupees(l.debit_paise))}` : `Cr ${inr(rupees(l.credit_paise))}`}
                </Text>
              </View>
            ))}
            {detail.journal.reversal_reason ? <Text style={[styles.note, { color: semantic.danger }]}>Reversed — {detail.journal.reversal_reason}</Text> : null}
            {reversing ? <Field label="Why is it being reversed?" value={reverseWhy} onChangeText={setReverseWhy} multiline /> : null}
          </>
        ) : null}
      </FormSheet>

      {/* Manual entry */}
      <FormSheet
        visible={entering}
        title="Manual journal entry"
        onClose={() => setEntering(false)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEntering(false)} />
            <ActionButton
              label="Post entry"
              tone="success"
              disabled={!balanced}
              busy={busy === 'post'}
              onPress={() => {
                const lines = eLines
                  .filter((l) => l.account && (Number(l.debit) || Number(l.credit)))
                  .map((l) => ({ account_id: (l.account as Account).id, debit: l.debit || 0, credit: l.credit || 0, memo: l.memo.trim() }));
                if (lines.length < 2) return Alert.alert('Lines', 'Pick an account and an amount on at least two lines.');
                act('post', () => postJournal({ date: eDate, narration: eNarr.trim(), lines, idempotency_key: `manual:${eDate}:${Date.now()}` }), () => setEntering(false));
              }}
            />
          </>
        }
      >
        <Field label="Date" value={eDate} onChangeText={setEDate} hint="YYYY-MM-DD" />
        <Field label="Narration" value={eNarr} onChangeText={setENarr} placeholder="What is this entry for?" />
        {eLines.map((l, i) => (
          <View key={l.key} style={[styles.line, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
            <View style={styles.lineHead}>
              <Text style={[styles.k, { color: theme.text3 }]}>Line {i + 1}</Text>
              <Pressable onPress={() => (eLines.length > 2 ? setELines((p) => p.filter((x) => x.key !== l.key)) : Alert.alert('Lines', 'An entry needs at least two lines'))} hitSlop={10}>
                <Icon name="close" size={18} color={theme.text3} />
              </Pressable>
            </View>
            {l.account ? (
              <Pressable onPress={() => { setELines((p) => p.map((x) => (x.key === l.key ? { ...x, account: null } : x))); setPickFor(l.key); setAcctQ(''); }}>
                <Text style={[styles.v, { color: theme.text, textAlign: 'left' }]}>{l.account.code} · {l.account.name}</Text>
              </Pressable>
            ) : (
              <>
                <SearchField value={pickFor === l.key ? acctQ : ''} onChangeText={(v) => { setPickFor(l.key); setAcctQ(v); }} placeholder="Account code or name" />
                {pickFor === l.key
                  ? acctMatches.map((a) => (
                      <ListRow key={a.id} icon="book" title={`${a.code} · ${a.name}`} subtitle={humanize(a.type)} onPress={() => { setELines((p) => p.map((x) => (x.key === l.key ? { ...x, account: a } : x))); setPickFor(null); setAcctQ(''); }} />
                    ))
                  : null}
              </>
            )}
            <View style={styles.row}>
              <View style={styles.cell}><Field label="Debit ₹" value={l.debit} onChangeText={(v) => setELines((p) => p.map((x) => (x.key === l.key ? { ...x, debit: v, credit: v ? '' : x.credit } : x)))} keyboardType="numeric" /></View>
              <View style={styles.cell}><Field label="Credit ₹" value={l.credit} onChangeText={(v) => setELines((p) => p.map((x) => (x.key === l.key ? { ...x, credit: v, debit: v ? '' : x.debit } : x)))} keyboardType="numeric" /></View>
            </View>
            <Field label="Memo" value={l.memo} onChangeText={(v) => setELines((p) => p.map((x) => (x.key === l.key ? { ...x, memo: v } : x)))} />
          </View>
        ))}
        <ActionButton label="+ Add line" tone="neutral" onPress={() => setELines((p) => [...p, blankLine()])} />
        <View style={[styles.totals, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
          <View style={styles.totalRow}><Text style={[styles.k, { color: theme.text2 }]}>Debit</Text><Text style={[styles.v, { color: theme.text }]}>{inr(debit / 100)}</Text></View>
          <View style={styles.totalRow}><Text style={[styles.k, { color: theme.text2 }]}>Credit</Text><Text style={[styles.v, { color: theme.text }]}>{inr(credit / 100)}</Text></View>
          <Text style={[styles.k, { color: balanced ? semantic.success : semantic.warning }]}>
            {balanced ? 'Balanced — ready to post' : debit === credit ? 'Enter amounts' : `Difference ${inr(Math.abs(debit - credit) / 100)}`}
          </Text>
        </View>
      </FormSheet>

      {/* Account editor */}
      <FormSheet
        visible={editing !== null}
        title={editing === 'new' ? 'New account' : 'Edit account'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} />
            <ActionButton
              label="Save"
              busy={busy === 'acct'}
              onPress={() => {
                if (!aName.trim()) return Alert.alert('Name', 'A name is required');
                if (editing === 'new' && !aCode.trim()) return Alert.alert('Code', 'A code is required');
                const existing = editing && editing !== 'new' ? editing : null;
                act(
                  'acct',
                  () =>
                    saveAccount(existing, {
                      name: aName.trim(),
                      subtype: aSub.trim() || 'other',
                      opening_balance: aOpen || 0,
                      ...(existing ? { active: aActive } : { code: aCode.trim(), type: aType }),
                    }),
                  () => setEditing(null),
                );
              }}
            />
          </>
        }
      >
        <Field label="Code" value={aCode} onChangeText={setACode} placeholder="e.g. 5810" />
        <Field label="Name" value={aName} onChangeText={setAName} />
        <Text style={[styles.k, { color: theme.text3 }]}>Type</Text>
        <View style={styles.chips}>
          {TYPES.map((x) => {
            const on = aType === x;
            return (
              <Pressable key={x} disabled={editing !== 'new'} onPress={() => setAType(x)} style={[styles.chip, { opacity: editing !== 'new' && !on ? 0.4 : 1, borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}>
                <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{humanize(x)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Sub-type" value={aSub} onChangeText={setASub} />
        <Field label="Opening balance ₹" value={aOpen} onChangeText={setAOpen} keyboardType="numeric" />
        {editing && editing !== 'new' && Number(editing.is_system) !== 1 ? (
          <View style={styles.switchRow}>
            <Text style={[styles.v, { color: theme.text, textAlign: 'left' }]}>Active</Text>
            <Switch value={aActive} onValueChange={setAActive} trackColor={{ true: brand.primary, false: theme.line }} />
          </View>
        ) : null}
      </FormSheet>

      {/* Unlock */}
      <FormSheet
        visible={!!unlock}
        title="Unlock period"
        subtitle={unlock ? `Locked up to ${shortDate(unlock.locked_upto)}` : undefined}
        onClose={() => setUnlock(null)}
        footer={
          <>
            <ActionButton label="Back" tone="neutral" onPress={() => setUnlock(null)} />
            <ActionButton
              label="Unlock"
              tone="danger"
              busy={busy === 'unlock'}
              onPress={() => {
                if (!unlockWhy.trim()) return Alert.alert('Reason', 'Unlocking needs a reason.');
                act('unlock', () => removeLock((unlock as PeriodLock).id, unlockWhy.trim()), () => setUnlock(null));
              }}
            />
          </>
        }
      >
        <Field label="Why is it being unlocked?" value={unlockWhy} onChangeText={setUnlockWhy} multiline />
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  note: { ...typography.body, fontSize: 14 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2), borderBottomWidth: StyleSheet.hairlineWidth },
  k: { ...typography.caption, fontSize: 12 },
  v: { ...typography.body, fontSize: 14, fontFamily: 'Manrope_700Bold', textAlign: 'right' },
  line: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), gap: spacing(2) },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', gap: spacing(2) },
  cell: { flex: 1 },
  totals: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), gap: spacing(1.5) },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  chipText: { ...typography.caption, fontSize: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
