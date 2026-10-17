import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../../components/MeshBackground';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminTabBar, { AdminTab } from '../../components/admin/AdminTabBar';
import { tabBarSpace } from '../../components/GlassTabBar';
import SearchField from '../../components/admin/SearchField';
import SectionLabel from '../../components/admin/SectionLabel';
import EmptyNote from '../../components/admin/EmptyNote';
import Icon from '../../components/Icon';
import { ADMIN_MENU, AdminMenuTone } from '../../navigation/adminMenu';
import { canOpenRoute, ModuleSet } from '../../navigation/adminAccess';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeTokens } from '../../theme/tokens';
import { radius, spacing, typography } from '../../theme';

interface Props {
  /** Route names that have a real screen behind them. */
  available: Set<string>;
  /** A limited admin's modules; pages outside them are left out. null/omitted = everything. */
  modules?: ModuleSet;
  onOpen: (route: string) => void;
  onTab: (tab: AdminTab) => void;
}

// Icon-tile colour (solid, soft fill) for each menu group's tone.
function tonePair(theme: ThemeTokens, tone: AdminMenuTone): [string, string] {
  switch (tone) {
    case 'info': return [theme.info, theme.infoS];
    case 'accent': return [theme.accent, theme.okS];
    case 'teal': return [theme.teal, theme.tealS];
    case 'vio': return [theme.vio, theme.vioS];
    case 'warn': return [theme.warn, theme.warnS];
    case 'grey': return [theme.grey, theme.greyS];
    case 'err': return [theme.err, theme.errS];
    default: return [theme.ok, theme.okS];
  }
}

// Every page of the web admin portal, grouped the way the web sidebar groups
// them. Pages that are not built on mobile yet stay visible but dimmed, so the
// owner can see what exists on the web and what is still to come.
export default function AdminMenuScreen({ available, modules = null, onOpen, onTab }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');

  // What this admin may see at all (a limited admin never sees the rest, not even as "Soon").
  const menu = useMemo(
    () =>
      ADMIN_MENU.map((g) => ({ ...g, items: g.items.filter((i) => !i.route || canOpenRoute(modules, i.route)) })).filter((g) => g.items.length > 0),
    [modules],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.map((g) => ({
      ...g,
      items: g.items.filter((i) => !q || i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query, menu]);

  const total = menu.reduce((n, g) => n + g.items.length, 0);
  const built = menu.reduce((n, g) => n + g.items.filter((i) => i.route && available.has(i.route)).length, 0);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AdminHeader title="Menu" subtitle={`${built} of ${total} portal pages available on mobile`} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing(4), paddingBottom: tabBarSpace(insets.bottom) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <SearchField value={query} onChangeText={setQuery} placeholder="Search pages" />
        {groups.length === 0 ? <EmptyNote text="No page matches your search" icon="search" /> : null}
        {groups.map((group) => {
          const [tone, toneBg] = tonePair(theme, group.tone);
          return (
            <View key={group.key}>
              <SectionLabel>{group.label}</SectionLabel>
              <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
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
                      <View style={[styles.chip, { backgroundColor: live ? toneBg : theme.panel2 }]}>
                        <Icon name={item.icon} size={20} color={live ? tone : theme.text3} />
                      </View>
                      <View style={styles.text}>
                        <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>{item.label}</Text>
                        <Text style={[styles.hint, { color: theme.text2 }]} numberOfLines={1}>{item.hint}</Text>
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
          );
        })}
      </ScrollView>
      <AdminTabBar active="menu" onSelect={onTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(3.5), paddingVertical: spacing(2.5), minHeight: 62 },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  chip: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  label: { ...typography.rowTitle },
  hint: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  soon: { ...typography.caption, fontSize: 10, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(2), paddingVertical: 2 },
});
