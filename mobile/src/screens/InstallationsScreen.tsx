import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import ToolHeader from '../components/ToolHeader';
import StatusBadge from '../components/admin/StatusBadge';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import InstallationDetailSheet from '../components/InstallationDetailSheet';
import { fetchMyInstallations, InstallationJob } from '../api/installations';
import { pingAssignmentSeen } from '../api/tasks';

interface Props {
  onBack: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// What the card should shout about first: an installation waiting to be
// accepted, then work in hand, then a bill still unpaid.
function jobFlag(job: InstallationJob): { text: string; color: string } | null {
  if (job.assignment_status === 'pending') return { text: 'Accept / Decline', color: semantic.warning };
  if (job.assignment_status === 'declined') return { text: 'Declined', color: semantic.danger };
  if (Number(job.bill_total) > 0 && String(job.payment_status || '').toLowerCase() !== 'paid') {
    return { text: `₹${Math.round(Number(job.bill_total))} unpaid`, color: semantic.warning };
  }
  if (job.completed_at) return { text: 'Completed', color: semantic.success };
  if (job.started_at) return { text: 'In progress', color: brand.primary };
  return null;
}

export default function InstallationsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [jobs, setJobs] = useState<InstallationJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const mine = await fetchMyInstallations(user.id);
      setJobs(mine);
      mine.filter((j) => !j.completed_at).forEach((j) => pingAssignmentSeen('installation', j.id));
      setError(null);
    } catch {
      setError('Could not load installations — pull to retry');
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const [tab, setTab] = useState<'active' | 'done'>('active');
  const activeJobs = jobs.filter((j) => !j.completed_at);
  const doneJobs = jobs.filter((j) => !!j.completed_at);
  const shown = tab === 'active' ? activeJobs : doneJobs;

  const tone = (job: InstallationJob): string => {
    if (job.status === 'completed') return theme.ok;
    if (job.status === 'in_progress') return theme.warn;
    if (job.status === 'cancelled') return theme.grey;
    if (job.status === 'assigned') return theme.vio;
    return theme.info;
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title="Installations" subtitle={`${activeJobs.length} assigned to you`} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <View style={[styles.segmentRow, { backgroundColor: theme.panel2 }]}>
          {([
            { key: 'active', label: `Assigned · ${activeJobs.length}` },
            { key: 'done', label: `Done · ${doneJobs.length}` },
          ] as const).map((seg) => {
            const active = tab === seg.key;
            return (
              <Pressable
                key={seg.key}
                onPress={() => setTab(seg.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.segment, active && { backgroundColor: theme.panel, borderColor: theme.border, borderWidth: 1 }]}
              >
                <Text style={[styles.segmentText, { color: active ? theme.text : theme.text2, fontFamily: active ? 'Manrope_700Bold' : 'Manrope_600SemiBold' }]}>
                  {seg.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={[styles.caption, { color: theme.err }]}>{error}</Text> : null}

        {shown.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {tab === 'active' ? 'No installations assigned right now.' : 'No completed installations yet.'}
            </Text>
          </View>
        ) : (
          shown.map((job) => {
            const flag = jobFlag(job);
            const color = tone(job);
            const label = STATUS_LABEL[job.status] || job.status;
            const cta = job.completed_at ? 'Open job' : job.assignment_status === 'pending' ? 'Accept / Decline' : 'Update status';
            return (
              <View key={job.id} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                <View style={styles.cardTop}>
                  <View style={[styles.iconTile, { backgroundColor: color + '24' }]}>
                    <Icon name="construct" size={22} color={color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{job.full_name}</Text>
                    <Text style={[styles.supporting, { color: theme.text2 }]} numberOfLines={1}>{job.installation_type}</Text>
                    <Text style={[styles.ticketNo, { color: theme.accent }]}>{job.ticket_no}</Text>
                  </View>
                  <StatusBadge label={label} color={color} />
                </View>

                <View style={styles.metaStack}>
                  <View style={styles.metaItem}>
                    <Icon name="calendar" size={14} color={theme.text3} />
                    <Text style={[styles.metaText, { color: theme.text3 }]}>{job.preferred_date} · {job.preferred_time}</Text>
                  </View>
                  {job.location ? (
                    <View style={styles.metaItem}>
                      <Icon name="pin" size={14} color={theme.text3} />
                      <Text style={[styles.metaText, { color: theme.text3, flex: 1 }]} numberOfLines={2}>{job.location}</Text>
                    </View>
                  ) : null}
                  {flag ? (
                    <View style={styles.metaItem}>
                      <Icon name="cash" size={14} color={flag.color} />
                      <Text style={[styles.metaText, { color: flag.color }]}>{flag.text}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${job.phone}`)}
                    accessibilityLabel="Call"
                    style={[styles.iconBtn, { borderColor: theme.border }]}
                  >
                    <Icon name="phone" size={20} color={theme.accent} />
                  </Pressable>
                  <Pressable
                    onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address || job.location)}`)}
                    accessibilityLabel="Directions"
                    style={[styles.iconBtn, { borderColor: theme.border }]}
                  >
                    <Icon name="pin" size={20} color={theme.accent} />
                  </Pressable>
                  <Pressable
                    onPress={() => setOpenId(job.id)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.cta, { backgroundColor: pressed ? brand.pressed : brand.fill }]}
                  >
                    <Text style={styles.ctaText}>{cta}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {openId ? (
        <InstallationDetailSheet
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), gap: spacing(4) },
  caption: { ...typography.caption },
  supporting: { ...typography.supporting },
  segmentRow: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16 },
  segment: { flex: 1, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13 },
  empty: { borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', padding: spacing(6), alignItems: 'center' },
  emptyTitle: { ...typography.rowTitle, textAlign: 'center' },
  card: { borderRadius: 20, borderWidth: 1, padding: spacing(3.5), gap: spacing(2.5) },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(3) },
  iconTile: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  ticketNo: { ...typography.monoId, fontSize: 12, marginTop: 2 },
  metaStack: { gap: spacing(1.5) },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: spacing(2) },
  iconBtn: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cta: { flex: 1, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#ffffff' },
});
