// Attendance — one screen, three in-page tabs (Employee Attendance,
// Attendance Logs, Reports) so the sidebar stays a single entry. Everything
// reads the attendance + eod_reports tables the rest of the portal writes, so
// the numbers here always match the raw logs.
import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { showLoader, toast, exportToCSV } from '../utils.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ymd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const clock = (v) => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
const dayLabel = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const initials = (n) => String(n || '?').trim().charAt(0).toUpperCase();

// Anything after 10:00 counts as late — the same start the SLA clock assumes.
const LATE_AFTER_MIN = 10 * 60;
const hoursBetween = (a, b) => (!a || !b) ? null : Math.max(0, (new Date(b) - new Date(a)) / 3600000);
const hoursText = (h) => h == null ? '—' : `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;

const TABS = [
  { key: 'employees', label: 'Employee Attendance' },
  { key: 'logs', label: 'Attendance Logs' },
  { key: 'reports', label: 'Reports' },
];

const state = {
  tab: 'employees',
  from: '',
  to: '',
  employee: '',
  status: '',
  q: '',
  month: new Date(),
  expanded: new Set(),
};

let data = { rows: [], employees: [], eod: [] };

export async function renderAttendanceTab(container) {
  showLoader(container);
  if (!state.from) {
    const d = new Date();
    state.from = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
    state.to = ymd(d);
  }
  try {
    const [att, prof, eod] = await Promise.all([
      supabase.from('attendance').select('*, profiles(full_name)').order('date', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role, phone').eq('role', 'employee'),
      supabase.from('eod_reports').select('employee_id, date'),
    ]);
    data = { rows: att.data || [], employees: prof.data || [], eod: eod.data || [] };
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

// ── derived data ────────────────────────────────────
const eodKey = (employeeId, date) => `${employeeId}|${date}`;

function inRange(dateStr) {
  if (state.from && dateStr < state.from) return false;
  if (state.to && dateStr > state.to) return false;
  return true;
}

function rowStatus(r, hasEod) {
  if (!r.clock_in) return 'absent';
  const t = new Date(r.clock_in);
  const mins = t.getHours() * 60 + t.getMinutes();
  if (!hasEod && r.clock_out) return 'missing_eod';
  if (mins > LATE_AFTER_MIN) return 'late';
  return 'present';
}

function decorated() {
  const eodSet = new Set(data.eod.map(e => eodKey(e.employee_id, ymd(e.date))));
  const nameById = new Map(data.employees.map(e => [e.id, e.full_name]));
  return data.rows
    .map(r => {
      // MySQL hands back DATE columns as Date objects — normalise before comparing.
      const date = r.date ? ymd(r.date) : ymd(r.clock_in);
      const hasEod = eodSet.has(eodKey(r.user_id, date));
      return {
        ...r,
        date,
        name: r.profiles?.full_name || nameById.get(r.user_id) || 'Employee',
        hours: hoursBetween(r.clock_in, r.clock_out),
        hasEod,
        state: rowStatus(r, hasEod),
      };
    })
    .filter(r => r.date && inRange(r.date))
    .filter(r => !state.employee || r.user_id === state.employee)
    .filter(r => !state.status || r.state === state.status)
    .filter(r => !state.q || `${r.name} ${r.location || ''}`.toLowerCase().includes(state.q.toLowerCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || new Date(b.clock_in) - new Date(a.clock_in));
}

function perEmployee(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!map.has(r.user_id)) {
      map.set(r.user_id, { id: r.user_id, name: r.name, rows: [], present: 0, late: 0, missingEod: 0, hours: 0 });
    }
    const e = map.get(r.user_id);
    e.rows.push(r);
    if (r.clock_in) e.present++;
    if (r.state === 'late') e.late++;
    if (!r.hasEod && r.clock_in) e.missingEod++;
    e.hours += r.hours || 0;
  });
  // Absent = working days in range with no row at all for that employee.
  const workingDays = workingDaysInRange();
  return [...map.values()].map(e => ({
    ...e,
    absent: Math.max(0, workingDays - new Set(e.rows.map(r => r.date)).size),
    avg: e.present ? e.hours / e.present : 0,
  })).sort((a, b) => b.present - a.present);
}

function workingDaysInRange() {
  if (!state.from || !state.to) return 0;
  let n = 0;
  const cur = new Date(state.from);
  const end = new Date(state.to);
  while (cur <= end) {
    if (cur.getDay() !== 0) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

// ── shell ───────────────────────────────────────────
function paint(container) {
  const rows = decorated();
  const staff = perEmployee(rows);
  const total = rows.length || 1;
  const present = rows.filter(r => r.clock_in).length;
  const late = rows.filter(r => r.state === 'late').length;
  const missingEod = rows.filter(r => r.clock_in && !r.hasEod).length;
  const absent = staff.reduce((s, e) => s + e.absent, 0);
  const pct = (n) => `${Math.round((n / total) * 100)}%`;

  container.innerHTML = `
    <div class="at2">
      <div class="page-header">
        <div>
          <h1>Attendance</h1>
          <p>Track and manage employee attendance easily</p>
        </div>
        <button class="btn btn-primary" id="at2-export">${ICONS.download}<span>Export Report</span></button>
      </div>

      <div class="at2-kpis">
        ${kpi(ICONS.users, data.employees.length, 'Total Employees', '', 'muted')}
        ${kpi(ICONS.check, present, 'Present', pct(present), 'green')}
        ${kpi(ICONS.close, absent, 'Absent', '', 'red')}
        ${kpi(ICONS.clock, late, 'Late', pct(late), 'amber')}
        ${kpi(ICONS.alert, missingEod, 'Missing EOD', pct(missingEod), 'pink')}
      </div>

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-at2tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="card at2-filters">
        <div class="card-body">
          <div class="form-group"><label>Employee</label>
            <select id="at2-emp">
              <option value="">All employees</option>
              ${data.employees.map(e => `<option value="${esc(e.id)}"${state.employee === e.id ? ' selected' : ''}>${esc(e.full_name || 'Employee')}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Status</label>
            <select id="at2-status">
              <option value="">All</option>
              <option value="present"${state.status === 'present' ? ' selected' : ''}>Present</option>
              <option value="late"${state.status === 'late' ? ' selected' : ''}>Late</option>
              <option value="missing_eod"${state.status === 'missing_eod' ? ' selected' : ''}>Missing EOD</option>
            </select>
          </div>
          <div class="form-group"><label>From</label><input type="date" id="at2-from" value="${esc(state.from)}"></div>
          <div class="form-group"><label>To</label><input type="date" id="at2-to" value="${esc(state.to)}"></div>
          <div class="form-group"><label>Search</label><input type="search" id="at2-q" placeholder="Employee or location…" value="${esc(state.q)}"></div>
        </div>
      </div>

      <div id="at2-body"></div>
    </div>
  `;

  const $ = (s) => container.querySelector(s);
  container.querySelectorAll('[data-at2tab]').forEach(btn => {
    btn.onclick = () => { state.tab = btn.dataset.at2tab; paint(container); };
  });
  $('#at2-emp').onchange = (e) => { state.employee = e.target.value; paint(container); };
  $('#at2-status').onchange = (e) => { state.status = e.target.value; paint(container); };
  $('#at2-from').onchange = (e) => { state.from = e.target.value; paint(container); };
  $('#at2-to').onchange = (e) => { state.to = e.target.value; paint(container); };
  let t;
  $('#at2-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); paint(container); }, 250); };
  $('#at2-export').onclick = () => exportRows(rows, staff);

  const body = $('#at2-body');
  if (state.tab === 'employees') paintEmployees(container, body, rows, staff);
  else if (state.tab === 'logs') paintLogs(body, rows);
  else paintReports(body, staff);
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

const STATE_BADGE = {
  present: { label: 'Complete', cls: 'ok' },
  late: { label: 'Late', cls: 'warn' },
  missing_eod: { label: 'Missing EOD', cls: 'danger' },
  absent: { label: 'Absent', cls: 'muted' },
};

// ── tab 1: employee attendance ──────────────────────
function paintEmployees(container, body, rows, staff) {
  body.innerHTML = `
    <div class="at2-cards">
      ${staff.map(e => `
        <div class="at2-empcard" data-emp="${esc(e.id)}">
          <div class="at2-empcard-top">
            <span class="at2-avatar">${esc(initials(e.name))}</span>
            <div><b>${esc(e.name)}</b><small>Field technician</small></div>
          </div>
          <div class="at2-empstats">
            <span><i class="dot tone-ok"></i>Present<b>${e.present}</b></span>
            <span><i class="dot tone-danger"></i>Absent<b>${e.absent}</b></span>
            <span><i class="dot tone-warn"></i>Late<b>${e.late}</b></span>
            <span><i class="dot tone-pink"></i>Missing EOD<b>${e.missingEod}</b></span>
          </div>
          <div class="at2-empfoot">
            <span>Total hours <b>${hoursText(e.hours)}</b></span>
            <span>Avg/day <b>${hoursText(e.avg)}</b></span>
          </div>
        </div>`).join('') || '<div class="at2-empty">No attendance in this range.</div>'}
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Employee Attendance Details</span></div>
      <div class="at2-details">
        ${staff.map(e => {
          const open = state.expanded.has(e.id);
          return `
            <div class="at2-group">
              <button class="at2-group-head" data-toggle="${esc(e.id)}">
                <span class="at2-avatar sm">${esc(initials(e.name))}</span>
                <b>${esc(e.name)}</b>
                <span class="at2-chiprow">
                  <span class="at2-chip ok">Present ${e.present}</span>
                  <span class="at2-chip muted">Absent ${e.absent}</span>
                  <span class="at2-chip warn">Late ${e.late}</span>
                  <span class="at2-chip danger">Missing EOD ${e.missingEod}</span>
                </span>
                <span class="at2-group-hours">${hoursText(e.hours)}</span>
                <span class="at2-caret">${open ? '▾' : '▸'}</span>
              </button>
              ${open ? `
                <div class="table-wrap"><table class="at2-tbl">
                  <thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Status</th><th>Location</th><th>Photo</th></tr></thead>
                  <tbody>${e.rows.map(rowHtml).join('')}</tbody>
                </table></div>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>
  `;

  body.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.toggle;
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      paint(container);
    };
  });
  bindPhotos(body);
}

function rowHtml(r) {
  const badge = STATE_BADGE[r.state] || STATE_BADGE.present;
  const coords = r.latitude && r.longitude ? `${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)}` : (r.location || '—');
  return `
    <tr>
      <td style="white-space:nowrap">${esc(dayLabel(r.date))}</td>
      <td>${esc(clock(r.clock_in))}</td>
      <td>${esc(clock(r.clock_out))}</td>
      <td>${esc(hoursText(r.hours))}</td>
      <td><span class="at2-chip ${badge.cls}">${badge.label}</span></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.location || '')}">${esc(coords)}</td>
      <td>${r.selfie_url ? `<button class="at2-photo" data-photo="${esc(r.selfie_url)}" title="View clock-in photo">${ICONS.eye || '📷'}</button>` : '—'}</td>
    </tr>`;
}

function bindPhotos(scope) {
  scope.querySelectorAll('[data-photo]').forEach(btn => {
    btn.onclick = () => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:420px;">
          <div class="modal-header"><span class="modal-title">Clock-in photo</span><button class="modal-close" id="at2-p-close">${ICONS.close}</button></div>
          <div class="modal-body" style="padding:0;"><img src="${esc(btn.dataset.photo)}" alt="Clock-in photo" style="width:100%;display:block;"></div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelector('#at2-p-close').onclick = close;
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
    };
  });
}

