// Admin Dashboard — one screen, no page scrolling. A single filter bar at the
// top drives every panel below it (KPIs, calendar, and the queue lists), and
// the month calendar doubles as a day filter: click a date and the lists show
// only that day. Each panel scrolls inside itself so the page never does.
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
const addDays = (key, n) => { const d = new Date(key); d.setDate(d.getDate() + n); return ymd(d); };
const prettyDay = (key) => new Date(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const clock = (v) => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

const OPEN_INQUIRY_STATUSES = new Set(['pending', 'open', 'assigned', 'in_progress', 'reopened', 'issue_not_resolved']);

const PRESETS = [
  { key: 'today', label: 'Today', range: () => [todayKey(), todayKey()] },
  { key: '7d', label: '7 days', range: () => [addDays(todayKey(), -6), todayKey()] },
  { key: '30d', label: '30 days', range: () => [addDays(todayKey(), -29), todayKey()] },
  { key: 'all', label: 'All', range: () => ['', ''] },
];

// Each tab is also the KPI for that number — the count lives on the tab, so
// the filter bar carries everything and the rest of the screen is just the list.
const TABS = [
  { key: 'requests', label: 'Open requests', tone: 'primary' },
  { key: 'unassigned', label: 'Unassigned', tone: 'warn' },
  { key: 'declined', label: 'Declined', tone: 'danger' },
  { key: 'installs', label: 'Installations', tone: 'info' },
  { key: 'complaints', label: 'Complaints', tone: 'danger' },
  { key: 'team', label: 'On duty', tone: 'ok' },
];

// Filter state survives a re-render but not a reload — deliberately, so the
// dashboard always opens on today.
const state = {
  preset: '30d',
  from: '',
  to: '',
  day: '',          // set by clicking a calendar date; narrows to one day
  tech: '',
  q: '',
  tab: 'requests',
  month: new Date(),
};

let data = { inquiries: [], installations: [], complaints: [], attendance: [], profiles: [], eod: [] };

function activeRange() {
  if (state.day) return [state.day, state.day];
  if (state.preset === 'custom') return [state.from, state.to];
  return PRESETS.find(p => p.key === state.preset).range();
}

function inRange(dateValue) {
  const [from, to] = activeRange();
  if (!from && !to) return true;
  const key = ymd(dateValue);
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function matchesText(row, fields) {
  if (!state.q) return true;
  const q = state.q.toLowerCase();
  return fields.some(f => String(row[f] ?? '').toLowerCase().includes(q));
}

function filtered() {
  const tech = state.tech;
  const inquiries = data.inquiries.filter(r =>
    inRange(r.created_at) &&
    (!tech || r.assigned_employee_id === tech) &&
    matchesText(r, ['ticket_no', 'full_name', 'phone', 'service_item', 'location'])
  );
  // Installations are booked for a future date, so a "last 30 days" window
  // would hide the ones that matter most. Unless a specific day is picked,
  // anything still upcoming stays visible.
  const upcomingOk = (r) => !state.day && ymd(r.preferred_date || r.created_at) >= todayKey();
  const installations = data.installations.filter(r =>
    (inRange(r.preferred_date || r.created_at) || upcomingOk(r)) &&
    (!tech || r.assigned_employee_id === tech) &&
    matchesText(r, ['ticket_no', 'full_name', 'phone', 'installation_type', 'address'])
  );
  const complaints = data.complaints.filter(r =>
    inRange(r.created_at) && matchesText(r, ['ticket_no', 'phone', 'complaint_text'])
  );
  return { inquiries, installations, complaints };
}

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

  // Keep it live: realtime for the two tables that actually change during the
  // day, plus a slow poll as a safety net if the socket drops.
  container._dashChannel = supabase.channel('admin-dash')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, () => refresh(container))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'installations' }, () => refresh(container))
    .subscribe();
  container._dashTimer = setInterval(() => refresh(container), 60000);
}

async function loadData() {
  const [inq, inst, comp, att, prof, eod] = await Promise.all([
    supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
    supabase.from('installations').select('*').order('created_at', { ascending: false }),
    supabase.from('complaints').select('*').order('created_at', { ascending: false }),
    supabase.from('attendance').select('*, profiles(full_name)').order('clock_in', { ascending: false }),
    supabase.from('profiles').select('id, full_name, role, phone'),
    supabase.from('eod_reports').select('*').order('date', { ascending: false }),
  ]);
  const firstErr = [inq, inst, comp, att, prof, eod].find(r => r.error)?.error;
  if (firstErr && !inq.data) throw new Error(firstErr.message);
  data = {
    inquiries: inq.data || [],
    installations: inst.data || [],
    complaints: comp.data || [],
    attendance: att.data || [],
    profiles: prof.data || [],
    eod: eod.data || [],
  };
}

