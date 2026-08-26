import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
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

const POLL_MS = 10000;
const GIG_COLOR = '#7c5cfc';
// Networking Experts is based in Srinagar — sensible map center when no one
// is clocked in yet, instead of dropping the admin somewhere off Africa (0,0).
const FALLBACK_CENTER = { latitude: 34.0837, longitude: 74.7973 };

// OpenStreetMap via a WebView, same as web's Live Locations page — no
// Google Maps API key needed, so it actually renders inside Expo Go (the
// react-native-maps Google provider needs a key baked into a real native
// build, which shows as a blank black tile in Expo Go). Markers are pushed
// in after load via injectJavaScript so polling updates positions in place
// instead of reloading the whole page and resetting the admin's pan/zoom.
const MAP_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;padding:0;background:#e5e7eb;}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${FALLBACK_CENTER.latitude}, ${FALLBACK_CENTER.longitude}], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
var markers = {};
var firstLoad = true;
window.updateMarkers = function(rows) {
  var seen = {};
  rows.forEach(function(r) {
    seen[r.user_id] = true;
    var color = r.worker_type === 'gig' ? '${GIG_COLOR}' : '${brand.primary}';
    if (markers[r.user_id]) {
      markers[r.user_id].setLatLng([r.latitude, r.longitude]);
    } else {
      var m = L.circleMarker([r.latitude, r.longitude], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map);
      m.bindTooltip(r.full_name, { permanent: false, direction: 'top' });
      m.on('click', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ lat: r.latitude, lng: r.longitude }));
      });
      markers[r.user_id] = m;
    }
  });
  Object.keys(markers).forEach(function(id) {
    if (!seen[id]) { map.removeLayer(markers[id]); delete markers[id]; }
  });
  if (firstLoad && rows.length) {
    firstLoad = false;
    map.fitBounds(L.featureGroup(Object.values(markers)).getBounds().pad(0.3));
  }
};
</script></body></html>`;

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
  const [webReady, setWebReady] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webRef = useRef<WebView>(null);

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

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  // Pushed in after the page finishes loading, and again on every poll —
  // updates marker positions in place instead of reloading the WebView.
  useEffect(() => {
    if (webReady) webRef.current?.injectJavaScript(`window.updateMarkers(${JSON.stringify(rows)}); true;`);
  }, [rows, webReady]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Directions mode (not just a search pin) — opens Google Maps straight
  // into guided turn-by-turn navigation to the employee's last position.
  const openMaps = (lat: number, lng: number) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);

  const handleMapMessage = (e: WebViewMessageEvent) => {
    try {
      const { lat, lng } = JSON.parse(e.nativeEvent.data);
      openMaps(lat, lng);
    } catch { /* ignore malformed messages */ }
  };

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
            <WebView
              ref={webRef}
              style={StyleSheet.absoluteFill}
              originWhitelist={['*']}
              source={{ html: MAP_HTML }}
              scrollEnabled={false}
              onLoadEnd={() => setWebReady(true)}
              onMessage={handleMapMessage}
            />
          </View>
        )}

        {rows.length === 0 ? (
          <Text style={[styles.caption, { color: theme.text3, textAlign: 'center', marginTop: spacing(8) }]}>
            No one is currently clocked in with a reported location.{'\n\n'}
            Locations only appear while an employee is clocked in — tracking continues in the background
            once they clock in, even if the app isn't open.
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
