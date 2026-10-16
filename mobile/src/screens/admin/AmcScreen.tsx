import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HeaderAction, Overline } from '../../components/admin/FinanceKit';
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
import Icon from '../../components/Icon';
import NewPartyButton from '../../components/admin/NewPartyButton';
import { fetchAmc, fetchParties, PartyRow, rupees } from '../../api/adminBooks';
import {
  AmcLoaded,
  cancelAmc,
  coverDevices,
  createAmc,
  fetchRenewals,
  invoiceAmc,
  loadAmc,
  logVisit,
  markReminded,
  removeVisit,
  renewAmc,
  RenewalDue,
  sendRenewalWhatsapp,
  updateAmc,
} from '../../api/adminAmc';
import { fetchTaxRates, TaxRate } from '../../api/adminSales';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { humanize, inr, shortDate, todayIso } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'active' | 'lapsing' | 'expired' | 'renewals' | 'all';

const oneYearOn = (start: string) => {
  const d = new Date(`${start}T00:00:00`);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Annual maintenance contracts, end to end: create, invoice the term, log the
// free visits, chase the renewal and renew. An AMC invoice is an ordinary sales
// invoice, so it ages and is chased and paid like any other.
export default function AmcScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const STATE_COLOR: Record<string, string> = { active: theme.ok, upcoming: theme.info, renewed: theme.grey, expired: theme.err, cancelled: theme.grey };
  const data = useLoader(async () => {
    const [list, renewals, tax] = await Promise.all([fetchAmc(), fetchRenewals().catch(() => [] as RenewalDue[]), fetchTaxRates().catch(() => [] as TaxRate[])]);
    return { list, renewals, tax };
  }, 'Could not load AMC contracts');
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<AmcLoaded | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // contract editor
  const [editing, setEditing] = useState<AmcLoaded | 'new' | null>(null);
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyQ, setPartyQ] = useState('');
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [title, setTitle] = useState('');
  const [site, setSite] = useState('');
  const [equip, setEquip] = useState('');
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(oneYearOn(todayIso()));
  const [visits, setVisits] = useState('4');
  const [amount, setAmount] = useState('');
  const [tax, setTax] = useState('1800');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');

  // visit / renew / cancel
  const [visitFor, setVisitFor] = useState<AmcLoaded | null>(null);
  const [vDate, setVDate] = useState(todayIso());
  const [vKind, setVKind] = useState('scheduled');
  const [vTicket, setVTicket] = useState('');
  const [vNote, setVNote] = useState('');
  const [renewFor, setRenewFor] = useState<{ id: string; amount: number } | null>(null);
  const [rnStart, setRnStart] = useState('');
  const [rnAmount, setRnAmount] = useState('');
  const [rnInvoice, setRnInvoice] = useState(true);
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [cancelWhy, setCancelWhy] = useState('');

  const contracts = data.data?.list.contracts ?? [];
  const s = data.data?.list.summary;
  const renewals = data.data?.renewals ?? [];
  const gst = (data.data?.tax ?? []).filter((t) => t.treatment === 'gst' && !t.effective_to);

  useEffect(() => {
    if (!partyQ.trim()) return setParties([]);
    const t = setTimeout(() => fetchParties('customer', partyQ.trim()).then((r) => setParties(r.slice(0, 8))).catch(() => setParties([])), 250);
    return () => clearTimeout(t);
  }, [partyQ]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts
      .filter((c) => {
        if (filter === 'active') return c.state === 'active';
        if (filter === 'lapsing') return c.state === 'active' && (c.days_left ?? 999) <= 30;
        if (filter === 'expired') return c.state === 'expired';
        return filter === 'all';
      })
      .filter((c) => !q || `${c.contract_no} ${c.title || ''} ${c.party_name || ''} ${c.party_phone || ''}`.toLowerCase().includes(q));
  }, [contracts, filter, query]);

  const act = useCallback(
    async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
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
    },
    [data],
  );

  const open = async (id: string) => {
    setBusy(id);
    try {
      setDetail(await loadAmc(id));
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const openEditor = (c: AmcLoaded | 'new') => {
    if (c === 'new') {
      const t = todayIso();
      setPartyId('');
      setPartyName('');
      setTitle('');
      setSite('');
      setEquip('');
      setStart(t);
      setEnd(oneYearOn(t));
      setVisits('4');
      setAmount('');
      setTax(String(gst.find((x) => Number(x.rate_bps) === 1800)?.rate_bps ?? 1800));
      setTerms('');
      setNotes('');
    } else {
      const k = c.contract;
      setPartyId(k.party_id);
      setPartyName(k.party_name || '');
      setTitle(k.title || '');
      setSite(k.site || '');
      setEquip(k.equipment || '');
      setStart(String(k.start_date).slice(0, 10));
      setEnd(String(k.end_date).slice(0, 10));
      setVisits(k.visits_included == null ? '' : String(k.visits_included));
      setAmount(String(rupees(k.amount_paise)));
      setTax(k.tax_treatment && k.tax_treatment !== 'gst' ? k.tax_treatment : String(Number(k.tax_rate_bps) || 1800));
      setTerms(k.terms || '');
      setNotes(k.notes || '');
    }
    setPartyQ('');
    setEditing(c);
  };

  const saveContract = async () => {
    if (!partyId) return Alert.alert('Customer', 'Choose the customer');
    if (!title.trim()) return Alert.alert('Cover', 'Say what the contract covers');
    const invoiced = editing && editing !== 'new' ? editing.contract.has_invoice : false;
    const isTreatment = Number.isNaN(Number(tax));
    const payload = {
      party_id: partyId,
      title: title.trim(),
      site: site.trim(),
      equipment: equip.trim(),
      start_date: start,
      end_date: end,
      visits_included: visits.trim() === '' ? null : Number(visits),
      terms: terms.trim(),
      notes: notes.trim(),
      ...(invoiced ? {} : { amount: amount || 0, tax_treatment: isTreatment ? tax : 'gst', tax_rate_bps: isTreatment ? 0 : Number(tax) }),
    };
    await act(
      'save',
      async () => {
        if (editing && editing !== 'new') await updateAmc(editing.contract.id, payload);
        else await createAmc(payload);
      },
      () => setEditing(null),
    );
  };

  const k = detail?.contract;
  const equipmentCovered = k?.equipment;

  return (
    <AdminScreen
      title="AMC Contracts"
      subtitle={s ? `${s.running} running · ${inr(rupees(s.running_value_paise))}` : undefined}
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      headerRight={
        <HeaderAction icon="add" label="New contract" onPress={() => openEditor('new')} />
      }
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Customer, contract or phone" />
          <FilterChips
            activeKey={filter}
            onSelect={(f) => setFilter(f as Filter)}
            items={[
              { key: 'active', label: 'Running', count: s?.running },
              { key: 'renewals', label: 'Renewals due', count: renewals.length },
              { key: 'lapsing', label: 'Lapsing 30d', count: s?.lapsing_30 },
              { key: 'expired', label: 'Lapsed', count: s?.lapsed },
              { key: 'all', label: 'All', count: contracts.length },
            ]}
          />
        </>
      }
    >
      {s ? (
        <StatGrid
          items={[
            { label: 'Not invoiced yet', value: s.not_invoiced, color: s.not_invoiced ? theme.warn : undefined },
            { label: 'Unpaid on invoices', value: inr(rupees(s.unpaid_paise)), color: s.unpaid_paise ? theme.err : undefined },
          ]}
        />
      ) : null}

      {filter === 'renewals' ? (
        <>
          {renewals.length === 0 ? <EmptyNote text="No contract is due for renewal in the next 45 days" icon="check-circle" /> : null}
          {renewals.map((c) => (
            <ListRow
              key={c.id}
              icon="shield"
              iconColor={c.state === 'expired' ? theme.err : theme.warn}
              title={c.party_name || c.contract_no}
              subtitle={`${c.contract_no}${c.title ? ` · ${c.title}` : ''}`}
              meta={`${shortDate(c.end_date)} · ${c.state === 'expired' ? `${c.days_overdue} days ago` : `${c.days_left} days left`} · reminded ${c.reminders_sent || 0}×`}
              value={inr(rupees(c.amount_paise))}
              onPress={() => open(c.id)}
              footer={
                <>
                  {c.whatsapp_url ? (
                    <ActionButton
                      label="Open chat"
                      tone="neutral"
                      onPress={() => {
                        Linking.openURL(c.whatsapp_url as string);
                        markReminded(c.id).then(() => data.reload()).catch(() => {});
                      }}
                    />
                  ) : null}
                  <ActionButton
                    label="Send reminder"
                    tone="success"
                    busy={busy === `rem-${c.id}`}
                    onPress={() =>
                      Alert.alert('Send reminder?', `The renewal reminder for ${c.contract_no} goes to ${c.party_name} on WhatsApp.`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Send',
                          onPress: () =>
                            act(`rem-${c.id}`, async () => {
                              const r = await sendRenewalWhatsapp(c.id);
                              if (r && r.ok === false) throw new Error(r.error || 'WhatsApp could not send it');
                            }),
                        },
                      ])
                    }
                  />
                  <ActionButton
                    label="Renew"
                    onPress={() => {
                      setRenewFor({ id: c.id, amount: rupees(c.amount_paise) });
                      setRnStart(todayIso());
                      setRnAmount(String(rupees(c.amount_paise)));
                      setRnInvoice(true);
                    }}
                  />
                </>
              }
            />
          ))}
        </>
      ) : (
        <>
          {visible.length === 0 ? <EmptyNote text="No contracts here — tap + to add one" icon="shield" /> : null}
          {visible.map((c) => (
            <ListRow
              key={c.id}
              icon="shield"
              iconColor={STATE_COLOR[c.state]}
              title={c.party_name || c.title || c.contract_no}
              subtitle={`${c.contract_no}${c.title ? ` · ${c.title}` : ''}`}
              meta={`${shortDate(c.start_date)} → ${shortDate(c.end_date)}${c.visits_included != null ? ` · ${c.visits_used}/${c.visits_included} visits` : ` · ${c.visits_used} visits`}${
                c.state === 'active' && c.days_left != null ? ` · ${c.days_left}d left` : c.state === 'expired' && c.days_overdue != null ? ` · lapsed ${c.days_overdue}d ago` : ''
              }`}
              value={inr(rupees(c.amount_paise))}
              badge={{ label: humanize(c.state), color: STATE_COLOR[c.state] ?? theme.info }}
              onPress={() => open(c.id)}
            />
          ))}
        </>
      )}

      {/* Detail */}
      <FormSheet visible={!!detail} title={k?.contract_no || 'Contract'} subtitle={k ? `${k.party_name || ''} · ${humanize(k.state)}` : undefined} onClose={() => setDetail(null)}>
        {detail && k ? (
          <>
            <StatGrid
              items={[
                { label: 'Amount (before GST)', value: inr(rupees(k.amount_paise)) },
                { label: k.visits_left == null ? 'Visits (unlimited)' : 'Free visits left', value: k.visits_left == null ? `${k.visits_used} used` : `${k.visits_left} of ${k.visits_included}`, color: k.visits_left === 0 ? theme.warn : undefined },
              ]}
            />
            <Text style={[styles.meta, { color: theme.text2 }]}>{k.title}</Text>
            <Text style={[styles.meta, { color: theme.text3 }]}>
              {shortDate(k.start_date)} → {shortDate(k.end_date)}
              {k.state === 'active' && k.days_left != null ? ` · ${k.days_left} days left` : ''}
            </Text>
            {k.site ? <Text style={[styles.meta, { color: theme.text3 }]}>Site: {k.site}</Text> : null}
            {equipmentCovered ? <Text style={[styles.meta, { color: theme.text3 }]}>Covers: {equipmentCovered}</Text> : null}
            {k.has_invoice ? (
              <Text style={[styles.meta, { color: theme.text3 }]}>
                Invoice {k.invoice_no}: {inr(rupees(k.invoice_total_paise))}
                {k.invoice_due_paise ? ` · ${inr(rupees(k.invoice_due_paise))} due` : ' · paid'}
              </Text>
            ) : (
              <Text style={[styles.meta, { color: theme.warn }]}>This term has not been invoiced yet.</Text>
            )}

            <Overline>{`Visits (${detail.visits.length})`}</Overline>
            {detail.visits.length === 0 ? <Text style={[styles.meta, { color: theme.text3 }]}>No visits logged yet.</Text> : null}
            {detail.visits.map((v) => (
              <View key={v.id} style={[styles.kv, { borderBottomColor: theme.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.v, { color: theme.text, textAlign: 'left' }]}>{shortDate(v.visit_date)} · {humanize(v.kind)}</Text>
                  <Text style={[styles.k, { color: theme.text3 }]}>
                    {[v.ticket_ref, v.note].filter(Boolean).join(' · ') || '—'}
                    {Number(v.chargeable) === 1 ? ' · chargeable' : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert('Remove visit?', 'It will no longer count against the free visits.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => act('visit', () => removeVisit(v.id), async () => setDetail(await loadAmc(k.id))) },
                    ])
                  }
                  hitSlop={10}
                >
                  <Icon name="trash" size={18} color={theme.err} />
                </Pressable>
              </View>
            ))}

            <Overline>Actions</Overline>
            <View style={styles.actions}>
              <ActionButton
                label="Log a visit"
                onPress={() => {
                  setVDate(todayIso());
                  setVKind('scheduled');
                  setVTicket('');
                  setVNote('');
                  setVisitFor(detail);
                }}
              />
              <ActionButton label="Edit" tone="neutral" onPress={() => { openEditor(detail); setDetail(null); }} />
            </View>
            <View style={styles.actions}>
              {!k.has_invoice && ['active', 'upcoming'].includes(k.state) ? (
                <ActionButton
                  label="Raise invoice"
                  tone="success"
                  busy={busy === 'invoice'}
                  onPress={() =>
                    Alert.alert('Raise the invoice?', `${inr(rupees(k.amount_paise))}${Number(k.tax_rate_bps) ? ' + GST' : ''} goes on ${k.party_name}'s account straight away.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Raise', onPress: () => act('invoice', () => invoiceAmc(k.id), async () => setDetail(await loadAmc(k.id))) },
                    ])
                  }
                />
              ) : null}
              <ActionButton
                label="Renew"
                tone="neutral"
                onPress={() => {
                  setRenewFor({ id: k.id, amount: rupees(k.amount_paise) });
                  setRnStart(shortIso(k.end_date));
                  setRnAmount(String(rupees(k.amount_paise)));
                  setRnInvoice(true);
                  setDetail(null);
                }}
              />
              <ActionButton label="Cover devices" tone="neutral" busy={busy === 'cover'} onPress={() => act('cover', () => coverDevices(k.id), () => Alert.alert('Done', "This customer's installed devices are now under this contract."))} />
            </View>
            {k.party_phone ? <ActionButton label="Call customer" tone="neutral" onPress={() => Linking.openURL(`tel:${k.party_phone}`)} /> : null}
            {['active', 'upcoming'].includes(k.state) ? <ActionButton label="Cancel contract" tone="danger" onPress={() => { setCancelFor(k.id); setCancelWhy(''); }} /> : null}
          </>
        ) : null}
      </FormSheet>

      {/* Editor */}
      <FormSheet
        visible={editing !== null}
        title={editing === 'new' ? 'New AMC contract' : `Edit ${editing ? editing.contract.contract_no : ''}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} />
            <ActionButton label={editing === 'new' ? 'Create contract' : 'Save changes'} onPress={saveContract} busy={busy === 'save'} />
          </>
        }
      >
        {editing && editing !== 'new' && editing.contract.has_invoice ? (
          <Text style={[styles.meta, { color: theme.warn }]}>This term has been invoiced, so the amount and tax are fixed. To change them, cancel the invoice in Sales first.</Text>
        ) : null}
        <Text style={[styles.k, { color: theme.text3 }]}>Customer</Text>
        {partyId ? (
          <ListRow icon="user" title={partyName || 'Customer'} footer={editing === 'new' ? <ActionButton label="Change" tone="neutral" onPress={() => { setPartyId(''); setPartyName(''); }} /> : undefined} />
        ) : (
          <>
            <SearchField value={partyQ} onChangeText={setPartyQ} placeholder="Search customer" />
            {parties.map((p) => (
              <ListRow key={p.id} icon="user" title={p.display_name} subtitle={p.phone || undefined} onPress={() => { setPartyId(p.id); setPartyName(p.display_name); setParties([]); setPartyQ(''); }} />
            ))}
            <NewPartyButton
              kind="customer"
              seed={partyQ}
              onCreated={(p) => {
                setPartyId(p.id);
                setPartyName(p.display_name);
                setParties([]);
                setPartyQ('');
              }}
            />
          </>
        )}
        <Field label="What it covers" value={title} onChangeText={setTitle} placeholder="CCTV — 8 cameras, 1 DVR" />
        <Field label="Site address" value={site} onChangeText={setSite} />
        <Field label="Equipment covered" value={equip} onChangeText={setEquip} multiline />
        <Field
          label="Starts"
          value={start}
          onChangeText={(v) => {
            setStart(v);
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setEnd(oneYearOn(v));
          }}
          hint="YYYY-MM-DD"
        />
        <Field label="Ends" value={end} onChangeText={setEnd} hint="YYYY-MM-DD" />
        <Field label="Free visits (blank = unlimited)" value={visits} onChangeText={setVisits} keyboardType="numeric" />
        {!(editing && editing !== 'new' && editing.contract.has_invoice) ? (
          <>
            <Field label="Contract amount ₹ (before GST)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <Text style={[styles.k, { color: theme.text3 }]}>GST</Text>
            <View style={styles.chips}>
              {[...gst.map((t) => ({ key: String(t.rate_bps), label: `${Number(t.rate_bps) / 100}%` })), { key: 'exempt', label: 'Exempt' }, { key: 'nil_rated', label: 'Nil rated' }, { key: 'non_gst', label: 'Non-GST' }].map((o) => {
                const on = tax === o.key;
                return (
                  <Pressable key={o.key} onPress={() => setTax(o.key)} style={[styles.chip, { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.accent + '22' : theme.panel2 }]}>
                    <Text style={[styles.chipText, { color: on ? theme.accent : theme.text2 }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        <Field label="Terms (printed on the invoice)" value={terms} onChangeText={setTerms} multiline />
        <Field label="Internal notes" value={notes} onChangeText={setNotes} />
      </FormSheet>

      {/* Log a visit */}
      <FormSheet
        visible={!!visitFor}
        title="Log a visit"
        subtitle={visitFor?.contract.contract_no}
        onClose={() => setVisitFor(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setVisitFor(null)} />
            <ActionButton
              label="Log visit"
              busy={busy === 'log'}
              onPress={() => {
                const c = visitFor as AmcLoaded;
                act('log', () => logVisit(c.contract.id, { visit_date: vDate, kind: vKind, ticket_ref: vTicket.trim(), note: vNote.trim() }), async () => {
                  setVisitFor(null);
                  setDetail(await loadAmc(c.contract.id));
                });
              }}
            />
          </>
        }
      >
        {visitFor && visitFor.contract.visits_left === 0 ? <Text style={[styles.meta, { color: theme.warn }]}>The free visits are used up. This visit will be marked chargeable.</Text> : null}
        <Field label="Date" value={vDate} onChangeText={setVDate} hint="YYYY-MM-DD" />
        <View style={styles.chips}>
          {[['scheduled', 'Scheduled check-up'], ['complaint', 'Complaint / fault']].map(([key, label]) => {
            const on = vKind === key;
            return (
              <Pressable key={key} onPress={() => setVKind(key)} style={[styles.chip, { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.accent + '22' : theme.panel2 }]}>
                <Text style={[styles.chipText, { color: on ? theme.accent : theme.text2 }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Service ticket no. (if any)" value={vTicket} onChangeText={setVTicket} autoCapitalize="characters" />
        <Field label="Note" value={vNote} onChangeText={setVNote} placeholder="What was done" />
      </FormSheet>

      {/* Renew */}
      <FormSheet
        visible={!!renewFor}
        title="Renew contract"
        onClose={() => setRenewFor(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setRenewFor(null)} />
            <ActionButton
              label="Renew"
              tone="success"
              busy={busy === 'renew'}
              onPress={() => {
                const r = renewFor as { id: string };
                act(
                  'renew',
                  async () => {
                    const renewed = await renewAmc(r.id, { start_date: rnStart, amount: rnAmount });
                    if (rnInvoice) {
                      try {
                        await invoiceAmc(renewed.contract.id);
                      } catch (e) {
                        Alert.alert('Renewed', `The invoice was not raised: ${e instanceof Error ? e.message : 'try again'}`);
                      }
                    }
                  },
                  () => setRenewFor(null),
                );
              }}
            />
          </>
        }
      >
        <Field label="New term starts" value={rnStart} onChangeText={setRnStart} hint="YYYY-MM-DD" />
        <Field label="Amount ₹ (before GST)" value={rnAmount} onChangeText={setRnAmount} keyboardType="numeric" />
        <Pressable onPress={() => setRnInvoice((v) => !v)} style={styles.check}>
          <Icon name={rnInvoice ? 'check-circle' : 'tasks'} size={20} color={rnInvoice ? theme.accent : theme.text3} filled={rnInvoice} />
          <Text style={[styles.checkText, { color: theme.text }]}>Raise the invoice for the new term now</Text>
        </Pressable>
      </FormSheet>

      {/* Cancel */}
      <FormSheet
        visible={cancelFor !== null}
        title="Cancel contract"
        onClose={() => setCancelFor(null)}
        footer={
          <>
            <ActionButton label="Back" tone="neutral" onPress={() => setCancelFor(null)} />
            <ActionButton
              label="Cancel contract"
              tone="danger"
              busy={busy === 'cancel'}
              onPress={() => act('cancel', () => cancelAmc(cancelFor as string, cancelWhy.trim()), () => { setCancelFor(null); setDetail(null); })}
            />
          </>
        }
      >
        <Field label="Why is it being cancelled? (optional)" value={cancelWhy} onChangeText={setCancelWhy} multiline />
      </FormSheet>
    </AdminScreen>
  );
}

function shortIso(v: string): string {
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  meta: { ...typography.caption, fontSize: 12 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2), borderBottomWidth: StyleSheet.hairlineWidth },
  k: { ...typography.caption, fontSize: 12 },
  v: { ...typography.body, fontSize: 14, fontFamily: 'Manrope_700Bold' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5), marginBottom: spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  chipText: { ...typography.caption, fontSize: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  checkText: { ...typography.body, flex: 1 },
});
