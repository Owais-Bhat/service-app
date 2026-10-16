import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import Panel from '../components/Panel';
import Icon from '../components/Icon';
import FilterChips from '../components/admin/FilterChips';
import SearchField from '../components/admin/SearchField';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { dataGet } from '../api/client';

interface Props {
  onBack: () => void;
}

interface Contact {
  id: string;
  full_name: string;
  phone: string | null;
  location: string | null;
  service_item: string | null;
  created_at: string;
}

export default function ContactsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [raw, setRaw] = useState<Contact[]>([]);
  const [tab, setTab] = useState<'unique' | 'today' | 'week' | 'month'>('unique');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await dataGet<Contact[]>('inquiries', {
        select: 'id,full_name,phone,location,service_item,created_at',
        order: 'full_name:asc',
      });
      setRaw(data);
      const seen = new Set<string>();
      const deduped: Contact[] = [];
      for (const c of data) {
        const key = c.phone ?? c.id;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(c);
        }
      }
      setContacts(deduped);
      setError(null);
    } catch {
      setError('Could not load contacts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  // Today / week / month list every request made in that period (the same
  // customer can appear twice); Unique is one line per phone number.
  const periodStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (tab === 'week') d.setDate(d.getDate() - 6);
    if (tab === 'month') d.setDate(1);
    return d.getTime();
  })();
  const base = tab === 'unique' ? contacts : raw.filter((c) => new Date(c.created_at).getTime() >= periodStart);
  const filtered = base.filter((c) =>
    !q ||
    c.full_name.toLowerCase().includes(q) ||
    (c.phone ?? '').includes(q) ||
    (c.location ?? '').toLowerCase().includes(q),
  );

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Contacts" subtitle={`${filtered.length} contact${filtered.length === 1 ? '' : 's'}`} onBack={onBack} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + spacing(16), paddingBottom: spacing(8), paddingHorizontal: spacing(4), gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ok} />}
      >
        <SearchField value={search} onChangeText={setSearch} placeholder="Search name, phone, location…" />

        <FilterChips
          items={[
            { key: 'unique', label: 'Unique' },
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'This week' },
            { key: 'month', label: 'This month' },
          ]}
          activeKey={tab}
          onSelect={(k) => setTab(k as typeof tab)}
        />

        {loading && <Text style={[styles.dim, { color: theme.text3 }]}>Loading…</Text>}
        {error && <Text style={[styles.dim, { color: theme.err }]}>{error}</Text>}
        {!loading && !error && filtered.length === 0 && (
          <Text style={[styles.dim, { color: theme.text3 }]}>No contacts found</Text>
        )}

        {filtered.length > 0 ? (
          <Panel style={styles.list}>
            {filtered.map((c, i) => (
              <View key={c.id} style={[styles.row, i < filtered.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                <View style={[styles.avatar, { backgroundColor: theme.okS }]}>
                  <Text style={[styles.avatarText, { color: theme.accent }]}>{c.full_name[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{c.full_name}</Text>
                  {c.service_item ? <Text style={[styles.service, { color: theme.text2 }]} numberOfLines={1}>{c.service_item}</Text> : null}
                  {c.location ? <Text style={[styles.sub, { color: theme.text3 }]} numberOfLines={1}>{c.location}</Text> : null}
                </View>
                {c.phone ? (
                  <Pressable
                    onPress={() => callPhone(c.phone!)}
                    style={({ pressed }) => [styles.callBtn, { backgroundColor: theme.okS }, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${c.phone}`}
                  >
                    <Icon name="phone" size={14} color={theme.ok} />
                    <Text style={[styles.callText, { color: theme.ok }]}>{c.phone}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Panel>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { ...typography.supporting, textAlign: 'center', marginTop: spacing(4) },
  list: { padding: 0, overflow: 'hidden', borderRadius: radius.xl - 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { ...typography.heading, fontSize: 16 },
  info: { flex: 1, minWidth: 0 },
  name: { ...typography.rowTitle, fontSize: 14, lineHeight: 19 },
  service: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  sub: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.full, paddingHorizontal: spacing(2.5), height: 32, flexShrink: 0 },
  callText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  pressed: { opacity: 0.7 },
});
