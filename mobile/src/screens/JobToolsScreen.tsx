import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassTabBar from '../components/GlassTabBar';
import AppHeaderBar from '../components/AppHeaderBar';
import Icon from '../components/Icon';
import { IconName } from '../theme/icons';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';

interface Props {
  onGoDashboard: () => void;
  onGoAttendance: () => void;
  onGoEarnings: () => void;
  onGoProfile: () => void;
  onOpenEstimator: () => void;
  onOpenDeviceFollowUp: () => void;
  onOpenEodReport: () => void;
  onOpenInstallations: () => void;
  onOpenGigPool: () => void;
  onOpenManageTasks: () => void;
  onOpenMyStats: () => void;
  onOpenServicePricing: () => void;
  onOpenAssignRequests: () => void;
  onOpenCalendar: () => void;
  onOpenRegister: () => void;
  onOpenMaterials: () => void;
  onOpenAssistant: () => void;
}

type Tone = 'ok' | 'info' | 'vio' | 'teal' | 'warn';

interface Tool {
  key: string;
  label: string;
  desc: string;
  tone: Tone;
  icon: IconName;
  group: string;
}

const GROUPS = ['Work', 'Field', 'Money & help'];

// Grouped as in the design (Work / Field / Money & help); tool tiles take the
// tinted status hues rather than raw hex values.
const BASE_TOOLS: Tool[] = [
  { key: 'tasks', label: 'My Tasks', desc: 'Status, billing, devices', tone: 'ok', icon: 'tasks', group: 'Work' },
  { key: 'calendar', label: 'Calendar', desc: 'Your dated installation jobs', tone: 'info', icon: 'calendar', group: 'Work' },
  { key: 'devices', label: 'Device Follow-up', desc: 'Devices under service', tone: 'teal', icon: 'device', group: 'Field' },
  { key: 'materials', label: 'Materials Used', desc: 'Record stock fitted on, or returned from, a job', tone: 'info', icon: 'box', group: 'Field' },
  { key: 'eod', label: 'EOD Report', desc: 'Due before clock out', tone: 'warn', icon: 'report', group: 'Field' },
  { key: 'estimator', label: 'Estimator', desc: 'Build an on-site quote', tone: 'ok', icon: 'estimator', group: 'Money & help' },
  { key: 'pricing', label: 'Service Pricing', desc: 'Browse service rates on-site', tone: 'ok', icon: 'pricetag', group: 'Money & help' },
  { key: 'mystats', label: 'My Stats', desc: 'Personal KPIs: tasks, attendance & collections', tone: 'vio', icon: 'chart', group: 'Money & help' },
  { key: 'assistant', label: 'AI Assistant', desc: 'Describe a fault, get fix steps and a solution video', tone: 'vio', icon: 'sparkles', group: 'Money & help' },
];

