import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import BackLink from '../components/BackLink';
import PressScale from '../components/PressScale';
import Icon from '../components/Icon';
import ClaimPhotoField from '../components/ClaimPhotoField';
import JobPickerModal from '../components/JobPickerModal';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
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

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: semantic.warning, bg: 'rgba(224,138,20,0.16)', label: 'Pending' },
  approved: { color: brand.primary, bg: 'rgba(21,160,90,0.14)', label: 'Approved' },
  rejected: { color: semantic.danger, bg: 'rgba(240,85,109,0.14)', label: 'Rejected' },
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(12) }}>
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Bonus Reviews</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>
          Claim leaderboard bonus points for a Google review or job card review — admin verifies before it counts.
        </Text>

        <Animated.View entering={FadeInUp.duration(450).springify().damping(15)}>
          <GlassCard shadow style={styles.formCard}>
            <Text style={[styles.sectionLabel, { color: theme.text3 }]}>New Claim</Text>

            <View style={styles.jobTypeRow}>
              <PressScale onPress={() => { resetForm(); setJobType('service'); }} style={{ flex: 1 }}>
                <View style={[styles.jobTypePill, jobType === 'service' && styles.jobTypePillActive, { backgroundColor: jobType === 'service' ? brand.primary : theme.panel2, borderColor: jobType === 'service' ? brand.primary : theme.line }]}>
                  <Icon name="wrench" size={14} color={jobType === 'service' ? '#fff' : theme.text2} />
                  <Text style={[styles.jobTypeText, { color: jobType === 'service' ? '#fff' : theme.text2 }]}>Service</Text>
                </View>
              </PressScale>
              <PressScale onPress={() => { resetForm(); setJobType('installation'); }} style={{ flex: 1 }}>
                <View style={[styles.jobTypePill, jobType === 'installation' && styles.jobTypePillActive, { backgroundColor: jobType === 'installation' ? brand.primary : theme.panel2, borderColor: jobType === 'installation' ? brand.primary : theme.line }]}>
                  <Icon name="box" size={14} color={jobType === 'installation' ? '#fff' : theme.text2} />
                  <Text style={[styles.jobTypeText, { color: jobType === 'installation' ? '#fff' : theme.text2 }]}>Installation</Text>
                </View>
              </PressScale>
            </View>

            {jobType === 'service' ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Completed Job</Text>
                <PressScale onPress={() => setShowJobPicker(true)}>
                  <View style={[styles.pickerBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                    <Icon name="receipt" size={15} color={selectedJob ? brand.primary : theme.text3} />
                    <Text style={[styles.pickerBtnText, { color: selectedJob ? theme.text : theme.text3 }]} numberOfLines={1}>
                      {selectedJob ? `${selectedJob.ticket_no || selectedJob.id.slice(0, 8)} — ${selectedJob.full_name}` : 'Choose a completed job…'}
                    </Text>
                    <Icon name="chevron-right" size={15} color={theme.text3} />
                  </View>
                </PressScale>

                <ClaimPhotoField label="Google Review Screenshot" hint="Tap to attach (up to 30 pts)" uri={servicePhoto} onChange={setServicePhoto} />
              </>
            ) : jobType === 'installation' ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Customer Name</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                  placeholder="Customer's name"
                  placeholderTextColor={theme.text3}
                  value={customerName}
                  onChangeText={setCustomerName}
                />
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Address</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                  placeholder="Installation address"
                  placeholderTextColor={theme.text3}
                  value={address}
                  onChangeText={setAddress}
                />
                <ClaimPhotoField label="Google Review Screenshot" hint="Tap to attach (up to 30 pts)" uri={googlePhoto} onChange={setGooglePhoto} />
                <ClaimPhotoField label="Job Card Review Screenshot" hint="Tap to attach (10 pts)" uri={jobCardPhoto} onChange={setJobCardPhoto} />
              </>
            ) : (
              <Text style={[styles.caption, { color: theme.text3, marginTop: spacing(2) }]}>Choose a job type to continue.</Text>
            )}

            {jobType ? (
              <>
                <PressScale onPress={() => setPolicyAgreed((v) => !v)}>
                  <View style={styles.policyRow}>
                    <View style={[styles.checkbox, { borderColor: policyAgreed ? brand.primary : theme.line, backgroundColor: policyAgreed ? brand.primary : 'transparent' }]}>
                      {policyAgreed ? <Icon name="check" size={11} color="#fff" /> : null}
                    </View>
                    <Text style={[styles.policyText, { color: theme.text3 }]}>
                      I confirm this proof is genuine and was submitted by the actual customer for this job. Submitting false or fabricated reviews may result in disciplinary action.
                    </Text>
                  </View>
                </PressScale>

                {formError ? <Text style={styles.error}>{formError}</Text> : null}

                <PressScale onPress={handleSubmit} disabled={!canSubmit || submitting} style={{ marginTop: spacing(1) }}>
                  <View style={[styles.submitBtn, { backgroundColor: canSubmit ? brand.primary : theme.panel2, shadowColor: brand.primary, opacity: submitting ? 0.7 : 1 }]}>
                    {submitting ? <ActivityIndicator size="small" color={canSubmit ? '#fff' : theme.text3} /> : <Icon name="star" size={15} color={canSubmit ? '#fff' : theme.text3} filled />}
                    <Text style={[styles.submitBtnText, { color: canSubmit ? '#fff' : theme.text3 }]}>
                      {submitting ? 'Submitting…' : jobType === 'service' ? 'Submit Claim (up to 30 pts)' : 'Submit Claim'}
                    </Text>
                  </View>
                </PressScale>
              </>
            ) : null}
          </GlassCard>
        </Animated.View>

        <Text style={[styles.sectionLabel, { color: theme.text3, marginTop: spacing(5), marginBottom: spacing(2.5) }]}>My Submissions</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && submissions.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3 }]}>No submissions yet.</Text>
        ) : (
          submissions.map((r, idx) => {
            const s = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
            return (
              <Animated.View key={r.id} entering={FadeInUp.delay(Math.min(idx, 8) * 60).duration(400).springify().damping(15)}>
                <View style={[styles.rowOuter, { shadowColor: s.color }]}>
                  <View style={[styles.rowAccent, { backgroundColor: s.color }]} />
                  <GlassCard style={styles.subCard}>
                    <View style={styles.subHeader}>
                      <View style={[styles.subIconChip, { backgroundColor: s.bg }]}>
                        <Icon name="star" size={13} color={s.color} filled />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.subTicket, { color: theme.text }]} numberOfLines={1}>
                          {r.ticket_no || r.claimed_address || '—'}
                        </Text>
                        <Text style={[styles.caption, { color: theme.text3 }]}>{REVIEW_TYPE_LABEL[r.review_type] || r.review_type}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
                      </View>
                    </View>
                    <View style={styles.subFooterRow}>
                      <Text style={[styles.subPoints, { color: r.points ? brand.primary : theme.text3 }]}>
                        {r.points != null ? `${r.points} pts` : '— pts'}
                      </Text>
                      {r.admin_note ? <Text style={[styles.subNote, { color: theme.text3 }]} numberOfLines={1}>{r.admin_note}</Text> : null}
                    </View>
                  </GlassCard>
                </View>
              </Animated.View>
            );
          })
        )}
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
  title: { ...typography.title, marginTop: spacing(1) },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: semantic.danger, marginBottom: spacing(3) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  formCard: {},
  jobTypeRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(3), marginBottom: spacing(3) },
  jobTypePill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 42, borderRadius: radius.md, borderWidth: 1 },
  jobTypePillActive: { shadowColor: brand.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  jobTypeText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing(1) },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 46, marginBottom: spacing(3) },
  pickerBtnText: { flex: 1, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 46, fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing(3) },
  policyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2.5), marginTop: spacing(1), marginBottom: spacing(3) },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: spacing(0.25) },
  policyText: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 48, borderRadius: radius.md, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  submitBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  rowOuter: { flexDirection: 'row', marginBottom: spacing(3), shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 3 },
  rowAccent: { width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  subCard: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  subIconChip: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  subTicket: { fontFamily: 'Manrope_700Bold', fontSize: 13, marginBottom: spacing(0.25) },
  statusBadge: { paddingHorizontal: spacing(2), paddingVertical: spacing(0.75), borderRadius: radius.full },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  subFooterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(2.5), paddingTop: spacing(2.5), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.2)' },
  subPoints: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  subNote: { flex: 1, fontSize: 11.5 },
});
