import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';
import { brand, semantic } from '../theme/tokens';

interface Props {
  label: string;
  hint: string;
  uri: string | null;
  onChange: (uri: string | null) => void;
}

// Camera-capture field that keeps the raw local file:// URI only — unlike
// PhotoPicker (used for device photos), Bonus Review claims attach the raw
// file straight to their own multipart submit request, so nothing should
// upload until the claim itself is actually submitted.
export default function ClaimPhotoField({ label, hint, uri, onChange }: Props) {
  const { theme } = useTheme();
  const [error, setError] = React.useState<string | null>(null);

  const capture = async () => {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission is required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    onChange(result.assets[0].uri);
  };

  return (
    <View style={{ marginBottom: spacing(3) }}>
      <Pressable
        onPress={capture}
        style={[styles.wrapper, { borderColor: uri ? brand.primary : theme.line, backgroundColor: theme.panel2 }]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.thumb} />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: theme.panel2 }]}>
            <Icon name="box" size={18} color={theme.text3} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
          <Text style={[styles.hint, { color: theme.text3 }]}>{uri ? 'Tap to retake' : hint}</Text>
        </View>
        <Icon name="edit" size={16} color={theme.text3} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1.5, borderRadius: radius.md, padding: spacing(2.5) },
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
  placeholder: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  hint: { fontSize: 11, marginTop: 2 },
  error: { fontSize: 11, color: semantic.danger, marginTop: spacing(1) },
});
