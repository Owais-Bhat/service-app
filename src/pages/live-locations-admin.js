// Live employee locations — background+foreground pings from the mobile app
// while clocked in (mobile/src/location/backgroundLocationTask.ts -> server/index.cjs's
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

const POLL_MS = 10000;
const GIG_COLOR = '#7c5cfc';
const FIXED_COLOR = '#15a05a';
// Networking Experts is based in Srinagar — sensible map center when no one
// is clocked in yet, instead of dropping the admin somewhere off Africa (0,0).
const FALLBACK_CENTER = [34.0837, 74.7973];

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes llFadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes llPulseRing { 0% { transform:scale(0.55); opacity:0.55; } 70% { opacity:0; } 100% { transform:scale(2.4); opacity:0; } }
    @keyframes llDotPop { from { transform:scale(0); } to { transform:scale(1); } }
    .ll-marker { position:relative; width:16px; height:16px; }
    .ll-marker-ring { position:absolute; inset:0; border-radius:50%; animation: llPulseRing 2.2s ease-out infinite; }
    .ll-marker-dot { position:absolute; inset:0; border-radius:50%; border:3px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.4); animation: llDotPop .3s ease; transition: box-shadow .2s ease; }
    .ll-marker.selected .ll-marker-dot { box-shadow:0 0 0 3px #fff, 0 0 0 6px rgba(0,0,0,.18), 0 2px 10px rgba(0,0,0,.45); }
    .ll-card { animation: llFadeUp .35s ease both; }
    .ll-row { cursor:pointer; transition: background .16s ease; border-left:3px solid transparent; }
    .ll-row:hover { background: var(--bg-soft); }
    .ll-row.selected { background: var(--bg-soft); border-left-color: var(--primary); }
    .ll-row td { transition: none; }
    .ll-locate-btn { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px; border:1px solid var(--border); background:var(--surface,#fff); color:var(--primary); cursor:pointer; flex-shrink:0; transition: background .15s ease, transform .1s ease; }
    .ll-locate-btn:hover { background:var(--bg-soft); }
    .ll-locate-btn:active { transform: scale(0.92); }
    .ll-fit-btn { position:absolute; bottom:12px; right:12px; z-index:1000; display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:999px; border:1px solid var(--border); background:var(--surface,#fff); color:var(--text); font-size:0.8rem; font-weight:700; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.15); transition: background .15s ease, transform .1s ease; }
    .ll-fit-btn:hover { background:var(--bg-soft); }
    .ll-fit-btn:active { transform: scale(0.96); }
    .ll-fit-btn svg { width:14px; height:14px; }
    .ll-live-badge { display:inline-flex; align-items:center; gap:6px; font-size:0.72rem; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; color:var(--success,#10b981); }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
    html: `
      <div class="ll-marker">
        <div class="ll-marker-ring" style="background:${color};"></div>
        <div class="ll-marker-dot" style="background:${color};"></div>
      </div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

function popupHtml(r, color) {
  return `
    <div style="font-family:inherit;min-width:150px;">
      <div style="font-weight:700;font-size:0.85rem;">${escapeHtml(r.full_name || 'Unknown')}</div>
      <div style="font-size:0.75rem;color:#666;margin-top:2px;text-transform:capitalize;">${escapeHtml(r.worker_type || 'fixed')} · ${timeAgo(r.updated_at)}</div>
      <a href="${mapsLink(r.latitude, r.longitude)}" target="_blank" rel="noopener" style="font-size:0.75rem;color:${color};">Open in Google Maps</a>
    </div>
  `;
}

// Eases a marker to its new position over `duration`ms instead of snapping —
// reads as continuous movement across polls, closer to Uber's live-tracking
// feel than a marker that teleports every 10s.
function animateMarkerMove(marker, toLatLng, duration = 900) {
  if (marker._llAnimFrame) cancelAnimationFrame(marker._llAnimFrame);
  const from = marker.getLatLng();
  const to = L.latLng(toLatLng);
  if (from.equals(to, 1e-7)) return;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    marker.setLatLng([from.lat + (to.lat - from.lat) * eased, from.lng + (to.lng - from.lng) * eased]);
    if (t < 1) marker._llAnimFrame = requestAnimationFrame(step);
    else marker._llAnimFrame = null;
  };
  marker._llAnimFrame = requestAnimationFrame(step);
}

// Flies the map to the given employee's marker and opens its popup — the
// "click someone, get pointed to their location" interaction. Also used by
// clicking a marker directly, so both directions stay in sync.
function locateUser(container, userId) {
  const entry = container._llMarkers?.get(userId);
  if (!entry || !container._llMap) return;
  container._selectedUserId = userId;
  container._llMap.flyTo(entry.marker.getLatLng(), Math.max(container._llMap.getZoom(), 16), { duration: 1.1 });
  entry.marker.openPopup();
  applySelection(container);
}

function applySelection(container) {
  container._llContentEl?.querySelectorAll('.ll-row').forEach((row) => {
    row.classList.toggle('selected', row.dataset.userId === container._selectedUserId);
  });
  container._llMarkers?.forEach((entry, userId) => {
    entry.marker.getElement()?.querySelector('.ll-marker')?.classList.toggle('selected', userId === container._selectedUserId);
  });
}

export async function renderLiveLocationsTab(container) {
  ensureStyles();

  if (container._liveLocationsPoll) {
    clearInterval(container._liveLocationsPoll);
    container._liveLocationsPoll = null;
  }
  container._llMap = null;
  container._llMarkers = new Map();
  container._selectedUserId = null;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.pin}</span>
          <span>Live Locations</span>
          <span class="ll-live-badge"><span class="live-dot"></span>Live</span>
        </h1>
        <p>Where fixed and gig employees are right now, while clocked in. Click anyone below to jump to them on the map. Updates every ${POLL_MS / 1000}s.</p>
      </div>
    </div>

    <div style="position:relative;margin-bottom:20px;">
      <div id="ll-map" style="height:440px;width:100%;border-radius:16px;overflow:hidden;border:1px solid var(--border);background:var(--bg-soft);"></div>
      <button type="button" class="ll-fit-btn" id="ll-fit-all" title="Fit all on screen">${ICONS.crosshair}<span>Fit all</span></button>
    </div>

    <div id="ll-content"></div>
  `;

  const mapEl = container.querySelector('#ll-map');
  const contentEl = container.querySelector('#ll-content');
  container._llContentEl = contentEl;

  if (typeof L === 'undefined') {
    mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);">Map failed to load</div>';
  } else {
    container._llMap = L.map(mapEl, { attributionControl: false }).setView(FALLBACK_CENTER, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(container._llMap);
    setTimeout(() => container._llMap.invalidateSize(), 50);
  }

  container.querySelector('#ll-fit-all').addEventListener('click', () => {
    const map = container._llMap;
    if (!map || container._llMarkers.size === 0) return;
    container._selectedUserId = null;
    applySelection(container);
    const bounds = L.latLngBounds([...container._llMarkers.values()].map((e) => e.marker.getLatLng()));
    map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 0.9 });
  });

  // Event delegation — renderTable() replaces contentEl's innerHTML on every
  // poll, so rows are (re)bound implicitly here instead of per-render.
  contentEl.addEventListener('click', (e) => {
    if (e.target.closest('.ll-maps-link')) return; // let the link navigate on its own
    const row = e.target.closest('.ll-row');
    if (row?.dataset.userId) locateUser(container, row.dataset.userId);
  });

  let firstLoad = true;

  const load = async () => {
    try {
      const rows = await fetchLiveLocations();
      renderTable(contentEl, rows, container._selectedUserId);
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

// Adds/updates/removes markers in place (never clears+recreates) so existing
// markers glide to their new position via animateMarkerMove() instead of
// flickering every poll, and the selection ring survives across updates.
function updateMap(container, rows, firstLoad) {
  const map = container._llMap;
  if (!map) return;
  const markers = container._llMarkers;
  const seen = new Set();

  rows.forEach((r) => {
    seen.add(r.user_id);
    const color = r.worker_type === 'gig' ? GIG_COLOR : FIXED_COLOR;
    const html = popupHtml(r, color);
    const existing = markers.get(r.user_id);
    if (existing) {
      animateMarkerMove(existing.marker, [r.latitude, r.longitude]);
      existing.marker.setPopupContent(html);
    } else {
      const marker = L.marker([r.latitude, r.longitude], { icon: dotIcon(color) }).addTo(map);
      marker.bindPopup(html);
      marker.on('click', () => locateUser(container, r.user_id));
      markers.set(r.user_id, { marker });
    }
  });

  for (const [userId, entry] of markers) {
    if (!seen.has(userId)) {
      if (entry.marker._llAnimFrame) cancelAnimationFrame(entry.marker._llAnimFrame);
      map.removeLayer(entry.marker);
      markers.delete(userId);
      if (container._selectedUserId === userId) container._selectedUserId = null;
    }
  }

  if (firstLoad && rows.length > 0) {
    const bounds = L.latLngBounds(rows.map((r) => [r.latitude, r.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }

  applySelection(container);
}

function renderTable(container, rows, selectedUserId) {
  if (rows.length === 0) {
    container.innerHTML = `
      <div class="card ll-card">
        <div class="card-body" style="text-align:center;padding:48px;color:var(--text-dim);">
          <p style="font-weight:600;">No one is currently clocked in with a reported location.</p>
          <p style="font-size:0.85rem;">Locations only appear while an employee is clocked in — tracking continues in the background once they clock in, even if the app isn't open.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card ll-card">
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
            ${rows.map((r, i) => `
              <tr class="ll-row${r.user_id === selectedUserId ? ' selected' : ''}" data-user-id="${escapeHtml(r.user_id)}" style="border-bottom:1px solid var(--border);animation:llFadeUp .3s ease both;animation-delay:${Math.min(i, 8) * 30}ms;">
                <td style="padding:14px 16px;font-weight:700;">${escapeHtml(r.full_name || 'Unknown')}</td>
                <td style="padding:14px 16px;text-transform:capitalize;">${escapeHtml(r.worker_type || 'fixed')}</td>
                <td style="padding:14px 16px;font-family:monospace;font-size:0.82rem;">${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}</td>
                <td style="padding:14px 16px;color:var(--text-dim);">${timeAgo(r.updated_at)}</td>
                <td style="padding:14px 16px;text-align:right;">
                  <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
                    <button type="button" class="ll-locate-btn" title="Locate on map">${ICONS.crosshair}</button>
                    <a class="btn btn-secondary btn-sm ll-maps-link" href="${mapsLink(r.latitude, r.longitude)}" target="_blank" rel="noopener">Open in Maps</a>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
