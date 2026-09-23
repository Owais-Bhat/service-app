// Assign Requests — for employees granted profiles.can_assign_tickets. They
// see every open service request that came in on the portal and hand it to a
// technician, without any of the rest of the admin panel. Deliberately a
// separate, small page instead of reusing admin.js's Service Requests screen:
// that one also reads profiles/settings an employee has no access to.
import { toast, formatDateTime } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const authHeaders = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(!!body),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Anything not finished is still "open" and worth assigning / reassigning.
const CLOSED_STATUSES = new Set(['resolved', 'closed', 'case_closed', 'foc']);

const FILTERS = {
  unassigned: { label: 'Unassigned', test: (i) => !i.assigned_employee_id },
  declined: { label: 'Declined', test: (i) => i.assignment_status === 'declined' },
  assigned: { label: 'Assigned', test: (i) => !!i.assigned_employee_id && i.assignment_status !== 'declined' },
  all: { label: 'All open', test: () => true },
};

let currentFilter = 'unassigned';
let search = '';
let rows = [];

export async function renderAssignRequestsTab(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.inbox}</span>
          <span>Assign Requests</span>
        </h1>
        <p>Service requests that came in on the portal — assign each one to a technician.</p>
      </div>
      <button class="btn btn-secondary" id="ar-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      ${Object.entries(FILTERS).map(([key, f]) =>
        `<button class="btn btn-secondary ar-nav" data-filter="${key}">${f.label} <span class="ar-count" data-count="${key}"></span></button>`
      ).join('')}
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-body" style="padding:12px 16px;">
        <input type="text" id="ar-search" placeholder="Search ticket no, customer or phone…" style="width:100%;" value="${esc(search)}">
      </div>
    </div>

    <div id="ar-list"></div>
  `;

  container.querySelectorAll('.ar-nav').forEach(btn => {
    btn.onclick = () => { currentFilter = btn.dataset.filter; paint(container); };
  });
  let timer;
  container.querySelector('#ar-search').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { search = e.target.value.trim().toLowerCase(); paint(container); }, 250);
  };
  container.querySelector('#ar-refresh').onclick = () => load(container);

  load(container);
}

async function load(container) {
  const list = container.querySelector('#ar-list');
  list.innerHTML = '<p style="padding:20px;color:var(--text-dim);">Loading…</p>';
  try {
    const all = await api('GET', '/data/inquiries?select=*&order=created_at:desc');
    rows = all.filter(i => !CLOSED_STATUSES.has(String(i.status || '').toLowerCase()));
  } catch (err) {
    list.innerHTML = `<p style="padding:20px;color:var(--danger);">${esc(err.message)}</p>`;
    return;
  }
  paint(container);
}

function paint(container) {
  const list = container.querySelector('#ar-list');
  if (!list) return;
  container.querySelectorAll('.ar-nav').forEach(b => b.classList.toggle('btn-primary', b.dataset.filter === currentFilter));
  container.querySelectorAll('.ar-count').forEach(el => {
    el.textContent = `(${rows.filter(FILTERS[el.dataset.count].test).length})`;
  });

  const shown = rows.filter(FILTERS[currentFilter].test).filter(i => {
    if (!search) return true;
    return [i.ticket_no, i.full_name, i.phone, i.service_item].some(v => String(v || '').toLowerCase().includes(search));
  });

  if (!shown.length) {
    list.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:28px;color:var(--text-dim);">Nothing here right now.</div></div>`;
    return;
  }

  list.innerHTML = shown.map(i => {
    const declined = i.assignment_status === 'declined';
    const waiting = i.assigned_employee_id && i.assignment_status === 'pending';
    const state = !i.assigned_employee_id
      ? '<span class="badge badge-pending">Unassigned</span>'
      : declined
        ? '<span class="badge badge-danger">Declined</span>'
        : waiting
          ? '<span class="badge badge-pending">Waiting for employee</span>'
          : '<span class="badge badge-success">Assigned</span>';
    return `
      <div class="card" style="margin-bottom:12px;">
        <div class="card-body" style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
          <div style="flex:1;min-width:220px;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <b style="font-family:monospace;color:var(--primary);">${esc(i.ticket_no || 'No ticket')}</b>
              ${state}
            </div>
            <div style="font-weight:700;margin-top:6px;">${esc(i.full_name || 'Customer')}</div>
            <div style="font-size:0.85rem;color:var(--text-dim);">${esc(i.phone || '')}${i.service_item ? ' · ' + esc(i.service_item) : ''}</div>
            ${i.location ? `<div style="font-size:0.85rem;color:var(--text-dim);margin-top:4px;">${ICONS.pin ? '' : ''}${esc(i.location)}</div>` : ''}
            <div style="font-size:0.78rem;color:var(--text-dim);margin-top:6px;">Received ${formatDateTime(i.created_at)}${i.preferred_time ? ` · Prefers ${esc(i.preferred_time)}` : ''}</div>
            ${declined && i.decline_reason ? `<div style="font-size:0.8rem;color:var(--danger);margin-top:6px;">Declined: ${esc(i.decline_reason)}</div>` : ''}
          </div>
          <button class="btn btn-primary ar-assign" data-id="${esc(i.id)}">${ICONS.user}<span>${i.assigned_employee_id ? 'Reassign' : 'Assign'}</span></button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.ar-assign').forEach(btn => {
    btn.onclick = () => openAssignModal(btn.dataset.id, () => load(container));
  });
}

async function openAssignModal(inquiryId, onDone) {
  let ctx;
  try {
    ctx = await api('GET', `/admin/inquiries/${encodeURIComponent(inquiryId)}/manage-context`);
  } catch (err) {
    return toast(err.message, 'error');
  }
  const i = ctx.inquiry;
  // Same rule as the admin screen: only technicians who are clocked in (or
  // flagged always-assign) and not EOD-restricted can take a job.
  const selectable = ctx.employees.filter(e => (e.clockedIn && !e.restricted) || e.always_assign);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <span class="modal-title">Assign ${esc(i.ticket_no || 'request')}</span>
        <button class="modal-close" id="ar-m-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:14px;">
          <div style="font-weight:700;">${esc(i.full_name || 'Customer')}</div>
          <div style="font-size:0.85rem;color:var(--text-dim);">${esc(i.phone || '')}${i.service_item ? ' · ' + esc(i.service_item) : ''}</div>
          ${i.location ? `<div style="font-size:0.85rem;color:var(--text-dim);margin-top:4px;">${esc(i.location)}</div>` : ''}
          ${i.description ? `<div style="font-size:0.85rem;margin-top:8px;white-space:pre-wrap;">${esc(i.description)}</div>` : ''}
        </div>
        <div class="form-group">
          <label>Assign to technician</label>
          <select id="ar-m-emp">
            <option value="">— None —</option>
            ${selectable.map(e => `<option value="${esc(e.id)}"${i.assigned_employee_id === e.id ? ' selected' : ''}>${esc(e.full_name)}${e.clockedIn ? ' — clocked in' : ' — always assign'}</option>`).join('')}
          </select>
          ${selectable.length ? '' : '<small style="display:block;margin-top:8px;color:var(--danger);">No technician is clocked in right now.</small>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ar-m-cancel">Cancel</button>
        <button class="btn btn-primary" id="ar-m-save">${ICONS.check}<span>Save</span></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#ar-m-close').onclick = close;
  overlay.querySelector('#ar-m-cancel').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

  overlay.querySelector('#ar-m-save').onclick = async () => {
    const empId = overlay.querySelector('#ar-m-emp').value || null;
    const btn = overlay.querySelector('#ar-m-save');
    btn.disabled = true;
    try {
      // The server stamps assigned_at and fires the employee/customer SMS and
      // in-app notification off this same patch (see the inquiries PATCH hook).
      await api('PATCH', `/data/inquiries?eq=id:${encodeURIComponent(inquiryId)}`, {
        assigned_employee_id: empId,
        assignment_status: empId ? 'pending' : null,
        decline_reason: null,
      });
      toast(empId ? 'Assigned' : 'Assignment cleared', 'success');
      close();
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}
