import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppModal as Modal } from './AppModal';
import { KeyboardAwareScrollView as ScrollView } from './KeyboardAware';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
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
        <GlassSurface style={styles.card} borderRadius={radius.sheet}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Add Service</Text>
            <Pressable onPress={onDismiss} style={styles.closeBtn} hitSlop={10}>
              <Icon name="close" size={16} color={theme.text} />
            </Pressable>
          </View>

          <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.panel }]}>
            <Icon name="search" size={18} color={theme.text2} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search services…"
              placeholderTextColor={theme.text3}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginVertical: spacing(6) }} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.list} showsVerticalScrollIndicator={false}>
              {grouped.length === 0 ? (
                <Text style={[styles.empty, { color: theme.text3 }]}>No services match.</Text>
              ) : (
                grouped.map(([category, group]) => (
                  <View key={category} style={{ marginBottom: spacing(3) }}>
                    <Text style={[styles.groupLabel, { color: theme.text3 }]}>{category}</Text>
                    {group.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => onSelect({ id: item.id, label: labelFor(item), cost: item.cost })}
                        style={({ pressed }) => [styles.row, { borderColor: theme.line }, pressed && styles.rowPressed]}
                      >
                        <Text style={[styles.rowLabel, { color: theme.text }]} numberOfLines={2}>
                          {[item.sub_category, item.sub_sub_category || item.name].filter(Boolean).join(' > ')}
                        </Text>
                        <Text style={[styles.rowCost, { color: theme.text }]}>₹{item.cost.toLocaleString('en-IN')}</Text>
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
  title: { ...typography.heading },
  closeBtn: { width: 44, height: 44, marginRight: -spacing(2), alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 48, marginBottom: spacing(3) },
  searchInput: { flex: 1, ...typography.body, fontFamily: 'Manrope_500Medium' },
  list: { maxHeight: 380 },
  empty: { fontSize: 13, textAlign: 'center', marginVertical: spacing(6) },
  groupLabel: { ...typography.overline, marginBottom: spacing(1.5) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(2), minHeight: 56, paddingVertical: spacing(2), borderBottomWidth: 1 },
  rowPressed: { opacity: 0.6 },
  rowLabel: { flex: 1, fontSize: 14, lineHeight: 19, fontFamily: 'Manrope_700Bold' },
  rowCost: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
});
