import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveUploadUrl } from '../api/client';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';

// `photo_urls` is stored as a JSON array of /uploads paths (or null).
export function parsePhotoUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((u): u is string => typeof u === 'string');
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

// The customer's attached photos, as thumbnails that open full-size.
export default function RequestPhotos({ raw }: { raw: unknown }) {
  const { theme } = useTheme();
  const urls = parsePhotoUrls(raw).map(resolveUploadUrl);
  if (!urls.length) return null;
  return (
    <View>
      <Text style={[styles.label, { color: theme.text3 }]}>Customer photos</Text>
      <View style={styles.row}>
        {urls.map((u) => (
          <Pressable key={u} onPress={() => Linking.openURL(u)}>
            <Image source={{ uri: u }} style={[styles.thumb, { borderColor: theme.line }]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, marginBottom: spacing(1.5), marginTop: spacing(3) },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  thumb: { width: 76, height: 76, borderRadius: radius.sm, borderWidth: 1 },
});
