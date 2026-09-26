// Installations — the same screen shape as Attendance and Service Requests:
// counters on top, three in-page tabs, one filter row, work grouped per
// technician with an expandable table, and a month calendar on the right that
// doubles as a day filter. Installations are booked for a date, so the
// calendar reads preferred_date and upcoming jobs stay visible.
import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { showLoader, toast, exportToCSV } from '../utils.js';
const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';
const authHeaders = (json = false) => {
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
const ymd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const dayLabel = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const initials = (n) => String(n || '?').trim().charAt(0).toUpperCase();

const STATES = [
  { key: 'pending', label: 'Pending', cls: 'danger' },
  { key: 'assigned', label: 'Assigned', cls: 'warn' },
  { key: 'in_progress', label: 'In Progress', cls: 'ok' },
  { key: 'completed', label: 'Completed', cls: 'ok' },
  { key: 'cancelled', label: 'Cancelled', cls: 'muted' },
];
const STATE_CHIP = Object.fromEntries(STATES.map(s => [s.key, { label: s.label, cls: s.cls }]));

function stateOf(r) {
  const st = String(r.status || 'pending').toLowerCase();
  if (['completed', 'done'].includes(st)) return 'completed';
  if (st === 'cancelled') return 'cancelled';
  if (st === 'in_progress') return 'in_progress';
  if (r.assigned_employee_id) return 'assigned';
  return 'pending';
}

const TABS = [
  { key: 'installs', label: 'Installations' },
  { key: 'logs', label: 'Installation Logs' },
  { key: 'reports', label: 'Reports' },
];

const state = {
  tab: 'installs',
  from: '',
  to: '',
  employee: '',
  status: '',
  q: '',
  month: new Date(),
  day: '',
  expanded: null,
};

let data = { rows: [], employees: [] };

export async function renderInstallationsAdminTab(container) {
  showLoader(container);
  if (!state.from) {
    const d = new Date();
    state.from = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
    // Installations are booked ahead, so the default window runs to month end.
    state.to = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  try {
    const [inst, prof] = await Promise.all([
      supabase.from('installations').select('*').order('preferred_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role').eq('role', 'employee'),
    ]);
    data = { rows: inst.data || [], employees: prof.data || [] };
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

function decorated() {
  const nameById = new Map(data.employees.map(e => [e.id, e.full_name]));
  return data.rows
    .map(r => ({
      ...r,
      date: ymd(r.preferred_date || r.created_at),
      tech: r.assigned_employee_id ? (nameById.get(r.assigned_employee_id) || 'Employee') : 'Unassigned',
      techId: r.assigned_employee_id || 'unassigned',
      state: stateOf(r),
    }))
    .filter(r => r.date && (!state.from || r.date >= state.from) && (!state.to || r.date <= state.to))
    .filter(r => !state.employee || r.techId === state.employee)
    .filter(r => !state.status || r.state === state.status)
    .filter(r => !state.q || `${r.ticket_no || ''} ${r.full_name || ''} ${r.phone || ''} ${r.installation_type || ''} ${r.address || ''} ${r.location || ''}`.toLowerCase().includes(state.q.toLowerCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function perTech(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!map.has(r.techId)) map.set(r.techId, { id: r.techId, name: r.tech, rows: [], pending: 0, done: 0, upcoming: 0 });
    const t = map.get(r.techId);
    t.rows.push(r);
    if (r.state === 'pending') t.pending++;
    if (r.state === 'completed') t.done++;
    if (r.date >= ymd(new Date()) && r.state !== 'completed' && r.state !== 'cancelled') t.upcoming++;
  });
  return [...map.values()].sort((a, b) => b.rows.length - a.rows.length);
}

const pct = (n, total) => total ? `${Math.round((n / total) * 100)}%` : '';

function paint(container) {
  const rows = decorated();
  const techs = perTech(rows);
  const total = rows.length;
  const count = (key) => rows.filter(r => r.state === key).length;
  const today = ymd(new Date());
  const todayCount = rows.filter(r => r.date === today).length;

  container.innerHTML = `
    <div class="at2">
      <div class="page-header">
        <div>
          <h1>Installations</h1>
          <p>Track and manage every installation booking easily</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="in2-export">${ICONS.download}<span>Export</span></button>
          <button class="btn btn-primary" id="in2-new">${ICONS.plus}<span>New Installation</span></button>
        </div>
      </div>

      <div class="at2-kpis">
        ${kpi(ICONS.box, total, 'Total Installations', '', 'muted')}
        ${kpi(ICONS.alert, count('pending'), 'Pending', pct(count('pending'), total), 'red')}
        ${kpi(ICONS.user, count('assigned'), 'Assigned', pct(count('assigned'), total), 'amber')}
        ${kpi(ICONS.calendar, todayCount, 'Scheduled Today', '', 'green')}
        ${kpi(ICONS.check, count('completed'), 'Completed', pct(count('completed'), total), 'green')}
      </div>

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-in2tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="card at2-filters">
        <div class="card-body">
          <div class="form-group"><label>Technician</label>
            <select id="in2-emp">
              <option value="">All technicians</option>
              <option value="unassigned"${state.employee === 'unassigned' ? ' selected' : ''}>Unassigned</option>
              ${data.employees.map(e => `<option value="${esc(e.id)}"${state.employee === e.id ? ' selected' : ''}>${esc(e.full_name || 'Employee')}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Status</label>
            <select id="in2-status">
              <option value="">All</option>
              ${STATES.map(st => `<option value="${st.key}"${state.status === st.key ? ' selected' : ''}>${st.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>From</label><input type="date" id="in2-from" value="${esc(state.from)}"></div>
          <div class="form-group"><label>To</label><input type="date" id="in2-to" value="${esc(state.to)}"></div>
          <div class="form-group"><label>Search</label><input type="search" id="in2-q" placeholder="Ticket, customer, type…" value="${esc(state.q)}"></div>
        </div>
      </div>

      <div id="in2-body"></div>
    </div>
  `;

  const $ = (s) => container.querySelector(s);
  container.querySelectorAll('[data-in2tab]').forEach(b => { b.onclick = () => { state.tab = b.dataset.in2tab; paint(container); }; });
  $('#in2-emp').onchange = (e) => { state.employee = e.target.value; paint(container); };
  $('#in2-status').onchange = (e) => { state.status = e.target.value; paint(container); };
  $('#in2-from').onchange = (e) => { state.from = e.target.value; paint(container); };
  $('#in2-to').onchange = (e) => { state.to = e.target.value; paint(container); };
  let t;
  $('#in2-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); paint(container); }, 250); };
  $('#in2-new').onclick = () => openCreateModal(container);
  $('#in2-export').onclick = () => exportRows(rows, techs);

  const body = $('#in2-body');
  if (state.tab === 'installs') paintInstalls(container, body, rows, techs);
  else if (state.tab === 'logs') paintLogs(container, body, rows);
  else paintReports(body, techs, rows);
}

function kpi(icon, value, label, note, tone) {
  return `
    <div class="at2-kpi">
      <span class="at2-kpi-ico tone-${tone}">${icon || ''}</span>
      <div>
        <div class="at2-kpi-label">${esc(label)}</div>
        <div class="at2-kpi-value tone-${tone}">${value}${note ? ` <small>(${note})</small>` : ''}</div>
      </div>
    </div>`;
}

function rowHtml(r) {
  const chip = STATE_CHIP[r.state] || STATE_CHIP.pending;
  return `
    <tr data-open="${esc(r.id)}" style="cursor:pointer">
      <td style="font-family:monospace;white-space:nowrap">${esc(r.ticket_no || '—')}</td>
      <td>${esc(r.full_name || 'Customer')}${r.phone ? `<div style="font-size:0.75rem;color:var(--text-dim)">${esc(r.phone)}</div>` : ''}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.installation_type || '')}">${esc(r.installation_type || '—')}</td>
      <td style="white-space:nowrap">${esc(dayLabel(r.preferred_date))}<div style="font-size:0.75rem;color:var(--text-dim)">${esc(r.preferred_time || 'Anytime')}</div></td>
      <td><span class="at2-chip ${chip.cls}">${chip.label}</span></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.address || '')}">${esc(r.address || r.location || '—')}</td>
      <td style="white-space:nowrap">
        <button class="at2-photo in2-del" data-del="${esc(r.id)}" title="Delete installation">${ICONS.close}</button>
      </td>
    </tr>`;
}

function paintInstalls(container, body, rows, techs) {
  body.innerHTML = `
    <div class="at2-cards">
      ${techs.map(t => `
        <div class="at2-empcard">
          <div class="at2-empcard-top">
            <span class="at2-avatar">${esc(initials(t.name))}</span>
            <div><b>${esc(t.name)}</b><small>${t.rows.length} installation${t.rows.length === 1 ? '' : 's'}</small></div>
          </div>
          <div class="at2-empstats">
            <span><i class="dot tone-danger"></i>Pending<b>${t.pending}</b></span>
            <span><i class="dot tone-ok"></i>Completed<b>${t.done}</b></span>
            <span><i class="dot tone-warn"></i>Upcoming<b>${t.upcoming}</b></span>
            <span><i class="dot tone-pink"></i>Total<b>${t.rows.length}</b></span>
          </div>
        </div>`).join('') || '<div class="at2-empty">No installations in this range.</div>'}
    </div>

    <div class="at2-split">
      <div class="card">
        <div class="card-header"><span class="card-title">Installation Details</span></div>
        <div class="at2-details">
          ${techs.map(t => {
            const open = !state.expanded || state.expanded.has(t.id);
            return `
              <div class="at2-group">
                <button class="at2-group-head" data-toggle="${esc(t.id)}">
                  <span class="at2-avatar sm">${esc(initials(t.name))}</span>
                  <b>${esc(t.name)}</b>
                  <span class="at2-chiprow">
                    <span class="at2-chip danger">Pending ${t.pending}</span>
                    <span class="at2-chip warn">Upcoming ${t.upcoming}</span>
                    <span class="at2-chip ok">Completed ${t.done}</span>
                  </span>
                  <span class="at2-group-hours">${t.rows.length} total</span>
                  <span class="at2-caret">${open ? '▾' : '▸'}</span>
                </button>
                ${open ? `
                  <div class="table-wrap"><table class="at2-tbl">
                    <thead><tr><th>Ticket</th><th>Customer</th><th>Type</th><th>Scheduled</th><th>Status</th><th>Address</th><th></th></tr></thead>
                    <tbody>${t.rows.map(rowHtml).join('')}</tbody>
                  </table></div>` : ''}
              </div>`;
          }).join('')}
        </div>
      </div>
      ${sidePanel(rows)}
    </div>`;

  bindSidePanel(container, body);
  body.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.toggle;
      if (!state.expanded) state.expanded = new Set(techs.map(x => x.id));
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      paint(container);
    };
  });
  bindRows(container, body);
}

function bindRows(container, scope) {
  scope.querySelectorAll('[data-open]').forEach(tr => {
    tr.onclick = (e) => {
      if (e.target.closest('[data-del]')) return;
      openDetail(container, tr.dataset.open);
    };
  });
  scope.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const row = data.rows.find(r => r.id === btn.dataset.del);
      if (!row) return;
      if (!confirm(`Delete the installation for ${row.full_name || 'this customer'} on ${row.preferred_date || ''}? This cannot be undone.`)) return;
      btn.disabled = true;
      try {
        const { error } = await supabase.from('installations').delete().eq('id', btn.dataset.del);
        if (error) throw new Error(error.message);
        toast('Installation deleted', 'success');
        renderInstallationsAdminTab(container);
      } catch (err) {
        toast(err.message || 'Could not delete', 'error');
        btn.disabled = false;
      }
    };
  });
}

// ── right-hand column ───────────────────────────────
function sidePanel(rows) {
  const y = state.month.getFullYear();
  const m = state.month.getMonth();
  const monthLabel = state.month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const byDay = new Map();
  rows.forEach(r => {
    const rank = { completed: 1, cancelled: 1, assigned: 2, in_progress: 2, pending: 3 };
    const cur = byDay.get(r.date);
    if (!cur || rank[r.state] > rank[cur]) byDay.set(r.date, r.state);
  });

  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = ymd(new Date());
  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += '<div class="at2-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const st = byDay.get(key);
    cells += `
      <button class="at2-day${key === today ? ' today' : ''}${key === state.day ? ' picked' : ''}" data-day="${key}">
        <span>${d}</span>
        <i class="at2-daydot${st ? ' tone-inst-' + st : ''}"></i>
      </button>`;
  }

  return `
    <aside class="at2-side">
      <section class="card">
        <div class="at2-calhead">
          <button class="at2-navbtn" data-month="-1" title="Previous month">‹</button>
          <b>${esc(monthLabel)}</b>
          <button class="at2-navbtn" data-month="1" title="Next month">›</button>
        </div>
        <div class="at2-calbody">
          <div class="at2-dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span>${d}</span>`).join('')}</div>
          <div class="at2-days">${cells}</div>
        </div>
        <div class="at2-legend">
          <div class="at2-legend-head"><b>Status legend</b>${state.day ? '<button class="at2-link" id="in2-clearday">View all</button>' : ''}</div>
          <div class="at2-legend-row">
            <span><i class="at2-daydot tone-inst-pending"></i>Pending</span>
            <span><i class="at2-daydot tone-inst-assigned"></i>Assigned</span>
            <span><i class="at2-daydot tone-inst-in_progress"></i>In progress</span>
            <span><i class="at2-daydot tone-inst-completed"></i>Completed</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><span class="card-title">Quick actions</span></div>
        <div class="at2-actions">
          <button class="at2-action" data-action="new">${ICONS.plus || ''}<span>New installation</span></button>
          <button class="at2-action" data-action="pending">${ICONS.alert || ''}<span>Show pending</span></button>
          <button class="at2-action" data-action="today">${ICONS.calendar || ''}<span>Today's schedule</span></button>
          <button class="at2-action" data-action="reports">${ICONS.clipboard || ''}<span>Open reports</span></button>
        </div>
      </section>
    </aside>`;
}

function bindSidePanel(container, body) {
  body.querySelectorAll('[data-month]').forEach(btn => {
    btn.onclick = () => {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(btn.dataset.month), 1);
      paint(container);
    };
  });
  body.querySelectorAll('[data-day]').forEach(btn => {
    btn.onclick = () => {
      const day = btn.dataset.day;
      if (state.day === day) resetRange(); else { state.day = day; state.from = day; state.to = day; }
      paint(container);
    };
  });
  const clear = body.querySelector('#in2-clearday');
  if (clear) clear.onclick = () => { resetRange(); paint(container); };
  body.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.action;
      if (a === 'new') openCreateModal(container);
      else if (a === 'pending') { state.status = 'pending'; paint(container); }
      else if (a === 'today') { const t = ymd(new Date()); state.day = t; state.from = t; state.to = t; paint(container); }
      else if (a === 'reports') { state.tab = 'reports'; paint(container); }
    };
  });
}

function resetRange() {
  state.day = '';
  const d = state.month;
  state.from = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  state.to = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

// ── tab 2: flat log ─────────────────────────────────
function paintLogs(container, body, rows) {
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Installation Logs</span><span class="at2-count">${rows.length} bookings</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Technician</th><th>Ticket</th><th>Customer</th><th>Type</th><th>Scheduled</th><th>Status</th><th>Address</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(r => `
            <tr data-open="${esc(r.id)}" style="cursor:pointer">
              <td style="white-space:nowrap"><span class="at2-avatar xs">${esc(initials(r.tech))}</span>${esc(r.tech)}</td>
              ${rowHtml(r).replace(/^[\s\S]*?<tr[^>]*>/, '').replace(/<\/tr>\s*$/, '')}
            </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-dim)">No installations in this range</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  bindRows(container, body);
}

