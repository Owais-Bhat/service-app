// Notification Center — human-voice announcements + full-screen detail view.
// Used app-wide so every notification (bell, notifications page, live push)
// can: (1) speak a short human-voice line, (2) open a full-screen card with
// every detail when tapped.
import { ICONS } from './icons.js';

const VOICE_KEY = 'voice_alerts';            // '0' to mute voice
const inr = (v) => Math.round(Number(v) || 0).toLocaleString('en-IN');

// Subject → page navigation (role-aware) — mirrors notifications.js NAV_MAP.
const NAV_MAP = {
  new_service_request:      { admin: 'inquiries',          employee: 'all-tickets' },
  new_assignment:           { admin: 'inquiries',          employee: 'all-tickets' },
  job_completed:            { admin: 'inquiries',          employee: 'all-tickets' },
  sla_breach:               { admin: 'inquiries',          employee: 'all-tickets' },
  payment_received:         { admin: 'payments',           employee: 'all-tickets' },
  cash_collected:           { admin: 'cash',               employee: 'my-cash'     },
  new_complaint:            { admin: 'complaints' },
  device_status:            { admin: 'device-tracking',   employee: 'dashboard'   },
  device_followup_reminder: { admin: 'device-tracking',   employee: 'dashboard'   },
  notice_posted:            { employee: 'dashboard' },
  training_added:           { admin: 'training-courses',   employee: 'my-training-courses' },
  leave_approved:           { employee: 'my-leaves' },
  leave_rejected:           { employee: 'my-leaves' },
  leave_request:            { admin: 'leaves' },
  eod_warning:              { employee: 'my-eod' },
  leaderboard_rank:         { employee: 'leaderboard' },
  finance_summary:          { admin: 'finance' },
};

function navTarget(subject) {
  const role = window.__appRole || 'employee';
  const map = NAV_MAP[subject];
  if (!map) return null;
  return map[role] || map.admin || map.employee || null;
}

// Per-subject display + spoken-line config. {voice} receives the notification
// payload (subject, title, body, data) and returns the sentence to speak.
const SUBJECTS = {
  payment_received: {
    icon: '💰', label: 'Payment Received',
    voice: (m) => m.data?.amount
      ? `Rupees ${inr(m.data.amount)} has been received${m.data?.ticket_no ? ` on ticket ${m.data.ticket_no}` : ''}.`
      : 'A payment has been received.',
  },
  cash_collected: {
    icon: '🧾', label: 'Cash Collected',
    voice: (m) => m.data?.amount
      ? `Rupees ${inr(m.data.amount)} cash has been collected by admin.`
      : 'Cash has been collected by admin.',
  },
  new_assignment: { icon: '📋', label: 'New Assignment', voice: () => 'A new service has been assigned to you.' },
  new_service_request: { icon: '🆕', label: 'New Service Request', voice: () => 'A new service request has arrived.' },
  new_complaint: { icon: '⚠️', label: 'New Complaint', voice: () => 'A new complaint has been filed.' },
  sla_breach: { icon: '⏰', label: 'Overdue', voice: (m) => m.body || 'A ticket is overdue.' },
  overdue: { icon: '⏰', label: 'Overdue', voice: (m) => m.body || 'A ticket is overdue.' },
  job_completed: { icon: '✅', label: 'Job Completed', voice: (m) => m.body || 'A job has been completed.' },
  device_status: { icon: '🔧', label: 'Device Update', voice: (m) => m.body || 'Device repair status updated.' },
  device_followup_reminder: { icon: '🔧', label: 'Device Follow-up', voice: () => 'You have a device follow-up reminder.' },
  notice_posted: { icon: '📢', label: 'New Notice', voice: (m) => `New notice. ${m.title || ''}` },
  leaderboard_rank: { icon: '🏆', label: 'Leaderboard', voice: (m) => m.body || 'You are first on the leaderboard this month.' },
  training_added: { icon: '🎓', label: 'Training Added', voice: (m) => m.title ? `New training added. ${m.title}` : 'A new training program has been added.' },
  leave_approved: { icon: '✅', label: 'Leave Approved', voice: () => 'Your leave request has been approved.' },
  leave_rejected: { icon: '🚫', label: 'Leave Rejected', voice: () => 'Your leave request has been rejected.' },
  leave_request: { icon: '🌴', label: 'Leave Request', voice: (m) => m.body || 'A new leave request needs your approval.' },
  eod_warning: { icon: '📝', label: 'EOD Reminder', voice: () => 'Reminder. Please submit your end of day report.' },
  employee_clock_in: { icon: '🟢', label: 'Clock In', voice: (m) => m.body || 'An employee clocked in.' },
  employee_clock_out: { icon: '🔴', label: 'Clock Out', voice: (m) => m.body || 'An employee clocked out.' },
  finance_summary: { icon: '📊', label: 'Finance Summary', voice: () => 'The daily finance summary is ready.' },
  feedback_received: { icon: '⭐', label: 'Feedback', voice: () => 'New customer feedback received.' },
};

