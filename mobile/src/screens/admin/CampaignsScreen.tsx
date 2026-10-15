import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import Icon from '../../components/Icon';
import { fetchCampaigns } from '../../api/adminExtra';
import {
  addOptouts,
  Audience,
  campaignAction,
  CampaignFull,
  CampaignMeta,
  CampaignPayload,
  CampaignVariable,
  checkAudience,
  createCampaign,
  deleteCampaign,
  fetchCampaignMeta,
  fetchOptouts,
  loadCampaign,
  OptOut,
  publishCampaign,
  Reach,
  removeOptout,
  scheduleCampaign,
  setCampaignAuto,
  testCampaign,
  updateCampaign,
} from '../../api/adminCampaigns';
import { uploadFile } from '../../api/upload';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { dateTime, humanize } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'all' | 'running' | 'scheduled' | 'done' | 'draft';
type View_ = 'campaigns' | 'optouts';

const COLOR: Record<string, string> = {
  draft: brand.grey,
  scheduled: semantic.info,
  sending: semantic.warning,
  running: semantic.warning,
  paused: semantic.danger,
  completed: semantic.success,
  done: semantic.success,
  cancelled: brand.grey,
  standing: semantic.success,
};
const VAR_LABEL: Record<string, string> = { name: "Customer's name", business: 'Business name', text: 'Fixed text' };
const RECIPIENT: Record<string, [string, string]> = {
  sent: [semantic.success, 'Accepted'],
  failed: [semantic.danger, 'Failed'],
  queued: [brand.grey, 'Waiting'],
  skipped: [brand.grey, 'Skipped'],
};
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const errText = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);
const dayText = (d: number) => (Number(d) === 0 ? 'the last day of every month' : `day ${d} of every month`);

interface Draft {
  name: string;
  messageId: string;
  variables: CampaignVariable[];
  media: string;
  customers: boolean;
  contacts: boolean;
  segment: string;
  monthly: boolean;
  day: string;
  time: string;
  fresh: boolean;
}
const blankDraft = (): Draft => ({
  name: '', messageId: '', variables: [], media: '', customers: true, contacts: false, segment: 'all', monthly: false, day: '0', time: '10:00', fresh: true,
});

