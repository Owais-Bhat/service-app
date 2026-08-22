import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
import GlowButton from '../components/GlowButton';
import PhotoPicker from '../components/PhotoPicker';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
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
        <View style={styles.centered}>
          <Text style={[styles.caption, { color: theme.text3 }]}>Loading…</Text>
        </View>
      </View>
    );
  }

  const taken = detail?.device_taken_logs;
  const returned = detail?.device_return_logs;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Device Detail</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!taken ? (
          <GlassCard style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Mark Device Taken</Text>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Device description (optional)"
              placeholderTextColor={theme.text3}
              value={takenNote}
              onChangeText={setTakenNote}
            />
            <View style={{ marginBottom: spacing(3) }}>
              <PhotoPicker label="Device Photo" value={takenPhoto} onChange={setTakenPhoto} />
            </View>
            <GlowButton
              label="Mark Device Taken"
              onPress={() => runAction(() => markDeviceTaken(inquiryId, takenNote.trim(), takenPhoto))}
              loading={submitting}
            />
          </GlassCard>
        ) : (
          <>
            <Panel style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Device Taken</Text>
              <Text style={[styles.body, { color: theme.text }]}>By {taken.profiles?.full_name || 'you'}</Text>
              <Text style={[styles.caption, { color: theme.text3 }]}>{new Date(taken.taken_at).toLocaleString('en-IN')}</Text>
              {taken.device_description ? (
                <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>{taken.device_description}</Text>
              ) : null}
            </Panel>

            {!returned ? (
              <GlassCard style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Log Follow-up Update</Text>
                <View style={styles.chipsRow}>
                  {FOLLOWUP_OPTIONS.map((opt) => {
                    const active = followupStatus === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => setFollowupStatus(opt.key)}
                        style={[styles.chip, { borderColor: theme.line, backgroundColor: active ? brand.primary : theme.panel2 }]}
                      >
                        <Text style={[styles.chipText, { color: active ? '#ffffff' : theme.text2 }]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  style={[styles.input, { color: theme.text, marginTop: spacing(3) }]}
                  placeholder="Notes (optional)"
                  placeholderTextColor={theme.text3}
                  value={followupNote}
                  onChangeText={setFollowupNote}
                />
                <GlowButton
                  label="Log Update"
                  onPress={() => runAction(() => logFollowUp(inquiryId, followupStatus, followupNote.trim()))}
                  loading={submitting}
                />
              </GlassCard>
            ) : null}

            {detail && detail.device_follow_up_logs.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Follow-up History</Text>
                {detail.device_follow_up_logs.map((f) => (
                  <Panel key={f.id} style={styles.historyRow}>
                    <Text style={[styles.historyStatus, { color: brand.primary }]}>{f.status.replace(/_/g, ' ').toUpperCase()}</Text>
                    {f.notes ? <Text style={[styles.body, { color: theme.text2 }]}>{f.notes}</Text> : null}
                    <Text style={[styles.caption, { color: theme.text3 }]}>
                      {f.profiles?.full_name || 'Someone'} · {new Date(f.created_at).toLocaleString('en-IN')}
                    </Text>
                  </Panel>
                ))}
              </View>
            ) : null}

            {!returned ? (
              <GlassCard style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Mark Returned</Text>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Condition (e.g. good)"
                  placeholderTextColor={theme.text3}
                  value={returnCondition}
                  onChangeText={setReturnCondition}
                />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Notes (optional)"
                  placeholderTextColor={theme.text3}
                  value={returnNote}
                  onChangeText={setReturnNote}
                />
                <View style={{ marginBottom: spacing(3) }}>
                  <PhotoPicker label="Return Photo" value={returnPhoto} onChange={setReturnPhoto} />
                </View>
                <GlowButton
                  label="Mark Returned"
                  onPress={() => runAction(() => markDeviceReturned(inquiryId, returnCondition.trim() || 'good', returnNote.trim(), returnPhoto))}
                  loading={submitting}
                />
              </GlassCard>
            ) : (
              <Panel style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Returned</Text>
                <Text style={[styles.body, { color: theme.text }]}>Condition: {returned.device_condition}</Text>
                <Text style={[styles.caption, { color: theme.text3 }]}>{new Date(returned.returned_at).toLocaleString('en-IN')}</Text>
                {returned.return_notes ? (
                  <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>{returned.return_notes}</Text>
                ) : null}
              </Panel>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title, marginBottom: spacing(4) },
  body: { ...typography.body },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(3) },
  section: { marginBottom: spacing(4) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { paddingHorizontal: spacing(3), paddingVertical: spacing(2), borderRadius: 10, borderWidth: 1 },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  historyRow: { marginBottom: spacing(2) },
  historyStatus: { fontFamily: 'Manrope_700Bold', fontSize: 12, marginBottom: spacing(0.5) },
});