export default function JobToolsScreen({
  onGoDashboard,
  onGoAttendance,
  onGoEarnings,
  onGoProfile,
  onOpenEstimator,
  onOpenDeviceFollowUp,
  onOpenEodReport,
  onOpenInstallations,
  onOpenGigPool,
  onOpenManageTasks,
  onOpenMyStats,
  onOpenServicePricing,
  onOpenAssignRequests,
  onOpenCalendar,
  onOpenRegister,
  onOpenMaterials,
  onOpenAssistant,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [headerHeight, setHeaderHeight] = useState(0);

  const installationsOn = user?.installations_enabled !== 0 && user?.installations_enabled !== false;
  const isGigWorker = user?.worker_type === 'gig';
  const canAssignTickets = user?.can_assign_tickets === 1 || user?.can_assign_tickets === true;
  const canRegister = user?.can_add_service === 1 || user?.can_add_service === true;

  const [query, setQuery] = useState('');

  const tools: Tool[] = [
    ...BASE_TOOLS,
    ...(installationsOn
      ? [{ key: 'installations', label: 'My Installations', desc: 'Assigned installation jobs', tone: 'teal' as Tone, icon: 'construct' as IconName, group: 'Work' }]
      : []),
    ...(isGigWorker
      ? [{ key: 'gigpool', label: 'Public Jobs', desc: 'Unclaimed jobs open to any gig worker', tone: 'vio' as Tone, icon: 'briefcase' as IconName, group: 'Work' }]
      : []),
    ...(canRegister
      ? [{ key: 'register', label: 'Register Customer', desc: 'Walk-in or phone request, accepted by you', tone: 'info' as Tone, icon: 'add' as IconName, group: 'Work' }]
      : []),
    ...(canAssignTickets
      ? [{ key: 'assign', label: 'Assign Requests', desc: 'Hand incoming service requests to technicians', tone: 'vio' as Tone, icon: 'swap' as IconName, group: 'Work' }]
      : []),
  ];

  const openTool = (key: string) => {
    if (key === 'tasks') onOpenManageTasks();
    else if (key === 'estimator') onOpenEstimator();
    else if (key === 'devices') onOpenDeviceFollowUp();
    else if (key === 'eod') onOpenEodReport();
    else if (key === 'installations') onOpenInstallations();
    else if (key === 'gigpool') onOpenGigPool();
    else if (key === 'mystats') onOpenMyStats();
    else if (key === 'pricing') onOpenServicePricing();
    else if (key === 'assign') onOpenAssignRequests();
    else if (key === 'calendar') onOpenCalendar();
    else if (key === 'register') onOpenRegister();
    else if (key === 'materials') onOpenMaterials();
    else if (key === 'assistant') onOpenAssistant();
  };

  const topInset = headerHeight > 0 ? headerHeight : insets.top + 100;
  const q = query.trim().toLowerCase();
  const visible = q ? tools.filter((t) => t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)) : tools;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AppHeaderBar title="Job Tools" subtitle="Tasks, estimator, devices & reports" onLayout={setHeaderHeight} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: topInset + spacing(4) }]}
      >
        <View style={[styles.search, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <Icon name="search" size={18} color={theme.text3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find a tool"
            placeholderTextColor={theme.text3}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>

        {GROUPS.map((group) => {
          const items = visible.filter((t) => t.group === group);
          if (items.length === 0) return null;
          return (
            <View key={group} style={styles.group}>
              <Text style={[styles.overline, { color: theme.text3 }]}>{group}</Text>
              <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                {items.map((tool, i) => {
                  const color = theme[tool.tone];
                  const tint = theme[`${tool.tone}S` as 'okS'];
                  return (
                    <Pressable
                      key={tool.key}
                      onPress={() => openTool(tool.key)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.row, i < items.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }, pressed && styles.pressed]}
                    >
                      <View style={[styles.toolIcon, { backgroundColor: tint }]}>
                        <Icon name={tool.icon} size={20} color={color} />
                      </View>
                      <View style={styles.toolInfo}>
                        <Text style={[styles.toolLabel, { color: theme.text }]}>{tool.label}</Text>
                        <Text style={[styles.toolDesc, { color: theme.text2 }]} numberOfLines={2}>{tool.desc}</Text>
                      </View>
                      <Icon name="chevron-right" size={18} color={theme.text3} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        {visible.length === 0 ? (
          <Text style={[styles.footnote, { color: theme.text3 }]}>No tool matches "{query.trim()}".</Text>
        ) : (
          <Text style={[styles.footnote, { color: theme.text3 }]}>Need another tool? Ask the office to enable it for your account.</Text>
        )}
      </ScrollView>

      <GlassTabBar
        items={EMPLOYEE_TABS}
        activeKey="jobtools"
        onSelect={(key) => {
          if (key === 'dashboard') onGoDashboard();
          else if (key === 'attendance') onGoAttendance();
          else if (key === 'earnings') onGoEarnings();
          else if (key === 'profile') onGoProfile();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: spacing(30), paddingHorizontal: spacing(4), gap: spacing(5) },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing(3) },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  group: { gap: spacing(2) },
  overline: { ...typography.overline, paddingLeft: spacing(1) },
  panel: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), minHeight: 64, paddingHorizontal: spacing(3.5), paddingVertical: spacing(3) },
  pressed: { opacity: 0.7 },
  toolIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  toolInfo: { flex: 1, minWidth: 0 },
  toolLabel: { ...typography.rowTitle },
  toolDesc: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  footnote: { ...typography.supporting, textAlign: 'center', paddingHorizontal: spacing(4) },
});
