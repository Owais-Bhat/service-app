import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import Panel from '../components/Panel';
import GlowButton from '../components/GlowButton';
import Icon from '../components/Icon';
import ToolHeader from '../components/ToolHeader';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
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
      <ToolHeader
        title="Public Jobs"
        subtitle={`${jobs.length} open near you`}
        onBack={onBack}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.ok} />}
      >
        <Text style={[styles.info, { color: theme.text2 }]}>
          Unclaimed jobs open to any gig worker — online payment only. First to claim gets it, and you can only hold one active job at a time.
        </Text>

        {error ? (
          <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: theme.warnS, borderColor: theme.warn }]}>
            <Icon name="alert" size={20} color={theme.warn} />
            <Text style={[styles.bannerText, { color: theme.text }]}>{error}</Text>
          </View>
        ) : null}
        {claimedTicket ? (
          <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: theme.okS, borderColor: theme.ok }]}>
            <Icon name="check-circle" size={20} color={theme.ok} />
            <View style={styles.bannerBody}>
              <Text style={[styles.bannerTitle, { color: theme.text }]}>Job claimed</Text>
              <Text style={[styles.bannerText, { color: theme.text2 }]}>
                <Text style={{ fontFamily: 'JetBrainsMono_700Bold', color: theme.text }}>{claimedTicket}</Text> is now yours.
              </Text>
            </View>
          </View>
        ) : null}

        {jobs.length === 0 ? (
          <Text style={[styles.info, { color: theme.text3 }]}>No public jobs available right now.</Text>
        ) : (
          jobs.map((job) => (
            <Panel key={job.id} style={styles.card}>
              <Text style={[styles.ticketNo, { color: theme.accent }]}>{job.ticket_no}</Text>
              <View>
                <Text style={[styles.service, { color: theme.text }]}>{job.service_item}</Text>
                <Text style={[styles.customer, { color: theme.text2 }]}>{job.full_name}</Text>
                {job.location ? (
                  <View style={styles.locRow}>
                    <Icon name="pin" size={14} color={theme.text3} />
                    <Text style={[styles.location, { color: theme.text3 }]} numberOfLines={2}>{job.location}</Text>
                  </View>
                ) : null}
              </View>
              <GlowButton
                label="Claim Job"
                onPress={() => handleClaim(job)}
                loading={claimingId === job.id}
                icon="arrow-right"
              />
            </Panel>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), gap: 18 },
  info: { ...typography.supporting },
  banner: { flexDirection: 'row', gap: spacing(2.5), padding: spacing(3), borderRadius: 16, borderWidth: 1, alignItems: 'flex-start' },
  bannerBody: { flex: 1 },
  bannerTitle: { ...typography.rowTitle, fontSize: 14 },
  bannerText: { ...typography.supporting, flex: 1, fontSize: 12, lineHeight: 16 },
  card: { gap: spacing(2.5), borderRadius: radius.xl - 4 },
  ticketNo: { ...typography.monoId },
  service: { ...typography.rowTitle, fontSize: 16, lineHeight: 22 },
  customer: { ...typography.supporting, marginTop: 2 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  location: { ...typography.supporting, flex: 1 },
});
