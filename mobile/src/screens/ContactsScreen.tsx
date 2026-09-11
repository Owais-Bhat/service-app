import React, { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import AppHeaderBar from '../components/AppHeaderBar';
import GlassCard from '../components/GlassCard';
import PressScale from '../components/PressScale';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
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
      // Deduplicate by phone (keep most recent per phone)
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
  const filtered = contacts.filter((c) =>
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
      <AppHeaderBar title="Contacts" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(16), paddingBottom: spacing(8), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={semantic.success} />}
      >
        <TextInput
          style={[styles.search, { backgroundColor: theme.neuDark, color: theme.text, borderColor: theme.neuLight }]}
          placeholder="Search name, phone, location…"
          placeholderTextColor={theme.text3}
          value={search}
          onChangeText={setSearch}
        />

        {loading && <Text style={[styles.dim, { color: theme.text3 }]}>Loading…</Text>}
        {error && <Text style={[styles.dim, { color: semantic.danger }]}>{error}</Text>}
        {!loading && !error && filtered.length === 0 && (
          <Text style={[styles.dim, { color: theme.text3 }]}>No contacts found</Text>
        )}

        {filtered.map((c) => (
          <GlassCard key={c.id} style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: brand.primary + '22' }]}>
                <Text style={[styles.avatarText, { color: brand.primary }]}>{c.full_name[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={styles.info}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{c.full_name}</Text>
                {c.location ? <Text style={[styles.sub, { color: theme.text3 }]} numberOfLines={1}>{c.location}</Text> : null}
                {c.service_item ? <Text style={[styles.service, { color: theme.text2 }]} numberOfLines={1}>{c.service_item}</Text> : null}
              </View>
              {c.phone ? (
                <PressScale onPress={() => callPhone(c.phone!)} style={[styles.callBtn, { backgroundColor: semantic.success + '22' }]}>
                  <Text style={[styles.callText, { color: semantic.success }]}>{c.phone}</Text>
                </PressScale>
              ) : null}
            </View>
          </GlassCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(4), ...typography.body },
  dim: { ...typography.body, textAlign: 'center', marginTop: spacing(8) },
  card: { marginBottom: spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { ...typography.heading, fontSize: 18 },
  info: { flex: 1, minWidth: 0 },
  name: { ...typography.body, fontWeight: '600' as const },
  sub: { ...typography.caption, marginTop: 2 },
  service: { ...typography.caption, marginTop: 2 },
  callBtn: { borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2), flexShrink: 0 },
  callText: { ...typography.caption, fontWeight: '700' },
});
