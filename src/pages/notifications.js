// Notifications page — full history with read/unread + filters.
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';
import { openNotificationDetail } from '../notify-center.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api' : 'http://localhost:5000/api';
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); };

const SUBJECT_ICON = {
  payment_received: '💰',
  new_assignment: '📋',
  new_service_request: '🆕',
  device_followup_reminder: '🔧',
  new_complaint: '⚠️',
  sla_breach: '⏰',
  finance_summary: '📊',
};

// Subject → page navigation (role-aware).
const NAV_MAP = {
  new_service_request:     { admin: 'inquiries',         employee: 'all-tickets' },
  new_assignment:          { admin: 'inquiries',         employee: 'all-tickets' },
  job_completed:           { admin: 'inquiries',         employee: 'all-tickets' },
  sla_breach:              { admin: 'inquiries',         employee: 'all-tickets' },
  payment_received:        { admin: 'payments',          employee: 'all-tickets' },
  cash_collected:          { admin: 'cash',              employee: 'my-cash'     },
  new_complaint:           { admin: 'complaints' },
  device_status:           { admin: 'device-tracking',  employee: 'dashboard'   },
  device_followup_reminder:{ admin: 'device-tracking',  employee: 'dashboard'   },
  notice_posted:           { employee: 'dashboard' },
  training_added:          { admin: 'training-courses',  employee: 'my-training-courses' },
  leave_approved:          { employee: 'my-leaves' },
  leave_rejected:          { employee: 'my-leaves' },
  leave_request:           { admin: 'leaves' },
  eod_warning:             { employee: 'my-eod' },
  leaderboard_rank:        { employee: 'leaderboard' },
  finance_summary:         { admin: 'finance' },
};

function navTarget(subject) {
  const role = window.__appRole || 'employee';
  const map = NAV_MAP[subject];
  if (!map) return null;
  return map[role] || map.admin || map.employee || null;
}

// Subjects that are device-tracking-only — filtered when feature is off.
const DEVICE_SUBJECTS = new Set(['device_status', 'device_followup_reminder']);

export async function renderNotificationsTab(container) {
  let items = [];
  let filter = 'all'; // all | unread | payment_received
  let deviceTrackingEnabled = true; // default to showing; overridden by fetch

  const fetchAll = async () => {
    const [notifRes, dtRes] = await Promise.all([
      fetch(`${API}/notifications`, { headers: authH() }),
      fetch(`${API}/settings/device-tracking`, { headers: authH() }).catch(() => null),
    ]);
    const d = await notifRes.json();
    if (!notifRes.ok) throw new Error(d.error || 'Could not load notifications');
    items = d.items || [];

    if (dtRes && dtRes.ok) {
      const dtData = await dtRes.json();
      deviceTrackingEnabled = dtData?.enabled !== false;
    }
  };

  const visibleItems = () => {
    return items.filter(it => {
      // Hide device notifications when device tracking is disabled.
      if (!deviceTrackingEnabled && DEVICE_SUBJECTS.has(it.subject)) return false;
      if (filter === 'unread') return !it.read_at;
      if (filter === 'payment_received') return it.subject === 'payment_received';
      return true;
    });
  };

  const draw = () => {
    const list = visibleItems();
    // Count unread and payment from all items (respecting device filter).
    const allVisible = items.filter(it => deviceTrackingEnabled || !DEVICE_SUBJECTS.has(it.subject));
    const unread = allVisible.filter(i => !i.read_at).length;
    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1 style="display:flex;align-items:center;gap:10px;">
            <span style="width:24px;height:24px;display:inline-flex;color:var(--primary);">${ICONS.bell}</span>
            <span>Notifications</span>
          </h1>
          <p>Payments (cash & online), assignments, reminders and more</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="ntf-readall">Mark all read</button>
        </div>
      </div>

      <div class="sr-filter-bar" style="margin-bottom:16px;">
        <button class="sr-filter ${filter === 'all' ? 'active' : ''}" data-f="all">All <span class="sr-filter-count">${allVisible.length}</span></button>
        <button class="sr-filter ${filter === 'unread' ? 'active' : ''}" data-f="unread">Unread <span class="sr-filter-count">${unread}</span></button>
        <button class="sr-filter ${filter === 'payment_received' ? 'active' : ''}" data-f="payment_received">Payments <span class="sr-filter-count">${allVisible.filter(i => i.subject === 'payment_received').length}</span></button>
      </div>

      <div class="card"><div class="card-body" style="padding:0;">
        ${list.length === 0
          ? '<div style="text-align:center;padding:48px;color:var(--text-dim)">No notifications</div>'
          : list.map(it => `
            <div class="ntf-row ${it.read_at ? '' : 'unread'}" data-id="${it.id}" style="display:flex;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border);cursor:pointer;">
              <div style="font-size:1.4rem;line-height:1;">${SUBJECT_ICON[it.subject] || '🔔'}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:0.92rem;">${esc(it.title || 'Update')}</div>
                <div style="font-size:0.86rem;color:var(--text-soft);margin-top:2px;">${esc(it.body || '')}</div>
                <div style="font-size:0.74rem;color:var(--text-dim);margin-top:6px;">${fmt(it.created_at)}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
                ${it.read_at ? '' : '<span style="width:9px;height:9px;border-radius:50%;background:var(--primary);margin-top:6px;"></span>'}
                ${navTarget(it.subject) ? '<span style="font-size:0.72rem;color:var(--primary);white-space:nowrap;">Go to →</span>' : ''}
              </div>
            </div>`).join('')}
      </div></div>`;

    container.querySelector('#ntf-readall').onclick = async () => {
      try { await fetch(`${API}/notifications/read-all`, { method: 'POST', headers: authH() }); } catch {}
      items = items.map(i => ({ ...i, read_at: i.read_at || new Date().toISOString() }));
      toast('All marked read', 'success');
      draw();
    };
    container.querySelectorAll('.sr-filter').forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
    container.querySelectorAll('.ntf-row').forEach(row => row.onclick = async () => {
      const it = items.find(i => i.id === row.dataset.id);
      if (!it) return;

      // Mark as read first.
      if (!it.read_at) {
        try { await fetch(`${API}/notifications/${it.id}/read`, { method: 'POST', headers: authH() }); } catch {}
        it.read_at = new Date().toISOString();
        draw();
      }

      // Navigate to the relevant page if we know where to go.
      const target = navTarget(it.subject);
      if (target && window.__appNav) {
        window.__appNav(target);
      } else {
        // Fallback: show full detail modal for subjects with no page target.
        openNotificationDetail(it);
      }
    });
  };

  const load = async () => {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim)">Loading…</div>';
    try { await fetchAll(); draw(); }
    catch (err) { container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${esc(err.message)}</div></div>`; }
  };

  await load();
}
