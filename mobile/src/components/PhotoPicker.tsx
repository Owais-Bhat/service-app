import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { uploadImage } from '../api/upload';

interface Props {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}

// Camera-capture-then-upload field — takes a photo, uploads it immediately
// via api/upload.ts, and hands the caller back the hosted URL. Shared by
// the Device Service "taken" and "returned" photo requirements.
export default function PhotoPicker({ label, value, onChange }: Props) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = async () => {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission is required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    setBusy(true);
    try {
      const url = await uploadImage(result.assets[0].uri);
      onChange(url);
    } catch {
      setError('Could not upload photo — check your connection');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Pressable
        onPress={capture}
        disabled={busy}
        style={[styles.wrapper, { borderColor: value ? brand.primary : theme.line, backgroundColor: theme.panel2 }]}
      >
        {value ? (
          <Image source={{ uri: value }} style={styles.thumb} />
        ) : (
          <View style={styles.placeholder}>
            <Icon name="device" size={20} color={theme.text3} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
          <Text style={[styles.hint, { color: theme.text3 }]}>{busy ? 'Uploading…' : value ? 'Tap to retake' : 'Tap to take a photo'}</Text>
        </View>
        {busy ? <ActivityIndicator color={brand.primary} /> : <Icon name="edit" size={16} color={theme.text3} />}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1.5, borderRadius: radius.md, padding: spacing(2.5) },
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
  placeholder: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.08)' },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  hint: { fontSize: 11, marginTop: 2 },
  error: { fontSize: 11, color: semantic.danger, marginTop: spacing(1) },
});
