import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { SITE_BASE_URL } from '../api/client';
import AdminScreen from '../components/admin/AdminScreen';
import ActionButton from '../components/admin/ActionButton';
import FilterChips from '../components/admin/FilterChips';
import Field from '../components/admin/Field';
import EmptyNote from '../components/admin/EmptyNote';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { fetchLiveLocations, fetchLocationHistory, LiveLocationRow, TrailPoint } from '../api/liveLocation';
import { dataGet } from '../api/client';
import { initials } from '../utils/format';
import { todayIso } from '../utils/format';

interface Props {
  onBack: () => void;
}

const POLL_MS = 10000;
const GIG_COLOR = '#7c5cfc';
// A location older than this is "stale" (design legend: < 5 min / Stale).
const STALE_MS = 5 * 60 * 1000;
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
var map = L.map('map', { zoomControl: false }).setView([${FALLBACK_CENTER.latitude}, ${FALLBACK_CENTER.longitude}], 11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
var markers = {};
var firstLoad = true;
window.updateMarkers = function(rows) {
  var seen = {};
  rows.forEach(function(r) {
    seen[r.user_id] = true;
    var color = r.color || '${brand.primary}';
    var ring = r.worker_type === 'gig' ? '${GIG_COLOR}' : '#fff';
    if (markers[r.user_id]) {
      markers[r.user_id].setLatLng([r.latitude, r.longitude]);
    } else {
      var m = L.circleMarker([r.latitude, r.longitude], { radius: 9, color: ring, weight: 3, fillColor: color, fillOpacity: 1 }).addTo(map);
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
var trail = null;
window.clearTrail = function() {
  if (!trail) return;
  ['full', 'done', 'mover', 'start', 'end'].forEach(function(k) { if (trail[k]) map.removeLayer(trail[k]); });
  trail = null;
};
window.showTrail = function(pts) {
  window.clearTrail();
  if (!pts.length) return;
  var ll = pts.map(function(p) { return [p.lat, p.lng]; });
  trail = { pts: pts };
  trail.full = L.polyline(ll, { color: '#7c5cfc', weight: 3, opacity: 0.3 }).addTo(map);
  trail.done = L.polyline([ll[0]], { color: '#7c5cfc', weight: 5, opacity: 0.95 }).addTo(map);
  trail.mover = L.circleMarker(ll[0], { radius: 8, color: '#fff', weight: 2, fillColor: '#7c5cfc', fillOpacity: 1 }).addTo(map);
  trail.start = L.circleMarker(ll[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#15a05a', fillOpacity: 1 }).addTo(map);
  trail.end = L.circleMarker(ll[ll.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#e0384a', fillOpacity: 1 }).addTo(map);
  map.fitBounds(L.latLngBounds(ll), { padding: [30, 30], maxZoom: 16 });
};
window.seekTrail = function(f) {
  if (!trail) return;
  var pts = trail.pts;
  var first = pts[0].t, span = Math.max(1, pts[pts.length - 1].t - first);
  var at = first + Math.min(1, Math.max(0, f)) * span;
  var i = 0;
  while (i < pts.length - 1 && pts[i + 1].t <= at) i++;
  var a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
  var k = b.t > a.t ? (at - a.t) / (b.t - a.t) : 0;
  var pos = [a.lat + (b.lat - a.lat) * k, a.lng + (b.lng - a.lng) * k];
  trail.mover.setLatLng(pos);
  var done = pts.slice(0, i + 1).map(function(p) { return [p.lat, p.lng]; });
  done.push(pos);
  trail.done.setLatLngs(done);
};
</script></body></html>`;

const isFresh = (r: LiveLocationRow) => Date.now() - new Date(r.updated_at).getTime() < STALE_MS;

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

export default function LiveLocationsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [rows, setRows] = useState<LiveLocationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webReady, setWebReady] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webRef = useRef<WebView>(null);
  const [people, setPeople] = useState<{ id: string; full_name: string | null; worker_type: string | null }[]>([]);
  const [trailUser, setTrailUser] = useState('');
  const [trailDate, setTrailDate] = useState(todayIso());
  const [trail, setTrail] = useState<TrailPoint[] | null>(null);
  const [trailBusy, setTrailBusy] = useState(false);
  const [trailMsg, setTrailMsg] = useState('');
  const [frac, setFrac] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (webReady) webRef.current?.injectJavaScript(`window.updateMarkers(${JSON.stringify(rows.map((r) => ({ ...r, color: isFresh(r) ? theme.ok : theme.warn })))}); true;`);
  }, [rows, webReady, theme.ok, theme.warn]);

  useEffect(() => {
    dataGet<{ id: string; full_name: string | null; worker_type: string | null }[]>('profiles', { select: 'id,full_name,worker_type', eq: 'role:employee' })
      .then((p) => {
        setPeople(p);
        if (p[0]) setTrailUser((cur) => cur || p[0].id);
      })
      .catch(() => undefined);
  }, []);

  const stopPlay = useCallback(() => {
    if (playRef.current) clearInterval(playRef.current);
    playRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => () => stopPlay(), [stopPlay]);

  const seek = useCallback(
    (f: number) => {
      const c = Math.min(1, Math.max(0, f));
      setFrac(c);
      webRef.current?.injectJavaScript(`window.seekTrail(${c}); true;`);
    },
    [],
  );

  const showTrail = async (userId: string = trailUser) => {
    if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(trailDate)) {
      setTrailMsg('Pick an employee and a date as YYYY-MM-DD.');
      return;
    }
    stopPlay();
    setTrailBusy(true);
    setTrailMsg('');
    try {
      const pts = await fetchLocationHistory(userId, trailDate);
      if (pts.length === 0) {
        webRef.current?.injectJavaScript('window.clearTrail(); true;');
        setTrail(null);
        setTrailMsg('No location data was recorded for that employee on that day.');
        return;
      }
      setTrail(pts);
      webRef.current?.injectJavaScript(`window.showTrail(${JSON.stringify(pts)}); true;`);
      setFrac(0);
      const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      setTrailMsg(`${pts.length} points · ${clock(pts[0].t)} → ${clock(pts[pts.length - 1].t)}`);
    } catch (e: unknown) {
      setTrailMsg(e instanceof Error && e.message ? e.message : 'Could not load location history');
    } finally {
      setTrailBusy(false);
    }
  };

  const clearTrail = () => {
    stopPlay();
    setTrail(null);
    setTrailMsg('');
    setFrac(0);
    webRef.current?.injectJavaScript('window.clearTrail(); true;');
  };

  const togglePlay = () => {
    if (!trail) return;
    if (playing) return stopPlay();
    let f = frac >= 1 ? 0 : frac;
    setPlaying(true);
    playRef.current = setInterval(() => {
      // The whole day plays in 60 seconds at 1x.
      f += (0.25 * speed) / 60;
      if (f >= 1) {
        seek(1);
        stopPlay();
        return;
      }
      seek(f);
    }, 250);
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

  const fresh = rows.filter(isFresh).length;
  const peopleOptions = people.map((p) => ({ key: p.id, label: `${p.full_name || 'Employee'} (${p.worker_type === 'gig' ? 'Gig' : 'Fixed'})` }));

  return (
    <AdminScreen
      title="Live Locations"
      subtitle={`Fixed and gig employees clocked in · updates every ${POLL_MS / 1000}s`}
      onBack={onBack}
      onRefresh={load}
    >
      {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

      {loaded && (
        <View style={[styles.mapWrap, { borderColor: theme.border }]}>
          <WebView
            ref={webRef}
            style={StyleSheet.absoluteFill}
            originWhitelist={['*']}
            source={{ html: MAP_HTML, baseUrl: SITE_BASE_URL }}
            scrollEnabled={false}
            onLoadEnd={() => setWebReady(true)}
            onMessage={handleMapMessage}
          />
        </View>
      )}

      <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.border }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{rows.length} clocked in</Text>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.ok }]} />
              <Text style={[styles.legendText, { color: theme.text2 }]}>{'< 5 min'}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.warn }]} />
              <Text style={[styles.legendText, { color: theme.text2 }]}>Stale</Text>
            </View>
          </View>
        </View>
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: theme.text3 }]}>
            No one is currently clocked in with a reported location.{'\n\n'}
            Locations only appear while an employee is clocked in — tracking continues in the background
            once they clock in, even if the app isn't open.
          </Text>
        ) : (
          rows.map((r, idx) => {
            const tone = isFresh(r) ? theme.ok : theme.warn;
            return (
              <View key={r.user_id} style={[styles.person, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
                <View style={[styles.avatar, { backgroundColor: tone }]}>
                  <Text style={styles.avatarText}>{initials(r.full_name)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{r.full_name}</Text>
                  <Text style={[styles.sub, { color: tone }]} numberOfLines={1}>
                    {(r.worker_type || 'fixed').replace(/^\w/, (c) => c.toUpperCase())} · {timeAgo(r.updated_at)}
                  </Text>
                  <Text style={[styles.coords, { color: theme.text3 }]}>
                    {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                  </Text>
                </View>
                <View style={styles.personActions}>
                  <Pressable onPress={() => openMaps(r.latitude, r.longitude)} hitSlop={8} accessibilityRole="button">
                    <Text style={[styles.link, { color: theme.accent }]}>Open in Maps</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setTrailUser(r.user_id);
                      showTrail(r.user_id);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.link, { color: theme.accent }]}>Day trail</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
        {rows.length > 0 && fresh === 0 ? (
          <Text style={[styles.empty, { color: theme.warn }]}>Every location is older than 5 minutes.</Text>
        ) : null}
      </View>

      <View style={[styles.trailCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
        <Text style={[styles.sheetTitle, { color: theme.text }]}>Day trail</Text>
        <Text style={[styles.hintText, { color: theme.text2 }]}>Where an employee went on a given day, with playback.</Text>
        {people.length === 0 ? (
          <EmptyNote text="No employees to show a trail for" icon="people" />
        ) : (
          <FilterChips items={peopleOptions} activeKey={trailUser} onSelect={setTrailUser} />
        )}
        <Field label="Date" value={trailDate} onChangeText={setTrailDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        <View style={styles.btnRow}>
          <ActionButton label={trailBusy ? 'Loading…' : 'Show trail'} busy={trailBusy} onPress={() => showTrail()} />
          {trail ? <ActionButton label="Clear trail" tone="neutral" onPress={clearTrail} /> : null}
        </View>
        {trailMsg ? <Text style={[styles.hintText, { color: theme.text2 }]}>{trailMsg}</Text> : null}
        {trail ? (
          <View style={styles.scrub}>
            <View style={styles.scrubRow}>
              <Pressable
                onPress={togglePlay}
                accessibilityRole="button"
                accessibilityLabel={playing ? 'Pause trail' : 'Play trail'}
                style={[styles.playBtn, { backgroundColor: brand.fill }]}
              >
                <Text style={styles.playText}>{playing ? '❚❚' : '▶'}</Text>
              </Pressable>
              <View style={styles.flex}>
                <View style={[styles.scrubTrack, { backgroundColor: theme.panel2 }]}>
                  <View style={[styles.scrubFill, { width: `${Math.round(frac * 100)}%`, backgroundColor: theme.accent }]} />
                </View>
                <Text style={[styles.time, { color: theme.text2 }]}>
                  {new Date(trail[0].t + frac * (trail[trail.length - 1].t - trail[0].t)).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            </View>
            <View style={styles.btnRow}>
              <ActionButton label="−10%" tone="neutral" onPress={() => { stopPlay(); seek(frac - 0.1); }} />
              <ActionButton label="+10%" tone="neutral" onPress={() => { stopPlay(); seek(frac + 0.1); }} />
            </View>
            <FilterChips
              items={[1, 4, 16].map((n) => ({ key: String(n), label: `${n}x` }))}
              activeKey={String(speed)}
              onSelect={(k) => setSpeed(Number(k))}
            />
          </View>
        ) : null}
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  error: { ...typography.caption, marginBottom: spacing(3) },
  mapWrap: { height: 320, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: spacing(3) },
  sheet: { borderWidth: 1, borderRadius: radius.sheet, paddingHorizontal: spacing(4), paddingTop: spacing(2.5), paddingBottom: spacing(3), marginBottom: spacing(3) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing(3) },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2), marginBottom: spacing(2) },
  sheetTitle: { ...typography.heading, fontSize: 16, lineHeight: 22 },
  legend: { flexDirection: 'row', gap: spacing(2.5) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  empty: { ...typography.supporting, textAlign: 'center', paddingVertical: spacing(3) },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2.5) },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#fff' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 19 },
  sub: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, lineHeight: 16 },
  coords: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 11, lineHeight: 15, marginTop: 1 },
  personActions: { alignItems: 'flex-end', gap: spacing(2) },
  link: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  trailCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5), gap: spacing(3), marginBottom: spacing(3) },
  hintText: { ...typography.supporting },
  btnRow: { flexDirection: 'row', gap: spacing(2.5) },
  scrub: { gap: spacing(3) },
  scrubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  playBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#fff', fontSize: 14 },
  scrubTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  scrubFill: { height: '100%', borderRadius: 3 },
  time: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 11, marginTop: spacing(1.5) },
});
