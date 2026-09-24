// Response Times — who was late, and by how much. Two clocks, both two
// working hours long (09:30–19:00, Sundays off): the office has two hours to
// assign an incoming request, and the technician has two hours after that to
// post their first status update. The server writes a row whenever a clock
// runs out (see sweepResponseSla) and closes it when the response finally
// lands, so this screen is a record, not a live guess.
import { toast, exportToCSV } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` });

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ymd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const fmt = (v) => v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const mins = (n) => {
  if (n == null) return '—';
  const h = Math.floor(n / 60);
  return h ? `${h}h ${n % 60}m` : `${n}m`;
};

const KINDS = {
  assignment: { label: 'Late to assign', who: 'Office' },
  employee: { label: 'Late employee update', who: 'Technician' },
};

const filters = { from: '', to: '', kind: '' };
let rows = [];

export async function renderResponseTimesTab(container) {
  const today = ymd(new Date());
  const monthAgo = ymd(new Date(Date.now() - 29 * 86400000));
  filters.from = filters.from || monthAgo;
  filters.to = filters.to || today;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.clock}</span>
          <span>Response Times</span>
        </h1>
        <p>Every request must be assigned within 2 working hours (9:30 AM – 7 PM), and the technician has 2 working hours after that to post an update. Missed clocks are recorded here.</p>
      </div>
      <button class="btn btn-secondary" id="rt-export">${ICONS.download}<span>Export CSV</span></button>
    </div>

    <div id="rt-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:18px;"></div>

    <div class="card" style="margin-bottom:18px;">
      <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;align-items:end;">
        <div class="form-group" style="margin:0;"><label>From</label><input type="date" id="rt-from" value="${filters.from}"></div>
        <div class="form-group" style="margin:0;"><label>To</label><input type="date" id="rt-to" value="${filters.to}"></div>
        <div class="form-group" style="margin:0;"><label>Type</label>
          <select id="rt-kind">
            <option value="">Both</option>
            <option value="assignment">Late to assign</option>
            <option value="employee">Late employee update</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Ticket</th><th>Customer</th><th>Type</th><th>Who</th>
          <th>Clock started</th><th>Due by</th><th>Responded</th><th>Late by</th>
        </tr></thead>
        <tbody id="rt-body"><tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-dim)">Loading…</td></tr></tbody>
      </table></div>
    </div>
  `;

  const $ = (s) => container.querySelector(s);
  $('#rt-from').onchange = (e) => { filters.from = e.target.value; load(container); };
  $('#rt-to').onchange = (e) => { filters.to = e.target.value; load(container); };
  $('#rt-kind').onchange = (e) => { filters.kind = e.target.value; load(container); };
  $('#rt-export').onclick = () => {
    if (!rows.length) return toast('Nothing to export', 'info');
    exportToCSV(`response-times-${filters.from}-to-${filters.to}.csv`, rows.map(r => ({
      Ticket: r.ticket_no || '',
      Customer: r.full_name || '',
      Phone: r.phone || '',
      Service: r.service_item || '',
      Type: KINDS[r.kind]?.label || r.kind,
      Who: r.kind === 'employee' ? (r.employee_name || 'Unassigned') : 'Office',
      'Clock started': fmt(r.started_at),
      'Due by': fmt(r.due_at),
      Responded: fmt(r.responded_at),
      'Responded in (working mins)': r.response_minutes ?? '',
    })));
  };

  load(container);
}

async function load(container) {
  const body = container.querySelector('#rt-body');
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  try {
    rows = await api(`/response-times${qs ? '?' + qs : ''}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--danger)">${esc(err.message)}</td></tr>`;
    return;
  }
  paintSummary(container);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-dim)">No missed response times in this range 🎉</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r => {
    const open = !r.responded_at;
    return `<tr>
      <td style="font-family:monospace;white-space:nowrap">${esc(r.ticket_no || '—')}</td>
      <td>${esc(r.full_name || '')}${r.service_item ? `<div style="font-size:0.78rem;color:var(--text-dim)">${esc(r.service_item)}</div>` : ''}</td>
      <td><span class="badge ${r.kind === 'assignment' ? 'badge-danger' : 'badge-pending'}">${esc(KINDS[r.kind]?.label || r.kind)}</span></td>
      <td>${esc(r.kind === 'employee' ? (r.employee_name || 'Unassigned') : 'Office')}</td>
      <td style="white-space:nowrap">${esc(fmt(r.started_at))}</td>
      <td style="white-space:nowrap">${esc(fmt(r.due_at))}</td>
      <td style="white-space:nowrap">${open ? '<span style="color:var(--danger);font-weight:700">Still waiting</span>' : esc(fmt(r.responded_at))}</td>
      <td style="white-space:nowrap">${open ? '—' : esc(mins(Math.max(0, (r.response_minutes || 0) - 120)))}</td>
    </tr>`;
  }).join('');
}

function paintSummary(container) {
  const el = container.querySelector('#rt-summary');
  const assignment = rows.filter(r => r.kind === 'assignment');
  const employee = rows.filter(r => r.kind === 'employee');
  const stillOpen = rows.filter(r => !r.responded_at);
  const answered = rows.filter(r => r.responded_at && r.response_minutes != null);
  const avg = answered.length ? Math.round(answered.reduce((s, r) => s + r.response_minutes, 0) / answered.length) : null;

  const cards = [
    { label: 'Late to assign', value: assignment.length, color: 'var(--danger)' },
    { label: 'Late employee update', value: employee.length, color: 'var(--warning)' },
    { label: 'Still waiting', value: stillOpen.length, color: 'var(--danger)' },
    { label: 'Avg response (late ones)', value: avg == null ? '—' : mins(avg), color: 'var(--primary)' },
  ];
  el.innerHTML = cards.map(c => `
    <div class="card" style="padding:16px;border-left:4px solid ${c.color};">
      <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim)">${c.label}</div>
      <div style="font-size:1.4rem;font-weight:800;color:${c.color};margin-top:4px">${c.value}</div>
    </div>`).join('');
}

// ── Dashboard alert ─────────────────────────────────
// Requests whose 2-working-hour assignment clock has already run out and that
// still have nobody on them. Shown once per session per ticket so it nags
// without becoming wallpaper.
export async function fetchAssignmentAlerts() {
  try {
    return await api('/response-times/alerts');
  } catch {
    return [];
  }
}
