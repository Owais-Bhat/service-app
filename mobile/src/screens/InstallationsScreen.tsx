import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchMyInstallations, advanceInstallationStatus, InstallationJob } from '../api/installations';

interface Props {
  onBack: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export default function InstallationsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [jobs, setJobs] = useState<InstallationJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setJobs(await fetchMyInstallations(user.id));
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

  const handleAdvance = async (job: InstallationJob) => {
    const next = job.status === 'pending' ? 'in_progress' : 'completed';
    setAdvancingId(job.id);
    try {
      const updated = await advanceInstallationStatus(job.id, next);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? updated : j)));
    } catch {
      setError('Could not update status — try again');
    } finally {
      setAdvancingId(null);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: insets.bottom + spacing(10), paddingHorizontal: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>My Installations</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(5) }]}>
          Installation jobs assigned to you
        </Text>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginBottom: spacing(3) }]}>{error}</Text> : null}

        {jobs.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No installations assigned right now.</Text>
        ) : (
          jobs.map((job) => (
            <GlassCard key={job.id} style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={[styles.ticketNo, { color: brand.primary }]}>{job.ticket_no}</Text>
                <View style={[styles.statusBadge, { backgroundColor: job.status === 'completed' ? `${semantic.success}26` : theme.panel2 }]}>
                  <Text style={[styles.statusBadgeText, { color: job.status === 'completed' ? semantic.success : theme.text2 }]}>
                    {STATUS_LABEL[job.status] || job.status}
                  </Text>
                </View>
              </View>
              <Text style={[styles.installType, { color: theme.text }]}>{job.installation_type}</Text>
              <Text style={[styles.body, { color: theme.text2 }]}>{job.full_name}</Text>
              <Text style={[styles.caption, { color: theme.text3 }]}>{job.location}</Text>
              <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(3) }]}>
                {job.preferred_date} · {job.preferred_time}
              </Text>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => Linking.openURL(`tel:${job.phone}`)}
                  style={[styles.iconAction, { borderColor: theme.line, backgroundColor: theme.panel2 }]}
                >
                  <Icon name="phone" size={16} color={theme.text} />
                </Pressable>
                <Pressable
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address || job.location)}`)}
                  style={[styles.iconAction, { borderColor: theme.line, backgroundColor: theme.panel2 }]}
                >
                  <Icon name="pin" size={16} color={theme.text} />
                </Pressable>
              </View>

              {job.status !== 'completed' && (
                <GlowButton
                  label={job.status === 'pending' ? 'Start Installation' : 'Mark Completed'}
                  onPress={() => handleAdvance(job)}
                  loading={advancingId === job.id}
                  icon="arrow-right"
                />
              )}
            </GlassCard>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginTop: spacing(4) },
  caption: { ...typography.caption },
  body: { ...typography.body },
  card: { marginBottom: spacing(4) },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
  statusBadge: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.sm },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  installType: { ...typography.heading, fontSize: 15, marginBottom: spacing(1) },
  actionRow: { flexDirection: 'row', gap: spacing(2.5), marginBottom: spacing(1) },
  iconAction: { width: 38, height: 38, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
