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

const HEIGHT = 160;

// Image-only rotating banner — mirrors web's AdCarousel minus video support
// (no video-player dependency exists in mobile/ yet; adding one for ads
// alone isn't worth it, see plan's reference-facts section).
export default function AdCarousel({ ads, autoRotateMs = 5000 }: Props) {
  const [index, setIndex] = useState(0);
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

  if (ads.length === 0) return null;
  const ad = ads[index];

  return (
    <View style={[styles.wrap, { borderColor: theme.border, backgroundColor: theme.panel2 }]}>
      <Image source={{ uri: ad.url }} style={styles.image} resizeMode="cover" />
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
  wrap: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', height: HEIGHT },
  image: { width: '100%', height: '100%' },
  dots: { position: 'absolute', bottom: spacing(2.5), alignSelf: 'center', flexDirection: 'row', gap: spacing(1.5) },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
