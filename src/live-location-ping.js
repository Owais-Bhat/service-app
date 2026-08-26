// Foreground-only "where is this employee right now" reporting for the web
// app — mirrors mobile/src/hooks/useLiveLocationPing.ts so admin's Live
// Locations view has something current to show for browser-based employees
// too, not just the native mobile app (which most employees don't actually
// use — the web app is the primary client). Pings every 45s while the tab
// is visible and the employee is clocked in today; pauses the moment the
// tab is hidden and resumes when it's visible again. A missed ping just
// leaves a slightly stale dot for one interval.
import { supabase } from './supabase.js';

const PING_INTERVAL_MS = 45000;
const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

let intervalId = null;
let permissionDenied = false;

async function tick(userId) {
  if (permissionDenied || document.visibilityState !== 'visible') return;
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const { data: attendance } = await supabase
      .from('attendance')
      .select('clock_in,clock_out')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();
    if (!attendance?.clock_in || attendance.clock_out) return;

    if (!navigator.geolocation) { permissionDenied = true; return; }
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 30000,
      });
    }).catch((err) => {
      if (err?.code === err?.PERMISSION_DENIED) permissionDenied = true;
      return null;
    });
    if (!pos) return;

    await fetch(`${API}/live-location/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
      },
      body: JSON.stringify({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
      }),
    });
  } catch {
    // Best-effort — same as the mobile hook, a missed ping isn't worth surfacing.
  }
}

export function startLiveLocationPing(userId) {
  stopLiveLocationPing();
  if (!userId) return;
  permissionDenied = false;
  tick(userId);
  intervalId = setInterval(() => tick(userId), PING_INTERVAL_MS);
}

export function stopLiveLocationPing() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}
