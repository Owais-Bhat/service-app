// Service Requests — same shape as the Attendance screen: counters on top,
// three in-page tabs, one filter row, work grouped per technician with an
// expandable detail table, and a month calendar on the right that doubles as
// a day filter. Rows open the existing admin detail modal, so assigning and
// billing behave exactly as they do everywhere else.
import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { showLoader, toast, exportToCSV, effectiveSLADeadline, isSlaPaused } from '../utils.js';
import { openInquiryDetail, openAdminRequestModal } from './admin.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ymd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const clock = (v) => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
const dayLabel = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const initials = (n) => String(n || '?').trim().charAt(0).toUpperCase();
const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const OPEN_STATUSES = new Set(['pending', 'open', 'assigned', 'in_progress', 'reopened', 'issue_not_resolved']);
const DONE_STATUSES = new Set(['resolved', 'closed', 'case_closed', 'foc']);

const TABS = [
  { key: 'requests', label: 'Service Requests' },
  { key: 'logs', label: 'Request Logs' },
  { key: 'reports', label: 'Reports' },
];

const state = {
  tab: 'requests',
  from: '',
  to: '',
  employee: '',
  status: '',
  q: '',
  month: new Date(),
  day: '',
  expanded: null,   // null = every technician open
};

let data = { rows: [], employees: [] };

export async function renderServiceRequestsTab(container) {
  showLoader(container);
  if (!state.from) {
    const d = new Date();
    state.from = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
    state.to = ymd(d);
  }
  try {
    const [inq, prof] = await Promise.all([
      supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role').eq('role', 'employee'),
    ]);
    data = { rows: inq.data || [], employees: prof.data || [] };
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

// ── derived ─────────────────────────────────────────
function stateOf(r) {
  const st = String(r.status || '').toLowerCase();
  if (DONE_STATUSES.has(st)) return 'completed';
  if (!r.assigned_employee_id || r.assignment_status === 'declined') return 'unassigned';
  if (st === 'in_progress') return 'in_progress';
  return 'assigned';
}

function slaChip(r) {
  const deadline = effectiveSLADeadline(r);
  if (DONE_STATUSES.has(String(r.status || '').toLowerCase())) return '<span class="at2-chip ok">Done</span>';
  if (!deadline) return '<span class="at2-chip muted">Not assigned</span>';
  if (isSlaPaused(r)) return '<span class="at2-chip warn">Paused</span>';
  const left = deadline.getTime() - Date.now();
  if (left <= 0) return '<span class="at2-chip danger">Overdue</span>';
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return `<span class="at2-chip ${h < 2 ? 'warn' : 'ok'}">${h}h ${m}m left</span>`;
}

function decorated() {
  const nameById = new Map(data.employees.map(e => [e.id, e.full_name]));
  return data.rows
    .map(r => ({
      ...r,
      date: ymd(r.created_at),
      tech: r.assigned_employee_id ? (nameById.get(r.assigned_employee_id) || 'Employee') : 'Unassigned',
      techId: r.assigned_employee_id || 'unassigned',
      state: stateOf(r),
      amount: Number(r.bill_total) || Number(r.bill_amount) || 0,
    }))
    .filter(r => r.date && (!state.from || r.date >= state.from) && (!state.to || r.date <= state.to))
    .filter(r => !state.employee || r.techId === state.employee)
    .filter(r => !state.status || r.state === state.status)
    .filter(r => !state.q || `${r.ticket_no || ''} ${r.full_name || ''} ${r.phone || ''} ${r.service_item || ''} ${r.location || ''}`.toLowerCase().includes(state.q.toLowerCase()));
}

function perTech(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!map.has(r.techId)) map.set(r.techId, { id: r.techId, name: r.tech, rows: [], open: 0, done: 0, overdue: 0, billed: 0 });
    const t = map.get(r.techId);
    t.rows.push(r);
    if (OPEN_STATUSES.has(String(r.status || '').toLowerCase())) t.open++;
    if (r.state === 'completed') t.done++;
    const dl = effectiveSLADeadline(r);
    if (dl && !DONE_STATUSES.has(String(r.status || '').toLowerCase()) && Date.now() > dl.getTime()) t.overdue++;
    t.billed += r.amount;
  });
  return [...map.values()].sort((a, b) => b.rows.length - a.rows.length);
}

