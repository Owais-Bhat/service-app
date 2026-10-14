import React, { useEffect, useMemo, useState } from 'react';
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
import Icon from '../../components/Icon';
import { api } from '../../api/client';
import { fetchParties, PartyRow } from '../../api/adminBooks';
import { CustomerDevice, fetchDevices } from '../../api/adminExtra';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { humanize, shortDate, todayIso } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'all' | 'faulty' | 'ending' | 'expired' | 'amc' | 'gone';

const CATEGORIES: [string, string][] = [
  ['dvr', 'DVR'], ['nvr', 'NVR'], ['camera', 'Camera'], ['switch', 'Switch'], ['router', 'Router'], ['hdd', 'Hard disk'],
  ['ups', 'UPS'], ['smps', 'Power supply'], ['access', 'Access control'], ['intercom', 'Intercom'], ['other', 'Other'],
];
const BRANDS = ['Hikvision', 'Dahua', 'CP Plus', 'Prama', 'Ezviz', 'Uniview', 'TP-Link', 'D-Link', 'Netgear', 'Cisco', 'Tenda', 'Seagate', 'WD'];

const WARRANTY: Record<string, { label: string; color: string }> = {
  in_warranty: { label: 'In warranty', color: semantic.success },
  ending: { label: 'Ending soon', color: semantic.warning },
  expired: { label: 'Out of warranty', color: semantic.danger },
};

interface DeviceEvent {
  id: string;
  event_date: string;
  kind: string;
  note: string | null;
  ticket_ref: string | null;
}
interface DeviceLoaded {
  device: CustomerDevice & { party_id: string; site_id: string | null; amc_contract_id: string | null; install_ref: string | null; notes: string | null; location_note: string | null };
  events: DeviceEvent[];
  replaced_by: { brand: string | null; model: string | null; serial_no: string | null } | null;
  replaces: { brand: string | null; model: string | null; serial_no: string | null } | null;
}

const plusYears = (from: string, y: number) => {
  const d = new Date(`${from || todayIso()}T00:00:00`);
  d.setFullYear(d.getFullYear() + y);
  return d.toISOString().slice(0, 10);
};