// ── tab 2: attendance logs ──────────────────────────
function paintLogs(body, rows) {
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Attendance Logs</span><span class="at2-count">${rows.length} entries</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Employee</th><th>Date</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Status</th><th>Location</th><th>Photo</th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(r => `
            <tr>
              <td><span class="at2-avatar xs">${esc(initials(r.name))}</span>${esc(r.name)}</td>
              ${rowHtml(r).replace(/^\s*<tr>/, '').replace(/<\/tr>\s*$/, '')}
            </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-dim)">No logs in this range</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  bindPhotos(body);
}

// ── tab 3: reports ──────────────────────────────────
function paintReports(body, staff) {
  const workingDays = workingDaysInRange();
  body.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Attendance Report</span>
        <span class="at2-count">${esc(state.from)} → ${esc(state.to)} · ${workingDays} working days</span>
      </div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr>
          <th>Employee</th><th>Present</th><th>Absent</th><th>Late</th><th>Missing EOD</th>
          <th>Total hours</th><th>Avg / day</th><th>Attendance %</th>
        </tr></thead>
        <tbody>
          ${staff.length ? staff.map(e => {
            const pct = workingDays ? Math.round((e.present / workingDays) * 100) : 0;
            return `
              <tr>
                <td><span class="at2-avatar xs">${esc(initials(e.name))}</span>${esc(e.name)}</td>
                <td>${e.present}</td>
                <td>${e.absent}</td>
                <td>${e.late}</td>
                <td>${e.missingEod}</td>
                <td>${esc(hoursText(e.hours))}</td>
                <td>${esc(hoursText(e.avg))}</td>
                <td><span class="at2-chip ${pct >= 90 ? 'ok' : pct >= 70 ? 'warn' : 'danger'}">${pct}%</span></td>
              </tr>`;
          }).join('') : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-dim)">Nothing to report for this range</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}

function exportRows(rows, staff) {
  if (state.tab === 'reports') {
    if (!staff.length) return toast('Nothing to export', 'info');
    const workingDays = workingDaysInRange();
    return exportToCSV(`attendance-report-${state.from}-to-${state.to}.csv`, staff.map(e => ({
      Employee: e.name,
      Present: e.present,
      Absent: e.absent,
      Late: e.late,
      'Missing EOD': e.missingEod,
      'Total hours': hoursText(e.hours),
      'Avg per day': hoursText(e.avg),
      'Attendance %': workingDays ? Math.round((e.present / workingDays) * 100) : 0,
    })));
  }
  if (!rows.length) return toast('Nothing to export', 'info');
  exportToCSV(`attendance-${state.from}-to-${state.to}.csv`, rows.map(r => ({
    Employee: r.name,
    Date: r.date,
    'Check in': clock(r.clock_in),
    'Check out': clock(r.clock_out),
    Hours: hoursText(r.hours),
    Status: (STATE_BADGE[r.state] || {}).label || r.state,
    Location: r.location || '',
    Latitude: r.latitude || '',
    Longitude: r.longitude || '',
  })));
}
