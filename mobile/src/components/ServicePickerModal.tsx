import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchServicePricing, ServicePricingItem } from '../api/servicePricing';

export interface PickedService {
  id: string;
  label: string;
  cost: number;
}

interface Props {
  onDismiss: () => void;
  onSelect: (service: PickedService) => void;
}

function labelFor(item: ServicePricingItem): string {
  const parts = [item.category, item.sub_category, item.sub_sub_category || item.name].filter(Boolean);
  return parts.join(' > ');
}

// Flat, searchable list grouped by category — the web app uses a 3-level
// cascading picker, but a scrollable grouped+searchable list is the more
// natural mobile equivalent of the same "find the priced item" task.
export default function ServicePickerModal({ onDismiss, onSelect }: Props) {
  const { theme } = useTheme();
  const [items, setItems] = useState<ServicePricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchServicePricing()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) => labelFor(i).toLowerCase().includes(q))
      : items;
    const groups = new Map<string, ServicePricingItem[]>();
    filtered.forEach((i) => {
      const key = i.category || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });
    return Array.from(groups.entries());
  }, [items, search]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.card} borderRadius={radius.lg}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Add Service</Text>
            <Pressable onPress={onDismiss} style={styles.closeBtn} hitSlop={10}>
              <Icon name="close" size={16} color={theme.text} />
            </Pressable>
          </View>

          <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
            <Icon name="search" size={15} color={theme.text3} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search services…"
              placeholderTextColor={theme.text3}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {loading ? (
            <ActivityIndicator color={brand.primary} style={{ marginVertical: spacing(6) }} />
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {grouped.length === 0 ? (
                <Text style={[styles.empty, { color: theme.text3 }]}>No services match.</Text>
              ) : (
                grouped.map(([category, group]) => (
                  <View key={category} style={{ marginBottom: spacing(3) }}>
                    <Text style={[styles.groupLabel, { color: brand.primary }]}>{category}</Text>
                    {group.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => onSelect({ id: item.id, label: labelFor(item), cost: item.cost })}
                        style={({ pressed }) => [styles.row, { borderColor: theme.line }, pressed && styles.rowPressed]}
                      >
                        <Text style={[styles.rowLabel, { color: theme.text }]} numberOfLines={2}>
                          {[item.sub_category, item.sub_sub_category || item.name].filter(Boolean).join(' > ')}
                        </Text>
                        <Text style={[styles.rowCost, { color: semantic.success }]}>₹{item.cost.toLocaleString('en-IN')}</Text>
                      </Pressable>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  card: { width: '100%', maxWidth: 440, maxHeight: '80%', padding: spacing(5) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(3) },
  title: { ...typography.heading, fontSize: 17 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 42, marginBottom: spacing(3) },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  list: { maxHeight: 380 },
  empty: { fontSize: 13, textAlign: 'center', marginVertical: spacing(6) },
  groupLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing(1.5) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(2), paddingVertical: spacing(2.5), borderBottomWidth: 1 },
  rowPressed: { opacity: 0.6 },
  rowLabel: { flex: 1, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  rowCost: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