// What is installed at each customer and until when it is covered: add a
// device, log service or repair, mark it faulty, and replace it while keeping
// the history readable.
export default function SitesDevicesScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(fetchDevices, 'Could not load devices');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<DeviceLoaded | null>(null);
  const [editing, setEditing] = useState<DeviceLoaded | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // editor
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyQ, setPartyQ] = useState('');
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [siteId, setSiteId] = useState('');
  const [newSite, setNewSite] = useState('');
  const [amcs, setAmcs] = useState<{ id: string; contract_no: string; title: string | null }[]>([]);
  const [amcId, setAmcId] = useState('');
  const [cat, setCat] = useState('dvr');
  const [brandName, setBrandName] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [qty, setQty] = useState('1');
  const [where, setWhere] = useState('');
  const [installed, setInstalled] = useState(todayIso());
  const [warranty, setWarranty] = useState('');
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');

  // event / replace
  const [eventFor, setEventFor] = useState<string | null>(null);
  const [evKind, setEvKind] = useState('service');
  const [evNote, setEvNote] = useState('');
  const [evTicket, setEvTicket] = useState('');
  const [replaceFor, setReplaceFor] = useState<DeviceLoaded | null>(null);
  const [rpBrand, setRpBrand] = useState('');
  const [rpModel, setRpModel] = useState('');
  const [rpSerial, setRpSerial] = useState('');
  const [rpWarranty, setRpWarranty] = useState('');
  const [rpReason, setRpReason] = useState('');

  const devices = data.data?.devices ?? [];
  const s = data.data?.summary;

  useEffect(() => {
    if (!partyQ.trim()) return setParties([]);
    const t = setTimeout(() => fetchParties('customer', partyQ.trim()).then((r) => setParties(r.slice(0, 8))).catch(() => setParties([])), 250);
    return () => clearTimeout(t);
  }, [partyQ]);

  useEffect(() => {
    if (!partyId) {
      setSites([]);
      setAmcs([]);
      return;
    }
    api.get<{ id: string; name: string }[]>(`/device-sites?party_id=${encodeURIComponent(partyId)}`).then(setSites).catch(() => setSites([]));
    api.get<{ contracts: { id: string; contract_no: string; title: string | null }[] }>(`/amc/contracts?party_id=${encodeURIComponent(partyId)}`)
      .then((r) => setAmcs(r.contracts))
      .catch(() => setAmcs([]));
  }, [partyId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices
      .filter((d) => {
        if (filter === 'faulty') return d.status === 'faulty';
        if (filter === 'ending') return d.warranty_state === 'ending';
        if (filter === 'expired') return d.warranty_state === 'expired';
        if (filter === 'amc') return d.amc_status === 'active';
        return true;
      })
      .filter((d) => !q || `${d.party_name || ''} ${d.brand || ''} ${d.model || ''} ${d.serial_no || ''} ${d.site_name || ''} ${d.party_phone || ''}`.toLowerCase().includes(q));
  }, [devices, filter, query]);

  const open = async (id: string) => {
    setBusy(id);
    try {
      setDetail(await api.get<DeviceLoaded>(`/devices/${encodeURIComponent(id)}`));
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

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

  const openEditor = (d: DeviceLoaded | 'new') => {
    if (d === 'new') {
      setPartyId('');
      setPartyName('');
      setSiteId('');
      setAmcId('');
      setCat('dvr');
      setBrandName('');
      setModel('');
      setSerial('');
      setQty('1');
      setWhere('');
      setInstalled(todayIso());
      setWarranty('');
      setRef('');
      setNotes('');
    } else {
      const x = d.device;
      setPartyId(x.party_id);
      setPartyName(x.party_name || '');
      setSiteId(x.site_id || '');
      setAmcId(x.amc_contract_id || '');
      setCat(x.category);
      setBrandName(x.brand || '');
      setModel(x.model || '');
      setSerial(x.serial_no || '');
      setQty(String(x.quantity || 1));
      setWhere(x.location_note || '');
      setInstalled(String(x.installed_on || todayIso()).slice(0, 10));
      setWarranty(x.warranty_until ? String(x.warranty_until).slice(0, 10) : '');
      setRef(x.install_ref || '');
      setNotes(x.notes || '');
    }
    setNewSite('');
    setPartyQ('');
    setEditing(d);
  };

  const saveDevice = async () => {
    if (!partyId) return Alert.alert('Customer', 'Choose the customer');
    await act(
      'save',
      async () => {
        let site = siteId;
        if (newSite.trim()) {
          const made = await api.post<{ site?: { id: string }; id?: string }>('/device-sites', { party_id: partyId, name: newSite.trim(), address: '' });
          site = made.site?.id || made.id || '';
        }
        const payload = {
          party_id: partyId,
          site_id: site || null,
          category: cat,
          brand: brandName.trim(),
          model: model.trim(),
          serial_no: serial.trim(),
          quantity: Number(qty) || 1,
          location_note: where.trim(),
          installed_on: installed || null,
          warranty_until: warranty || null,
          amc_contract_id: amcId || null,
          install_ref: ref.trim(),
          notes: notes.trim(),
        };
        if (editing && editing !== 'new') await api.patch(`/devices/${encodeURIComponent(editing.device.id)}`, payload);
        else await api.post('/devices', payload);
      },
      () => setEditing(null),
    );
  };

  const d = detail?.device;
  const live = !!d && ['working', 'faulty'].includes(d.status);
  const patchStatus = (status: string, msg: string) =>
    d && act('status', () => api.patch(`/devices/${encodeURIComponent(d.id)}`, { status }), async () => setDetail(await api.get<DeviceLoaded>(`/devices/${encodeURIComponent(d.id)}`)));

  return (
    <AdminScreen
      title="Sites & Devices"
      subtitle={s ? `${s.devices} devices · ${s.customers} customers` : undefined}
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      headerRight={
        <Pressable onPress={() => openEditor('new')} hitSlop={8} style={[styles.add, { backgroundColor: brand.primary }]} accessibilityLabel="Add device">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Customer, brand, model or serial" />
          <FilterChips
            activeKey={filter}
            onSelect={(k) => setFilter(k as Filter)}
            items={[
              { key: 'all', label: 'All', count: devices.length },
              { key: 'faulty', label: 'Faulty', count: s?.faulty },
              { key: 'ending', label: 'Warranty ending', count: s?.warranty_ending },
              { key: 'expired', label: 'Out of warranty' },
              { key: 'amc', label: 'Under AMC', count: s?.under_amc },
            ]}
          />
        </>
      }
    >
      {s ? (
        <StatGrid
          items={[
            { label: 'Units installed', value: s.units },
            { label: 'In warranty', value: s.in_warranty, color: semantic.success },
            { label: 'Faulty', value: s.faulty, color: s.faulty ? semantic.danger : undefined },
            { label: 'Warranty ending', value: s.warranty_ending, color: s.warranty_ending ? semantic.warning : undefined },
          ]}
        />
      ) : null}
      {visible.length === 0 ? <EmptyNote text="No device matches — tap + to add one" icon="device" /> : null}
      {visible.map((x) => {
        const w = WARRANTY[x.warranty_state];
        return (
          <ListRow
            key={x.id}
            icon="device"
            iconColor={x.status === 'faulty' ? semantic.danger : undefined}
            title={x.party_name || 'Customer'}
            subtitle={`${x.category_label}${x.quantity > 1 ? ` ×${x.quantity}` : ''} · ${[x.brand, x.model].filter(Boolean).join(' ') || 'No model'}`}
            meta={`${x.site_name ? `${x.site_name} · ` : ''}${x.serial_no ? `S/N ${x.serial_no} · ` : ''}${x.warranty_until ? `warranty till ${shortDate(x.warranty_until)}` : 'no warranty date'}`}
            badge={x.status === 'faulty' ? { label: 'Faulty', color: semantic.danger } : w ?? { label: humanize(x.warranty_state), color: '#6d8278' }}
            onPress={() => open(x.id)}
          />
        );
      })}

      {/* Detail */}
      <FormSheet
        visible={!!detail}
        title={d ? `${d.category_label}${d.quantity > 1 ? ` ×${d.quantity}` : ''}` : 'Device'}
        subtitle={d ? `${d.party_name || ''} · ${humanize(d.status)}` : undefined}
        onClose={() => setDetail(null)}
      >
        {detail && d ? (
          <>
            {[
              ['Brand / model', [d.brand, d.model].filter(Boolean).join(' ') || '—'],
              ['Serial', d.serial_no || '—'],
              ['Site', d.site_name || '—'],
              ['Where', d.location_note || '—'],
              ['Installed', d.installed_on ? shortDate(d.installed_on) : '—'],
              ['Warranty', d.warranty_until ? `${shortDate(d.warranty_until)} · ${humanize(d.warranty_state)}` : 'Not recorded'],
              ['AMC', d.amc_contract_no ? `${d.amc_contract_no} (${humanize(d.amc_status)})` : 'Not covered'],
              ['Fitted under', d.install_ref || '—'],
            ].map(([k, v]) => (
              <View key={k} style={[styles.kv, { borderBottomColor: theme.line }]}>
                <Text style={[styles.k, { color: theme.text3 }]}>{k}</Text>
                <Text style={[styles.v, { color: theme.text }]} numberOfLines={2}>{v}</Text>
              </View>
            ))}
            {detail.replaced_by ? <Text style={[styles.k, { color: theme.text3 }]}>Replaced by {[detail.replaced_by.brand, detail.replaced_by.model].filter(Boolean).join(' ')} ({detail.replaced_by.serial_no || 'no serial'})</Text> : null}
            {detail.replaces ? <Text style={[styles.k, { color: theme.text3 }]}>Replaces {[detail.replaces.brand, detail.replaces.model].filter(Boolean).join(' ')} ({detail.replaces.serial_no || 'no serial'})</Text> : null}

            <SectionLabel>{`History (${detail.events.length})`}</SectionLabel>
            {detail.events.length === 0 ? <Text style={[styles.k, { color: theme.text3 }]}>No events yet.</Text> : null}
            {detail.events.map((e) => (
              <View key={e.id} style={[styles.kv, { borderBottomColor: theme.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.v, { color: theme.text, textAlign: 'left' }]}>{shortDate(e.event_date)} · {humanize(e.kind)}</Text>
                  <Text style={[styles.k, { color: theme.text3 }]}>{[e.ticket_ref, e.note].filter(Boolean).join(' · ') || '—'}</Text>
                </View>
              </View>
            ))}

            <SectionLabel>Actions</SectionLabel>
            <View style={styles.actions}>
              {live ? (
                <ActionButton label="Log service / repair" onPress={() => { setEvKind('service'); setEvNote(''); setEvTicket(''); setEventFor(d.id); }} />
              ) : null}
              <ActionButton label="Edit" tone="neutral" onPress={() => { openEditor(detail); setDetail(null); }} />
            </View>
            <View style={styles.actions}>
              {live ? (
                <ActionButton
                  label={d.status === 'faulty' ? 'Mark working' : 'Mark faulty'}
                  tone={d.status === 'faulty' ? 'success' : 'danger'}
                  busy={busy === 'status'}
                  onPress={() => patchStatus(d.status === 'faulty' ? 'working' : 'faulty', '')}
                />
              ) : null}
              {live ? (
                <ActionButton
                  label="Replace"
                  tone="neutral"
                  onPress={() => {
                    setRpBrand(d.brand || '');
                    setRpModel('');
                    setRpSerial('');
                    setRpWarranty('');
                    setRpReason('');
                    setReplaceFor(detail);
                  }}
                />
              ) : null}
              {d.status === 'removed' ? <ActionButton label="Put back" tone="success" onPress={() => patchStatus('working', '')} /> : null}
            </View>
            {live ? (
              <ActionButton
                label="Mark as taken away"
                tone="danger"
                onPress={() =>
                  Alert.alert('Mark as taken away?', 'Its history stays on record.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Mark', style: 'destructive', onPress: () => patchStatus('removed', '') },
                  ])
                }
              />
            ) : null}
            {d.party_phone ? <ActionButton label="Call customer" tone="neutral" onPress={() => Linking.openURL(`tel:${d.party_phone}`)} /> : null}
          </>
        ) : null}
      </FormSheet>

      {/* Add / edit */}
      <FormSheet
        visible={editing !== null}
        title={editing === 'new' ? 'Add a device' : 'Edit device'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} />
            <ActionButton label={editing === 'new' ? 'Add to register' : 'Save changes'} onPress={saveDevice} busy={busy === 'save'} />
          </>
        }
      >
        <Text style={[styles.k, { color: theme.text3 }]}>Customer</Text>
        {partyId ? (
          <ListRow icon="user" title={partyName || 'Customer'} footer={editing === 'new' ? <ActionButton label="Change" tone="neutral" onPress={() => { setPartyId(''); setPartyName(''); }} /> : undefined} />
        ) : (
          <>
            <SearchField value={partyQ} onChangeText={setPartyQ} placeholder="Search customer" />
            {parties.map((p) => (
              <ListRow key={p.id} icon="user" title={p.display_name} subtitle={p.phone || undefined} onPress={() => { setPartyId(p.id); setPartyName(p.display_name); setParties([]); setPartyQ(''); }} />
            ))}
          </>
        )}
        {partyId ? (
          <>
            <Text style={[styles.k, { color: theme.text3 }]}>Site</Text>
            <View style={styles.chips}>
              {[{ id: '', name: 'No site' }, ...sites].map((x) => {
                const on = siteId === x.id && !newSite;
                return (
                  <Pressable key={x.id || 'none'} onPress={() => { setSiteId(x.id); setNewSite(''); }} style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}>
                    <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{x.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Field label="Or add a new site" value={newSite} onChangeText={setNewSite} placeholder="e.g. Lal Chowk shop" />
          </>
        ) : null}
        <Text style={[styles.k, { color: theme.text3 }]}>Kind</Text>
        <View style={styles.chips}>
          {CATEGORIES.map(([k, l]) => {
            const on = cat === k;
            return (
              <Pressable key={k} onPress={() => setCat(k)} style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}>
                <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{l}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Brand" value={brandName} onChangeText={setBrandName} hint={BRANDS.slice(0, 6).join(' · ')} />
        <Field label="Model" value={model} onChangeText={setModel} />
        <Field label="Serial no." value={serial} onChangeText={setSerial} autoCapitalize="characters" />
        <Field label="Quantity (identical units)" value={qty} onChangeText={setQty} keyboardType="numeric" />
        <Field label="Where it is" value={where} onChangeText={setWhere} placeholder="Front gate, reception…" />
        <Field label="Installed on" value={installed} onChangeText={setInstalled} hint="YYYY-MM-DD" />
        <Field label="Warranty until" value={warranty} onChangeText={setWarranty} hint="YYYY-MM-DD" />
        <View style={styles.chips}>
          {[1, 2, 3].map((y) => (
            <Pressable key={y} onPress={() => setWarranty(plusYears(installed, y))} style={[styles.chip, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Text style={[styles.chipText, { color: theme.text2 }]}>+{y} yr</Text>
            </Pressable>
          ))}
        </View>
        {amcs.length ? (
          <>
            <Text style={[styles.k, { color: theme.text3 }]}>Under AMC contract</Text>
            <View style={styles.chips}>
              {[{ id: '', contract_no: 'Not covered', title: null }, ...amcs].map((a) => {
                const on = amcId === a.id;
                return (
                  <Pressable key={a.id || 'none'} onPress={() => setAmcId(a.id)} style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}>
                    <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{a.contract_no}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        <Field label="Fitted under (ticket or invoice no.)" value={ref} onChangeText={setRef} />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      </FormSheet>

      {/* Log event */}
      <FormSheet
        visible={eventFor !== null}
        title="Log service or repair"
        onClose={() => setEventFor(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEventFor(null)} />
            <ActionButton
              label="Save"
              busy={busy === 'event'}
              onPress={() =>
                act(
                  'event',
                  () => api.post(`/devices/${encodeURIComponent(eventFor as string)}/events`, { event_date: todayIso(), kind: evKind, note: evNote.trim(), ticket_ref: evTicket.trim() }),
                  async () => {
                    const id = eventFor as string;
                    setEventFor(null);
                    setDetail(await api.get<DeviceLoaded>(`/devices/${encodeURIComponent(id)}`));
                  },
                )
              }
            />
          </>
        }
      >
        <View style={styles.chips}>
          {[['service', 'Serviced'], ['repair', 'Repaired'], ['note', 'Note']].map(([k, l]) => {
            const on = evKind === k;
            return (
              <Pressable key={k} onPress={() => setEvKind(k)} style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}>
                <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{l}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Ticket no. (optional)" value={evTicket} onChangeText={setEvTicket} autoCapitalize="characters" />
        <Field label="Note" value={evNote} onChangeText={setEvNote} multiline />
      </FormSheet>

      {/* Replace */}
      <FormSheet
        visible={!!replaceFor}
        title="Replace device"
        subtitle="The new one takes its place — same customer, site, spot and contract"
        onClose={() => setReplaceFor(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setReplaceFor(null)} />
            <ActionButton
              label="Replace"
              tone="success"
              busy={busy === 'replace'}
              onPress={() => {
                const cur = replaceFor as DeviceLoaded;
                act(
                  'replace',
                  () =>
                    api.post(`/devices/${encodeURIComponent(cur.device.id)}/replace`, {
                      brand: rpBrand.trim(),
                      model: rpModel.trim(),
                      serial_no: rpSerial.trim(),
                      installed_on: todayIso(),
                      warranty_until: rpWarranty || null,
                      reason: rpReason.trim(),
                      ticket_ref: '',
                    }),
                  () => {
                    setReplaceFor(null);
                    setDetail(null);
                  },
                );
              }}
            />
          </>
        }
      >
        <Field label="New brand" value={rpBrand} onChangeText={setRpBrand} />
        <Field label="New model" value={rpModel} onChangeText={setRpModel} />
        <Field label="New serial no." value={rpSerial} onChangeText={setRpSerial} autoCapitalize="characters" />
        <Field label="Warranty until" value={rpWarranty} onChangeText={setRpWarranty} hint="YYYY-MM-DD" />
        <Field label="Why was it replaced?" value={rpReason} onChangeText={setRpReason} multiline />
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(3), paddingVertical: spacing(2), borderBottomWidth: StyleSheet.hairlineWidth },
  k: { ...typography.caption, fontSize: 12 },
  v: { ...typography.body, fontSize: 14, textAlign: 'right', flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5), marginBottom: spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2), maxWidth: '100%' },
  chipText: { ...typography.caption, fontSize: 12 },
});
