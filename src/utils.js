// Toast notifications
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function toast(message, type = 'info', duration = 3500) {
  const container = getToastContainer();
  const el = document.createElement('div');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  el.className = `toast ${type}`;
  // Build with textContent (not innerHTML) so a message containing HTML — e.g. a
  // server error, customer name or complaint text — can never inject markup.
  // Non-string values are coerced so an accidental object shows readable text
  // instead of "[object Object]".
  const iconSpan = document.createElement('span');
  iconSpan.textContent = icons[type] || 'ℹ️';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message == null ? '' : String(message);
  el.append(iconSpan, msgSpan);
  container.appendChild(el);

  // Dismissable: auto-hide after `duration`, tap to close, or swipe away (mobile).
  let removed = false;
  const dismiss = () => {
    if (removed) return; removed = true;
    el.style.transition = '0.25s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(120%)';
    setTimeout(() => el.remove(), 260);
  };
  let startX = 0, startY = 0, dx = 0, dy = 0, swiping = false;
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; startX = t.clientX; startY = t.clientY; swiping = true; el.style.transition = 'none';
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!swiping) return;
    const t = e.touches[0]; dx = t.clientX - startX; dy = t.clientY - startY;
    if (Math.abs(dx) > Math.abs(dy)) {
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 180));
    }
  }, { passive: true });
  el.addEventListener('touchend', () => {
    swiping = false;
    if (Math.abs(dx) > 90 || dy < -60) dismiss();
    else { el.style.transition = '0.2s'; el.style.transform = ''; el.style.opacity = ''; }
    dx = 0; dy = 0;
  });
  el.addEventListener('click', dismiss);
  el.style.cursor = 'pointer';
  setTimeout(dismiss, duration);
}

function parseAppDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value || '').trim();
  if (!raw) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00\.000Z)?$/.exec(raw);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = parseAppDate(dateStr);
  if (!date) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const date = parseAppDate(dateStr);
  if (!date) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatTime(dateStr) {
  if (!dateStr) return '—';
  const date = parseAppDate(dateStr);
  if (!date) return '-';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

export function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

export function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function exportToCSV(filename, data) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const cell = row[h] === null || row[h] === undefined ? '' : String(row[h]);
      return `"${cell.replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Theme Management
export function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

export function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
  });
}

/**
 * Calculates a deadline based on working hours (10 AM - 6 PM).
 * Jammu & Kashmir working hours: 10:00 to 18:00 (8 hours per day).
 * @param {string|Date} createdAt - The starting date.
 * @param {number} slaHours - Total working hours to add (default 12).
 */
export function calculateSLA(createdAt, slaHours = 12) {
  let date = new Date(createdAt);
  let hoursRemaining = slaHours;

  const startHour = 10;
  const endHour = 18;

  while (hoursRemaining > 0) {
    const curHour = date.getHours();
    const day = date.getDay(); // 0 = Sunday

    // If it's Sunday, skip to Monday 10 AM
    if (day === 0) {
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
      continue;
    }

    // If it's before 10 AM, move to 10 AM same day
    if (curHour < startHour) {
      date.setHours(startHour, 0, 0, 0);
      continue;
    }

    // If it's after 6 PM, move to 10 AM next day
    if (curHour >= endHour) {
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
      continue;
    }

    // We are within working hours. Calculate how many hours left in current workday.
    const endOfDay = new Date(date);
    endOfDay.setHours(endHour, 0, 0, 0);
    const workdayRemainingMs = endOfDay.getTime() - date.getTime();
    const workdayRemainingHours = workdayRemainingMs / (1000 * 60 * 60);

    if (hoursRemaining <= workdayRemainingHours) {
      date.setMilliseconds(date.getMilliseconds() + hoursRemaining * 60 * 60 * 1000);
      hoursRemaining = 0;
    } else {
      hoursRemaining -= workdayRemainingHours;
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
    }
  }
  return date;
}

// Effective SLA deadline for a ticket:
//  • a rescheduled visit time (scheduled_at) overrides the computed SLA, and
//  • any time the device spent in the service centre (paused) pushes it out.
export function effectiveSLADeadline(inq) {
  if (!inq) return null;
  const base = inq.scheduled_at ? new Date(inq.scheduled_at) : calculateSLA(inq.created_at);
  let ms = base.getTime();
  ms += Number(inq.sla_pause_ms) || 0;            // already-accumulated pause
  if (inq.sla_paused_at) {                          // currently paused (device out)
    const pausedAt = new Date(inq.sla_paused_at).getTime();
    if (!Number.isNaN(pausedAt)) ms += Math.max(0, Date.now() - pausedAt);
  }
  return new Date(ms);
}

// True while the SLA clock is paused because the device is at the service centre.
export function isSlaPaused(inq) { return !!(inq && inq.sla_paused_at); }

// --- NOTIFICATIONS: sound + browser push ---
let _audioCtx = null;
function getAudioCtx() {
  if (_audioCtx) return _audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  _audioCtx = new Ctx();
  return _audioCtx;
}

// Browsers block AudioContext until a user gesture. Unlock on first interaction.
let _audioUnlocked = false;
function unlockAudio() {
  if (_audioUnlocked) return;
  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
  _audioUnlocked = true;
  window.removeEventListener('click', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
  window.removeEventListener('touchstart', unlockAudio);
}
if (typeof window !== 'undefined') {
  window.addEventListener('click', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });
}

// Play a short two-tone chime via Web Audio. type tweaks the pitch.
export function playBeep(type = 'info') {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }

  const toneMap = {
    payment: [880, 1320],
    success: [660, 990],
    info: [540, 720],
    alert: [440, 660],
  };
  const [f1, f2] = toneMap[type] || toneMap.info;
  const now = ctx.currentTime;
  [f1, f2].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain).connect(ctx.destination);
    const start = now + i * 0.16;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    osc.start(start);
    osc.stop(start + 0.24);
  });
}

// Request browser Notification permission. Safe to call repeatedly.
let _permRequested = false;
export async function ensureNotifyPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  if (_permRequested) return Notification.permission;
  _permRequested = true;
  try { return await Notification.requestPermission(); }
  catch { return Notification.permission; }
}

// Show OS-level notification (also fires when the tab is in the background).
// Falls back to in-app toast if unsupported/denied.
export function showNotification({ title, body, tag, onclick, type = 'info' }) {
  playBeep(type);
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, tag, renotify: true, silent: false });
      if (onclick) n.onclick = () => { window.focus(); onclick(); n.close(); };
      return n;
    } catch { /* fall through to toast */ }
  }
  toast(`${title}${body ? ' — ' + body : ''}`, type === 'payment' ? 'success' : type, 6000);
}

export function formatTimeRemaining(deadline) {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return `<span style="color:var(--danger);font-weight:700">OVERDUE</span>`;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `<span style="color:var(--primary);font-weight:600">${hours}h ${mins}m left</span>`;
}

export function formatSLADeadline(deadline) {
  if (!deadline) return '-';
  const d = new Date(deadline);
  const now = new Date();
  const isOverdue = d.getTime() < now.getTime();

  const day = d.getDate();
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

  const formattedDate = `${day} ${dayName} ${time}`;
  const color = isOverdue ? 'var(--danger)' : 'var(--success)';

  return `<span style="color:${color};font-weight:600;">${formattedDate}</span>`;
}

export function showLoader(container) {
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;min-height:300px;">
      <div style="text-align:center;">
        <div style="width:50px;height:50px;border:4px solid var(--border);border-top:4px solid var(--primary);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;" class="loader-spinner"></div>
        <p style="color:var(--text-dim);font-weight:600;">Loading...</p>
      </div>
    </div>
  `;
}
