import React from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Animated, { ZoomIn } from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  location: string | null;
  lat: number | null;
  lng: number | null;
  onDismiss: () => void;
}

// In-app preview first (no app-switch needed to see roughly where the job
// is), with "Open in Google Maps" as an explicit fallback for turn-by-turn
// directions — same two-option pattern as LiveLocationsScreen's callout.
export default function LocationMapModal({ location, lat, lng, onDismiss }: Props) {
  const { theme } = useTheme();
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';

  // Turn-by-turn "Start" navigation (not just a search pin) — dir mode with
  // travelmode=driving opens Google Maps straight into guided navigation.
  const openGoogleMaps = () => {
    const url = hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location || '')}&travelmode=driving`;
    Linking.openURL(url);
  };

  // OpenStreetMap via a WebView — react-native-maps' Google provider needs a
  // native API key baked into a real build, which Expo Go can't do (renders
  // as a blank black tile). This needs no key and works in Expo Go, same
  // approach the web admin's Live Locations page already uses (Leaflet).
  const mapHtml = hasCoords
    ? `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;padding:0;background:#e5e7eb;}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${lat}, ${lng}], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
L.marker([${lat}, ${lng}]).addTo(map);
</script></body></html>`
    : '';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Animated.View entering={ZoomIn.duration(320).springify().damping(15).mass(0.85)} style={styles.cardWrap}>
          <GlassSurface style={styles.card} borderRadius={radius.lg}>
            <View style={[styles.headerRow, { borderBottomColor: theme.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text }]}>Job Location</Text>
                {location ? (
                  <Text style={[styles.subtitle, { color: theme.text3 }]} numberOfLines={2}>{location}</Text>
                ) : null}
              </View>
              <PressScale onPress={onDismiss}>
                <View style={[styles.closeBtn, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
                  <Icon name="close" size={13} color={theme.text3} />
                </View>
              </PressScale>
            </View>

            {hasCoords ? (
              <View style={[styles.mapWrap, { borderColor: theme.line }]}>
                <WebView style={StyleSheet.absoluteFill} originWhitelist={['*']} source={{ html: mapHtml }} scrollEnabled={false} />
              </View>
            ) : (
              <View style={[styles.noCoordsBox, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                <Icon name="pin" size={20} color={theme.text3} />
                <Text style={[styles.noCoordsText, { color: theme.text3 }]}>
                  No exact coordinates on file for this job — use Google Maps to search the address instead.
                </Text>
              </View>
            )}

            <PressScale onPress={openGoogleMaps}>
              <View style={[styles.gmapsBtn, { backgroundColor: brand.primary, shadowColor: brand.primary }]}>
                <Icon name="pin" size={16} color="#fff" />
                <Text style={styles.gmapsBtnText}>Open in Google Maps</Text>
              </View>
            </PressScale>
          </GlassSurface>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  cardWrap: { width: '100%', maxWidth: 440 },
  card: { width: '100%', padding: spacing(5) },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), paddingBottom: spacing(3), marginBottom: spacing(3), borderBottomWidth: 1 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.heading, fontSize: 17 },
  subtitle: { fontSize: 12, marginTop: spacing(0.5), lineHeight: 17 },
  mapWrap: { height: 240, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', marginBottom: spacing(3) },
  noCoordsBox: { alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, padding: spacing(4), marginBottom: spacing(3) },
  noCoordsText: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  gmapsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 46, borderRadius: radius.md, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  gmapsBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
});
