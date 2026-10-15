import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
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
      <Text style={[styles.fieldLabel, { color: theme.text2 }]}>{label}</Text>
      <Pressable
        onPress={capture}
        disabled={busy}
        accessibilityRole="button"
        style={[
          styles.wrapper,
          value
            ? { borderColor: theme.accent, borderStyle: 'solid', backgroundColor: theme.panel2 }
            : { borderColor: theme.border, borderStyle: 'dashed', backgroundColor: 'transparent' },
        ]}
      >
        {value ? <Image source={{ uri: value }} style={styles.thumb} /> : <Icon name="camera" size={20} color={theme.text2} />}
        <Text style={[styles.hint, { color: value ? theme.text : theme.text2 }]} numberOfLines={1}>
          {busy ? 'Uploading…' : value ? 'Tap to retake' : 'Take a photo'}
        </Text>
        {busy ? <ActivityIndicator color={brand.primary} /> : null}
      </Pressable>
      {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}
    </View>
  );
}

// Design attachment control: 52 dp, r14, dashed 1.5 dp until a file is attached.
const styles = StyleSheet.create({
  fieldLabel: { ...typography.caption, marginBottom: spacing(1.5) },
  wrapper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), minHeight: 52, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing(3) },
  thumb: { width: 36, height: 36, borderRadius: radius.sm },
  hint: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  error: { ...typography.supporting, fontSize: 12, marginTop: spacing(1.5) },
});
