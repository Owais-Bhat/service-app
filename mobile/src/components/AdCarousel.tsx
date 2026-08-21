import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';
import { brand } from '../theme/tokens';
import { LandingAd } from '../api/landing';

interface Props {
  ads: LandingAd[];
  autoRotateMs?: number;
}

const DEFAULT_ASPECT_RATIO = 330 / 220; // matches web's fixed ad-carousel box until the real image loads

// Image-only rotating banner — mirrors web's AdCarousel minus video support
// (no video-player dependency exists in mobile/ yet; adding one for ads
// alone isn't worth it, see plan's reference-facts section). The container
// height tracks each image's real aspect ratio (via Image.getSize) instead
// of a fixed box with resizeMode="cover", so the full ad is always visible
// — cropping it to fit an arbitrary fixed height isn't acceptable for
// marketing content the advertiser designed at a specific size.
export default function AdCarousel({ ads, autoRotateMs = 5000 }: Props) {
  const [index, setIndex] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    setIndex(0);
    if (ads.length <= 1) return undefined;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % ads.length);
    }, autoRotateMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [ads, autoRotateMs]);

  const ad = ads[index];

  useEffect(() => {
    if (!ad) return;
    setAspectRatio(DEFAULT_ASPECT_RATIO);
    Image.getSize(
      ad.url,
      (width, height) => {
        if (height > 0) setAspectRatio(width / height);
      },
      () => {
        // Keep the default ratio — the <Image> below will still show its
        // own broken-image placeholder if the load ultimately fails.
      },
    );
  }, [ad]);

  if (!ad) return null;

  return (
    <View style={[styles.wrap, { borderColor: theme.border, backgroundColor: theme.panel2, aspectRatio }]}>
      <Image source={{ uri: ad.url }} style={styles.image} resizeMode="contain" />
      {ads.length > 1 && (
        <View style={styles.dots}>
          {ads.map((a, i) => (
            <View key={a.id} style={[styles.dot, { backgroundColor: i === index ? brand.primary : theme.line }]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', width: '100%' },
  image: { width: '100%', height: '100%' },
  dots: { position: 'absolute', bottom: spacing(2.5), alignSelf: 'center', flexDirection: 'row', gap: spacing(1.5) },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
