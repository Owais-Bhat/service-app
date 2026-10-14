import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../../components/MeshBackground';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminTabBar, { AdminTab } from '../../components/admin/AdminTabBar';
import SearchField from '../../components/admin/SearchField';
import SectionLabel from '../../components/admin/SectionLabel';
import EmptyNote from '../../components/admin/EmptyNote';
import Icon from '../../components/Icon';
import { ADMIN_MENU } from '../../navigation/adminMenu';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';

interface Props {
  /** Route names that have a real screen behind them. */
  available: Set<string>;
  onOpen: (route: string) => void;
  onTab: (tab: AdminTab) => void;
}

// Every page of the web admin portal, grouped the way the web sidebar groups
// them. Pages that are not built on mobile yet stay visible but dimmed, so the
// owner can see what exists on the web and what is still to come.
export default function AdminMenuScreen({ available, onOpen, onTab }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ADMIN_MENU.map((g) => ({
      ...g,
      items: g.items.filter((i) => !q || i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const total = ADMIN_MENU.reduce((n, g) => n + g.items.length, 0);
  const built = ADMIN_MENU.reduce((n, g) => n + g.items.filter((i) => i.route && available.has(i.route)).length, 0);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AdminHeader title="Menu" subtitle={`${built} of ${total} portal pages available on mobile`} />
      <View style={[styles.search, { borderBottomColor: theme.line }]}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search pages" />
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(28) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {groups.length === 0 ? <EmptyNote text="No page matches your search" icon="search" /> : null}
        {groups.map((group) => (
          <View key={group.key}>
            <SectionLabel>{group.label}</SectionLabel>
            <View style={[styles.card, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
              {group.items.map((item, idx) => {
                const live = !!item.route && available.has(item.route);
                return (
                  <Pressable
                    key={item.label}
                    disabled={!live}
                    onPress={() => item.route && onOpen(item.route)}
                    style={({ pressed }) => [
                      styles.row,
                      idx > 0 && { borderTopWidth: 1, borderTopColor: theme.line },
                      !live && styles.dim,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.chip, { backgroundColor: (live ? brand.primary : theme.text3) + '22' }]}>
                      <Icon name={item.icon} size={18} color={live ? brand.primary : theme.text3} />
                    </View>
                    <View style={styles.text}>
                      <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>{item.label}</Text>
                      <Text style={[styles.hint, { color: theme.text3 }]} numberOfLines={1}>{item.hint}</Text>
                    </View>
                    {live ? (
                      <Icon name="chevron-right" size={16} color={theme.text3} />
                    ) : (
                      <Text style={[styles.soon, { color: theme.text3, borderColor: theme.line }]}>Soon</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <AdminTabBar active="menu" onSelect={onTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  search: { paddingHorizontal: spacing(4), paddingVertical: spacing(3), borderBottomWidth: 1 },
  card: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3.5) },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  chip: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  label: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  hint: { ...typography.caption, fontSize: 12, marginTop: 1 },
  soon: { ...typography.caption, fontSize: 10, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(2), paddingVertical: 2 },
});
