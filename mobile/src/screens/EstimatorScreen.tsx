import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { fetchServicePricing, ServicePricingItem } from '../api/pricing';

interface Props {
  onBack: () => void;
}

// Ephemeral by design (design spec §2) — NEST's own mockup treats "add" as
// a no-op, and there's no quote/estimate table on the backend to persist
// to. This is a live total to show a customer, not a saved document.
export default function EstimatorScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [items, setItems] = useState<ServicePricingItem[]>([]);
  const [selected, setSelected] = useState<ServicePricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchServicePricing();
        setItems(rows);
      } catch {
        setError('Could not load pricing — check your connection');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addItem = (item: ServicePricingItem) => setSelected((prev) => [...prev, item]);
  const removeAt = (index: number) => setSelected((prev) => prev.filter((_, i) => i !== index));
  const total = selected.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(20) }}>
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Estimator</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>Tap a service to add it to the quote — nothing is saved.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {selected.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Your Quote</Text>
            {selected.map((item, i) => (
              <Panel key={`${item.id}-${i}`} style={styles.quoteRow}>
                <Text style={[styles.itemName, { color: theme.text, flex: 1 }]} numberOfLines={1}>{item.sub_category || item.name}</Text>
                <Text style={[styles.quoteCost, { color: brand.primary }]}>₹{(Number(item.cost) || 0).toLocaleString('en-IN')}</Text>
                <Pressable onPress={() => removeAt(i)} hitSlop={8}>
                  <Icon name="trash" size={16} color={theme.text3} />
                </Pressable>
              </Panel>
            ))}
          </>
        ) : null}

        <Text style={[styles.sectionLabel, { color: theme.text3 }]}>All Services</Text>
        {loading ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>Loading pricing…</Text>
        ) : (
          items.map((item) => (
            <Pressable key={item.id} onPress={() => addItem(item)} style={({ pressed }) => [pressed && styles.pressed]}>
              <Panel style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: theme.text }]}>{item.sub_category || item.name}</Text>
                  <Text style={[styles.caption, { color: theme.text3 }]}>
                    {[item.category, item.sub_sub_category].filter(Boolean).join(' · ')} · ₹{(Number(item.cost) || 0).toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.addButton}>
                  <Text style={styles.addButtonText}>+</Text>
                </View>
              </Panel>
            </Pressable>
          ))
        )}
      </ScrollView>

      {selected.length > 0 ? (
        <View style={[styles.totalBar, { backgroundColor: theme.bg, borderTopColor: theme.line }]}>
          <View>
            <Text style={[styles.caption, { color: theme.text3 }]}>{selected.length} item{selected.length === 1 ? '' : 's'}</Text>
            <Text style={[styles.totalValue, { color: brand.primary }]}>₹{total.toLocaleString('en-IN')}</Text>
          </View>
          <Pressable
            onPress={() => setSelected([])}
            style={({ pressed }) => [styles.clearButton, { borderColor: theme.line }, pressed && styles.pressed]}
          >
            <Text style={[styles.clearButtonText, { color: theme.text2 }]}>Clear</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title },
  caption: { ...typography.caption },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: spacing(4), marginBottom: spacing(2.5) },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3) },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(2.5) },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: spacing(0.5) },
  addButton: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(21,160,90,0.16)', alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: brand.primary, fontFamily: 'Manrope_700Bold', fontSize: 16 },
  pressed: { opacity: 0.7 },
  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginBottom: spacing(2) },
  quoteCost: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 13 },
  totalBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing(4),
    borderTopWidth: 1,
  },
  totalValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20 },
  clearButton: { paddingHorizontal: spacing(4), paddingVertical: spacing(2.5), borderRadius: 12, borderWidth: 1 },
  clearButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
