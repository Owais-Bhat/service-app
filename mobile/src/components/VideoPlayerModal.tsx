import React, { useState } from 'react';
import { Modal, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from './Icon';
import PressScale from './PressScale';
import { reportWatchProgress } from '../api/training';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  // Present for standalone tutorials (training_items) — pings the server's
  // watch-progress table. Omitted for course-lesson videos, which track
  // completion through a different mechanism (completeLesson), so no
  // watch-progress row should be written for them.
  itemId?: string;
  title: string;
  mediaUrl: string;
  onDismiss: () => void;
  onProgress?: (percent: number) => void;
}

// In-app player via a WebView <video> — no native controls (those don't
// render reliably inside a WebView), but a custom draggable/tappable
// progress bar so the video can be freely scrubbed forward and back.
// Reuses the same safe-in-Expo-Go WebView approach already used for the
// OSM maps (no native video module → no config plugin → no custom dev
// build needed). The WebView fills the entire screen — title/close and
// the scrubber are floating gradient overlays, not boxes that eat into
// the video area, so playback is genuinely edge-to-edge.
export default function VideoPlayerModal({ itemId, title, mediaUrl, onDismiss, onProgress }: Props) {
  const insets = useSafeAreaInsets();
  const [percent, setPercent] = useState(0);

  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden;}
.wrap{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;}
video{width:100%;height:100%;object-fit:contain;background:#000;}
.center-btn{position:absolute;width:72px;height:72px;border-radius:36px;background:rgba(21,160,90,0.85);display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;box-shadow:0 8px 24px rgba(0,0,0,0.45);border:2px solid rgba(255,255,255,0.35);}
.scrim{position:absolute;left:0;right:0;bottom:0;height:110px;background:linear-gradient(to top, rgba(0,0,0,0.75), transparent);pointer-events:none;}
.bar{position:absolute;left:18px;right:18px;bottom:${16 + insets.bottom}px;display:flex;align-items:center;gap:10px;}
.track-hit{flex:1;padding:14px 0;touch-action:none;}
.track{position:relative;height:5px;background:rgba(255,255,255,0.28);border-radius:3px;}
.fill{position:absolute;left:0;top:0;height:100%;width:0%;background:${brand.primary};border-radius:3px;}
.knob{position:absolute;top:50%;width:15px;height:15px;border-radius:8px;background:#fff;left:0%;transform:translate(-50%,-50%);box-shadow:0 1px 5px rgba(0,0,0,0.5);}
.time{color:#fff;font-size:11px;font-family:sans-serif;font-weight:600;min-width:80px;text-align:right;text-shadow:0 1px 3px rgba(0,0,0,0.6);}
</style></head>
<body>
<div class="wrap" id="wrap">
<video id="v" src="${mediaUrl}" playsinline webkit-playsinline></video>
<div class="center-btn" id="btn">&#9654;</div>
<div class="scrim"></div>
<div class="bar"><div class="track-hit" id="trackHit"><div class="track"><div class="fill" id="fill"></div><div class="knob" id="knob"></div></div></div><div class="time" id="time">0:00 / 0:00</div></div>
</div>
<script>
var v = document.getElementById('v');
var btn = document.getElementById('btn');
var fill = document.getElementById('fill');
var knob = document.getElementById('knob');
var timeEl = document.getElementById('time');
var wrap = document.getElementById('wrap');
var trackHit = document.getElementById('trackHit');
var maxTime = 0;
var lastReport = 0;
var dragging = false;
function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var m = Math.floor(s / 60), sec = s % 60; return m + ':' + (sec < 10 ? '0' : '') + sec; }
function post(obj) { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }
function togglePlay() { if (v.paused) { v.play(); btn.style.display = 'none'; } else { v.pause(); btn.style.display = 'flex'; } }
btn.onclick = togglePlay;
wrap.onclick = function(e) { if (e.target === wrap || e.target === v) togglePlay(); };
function setBarFromTime(t) {
  if (!v.duration) return;
  var pct = Math.min(100, Math.max(0, (t / v.duration) * 100));
  fill.style.width = pct + '%';
  knob.style.left = pct + '%';
  timeEl.textContent = fmt(t) + ' / ' + fmt(v.duration);
}
function seekAt(clientX) {
  if (!v.duration) return;
  var rect = trackHit.getBoundingClientRect();
  var ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  var t = ratio * v.duration;
  v.currentTime = t;
  setBarFromTime(t);
}
trackHit.addEventListener('touchstart', function(e) { dragging = true; seekAt(e.touches[0].clientX); });
trackHit.addEventListener('touchmove', function(e) { if (dragging) seekAt(e.touches[0].clientX); });
trackHit.addEventListener('touchend', function() { dragging = false; });
trackHit.addEventListener('click', function(e) { seekAt(e.clientX); });
v.addEventListener('loadedmetadata', function() { post({ type: 'duration', duration: v.duration }); });
v.addEventListener('pause', function() { btn.style.display = 'flex'; ping(true); });
v.addEventListener('timeupdate', function() {
  if (v.currentTime > maxTime) maxTime = v.currentTime;
  if (!dragging) setBarFromTime(v.currentTime);
  ping(false);
});
v.addEventListener('ended', function() { btn.style.display = 'flex'; ping(true); post({ type: 'ended' }); });
function ping(force) {
  if (!v.duration || isNaN(v.duration)) return;
  if (!force && v.currentTime - lastReport < 4) return;
  lastReport = v.currentTime;
  post({ type: 'progress', seconds: maxTime, duration: v.duration });
}
</script>
</body></html>`;

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'progress' && msg.duration) {
        const pct = Math.min(100, Math.round((msg.seconds / msg.duration) * 100));
        setPercent(pct);
        onProgress?.(pct);
        if (itemId) reportWatchProgress(itemId, msg.seconds, msg.duration).catch(() => {});
      }
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <StatusBar hidden />
      <View style={styles.root}>
        <WebView
          style={StyleSheet.absoluteFill}
          originWhitelist={['*']}
          source={{ html }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onMessage={handleMessage}
        />

        <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={[styles.topOverlay, { paddingTop: insets.top + spacing(2) }]} pointerEvents="box-none">
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <Text style={styles.watchedText}>{percent}% watched</Text>
            </View>
            <PressScale onPress={onDismiss}>
              <View style={styles.closeBtn}>
                <Icon name="close" size={16} color="#fff" />
              </View>
            </PressScale>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: spacing(6) },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(4) },
  title: { ...typography.heading, fontSize: 15, color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  watchedText: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: spacing(0.5), fontFamily: 'Manrope_600SemiBold' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
