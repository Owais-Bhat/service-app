import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import ActionButton from './ActionButton';
import Field from './Field';
import FormSheet from './FormSheet';
import { api } from '../../api/client';
import { lookupGstin } from '../../api/adminParties';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';

export interface CreatedParty {
  id: string;
  display_name: string;
  phone: string | null;
}

interface Props {
  kind: 'customer' | 'supplier';
  /** What the user already typed in the search box: becomes the name (or the phone, if it is digits). */
  seed?: string;
  onCreated: (party: CreatedParty) => void;
}

let businessState: string | null = null;
async function stateOfBusiness(): Promise<string> {
  if (businessState === null) {
    try {
      businessState = (await api.get<{ business?: { state_code?: string } }>('/accounting/business')).business?.state_code || '';
    } catch {
      businessState = '';
    }
  }
  return businessState;
}

// A customer or supplier added without leaving the invoice, quotation, order or
// contract being written — the same short form the web has. It is the same
// record Customers & Suppliers holds; the rest of the details can be added there.
export default function NewPartyButton({ kind, seed, onCreated }: Props) {
  const { theme } = useTheme();
  const word = kind === 'supplier' ? 'supplier' : 'customer';
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [gstNote, setGstNote] = useState('');
  const [city, setCity] = useState('');
  const [credit, setCredit] = useState('');
  const [legal, setLegal] = useState('');
  const [fetched, setFetched] = useState<{ line1: string; city: string; pincode: string; state_code: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const show = () => {
    const s = (seed || '').trim();
    const digits = s.replace(/\D/g, '');
    const isPhone = !!s && /^[\d\s+()-]+$/.test(s) && digits.length >= 6;
    setName(isPhone ? '' : s);
    setPhone(isPhone ? digits.slice(-10) : '');
    setGstin('');
    setGstNote('');
    setCity('');
    setCredit('');
    setLegal('');
    setFetched(null);
    setOpen(true);
  };

  // A complete GSTIN brings the name and address the GST portal holds for it
  // (when a lookup service is set up); nothing typed by hand is overwritten.
  const onGstin = async (raw: string) => {
    const value = raw.toUpperCase().replace(/\s/g, '');
    setGstin(value);
    setFetched(null);
    if (value.length !== 15) {
      setGstNote(value ? `${value.length}/15 characters` : '');
      return;
    }
    setGstNote('Looking it up…');
    try {
      const r = await lookupGstin(value);
      if (r.found && r.details) {
        const d = r.details;
        setFetched(d.address);
        setLegal(d.legal_name);
        setName((cur) => cur.trim() || d.trade_name || d.legal_name || '');
        setCity((cur) => cur.trim() || d.address.city || '');
        setGstNote(`${d.legal_name}${d.status ? ` · ${d.status}` : ''} — ${d.address.full}`);
      } else {
        setGstNote(r.error || (r.configured === false ? 'Valid GSTIN. The portal lookup is not set up, so type the name and city.' : ''));
      }
    } catch {
      setGstNote('');
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return Alert.alert('Name needed', `Enter the ${word}'s name`);
    setBusy(true);
    try {
      const state = await stateOfBusiness();
      const where = city.trim() || fetched?.city || '';
      const party = await api.post<CreatedParty>('/parties', {
        display_name: trimmed,
        kind: word,
        legal_name: legal || undefined,
        phone: phone.trim() || null,
        gstin: gstin || null,
        // The state a supply is taxed for: taken from the GSTIN when there is
        // one (the server does that), else assumed to be the business's own.
        place_of_supply_state_code: gstin ? undefined : state || undefined,
        credit_days: Number(credit) || 0,
        addresses: fetched
          ? [{ kind: 'billing', line1: fetched.line1 || undefined, city: where || undefined, pincode: fetched.pincode || undefined, state_code: fetched.state_code || state || undefined, is_default: true }]
          : where
            ? [{ kind: 'billing', city: where, state_code: state || undefined, is_default: true }]
            : [],
      });
      setOpen(false);
      onCreated(party);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ActionButton label={`+ New ${word}`} tone="neutral" onPress={show} />
      <FormSheet
        visible={open}
        title={`New ${word}`}
        subtitle="Saved in Customers & Suppliers too"
        onClose={() => setOpen(false)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setOpen(false)} />
            <ActionButton label={`Save ${word}`} busy={busy} onPress={save} />
          </>
        }
      >
        <Field label="Name" required value={name} onChangeText={setName} placeholder="Person or company" autoCapitalize="words" />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="10-digit mobile" keyboardType="phone-pad" />
        <Field label="GSTIN (if registered)" value={gstin} onChangeText={onGstin} placeholder="15 characters" autoCapitalize="characters" />
        {gstNote ? <Text style={[styles.note, { color: theme.text3 }]}>{gstNote}</Text> : null}
        <Field label="City / area" value={city} onChangeText={setCity} placeholder="Srinagar" autoCapitalize="words" />
        <Field label="Credit days" value={credit} onChangeText={setCredit} placeholder="0" keyboardType="number-pad" />
      </FormSheet>
    </>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.caption, marginTop: -spacing(1.5) },
});
