import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import GlowButton from '../components/GlowButton';
import ToolHeader from '../components/ToolHeader';
import Icon from '../components/Icon';
import Field from '../components/admin/Field';
import FilterChips from '../components/admin/FilterChips';
import SectionLabel from '../components/admin/SectionLabel';
import StatusBadge from '../components/admin/StatusBadge';
import ClaimPhotoField from '../components/ClaimPhotoField';
import JobPickerModal from '../components/JobPickerModal';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { ApiError } from '../api/client';
import {
  fetchMyReviewSubmissions,
  submitServiceReview,
  submitInstallationReview,
  ReviewSubmission,
  ReviewType,
  ResolvedJob,
} from '../api/reviews';

interface Props {
  onBack: () => void;
}

type JobType = 'service' | 'installation';

const REVIEW_TYPE_LABEL: Record<ReviewType, string> = {
  google: 'Google Review',
  job_card: 'Job Card Review',
  sms: 'SMS Feedback Review',
};

const STATUS_STYLE: Record<string, { tone: 'warn' | 'ok' | 'err'; label: string }> = {
  pending: { tone: 'warn', label: 'Pending' },
  approved: { tone: 'ok', label: 'Approved' },
  rejected: { tone: 'err', label: 'Rejected' },
};

export default function BonusReviewsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jobType, setJobType] = useState<JobType | null>(null);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ResolvedJob | null>(null);
  const [servicePhoto, setServicePhoto] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [googlePhoto, setGooglePhoto] = useState<string | null>(null);
  const [jobCardPhoto, setJobCardPhoto] = useState<string | null>(null);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchMyReviewSubmissions();
      setSubmissions(rows);
      setError(null);
    } catch {
      setError('Could not load your submissions — pull to retry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setJobType(null);
    setSelectedJob(null);
    setServicePhoto(null);
    setCustomerName('');
    setAddress('');
    setGooglePhoto(null);
    setJobCardPhoto(null);
    setPolicyAgreed(false);
    setFormError(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!policyAgreed) {
      setFormError('Please agree to the policy checkbox');
      return;
    }
    setSubmitting(true);
    try {
      if (jobType === 'service') {
        if (!selectedJob) return setFormError('Pick a completed job');
        if (!servicePhoto) return setFormError('Please attach a photo');
        await submitServiceReview(selectedJob.id, servicePhoto);
      } else {
        if (!customerName.trim()) return setFormError("Enter the customer's name");
        if (!address.trim()) return setFormError('Enter the address');
        if (!googlePhoto && !jobCardPhoto) return setFormError('Attach at least one photo');
        await submitInstallationReview(customerName.trim(), address.trim(), googlePhoto, jobCardPhoto);
      }
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not submit — check your connection');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    jobType === 'service' ? !!selectedJob && !!servicePhoto && policyAgreed : jobType === 'installation' ? (!!googlePhoto || !!jobCardPhoto) && policyAgreed : false;

  const now = new Date();
  const monthPoints = submissions
    .filter((r) => {
      const d = new Date(r.created_at);
      return r.status === 'approved' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, r) => sum + (r.points || 0), 0);
  const pendingCount = submissions.filter((r) => r.status === 'pending').length;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title="Bonus Reviews" subtitle="Customer review points" onBack={onBack} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing(10) }]}
      >
        <GlassCard style={styles.hero}>
          <View style={styles.heroHead}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>Review points this month</Text>
            <Text style={[styles.heroValue, { color: theme.text }]}>{monthPoints}</Text>
          </View>
          <Text style={[styles.heroSub, { color: theme.text2 }]}>
            Claim leaderboard bonus points for a Google review or job card review — admin verifies before it counts.
            {pendingCount > 0 ? ` ${pendingCount} claim${pendingCount === 1 ? '' : 's'} waiting for review.` : ''}
          </Text>
        </GlassCard>

        <View>
          <SectionLabel>New claim</SectionLabel>
          <Panel style={styles.formCard}>
            <FilterChips
              items={[{ key: 'service', label: 'Service' }, { key: 'installation', label: 'Installation' }]}
              activeKey={jobType ?? ''}
              onSelect={(k) => { resetForm(); setJobType(k as JobType); }}
            />

            {jobType === 'service' ? (
              <>
                <View>
                  <Text style={[styles.fieldLabel, { color: theme.text2 }]}>Completed job</Text>
                  <Pressable
                    onPress={() => setShowJobPicker(true)}
                    style={({ pressed }) => [styles.pickerBtn, { borderColor: theme.border, backgroundColor: theme.panel2 }, pressed && styles.pressed]}
                  >
                    <Icon name="briefcase" size={18} color={selectedJob ? theme.accent : theme.text3} />
                    <Text style={[styles.pickerBtnText, { color: selectedJob ? theme.text : theme.text3 }]} numberOfLines={1}>
                      {selectedJob ? `${selectedJob.ticket_no || selectedJob.id.slice(0, 8)} — ${selectedJob.full_name}` : 'Choose a completed job…'}
                    </Text>
                    <Icon name="chevron-right" size={16} color={theme.text3} />
                  </Pressable>
                </View>
                <ClaimPhotoField label="Google Review Screenshot" hint="Tap to attach (up to 30 pts)" uri={servicePhoto} onChange={setServicePhoto} />
              </>
            ) : jobType === 'installation' ? (
              <>
                <Field label="Customer name" value={customerName} onChangeText={setCustomerName} placeholder="Customer's name" autoCapitalize="words" />
                <Field label="Address" value={address} onChangeText={setAddress} placeholder="Installation address" />
                <ClaimPhotoField label="Google Review Screenshot" hint="Tap to attach (up to 30 pts)" uri={googlePhoto} onChange={setGooglePhoto} />
                <ClaimPhotoField label="Job Card Review Screenshot" hint="Tap to attach (10 pts)" uri={jobCardPhoto} onChange={setJobCardPhoto} />
              </>
            ) : (
              <Text style={[styles.hint, { color: theme.text3 }]}>Choose a job type to continue.</Text>
            )}

            {jobType ? (
              <>
                <Pressable onPress={() => setPolicyAgreed((v) => !v)} style={styles.policyRow} accessibilityRole="checkbox" accessibilityState={{ checked: policyAgreed }}>
                  <View style={[styles.checkbox, { borderColor: policyAgreed ? theme.accent : theme.border, backgroundColor: policyAgreed ? brand.fill : 'transparent' }]}>
                    {policyAgreed ? <Icon name="check" size={14} color="#fff" /> : null}
                  </View>
                  <Text style={[styles.policyText, { color: theme.text2 }]}>
                    I confirm this proof is genuine and was submitted by the actual customer for this job. Submitting false or fabricated reviews may result in disciplinary action.
                  </Text>
                </Pressable>

                {formError ? (
                  <View accessibilityRole="alert" style={[styles.errorBanner, { backgroundColor: theme.errS }]}>
                    <Icon name="alert" size={16} color={theme.err} />
                    <Text style={[styles.errorText, { color: theme.text }]}>{formError}</Text>
                  </View>
                ) : null}

                <GlowButton
                  label={jobType === 'service' ? 'Submit claim (up to 30 pts)' : 'Submit claim'}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  loading={submitting}
                  icon="star"
                />
              </>
            ) : null}
          </Panel>
        </View>

        <View>
          <SectionLabel>My submissions</SectionLabel>
          {error ? <Text style={[styles.errorPlain, { color: theme.err }]}>{error}</Text> : null}
          {!loading && submissions.length === 0 ? (
            <Text style={[styles.hint, { color: theme.text3 }]}>No submissions yet.</Text>
          ) : (
            <Panel style={styles.list}>
              {submissions.map((r, idx) => {
                const s = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
                const color = s.tone === 'ok' ? theme.ok : s.tone === 'err' ? theme.err : theme.warn;
                const last = idx === submissions.length - 1;
                return (
                  <View key={r.id} style={[styles.subRow, !last && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                    <View style={[styles.subTile, { backgroundColor: theme.panel2 }]}>
                      <Icon name="star" size={20} color={theme.text3} />
                    </View>
                    <View style={styles.subText}>
                      <Text style={[styles.subTicket, { color: theme.text }]} numberOfLines={1}>{r.ticket_no || r.claimed_address || '—'}</Text>
                      <Text style={[styles.subMeta, { color: theme.text3 }]} numberOfLines={1}>
                        {REVIEW_TYPE_LABEL[r.review_type] || r.review_type}
                        {r.points != null && r.points > 0 ? ` · +${r.points} points` : ''}
                      </Text>
                      {r.admin_note ? <Text style={[styles.subMeta, { color: theme.text3 }]} numberOfLines={1}>{r.admin_note}</Text> : null}
                    </View>
                    <StatusBadge label={s.label} color={color} />
                  </View>
                );
              })}
            </Panel>
          )}
        </View>
      </ScrollView>

      {showJobPicker && (
        <JobPickerModal
          onDismiss={() => setShowJobPicker(false)}
          onSelect={(job) => {
            setSelectedJob(job);
            setShowJobPicker(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing(4), gap: 18 },
  hero: { borderRadius: radius.xl },
  heroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  heroTitle: { ...typography.rowTitle },
  heroValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 18 },
  heroSub: { ...typography.supporting, fontSize: 12, lineHeight: 16, marginTop: spacing(1.5) },
  formCard: { gap: spacing(3.5) },
  fieldLabel: { ...typography.caption, marginBottom: spacing(1.5) },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3.5), minHeight: 52 },
  pickerBtnText: { ...typography.body, fontFamily: 'Manrope_500Medium', flex: 1 },
  pressed: { opacity: 0.7 },
  hint: { ...typography.supporting },
  policyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2.5) },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  policyText: { ...typography.supporting, flex: 1, fontSize: 12, lineHeight: 17 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), padding: spacing(2.5), borderRadius: radius.md },
  errorText: { ...typography.caption, fontSize: 12, lineHeight: 16, flex: 1 },
  errorPlain: { ...typography.caption, marginBottom: spacing(2) },
  list: { padding: 0, overflow: 'hidden', borderRadius: radius.xl - 4 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  subTile: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  subText: { flex: 1, minWidth: 0 },
  subTicket: { ...typography.rowTitle, fontSize: 14, lineHeight: 19 },
  subMeta: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
});