// WhatsApp campaigns: compose a broadcast, check who it reaches, test it on
// your own phone, then schedule it, publish it now or let a monthly one run by
// itself. The do-not-message list is kept here too.
export default function CampaignsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const list = useLoader(fetchCampaigns, 'Could not load campaigns');
  const optouts = useLoader<OptOut[]>(fetchOptouts, 'Could not load the do-not-message list');
  const [meta, setMeta] = useState<CampaignMeta | null>(null);
  const [view, setView] = useState<View_>('campaigns');
  const [filter, setFilter] = useState<Filter>('all');

  const [detail, setDetail] = useState<CampaignFull | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ existing: CampaignFull | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [reach, setReach] = useState<Reach | null>(null);
  const [schedule, setSchedule] = useState<{ c: CampaignFull; reach: Reach } | null>(null);
  const [at, setAt] = useState('');
  const [startNow, setStartNow] = useState(true);
  const [offer, setOffer] = useState<{ c: CampaignFull; texts: Record<number, string>; media: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [numbers, setNumbers] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaignMeta().then((m) => setMeta(m && m.hours ? m : null)).catch(() => undefined);
  }, []);

  const rows = list.data ?? [];
  const group = (status: string): Filter => {
    if (['sending', 'running', 'paused'].includes(status)) return 'running';
    if (status === 'scheduled') return 'scheduled';
    if (['completed', 'done'].includes(status)) return 'done';
    return 'draft';
  };
  const visible = useMemo(() => rows.filter((c) => filter === 'all' || group(c.status) === filter), [rows, filter]);
  const sent = rows.reduce((s, c) => s + (c.progress?.sent || 0), 0);
  const failed = rows.reduce((s, c) => s + (c.progress?.failed || 0), 0);

  const guard = async (key: string, fn: () => Promise<void>, failTitle: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: unknown) {
      Alert.alert(failTitle, errText(e, 'Try again'));
    } finally {
      setBusy(null);
    }
  };

  const openDetail = useCallback(async (id: string) => {
    setDetailId(id);
    try {
      setDetail(await loadCampaign(id));
    } catch (e: unknown) {
      setDetailId(null);
      Alert.alert('Could not open the campaign', errText(e, 'Try again'));
    }
  }, []);

  const refreshAll = async () => {
    await list.reload();
    if (detailId) {
      try {
        setDetail(await loadCampaign(detailId));
      } catch {
        setDetail(null);
        setDetailId(null);
      }
    }
  };

  const audienceOf = (d: Draft): Audience => ({ customers: d.customers, contacts: d.contacts, segment: d.segment });

  const openEditor = (existing: CampaignFull | null) => {
    setEditing({ existing });
    setReach(null);
    setDraft(
      existing
        ? {
            name: existing.name,
            messageId: existing.message_id,
            variables: existing.variables.map((v) => ({ ...v })),
            media: existing.media_path || '',
            customers: existing.audience.customers ?? true,
            contacts: !!existing.audience.contacts,
            segment: existing.audience.segment || 'all',
            monthly: existing.is_standing,
            day: String(existing.run_day ?? 0),
            time: existing.run_time || '10:00',
            fresh: existing.fresh_offer_required !== 0,
          }
        : blankDraft(),
    );
  };

  const pickHeader = async (onUrl: (url: string) => void) => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'application/pdf'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const f = res.assets[0];
    if ((f.size || 0) > 5 * 1024 * 1024) return Alert.alert('Too large', 'WhatsApp allows up to 5 MB here.');
    setBusy('upload');
    try {
      onUrl(await uploadFile(f.uri, f.name, f.mimeType || 'application/octet-stream'));
    } catch (e: unknown) {
      Alert.alert('Upload failed', errText(e, 'Check your connection and try again'));
    } finally {
      setBusy(null);
    }
  };

  const setVar = (i: number, patch: Partial<CampaignVariable>) =>
    setDraft((d) => ({ ...d, variables: d.variables.map((v, n) => (n === i ? { ...v, ...patch } : v)) }));

  const check = () =>
    guard('check', async () => setReach(await checkAudience(audienceOf(draft))), 'Could not check');

  const save = () => {
    const name = draft.name.trim();
    if (!name) return Alert.alert('Name needed', 'Give the campaign a name.');
    if (!draft.messageId.trim()) return Alert.alert('Template needed', 'Enter the Message ID of the template from Fast2SMS.');
    if (draft.monthly && !TIME_RE.test(draft.time)) return Alert.alert('Time', 'Enter the time as HH:MM, for example 10:00.');
    const payload: CampaignPayload = {
      name,
      message_id: draft.messageId.trim(),
      variables: draft.variables,
      media_path: draft.media || null,
      audience: audienceOf(draft),
    };
    if (draft.monthly) payload.recurrence = { type: 'monthly', day: Number(draft.day) || 0, time: draft.time, fresh_offer_required: draft.fresh };
    return guard(
      'save',
      async () => {
        const saved = editing?.existing ? await updateCampaign(editing.existing.id, payload) : await createCampaign(payload);
        setEditing(null);
        await list.reload();
        await openDetail(saved.id);
      },
      'Not saved',
    );
  };

  const doSchedule = async (c: CampaignFull) => {
    try {
      const r = await checkAudience(c.audience);
      setSchedule({ c, reach: r });
      setStartNow(true);
      setAt('');
    } catch (e: unknown) {
      Alert.alert('Could not check the audience', errText(e, 'Try again'));
    }
  };
  const confirmSchedule = () => {
    if (!schedule) return;
    let when: Date | null = null;
    if (!startNow) {
      const m = DATETIME_RE.exec(at.trim());
      when = m ? new Date(`${m[1]}T${m[2]}:${m[3]}:00`) : null;
      if (!when || Number.isNaN(when.getTime())) return Alert.alert('Date and time', 'Enter it as YYYY-MM-DD HH:MM.');
    }
    const { c, reach: r } = schedule;
    Alert.alert('Schedule campaign', `Send “${c.name}” to ${r.will_send} people${when ? ` starting ${when.toLocaleString('en-IN')}` : ' as soon as possible'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () =>
          guard(
            'schedule',
            async () => {
              await scheduleCampaign(c.id, when ? when.toISOString() : null);
              setSchedule(null);
              await refreshAll();
            },
            'Not scheduled',
          ),
      },
    ]);
  };

  const doPublish = async (c: CampaignFull) => {
    try {
      const r = await checkAudience(c.audience);
      if (!r.will_send) return Alert.alert('Nobody to send to', 'Nobody would receive this — check the audience.');
      Alert.alert('Publish now', `Publish “${c.name}” to ${r.will_send} people? It goes out a few a minute, in daytime hours. This does not change the monthly schedule.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: () =>
            guard(
              'publish',
              async () => {
                const out = await publishCampaign(c.id);
                Alert.alert('Publishing', `Going out to ${out.recipients} people.`);
                await refreshAll();
              },
              'Not published',
            ),
        },
      ]);
    } catch (e: unknown) {
      Alert.alert('Could not check the audience', errText(e, 'Try again'));
    }
  };

  const doAction = (c: CampaignFull, action: 'pause' | 'resume' | 'cancel') => {
    const run = () => guard(action, async () => { await campaignAction(c.id, action); await refreshAll(); }, 'Could not update');
    if (action === 'cancel') {
      Alert.alert('Cancel this campaign?', 'Whatever has not been sent yet will not go out.', [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel campaign', style: 'destructive', onPress: run },
      ]);
    } else run();
  };

  const doDelete = (c: CampaignFull) =>
    Alert.alert('Delete this draft?', c.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          guard(
            'delete',
            async () => {
              await deleteCampaign(c.id);
              setDetail(null);
              setDetailId(null);
              await list.reload();
            },
            'Could not delete',
          ),
      },
    ]);

  const doTest = (c: CampaignFull) => {
    setTesting(c.id);
    setTestPhone('');
  };
  const sendTest = () =>
    guard(
      'test',
      async () => {
        if (!testPhone.trim()) throw new Error('Type your own mobile number to receive the test');
        await testCampaign(testing as string, testPhone.trim());
        setTesting(null);
        Alert.alert('Test sent', 'Check your WhatsApp.');
      },
      'Test not sent',
    );

  const toggleAuto = (c: CampaignFull) =>
    guard(
      'auto',
      async () => {
        const out = await setCampaignAuto(c.id, !c.auto_enabled);
        Alert.alert(c.auto_enabled ? 'Automatic sending is off' : 'Automatic sending is on', c.auto_enabled ? '' : `Next: ${dateTime(out.next_run_at)}`);
        await refreshAll();
      },
      'Could not change automatic sending',
    );

  const openOffer = (c: CampaignFull) => {
    const texts: Record<number, string> = {};
    c.variables.forEach((v, i) => {
      if (v.type === 'text') texts[i] = v.value || '';
    });
    setOffer({ c, texts, media: c.media_path || '' });
  };
  const saveOffer = () => {
    if (!offer) return;
    const variables = offer.c.variables.map((v, i) => (v.type === 'text' ? { ...v, value: (offer.texts[i] || '').trim() } : v));
    if (variables.some((v) => v.type === 'text' && !v.value)) return Alert.alert('Offer text', 'The offer text cannot be empty.');
    return guard(
      'offer',
      async () => {
        await updateCampaign(offer.c.id, { variables, media_path: offer.media || null });
        setOffer(null);
        await refreshAll();
      },
      'Not saved',
    );
  };

  const addOptOut = () =>
    guard(
      'optout',
      async () => {
        if (!numbers.trim()) throw new Error('Enter at least one number');
        const out = await addOptouts(numbers, reason.trim());
        setNumbers('');
        setReason('');
        await optouts.reload();
        Alert.alert('Added', `${out.added} added${out.unreadable ? `, ${out.unreadable} could not be read as a mobile number` : ''}.`);
      },
      'Not added',
    );
  const dropOptOut = (o: OptOut) =>
    Alert.alert('Remove from the list?', `${o.phone} can then receive campaigns again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', onPress: () => guard('rm', async () => { await removeOptout(o.phone); await optouts.reload(); }, 'Could not remove') },
    ]);

  const audienceLabel = (a: Audience) => {
    const lists = [a.customers ? 'Customers' : null, a.contacts ? 'Contacts' : null].filter(Boolean).join(' + ');
    const seg = a.segment && a.segment !== 'all' ? ` — ${meta?.segments[a.segment] || a.segment}` : '';
    return `${lists || 'Nobody'}${seg}`;
  };

  const segKeys = Object.keys(meta?.segments || { all: 'Everyone' });

  const d = detail;
  const footerFor = (c: CampaignFull) => (
    <View style={styles.actions}>
      {c.is_standing || c.status === 'draft' ? <ActionButton label="Edit" tone="neutral" onPress={() => { setDetail(null); openEditor(c); }} /> : null}
      {c.is_standing || c.status === 'draft' ? <ActionButton label="Send me a test" tone="neutral" onPress={() => doTest(c)} /> : null}
      {c.status === 'draft' ? <ActionButton label="Schedule" busy={busy === 'schedule'} onPress={() => doSchedule(c)} /> : null}
      {c.is_standing ? <ActionButton label="Publish now" busy={busy === 'publish'} tone="neutral" onPress={() => doPublish(c)} /> : null}
      {c.is_standing ? <ActionButton label={c.auto_enabled ? 'Turn automatic off' : 'Turn automatic on'} busy={busy === 'auto'} onPress={() => toggleAuto(c)} /> : null}
      {['scheduled', 'sending'].includes(c.status) ? <ActionButton label="Pause" tone="neutral" onPress={() => doAction(c, 'pause')} /> : null}
      {c.status === 'paused' ? <ActionButton label="Resume" onPress={() => doAction(c, 'resume')} /> : null}
      {['scheduled', 'sending', 'paused'].includes(c.status) ? <ActionButton label="Cancel campaign" tone="danger" onPress={() => doAction(c, 'cancel')} /> : null}
      {c.is_standing || c.status === 'draft' ? <ActionButton label="Delete" tone="danger" onPress={() => doDelete(c)} /> : null}
    </View>
  );

  return (
    <AdminScreen
      title="WhatsApp Campaigns"
      subtitle={`${rows.length} campaigns`}
      onBack={onBack}
      onRefresh={async () => {
        await Promise.all([list.reload(), optouts.reload()]);
      }}
      loading={list.loading}
      error={list.error}
      headerRight={
        <Pressable onPress={() => openEditor(null)} hitSlop={8} style={[styles.add, { backgroundColor: brand.fill }]} accessibilityLabel="New campaign">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
      toolbar={
        <View>
          <FilterChips
            activeKey={view}
            onSelect={(k) => setView(k as View_)}
            items={[
              { key: 'campaigns', label: 'Campaigns', count: rows.length },
              { key: 'optouts', label: 'Do-not-message list', count: optouts.data?.length ?? 0 },
            ]}
          />
          {view === 'campaigns' ? (
            <FilterChips
              activeKey={filter}
              onSelect={(k) => setFilter(k as Filter)}
              items={[
                { key: 'all', label: 'All', count: rows.length },
                { key: 'running', label: 'Sending', count: rows.filter((c) => group(c.status) === 'running').length },
                { key: 'scheduled', label: 'Scheduled', count: rows.filter((c) => group(c.status) === 'scheduled').length },
                { key: 'done', label: 'Done', count: rows.filter((c) => group(c.status) === 'done').length },
                { key: 'draft', label: 'Draft', count: rows.filter((c) => group(c.status) === 'draft').length },
              ]}
            />
          ) : null}
        </View>
      }
    >
      {view === 'campaigns' ? (
        <>
          {meta ? (
            <Text style={[styles.note, { color: theme.text3 }]}>
              A broadcast, not a group: each person receives it on their own. Needs a template approved as Marketing. {meta.rate_per_minute} a minute, {meta.hours.from}:00–{meta.hours.until}:00 {meta.hours.zone}, up to {meta.daily_cap} a day.
            </Text>
          ) : null}
          <StatGrid
            items={[
              { label: 'Messages sent', value: sent, color: semantic.success },
              { label: 'Failed', value: failed, color: failed ? semantic.danger : undefined },
            ]}
          />
          {visible.length === 0 ? <EmptyNote text="No campaigns here" icon="megaphone" /> : null}
          {visible.map((c) => (
            <ListRow
              key={c.id}
              icon="whatsapp"
              iconColor={COLOR[c.status]}
              title={c.name}
              subtitle={`${c.progress.sent} sent · ${c.progress.queued} queued · ${c.progress.failed} failed · ${c.progress.skipped} skipped`}
              meta={`${c.scheduled_at ? dateTime(c.scheduled_at) : 'Not scheduled'}${c.is_standing ? ` · repeats ${c.recurrence}` : ''}`}
              badge={{ label: humanize(c.status), color: COLOR[c.status] ?? semantic.info }}
              onPress={() => openDetail(c.id)}
            />
          ))}
        </>
      ) : (
        <>
          <Text style={[styles.note, { color: theme.text3 }]}>
            Numbers here are never included in a campaign — not even one scheduled before they were added. Add anyone who asks you to stop.
          </Text>
          <Field label="Mobile numbers" value={numbers} onChangeText={setNumbers} multiline placeholder="One or many, separated by commas, spaces or new lines" keyboardType="phone-pad" />
          <Field label="Reason (optional)" value={reason} onChangeText={setReason} />
          <ActionButton label="Add to the list" busy={busy === 'optout'} onPress={addOptOut} />
          {(optouts.data ?? []).length === 0 ? <EmptyNote text="Nobody is on the list" icon="check-circle" /> : null}
          {(optouts.data ?? []).map((o) => (
            <ListRow
              key={o.phone}
              icon="lock"
              title={o.phone}
              subtitle={o.reason || undefined}
              meta={dateTime(o.created_at)}
              footer={<ActionButton label="Remove" tone="neutral" onPress={() => dropOptOut(o)} />}
            />
          ))}
        </>
      )}

      {/* Detail */}
      <FormSheet visible={!!d} title={d?.name || 'Campaign'} subtitle={d ? humanize(d.status) : undefined} onClose={() => { setDetail(null); setDetailId(null); }} footer={d ? footerFor(d) : undefined}>
        {d ? (
          <View>
            {d.pause_reason ? <ListRow icon="alert" iconColor={semantic.warning} title={d.pause_reason} /> : null}
            {d.is_standing ? (
              <View>
                <ListRow
                  icon={d.auto_enabled ? 'check-circle' : 'alert'}
                  iconColor={d.auto_enabled ? semantic.success : semantic.warning}
                  title={d.auto_enabled ? `Automatic — ${dayText(d.run_day ?? 0)} at ${d.run_time}` : 'Automatic sending is off'}
                  subtitle={
                    d.auto_enabled
                      ? `Next: ${dateTime(d.next_run_at)}${d.last_run_at ? ` · last sent ${dateTime(d.last_run_at)}` : ''}`
                      : 'Turn it on and it goes out by itself every month, or press Publish now.'
                  }
                  meta={d.offer_is_fresh ? 'The offer is ready — it will be sent.' : d.fresh_offer_required ? 'The offer has not been updated since the last send — this month is skipped unless you change it.' : 'It will be sent again as it is.'}
                />
                <SectionLabel>This month's offer</SectionLabel>
                {d.variables.filter((v) => v.type === 'text').map((v, i) => (
                  <Text key={i} style={[styles.offer, { color: theme.text }]}>“{v.value}”</Text>
                ))}
                {d.variables.every((v) => v.type !== 'text') ? <Text style={[styles.note, { color: theme.text3 }]}>No fixed text — the message uses only the name.</Text> : null}
                <ActionButton label="Change this month's offer" tone="neutral" onPress={() => openOffer(d)} />
                {(d.runs || []).length ? <SectionLabel>Sent so far</SectionLabel> : null}
                {(d.runs || []).map((r) => (
                  <ListRow
                    key={r.id}
                    icon="whatsapp"
                    title={r.name}
                    subtitle={`${r.progress.sent} of ${r.progress.total} sent${r.progress.failed ? ` · ${r.progress.failed} failed` : ''}`}
                    badge={{ label: humanize(r.status), color: COLOR[r.status] ?? semantic.info }}
                    onPress={() => openDetail(r.id)}
                  />
                ))}
              </View>
            ) : (
              <StatGrid
                items={[
                  { label: `Accepted of ${d.progress.total || '—'}`, value: d.progress.sent, color: semantic.success },
                  { label: 'Failed', value: d.progress.failed, color: d.progress.failed ? semantic.danger : undefined },
                  { label: 'Waiting', value: d.progress.queued },
                  { label: 'Skipped', value: d.progress.skipped },
                ]}
              />
            )}
            <SectionLabel>Setup</SectionLabel>
            <ListRow title="Template" subtitle={`${d.message_id}${d.media_path ? ' · with a picture / PDF header' : ''}`} />
            <ListRow
              title="Blanks"
              subtitle={d.variables.length ? d.variables.map((v, i) => `{{${i + 1}}} = ${v.type === 'text' ? `“${v.value}”` : VAR_LABEL[v.type]}`).join(' · ') : 'None'}
            />
            <ListRow title="Goes to" subtitle={audienceLabel(d.audience)} />
            {d.scheduled_at ? <ListRow title="Starts" subtitle={dateTime(d.scheduled_at)} meta={d.finished_at ? `Finished ${dateTime(d.finished_at)}` : undefined} /> : null}
            {(d.recipients || []).length ? <SectionLabel>Recipients</SectionLabel> : null}
            {(d.recipients || []).slice(0, 100).map((r, i) => {
              const [color, label] = RECIPIENT[r.status] || [brand.grey, r.status];
              return (
                <ListRow
                  key={`${r.phone}-${i}`}
                  icon="user"
                  title={r.name || '—'}
                  subtitle={`${r.phone.slice(0, 2)}••••••${r.phone.slice(-2)}${r.error ? ` · ${r.error}` : ''}`}
                  badge={{ label, color }}
                />
              );
            })}
            {(d.recipients || []).length ? (
              <Text style={[styles.note, { color: theme.text3 }]}>Accepted means Fast2SMS took the message; delivery to each phone is in your Fast2SMS dashboard.</Text>
            ) : null}
          </View>
        ) : null}
      </FormSheet>

      {/* Compose / edit */}
      <FormSheet
        visible={!!editing}
        title={editing?.existing ? 'Edit campaign' : 'New campaign'}
        onClose={() => setEditing(null)}
        footer={<ActionButton label={editing?.existing ? 'Save changes' : draft.monthly ? 'Save monthly campaign' : 'Save as draft'} busy={busy === 'save'} onPress={save} grow />}
      >
        <Field label="Campaign name (for you — customers do not see it)" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Diwali AMC offer" />
        <Field
          label="Marketing template — Message ID"
          value={draft.messageId}
          onChangeText={(v) => setDraft({ ...draft, messageId: v })}
          keyboardType="number-pad"
          placeholder="e.g. 35147"
          hint="The short MESSAGE ID of the approved Marketing template in Fast2SMS, not the long Template ID"
        />

        <SectionLabel>What fills the blanks</SectionLabel>
        {draft.variables.length === 0 ? <Text style={[styles.note, { color: theme.text3 }]}>None — the template has no blanks.</Text> : null}
        {draft.variables.map((v, i) => (
          <View key={i}>
            <Text style={[styles.cap, { color: theme.text2 }]}>{`{{${i + 1}}}`}</Text>
            <FilterChips
              items={Object.entries(VAR_LABEL).map(([key, label]) => ({ key, label }))}
              activeKey={v.type}
              onSelect={(k) => setVar(i, { type: k as CampaignVariable['type'], value: '' })}
            />
            {v.type === 'text' ? <Field label="The words to put here" value={v.value || ''} onChangeText={(t) => setVar(i, { value: t })} /> : null}
            <ActionButton label="Remove this blank" tone="neutral" onPress={() => setDraft((x) => ({ ...x, variables: x.variables.filter((_, n) => n !== i) }))} />
          </View>
        ))}
        <ActionButton
          label="Add a blank"
          tone="neutral"
          onPress={() => {
            if (draft.variables.length >= 5) return Alert.alert('Limit', 'A template can have at most 5 blanks.');
            setDraft((x) => ({ ...x, variables: [...x.variables, { type: x.variables.length ? 'text' : 'name', value: '' }] }));
          }}
        />

        <SectionLabel>Picture or PDF in the header</SectionLabel>
        <Text style={[styles.note, { color: theme.text3 }]}>{draft.media ? `Attached: ${draft.media.split('/').pop()}` : 'Only if your template has one. Up to 5 MB.'}</Text>
        <View style={styles.actions}>
          <ActionButton label={draft.media ? 'Replace file' : 'Choose file'} tone="neutral" busy={busy === 'upload'} onPress={() => pickHeader((url) => setDraft((x) => ({ ...x, media: url })))} />
          {draft.media ? <ActionButton label="Remove" tone="neutral" onPress={() => setDraft({ ...draft, media: '' })} /> : null}
        </View>

        {editing?.existing && !editing.existing.is_standing ? null : (
          <View>
            <SectionLabel>When it goes out</SectionLabel>
            {editing?.existing ? null : (
              <FilterChips
                items={[
                  { key: 'once', label: 'One time — I will schedule it' },
                  { key: 'monthly', label: 'Every month, automatically' },
                ]}
                activeKey={draft.monthly ? 'monthly' : 'once'}
                onSelect={(k) => setDraft({ ...draft, monthly: k === 'monthly' })}
              />
            )}
            {draft.monthly ? (
              <View>
                <Field label="Day of the month (0 = the last day, or 1–28)" value={draft.day} onChangeText={(v) => setDraft({ ...draft, day: v })} keyboardType="number-pad" />
                <Field
                  label="At (India time)"
                  value={draft.time}
                  onChangeText={(v) => setDraft({ ...draft, time: v })}
                  placeholder="10:00"
                  hint={meta ? `Between ${meta.hours.from}:00 and ${meta.hours.until - 1}:00` : undefined}
                />
                <View style={styles.switchRow}>
                  <Switch value={draft.fresh} onValueChange={(v) => setDraft({ ...draft, fresh: v })} trackColor={{ true: brand.primary }} />
                  <Text style={[styles.switchText, { color: theme.text }]}>Send only if I have updated the offer since the last time</Text>
                </View>
              </View>
            ) : null}
          </View>
        )}

        <SectionLabel>Who it goes to</SectionLabel>
        <View style={styles.switchRow}>
          <Switch value={draft.customers} onValueChange={(v) => setDraft({ ...draft, customers: v })} trackColor={{ true: brand.primary }} />
          <Text style={[styles.switchText, { color: theme.text }]}>Customers (Customers & Suppliers with a mobile number)</Text>
        </View>
        <View style={styles.switchRow}>
          <Switch
            value={draft.contacts && draft.segment === 'all'}
            disabled={draft.segment !== 'all'}
            onValueChange={(v) => setDraft({ ...draft, contacts: v })}
            trackColor={{ true: brand.primary }}
          />
          <Text style={[styles.switchText, { color: draft.segment === 'all' ? theme.text : theme.text3 }]}>Contacts</Text>
        </View>
        <Text style={[styles.cap, { color: theme.text2 }]}>Narrow it down</Text>
        <FilterChips
          items={segKeys.map((k) => ({ key: k, label: meta?.segments[k] || k }))}
          activeKey={draft.segment}
          onSelect={(k) => setDraft({ ...draft, segment: k, contacts: k === 'all' ? draft.contacts : false })}
        />
        <ActionButton label="Check who this reaches" tone="neutral" busy={busy === 'check'} onPress={check} />
        {reach ? (
          <Text style={[styles.note, { color: theme.text }]}>
            {reach.will_send} people would receive it
            {reach.invalid || reach.duplicates || reach.opted_out
              ? ` (left out: ${[reach.invalid ? `${reach.invalid} without a valid number` : null, reach.duplicates ? `${reach.duplicates} duplicates` : null, reach.opted_out ? `${reach.opted_out} on the do-not-message list` : null].filter(Boolean).join(', ')})`
              : ''}
          </Text>
        ) : null}
      </FormSheet>

      {/* Schedule */}
      <FormSheet
        visible={!!schedule}
        title={schedule ? `Schedule “${schedule.c.name}”` : ''}
        onClose={() => setSchedule(null)}
        footer={<ActionButton label="Confirm and schedule" busy={busy === 'schedule'} disabled={!schedule?.reach.will_send} onPress={confirmSchedule} grow />}
      >
        {schedule ? (
          <View>
            <ListRow
              icon={schedule.reach.will_send ? 'check-circle' : 'alert'}
              iconColor={schedule.reach.will_send ? semantic.success : semantic.danger}
              title={schedule.reach.will_send ? `${schedule.reach.will_send} people will receive it` : 'Nobody would receive this'}
              subtitle={
                schedule.reach.will_send
                  ? `${schedule.reach.opted_out ? `${schedule.reach.opted_out} on the do-not-message list are left out. ` : ''}The list is fixed when you confirm.`
                  : 'There is no customer with a valid mobile number in that audience. Go back and change who it goes to.'
              }
            />
            <FilterChips
              items={[
                { key: 'now', label: 'As soon as sending hours allow' },
                { key: 'at', label: 'Start at a set time' },
              ]}
              activeKey={startNow ? 'now' : 'at'}
              onSelect={(k) => setStartNow(k === 'now')}
            />
            {startNow ? null : <Field label="Start at" value={at} onChangeText={setAt} placeholder="YYYY-MM-DD HH:MM" keyboardType="numbers-and-punctuation" />}
            {meta ? (
              <Text style={[styles.note, { color: theme.text3 }]}>
                Messages go out {meta.rate_per_minute} a minute between {meta.hours.from}:00 and {meta.hours.until}:00 {meta.hours.zone}, up to {meta.daily_cap} a day — about {Math.max(1, Math.ceil(schedule.reach.will_send / meta.rate_per_minute))} minutes of sending time. Send yourself a test first.
              </Text>
            ) : null}
          </View>
        ) : null}
      </FormSheet>

      {/* This month's offer */}
      <FormSheet
        visible={!!offer}
        title="This month's offer"
        onClose={() => setOffer(null)}
        footer={<ActionButton label="Save offer" busy={busy === 'offer'} onPress={saveOffer} grow />}
      >
        {offer ? (
          <View>
            {Object.keys(offer.texts).length === 0 ? (
              <ListRow icon="alert" iconColor={semantic.warning} title="No fixed-text blank" subtitle="Use Edit to add one." />
            ) : null}
            {Object.entries(offer.texts).map(([i, t]) => (
              <Field key={i} label={`Offer text (fills {{${Number(i) + 1}}})`} value={t} onChangeText={(v) => setOffer({ ...offer, texts: { ...offer.texts, [Number(i)]: v } })} multiline />
            ))}
            <Text style={[styles.note, { color: theme.text3 }]}>{offer.media ? `Attached: ${offer.media.split('/').pop()}` : 'No picture in the header.'}</Text>
            <View style={styles.actions}>
              <ActionButton label={offer.media ? 'Replace picture' : 'Choose picture'} tone="neutral" busy={busy === 'upload'} onPress={() => pickHeader((url) => setOffer((o) => (o ? { ...o, media: url } : o)))} />
              {offer.media ? <ActionButton label="Remove" tone="neutral" onPress={() => setOffer({ ...offer, media: '' })} /> : null}
            </View>
            <Text style={[styles.note, { color: theme.text3 }]}>Saving marks the offer as updated, so the next monthly send goes ahead.</Text>
          </View>
        ) : null}
      </FormSheet>

      {/* Test message */}
      <FormSheet
        visible={!!testing}
        title="Send me a test"
        onClose={() => setTesting(null)}
        footer={<ActionButton label="Send test" busy={busy === 'test'} onPress={sendTest} grow />}
      >
        <Field label="Your own mobile number" value={testPhone} onChangeText={setTestPhone} keyboardType="phone-pad" placeholder="10-digit mobile" hint="The test message is sent only to this number" />
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  note: { ...typography.caption, marginVertical: spacing(2), lineHeight: 18 },
  cap: { ...typography.caption, fontWeight: '700', marginTop: spacing(2), marginBottom: spacing(1) },
  offer: { ...typography.body, marginVertical: spacing(1) },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginVertical: spacing(2) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginVertical: spacing(2) },
  switchText: { ...typography.body, flex: 1 },
});
