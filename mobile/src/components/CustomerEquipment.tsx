import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ActionButton from './admin/ActionButton';
import StatusBadge from './admin/StatusBadge';
import Icon from './Icon';
import { api } from '../api/client';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { shortDate } from '../utils/format';

interface Device {
  quantity: number;
  brand: string | null;
  model: string | null;
  category_label: string;
  location_note: string | null;
  serial_no: string | null;
  site_name: string | null;
  status: string;
  warranty_state: string;
  warranty_until: string | null;
  warranty_days: number;
}
interface Contract {
  id: string;
  contract_no: string;
  title: string;
  state: string;
  end_date: string;
  days_left: number;
  days_overdue: number;
  visits_included: number | null;
  visits_left: number;
}
interface Found {
  parties: { party: string; devices: Device[]; contracts: Contract[] }[];
}

type WarrantyTone = 'ok' | 'warn' | 'err' | 'grey';

const WARRANTY: Record<string, [WarrantyTone, string]> = {
  in_warranty: ['ok', 'In warranty'],
  ending: ['warn', 'Ending soon'],
  expired: ['err', 'Expired'],
  none: ['grey', 'Not recorded'],
};

const warrantyText = (d: Device) => {
  if (!d.warranty_until) return 'no warranty date';
  if (d.warranty_state === 'expired') return `ended ${Math.abs(d.warranty_days)} days ago`;
  return `${d.warranty_days} days left`;
};

// "What do we know about this caller": the customer matched by phone, what is
// installed there and its warranty, and any AMC running (with visits left, and a
// button to count this job as one). Says nothing when the phone matches nobody.
export default function CustomerEquipment({ phone, ticketNo }: { phone?: string | null; ticketNo?: string | null }) {
  const { theme } = useTheme();
  const [found, setFound] = useState<Found | null>(null);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setFound(null);
    if (!phone) return undefined;
    api
      .get<Found>(`/devices/lookup?phone=${encodeURIComponent(phone)}`)
      .then((f) => alive && setFound(f))
      .catch(() => undefined); // not allowed to see the register, or no match — stay quiet
    return () => {
      alive = false;
    };
  }, [phone]);

  const parties = (found?.parties ?? []).filter((p) => p.devices.length || p.contracts.length);
  if (parties.length === 0) return null;

  const countVisit = async (contractId: string) => {
    setBusy(contractId);
    setError(null);
    try {
      const out = await api.post<{ chargeable?: boolean }>(`/amc/contracts/${encodeURIComponent(contractId)}/visits`, {
        kind: 'complaint',
        ticket_ref: ticketNo,
        note: 'Service request',
        visit_date: new Date().toLocaleDateString('en-CA'),
      });
      setCounted((c) => ({ ...c, [contractId]: out.chargeable ? 'Counted (chargeable)' : 'Counted as an AMC visit ✓' }));
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'Could not count the visit');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      {parties.map((p) => {
        const running = p.contracts.find((c) => c.state === 'active');
        const lapsed = !running ? p.contracts.find((c) => c.state === 'expired') : undefined;
        const groups = new Map<string, Device[]>();
        p.devices.forEach((d) => groups.set(d.site_name || 'No site set', [...(groups.get(d.site_name || 'No site set') || []), d]));
        return (
          <View key={p.party} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.panel }]}>
            <Text style={[styles.label, { color: theme.text3 }]}>Customer equipment · {p.party}</Text>
            {running ? (
              <View style={[styles.amc, { backgroundColor: theme.okS }]}>
                <Text style={[styles.amcTitle, { color: theme.ok }]}>AMC active — {running.contract_no}</Text>
                <Text style={[styles.small, { color: theme.text2 }]}>
                  {running.title} · ends {shortDate(running.end_date)} ({running.days_left} days) ·{' '}
                  {running.visits_included === null ? 'unlimited visits' : running.visits_left > 0 ? `${running.visits_left} free visit${running.visits_left === 1 ? '' : 's'} left` : 'no free visits left — further visits are chargeable'}
                </Text>
                {ticketNo ? (
                  counted[running.id] ? (
                    <Text style={[styles.small, { color: theme.ok, marginTop: spacing(2) }]}>{counted[running.id]}</Text>
                  ) : (
                    <View style={{ marginTop: spacing(2), alignSelf: 'flex-start' }}>
                      <ActionButton label="Count this as an AMC visit" tone="neutral" busy={busy === running.id} onPress={() => countVisit(running.id)} />
                    </View>
                  )
                ) : null}
                {error ? <Text style={[styles.small, { color: theme.err, marginTop: spacing(1) }]}>{error}</Text> : null}
              </View>
            ) : lapsed ? (
              <View style={[styles.amc, { backgroundColor: theme.warnS }]}>
                <Text style={[styles.small, { color: theme.text }]}>
                  AMC expired {lapsed.days_overdue} days ago ({lapsed.contract_no}). Worth offering a renewal on this visit.
                </Text>
              </View>
            ) : null}

            {p.devices.length === 0 ? <Text style={[styles.small, { color: theme.text3 }]}>No equipment registered for this customer yet.</Text> : null}
            {[...groups.entries()].map(([site, list]) => (
              <View key={site}>
                <Text style={[styles.site, { color: theme.text2 }]}>{site}</Text>
                {list.map((d, i) => {
                  const [tone, label] = WARRANTY[d.warranty_state] || WARRANTY.none;
                  const color = theme[tone];
                  return (
                    <View key={i} style={[styles.device, i < list.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                      <View style={[styles.tile, { backgroundColor: theme.tealS }]}>
                        <Icon name="device" size={20} color={theme.teal} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.devName, { color: theme.text }]}>
                          {d.quantity > 1 ? `${d.quantity} × ` : ''}
                          {[d.brand, d.model].filter(Boolean).join(' ') || d.category_label}
                          {d.status === 'faulty' ? '  · FAULTY' : ''}
                        </Text>
                        <Text style={[styles.serial, { color: theme.text3 }]}>
                          {d.category_label}
                          {d.location_note ? ` · ${d.location_note}` : ''}
                          {d.serial_no ? ` · SN ${d.serial_no}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <StatusBadge label={label} color={color} />
                        <Text style={[styles.small, { color: theme.text3, fontSize: 11 }]}>{warrantyText(d)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// Design "Customer equipment" block: solid panel r20, overline label, a 40 dp
// teal tile per device with a mono serial and a warranty badge.
const styles = StyleSheet.create({
  wrap: { gap: spacing(3) },
  card: { borderWidth: 1, borderRadius: 20, padding: spacing(3.5), marginTop: spacing(3), gap: spacing(2.5) },
  label: { ...typography.overline },
  amc: { borderRadius: radius.md, padding: spacing(3) },
  amcTitle: { ...typography.rowTitle, fontSize: 13 },
  small: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  site: { ...typography.caption, fontSize: 12, marginBottom: spacing(1) },
  device: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2) },
  tile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  devName: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  serial: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 11 },
});
