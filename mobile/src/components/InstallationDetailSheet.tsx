import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import PressScale from './PressScale';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { ApiError } from '../api/client';
import {
  fetchInstallation,
  installationAction,
  assignInstallation,
  saveInstallationBill,
  setInstallationPayment,
  InstallationJob,
} from '../api/installations';
import { fetchInventoryItems, saveBillItems, InventoryItem, BillItemLine } from '../api/inventory';

const GST_RATE = 0.18;

export interface EmployeeOption {
  id: string;
  full_name: string;
}

interface Props {
  id: string;
  isAdmin?: boolean;
  employees?: EmployeeOption[];
  onClose: () => void;
  onChanged?: () => void;
}

const when = (v?: string | null) =>
  v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const num = (v: unknown) => Number(v || 0);

// The whole life of one installation on a single sheet: where it is now, what
// was fitted, the bill, and the money. Payment stays separate from finishing
// the job — the bill is handed over on site and settled whenever the cash
// actually arrives, by the technician there and then or by admin later.
export default function InstallationDetailSheet({ id, isAdmin, employees = [], onClose, onChanged }: Props) {
  const { theme } = useTheme();
  const [job, setJob] = useState<InstallationJob | null>(null);
  const [billItems, setBillItems] = useState<BillItemLine[]>([]);
  const [labour, setLabour] = useState('');
  const [gstOn, setGstOn] = useState(false);
  const [note, setNote] = useState('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { installation, items } = await fetchInstallation(id);
      setJob(installation);
      setBillItems(items.map((it) => ({
        item_id: it.item_id,
        name: it.name,
        quantity: Number(it.quantity),
        rate: Number(it.rate),
      })));
      setLabour(num(installation.labour_charge) ? String(Math.round(num(installation.labour_charge))) : '');
      setGstOn(!!Number(installation.gst_applied));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this installation');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchInventoryItems().then(setInventory).catch(() => setInventory([]));
  }, []);

  const totals = useMemo(() => {
    const items = billItems.reduce((sum, it) => sum + it.quantity * it.rate, 0);
    const base = items + (Number(labour) || 0);
    const gst = gstOn ? Math.round(base * GST_RATE) : 0;
    return { items, base, gst, total: base + gst };
  }, [billItems, labour, gstOn]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save — check your connection');
    } finally {
      setBusy(null);
    }
  };

  const addItem = (inv: InventoryItem) => {
    setBillItems((prev) => {
      const found = prev.find((it) => it.item_id === inv.id);
      if (found) return prev.map((it) => (it.item_id === inv.id ? { ...it, quantity: it.quantity + 1 } : it));
      return [...prev, { item_id: inv.id, name: inv.name, quantity: 1, rate: Number(inv.selling_rate) }];
    });
    setShowPicker(false);
  };

  const changeQty = (itemId: string | null, delta: number) => {
    setBillItems((prev) => prev
      .map((it) => (it.item_id === itemId ? { ...it, quantity: Math.max(0, it.quantity + delta) } : it))
      .filter((it) => it.quantity > 0));
  };

  const saveBill = () => run('bill', async () => {
    await saveBillItems('installation', id, billItems);
    await saveInstallationBill(id, { labour_charge: Number(labour) || 0, gst_applied: gstOn });
  });

  const step = (label: string, at?: string | null, detail?: string | null) => (
    <View key={label} style={styles.stepRow}>
      <View style={[styles.stepDot, { backgroundColor: at ? brand.primary : theme.panel2, borderColor: at ? brand.primary : theme.line }]}>
        {at ? <Icon name="check" size={9} color="#fff" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stepLabel, { color: at ? theme.text : theme.text3 }]}>{label}</Text>
        {at ? <Text style={[styles.stepWhen, { color: theme.text3 }]}>{when(at)}</Text> : null}
        {detail ? <Text style={[styles.stepWhen, { color: theme.text2 }]}>{detail}</Text> : null}
      </View>
    </View>
  );

  const body = () => {
    if (loading) return <ActivityIndicator color={brand.primary} style={{ margin: spacing(8) }} />;
    if (!job) return <Text style={[styles.empty, { color: theme.text3 }]}>{error || 'Installation not found'}</Text>;

    const pendingAccept = job.assignment_status === 'pending' && !!job.assigned_employee_id;
    const accepted = job.assignment_status === 'accepted';
    const started = !!job.started_at;
    const completed = !!job.completed_at;
    const billed = num(job.bill_total) > 0;
    const paid = String(job.payment_status || '').toLowerCase() === 'paid';

    return (
      <>
        <View style={styles.block}>
          <Text style={[styles.custName, { color: theme.text }]}>{job.full_name}</Text>
          <Text style={[styles.meta, { color: theme.text2 }]}>{job.installation_type}</Text>
          <Text style={[styles.meta, { color: theme.text3 }]}>{job.address || job.location}</Text>
          <Text style={[styles.meta, { color: theme.text3 }]}>
            {job.preferred_date} · {job.preferred_time}
            {job.employee_name ? ` · ${job.employee_name}` : ''}
          </Text>
          <View style={styles.iconRow}>
            <Pressable
              onPress={() => Linking.openURL(`tel:${job.phone}`)}
              style={[styles.iconAction, { borderColor: theme.line, backgroundColor: theme.panel2 }]}
            >
              <Icon name="phone" size={15} color={theme.text} />
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address || job.location)}`)}
              style={[styles.iconAction, { borderColor: theme.line, backgroundColor: theme.panel2 }]}
            >
              <Icon name="pin" size={15} color={theme.text} />
            </Pressable>
            {isAdmin ? (
              <Pressable
                onPress={() => setShowAssign(true)}
                style={[styles.iconAction, { borderColor: theme.line, backgroundColor: theme.panel2 }]}
              >
                <Icon name="user" size={15} color={theme.text} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={[styles.block, { borderTopColor: theme.line, borderTopWidth: 1 }]}>
          {step('Booked', job.created_at)}
          {step('Assigned', job.assigned_at, job.employee_name || null)}
          {job.assignment_status === 'declined'
            ? step('Declined', job.employee_update_at || job.assigned_at, job.decline_reason)
            : step('Accepted', job.accepted_at)}
          {step('Work started', job.started_at, job.employee_update_detail)}
          {step('Completed', job.completed_at)}
          {step('Bill made', job.bill_generated_at, job.bill_no ? `Bill ${job.bill_no}` : null)}
          {step('Paid', job.payment_received_at, job.payment_method || null)}
        </View>

        {/* Status actions — only the one that comes next is offered. */}
        <View style={[styles.block, { borderTopColor: theme.line, borderTopWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Status</Text>

          {pendingAccept ? (
            <View style={styles.btnRow}>
              <PressScale onPress={() => run('accept', () => installationAction(id, 'accept'))} disabled={!!busy} style={{ flex: 1 }}>
                <View style={[styles.primaryBtn, { backgroundColor: brand.primary }]}>
                  <Text style={styles.primaryBtnText}>{busy === 'accept' ? 'Saving…' : 'Accept'}</Text>
                </View>
              </PressScale>
              <PressScale
                onPress={() => run('decline', () => installationAction(id, 'decline', note.trim() || 'No reason given'))}
                disabled={!!busy}
                style={{ flex: 1 }}
              >
                <View style={[styles.ghostBtn, { borderColor: semantic.danger }]}>
                  <Text style={[styles.ghostBtnText, { color: semantic.danger }]}>Decline</Text>
                </View>
              </PressScale>
            </View>
          ) : null}

          {(accepted || isAdmin) && !started && !completed ? (
            <PressScale onPress={() => run('start', () => installationAction(id, 'start', note.trim() || undefined))} disabled={!!busy}>
              <View style={[styles.primaryBtn, { backgroundColor: brand.primary }]}>
                <Text style={styles.primaryBtnText}>{busy === 'start' ? 'Saving…' : 'Start Installation'}</Text>
              </View>
            </PressScale>
          ) : null}

          {started && !completed ? (
            <PressScale onPress={() => run('complete', () => installationAction(id, 'complete', note.trim() || undefined))} disabled={!!busy}>
              <View style={[styles.primaryBtn, { backgroundColor: brand.primary }]}>
                <Text style={styles.primaryBtnText}>{busy === 'complete' ? 'Saving…' : 'Mark Completed'}</Text>
              </View>
            </PressScale>
          ) : null}

          <Text style={[styles.fieldLabel, { color: theme.text3 }]}>
            {pendingAccept ? 'Note / reason for declining' : 'Progress note'}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.line }]}
            placeholder="What is happening on site?"
            placeholderTextColor={theme.text3}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <PressScale
            onPress={() => run('note', async () => {
              await installationAction(id, 'update', note.trim());
              setNote('');
            })}
            disabled={!!busy || !note.trim()}
          >
            <View style={[styles.ghostBtn, { borderColor: theme.line }]}>
              <Text style={[styles.ghostBtnText, { color: theme.text }]}>{busy === 'note' ? 'Saving…' : 'Save Update'}</Text>
            </View>
          </PressScale>
        </View>

        {/* The on-site bill: parts, labour, and GST only if this bill carries it. */}
        <View style={[styles.block, { borderTopColor: theme.line, borderTopWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Bill</Text>

          {billItems.map((it) => (
            <View key={it.item_id || it.name} style={[styles.itemRow, { borderColor: theme.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>{it.name}</Text>
                <Text style={[styles.itemMeta, { color: theme.text3 }]}>
                  {it.quantity} × ₹{it.rate} = ₹{Math.round(it.quantity * it.rate)}
                </Text>
              </View>
              <Pressable onPress={() => changeQty(it.item_id, -1)} hitSlop={8} style={styles.qtyBtn}>
                <Text style={[styles.qtyBtnText, { color: theme.text }]}>−</Text>
              </Pressable>
              <Pressable onPress={() => changeQty(it.item_id, 1)} hitSlop={8} style={styles.qtyBtn}>
                <Text style={[styles.qtyBtnText, { color: theme.text }]}>+</Text>
              </Pressable>
            </View>
          ))}

          <PressScale onPress={() => setShowPicker(true)}>
            <View style={[styles.addBtn, { backgroundColor: brand.primaryDim }]}>
              <Text style={styles.addBtnText}>+  Add Item</Text>
              <Icon name="chevron-right" size={15} color="#ffffff" />
            </View>
          </PressScale>

          <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Labour charge</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.line }]}
            placeholder="₹0"
            placeholderTextColor={theme.text3}
            keyboardType="numeric"
            value={labour}
            onChangeText={setLabour}
          />

          <Pressable onPress={() => setGstOn((v) => !v)} style={styles.gstRow}>
            <View style={[styles.gstBox, { borderColor: gstOn ? brand.primary : theme.line, backgroundColor: gstOn ? brand.primary : 'transparent' }]}>
              {gstOn ? <Icon name="check" size={11} color="#fff" /> : null}
            </View>
            <Text style={[styles.gstLabel, { color: theme.text2 }]}>Charge GST (18%) on this bill</Text>
          </Pressable>

          <View style={[styles.totalRow, { borderTopColor: theme.line }]}>
            <Text style={[styles.totalLabel, { color: theme.text3 }]}>Items ₹{Math.round(totals.items)} · Labour ₹{Math.round(Number(labour) || 0)}{gstOn ? ` · GST ₹${totals.gst}` : ''}</Text>
            <Text style={[styles.totalValue, { color: brand.primary }]}>₹{Math.round(totals.total)}</Text>
          </View>

          <PressScale onPress={saveBill} disabled={!!busy}>
            <View style={[styles.primaryBtn, { backgroundColor: brand.primary }]}>
              <Text style={styles.primaryBtnText}>{busy === 'bill' ? 'Saving…' : billed ? 'Update Bill' : 'Generate Bill'}</Text>
            </View>
          </PressScale>
          <Text style={[styles.hint, { color: theme.text3 }]}>
            Hand the bill over on site. Payment can be taken now or later — the office sees it either way.
          </Text>
        </View>

        {/* Money, whenever it lands. Cash on site is optional, never assumed. */}
        {billed ? (
          <View style={[styles.block, { borderTopColor: theme.line, borderTopWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Payment</Text>
            <Text style={[styles.meta, { color: paid ? semantic.success : semantic.warning }]}>
              {paid
                ? `Paid ₹${Math.round(num(job.bill_total))}${job.payment_method ? ` · ${job.payment_method}` : ''}`
                : `₹${Math.round(num(job.bill_total))} unpaid`}
            </Text>
            {!paid ? (
              <PressScale onPress={() => run('cash', () => setInstallationPayment(id, { paid: true, method: 'cash' }))} disabled={!!busy}>
                <View style={[styles.ghostBtn, { borderColor: brand.primary }]}>
                  <Text style={[styles.ghostBtnText, { color: brand.primary }]}>
                    {busy === 'cash' ? 'Saving…' : isAdmin ? 'Mark Paid (cash)' : 'Cash received on site'}
                  </Text>
                </View>
              </PressScale>
            ) : isAdmin ? (
              <PressScale onPress={() => run('unpaid', () => setInstallationPayment(id, { paid: false }))} disabled={!!busy}>
                <View style={[styles.ghostBtn, { borderColor: theme.line }]}>
                  <Text style={[styles.ghostBtnText, { color: theme.text }]}>{busy === 'unpaid' ? 'Saving…' : 'Mark Unpaid'}</Text>
                </View>
              </PressScale>
            ) : null}
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: semantic.danger }]}>{error}</Text> : null}
      </>
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View entering={ZoomIn.duration(320).springify().damping(15).mass(0.85)} style={styles.cardWrap}>
          <GlassSurface style={styles.card} borderRadius={radius.lg}>
            <View style={[styles.headRow, { borderBottomColor: theme.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text }]}>{job?.ticket_no || 'Installation'}</Text>
                <Text style={[styles.sub, { color: theme.text3 }]}>{job?.status ? job.status.replace(/_/g, ' ') : 'Loading…'}</Text>
              </View>
              <PressScale onPress={onClose}>
                <View style={[styles.closeBtn, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                  <Icon name="close" size={13} color={theme.text3} />
                </View>
              </PressScale>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>{body()}</ScrollView>
          </GlassSurface>
        </Animated.View>
      </KeyboardAvoidingView>

      {showPicker ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
          <View style={styles.pickerBackdrop}>
            <GlassSurface style={styles.pickerCard} borderRadius={radius.lg}>
              <View style={[styles.pickerHead, { borderBottomColor: theme.line }]}>
                <Text style={[styles.pickerTitle, { color: theme.text }]}>Add Item</Text>
                <PressScale onPress={() => setShowPicker(false)}>
                  <View style={[styles.closeBtn, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                    <Icon name="close" size={13} color={theme.text3} />
                  </View>
                </PressScale>
              </View>
              <ScrollView style={{ maxHeight: 380 }}>
                {inventory.length === 0 ? (
                  <Text style={[styles.pickerEmpty, { color: theme.text3 }]}>No items in inventory yet.</Text>
                ) : (
                  inventory.map((inv) => (
                    <Pressable key={inv.id} onPress={() => addItem(inv)} style={[styles.pickerRow, { borderBottomColor: theme.line }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemName, { color: theme.text }]}>{inv.name}</Text>
                        <Text style={[styles.itemMeta, { color: theme.text3 }]}>
                          {Number(inv.quantity)} {inv.unit || 'pcs'} in stock
                        </Text>
                      </View>
                      <Text style={[styles.pickerRate, { color: brand.primary }]}>₹{Number(inv.selling_rate)}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </GlassSurface>
          </View>
        </Modal>
      ) : null}

      {showAssign ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowAssign(false)}>
          <View style={styles.pickerBackdrop}>
            <GlassSurface style={styles.pickerCard} borderRadius={radius.lg}>
              <View style={[styles.pickerHead, { borderBottomColor: theme.line }]}>
                <Text style={[styles.pickerTitle, { color: theme.text }]}>Assign Technician</Text>
                <PressScale onPress={() => setShowAssign(false)}>
                  <View style={[styles.closeBtn, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                    <Icon name="close" size={13} color={theme.text3} />
                  </View>
                </PressScale>
              </View>
              <ScrollView style={{ maxHeight: 380 }}>
                {employees.map((emp) => (
                  <Pressable
                    key={emp.id}
                    onPress={() => {
                      setShowAssign(false);
                      run('assign', () => assignInstallation(id, emp.id));
                    }}
                    style={[styles.pickerRow, { borderBottomColor: theme.line }]}
                  >
                    <Text style={[styles.itemName, { color: theme.text, flex: 1 }]}>{emp.full_name}</Text>
                    {job?.assigned_employee_id === emp.id ? <Icon name="check" size={14} color={brand.primary} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            </GlassSurface>
          </View>
        </Modal>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(4) },
  cardWrap: { width: '100%', maxWidth: 460, maxHeight: '92%' },
  card: { overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', padding: spacing(4), borderBottomWidth: 1 },
  title: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
  sub: { ...typography.caption, marginTop: 2, textTransform: 'capitalize' },
  closeBtn: { width: 30, height: 30, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  block: { padding: spacing(4) },
  custName: { ...typography.heading, fontSize: 16 },
  meta: { ...typography.caption, marginTop: 3 },
  iconRow: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(3) },
  iconAction: { width: 38, height: 38, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  stepRow: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(2.5) },
  stepDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  stepLabel: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  stepWhen: { ...typography.caption, marginTop: 1 },

  sectionTitle: { ...typography.heading, fontSize: 14, marginBottom: spacing(3) },
  fieldLabel: { ...typography.caption, marginTop: spacing(3), marginBottom: spacing(1.5) },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontFamily: 'Manrope_600SemiBold', fontSize: 13.5 },
  textArea: { minHeight: 72, textAlignVertical: 'top' },

  btnRow: { flexDirection: 'row', gap: spacing(2.5), marginBottom: spacing(2) },
  primaryBtn: { borderRadius: radius.sm, paddingVertical: spacing(3), alignItems: 'center', marginTop: spacing(2) },
  primaryBtnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: '#ffffff' },
  ghostBtn: { borderRadius: radius.sm, borderWidth: 1, paddingVertical: spacing(3), alignItems: 'center', marginTop: spacing(2) },
  ghostBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, padding: spacing(3), marginBottom: spacing(2) },
  itemName: { fontFamily: 'Manrope_700Bold', fontSize: 13.5 },
  itemMeta: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, marginTop: 2 },
  qtyBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderRadius: radius.sm, paddingVertical: spacing(3), paddingHorizontal: spacing(4) },
  addBtnText: { flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: '#ffffff' },

  gstRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), marginTop: spacing(3) },
  gstBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gstLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5 },

  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderTopWidth: 1, marginTop: spacing(3), paddingTop: spacing(3) },
  totalLabel: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 11.5 },
  totalValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16 },
  hint: { ...typography.caption, marginTop: spacing(2), lineHeight: 16 },

  empty: { padding: spacing(8), textAlign: 'center', fontSize: 13 },
  error: { ...typography.caption, paddingHorizontal: spacing(4), paddingBottom: spacing(4) },

  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  pickerCard: { width: '100%', maxWidth: 420, overflow: 'hidden' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), borderBottomWidth: 1 },
  pickerTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3.5), borderBottomWidth: 1 },
  pickerRate: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5 },
  pickerEmpty: { padding: spacing(6), textAlign: 'center', fontSize: 13 },
});
