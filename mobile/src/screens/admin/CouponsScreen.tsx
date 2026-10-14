import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import Icon from '../../components/Icon';
import { Coupon, createCoupon, deleteCoupon, fetchCoupons, updateCoupon } from '../../api/adminMoney';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { inr, shortDate } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

const valueText = (c: Coupon) =>
  c.type === 'percent' ? `${Number(c.value)}% off${c.max_discount ? ` (max ${inr(c.max_discount)})` : ''}` : `${inr(c.value)} off`;

function stateOf(c: Coupon): { label: string; color: string } {
  if (Number(c.active) !== 1) return { label: 'Hidden', color: '#6d8278' };
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return { label: 'Expired', color: semantic.danger };
  if (c.usage_limit != null && Number(c.used_count) >= Number(c.usage_limit)) return { label: 'Used up', color: semantic.warning };
  return { label: 'Active', color: semantic.success };
}

const EMPTY = { code: '', type: 'fixed' as 'fixed' | 'percent', value: '', max: '', min: '', limit: '', expires: '', desc: '', active: true };

// Redeemable coupon codes employees enter at billing. Same validation and the
// same fields as the web Coupons page.
export default function CouponsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const list = useLoader(fetchCoupons, 'Could not load coupons');
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const open = (c: Coupon | 'new') => {
    if (c === 'new') setForm(EMPTY);
    else
      setForm({
        code: c.code,
        type: c.type,
        value: String(Number(c.value)),
        max: c.max_discount ? String(Number(c.max_discount)) : '',
        min: Number(c.min_amount) > 0 ? String(Number(c.min_amount)) : '',
        limit: c.usage_limit != null ? String(c.usage_limit) : '',
        expires: c.expires_at ? String(c.expires_at).replace('T', ' ').slice(0, 16) : '',
        desc: c.description || '',
        active: Number(c.active) === 1,
      });
    setEditing(c);
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    const value = Number(form.value) || 0;
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) return Alert.alert('Coupon code', 'Use 2–40 letters, numbers, - or _');
    if (value <= 0) return Alert.alert('Discount value', 'Enter a value above 0');
    if (form.type === 'percent' && value > 100) return Alert.alert('Discount value', 'A percentage cannot exceed 100');
    if (form.expires && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(form.expires.trim())) {
      return Alert.alert('Expiry', 'Use YYYY-MM-DD or YYYY-MM-DD HH:MM');
    }
    const expires = form.expires.trim();
    const payload = {
      code,
      type: form.type,
      value,
      max_discount: form.type === 'percent' && form.max ? Number(form.max) : null,
      min_amount: Number(form.min) || 0,
      usage_limit: form.limit ? Math.max(1, parseInt(form.limit, 10)) : null,
      expires_at: expires ? `${expires.length === 10 ? `${expires} 23:59` : expires}:00` : null,
      description: form.desc.trim() || null,
      active: form.active ? 1 : 0,
    };
    setBusy(true);
    try {
      if (editing && editing !== 'new') await updateCoupon(editing.id, payload);
      else await createCoupon(payload);
      setEditing(null);
      await list.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Try again';
      Alert.alert('Could not save', /duplicate|unique/i.test(msg) ? 'That coupon code already exists' : msg);
    } finally {
      setBusy(false);
    }
  };

  const remove = (c: Coupon) =>
    Alert.alert('Delete coupon?', c.code, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCoupon(c.id);
            await list.reload();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);

  const toggle = async (c: Coupon) => {
    try {
      await updateCoupon(c.id, { active: Number(c.active) === 1 ? 0 : 1 });
      await list.reload();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    }
  };

  return (
    <AdminScreen
      title="Coupons"
      subtitle={`${(list.data ?? []).length} codes`}
      onBack={onBack}
      onRefresh={list.reload}
      loading={list.loading}
      error={list.error}
      headerRight={
        <Pressable onPress={() => open('new')} hitSlop={8} style={[styles.add, { backgroundColor: brand.primary }]} accessibilityLabel="Add coupon">
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      }
    >
      {(list.data ?? []).length === 0 ? <EmptyNote text="No coupons yet — tap + to create one" icon="ticket" /> : null}
      {(list.data ?? []).map((c) => {
        const st = stateOf(c);
        return (
          <ListRow
            key={c.id}
            icon="ticket"
            iconColor={st.color}
            title={c.code}
            subtitle={valueText(c)}
            meta={`Used ${Number(c.used_count) || 0}${c.usage_limit != null ? ` / ${c.usage_limit}` : ''}${Number(c.min_amount) > 0 ? ` · min ${inr(c.min_amount)}` : ''} · ${c.expires_at ? `till ${shortDate(c.expires_at)}` : 'no expiry'}`}
            badge={st}
            onPress={() => open(c)}
            footer={
              <>
                <ActionButton label={Number(c.active) === 1 ? 'Hide' : 'Show'} tone="neutral" onPress={() => toggle(c)} />
                <ActionButton label="Delete" tone="danger" onPress={() => remove(c)} />
              </>
            }
          />
        );
      })}

      <FormSheet
        visible={editing !== null}
        title={editing === 'new' ? 'New coupon' : 'Edit coupon'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} />
            <ActionButton label="Save" onPress={save} busy={busy} />
          </>
        }
      >
        <Field label="Code" value={form.code} onChangeText={(v) => set('code', v.toUpperCase())} autoCapitalize="characters" placeholder="DIWALI100" />
        <View style={styles.typeRow}>
          {(['fixed', 'percent'] as const).map((t) => {
            const on = form.type === t;
            return (
              <Pressable
                key={t}
                onPress={() => set('type', t)}
                style={[styles.type, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
              >
                <Text style={[styles.typeText, { color: on ? brand.primary : theme.text2 }]}>{t === 'fixed' ? 'Fixed ₹' : 'Percent %'}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label={form.type === 'percent' ? 'Percent off' : 'Amount off (₹)'} value={form.value} onChangeText={(v) => set('value', v)} keyboardType="numeric" />
        {form.type === 'percent' ? <Field label="Max discount (₹, optional)" value={form.max} onChangeText={(v) => set('max', v)} keyboardType="numeric" /> : null}
        <Field label="Minimum bill (₹, optional)" value={form.min} onChangeText={(v) => set('min', v)} keyboardType="numeric" />
        <Field label="Usage limit (optional)" value={form.limit} onChangeText={(v) => set('limit', v)} keyboardType="numeric" hint="Leave empty for unlimited" />
        <Field label="Expires (optional)" value={form.expires} onChangeText={(v) => set('expires', v)} hint="YYYY-MM-DD or YYYY-MM-DD HH:MM" />
        <Field label="Internal note (optional)" value={form.desc} onChangeText={(v) => set('desc', v)} multiline />
        <Pressable onPress={() => set('active', !form.active)} style={styles.check}>
          <Icon name={form.active ? 'check-circle' : 'tasks'} size={20} color={form.active ? brand.primary : theme.text3} filled={form.active} />
          <Text style={[styles.checkText, { color: theme.text }]}>Active</Text>
        </Pressable>
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  add: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  typeRow: { flexDirection: 'row', gap: spacing(2) },
  type: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing(2.5), alignItems: 'center' },
  typeText: { ...typography.caption, fontFamily: 'Manrope_700Bold' },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  checkText: { ...typography.body },
});
