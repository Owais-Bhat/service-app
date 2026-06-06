// Notifications page — full history with read/unread + filters.
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';

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
};

export async function renderNotificationsTab(container) {
  let items = [];
  let filter = 'all'; // all | unread | payment_received

  const fetchAll = async () => {
    const r = await fetch(`${API}/notifications`, { headers: authH() });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not load notifications');
    items = d.items || [];
  };

  const visible = () => items.filter(it => {
    if (filter === 'unread') return !it.read_at;
    if (filter === 'payment_received') return it.subject === 'payment_received';
    return true;
  });

  const draw = () => {
    const list = visible();
    const unread = items.filter(i => !i.read_at).length;
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
          <button class="btn btn-secondary" id="ntf-refresh">${ICONS.refresh}<span>Refresh</span></button>
        </div>
      </div>

      <div class="sr-filter-bar" style="margin-bottom:16px;">
        <button class="sr-filter ${filter === 'all' ? 'active' : ''}" data-f="all">All <span class="sr-filter-count">${items.length}</span></button>
        <button class="sr-filter ${filter === 'unread' ? 'active' : ''}" data-f="unread">Unread <span class="sr-filter-count">${unread}</span></button>
        <button class="sr-filter ${filter === 'payment_received' ? 'active' : ''}" data-f="payment_received">Payments <span class="sr-filter-count">${items.filter(i => i.subject === 'payment_received').length}</span></button>
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
              ${it.read_at ? '' : '<span style="width:9px;height:9px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:6px;"></span>'}
            </div>`).join('')}
      </div></div>`;

    container.querySelector('#ntf-refresh').onclick = () => load();
    container.querySelector('#ntf-readall').onclick = async () => {
      try { await fetch(`${API}/notifications/read-all`, { method: 'POST', headers: authH() }); } catch {}
      items = items.map(i => ({ ...i, read_at: i.read_at || new Date().toISOString() }));
      toast('All marked read', 'success');
      draw();
    };
    container.querySelectorAll('.sr-filter').forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
    container.querySelectorAll('.ntf-row').forEach(row => row.onclick = async () => {
      const it = items.find(i => i.id === row.dataset.id);
      if (it && !it.read_at) {
        try { await fetch(`${API}/notifications/${it.id}/read`, { method: 'POST', headers: authH() }); } catch {}
        it.read_at = new Date().toISOString();
        draw();
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
