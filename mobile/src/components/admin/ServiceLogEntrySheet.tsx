import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import FormSheet from './FormSheet';
import Field from './Field';
import ActionButton from './ActionButton';
import ListRow from './ListRow';
import { api } from '../../api/client';
import { ServiceLogRow } from '../../api/adminOps';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';
import { todayIso } from '../../utils/format';

interface TicketHit {
  id: string;
  ticket_no: string | null;
  full_name: string;
  phone: string | null;
  service_item: string | null;
  assigned_name: string | null;
  assigned_employee_id: string | null;
  description: string | null;
  employee_update_detail: string | null;
  bill_amount: number | string | null;
  payment_status: string | null;
}

interface Tech {
  id: string;
  full_name: string;
}

interface Props {
  visible: boolean;
  /** null adds a new entry. */
  entry: ServiceLogRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const STATUSES = ['paid', 'pending', 'unpaid'] as const;

// Service-register entry: link a real ticket (which pre-fills the fields) or
// type it all by hand. The amount is always yours to enter.
export default function ServiceLogEntrySheet({ visible, entry, onClose, onSaved }: Props) {
  const { theme } = useTheme();
  const [date, setDate] = useState(todayIso());
  const [ticket, setTicket] = useState('');
  const [hits, setHits] = useState<TicketHit[]>([]);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [techId, setTechId] = useState('');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [service, setService] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string>('pending');
  const [problem, setProblem] = useState('');
  const [items, setItems] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    api.get<Tech[]>('/service-logs/technicians').then(setTechs).catch(() => setTechs([]));
    const e = entry as (ServiceLogRow & { inquiry_id?: string | null; technician_id?: string | null }) | null;
    setDate((e?.log_date || todayIso()).slice(0, 10));
    setTicket(e?.ticket_no || '');
    setInquiryId(e?.inquiry_id || null);
    setTechId(e?.technician_id || '');
    setCustomer(e?.customer_name || '');
    setPhone(e?.customer_phone || '');
    setService(e?.service_type || '');
    setAmount(e?.amount != null ? String(Number(e.amount)) : '');
    setStatus(e?.payment_status || 'pending');
    setProblem(e?.problem || '');
    setItems(e?.items_used || '');
    setHits([]);
  }, [visible, entry]);

  const search = (q: string) => {
    setTicket(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (q.trim().length < 2) return setHits([]);
      api.get<TicketHit[]>(`/service-logs/tickets?q=${encodeURIComponent(q.trim())}`).then(setHits).catch(() => setHits([]));
    }, 250);
  };

  const pick = (t: TicketHit) => {
    setTicket(t.ticket_no || '');
    setCustomer(t.full_name || '');
    setPhone(t.phone || '');
    if (t.service_item) setService(t.service_item);
    const p = [t.description, t.employee_update_detail].filter(Boolean).join('\n');
    if (p) setProblem(p);
    if (t.assigned_employee_id && techs.some((x) => x.id === t.assigned_employee_id)) setTechId(t.assigned_employee_id);
    if (!amount && Number(t.bill_amount) > 0) setAmount(String(Number(t.bill_amount)));
    if (t.payment_status === 'paid') setStatus('paid');
    setInquiryId(t.id);
    setHits([]);
  };

  const save = async () => {
    if (!customer.trim()) return Alert.alert('Customer', 'Customer name is required');
    const tech = techs.find((t) => t.id === techId);
    const payload = {
      log_date: date,
      inquiry_id: inquiryId,
      ticket_no: ticket.trim() || null,
      technician_id: techId || null,
      technician_name: tech?.full_name || null,
      customer_name: customer.trim(),
      customer_phone: phone.trim(),
      service_type: service.trim(),
      problem: problem.trim(),
      items_used: items.trim(),
      amount,
      payment_status: status,
    };
    setBusy(true);
    try {
      if (entry) await api.put(`/service-logs/${entry.id}`, payload);
      else await api.post('/service-logs', payload);
      onSaved();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title={entry ? 'Edit entry' : 'New service-log entry'}
      onClose={onClose}
      footer={
        <>
          <ActionButton label="Cancel" tone="neutral" onPress={onClose} />
          <ActionButton label={entry ? 'Save changes' : 'Add entry'} onPress={save} busy={busy} />
        </>
      }
    >
      <Field label="Link a ticket (optional)" value={ticket} onChangeText={search} placeholder="Ticket number, name or phone" autoCapitalize="characters" />
      {inquiryId ? (
        <ActionButton
          label="Unlink ticket"
          tone="neutral"
          onPress={() => {
            setInquiryId(null);
            setTicket('');
            setHits([]);
          }}
        />
      ) : null}
      {hits.map((t) => (
        <ListRow
          key={t.id}
          icon="ticket"
          title={`${t.ticket_no || 'No ticket'} · ${t.full_name}`}
          subtitle={`${t.service_item || ''}${t.assigned_name ? ` — ${t.assigned_name}` : ''}`}
          onPress={() => pick(t)}
        />
      ))}
      <Field label="Date" value={date} onChangeText={setDate} hint="YYYY-MM-DD" />

      <Text style={[styles.label, { color: theme.text3 }]}>Technician</Text>
      <View style={styles.chips}>
        {[{ id: '', full_name: 'None' }, ...techs].map((t) => {
          const on = techId === t.id;
          return (
            <Pressable
              key={t.id || 'none'}
              onPress={() => setTechId(t.id)}
              style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
            >
              <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{t.full_name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field label="Customer name" value={customer} onChangeText={setCustomer} autoCapitalize="words" />
      <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Type of service" value={service} onChangeText={setService} placeholder="e.g. CCTV repair" />
      <Field label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="numeric" />

      <Text style={[styles.label, { color: theme.text3 }]}>Payment status</Text>
      <View style={styles.chips}>
        {STATUSES.map((s) => {
          const on = status === s;
          return (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              style={[styles.chip, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
            >
              <Text style={[styles.chipText, { color: on ? brand.primary : theme.text2 }]}>{s[0].toUpperCase() + s.slice(1)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field label="Problem description" value={problem} onChangeText={setProblem} multiline />
      <Field label="Items taken / used" value={items} onChangeText={setItems} multiline placeholder="e.g. 1TB HDD, 2 BNC connectors" />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  chipText: { ...typography.caption, fontSize: 12 },
});