// ── shell ───────────────────────────────────────────
function paint(container) {
  const rows = decorated();
  const techs = perTech(rows);
  const total = rows.length;
  const unassigned = rows.filter(r => r.state === 'unassigned').length;
  const assigned = rows.filter(r => r.state === 'assigned').length;
  const inProgress = rows.filter(r => r.state === 'in_progress').length;
  const completed = rows.filter(r => r.state === 'completed').length;

  container.innerHTML = `
    <div class="at2">
      <div class="page-header">
        <div>
          <h1>Service Requests</h1>
          <p>Track and manage every service request easily</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="sr2-export">${ICONS.download}<span>Export</span></button>
          <button class="btn btn-primary" id="sr2-new">${ICONS.plus}<span>New Request</span></button>
        </div>
      </div>

      <div class="at2-kpis">
        ${kpi(ICONS.inbox, total, 'Total Requests', '', 'muted')}
        ${kpi(ICONS.alert, unassigned, 'Unassigned', pct(unassigned, total), 'red')}
        ${kpi(ICONS.user, assigned, 'Assigned', pct(assigned, total), 'amber')}
        ${kpi(ICONS.wrench, inProgress, 'In Progress', pct(inProgress, total), 'green')}
        ${kpi(ICONS.check, completed, 'Completed', pct(completed, total), 'green')}
      </div>

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-sr2tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="card at2-filters">
        <div class="card-body">
          <div class="form-group"><label>Technician</label>
            <select id="sr2-emp">
              <option value="">All technicians</option>
              <option value="unassigned"${state.employee === 'unassigned' ? ' selected' : ''}>Unassigned</option>
              ${data.employees.map(e => `<option value="${esc(e.id)}"${state.employee === e.id ? ' selected' : ''}>${esc(e.full_name || 'Employee')}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Status</label>
            <select id="sr2-status">
              <option value="">All</option>
              <option value="unassigned"${state.status === 'unassigned' ? ' selected' : ''}>Unassigned</option>
              <option value="assigned"${state.status === 'assigned' ? ' selected' : ''}>Assigned</option>
              <option value="in_progress"${state.status === 'in_progress' ? ' selected' : ''}>In Progress</option>
              <option value="completed"${state.status === 'completed' ? ' selected' : ''}>Completed</option>
            </select>
          </div>
          <div class="form-group"><label>From</label><input type="date" id="sr2-from" value="${esc(state.from)}"></div>
          <div class="form-group"><label>To</label><input type="date" id="sr2-to" value="${esc(state.to)}"></div>
          <div class="form-group"><label>Search</label><input type="search" id="sr2-q" placeholder="Ticket, customer, phone…" value="${esc(state.q)}"></div>
        </div>
      </div>

      <div id="sr2-body"></div>
    </div>
  `;

  const $ = (s) => container.querySelector(s);
  container.querySelectorAll('[data-sr2tab]').forEach(b => { b.onclick = () => { state.tab = b.dataset.sr2tab; paint(container); }; });
  $('#sr2-emp').onchange = (e) => { state.employee = e.target.value; paint(container); };
  $('#sr2-status').onchange = (e) => { state.status = e.target.value; paint(container); };
  $('#sr2-from').onchange = (e) => { state.from = e.target.value; paint(container); };
  $('#sr2-to').onchange = (e) => { state.to = e.target.value; paint(container); };
  let t;
  $('#sr2-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); paint(container); }, 250); };
  $('#sr2-new').onclick = () => openAdminRequestModal(() => renderServiceRequestsTab(container));
  $('#sr2-export').onclick = () => exportRows(rows, techs);

  const body = $('#sr2-body');
  if (state.tab === 'requests') paintRequests(container, body, rows, techs);
  else if (state.tab === 'logs') paintLogs(container, body, rows);
  else paintReports(body, techs, rows);
}

const pct = (n, total) => total ? `${Math.round((n / total) * 100)}%` : '';

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

const STATE_CHIP = {
  unassigned: { label: 'Unassigned', cls: 'danger' },
  assigned: { label: 'Assigned', cls: 'warn' },
  in_progress: { label: 'In Progress', cls: 'ok' },
  completed: { label: 'Completed', cls: 'ok' },
};

// ── tab 1: grouped per technician ───────────────────
function paintRequests(container, body, rows, techs) {
  body.innerHTML = `
    <div class="at2-cards">
      ${techs.map(t => `
        <div class="at2-empcard">
          <div class="at2-empcard-top">
            <span class="at2-avatar">${esc(initials(t.name))}</span>
            <div><b>${esc(t.name)}</b><small>${t.rows.length} request${t.rows.length === 1 ? '' : 's'}</small></div>
          </div>
          <div class="at2-empstats">
            <span><i class="dot tone-warn"></i>Open<b>${t.open}</b></span>
            <span><i class="dot tone-ok"></i>Completed<b>${t.done}</b></span>
            <span><i class="dot tone-danger"></i>Overdue<b>${t.overdue}</b></span>
            <span><i class="dot tone-pink"></i>Billed<b>${money(t.billed)}</b></span>
          </div>
        </div>`).join('') || '<div class="at2-empty">No requests in this range.</div>'}
    </div>

    <div class="at2-split">
      <div class="card">
        <div class="card-header"><span class="card-title">Service Request Details</span></div>
        <div class="at2-details">
          ${techs.map(t => {
            const open = !state.expanded || state.expanded.has(t.id);
            return `
              <div class="at2-group">
                <button class="at2-group-head" data-toggle="${esc(t.id)}">
                  <span class="at2-avatar sm">${esc(initials(t.name))}</span>
                  <b>${esc(t.name)}</b>
                  <span class="at2-chiprow">
                    <span class="at2-chip warn">Open ${t.open}</span>
                    <span class="at2-chip ok">Completed ${t.done}</span>
                    <span class="at2-chip danger">Overdue ${t.overdue}</span>
                  </span>
                  <span class="at2-group-hours">${money(t.billed)}</span>
                  <span class="at2-caret">${open ? '▾' : '▸'}</span>
                </button>
                ${open ? `
                  <div class="table-wrap"><table class="at2-tbl">
                    <thead><tr><th>Ticket</th><th>Customer</th><th>Service</th><th>Received</th><th>Status</th><th>SLA</th><th>Amount</th></tr></thead>
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

function rowHtml(r) {
  const chip = STATE_CHIP[r.state] || STATE_CHIP.assigned;
  return `
    <tr data-open="${esc(r.id)}" style="cursor:pointer">
      <td style="font-family:monospace;white-space:nowrap">${esc(r.ticket_no || '—')}</td>
      <td>${esc(r.full_name || 'Customer')}${r.phone ? `<div style="font-size:0.75rem;color:var(--text-dim)">${esc(r.phone)}</div>` : ''}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.service_item || '')}">${esc(r.service_item || '—')}</td>
      <td style="white-space:nowrap">${esc(dayLabel(r.created_at))}<div style="font-size:0.75rem;color:var(--text-dim)">${esc(clock(r.created_at))}</div></td>
      <td><span class="at2-chip ${chip.cls}">${chip.label}</span></td>
      <td>${slaChip(r)}</td>
      <td style="white-space:nowrap">${r.amount ? esc(money(r.amount)) : '—'}</td>
    </tr>`;
}

function bindRows(container, scope) {
  scope.querySelectorAll('[data-open]').forEach(tr => {
    tr.onclick = () => openInquiryDetail(tr.dataset.open, () => renderServiceRequestsTab(container));
  });
}

// ── right-hand column ───────────────────────────────
function sidePanel(rows) {
  const y = state.month.getFullYear();
  const m = state.month.getMonth();
  const monthLabel = state.month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const byDay = new Map();
  rows.forEach(r => {
    const rank = { completed: 1, assigned: 2, in_progress: 2, unassigned: 3 };
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
        <i class="at2-daydot${st ? ' tone-' + st : ''}"></i>
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
          <div class="at2-legend-head"><b>Status legend</b>${state.day ? '<button class="at2-link" id="sr2-clearday">View all</button>' : ''}</div>
          <div class="at2-legend-row">
            <span><i class="at2-daydot tone-unassigned"></i>Unassigned</span>
            <span><i class="at2-daydot tone-assigned"></i>Assigned</span>
            <span><i class="at2-daydot tone-in_progress"></i>In progress</span>
            <span><i class="at2-daydot tone-completed"></i>Completed</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><span class="card-title">Quick actions</span></div>
        <div class="at2-actions">
          <button class="at2-action" data-action="new">${ICONS.plus || ''}<span>New service request</span></button>
          <button class="at2-action" data-action="unassigned">${ICONS.alert || ''}<span>Show unassigned</span></button>
          <button class="at2-action" data-action="reports">${ICONS.clipboard || ''}<span>Open reports</span></button>
          <button class="at2-action" data-action="response">${ICONS.clock || ''}<span>Response times</span></button>
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
      if (state.day === day) resetRange();
      else { state.day = day; state.from = day; state.to = day; }
      paint(container);
    };
  });
  const clear = body.querySelector('#sr2-clearday');
  if (clear) clear.onclick = () => { resetRange(); paint(container); };
  body.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.action;
      if (a === 'new') openAdminRequestModal(() => renderServiceRequestsTab(container));
      else if (a === 'unassigned') { state.status = 'unassigned'; paint(container); }
      else if (a === 'reports') { state.tab = 'reports'; paint(container); }
      else if (a === 'response') document.querySelector('#sidebar-nav .nav-item[data-nav="response-times"]')?.click();
    };
  });
}

