import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlassTabBar from '../components/GlassTabBar';
import { EMPLOYEE_TABS } from './EmployeeDashboardScreen';
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
}

const TOOLS = [
  { key: 'estimator', label: 'Estimator', desc: 'Build an on-site quote', color: '#15a05a' },
  { key: 'devices', label: 'Device Follow-up', desc: 'Devices under service', color: '#0ea5a5' },
  { key: 'eod', label: 'EOD Report', desc: 'Submit end-of-day summary', color: '#6366f1' },
];

export default function JobToolsScreen({
  onGoDashboard,
  onGoAttendance,
  onGoEarnings,
  onGoProfile,
  onOpenEstimator,
  onOpenDeviceFollowUp,
  onOpenEodReport,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const openTool = (key: string) => {
    if (key === 'estimator') onOpenEstimator();
    else if (key === 'devices') onOpenDeviceFollowUp();
    else onOpenEodReport();
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}>
        <Text style={[styles.title, { color: theme.text }]}>Job Tools</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(5) }]}>Estimator, devices & reports</Text>

        {TOOLS.map((tool) => (
          <Pressable key={tool.key} onPress={() => openTool(tool.key)} style={({ pressed }) => [pressed && styles.pressed]}>
            <Panel style={styles.toolRow}>
              <View style={[styles.toolIcon, { backgroundColor: tool.color + '24' }]}>
                <View style={[styles.toolDot, { backgroundColor: tool.color }]} />
              </View>
              <View style={styles.toolInfo}>
                <Text style={[styles.toolLabel, { color: theme.text }]}>{tool.label}</Text>
                <Text style={[styles.caption, { color: theme.text3 }]}>{tool.desc}</Text>
              </View>
              <Text style={[styles.chevron, { color: theme.text3 }]}>›</Text>
            </Panel>
          </Pressable>
        ))}

        <Panel style={{ ...styles.toolRow, ...styles.comingSoonRow }}>
          <View style={[styles.toolIcon, { backgroundColor: theme.panel2 }]}>
            <View style={[styles.toolDot, { backgroundColor: theme.text3 }]} />
          </View>
          <View style={styles.toolInfo}>
            <Text style={[styles.toolLabel, { color: theme.text3 }]}>Job Cards</Text>
            <Text style={[styles.caption, { color: theme.text3 }]}>Coming soon</Text>
          </View>
        </Panel>
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
  comingSoonRow: { opacity: 0.6 },
  toolIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toolDot: { width: 10, height: 10, borderRadius: 5 },
  toolInfo: { flex: 1, minWidth: 0 },
  toolLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15, marginBottom: spacing(0.5) },
  chevron: { fontSize: 20 },
});
