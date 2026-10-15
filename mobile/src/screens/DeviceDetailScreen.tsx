import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import ToolHeader from '../components/ToolHeader';
import Field from '../components/admin/Field';
import FilterChips from '../components/admin/FilterChips';
import StatusBadge from '../components/admin/StatusBadge';
import Icon from '../components/Icon';
import GlowButton from '../components/GlowButton';
import PhotoPicker from '../components/PhotoPicker';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { ApiError } from '../api/client';
import { fetchDeviceStatus, markDeviceTaken, logFollowUp, markDeviceReturned, DeviceStatusDetail } from '../api/deviceTracking';

interface Props {
  inquiryId: string;
  onBack: () => void;
}

// A small UI convenience, not a schema-enforced enum — the server accepts
// any string for follow-up status (design spec §2).
const FOLLOWUP_OPTIONS = [
  { key: 'diagnosing', label: 'Diagnosing' },
  { key: 'awaiting_parts', label: 'Awaiting Parts' },
  { key: 'in_repair', label: 'In Repair' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup' },
];

export default function DeviceDetailScreen({ inquiryId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [detail, setDetail] = useState<DeviceStatusDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [takenNote, setTakenNote] = useState('');
  const [takenPhoto, setTakenPhoto] = useState<string | null>(null);
  const [followupStatus, setFollowupStatus] = useState(FOLLOWUP_OPTIONS[0].key);
  const [followupNote, setFollowupNote] = useState('');
  const [returnCondition, setReturnCondition] = useState('good');
  const [returnNote, setReturnNote] = useState('');
  const [returnPhoto, setReturnPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchDeviceStatus(inquiryId);
      setDetail(d);
      setError(null);
    } catch {
      setError('Could not load device status — check your connection');
    } finally {
      setLoading(false);
    }
  }, [inquiryId]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (action: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save — check your connection');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <ToolHeader title="Device service" onBack={onBack} />
        <View style={styles.centered}>
          <Text style={[styles.caption, { color: theme.text3 }]}>Loading…</Text>
        </View>
      </View>
    );
  }

  const taken = detail?.device_taken_logs;
  const returned = detail?.device_return_logs;
  const followChips = FOLLOWUP_OPTIONS.map((o) => ({ key: o.key, label: o.label }));

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title="Device service" subtitle="Custody, follow-up and return" onBack={onBack} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

        {!taken ? (
          <GlassCard>
            <Text style={[styles.overline, { color: theme.text3 }]}>Custody receipt</Text>
            <View style={styles.formGap}>
              <Field label="Device description" value={takenNote} onChangeText={setTakenNote} placeholder="Make, model, condition (optional)" />
              <PhotoPicker label="Device photo" value={takenPhoto} onChange={setTakenPhoto} />
              <GlowButton
                label="Mark device taken"
                icon="device"
                onPress={() => runAction(() => markDeviceTaken(inquiryId, takenNote.trim(), takenPhoto))}
                loading={submitting}
              />
            </View>
          </GlassCard>
        ) : (
          <>
            <GlassCard>
              <View style={styles.custodyHead}>
                <Text style={[styles.overline, { color: theme.text3 }]}>Custody receipt</Text>
                <StatusBadge label={returned ? 'Returned' : 'With technician'} color={returned ? theme.ok : theme.warn} icon={returned ? 'check-circle' : 'person-circle'} />
              </View>
              <Text style={[styles.rowTitle, { color: theme.text, marginTop: spacing(2) }]}>Taken by {taken.profiles?.full_name || 'you'}</Text>
              {taken.device_description ? (
                <Text style={[styles.supporting, { color: theme.text2, marginTop: spacing(1) }]}>{taken.device_description}</Text>
              ) : null}
              <View style={styles.takenAt}>
                <Icon name="clock" size={14} color={theme.text3} />
                <Text style={[styles.caption, { color: theme.text3 }]}>Taken {new Date(taken.taken_at).toLocaleString('en-IN')}</Text>
              </View>
            </GlassCard>

            {!returned ? (
              <View style={styles.section}>
                <Text style={[styles.heading, { color: theme.text }]}>Follow-up</Text>
                <FilterChips items={followChips} activeKey={followupStatus} onSelect={setFollowupStatus} />
                <Field label="Notes" value={followupNote} onChangeText={setFollowupNote} placeholder="Add a note (optional)" />
                <GlowButton
                  label="Log update"
                  variant="secondary"
                  onPress={() => runAction(() => logFollowUp(inquiryId, followupStatus, followupNote.trim()))}
                  loading={submitting}
                />
              </View>
            ) : null}

            {detail && detail.device_follow_up_logs.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.heading, { color: theme.text }]}>History</Text>
                <View>
                  {detail.device_follow_up_logs.map((f, i, arr) => (
                    <View key={f.id} style={styles.timelineRow}>
                      <View style={styles.timelineRail}>
                        <Icon name="construct" size={16} color={theme.accent} />
                        {i < arr.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: theme.line }]} /> : null}
                      </View>
                      <View style={styles.timelineBody}>
                        <Text style={[styles.timelineTitle, { color: theme.text }]}>
                          {f.status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                          {f.notes ? ` — ${f.notes}` : ''}
                        </Text>
                        <Text style={[styles.caption, { color: theme.text3, fontSize: 12 }]}>
                          {new Date(f.created_at).toLocaleString('en-IN')} · {f.profiles?.full_name || 'Someone'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {!returned ? (
              <View style={styles.section}>
                <Text style={[styles.heading, { color: theme.text }]}>Return</Text>
                <Field label="Condition" value={returnCondition} onChangeText={setReturnCondition} placeholder="e.g. good" />
                <Field label="Notes" value={returnNote} onChangeText={setReturnNote} placeholder="Add a note (optional)" />
                <PhotoPicker label="Return photo" value={returnPhoto} onChange={setReturnPhoto} />
              </View>
            ) : (
              <Panel>
                <Text style={[styles.overline, { color: theme.text3 }]}>Returned</Text>
                <Text style={[styles.rowTitle, { color: theme.text, marginTop: spacing(1) }]}>Condition: {returned.device_condition}</Text>
                <Text style={[styles.caption, { color: theme.text3 }]}>{new Date(returned.returned_at).toLocaleString('en-IN')}</Text>
                {returned.return_notes ? (
                  <Text style={[styles.supporting, { color: theme.text2, marginTop: spacing(2) }]}>{returned.return_notes}</Text>
                ) : null}
              </Panel>
            )}
          </>
        )}
      </ScrollView>

      {taken && !returned ? (
        <View style={[styles.sticky, { backgroundColor: theme.surfaceStrong, borderTopColor: theme.line, paddingBottom: insets.bottom + 22 }]}>
          <View style={{ flex: 1 }}>
            <GlowButton
              label="Mark returned"
              icon="arrow-right"
              onPress={() => runAction(() => markDeviceReturned(inquiryId, returnCondition.trim() || 'good', returnNote.trim(), returnPhoto))}
              loading={submitting}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing(4), paddingBottom: spacing(8), gap: spacing(5) },
  caption: { ...typography.caption },
  supporting: { ...typography.supporting },
  rowTitle: { ...typography.rowTitle },
  heading: { ...typography.heading, fontSize: 16, lineHeight: 22 },
  overline: { ...typography.overline },
  error: { ...typography.caption },
  formGap: { gap: spacing(3.5), marginTop: spacing(3) },
  custodyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2) },
  takenAt: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginTop: spacing(3) },
  section: { gap: spacing(3) },
  timelineRow: { flexDirection: 'row', gap: spacing(3) },
  timelineRail: { width: 20, alignItems: 'center' },
  timelineLine: { flex: 1, width: 2, marginVertical: 2, minHeight: 12 },
  timelineBody: { flex: 1, paddingBottom: spacing(2.5) },
  timelineTitle: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  sticky: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing(1), paddingHorizontal: spacing(4), borderTopWidth: 1 },
});
