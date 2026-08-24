import React, { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import PressScale from './PressScale';
import { reportWatchProgress } from '../api/training';
import { spacing, typography } from '../theme';

interface Props {
  itemId: string;
  title: string;
  mediaUrl: string;
  onDismiss: () => void;
  onProgress: (percent: number) => void;
}

// In-app player via a WebView <video> — no native controls, no draggable
// scrubber, and a JS high-water-mark guard that snaps any attempted forward
// seek straight back: the furthest point actually watched is the only way
// forward, matching the "nobody skips ahead" requirement. Reuses the same
// safe-in-Expo-Go WebView approach already used for the OSM maps (no native
// video module → no config plugin → no custom dev build needed).
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
.track{flex:1;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;overflow:hidden;}
.fill{height:100%;width:0%;background:#15a05a;}
.time{color:#fff;font-size:11px;font-family:sans-serif;min-width:78px;text-align:right;}
</style></head>
<body>
<div class="wrap" id="wrap">
<video id="v" src="${mediaUrl}" playsinline webkit-playsinline></video>
<div class="center-btn" id="btn">&#9654;</div>
<div class="bar"><div class="track"><div class="fill" id="fill"></div></div><div class="time" id="time">0:00 / 0:00</div></div>
</div>
<script>
var v = document.getElementById('v');
var btn = document.getElementById('btn');
var fill = document.getElementById('fill');
var timeEl = document.getElementById('time');
var wrap = document.getElementById('wrap');
var maxTime = 0;
var lastReport = 0;
function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var m = Math.floor(s / 60), sec = s % 60; return m + ':' + (sec < 10 ? '0' : '') + sec; }
function post(obj) { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }
function togglePlay() { if (v.paused) { v.play(); btn.style.display = 'none'; } else { v.pause(); btn.style.display = 'flex'; } }
btn.onclick = togglePlay;
wrap.onclick = function(e) { if (e.target === wrap || e.target === v) togglePlay(); };
v.addEventListener('loadedmetadata', function() { post({ type: 'duration', duration: v.duration }); });
v.addEventListener('pause', function() { btn.style.display = 'flex'; ping(true); });
v.addEventListener('timeupdate', function() {
  if (v.currentTime > maxTime + 1.5) { v.currentTime = maxTime; return; }
  if (v.currentTime > maxTime) maxTime = v.currentTime;
  if (v.duration) { fill.style.width = ((maxTime / v.duration) * 100) + '%'; timeEl.textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration); }
  ping(false);
});
v.addEventListener('seeking', function() { if (v.currentTime > maxTime + 1.5) v.currentTime = maxTime; });
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
        onProgress(pct);
        reportWatchProgress(itemId, msg.seconds, msg.duration).catch(() => {});
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
