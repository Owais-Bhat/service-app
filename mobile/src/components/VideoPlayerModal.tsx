import React, { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import PressScale from './PressScale';
import { reportWatchProgress } from '../api/training';
import { spacing, typography } from '../theme';

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
// build needed).
export default function VideoPlayerModal({ itemId, title, mediaUrl, onDismiss, onProgress }: Props) {
  const insets = useSafeAreaInsets();
  const [percent, setPercent] = useState(0);

  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden;}
.wrap{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;}
video{width:100%;height:100%;object-fit:contain;background:#000;}
.center-btn{position:absolute;width:64px;height:64px;border-radius:32px;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;}
.bar{position:absolute;left:14px;right:14px;bottom:18px;display:flex;align-items:center;gap:10px;}
.track-hit{flex:1;padding:12px 0;touch-action:none;}
.track{position:relative;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;}
.fill{position:absolute;left:0;top:0;height:100%;width:0%;background:#15a05a;border-radius:2px;}
.knob{position:absolute;top:50%;width:13px;height:13px;border-radius:7px;background:#fff;left:0%;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,0.4);}
.time{color:#fff;font-size:11px;font-family:sans-serif;min-width:78px;text-align:right;}
</style></head>
<body>
<div class="wrap" id="wrap">
<video id="v" src="${mediaUrl}" playsinline webkit-playsinline></video>
<div class="center-btn" id="btn">&#9654;</div>
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
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + spacing(2) }]}>
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
        <View style={styles.playerWrap}>
          <WebView
            style={StyleSheet.absoluteFill}
            originWhitelist={['*']}
            source={{ html }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onMessage={handleMessage}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(4), paddingBottom: spacing(3) },
  title: { ...typography.heading, fontSize: 15, color: '#fff' },
  watchedText: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: spacing(0.5), fontFamily: 'Manrope_600SemiBold' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  playerWrap: { flex: 1 },
});
