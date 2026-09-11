import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import GlassCard from '../components/GlassCard';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { dataGet } from '../api/client';

interface Props {
  onBack: () => void;
}

interface ServicePrice {
  id: string;
  name: string;
  category: string | null;
  sub_category: string | null;
  cost: number | null;
  description: string | null;
}

function money(n: number | null) {
  if (n == null) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function ServicePricingScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [items, setItems] = useState<ServicePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await dataGet<ServicePrice[]>('service_pricing', { order: 'category:asc,name:asc' });
      setItems(data);
      setError(null);
    } catch {
      setError('Could not load service pricing');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filtered = items.filter((i) =>
    !q || i.name.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q) || (i.sub_category ?? '').toLowerCase().includes(q),
  );

  // Group by category
  const groups: Record<string, ServicePrice[]> = {};
  for (const item of filtered) {
    const cat = item.category ?? 'Uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Service Pricing" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(16), paddingBottom: spacing(8), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={semantic.success} />}
      >
        <TextInput
          style={[styles.search, { backgroundColor: theme.neuDark, color: theme.text, borderColor: theme.neuLight }]}
          placeholder="Search services…"
          placeholderTextColor={theme.text3}
          value={search}
          onChangeText={setSearch}
        />

        {loading && <Text style={[styles.dim, { color: theme.text3 }]}>Loading…</Text>}
        {error && <Text style={[styles.dim, { color: semantic.danger }]}>{error}</Text>}
        {!loading && !error && filtered.length === 0 && (
          <Text style={[styles.dim, { color: theme.text3 }]}>No services found</Text>
        )}

        {Object.entries(groups).map(([cat, services]) => (
          <View key={cat}>
            <Text style={[styles.catHeader, { color: theme.text3 }]}>{cat}</Text>
            {services.map((s) => (
              <GlassCard key={s.id} style={styles.card}>
                <View style={styles.row}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>{s.name}</Text>
                  <Text style={[styles.price, { color: brand.primary }]}>{money(s.cost)}</Text>
                </View>
                {s.sub_category ? <Text style={[styles.sub, { color: theme.text3 }]}>{s.sub_category}</Text> : null}
                {s.description ? <Text style={[styles.desc, { color: theme.text2 }]} numberOfLines={2}>{s.description}</Text> : null}
              </GlassCard>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(4), ...typography.body },
  dim: { ...typography.body, textAlign: 'center', marginTop: spacing(8) },
  catHeader: { ...typography.caption, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing(4), marginBottom: spacing(2) },
  card: { marginBottom: spacing(2) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(2) },
  name: { ...typography.body, fontWeight: '600', flex: 1 },
  price: { ...typography.body, fontWeight: '700' as const },
  sub: { ...typography.caption, marginTop: 2 },
  desc: { ...typography.caption, marginTop: spacing(1) },
});