async function refresh(container) {
  try {
    await loadData();
  } catch { return; }
  if (!document.body.contains(container)) return;
  paintCalendar(container);
  paintPanel(container);
}

function paintShell(container) {
  const employees = data.profiles.filter(p => p.role === 'employee').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  container.innerHTML = `
    <div class="dash2">
      <div class="dash2-bar">
        <div class="dash2-presets">
          ${PRESETS.map(p => `<button class="dash2-chip" data-preset="${p.key}">${p.label}</button>`).join('')}
        </div>
        <div class="dash2-range">
          <input type="date" id="dash2-from" value="${esc(state.from)}" title="From">
          <span class="dash2-dash">–</span>
          <input type="date" id="dash2-to" value="${esc(state.to)}" title="To">
        </div>
        <!-- The month calendar lives inside the filter bar: a dropdown whose
             day dots show where the work sits, and picking a day filters the
             whole dashboard to it. -->
        <div class="dash2-calwrap">
          <button class="dash2-calbtn" id="dash2-caltoggle" title="Pick a day">
            ${ICONS.calendar || ''}<span id="dash2-callabel">Calendar</span>
          </button>
          <div class="dash2-calpop" id="dash2-calpop" hidden>
            <header class="dash2-head">
              <button class="dash2-navbtn" id="dash2-prev" title="Previous month">‹</button>
              <b id="dash2-month"></b>
              <button class="dash2-navbtn" id="dash2-next" title="Next month">›</button>
              <span class="dash2-spacer"></span>
              <button class="dash2-today" id="dash2-today">Today</button>
            </header>
            <div class="dash2-calbody" id="dash2-calbody"></div>
            <footer class="dash2-legend">
              <span><i class="dot dot-req"></i>Requests</span>
              <span><i class="dot dot-inst"></i>Installations</span>
            </footer>
          </div>
        </div>
        <select id="dash2-tech" title="Technician">
          <option value="">All technicians</option>
          ${employees.map(e => `<option value="${esc(e.id)}"${state.tech === e.id ? ' selected' : ''}>${esc(e.full_name || 'Employee')}</option>`).join('')}
        </select>
        <input type="search" id="dash2-q" placeholder="Search ticket, customer, phone…" value="${esc(state.q)}">
        <span class="dash2-spacer"></span>
        <span class="dash2-daychip" id="dash2-daychip" hidden></span>
        <button class="btn btn-secondary btn-sm" id="dash2-reset">Reset</button>
        <button class="btn btn-primary btn-sm" id="dash2-new">${ICONS.plus}<span>Service Request</span></button>
        <button class="btn btn-primary btn-sm" id="dash2-newinst">${ICONS.plus}<span>Installation</span></button>

        <div class="dash2-statrow" id="dash2-tabs">
          ${TABS.map(t => `
            <button class="dash2-stat tone-${t.tone}" data-tab="${t.key}">
              <span class="dash2-stat-v" data-count="${t.key}">0</span>
              <span class="dash2-stat-l">${t.label}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="dash2-grid">
        <section class="dash2-card dash2-panel">
          <div class="dash2-list" id="dash2-list"></div>
        </section>
      </div>
    </div>
  `;

  const $ = (sel) => container.querySelector(sel);
  container.querySelectorAll('[data-preset]').forEach(btn => {
    btn.onclick = () => {
      state.preset = btn.dataset.preset;
      state.day = '';
      const [f, t] = activeRange();
      $('#dash2-from').value = f;
      $('#dash2-to').value = t;
      repaint(container);
    };
  });
  const onCustom = () => {
    state.preset = 'custom';
    state.day = '';
    state.from = $('#dash2-from').value;
    state.to = $('#dash2-to').value;
    repaint(container);
  };
  $('#dash2-from').onchange = onCustom;
  $('#dash2-to').onchange = onCustom;
  $('#dash2-tech').onchange = (e) => { state.tech = e.target.value; repaint(container); };
  let timer;
  $('#dash2-q').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value.trim(); repaint(container); }, 250);
  };
  $('#dash2-reset').onclick = () => {
    state.preset = '30d'; state.day = ''; state.from = ''; state.to = ''; state.tech = ''; state.q = '';
    state.month = new Date();
    paintShell(container);
  };
  $('#dash2-new').onclick = () => openAdminRequestModal(() => refresh(container));
  $('#dash2-newinst').onclick = () => openInstallationCreateModal(employees, () => refresh(container));
  const pop = $('#dash2-calpop');
  $('#dash2-caltoggle').onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; };
  pop.onclick = (e) => e.stopPropagation();
  // One document-level listener per shell paint, removed when the dashboard goes.
  if (container._dashOutside) document.removeEventListener('click', container._dashOutside);
  container._dashOutside = () => { if (pop && !pop.hidden) pop.hidden = true; };
  document.addEventListener('click', container._dashOutside);
  $('#dash2-prev').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); paintCalendar(container); };
  $('#dash2-next').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); paintCalendar(container); };
  $('#dash2-today').onclick = () => {
    state.month = new Date();
    state.day = todayKey();
    repaint(container);
  };
  container.querySelectorAll('.dash2-stat').forEach(btn => {
    btn.onclick = () => { state.tab = btn.dataset.tab; paintPanel(container); };
  });

  const [f, t] = activeRange();
  $('#dash2-from').value = f;
  $('#dash2-to').value = t;
  repaint(container);
}

function repaint(container) {
  container.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', !state.day && b.dataset.preset === state.preset));
  const chip = container.querySelector('#dash2-daychip');
  if (chip) {
    chip.hidden = !state.day;
    chip.innerHTML = state.day ? `${prettyDay(state.day)} <button id="dash2-dayclear" title="Clear day">✕</button>` : '';
    const clear = container.querySelector('#dash2-dayclear');
    if (clear) clear.onclick = () => { state.day = ''; repaint(container); };
  }
  const label = container.querySelector('#dash2-callabel');
  if (label) label.textContent = state.day ? prettyDay(state.day) : 'Calendar';
  paintCalendar(container);
  paintPanel(container);
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

function paintCalendar(container) {
  const body = container.querySelector('#dash2-calbody');
  const title = container.querySelector('#dash2-month');
  if (!body) return;
  const y = state.month.getFullYear();
  const m = state.month.getMonth();
  title.textContent = state.month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Counts per day come from the unfiltered sets so the calendar keeps showing
  // where the work is even while a day filter is active.
  const reqByDay = new Map();
  const instByDay = new Map();
  data.inquiries.forEach(r => { const k = ymd(r.created_at); reqByDay.set(k, (reqByDay.get(k) || 0) + 1); });
  data.installations.forEach(r => { const k = ymd(r.preferred_date || r.created_at); instByDay.set(k, (instByDay.get(k) || 0) + 1); });

  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = todayKey();

  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += '<div class="dash2-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const req = reqByDay.get(key) || 0;
    const inst = instByDay.get(key) || 0;
    cells += `
      <button class="dash2-day${key === today ? ' today' : ''}${key === state.day ? ' picked' : ''}" data-day="${key}">
        <span class="dash2-daynum">${d}</span>
        <span class="dash2-dots">
          ${req ? `<i class="dot dot-req" title="${req} request${req > 1 ? 's' : ''}"></i>` : ''}
          ${inst ? `<i class="dot dot-inst" title="${inst} installation${inst > 1 ? 's' : ''}"></i>` : ''}
        </span>
      </button>`;
  }

  body.innerHTML = `
    <div class="dash2-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span>${d}</span>`).join('')}</div>
    <div class="dash2-days">${cells}</div>`;

  body.querySelectorAll('[data-day]').forEach(btn => {
    btn.onclick = () => {
      state.day = state.day === btn.dataset.day ? '' : btn.dataset.day;
      const pop = container.querySelector('#dash2-calpop');
      if (pop) pop.hidden = true;
      repaint(container);
    };
  });
}

function nameOf(id) {
  if (!id) return null;
  return data.profiles.find(p => p.id === id)?.full_name || null;
}

function rowHtml({ id, kind, title, sub, meta, badge, tone }) {
  return `
    <button class="dash2-row" data-id="${esc(id)}" data-kind="${kind}">
      <span class="dash2-row-main">
        <span class="dash2-row-top"><b>${esc(title)}</b>${badge ? `<span class="dash2-badge tone-${tone || 'muted'}">${esc(badge)}</span>` : ''}</span>
        <span class="dash2-row-sub">${esc(sub || '')}</span>
      </span>
      <span class="dash2-row-meta">${esc(meta || '')}</span>
    </button>`;
}

function paintPanel(container) {
  const list = container.querySelector('#dash2-list');
  if (!list) return;
  const { inquiries, installations, complaints } = filtered();
  const open = inquiries.filter(r => OPEN_INQUIRY_STATUSES.has(String(r.status || '').toLowerCase()));
  const unassigned = open.filter(r => !r.assigned_employee_id);
  const declined = inquiries.filter(r => r.assignment_status === 'declined');
  const openComplaints = complaints.filter(c => String(c.status || 'open').toLowerCase() === 'open');
  const today = todayKey();
  const onDuty = data.attendance.filter(r => ymd(r.date || r.clock_in) === today && r.clock_in && !r.clock_out);

  const counts = {
    requests: open.length,
    unassigned: unassigned.length,
    declined: declined.length,
    installs: installations.length,
    complaints: openComplaints.length,
    team: onDuty.length,
  };
  container.querySelectorAll('.dash2-stat').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  container.querySelectorAll('[data-count]').forEach(el => { el.textContent = counts[el.dataset.count] ?? 0; });

  let rows = '';
  if (state.tab === 'requests' || state.tab === 'unassigned' || state.tab === 'declined') {
    const src = state.tab === 'unassigned' ? unassigned : state.tab === 'declined' ? declined : open;
    rows = src.map(r => rowHtml({
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
    })).join('');
  } else if (state.tab === 'installs') {
    rows = installations.map(r => rowHtml({
      id: r.id,
      kind: 'installation',
      title: r.ticket_no || 'No ticket',
      sub: [r.full_name, r.installation_type, r.address].filter(Boolean).join(' · '),
      meta: `${r.preferred_date ? prettyDay(r.preferred_date) : '—'}${r.preferred_time ? ' · ' + r.preferred_time : ''}`,
      badge: nameOf(r.assigned_employee_id) || String(r.status || 'pending'),
      tone: r.assigned_employee_id ? 'ok' : 'warn',
    })).join('');
  } else if (state.tab === 'complaints') {
    rows = openComplaints.map(r => rowHtml({
      id: r.id,
      kind: 'complaint',
      title: r.ticket_no || 'No ticket',
      sub: r.complaint_text || '',
      meta: `${prettyDay(r.created_at)} ${clock(r.created_at)}`,
      badge: String(r.status || 'open'),
      tone: String(r.status || 'open').toLowerCase() === 'open' ? 'danger' : 'ok',
    })).join('');
  } else {
    const missingEod = data.attendance
      .filter(r => ymd(r.date || r.clock_in) === today && r.clock_in)
      .filter(r => !data.eod.some(e => e.employee_id === r.user_id && ymd(e.date) === today));
    rows = onDuty.map(r => rowHtml({
      id: r.user_id,
      kind: 'employee',
      title: r.profiles?.full_name || nameOf(r.user_id) || 'Employee',
      sub: r.location || 'Location not recorded',
      meta: `Since ${clock(r.clock_in)}`,
      badge: 'On duty',
      tone: 'ok',
    })).join('');
    if (missingEod.length) {
      rows += `<div class="dash2-subhead">EOD not submitted today (${missingEod.length})</div>` + missingEod.map(r => rowHtml({
        id: r.user_id,
        kind: 'employee',
        title: r.profiles?.full_name || nameOf(r.user_id) || 'Employee',
        sub: 'No end-of-day report yet',
        meta: clock(r.clock_in),
        badge: 'EOD due',
        tone: 'warn',
      })).join('');
    }
  }

  list.innerHTML = rows || `<div class="dash2-empty">Nothing here for this filter.</div>`;

  list.querySelectorAll('.dash2-row').forEach(btn => {
    btn.onclick = () => {
      const { id, kind } = btn.dataset;
      if (kind === 'inquiry') openInquiryDetail(id, () => refresh(container));
      else if (kind === 'installation') {
        const employees = data.profiles.filter(p => p.role === 'employee');
        openInstallationDetail(id, employees, () => refresh(container));
      } else if (kind === 'complaint') toast('Open the Complaints tab to reply', 'info');
    };
  });
}
