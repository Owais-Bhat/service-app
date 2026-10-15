import React, { useEffect, useState } from 'react';
import { ChoiceChips, ToggleSwitch } from './FinanceKit';
import { Alert, StyleSheet, Text, View } from 'react-native';
import FormSheet from './FormSheet';
import Field from './Field';
import ActionButton from './ActionButton';
import { createParty, lookupGstin, PartyFull, PartyInput, updateParty } from '../../api/adminParties';
import { GST_STATES, GST_TREATMENTS } from '../../utils/gst';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';

interface Props {
  visible: boolean;
  /** null creates a new party. */
  party: PartyFull | null;
  defaultKind?: 'customer' | 'supplier';
  onClose: () => void;
  onSaved: () => void;
}

function Choice({ items, value, onChange }: { items: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <ChoiceChips items={items} value={value} onChange={onChange} />;
}

const rupee = (paise: number | null | undefined) => (paise ? String(Number(paise) / 100) : '');

// Customer / supplier form: names, contact, GST treatment with GSTIN lookup,
// credit terms and the opening balance. GSTIN fills state and treatment.
export default function PartyEditor({ visible, party, defaultKind = 'customer', onClose, onSaved }: Props) {
  const { theme } = useTheme();
  const isEdit = !!party;
  const [name, setName] = useState('');
  const [legal, setLegal] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState('customer');
  const [treatment, setTreatment] = useState('unregistered');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [creditDays, setCreditDays] = useState('0');
  const [creditLimit, setCreditLimit] = useState('');
  const [opening, setOpening] = useState('');
  const [openingType, setOpeningType] = useState('receivable');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [pin, setPin] = useState('');
  const [notes, setNotes] = useState('');
  const [exempt, setExempt] = useState(false);
  const [reason, setReason] = useState('');
  const [active, setActive] = useState(true);
  const [gstNote, setGstNote] = useState('');
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(party?.display_name || '');
    setLegal(party?.legal_name || '');
    setPhone(party?.phone || '');
    setEmail(party?.email || '');
    setKind(party?.kind || defaultKind);
    setTreatment(party?.gst_treatment || 'unregistered');
    setGstin(party?.gstin || '');
    setStateCode(party?.place_of_supply_state_code || '');
    setCreditDays(String(Number(party?.credit_days) || 0));
    setCreditLimit(rupee(party?.credit_limit_paise));
    setOpening(rupee(party?.opening_balance_paise));
    setOpeningType(party?.opening_balance_type === 'payable' ? 'payable' : 'receivable');
    setLine1('');
    setCity('');
    setPin('');
    setNotes(party?.notes || '');
    setExempt(Number(party?.booking_exempt) === 1);
    setReason('');
    setActive(party ? Number(party.active) === 1 : true);
    setGstNote('');
  }, [visible, party, defaultKind]);

  const onGstin = (raw: string) => {
    const v = raw.toUpperCase().trim();
    setGstin(v);
    if (v.length === 15) {
      const st = GST_STATES.find(([c]) => c === v.slice(0, 2));
      if (st) {
        setStateCode(st[0]);
        setTreatment('registered');
        setGstNote(`Registered in ${st[1]}`);
      } else setGstNote('Unknown state code');
    } else setGstNote(v ? `${v.length}/15 characters` : '');
  };

  const fetchGst = async () => {
    if (gstin.length !== 15) return setGstNote('Enter all 15 characters first');
    setFetching(true);
    setGstNote('Fetching from the GST portal…');
    try {
      const r = await lookupGstin(gstin);
      if (!r.configured) return setGstNote('Online lookup is not set up on the server.');
      if (!r.found || !r.details) return setGstNote(r.error || 'Nothing found for this GSTIN');
      const d = r.details;
      if (!legal.trim()) setLegal(d.legal_name);
      if (!name.trim()) setName(d.trade_name || d.legal_name);
      if (!line1.trim()) setLine1(d.address.line1);
      if (!city.trim()) setCity(d.address.city);
      if (!pin.trim()) setPin(d.address.pincode);
      if (d.address.state_code) setStateCode(d.address.state_code);
      setGstNote(`${d.legal_name}${d.status ? ` · ${d.status}` : ''}`);
    } catch (e) {
      setGstNote(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name', 'A name is required');
    const body: PartyInput = {
      display_name: name.trim(),
      legal_name: legal.trim(),
      phone: phone.trim(),
      email: email.trim(),
      kind,
      gst_treatment: treatment,
      gstin: gstin.trim(),
      place_of_supply_state_code: stateCode,
      credit_days: Number(creditDays) || 0,
      credit_limit: creditLimit || 0,
      opening_balance: opening || 0,
      opening_balance_type: openingType,
      notes: notes.trim(),
      booking_exempt: exempt,
    };
    if (party) {
      body.reason = reason.trim();
      body.active = active;
    } else if (line1.trim()) {
      body.addresses = [{ kind: 'billing', line1: line1.trim(), city: city.trim(), pincode: pin.trim(), state_code: stateCode, is_default: true }];
    }
    setBusy(true);
    try {
      if (party) await updateParty(party.id, body);
      else await createParty(body);
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
      title={isEdit ? 'Edit party' : 'New customer / supplier'}
      subtitle={party?.display_name}
      onClose={onClose}
      footer={
        <>
          <ActionButton label="Cancel" tone="neutral" onPress={onClose} />
          <ActionButton label={isEdit ? 'Save changes' : 'Create'} onPress={save} busy={busy} />
        </>
      }
    >
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Shop or person as everyone calls them" />
      <Field label="Legal name (on the invoice)" value={legal} onChangeText={setLegal} autoCapitalize="words" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />

      <Text style={[styles.label, { color: theme.text2 }]}>They are a</Text>
      <Choice items={[['customer', 'Customer'], ['supplier', 'Supplier'], ['both', 'Both']]} value={kind} onChange={setKind} />

      <Text style={[styles.label, { color: theme.text2 }]}>GST treatment</Text>
      <Choice items={GST_TREATMENTS} value={treatment} onChange={setTreatment} />

      <Field label="GSTIN" value={gstin} onChangeText={onGstin} autoCapitalize="characters" hint={gstNote || '15 characters'} />
      <ActionButton label={fetching ? 'Fetching…' : 'Fetch from GST portal'} tone="neutral" busy={fetching} onPress={fetchGst} />

      <Text style={[styles.label, { color: theme.text2 }]}>Place of supply</Text>
      <Choice items={[['', 'Not set'], ...GST_STATES]} value={stateCode} onChange={setStateCode} />

      <Field label="Credit days" value={creditDays} onChangeText={setCreditDays} keyboardType="numeric" />
      <Field label="Credit limit (₹)" value={creditLimit} onChangeText={setCreditLimit} keyboardType="numeric" />
      <Field label="Opening balance (₹)" value={opening} onChangeText={setOpening} keyboardType="numeric" hint="What was outstanding before NEST" />
      <Choice items={[['receivable', 'They owe us'], ['payable', 'We owe them']]} value={openingType} onChange={setOpeningType} />

      {!isEdit ? (
        <>
          <Text style={[styles.label, { color: theme.text2 }]}>Billing address</Text>
          <Field label="Address" value={line1} onChangeText={setLine1} />
          <Field label="City" value={city} onChangeText={setCity} />
          <Field label="Pincode" value={pin} onChangeText={setPin} keyboardType="numeric" />
        </>
      ) : null}

      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      <View style={[styles.switchRow, { borderBottomColor: theme.line }]}>
        <Text style={[styles.switchLabel, { color: theme.text }]}>Can book a new service even with a payment pending</Text>
        <ToggleSwitch value={exempt} onValueChange={setExempt} />
      </View>
      {isEdit ? (
        <>
          <Field label="Reason for this change" value={reason} onChangeText={setReason} hint="Kept in the audit trail" />
          <View style={[styles.switchRow, { borderBottomColor: theme.line }]}>
            <Text style={[styles.switchLabel, { color: active ? theme.text : theme.err }]}>Active</Text>
            <ToggleSwitch value={active} onValueChange={setActive} />
          </View>
        </>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(3), paddingVertical: spacing(2), borderBottomWidth: 1 },
  switchLabel: { ...typography.body, fontSize: 14, flex: 1 },
});
