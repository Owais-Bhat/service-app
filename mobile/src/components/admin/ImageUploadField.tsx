import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Icon from '../Icon';
import { uploadImage } from '../../api/upload';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';

interface Props {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  hint?: string;
}

// Pick an image from the gallery, upload it through /api/upload and hand the
// hosted URL back. Used for logos, signatures and ad creatives — the camera-only
// PhotoPicker is for proof photos.
export default function ImageUploadField({ label, value, onChange, hint }: Props) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo library permission is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    setBusy(true);
    try {
      onChange(await uploadImage(result.assets[0].uri));
    } catch {
      setError('Could not upload — check your connection');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.text2 }]}>{label}</Text>
      <View style={[styles.box, { borderColor: value ? brand.primary : theme.line, backgroundColor: theme.panel2 }]}>
        {value ? (
          <Image source={{ uri: value }} style={styles.thumb} resizeMode="contain" />
        ) : (
          <View style={[styles.thumb, styles.empty]}>
            <Icon name="camera" size={20} color={theme.text3} />
          </View>
        )}
        <View style={styles.actions}>
          <Pressable onPress={pick} disabled={busy} style={[styles.btn, { borderColor: theme.line }]} accessibilityLabel={`Upload ${label}`}>
            {busy ? <ActivityIndicator size="small" color={brand.primary} /> : <Text style={[styles.btnText, { color: brand.primary }]}>{value ? 'Replace' : 'Upload'}</Text>}
          </Pressable>
          {value ? (
            <Pressable onPress={() => onChange(null)} style={[styles.btn, { borderColor: theme.line }]} accessibilityLabel={`Remove ${label}`}>
              <Text style={[styles.btnText, { color: semantic.danger }]}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {hint ? <Text style={[styles.hint, { color: theme.text3 }]}>{hint}</Text> : null}
      {error ? <Text style={[styles.hint, { color: semantic.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing(3) },
  label: { ...typography.caption, fontWeight: '700', marginBottom: spacing(1) },
  box: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.md, padding: spacing(2) },
  thumb: { width: 72, height: 48, borderRadius: radius.sm },
  empty: { alignItems: 'center', justifyContent: 'center' },
  actions: { flex: 1, flexDirection: 'row', gap: spacing(2), justifyContent: 'flex-end' },
  btn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(2), minWidth: 72, alignItems: 'center' },
  btnText: { ...typography.caption, fontWeight: '700' },
  hint: { ...typography.caption, marginTop: spacing(1) },
});
