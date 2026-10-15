import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';

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
      <Text style={[styles.fieldLabel, { color: theme.text2 }]}>{label}</Text>
      <Pressable
        onPress={capture}
        accessibilityRole="button"
        style={[
          styles.wrapper,
          uri
            ? { borderColor: theme.accent, borderStyle: 'solid', backgroundColor: theme.panel2 }
            : { borderColor: theme.border, borderStyle: 'dashed', backgroundColor: 'transparent' },
        ]}
      >
        {uri ? <Image source={{ uri }} style={styles.thumb} /> : <Icon name="camera" size={20} color={theme.text2} />}
        <Text style={[styles.hintText, { color: uri ? theme.text : theme.text2 }]} numberOfLines={1}>
          {uri ? 'Tap to retake' : hint}
        </Text>
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
  hintText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  error: { ...typography.supporting, fontSize: 12, marginTop: spacing(1.5) },
});
