import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';
import Icon from './Icon';
import { LandingAd } from '../api/landing';

interface Props {
  ad: LandingAd | null;
  onDismiss: () => void;
}

const DEFAULT_ASPECT_RATIO = 1.4;

// Mirrors web's popup-placement ad — a single dismissible modal, first ad
// only (web doesn't rotate popups either), shown once per landing visit.
// Sized to the real image's aspect ratio (see AdCarousel for why) instead
// of cropping it to a fixed ratio.
export default function PopupAd({ ad, onDismiss }: Props) {
  const { theme } = useTheme();
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);

  useEffect(() => {
    if (!ad) return;
    setAspectRatio(DEFAULT_ASPECT_RATIO);
    Image.getSize(
      ad.url,
      (width, height) => {
        if (height > 0) setAspectRatio(width / height);
      },
      () => {},
    );
  }, [ad]);

  if (!ad) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}>
          <Image source={{ uri: ad.url }} style={[styles.image, { aspectRatio }]} resizeMode="contain" />
          <Pressable
            onPress={onDismiss}
            style={[styles.close, { backgroundColor: theme.panel2 }]}
            hitSlop={8}
            accessibilityLabel="Dismiss"
          >
            <Icon name="close" size={16} color={theme.text} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(6) },
  card: { width: '100%', maxWidth: 360, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  image: { width: '100%' },
  close: {
    position: 'absolute',
    top: spacing(2.5),
    right: spacing(2.5),
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
