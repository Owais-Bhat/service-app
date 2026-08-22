import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import BackLink from '../components/BackLink';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { ApiError } from '../api/client';
import { fetchPoolJobs, claimPoolJob, PoolJob } from '../api/gigPool';

interface Props {
  onBack: () => void;
}

// Public job pool — gig workers only (see GlassCard tile gating in
// JobToolsScreen). Claim is atomic server-side: a 409 means either someone
// else got it first, or the caller already has an active job.
//
// Claimed jobs don't navigate anywhere from here: mobile's "My Tasks" list
// (EmployeeDashboardScreen) reads the `tickets` table, but claiming only
// updates the `inquiries` row — nothing in this backend creates a matching
// `tickets` row for a claim (confirmed: no `INSERT INTO tickets` exists
// server-side at all). Web's task list combines both tables; mobile's
// doesn't yet. Until that's fixed, showing an inline success state here
// (rather than a broken "go to task" link) is the honest behavior.
export default function GigPoolScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [jobs, setJobs] = useState<PoolJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimedTicket, setClaimedTicket] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await fetchPoolJobs());
      setError(null);
    } catch {
      setError('Could not load public jobs — pull to retry');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleClaim = async (job: PoolJob) => {
    setClaimingId(job.id);
    setError(null);
    try {
      await claimPoolJob(job.id);
      setClaimedTicket(job.ticket_no);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not claim this job — try again');
      load();
    } finally {
      setClaimingId(null);
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
        <Text style={[styles.title, { color: theme.text }]}>Public Jobs</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(5) }]}>
          Unclaimed jobs open to any gig worker — online payment only. First to claim gets it, and you can only hold one active job at a time.
        </Text>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginBottom: spacing(3) }]}>{error}</Text> : null}
        {claimedTicket ? (
          <GlassCard style={styles.card}>
            <Text style={[styles.service, { color: semantic.success }]}>Job claimed ✅</Text>
            <Text style={[styles.body, { color: theme.text2 }]}>
              <Text style={{ fontFamily: 'JetBrainsMono_700Bold', color: theme.text }}>{claimedTicket}</Text> is now yours.
            </Text>
          </GlassCard>
        ) : null}

        {jobs.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No public jobs available right now.</Text>
        ) : (
          jobs.map((job) => (
            <GlassCard key={job.id} style={styles.card}>
              <Text style={[styles.ticketNo, { color: brand.primary }]}>{job.ticket_no}</Text>
              <Text style={[styles.service, { color: theme.text }]}>{job.service_item}</Text>
              <Text style={[styles.body, { color: theme.text2 }]}>{job.full_name}</Text>
              <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(3) }]}>{job.location}</Text>
              <GlowButton
                label="Claim Job"
                onPress={() => handleClaim(job)}
                loading={claimingId === job.id}
                icon="arrow-right"
              />
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
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, marginBottom: spacing(1) },
  service: { ...typography.heading, fontSize: 15, marginBottom: spacing(1) },
});
