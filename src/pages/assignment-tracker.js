// Assignment tracker — who has not noticed the job they were given?
//
// Every open service request and installation that has been assigned, with what
// happened to it since: the WhatsApp message (sent → delivered → read), whether the
// technician opened the job in the portal or the app, and whether they accepted.
// A job is "seen" the moment any of those has happened. "Share to group" opens
// WhatsApp with the message written; the owner picks the group and presses send.
import { toast } from '../utils.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stamp = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

const ago = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
  return `${Math.floor(h / 24)} days`;
};

const WA_CHIP = {
  not_sent: ['muted', 'Not sent'],
  sent: ['warn', 'Sent'],
  delivered: ['warn', 'Delivered'],
  read: ['ok', 'Read'],
  failed: ['danger', 'Failed'],
};

const FILTERS = [
  ['not_seen', 'Not seen'],
  ['not_accepted', 'Not accepted'],
  ['all', 'All open jobs'],
];

const state = { filter: 'not_seen' };
let data = { rows: [], counts: { all: 0, not_seen: 0, not_accepted: 0 } };
let root = null;

export async function renderAssignmentTrackerTab(container) {
  root = container;
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  await load();
}

async function load() {
  try {
    data = await api('GET', `/assignments/tracker?filter=${state.filter}`);
  } catch (err) {
    root.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint();
}

function paint() {
  const rows = data.rows;
  root.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1>Assignment Tracker</h1>
          <p>Who has noticed the job they were given — and who has not</p>
        </div>
        <div class="at2-headbtns">
          <button class="btn btn-secondary" id="at-refresh">Refresh</button>
        </div>
      </div>

      <div class="at2-tabs">
        ${FILTERS.map(([key, label]) => `
          <button class="at2-tab${state.filter === key ? ' on' : ''}" data-filter="${key}">${label}
            <span style="opacity:.75;margin-left:4px">${data.counts[key] ?? 0}</span></button>`).join('')}
      </div>

      <div class="at2-panel">
        <div class="at2-filters">
          <span class="at2-scope">A job counts as <b>seen</b> once the technician has read the WhatsApp message, opened the job in the portal/app, or accepted it.
            WhatsApp "Read" shows only if they have read receipts on — "Opened" is always reliable.</span>
        </div>
        <div class="at2-body">
          ${rows.length ? `
          <div class="table-wrap"><table class="at2-tbl">
            <thead><tr><th>Job</th><th>Technician</th><th>Waiting</th><th>WhatsApp</th><th>Opened in portal</th><th>Accepted</th><th></th></tr></thead>
            <tbody>
              ${rows.map((r) => {
    const [tone, label] = WA_CHIP[r.whatsapp.state] || ['muted', r.whatsapp.state];
    return `
                <tr${r.seen ? '' : ' style="background:rgba(245,158,11,0.07)"'}>
                  <td>
                    <b>${esc(r.ticket_no || '—')}</b> <span class="at2-chip muted">${r.kind === 'installation' ? 'Installation' : 'Service'}</span>
                    <div style="font-size:0.8rem">${esc(r.customer_name)}${r.service ? ` · ${esc(r.service)}` : ''}</div>
                    ${r.place ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(r.place)}</div>` : ''}
                  </td>
                  <td><b>${esc(r.employee_name || '—')}</b><div style="font-size:0.72rem;color:var(--text-dim)">${esc(r.employee_phone || 'no phone')}</div></td>
                  <td style="white-space:nowrap${!r.seen && (r.minutes_waiting || 0) >= 30 ? ';color:var(--danger);font-weight:700' : ''}">${esc(ago(r.minutes_waiting))}</td>
                  <td><span class="at2-chip ${tone}">${label}</span>
                    ${r.whatsapp.at ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(stamp(r.whatsapp.at))}</div>` : ''}
                    ${r.whatsapp.error ? `<div style="font-size:0.72rem;color:var(--danger)">${esc(r.whatsapp.error)}</div>` : ''}</td>
                  <td>${r.app_opened_at ? `<span class="at2-chip ok">Opened</span><div style="font-size:0.72rem;color:var(--text-dim)">${esc(stamp(r.app_opened_at))}</div>` : '<span class="at2-chip muted">Not yet</span>'}</td>
                  <td>${r.accepted ? '<span class="at2-chip ok">Accepted</span>' : '<span class="at2-chip muted">No</span>'}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-secondary btn-sm at-group" data-id="${esc(r.id)}" title="Open WhatsApp with this message written; you choose the group">Share to group</button>
                    <button class="btn btn-secondary btn-sm at-resend" data-kind="${esc(r.kind)}" data-id="${esc(r.id)}">Send WhatsApp again</button>
                  </td>
                </tr>`;
  }).join('')}
            </tbody>
          </table></div>` : `<div class="at2-empty">${state.filter === 'not_seen' ? 'Everyone has seen the jobs they were given.' : 'Nothing here.'}</div>`}
        </div>
      </div>
    </div>`;

  root.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = async () => { state.filter = b.dataset.filter; await load(); };
  });
  root.querySelector('#at-refresh').onclick = load;

  root.querySelectorAll('.at-group').forEach((b) => {
    b.onclick = () => {
      const row = rows.find((r) => r.id === b.dataset.id);
      if (!row) return;
      // No number in the link: WhatsApp then asks which chat — the group — to send it to.
      window.open(`https://wa.me/?text=${encodeURIComponent(row.group_text)}`, '_blank', 'noopener');
    };
  });

  root.querySelectorAll('.at-resend').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        await api('POST', `/assignments/${b.dataset.kind}/${b.dataset.id}/resend`);
        toast('WhatsApp sent again', 'success');
      } catch (err) { toast(err.message, 'error'); }
      await load();
    };
  });
}