// ── tab 3: reports ──────────────────────────────────
function paintReports(body, techs, rows) {
  const byType = new Map();
  rows.forEach(r => {
    const key = r.installation_type || 'Other';
    byType.set(key, (byType.get(key) || 0) + 1);
  });
  const top = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <span class="card-title">Technician Report</span>
        <span class="at2-count">${esc(state.from)} → ${esc(state.to)}</span>
      </div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Technician</th><th>Installations</th><th>Pending</th><th>Upcoming</th><th>Completed</th><th>Completion</th></tr></thead>
        <tbody>
          ${techs.length ? techs.map(t => {
            const rate = t.rows.length ? Math.round((t.done / t.rows.length) * 100) : 0;
            return `
              <tr>
                <td><span class="at2-avatar xs">${esc(initials(t.name))}</span>${esc(t.name)}</td>
                <td>${t.rows.length}</td>
                <td>${t.pending}</td>
                <td>${t.upcoming}</td>
                <td>${t.done}</td>
                <td><span class="at2-chip ${rate >= 80 ? 'ok' : rate >= 50 ? 'warn' : 'danger'}">${rate}%</span></td>
              </tr>`;
          }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-dim)">Nothing to report for this range</td></tr>'}
        </tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Most booked installation types</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Type</th><th>Bookings</th><th>Share</th></tr></thead>
        <tbody>
          ${top.length ? top.map(([name, n]) => `
            <tr><td>${esc(name)}</td><td>${n}</td><td>${Math.round((n / (rows.length || 1)) * 100)}%</td></tr>`).join('')
            : '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-dim)">No data</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}

function exportRows(rows, techs) {
  if (state.tab === 'reports') {
    if (!techs.length) return toast('Nothing to export', 'info');
    return exportToCSV(`installations-report-${state.from}-to-${state.to}.csv`, techs.map(t => ({
      Technician: t.name,
      Installations: t.rows.length,
      Pending: t.pending,
      Upcoming: t.upcoming,
      Completed: t.done,
      'Completion %': t.rows.length ? Math.round((t.done / t.rows.length) * 100) : 0,
    })));
  }
  if (!rows.length) return toast('Nothing to export', 'info');
  exportToCSV(`installations-${state.from}-to-${state.to}.csv`, rows.map(r => ({
    Ticket: r.ticket_no || '',
    Customer: r.full_name || '',
    Phone: r.phone || '',
    Type: r.installation_type || '',
    Scheduled: `${r.preferred_date || ''} ${r.preferred_time || ''}`.trim(),
    Technician: r.tech,
    Status: (STATE_CHIP[r.state] || {}).label || r.state,
    Location: r.location || '',
    Address: r.address || '',
  })));
}

// Detail — the whole life of one installation on a single sheet: where it is
// now, who has it, what was fitted, the bill, and the money. Payment is
// separate from finishing the job: bills go out unpaid and get settled
// whenever the cash actually arrives.
async function openDetail(container, id) {
  let payload;
  try {
    payload = await api('GET', `/installations/${encodeURIComponent(id)}`);
  } catch (err) {
    return toast(err.message, 'error');
  }
  const r = payload.installation;
  const items = payload.items || [];
  const itemsTotal = items.reduce((sum, it) => sum + Number(it.amount), 0);

  const step = (label, at, note) => `
    <div class="inst-step${at ? ' done' : ''}">
      <span class="inst-step-dot"></span>
      <div>
        <b>${esc(label)}</b>
        <div class="inst-step-when">${at ? esc(new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : 'Pending'}</div>
        ${note ? `<div class="inst-step-note">${esc(note)}</div>` : ''}
      </div>
    </div>`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header">
        <span class="modal-title">${esc(r.ticket_no || 'Installation')}</span>
        <button class="modal-close" id="ind-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:16px;">
          <div style="font-weight:800;font-size:1rem;">${esc(r.full_name || 'Customer')}</div>
          <div style="font-size:0.85rem;color:var(--text-soft);">${esc(r.phone || '')} · ${esc(r.installation_type || '')}</div>
          <div style="font-size:0.85rem;color:var(--text-dim);margin-top:4px;">${esc(r.address || r.location || '')}</div>
          <div style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;">
            Scheduled ${esc(dayLabel(r.preferred_date))}${r.preferred_time ? ' · ' + esc(r.preferred_time) : ''}
            ${r.employee_name ? ` · with <b style="color:var(--text)">${esc(r.employee_name)}</b>` : ' · unassigned'}
          </div>
        </div>

        <div class="inst-timeline">
          ${step('Booked', r.created_at)}
          ${step('Assigned', r.assigned_at, r.employee_name ? `To ${r.employee_name}` : '')}
          ${step(r.assignment_status === 'declined' ? 'Declined' : 'Accepted', r.assignment_status === 'declined' ? r.updated_at : r.accepted_at, r.decline_reason || '')}
          ${step('Work started', r.started_at, r.employee_update_detail || '')}
          ${step('Completed', r.completed_at)}
          ${step('Bill made', r.bill_generated_at, r.bill_no ? `Bill ${r.bill_no}` : '')}
          ${step('Paid', r.payment_received_at, r.payment_method ? `${r.payment_method}${r.payment_note ? ' — ' + r.payment_note : ''}` : '')}
        </div>

        <div class="card" style="margin-top:16px;">
          <div class="card-header"><span class="card-title">Bill</span><span class="at2-count">${items.length} item${items.length === 1 ? '' : 's'}</span></div>
          <div class="table-wrap"><table class="at2-tbl">
            <tbody>
              ${items.map(it => `
                <tr>
                  <td>${esc(it.name)}${it.kind === 'custom' ? ' <span class="at2-chip muted">off-list</span>' : ''}</td>
                  <td style="text-align:right">${Number(it.quantity)} × ₹${Number(it.rate)}</td>
                  <td style="text-align:right"><b>₹${Number(it.amount).toLocaleString('en-IN')}</b></td>
                </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:16px">No items on this bill</td></tr>'}
              <tr><td>Items</td><td></td><td style="text-align:right">₹${itemsTotal.toLocaleString('en-IN')}</td></tr>
              <tr><td>Labour</td><td></td><td style="text-align:right">₹${Number(r.labour_charge || 0).toLocaleString('en-IN')}</td></tr>
              ${Number(r.gst_amount) > 0 ? `<tr><td>GST</td><td></td><td style="text-align:right">₹${Number(r.gst_amount).toLocaleString('en-IN')}</td></tr>` : ''}
              <tr><td><b>Total</b></td><td></td><td style="text-align:right"><b style="color:var(--primary)">₹${Number(r.bill_total || 0).toLocaleString('en-IN')}</b></td></tr>
            </tbody>
          </table></div>
        </div>

        <div class="form-group" style="margin-top:16px;">
          <label>Assign / reassign technician</label>
          <select id="ind-emp">
            <option value="">— Unassigned —</option>
            ${data.employees.map(e => `<option value="${esc(e.id)}"${r.assigned_employee_id === e.id ? ' selected' : ''}>${esc(e.full_name || 'Employee')}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer" style="gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary" id="ind-cancel">Close</button>
        <button class="btn btn-secondary" id="ind-assign">Save assignment</button>
        ${Number(r.bill_total) > 0 ? (r.payment_status === 'paid'
          ? '<button class="btn btn-secondary" id="ind-unpaid">Mark unpaid</button>'
          : '<button class="btn btn-primary" id="ind-paid">Mark paid</button>') : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#ind-close').onclick = close;
  $('#ind-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('#ind-assign').onclick = async () => {
    try {
      await api('POST', `/installations/${r.id}/assign`, { employee_id: $('#ind-emp').value || null });
      toast('Assignment saved', 'success');
      close();
      renderInstallationsAdminTab(container);
    } catch (err) { toast(err.message, 'error'); }
  };
  const pay = async (paid) => {
    try {
      await api('POST', `/installations/${r.id}/payment`, { paid, method: 'cash' });
      toast(paid ? 'Marked paid' : 'Marked unpaid', 'success');
      close();
      renderInstallationsAdminTab(container);
    } catch (err) { toast(err.message, 'error'); }
  };
  if ($('#ind-paid')) $('#ind-paid').onclick = () => pay(true);
  if ($('#ind-unpaid')) $('#ind-unpaid').onclick = () => pay(false);
}

// Booking form — same fields the Calendar tab and the dashboard write.
function openCreateModal(container) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <span class="modal-title">New Installation</span>
        <button class="modal-close" id="in2-c">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;">
          <div class="form-group"><label>Customer Name</label><input type="text" id="in2-name" placeholder="Customer name"></div>
          <div class="form-group"><label>Phone</label><input type="tel" id="in2-phone" placeholder="10 digit mobile number"></div>
          <div class="form-group"><label>Location (city / area)</label><input type="text" id="in2-location" placeholder="e.g. Rajbagh, Srinagar"></div>
          <div class="form-group"><label>Installation Type</label><input type="text" id="in2-type" placeholder="e.g. 4 Camera CCTV"></div>
          <div class="form-group"><label>Date</label><input type="date" id="in2-date" value="${ymd(new Date())}"></div>
          <div class="form-group"><label>Time</label><input type="time" id="in2-time"></div>
          <div class="form-group">
            <label>Assign Technician <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>
            <select id="in2-emp-new">
              <option value="">— Unassigned —</option>
              ${data.employees.map(e => `<option value="${esc(e.id)}">${esc(e.full_name || 'Employee')}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>Address</label><textarea id="in2-address" rows="2" placeholder="Full address / landmark"></textarea></div>
        <div class="form-group"><label>Details <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label><textarea id="in2-desc" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="in2-cancel">Cancel</button>
        <button class="btn btn-primary" id="in2-save">Save Installation</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#in2-c').onclick = close;
  $('#in2-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('#in2-save').onclick = async () => {
    const name = $('#in2-name').value.trim();
    const phone = $('#in2-phone').value.trim();
    const location = $('#in2-location').value.trim();
    const address = $('#in2-address').value.trim();
    const type = $('#in2-type').value.trim();
    const date = $('#in2-date').value;
    if (!name || !phone || !location || !address || !type || !date) {
      return toast('Name, phone, location, address, type and date are required', 'warning');
    }
    const btn = $('#in2-save');
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
        preferred_time: $('#in2-time').value || 'Anytime',
        assigned_employee_id: $('#in2-emp-new').value || null,
        description: $('#in2-desc').value.trim() || null,
        status: 'pending',
      }]);
      if (error) throw new Error(error.message);
      toast('Installation added', 'success');
      close();
      renderInstallationsAdminTab(container);
    } catch (err) {
      toast(err.message || 'Could not save the installation', 'error');
      btn.disabled = false;
    }
  };
}
