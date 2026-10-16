import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from './KeyboardAware';
import Icon from './Icon';
import PressScale from './PressScale';
import { InventoryItem, BillItemLine } from '../api/inventory';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';
import { brand } from '../theme/tokens';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// A number box that lets you type "12." on the way to "12.5" without the text
// snapping back: it keeps its own text and only reports a parsed number.
function NumField({ value, onChange, width, label }: { value: number; onChange: (n: number) => void; width: number; label: string }) {
  const { theme } = useTheme();
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <TextInput
      accessibilityLabel={label}
      style={[styles.num, { width, color: theme.text, borderColor: theme.line, backgroundColor: theme.panel2 }]}
      keyboardType="decimal-pad"
      selectTextOnFocus
      value={text}
      onChangeText={(t) => {
        const clean = t.replace(/[^0-9.]/g, '');
        setText(clean);
        const n = Number(clean);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

interface Props {
  items: BillItemLine[];
  onChange: (items: BillItemLine[]) => void;
  catalogue: InventoryItem[];
}

// "Items Used" on a bill, same as the web: pick from the stock list, change the
// quantity and the price on the line itself, or type in something that is not
// in the list. Stock moves on the server when the bill is saved.
export default function BillItemsEditor({ items, onChange, catalogue }: Props) {
  const { theme } = useTheme();
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [rate, setRate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const hits = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return catalogue
      .filter((i) => {
        const hay = `${i.name} ${i.sku || ''} ${i.category || ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 60);
  }, [catalogue, query]);

  const addFromStock = (inv: InventoryItem) => {
    const at = items.findIndex((it) => it.item_id === inv.id);
    const nextQty = at >= 0 ? items[at].quantity + 1 : 1;
    onChange(
      at >= 0
        ? items.map((it, i) => (i === at ? { ...it, quantity: nextQty } : it))
        : [...items, { item_id: inv.id, name: inv.name, quantity: 1, rate: Number(inv.selling_rate) || 0 }],
    );
    setNote(Number(inv.quantity) < nextQty ? `Only ${Number(inv.quantity)} ${inv.unit || 'pcs'} of ${inv.name} in stock — recorded anyway` : null);
    setPicker(false);
    setQuery('');
  };

  const patch = (idx: number, p: Partial<BillItemLine>) => onChange(items.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const addOwn = () => {
    const q = Number(qty);
    const r = Number(rate);
    if (!name.trim()) return setFormError('Say what it is');
    if (!(q > 0)) return setFormError('Enter a quantity');
    if (rate.trim() === '' || !(r >= 0)) return setFormError('Enter the price');
    onChange([...items, { item_id: null, name: name.trim(), quantity: q, rate: r }]);
    setName('');
    setQty('1');
    setRate('');
    setFormError(null);
  };

  const total = items.reduce((s, it) => s + it.quantity * it.rate, 0);

  return (
    <View>
      <Text style={[styles.label, { color: theme.text3 }]}>Items Used</Text>

      {items.length === 0 ? <Text style={[styles.empty, { color: theme.text3 }]}>No items added.</Text> : null}
      {items.map((it, idx) => (
        <View key={`${it.item_id || 'own'}-${idx}`} style={[styles.line, { borderColor: theme.line }]}>
          <View style={styles.lineTop}>
            <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={2}>
              {it.name}
              {it.item_id ? '' : '  (your own line)'}
            </Text>
            <Pressable onPress={() => remove(idx)} hitSlop={10} accessibilityLabel={`Remove ${it.name}`}>
              <Icon name="close" size={14} color={theme.text3} />
            </Pressable>
          </View>
          <View style={styles.lineBottom}>
            <NumField value={it.quantity} onChange={(n) => patch(idx, { quantity: n })} width={72} label="Quantity" />
            <Text style={[styles.times, { color: theme.text3 }]}>×</Text>
            <NumField value={it.rate} onChange={(n) => patch(idx, { rate: n })} width={96} label="Price" />
            <Text style={[styles.amount, { color: theme.text }]}>{inr(it.quantity * it.rate)}</Text>
          </View>
        </View>
      ))}
      {note ? <Text style={[styles.note, { color: theme.warn }]}>{note}</Text> : null}

      <PressScale onPress={() => setPicker(true)}>
        <View style={[styles.addBtn, { backgroundColor: brand.fill }]}>
          <View style={styles.addBadge}>
            <Text style={styles.addBadgeText}>+</Text>
          </View>
          <Text style={styles.addText}>Add Item from stock</Text>
          <Icon name="chevron-right" size={16} color="#ffffff" />
        </View>
      </PressScale>

      <Text style={[styles.label, { color: theme.text3 }]}>Something not in the list</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.line }]}
        placeholder="What is it? (e.g. extra cable)"
        placeholderTextColor={theme.text3}
        value={name}
        onChangeText={setName}
      />
      <View style={styles.ownRow}>
        <TextInput
          style={[styles.input, styles.ownQty, { color: theme.text, borderColor: theme.line }]}
          placeholder="Qty"
          placeholderTextColor={theme.text3}
          keyboardType="decimal-pad"
          value={qty}
          onChangeText={setQty}
        />
        <TextInput
          style={[styles.input, styles.ownRate, { color: theme.text, borderColor: theme.line }]}
          placeholder="Price ₹"
          placeholderTextColor={theme.text3}
          keyboardType="decimal-pad"
          value={rate}
          onChangeText={setRate}
        />
        <Pressable onPress={addOwn} style={[styles.ownBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]} accessibilityRole="button">
          <Text style={[styles.ownBtnText, { color: theme.text }]}>Add</Text>
        </Pressable>
      </View>
      {formError ? <Text style={[styles.note, { color: theme.err }]}>{formError}</Text> : null}

      {items.length > 0 ? (
        <Text style={[styles.sum, { color: theme.text2 }]}>Items total {inr(total)}</Text>
      ) : null}

      {picker ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPicker(false)}>
          <View style={styles.backdrop}>
            <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <View style={[styles.head, { borderBottomColor: theme.line }]}>
                <Text style={[styles.title, { color: theme.text }]}>Add Item</Text>
                <Pressable onPress={() => setPicker(false)} hitSlop={10}>
                  <Icon name="close" size={16} color={theme.text3} />
                </Pressable>
              </View>
              <TextInput
                style={[styles.input, styles.search, { color: theme.text, borderColor: theme.line }]}
                placeholder="Search by name, code or category"
                placeholderTextColor={theme.text3}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 340 }}>
                {catalogue.length === 0 ? (
                  <Text style={[styles.pickEmpty, { color: theme.text3 }]}>No items in inventory yet. Use "Something not in the list".</Text>
                ) : hits.length === 0 ? (
                  <Text style={[styles.pickEmpty, { color: theme.text3 }]}>Nothing matches "{query}".</Text>
                ) : (
                  hits.map((inv) => (
                    <Pressable key={inv.id} onPress={() => addFromStock(inv)} style={[styles.pickRow, { borderBottomColor: theme.line }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickName, { color: theme.text }]}>{inv.name}</Text>
                        <Text style={[styles.pickMeta, { color: Number(inv.quantity) > 0 ? theme.text3 : theme.err }]}>
                          {Number(inv.quantity)} {inv.unit || 'pcs'} in stock
                        </Text>
                      </View>
                      <Text style={[styles.pickRate, { color: theme.accent }]}>₹{Number(inv.selling_rate)}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing(3.5), marginBottom: spacing(1.5) },
  empty: { fontSize: 12.5, marginBottom: spacing(2) },
  line: { borderWidth: 1, borderRadius: radius.sm, padding: spacing(2.5), marginBottom: spacing(1.5) },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2) },
  lineName: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  lineBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(2) },
  num: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5), minHeight: 40, fontSize: 14, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  times: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  amount: { flex: 1, textAlign: 'right', fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
  note: { fontSize: 12, marginTop: spacing(1.5), marginBottom: spacing(1) },
  sum: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, marginTop: spacing(2), textAlign: 'right' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), minHeight: 48, borderRadius: radius.md, paddingHorizontal: spacing(3), marginTop: spacing(1) },
  addBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  addBadgeText: { color: '#fff', fontFamily: 'Manrope_800ExtraBold', fontSize: 14, lineHeight: 18 },
  addText: { flex: 1, color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 14 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3.5), paddingVertical: spacing(2.5), minHeight: 48, fontSize: 14, fontFamily: 'Manrope_500Medium' },
  ownRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(2) },
  ownQty: { width: 72, textAlign: 'center' },
  ownRate: { flex: 1 },
  ownBtn: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(4), alignItems: 'center', justifyContent: 'center' },
  ownBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  card: { width: '100%', maxWidth: 420, overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), borderBottomWidth: 1 },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15 },
  search: { margin: spacing(3) },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3.5), borderBottomWidth: 1 },
  pickName: { fontFamily: 'Manrope_700Bold', fontSize: 13.5 },
  pickMeta: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, marginTop: 2 },
  pickRate: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5 },
  pickEmpty: { padding: spacing(6), textAlign: 'center', fontSize: 13 },
});
