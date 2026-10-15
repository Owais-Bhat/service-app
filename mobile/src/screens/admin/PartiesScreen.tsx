import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
import PartyEditor from '../../components/admin/PartyEditor';
import { ContactButton, HeaderAction, InitialsTile, KvLine, MiniStat, RowPanel } from '../../components/admin/FinanceKit';
import Icon from '../../components/Icon';
import { fetchParties, fetchPartySummary, rupees } from '../../api/adminBooks';
import {
  DuplicateGroup,
  fetchDuplicates,
  fetchPartyDetail,
  fetchSupplierSummary,
  mergeParties,
  PartyDetail,
  SupplierSummary,
} from '../../api/adminParties';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { GST_TREATMENTS, stateName } from '../../utils/gst';
import { humanize, inr, shortDate } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Kind = 'all' | 'customer' | 'supplier' | 'duplicates';

// The address book every module shares, with each party's balance read from the
// ledger. Positive = they owe us; negative = we owe them. Tap a party for the
// full record; "+" adds one; the Duplicates tab merges look-alikes.
export default function PartiesScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [kind, setKind] = useState<Kind>('customer');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [detail, setDetail] = useState<PartyDetail | null>(null);
  const [supplier, setSupplier] = useState<SupplierSummary | null>(null);
  const [editor, setEditor] = useState<PartyDetail['party'] | 'new' | null>(null);
  const [dups, setDups] = useState<DuplicateGroup[]>([]);
  const [keep, setKeep] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const listKind = kind === 'duplicates' ? 'all' : kind;
  const data = useLoader(async () => {
    const [rows, summary] = await Promise.all([fetchParties(listKind, debounced), fetchPartySummary(listKind)]);
    return { rows, summary };
  }, 'Could not load customers');
  const { reload } = data;
  useEffect(() => {
    reload();
  }, [listKind, debounced, reload]);

  useEffect(() => {
    if (kind === 'duplicates') fetchDuplicates().then(setDups).catch(() => setDups([]));
  }, [kind]);

  const open = useCallback(async (id: string) => {
    setBusy(id);
    try {
      const d = await fetchPartyDetail(id);
      setDetail(d);
      setSupplier(null);
      if (d.party.kind === 'supplier' || d.party.kind === 'both') fetchSupplierSummary(id).then(setSupplier).catch(() => setSupplier(null));
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  }, []);

  const merge = (gi: number, g: DuplicateGroup) => {
    const keepId = keep[gi] || g.parties[0].id;
    const reason = (reasons[gi] || '').trim();
    if (!reason) return Alert.alert('Reason needed', 'A merge is permanent — say why these are the same party.');
    const ids = g.parties.map((p) => p.id).filter((id) => id !== keepId);
    Alert.alert('Merge records?', `${ids.length} record${ids.length === 1 ? '' : 's'} will be merged into the one you kept. Balances and addresses move across.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Merge',
        style: 'destructive',
        onPress: async () => {
          setBusy(`merge-${gi}`);
          try {
            await mergeParties(keepId, ids, reason);
            setDups(await fetchDuplicates());
            await reload();
          } catch (e) {
            Alert.alert('Could not merge', e instanceof Error ? e.message : 'Try again');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const s = data.data?.summary;
  const rows = data.data?.rows ?? [];
  const p = detail?.party;
  const balance = rupees(detail?.receivable_paise);

  return (
    <AdminScreen
      title="Customers & Suppliers"
      subtitle={s ? `${s.count} parties` : undefined}
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading && !data.data}
      error={!data.data ? data.error : null}
      headerRight={
        <HeaderAction icon="add" label="New party" onPress={() => setEditor('new')} />
      }
      toolbar={
        <>
          {kind !== 'duplicates' ? <SearchField value={query} onChangeText={setQuery} placeholder="Name, phone or GSTIN" /> : null}
          <FilterChips
            activeKey={kind}
            onSelect={(k) => setKind(k as Kind)}
            items={[
              { key: 'customer', label: 'Customers' },
              { key: 'supplier', label: 'Suppliers' },
              { key: 'all', label: 'All' },
              { key: 'duplicates', label: 'Duplicates' },
            ]}
          />
        </>
      }
    >
      {kind === 'duplicates' ? (
        <>
          {dups.length === 0 ? <EmptyNote text="No likely duplicates. Matching is by phone, GSTIN and name." icon="check-circle" /> : null}
          {dups.map((g, gi) => {
            const chosen = keep[gi] || g.parties[0].id;
            return (
              <View key={gi} style={[styles.dup, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                <Text style={[styles.dupTitle, { color: theme.text }]}>{g.parties[0].display_name}</Text>
                <Text style={[styles.dupNote, { color: theme.text3 }]}>matched on {g.reason}</Text>
                {g.parties.map((pt) => {
                  const on = chosen === pt.id;
                  return (
                    <Pressable key={pt.id} onPress={() => setKeep((k) => ({ ...k, [gi]: pt.id }))} style={styles.dupRow}>
                      <Icon name={on ? 'check-circle' : 'tasks'} size={20} color={on ? theme.accent : theme.text3} filled={on} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dupName, { color: theme.text }]}>{pt.display_name}</Text>
                        <Text style={[styles.dupNote, { color: theme.text3 }]}>{[pt.phone, pt.gstin].filter(Boolean).join(' · ') || '—'}</Text>
                      </View>
                      {on ? <Text style={[styles.dupKeep, { color: theme.accent }]}>Keep</Text> : null}
                    </Pressable>
                  );
                })}
                <Field label="Why are these the same party?" value={reasons[gi] || ''} onChangeText={(v) => setReasons((r) => ({ ...r, [gi]: v }))} />
                <ActionButton label="Merge the rest into the kept one" tone="danger" busy={busy === `merge-${gi}`} onPress={() => merge(gi, g)} />
              </View>
            );
          })}
        </>
      ) : (
        <>
          {s ? (
            <StatGrid
              items={[
                { label: `Owe us (${s.owing_count})`, value: inr(rupees(s.owing_paise)), color: s.owing_paise ? theme.warn : undefined },
                { label: `We owe (${s.credit_count})`, value: inr(rupees(s.credit_paise)), color: s.credit_paise ? theme.err : undefined },
              ]}
            />
          ) : null}
          {rows.length === 0 ? <EmptyNote text="No party matches" icon="people" /> : null}
          {rows.map((pt) => {
            const bal = rupees(pt.balance_paise);
            return (
              <ListRow
                key={pt.id}
                icon="user"
                title={pt.display_name}
                subtitle={[pt.phone, pt.gstin].filter(Boolean).join(' · ') || undefined}
                meta={`${humanize(pt.kind)}${busy === pt.id ? ' · opening…' : ''}`}
                value={bal === 0 ? undefined : inr(Math.abs(bal))}
                valueColor={bal > 0 ? theme.warn : theme.err}
                badge={bal === 0 ? { label: 'Settled', color: theme.ok } : { label: bal > 0 ? 'Owes us' : 'We owe', color: bal > 0 ? theme.warn : theme.err }}
                onPress={() => open(pt.id)}
              />
            );
          })}
        </>
      )}

      <FormSheet
        visible={!!detail}
        title={p?.display_name || 'Party'}
        subtitle={p ? humanize(p.kind) : undefined}
        onClose={() => setDetail(null)}
        footer={
          p ? (
            <>
                <ActionButton label="Edit" onPress={() => { setEditor(p); setDetail(null); }} />
            </>
          ) : undefined
        }
      >
        {p ? (
          <>
            <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.heroTop}>
                <InitialsTile name={p.display_name} tint={theme.info} tintBg={theme.infoS} />
                <View style={styles.heroText}>
                  <Text style={[styles.heroName, { color: theme.text }]} numberOfLines={2}>{p.display_name}</Text>
                  <Text style={[styles.heroSub, { color: theme.text3 }]} numberOfLines={1}>
                    {[p.gstin ? `GSTIN ${p.gstin}` : null, humanize(p.kind)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
              <View style={styles.heroStats}>
                <MiniStat
                  label={balance > 0 ? 'Owes us' : balance < 0 ? (p.kind === 'supplier' ? 'We owe them' : 'In advance') : 'Settled'}
                  value={inr(Math.abs(balance))}
                  color={balance > 0 ? theme.warn : balance < 0 ? theme.err : theme.ok}
                />
                <MiniStat label="Credit terms" value={Number(p.credit_days) ? `${p.credit_days} days` : 'On delivery'} mono={false} />
              </View>
              {p.phone ? (
                <View style={styles.contactRow}>
                  <ContactButton icon="phone" label="Call" onPress={() => Linking.openURL(`tel:${p.phone}`)} />
                  <ContactButton icon="whatsapp" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${String(p.phone).replace(/\D/g, '')}`)} />
                </View>
              ) : null}
            </View>
            <RowPanel>
              {[
                ['Phone', p.phone || '—'],
                ['Email', p.email || '—'],
                ['GST treatment', GST_TREATMENTS.find(([k]) => k === p.gst_treatment)?.[1] || '—'],
                ['GSTIN', p.gstin || '—'],
                ['Place of supply', stateName(p.place_of_supply_state_code) || '—'],
                ['Credit limit', Number(p.credit_limit_paise) ? inr(rupees(p.credit_limit_paise)) : 'None'],
                ['Opening balance', `${inr(rupees(p.opening_balance_paise))} ${p.opening_balance_type || ''}`],
                ['Active', Number(p.active) === 1 ? 'Yes' : 'No'],
              ].map(([k, v], i, all) => (
                <KvLine key={k} label={k} value={v} mono={k === 'GSTIN' || k === 'Opening balance' || k === 'Credit limit' || k === 'Phone'} last={i === all.length - 1} />
              ))}
            </RowPanel>
            {detail?.addresses.length ? (
              <>
                <SectionLabel>Addresses</SectionLabel>
                {detail.addresses.map((a) => (
                  <Text key={a.id} style={[styles.v, { color: theme.text2 }]}>
                    {[a.line1, a.city, a.pincode].filter(Boolean).join(', ') || '—'}
                  </Text>
                ))}
              </>
            ) : null}
            {p.notes ? (
              <>
                <SectionLabel>Notes</SectionLabel>
                <Text style={[styles.v, { color: theme.text2 }]}>{p.notes}</Text>
              </>
            ) : null}
            {supplier ? (
              <>
                <SectionLabel>Supplier dealings</SectionLabel>
                <StatGrid
                  items={[
                    { label: 'Bought (bills)', value: inr(rupees(supplier.totals.bought_paise)) },
                    { label: 'Paid', value: inr(rupees(supplier.totals.paid_paise)), color: theme.ok },
                    { label: 'Due on bills', value: inr(rupees(supplier.totals.billed_due_paise)), color: theme.warn },
                    { label: 'Returned', value: inr(rupees(supplier.totals.returned_paise)) },
                  ]}
                />
                <RowPanel>
                  {supplier.bills.slice(0, 8).map((b, i, all) => (
                    <KvLine key={b.id} label={`${b.doc_no} · ${shortDate(b.doc_date)}`} value={inr(rupees(b.total_paise))} mono valueColor={b.balance_paise > 0 ? theme.warn : theme.text2} last={i === all.length - 1} />
                  ))}
                </RowPanel>
              </>
            ) : null}
          </>
        ) : null}
      </FormSheet>

      <PartyEditor
        visible={editor !== null}
        party={editor && editor !== 'new' ? editor : null}
        defaultKind={kind === 'supplier' ? 'supplier' : 'customer'}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          reload();
        }}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  dup: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5), marginBottom: spacing(3), gap: spacing(2) },
  dupTitle: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  dupNote: { ...typography.caption, fontSize: 11 },
  dupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(1.5) },
  dupName: { ...typography.body, fontSize: 14 },
  dupKeep: { ...typography.caption, fontFamily: 'Manrope_700Bold' },
  hero: { borderWidth: 1, borderRadius: radius.xl, padding: spacing(4), gap: spacing(2.5) },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  heroText: { flex: 1, minWidth: 0 },
  heroName: { ...typography.heading },
  heroSub: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, marginTop: 2 },
  heroStats: { flexDirection: 'row', gap: spacing(2.5) },
  contactRow: { flexDirection: 'row', gap: spacing(2) },
  v: { ...typography.body, fontSize: 14, textAlign: 'right', flexShrink: 1 },
});
