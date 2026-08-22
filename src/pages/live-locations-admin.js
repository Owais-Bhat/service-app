// Live employee locations — foreground-only pings from the mobile app while
// clocked in (mobile/src/api/liveLocation.ts -> server/index.cjs's
// /api/live-location endpoints). Not a real Supabase table, so this talks to
// the same Express API directly, same as device-tracking-admin.js's status call.
// Leaflet (`L`) is already loaded globally via a CDN <script> in index.html —
// same library openLocationMapModal() in admin.js already uses for single-pin
// location popups, so no new dependency here.
import { ICONS } from '../icons.js';
import { toast } from '../utils.js';

const API_BASE =
  window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? '/api'
    : 'http://localhost:5000/api';
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
});

const POLL_MS = 20000;
const GIG_COLOR = '#7c5cfc';
const FIXED_COLOR = '#15a05a';
// Networking Experts is based in Srinagar — sensible map center when no one
// is clocked in yet, instead of dropping the admin somewhere off Africa (0,0).
const FALLBACK_CENTER = [34.0837, 74.7973];

async function fetchLiveLocations() {
  const res = await fetch(`${API_BASE}/live-location`, { headers: authHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load locations');
  return res.json();
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

function mapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function dotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

export async function renderLiveLocationsTab(container) {
  if (container._liveLocationsPoll) {
    clearInterval(container._liveLocationsPoll);
    container._liveLocationsPoll = null;
  }
  container._llMap = null;
  container._llMarkers = [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.pin}</span>
          <span>Live Locations</span>
        </h1>
        <p>Where fixed and gig employees are right now, while clocked in. Updates every ${POLL_MS / 1000}s.</p>
      </div>
    </div>

    <div id="ll-map" style="height:420px;width:100%;border-radius:16px;overflow:hidden;border:1px solid var(--border);margin-bottom:20px;background:var(--bg-soft);"></div>

    <div id="ll-content"></div>
  `;

  const mapEl = container.querySelector('#ll-map');
  const contentEl = container.querySelector('#ll-content');

  if (typeof L === 'undefined') {
    mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);">Map failed to load</div>';
  } else {
    container._llMap = L.map(mapEl, { attributionControl: false }).setView(FALLBACK_CENTER, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(container._llMap);
    setTimeout(() => container._llMap.invalidateSize(), 50);
  }

  let firstLoad = true;

  const load = async () => {
    try {
      const rows = await fetchLiveLocations();
      renderTable(contentEl, rows);
      updateMap(container, rows, firstLoad);
      firstLoad = false;
    } catch (err) {
      toast(err.message || 'Could not load locations', 'error');
      contentEl.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger);">${err.message || 'Could not load locations'}</div></div>`;
    }
  };

  await load();

  container._liveLocationsPoll = setInterval(() => {
    if (!document.body.contains(container)) {
      clearInterval(container._liveLocationsPoll);
      container._liveLocationsPoll = null;
      return;
    }
    load();
  }, POLL_MS);
}

// Redraws markers on every poll but only re-fits the view on the FIRST load —
// otherwise the map would yank back to center under the admin while they're
// panning around to check on someone.
function updateMap(container, rows, firstLoad) {
  const map = container._llMap;
  if (!map) return;

  container._llMarkers.forEach((m) => map.removeLayer(m));
  container._llMarkers = rows.map((r) => {
    const color = r.worker_type === 'gig' ? GIG_COLOR : FIXED_COLOR;
    const marker = L.marker([r.latitude, r.longitude], { icon: dotIcon(color) }).addTo(map);
    marker.bindPopup(`
      <div style="font-family:inherit;">
        <div style="font-weight:700;font-size:0.85rem;">${r.full_name || 'Unknown'}</div>
        <div style="font-size:0.75rem;color:#666;margin-top:2px;text-transform:capitalize;">${r.worker_type || 'fixed'} · ${timeAgo(r.updated_at)}</div>
        <a href="${mapsLink(r.latitude, r.longitude)}" target="_blank" rel="noopener" style="font-size:0.75rem;color:${color};">Open in Google Maps</a>
      </div>
    `);
    return marker;
  });

  if (firstLoad && rows.length > 0) {
    const bounds = L.latLngBounds(rows.map((r) => [r.latitude, r.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }
}

function renderTable(container, rows) {
  if (rows.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="card-body" style="text-align:center;padding:48px;color:var(--text-dim);">
          <p style="font-weight:600;">No one is currently clocked in with a reported location.</p>
          <p style="font-size:0.85rem;">Locations only appear while an employee is clocked in and has the mobile app open (foreground-only — this doesn't track after they lock their phone or switch apps).</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Currently Clocked In</span>
        <span class="badge" style="background:var(--bg-soft);">${rows.length}</span>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--bg-soft);border-bottom:2px solid var(--border);">
              <th style="padding:12px 16px;text-align:left;font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-dim);">Employee</th>
              <th style="padding:12px 16px;text-align:left;font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-dim);">Type</th>
              <th style="padding:12px 16px;text-align:left;font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-dim);">Coordinates</th>
              <th style="padding:12px 16px;text-align:left;font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-dim);">Updated</th>
              <th style="padding:12px 16px;text-align:right;font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-dim);"></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:14px 16px;font-weight:700;">${r.full_name || 'Unknown'}</td>
                <td style="padding:14px 16px;text-transform:capitalize;">${r.worker_type || 'fixed'}</td>
                <td style="padding:14px 16px;font-family:monospace;font-size:0.82rem;">${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}</td>
                <td style="padding:14px 16px;color:var(--text-dim);">${timeAgo(r.updated_at)}</td>
                <td style="padding:14px 16px;text-align:right;">
                  <a class="btn btn-secondary btn-sm" href="${mapsLink(r.latitude, r.longitude)}" target="_blank" rel="noopener">Open in Maps</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
