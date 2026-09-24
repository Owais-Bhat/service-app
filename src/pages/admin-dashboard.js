// Admin Dashboard — one screen, no page scrolling. A row of header tabs is the
// whole control: each tab carries its own count and swaps the list below it.
// The two create buttons (service request / installation) sit in that same row.
// The calendar belongs to the Installations tab only — that is where dated work
// lives — and installations can be deleted straight from that list.
//
// Row actions reuse admin.js's existing detail modals rather than duplicating
// them, so assigning/billing behaves exactly as it does on the full tabs.
import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { toast, showLoader } from '../utils.js';
import { openInquiryDetail, openAdminRequestModal, openInstallationDetail } from './admin.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ymd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const todayKey = () => ymd(new Date());
const prettyDay = (key) => new Date(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const clock = (v) => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

const OPEN_STATUSES = new Set(['pending', 'open', 'assigned', 'in_progress', 'reopened', 'issue_not_resolved']);
const DONE_STATUSES = new Set(['resolved', 'closed', 'case_closed', 'foc']);

const TABS = [
  { key: 'requests', label: 'Service Requests', tone: 'primary' },
  { key: 'assigned', label: 'Assigned', tone: 'ok' },
  { key: 'unassigned', label: 'Unassigned', tone: 'warn' },
  { key: 'completed', label: 'Completed', tone: 'ok' },
  { key: 'online', label: 'Online Employees', tone: 'ok' },
  { key: 'installs', label: 'Installations', tone: 'info' },
  { key: 'complaints', label: 'Complaints', tone: 'danger' },
];

const state = {
  tab: 'requests',
  month: new Date(),       // Installations calendar
  day: '',                 // picked installation day
};

let data = { inquiries: [], installations: [], complaints: [], attendance: [], profiles: [] };

export async function renderAdminDashboard(container) {
  showLoader(container);
  if (container._dashChannel) { supabase.removeChannel(container._dashChannel); container._dashChannel = null; }
  if (container._dashTimer) { clearInterval(container._dashTimer); container._dashTimer = null; }

  try {
    await loadData();
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="padding:30px;text-align:center;color:var(--danger);">Could not load the dashboard — ${esc(err.message)}</div></div>`;
    return;
  }

  paintShell(container);

  container._dashChannel = supabase.channel('admin-dash')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, () => refresh(container))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'installations' }, () => refresh(container))
    .subscribe();
  container._dashTimer = setInterval(() => refresh(container), 60000);
}

async function loadData() {
  const [inq, inst, comp, att, prof] = await Promise.all([
    supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
    supabase.from('installations').select('*').order('preferred_date', { ascending: false }),
    supabase.from('complaints').select('*').order('created_at', { ascending: false }),
    supabase.from('attendance').select('*, profiles(full_name)').order('clock_in', { ascending: false }),
    supabase.from('profiles').select('id, full_name, role, phone'),
  ]);
  const firstErr = [inq, inst, comp, att, prof].find(r => r.error)?.error;
  if (firstErr && !inq.data) throw new Error(firstErr.message);
  data = {
    inquiries: inq.data || [],
    installations: inst.data || [],
    complaints: comp.data || [],
    attendance: att.data || [],
    profiles: prof.data || [],
  };
}

async function refresh(container) {
  try {
    await loadData();
  } catch { return; }
  if (!document.body.contains(container)) return;
  paintPanel(container);
}

// ── buckets ─────────────────────────────────────────
function buckets() {
  const open = data.inquiries.filter(r => OPEN_STATUSES.has(String(r.status || '').toLowerCase()));
  const today = todayKey();
  return {
    requests: open,
    assigned: open.filter(r => r.assigned_employee_id && r.assignment_status !== 'declined'),
    unassigned: open.filter(r => !r.assigned_employee_id || r.assignment_status === 'declined'),
    completed: data.inquiries.filter(r => DONE_STATUSES.has(String(r.status || '').toLowerCase())),
    online: data.attendance.filter(r => ymd(r.date || r.clock_in) === today && r.clock_in && !r.clock_out),
    installs: data.installations,
    complaints: data.complaints.filter(c => String(c.status || 'open').toLowerCase() === 'open'),
  };
}

function nameOf(id) {
  if (!id) return null;
  return data.profiles.find(p => p.id === id)?.full_name || null;
}

// ── shell ───────────────────────────────────────────
function paintShell(container) {
  container.innerHTML = `
    <div class="dash2">
      <div class="dash2-bar">
        <div class="dash2-statrow" id="dash2-tabs">
          ${TABS.map(t => `
            <button class="dash2-stat tone-${t.tone}" data-tab="${t.key}">
              <span class="dash2-stat-v" data-count="${t.key}">0</span>
              <span class="dash2-stat-l">${t.label}</span>
            </button>`).join('')}
        </div>
        <div class="dash2-actions">
          <button class="btn btn-primary btn-sm" id="dash2-new">${ICONS.plus}<span>Service Request</span></button>
          <button class="btn btn-primary btn-sm" id="dash2-newinst">${ICONS.plus}<span>Installation</span></button>
        </div>
      </div>

      <div class="dash2-grid">
        <section class="dash2-card dash2-panel">
          <div class="dash2-list" id="dash2-list"></div>
        </section>
      </div>
    </div>
  `;

  const employees = data.profiles.filter(p => p.role === 'employee').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  container.querySelector('#dash2-new').onclick = () => openAdminRequestModal(() => refresh(container));
  container.querySelector('#dash2-newinst').onclick = () => openInstallationCreateModal(employees, () => refresh(container));
  container.querySelectorAll('.dash2-stat').forEach(btn => {
    btn.onclick = () => { state.tab = btn.dataset.tab; paintPanel(container); };
  });

  paintPanel(container);
}

function rowHtml({ id, kind, title, sub, meta, badge, tone, canDelete }) {
  return `
    <div class="dash2-row" data-id="${esc(id)}" data-kind="${kind}">
      <span class="dash2-row-main">
        <span class="dash2-row-top"><b>${esc(title)}</b>${badge ? `<span class="dash2-badge tone-${tone || 'muted'}">${esc(badge)}</span>` : ''}</span>
        <span class="dash2-row-sub">${esc(sub || '')}</span>
      </span>
      <span class="dash2-row-right">
        <span class="dash2-row-meta">${esc(meta || '')}</span>
        ${canDelete ? `<button class="dash2-del" data-del="${esc(id)}" title="Delete installation">${ICONS.close}</button>` : ''}
      </span>
    </div>`;
}

function inquiryRow(r) {
  return rowHtml({
    id: r.id,
    kind: 'inquiry',
    title: r.ticket_no || 'No ticket',
    sub: [r.full_name, r.service_item, r.location].filter(Boolean).join(' · '),
    meta: `${prettyDay(r.created_at)} ${clock(r.created_at)}`,
    badge: !r.assigned_employee_id ? 'Unassigned'
      : r.assignment_status === 'declined' ? 'Declined'
        : r.assignment_status === 'pending' ? `Sent to ${nameOf(r.assigned_employee_id) || 'technician'}`
          : nameOf(r.assigned_employee_id) || 'Assigned',
    tone: !r.assigned_employee_id ? 'warn' : r.assignment_status === 'declined' ? 'danger' : 'ok',
  });
}

function paintPanel(container) {
  const list = container.querySelector('#dash2-list');
  if (!list) return;
  const b = buckets();

  container.querySelectorAll('.dash2-stat').forEach(el => el.classList.toggle('on', el.dataset.tab === state.tab));
  container.querySelectorAll('[data-count]').forEach(el => { el.textContent = (b[el.dataset.count] || []).length; });

  if (state.tab === 'installs') {
    paintInstallations(container, list, b.installs);
    return;
  }

  let rows = '';
  if (state.tab === 'requests' || state.tab === 'assigned' || state.tab === 'unassigned') {
    rows = b[state.tab].map(inquiryRow).join('');
  } else if (state.tab === 'completed') {
    rows = b.completed.slice(0, 300).map(r => rowHtml({
      id: r.id,
      kind: 'inquiry',
      title: r.ticket_no || 'No ticket',
      sub: [r.full_name, r.service_item].filter(Boolean).join(' · '),
      meta: `${prettyDay(r.updated_at || r.created_at)} ${clock(r.updated_at || r.created_at)}`,
      badge: nameOf(r.assigned_employee_id) || 'Completed',
      tone: 'ok',
    })).join('');
  } else if (state.tab === 'online') {
    rows = b.online.map(r => rowHtml({
      id: r.user_id,
      kind: 'employee',
      title: r.profiles?.full_name || nameOf(r.user_id) || 'Employee',
      sub: r.location || 'Location not recorded',
      meta: `Since ${clock(r.clock_in)}`,
      badge: 'Online',
      tone: 'ok',
    })).join('');
  } else if (state.tab === 'complaints') {
    rows = b.complaints.map(r => rowHtml({
      id: r.id,
      kind: 'complaint',
      title: r.ticket_no || 'No ticket',
      sub: r.complaint_text || '',
      meta: `${prettyDay(r.created_at)} ${clock(r.created_at)}`,
      badge: String(r.status || 'open'),
      tone: 'danger',
    })).join('');
  }

  list.innerHTML = rows || `<div class="dash2-empty">Nothing here right now.</div>`;
  bindRows(container, list);
}

// ── installations: calendar + list, with delete ─────
function paintInstallations(container, list, installations) {
  const y = state.month.getFullYear();
  const m = state.month.getMonth();
  const monthLabel = state.month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const byDay = new Map();
  installations.forEach(r => {
    const k = ymd(r.preferred_date || r.created_at);
    byDay.set(k, (byDay.get(k) || 0) + 1);
  });

  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = todayKey();
  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += '<div class="dash2-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const count = byDay.get(key) || 0;
    cells += `
      <button class="dash2-day${key === today ? ' today' : ''}${key === state.day ? ' picked' : ''}" data-day="${key}">
        <span class="dash2-daynum">${d}</span>
        <span class="dash2-dots">${count ? `<i class="dot dot-inst" title="${count} installation${count > 1 ? 's' : ''}"></i>` : ''}</span>
      </button>`;
  }

  const shown = state.day
    ? installations.filter(r => ymd(r.preferred_date || r.created_at) === state.day)
    : installations.filter(r => {
      const k = ymd(r.preferred_date || r.created_at);
      return k.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`);
    });

  list.innerHTML = `
    <div class="dash2-instwrap">
      <div class="dash2-instcal">
        <header class="dash2-head">
          <button class="dash2-navbtn" id="dash2-prev" title="Previous month">‹</button>
          <b>${esc(monthLabel)}</b>
          <button class="dash2-navbtn" id="dash2-next" title="Next month">›</button>
          <span class="dash2-spacer"></span>
          <button class="dash2-today" id="dash2-today">Today</button>
        </header>
        <div class="dash2-calbody">
          <div class="dash2-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span>${d}</span>`).join('')}</div>
          <div class="dash2-days">${cells}</div>
        </div>
      </div>
      <div class="dash2-instlist">
        <header class="dash2-head">
          <b>${state.day ? `Installations on ${esc(prettyDay(state.day))}` : `Installations in ${esc(monthLabel)}`}</b>
          <span class="dash2-spacer"></span>
          ${state.day ? '<button class="dash2-today" id="dash2-dayclear">Show whole month</button>' : ''}
        </header>
        <div class="dash2-instrows" id="dash2-instrows">
          ${shown.map(r => rowHtml({
            id: r.id,
            kind: 'installation',
            title: r.ticket_no || 'No ticket',
            sub: [r.full_name, r.installation_type, r.address].filter(Boolean).join(' · '),
            meta: `${r.preferred_date ? prettyDay(r.preferred_date) : '—'}${r.preferred_time ? ' · ' + r.preferred_time : ''}`,
            badge: nameOf(r.assigned_employee_id) || String(r.status || 'pending'),
            tone: r.assigned_employee_id ? 'ok' : 'warn',
            canDelete: true,
          })).join('') || '<div class="dash2-empty">No installations here.</div>'}
        </div>
      </div>
    </div>`;

  list.querySelectorAll('[data-day]').forEach(btn => {
    btn.onclick = () => { state.day = state.day === btn.dataset.day ? '' : btn.dataset.day; paintPanel(container); };
  });
  const prev = list.querySelector('#dash2-prev');
  const next = list.querySelector('#dash2-next');
  prev.onclick = () => { state.month = new Date(y, m - 1, 1); state.day = ''; paintPanel(container); };
  next.onclick = () => { state.month = new Date(y, m + 1, 1); state.day = ''; paintPanel(container); };
  list.querySelector('#dash2-today').onclick = () => { state.month = new Date(); state.day = todayKey(); paintPanel(container); };
  const clear = list.querySelector('#dash2-dayclear');
  if (clear) clear.onclick = () => { state.day = ''; paintPanel(container); };

  bindRows(container, list);
}

function bindRows(container, list) {
  list.querySelectorAll('.dash2-row').forEach(row => {
    row.onclick = (e) => {
      if (e.target.closest('[data-del]')) return;
      const { id, kind } = row.dataset;
      if (kind === 'inquiry') openInquiryDetail(id, () => refresh(container));
      else if (kind === 'installation') {
        const employees = data.profiles.filter(p => p.role === 'employee');
        openInstallationDetail(id, employees, () => refresh(container));
      } else if (kind === 'complaint') toast('Open the Complaints tab to reply', 'info');
    };
  });

  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.dataset.del;
      const row = data.installations.find(r => r.id === id);
      if (!row) return;
      if (!confirm(`Delete the installation for ${row.full_name || 'this customer'} on ${row.preferred_date || ''}? This cannot be undone.`)) return;
      btn.disabled = true;
      try {
        const { error } = await supabase.from('installations').delete().eq('id', id);
        if (error) throw new Error(error.message);
        toast('Installation deleted', 'success');
        await refresh(container);
      } catch (err) {
        toast(err.message || 'Could not delete', 'error');
        btn.disabled = false;
      }
    };
  });
}

// Add an installation straight from the dashboard — same row shape the
// Calendar tab writes, so both places show it immediately.
function openInstallationCreateModal(employees, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <span class="modal-title">New Installation Request</span>
        <button class="modal-close" id="inst-c">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;">
          <div class="form-group"><label>Customer Name</label><input type="text" id="inst-name" placeholder="Customer name"></div>
          <div class="form-group"><label>Phone</label><input type="tel" id="inst-phone" placeholder="10 digit mobile number"></div>
          <div class="form-group"><label>Location (city / area)</label><input type="text" id="inst-location" placeholder="e.g. Rajbagh, Srinagar"></div>
          <div class="form-group"><label>Installation Type</label><input type="text" id="inst-type" placeholder="e.g. 4 Camera CCTV"></div>
          <div class="form-group"><label>Date</label><input type="date" id="inst-date"></div>
          <div class="form-group"><label>Time</label><input type="time" id="inst-time"></div>
          <div class="form-group">
            <label>Assign Technician <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>
            <select id="inst-emp">
              <option value="">— Unassigned —</option>
              ${employees.map(e => `<option value="${esc(e.id)}">${esc(e.full_name || 'Employee')}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>Address</label><textarea id="inst-address" rows="2" placeholder="Full address / landmark"></textarea></div>
        <div class="form-group"><label>Details <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label><textarea id="inst-desc" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="inst-cancel">Cancel</button>
        <button class="btn btn-primary" id="inst-save">Save Installation</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#inst-c').onclick = close;
  $('#inst-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  $('#inst-date').value = todayKey();

  $('#inst-save').onclick = async () => {
    const name = $('#inst-name').value.trim();
    const phone = $('#inst-phone').value.trim();
    const location = $('#inst-location').value.trim();
    const address = $('#inst-address').value.trim();
    const type = $('#inst-type').value.trim();
    const date = $('#inst-date').value;
    if (!name || !phone || !location || !address || !type || !date) {
      return toast('Name, phone, location, address, type and date are required', 'warning');
    }
    const btn = $('#inst-save');
    btn.disabled = true;
    try {
      const { error } = await supabase.from('installations').insert([{
        id: crypto.randomUUID(),
        ticket_no: 'INST-' + Math.floor(100000 + Math.random() * 900000),
        full_name: name,
        phone,
        location,
        address,
        installation_type: type,
        preferred_date: date,
        preferred_time: $('#inst-time').value || 'Anytime',
        assigned_employee_id: $('#inst-emp').value || null,
        description: $('#inst-desc').value.trim() || null,
        status: 'pending',
      }]);
      if (error) throw new Error(error.message);
      toast('Installation added', 'success');
      close();
      onDone?.();
    } catch (err) {
      toast(err.message || 'Could not save the installation', 'error');
      btn.disabled = false;
    }
  };
}
