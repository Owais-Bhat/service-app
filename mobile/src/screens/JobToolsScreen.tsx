import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import Icon from '../components/Icon';
import { IconName } from '../theme/icons';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';

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
}

interface Tool {
  key: string;
  label: string;
  desc: string;
  color: string;
  icon: IconName;
}

const BASE_TOOLS: Tool[] = [
  { key: 'tasks', label: 'Manage Tasks', desc: 'Assigned jobs, service requests & assignments', color: '#15a05a', icon: 'tasks' },
  { key: 'estimator', label: 'Estimator', desc: 'Build an on-site quote', color: '#15a05a', icon: 'estimator' },
  { key: 'devices', label: 'Device Follow-up', desc: 'Devices under service', color: '#0ea5a5', icon: 'device' },
  { key: 'eod', label: 'EOD Report', desc: 'Submit end-of-day summary', color: '#6366f1', icon: 'report' },
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
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();

  // installations_enabled defaults to visible (server treats undefined as 1)
  // — only explicit 0/false hides it, matching web's default-on behavior.
  const installationsOn = user?.installations_enabled !== 0 && user?.installations_enabled !== false;
  const isGigWorker = user?.worker_type === 'gig';

  const tools: Tool[] = [
    ...BASE_TOOLS,
    ...(installationsOn
      ? [{ key: 'installations', label: 'My Installations', desc: 'Assigned installation jobs', color: '#e08a14', icon: 'box' as IconName }]
      : []),
    ...(isGigWorker
      ? [{ key: 'gigpool', label: 'Public Jobs', desc: 'Unclaimed jobs open to any gig worker', color: '#7c5cfc', icon: 'star' as IconName }]
      : []),
  ];

  const openTool = (key: string) => {
    if (key === 'tasks') onOpenManageTasks();
    else if (key === 'estimator') onOpenEstimator();
    else if (key === 'devices') onOpenDeviceFollowUp();
    else if (key === 'eod') onOpenEodReport();
    else if (key === 'installations') onOpenInstallations();
    else if (key === 'gigpool') onOpenGigPool();
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}>
        <Text style={[styles.title, { color: theme.text }]}>Job Tools</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(5) }]}>Tasks, estimator, devices & reports</Text>

        {tools.map((tool) => (
          <Pressable key={tool.key} onPress={() => openTool(tool.key)} style={({ pressed }) => [pressed && styles.pressed]}>
            <Panel style={styles.toolRow}>
              <View style={[styles.toolIcon, { backgroundColor: tool.color + '24' }]}>
                <Icon name={tool.icon} size={22} color={tool.color} />
              </View>
              <View style={styles.toolInfo}>
                <Text style={[styles.toolLabel, { color: theme.text }]}>{tool.label}</Text>
                <Text style={[styles.caption, { color: theme.text3 }]}>{tool.desc}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={theme.text3} />
            </Panel>
          </Pressable>
        ))}
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
  title: { ...typography.title },
  caption: { ...typography.caption },
  pressed: { opacity: 0.7 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2.5) },
  toolIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toolInfo: { flex: 1, minWidth: 0 },
  toolLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15, marginBottom: spacing(0.5) },
});
