import React, { useMemo, useState } from 'react';
import { ChoiceChips, HeaderAction, RowPanel, Segmented, SwitchRow } from '../../components/admin/FinanceKit';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import ActionButton from '../../components/admin/ActionButton';
import StatusBadge from '../../components/admin/StatusBadge';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import Icon from '../../components/Icon';
import { resolveUploadUrl } from '../../api/client';
import { uploadMedia } from '../../api/upload';
import { AdInput, AdRow, createAd, deleteAd, fetchAds, saveAd, updateAd } from '../../api/adminPeople';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { humanize, shortDate } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'all' | 'landing' | 'popup_landing' | 'popup_employee';

const PLACEMENT_LABEL: Record<string, string> = { landing: 'Landing carousel', popup_landing: 'Landing popup', popup_employee: 'Employee popup' };
const PLACEMENTS = [
  { key: 'landing', label: 'Landing carousel' },
  { key: 'popup_landing', label: 'Landing popup' },
  { key: 'popup_employee', label: 'Employee popup' },
];
const DEVICES = [
  { key: 'both', label: 'Both' },
  { key: 'mobile', label: 'Mobile only' },
  { key: 'desktop', label: 'Desktop only' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Draft {
  kind: 'image' | 'video';
  url: string;
  placement: string;
  device: string;
  caption: string;
  duration: string;
  position: string;
  active: boolean;
  audio: boolean;
  starts: string;
  expires: string;
}

const blank = (placement: string): Draft => ({
  kind: 'image', url: '', placement, device: 'both', caption: '', duration: '6', position: '0', active: true, audio: false, starts: '', expires: '',
});

const dayOf = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');

// What shows on the public landing page and in the landing / employee popups.
// Add and edit work here with the creative picked from the phone's library.
export default function AdsAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const list = useLoader(fetchAds, 'Could not load ads');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ ad: AdRow | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(blank('landing'));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const rows = list.data ?? [];
  const visible = useMemo(() => rows.filter((a) => filter === 'all' || (a.placement || 'landing') === filter), [rows, filter]);
  const count = (p: string) => rows.filter((a) => (a.placement || 'landing') === p).length;
  const live = (a: AdRow) => Number(a.active) === 1 && !(a.expires_at && new Date(a.expires_at).getTime() < Date.now());

  const openEditor = (ad: AdRow | null) => {
    setEditing({ ad });
    setDraft(
      ad
        ? {
            kind: ad.kind === 'video' ? 'video' : 'image',
            url: ad.url,
            placement: ad.placement || 'landing',
            device: ad.device_target || 'both',
            caption: ad.caption || '',
            duration: String((Number(ad.duration_ms) || 6000) / 1000),
            position: String(ad.position ?? 0),
            active: Number(ad.active) === 1,
            audio: Number(ad.audio_enabled) === 1,
            starts: dayOf(ad.starts_at),
            expires: dayOf(ad.expires_at),
          }
        : blank(filter === 'all' ? 'landing' : filter),
    );
  };

  const pickMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo library access to choose a creative.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const kind = asset.type === 'video' ? 'video' : 'image';
    setUploading(true);
    try {
      const url = await uploadMedia(asset.uri, kind);
      setDraft((d) => ({ ...d, url, kind }));
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Check your connection and try again');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const seconds = parseFloat(draft.duration);
    if (!draft.url) return Alert.alert('Media needed', 'Upload an image or video, or paste a link.');
    if (!/^https?:\/\//i.test(draft.url) && !draft.url.startsWith('/uploads/')) return Alert.alert('Link not valid', 'The link must start with http(s):// or /uploads/.');
    if (!Number.isFinite(seconds) || seconds < 2) return Alert.alert('Duration too short', 'Show each ad for at least 2 seconds.');
    if (draft.starts && !DATE_RE.test(draft.starts)) return Alert.alert('Start date', 'Use YYYY-MM-DD.');
    if (draft.expires && !DATE_RE.test(draft.expires)) return Alert.alert('Expiry date', 'Use YYYY-MM-DD.');
    const body: AdInput = {
      kind: draft.kind,
      url: draft.url,
      caption: draft.caption.trim() || null,
      placement: draft.placement,
      device_target: draft.device,
      duration_ms: Math.round(seconds * 1000),
      position: parseInt(draft.position, 10) || 0,
      active: draft.active ? 1 : 0,
    };
    if (draft.kind === 'video') body.audio_enabled = draft.audio ? 1 : 0;
    if (draft.placement === 'landing') {
      body.starts_at = draft.starts ? `${draft.starts} 00:00:00` : null;
      body.expires_at = draft.expires ? `${draft.expires} 23:59:59` : null;
    }
    setSaving(true);
    try {
      if (editing?.ad) await saveAd(editing.ad.id, body);
      else await createAd(body);
      setEditing(null);
      await list.reload();
    } catch (e: unknown) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a: AdRow) => {
    try {
      await updateAd(a.id, { active: Number(a.active) === 1 ? 0 : 1 });
      await list.reload();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    }
  };

  const remove = (a: AdRow) =>
    Alert.alert('Delete this ad?', a.caption || 'Untitled ad', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAd(a.id);
            await list.reload();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);

  const isPopup = draft.placement !== 'landing';

  return (
    <AdminScreen
      title="Landing & Popup Ads"
      subtitle={`${rows.length} ads`}
      onBack={onBack}
      onRefresh={list.reload}
      loading={list.loading}
      error={list.error}
      headerRight={
        <HeaderAction icon="add" label="Add ad" onPress={() => openEditor(null)} />
      }
      toolbar={
        <FilterChips
          activeKey={filter}
          onSelect={(k) => setFilter(k as Filter)}
          items={[
            { key: 'all', label: 'All', count: rows.length },
            { key: 'landing', label: 'Carousel', count: count('landing') },
            { key: 'popup_landing', label: 'Landing popup', count: count('popup_landing') },
            { key: 'popup_employee', label: 'Employee popup', count: count('popup_employee') },
          ]}
        />
      }
    >
      {visible.length === 0 ? <EmptyNote text="No ads here" icon="megaphone" /> : null}
      {visible.map((a) => (
        <View key={a.id} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border, opacity: live(a) || Number(a.active) === 1 ? 1 : 0.7 }]}>
          <View style={styles.cardTop}>
            <View style={[styles.thumb, { backgroundColor: theme.panel2, borderColor: theme.border }]}>
              {a.kind === 'image' ? (
                <Image source={{ uri: resolveUploadUrl(a.url) }} style={styles.thumbImg} resizeMode="cover" />
              ) : (
                <Icon name="tutorial" size={20} color={theme.text3} />
              )}
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>{a.caption || (a.kind === 'video' ? 'Video ad' : 'Image ad')}</Text>
              <Text style={[styles.cardMeta, { color: theme.text3 }]} numberOfLines={2}>
                {`${PLACEMENT_LABEL[a.placement || 'landing'] || humanize(a.placement)} · ${humanize(a.device_target || 'both')} · ${Math.round((a.duration_ms || 6000) / 1000)}s${a.expires_at ? ` · till ${shortDate(a.expires_at)}` : ''}`}
              </Text>
              <View style={styles.statusRow}>
                <StatusBadge label={live(a) ? 'Live' : Number(a.active) === 1 ? 'Expired' : 'Hidden'} color={live(a) ? theme.ok : theme.grey} />
              </View>
            </View>
            <View style={styles.position}>
              <Text style={[styles.positionLabel, { color: theme.text3 }]}>Position</Text>
              <View style={[styles.positionBox, { backgroundColor: theme.panel2, borderColor: theme.border }]}>
                <Text style={[styles.positionValue, { color: theme.text }]}>{a.position ?? 0}</Text>
              </View>
            </View>
          </View>
          <View style={styles.cardActions}>
            <ActionButton label="Edit" tone="neutral" onPress={() => openEditor(a)} />
            <ActionButton label={Number(a.active) === 1 ? 'Hide' : 'Show'} tone="neutral" onPress={() => toggle(a)} />
            <ActionButton label="Delete" tone="danger" onPress={() => remove(a)} />
          </View>
        </View>
      ))}
      {visible.length > 0 ? <Text style={[styles.hint, { color: theme.text3 }]}>Lower positions show first. Change the number in Edit to reorder.</Text> : null}

      <FormSheet
        visible={!!editing}
        title={editing?.ad ? 'Edit ad' : 'Add ad'}
        onClose={() => setEditing(null)}
        footer={<ActionButton label={editing?.ad ? 'Save' : 'Add ad'} busy={saving} onPress={save} grow />}
      >
        <Text style={[styles.cap, { color: theme.text2 }]}>Creative</Text>
        <View style={[styles.media, { borderColor: draft.url ? theme.accent : theme.border, backgroundColor: theme.panel2 }]}>
          {draft.url && draft.kind === 'image' ? (
            <Image source={{ uri: resolveUploadUrl(draft.url) }} style={styles.preview} resizeMode="cover" />
          ) : (
            <View style={[styles.preview, styles.previewEmpty]}>
              <Icon name={draft.url ? 'tutorial' : 'camera'} size={22} color={theme.text3} />
            </View>
          )}
          <View style={styles.mediaText}>
            <Text style={[styles.mediaTitle, { color: theme.text }]}>{draft.url ? (draft.kind === 'video' ? 'Video ready' : 'Image ready') : 'Nothing chosen'}</Text>
            <Text style={[styles.hint, { color: theme.text3 }]}>
              Images under 2 MB; popup videos under 15 seconds and 20 MB.
            </Text>
          </View>
          <Pressable onPress={pickMedia} disabled={uploading} style={[styles.pick, { borderColor: theme.border }]} accessibilityLabel="Choose media">
            {uploading ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={[styles.pickText, { color: theme.accent }]}>{draft.url ? 'Replace' : 'Choose'}</Text>}
          </Pressable>
        </View>
        <Field
          label="Or paste a link"
          value={draft.url}
          onChangeText={(v) => setDraft({ ...draft, url: v })}
          placeholder="https://…/image.jpg or /uploads/…"
          autoCapitalize="none"
        />

        <Text style={[styles.cap, { color: theme.text2 }]}>Where it shows</Text>
        {editing?.ad ? (
          <Text style={[styles.hint, { color: theme.text3 }]}>{PLACEMENT_LABEL[draft.placement] || draft.placement}</Text>
        ) : (
          <ChoiceChips items={PLACEMENTS.map((p) => [p.key, p.label] as [string, string])} value={draft.placement} onChange={(k) => setDraft({ ...draft, placement: k })} />
        )}
        <Text style={[styles.cap, { color: theme.text2 }]}>Device</Text>
        <Segmented items={DEVICES.map((d) => [d.key, d.label] as [string, string])} value={draft.device} onChange={(k) => setDraft({ ...draft, device: k })} />

        <Field label="Caption" value={draft.caption} onChangeText={(v) => setDraft({ ...draft, caption: v })} placeholder="Title or description (optional)" />
        <View style={styles.pair}>
          <View style={styles.half}>
            <Field label="Duration (seconds)" value={draft.duration} onChangeText={(v) => setDraft({ ...draft, duration: v })} keyboardType="decimal-pad" />
          </View>
          <View style={styles.half}>
            <Field label="Position" value={draft.position} onChangeText={(v) => setDraft({ ...draft, position: v })} keyboardType="number-pad" />
          </View>
        </View>
        {!isPopup ? (
          <View style={styles.pair}>
            <View style={styles.half}>
              <Field label="Starts" value={draft.starts} onChangeText={(v) => setDraft({ ...draft, starts: v })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.half}>
              <Field label="Expires" value={draft.expires} onChangeText={(v) => setDraft({ ...draft, expires: v })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
        ) : null}
        <RowPanel>
          <SwitchRow label="Active (show it)" value={draft.active} onValueChange={(v) => setDraft({ ...draft, active: v })} last={draft.kind !== 'video'} />
          {draft.kind === 'video' ? <SwitchRow label="Play the video with sound" value={draft.audio} onValueChange={(v) => setDraft({ ...draft, audio: v })} last /> : null}
        </RowPanel>
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3), marginBottom: spacing(2.5), gap: spacing(3) },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  thumb: { width: 96, height: 54, borderRadius: radius.sm, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 20 },
  cardMeta: { ...typography.supporting, fontSize: 12, lineHeight: 16, marginTop: 2 },
  statusRow: { marginTop: spacing(1.5) },
  cardActions: { flexDirection: 'row', gap: spacing(2) },
  position: { width: 56 },
  positionLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 10, textAlign: 'center' },
  positionBox: { height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  positionValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15 },
  cap: { ...typography.caption, marginTop: spacing(2), marginBottom: spacing(1.5) },
  hint: { ...typography.caption, marginTop: spacing(1) },
  media: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.lg, padding: spacing(2), marginBottom: spacing(3) },
  preview: { width: 72, height: 54, borderRadius: radius.sm },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  mediaText: { flex: 1 },
  mediaTitle: { ...typography.body, fontWeight: '700' },
  pick: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(2), minWidth: 72, alignItems: 'center' },
  pickText: { ...typography.caption, fontWeight: '700' },
  pair: { flexDirection: 'row', gap: spacing(3) },
  half: { flex: 1 },
});