function resetRange() {
  state.day = '';
  state.from = ymd(new Date(state.month.getFullYear(), state.month.getMonth(), 1));
  state.to = ymd(new Date());
}

// ── tab 2: flat log ─────────────────────────────────
function paintLogs(container, body, rows) {
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Request Logs</span><span class="at2-count">${rows.length} requests</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Technician</th><th>Ticket</th><th>Customer</th><th>Service</th><th>Received</th><th>Status</th><th>SLA</th><th>Amount</th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(r => `
            <tr data-open="${esc(r.id)}" style="cursor:pointer">
              <td style="white-space:nowrap"><span class="at2-avatar xs">${esc(initials(r.tech))}</span>${esc(r.tech)}</td>
              ${rowHtml(r).replace(/^[\s\S]*?<tr[^>]*>/, '').replace(/<\/tr>\s*$/, '')}
            </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-dim)">No requests in this range</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  bindRows(container, body);
}

// ── tab 3: reports ──────────────────────────────────
function paintReports(body, techs, rows) {
  const byCategory = new Map();
  rows.forEach(r => {
    const key = r.service_item || 'Other';
    byCategory.set(key, (byCategory.get(key) || 0) + 1);
  });
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <span class="card-title">Technician Report</span>
        <span class="at2-count">${esc(state.from)} → ${esc(state.to)}</span>
      </div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Technician</th><th>Requests</th><th>Open</th><th>Completed</th><th>Overdue</th><th>Billed</th><th>Completion</th></tr></thead>
        <tbody>
          ${techs.length ? techs.map(t => {
            const rate = t.rows.length ? Math.round((t.done / t.rows.length) * 100) : 0;
            return `
              <tr>
                <td><span class="at2-avatar xs">${esc(initials(t.name))}</span>${esc(t.name)}</td>
                <td>${t.rows.length}</td>
                <td>${t.open}</td>
                <td>${t.done}</td>
                <td>${t.overdue}</td>
                <td>${esc(money(t.billed))}</td>
                <td><span class="at2-chip ${rate >= 80 ? 'ok' : rate >= 50 ? 'warn' : 'danger'}">${rate}%</span></td>
              </tr>`;
          }).join('') : '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-dim)">Nothing to report for this range</td></tr>'}
        </tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Most requested services</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Service</th><th>Requests</th><th>Share</th></tr></thead>
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
    return exportToCSV(`service-requests-report-${state.from}-to-${state.to}.csv`, techs.map(t => ({
      Technician: t.name,
      Requests: t.rows.length,
      Open: t.open,
      Completed: t.done,
      Overdue: t.overdue,
      Billed: t.billed,
      'Completion %': t.rows.length ? Math.round((t.done / t.rows.length) * 100) : 0,
    })));
  }
  if (!rows.length) return toast('Nothing to export', 'info');
  exportToCSV(`service-requests-${state.from}-to-${state.to}.csv`, rows.map(r => ({
    Ticket: r.ticket_no || '',
    Customer: r.full_name || '',
    Phone: r.phone || '',
    Service: r.service_item || '',
    Location: r.location || '',
    Technician: r.tech,
    Status: (STATE_CHIP[r.state] || {}).label || r.state,
    Received: `${r.date} ${clock(r.created_at)}`,
    Amount: r.amount || '',
    'Payment status': r.payment_status || '',
  })));
}
