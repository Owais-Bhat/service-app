import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MapView, { Marker, Callout } from 'react-native-maps';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import PulseDot from '../components/PulseDot';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchLiveLocations, LiveLocationRow } from '../api/liveLocation';

interface Props {
  onBack: () => void;
}

const POLL_MS = 20000;
const GIG_COLOR = '#7c5cfc';
// Networking Experts is based in Srinagar — sensible map center when no one
// is clocked in yet, instead of dropping the admin somewhere off Africa (0,0).
const FALLBACK_REGION = { latitude: 34.0837, longitude: 74.7973, latitudeDelta: 0.6, longitudeDelta: 0.6 };

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

export default function LiveLocationsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [rows, setRows] = useState<LiveLocationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchLiveLocations());
      setError(null);
    } catch {
      setError('Could not load locations — pull to retry');
    } finally {
      setLoaded(true);
    }
  }, []);

  // Computed once (on first successful load) and handed to MapView's
  // uncontrolled initialRegion — recomputing this on every poll would yank
  // the map back to center under the admin's finger while they're panning.
  const initialRegion = useMemo(() => {
    if (rows.length === 0) return FALLBACK_REGION;
    const lat = rows.reduce((sum, r) => sum + r.latitude, 0) / rows.length;
    const lng = rows.reduce((sum, r) => sum + r.longitude, 0) / rows.length;
    return { latitude: lat, longitude: lng, latitudeDelta: 0.15, longitudeDelta: 0.15 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openMaps = (lat: number, lng: number) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(10) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <BackLink onPress={onBack} />
        <Text style={[styles.title, { color: theme.text }]}>Live Locations</Text>
        <Text style={[styles.caption, { color: theme.text3, marginBottom: spacing(4) }]}>
          Fixed and gig employees currently clocked in · updates every {POLL_MS / 1000}s
        </Text>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginBottom: spacing(3) }]}>{error}</Text> : null}

        {loaded && (
          <View style={[styles.mapWrap, { borderColor: theme.line }]}>
            <MapView style={StyleSheet.absoluteFill} initialRegion={initialRegion}>
              {rows.map((r) => (
                <Marker
                  key={r.user_id}
                  coordinate={{ latitude: r.latitude, longitude: r.longitude }}
                  pinColor={r.worker_type === 'gig' ? GIG_COLOR : brand.primary}
                >
                  <Callout onPress={() => openMaps(r.latitude, r.longitude)}>
                    <View style={{ padding: 4, minWidth: 140 }}>
                      <Text style={{ fontWeight: '700', fontSize: 13 }}>{r.full_name}</Text>
                      <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                        {(r.worker_type || 'fixed').replace(/^\w/, (c) => c.toUpperCase())} · {timeAgo(r.updated_at)}
                      </Text>
                      <Text style={{ fontSize: 11, color: brand.primary, marginTop: 4 }}>Tap for directions →</Text>
                    </View>
                  </Callout>
                </Marker>
              ))}
            </MapView>
          </View>
        )}

        {rows.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, textAlign: 'center', marginTop: spacing(8) }]}>
            No one is currently clocked in with a reported location.{'\n\n'}
            Locations only appear while an employee is clocked in and has the app open — this is foreground-only,
            it pauses once they lock their phone or switch apps.
          </Text>
        ) : (
          rows.map((r, idx) => (
            <Animated.View key={r.user_id} entering={FadeInUp.delay(idx * 60).duration(400)}>
              <GlassCard shadow style={styles.row}>
                <View style={styles.rowHeader}>
                  <PulseDot color={brand.primary} size={7} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: theme.text }]}>{r.full_name}</Text>
                    <Text style={[styles.caption, { color: theme.text3 }]}>
                      {(r.worker_type || 'fixed').replace(/^\w/, (c) => c.toUpperCase())} · {timeAgo(r.updated_at)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.coords, { color: theme.text2 }]}>
                  {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                </Text>
                <Pressable onPress={() => openMaps(r.latitude, r.longitude)} style={[styles.mapsBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                  <Icon name="pin" size={14} color={brand.primary} />
                  <Text style={[styles.mapsBtnText, { color: brand.primary }]}>Open in Maps</Text>
                </Pressable>
              </GlassCard>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.title, marginTop: spacing(4) },
  caption: { ...typography.caption, lineHeight: 18 },
  mapWrap: { height: 320, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: spacing(4) },
  row: { marginBottom: spacing(3) },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), marginBottom: spacing(2.5) },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  coords: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12, marginBottom: spacing(3) },
  mapsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 38, borderRadius: radius.sm, borderWidth: 1 },
  mapsBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
});
