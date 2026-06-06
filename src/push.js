// Web Push client: registers the push-only service worker and subscribes the
// current user so notifications arrive even when the app/tab is closed.
const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api' : 'http://localhost:5000/api';

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let _pushInit = false;

export async function initPush() {
  if (_pushInit) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!localStorage.getItem('auth_token')) return;
  _pushInit = true;
  try {
    // Server VAPID public key (push disabled server-side if absent).
    const keyRes = await fetch(`${API}/push/vapid-public`);
    const { key } = await keyRes.json();
    if (!key) { _pushInit = false; return; }

    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { _pushInit = false; return; }
    }
    if (Notification.permission !== 'granted') { _pushInit = false; return; }

    // Dedicated registration at a narrow scope so it doesn't replace the PWA SW.
    const reg = await navigator.serviceWorker.register('/push-sw.js', { scope: '/app-push/' });
    const sub = await reg.pushManager.getSubscription()
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });

    await fetch(`${API}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      body: JSON.stringify({ subscription: sub }),
    });
  } catch (err) {
    console.warn('[push] init failed', err);
    _pushInit = false;
  }
}