export function subjectIcon(subject) { return SUBJECTS[subject]?.icon || '🔔'; }
export function subjectLabel(subject) { return SUBJECTS[subject]?.label || 'Notification'; }

// ── Voice ────────────────────────────────────────────────────────
let _voicePrimed = false;
let _pickedVoice = null;

function pickVoice() {
  if (_pickedVoice || typeof speechSynthesis === 'undefined') return _pickedVoice;
  const voices = speechSynthesis.getVoices() || [];
  _pickedVoice =
    voices.find(v => /en-IN/i.test(v.lang)) ||
    voices.find(v => /en-GB/i.test(v.lang)) ||
    voices.find(v => /^en/i.test(v.lang)) ||
    voices[0] || null;
  return _pickedVoice;
}

// Browsers load voices async — refresh the pick when they arrive.
if (typeof speechSynthesis !== 'undefined') {
  try { speechSynthesis.onvoiceschanged = () => { _pickedVoice = null; pickVoice(); }; } catch {}
}

// Speech must be unlocked by a user gesture on some browsers. Call once early.
export function primeVoice() {
  if (_voicePrimed || typeof speechSynthesis === 'undefined') return;
  _voicePrimed = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0; speechSynthesis.speak(u);
  } catch {}
}
document.addEventListener('click', primeVoice, { once: true });
document.addEventListener('touchstart', primeVoice, { once: true });

export function voiceEnabled() { return localStorage.getItem(VOICE_KEY) !== '0'; }
export function setVoiceEnabled(on) { localStorage.setItem(VOICE_KEY, on ? '1' : '0'); }

// Speak the human-voice line for a notification payload.
export function speak(msg) {
  if (!voiceEnabled() || typeof speechSynthesis === 'undefined') return;
  let line = msg?.data?.voice;                       // server-provided line wins
  if (!line) {
    const cfg = SUBJECTS[msg?.subject];
    line = cfg ? cfg.voice(msg) : (msg?.title ? `${msg.title}. ${msg.body || ''}` : (msg?.body || ''));
  }
  if (!line || !String(line).trim()) return;
  try {
    const u = new SpeechSynthesisUtterance(String(line).slice(0, 240));
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = (v && v.lang) || 'en-IN';
    u.rate = 1; u.pitch = 1; u.volume = 1;
    // Cancel any queued speech so alerts don't pile up.
    try { speechSynthesis.cancel(); } catch {}
    speechSynthesis.speak(u);
  } catch {}
}

// ── Full-screen detail ───────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }); };

// item: a notification record { subject, title, body, created_at, data }.
export function openNotificationDetail(item) {
  if (!item) return;
  let data = item.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  data = data || {};

  // Build a readable detail list from the data payload (skip internal keys).
  const SKIP = new Set(['voice', 'url']);
  const PRETTY = {
    amount: 'Amount', ticket_no: 'Ticket', customer: 'Customer', employee: 'Employee',
    payment_method: 'Payment Mode', status: 'Status', service: 'Service', company: 'Company',
  };
  const rows = Object.entries(data)
    .filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const label = PRETTY[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const val = (k === 'amount') ? `₹${inr(v)}` : esc(v);
      return `<div class="ntf-detail-row"><span class="ntf-detail-k">${esc(label)}</span><span class="ntf-detail-v">${val}</span></div>`;
    }).join('');

  document.querySelectorAll('.ntf-fullscreen').forEach(el => el.remove());
  const overlay = document.createElement('div');
  overlay.className = 'ntf-fullscreen';
  overlay.innerHTML = `
    <div class="ntf-fullscreen-card">
      <button class="ntf-fullscreen-close" aria-label="Close">×</button>
      <div class="ntf-fullscreen-icon">${subjectIcon(item.subject)}</div>
      <div class="ntf-fullscreen-kicker">${esc(subjectLabel(item.subject))}</div>
      <h2 class="ntf-fullscreen-title">${esc(item.title || 'Notification')}</h2>
      ${item.body ? `<p class="ntf-fullscreen-body">${esc(item.body)}</p>` : ''}
      ${rows ? `<div class="ntf-detail-list">${rows}</div>` : ''}
      <div class="ntf-fullscreen-time">${fmt(item.created_at || Date.now())}</div>
      <div class="ntf-fullscreen-actions">
        ${data.url ? `<a class="btn btn-primary" href="${esc(data.url)}">Open</a>` : ''}
        ${navTarget(item.subject) ? `<button class="btn btn-primary ntf-goto-btn">Go to page →</button>` : ''}
        <button class="btn btn-secondary ntf-fullscreen-dismiss">Dismiss</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.ntf-fullscreen-close').onclick = close;
  overlay.querySelector('.ntf-fullscreen-dismiss').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  const gotoBtn = overlay.querySelector('.ntf-goto-btn');
  if (gotoBtn) {
    gotoBtn.onclick = () => {
      const target = navTarget(item.subject);
      if (target && window.__appNav) { close(); window.__appNav(target); }
    };
  }
}
