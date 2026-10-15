// Daily Report — two WhatsApp messages for the staff group.
//
//   1. Attendance: every employee and the time they clocked in.
//   2. Pending jobs: per employee, each open job with its ticket number, the
//      customer it is for and its SLA deadline.
//
// The page only builds the text and opens WhatsApp with it: the admin picks the
// group and presses send, once per message. Nothing is posted automatically. At
// 17:30 the server pushes a "daily report is ready" notification that brings the
// admin here.
import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { showLoader, toast } from '../utils.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const clock = (v) => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase() : '';
const dayTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${clock(d)}`;
};

// Same cut-off the Attendance page uses.
const LATE_AFTER_MIN = 10 * 60;

// DATE columns can arrive as full ISO timestamps, SQL datetimes or plain
// YYYY-MM-DD; all of them are reduced to the local calendar day.
function dayKey(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const sql = /^(\d{4}-\d{2}-\d{2}) \d{2}:/.exec(s);
  if (sql) return sql[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : ymd(d);
}

const state = { date: '', report: null, attText: '', pendText: '' };

async function buildReport(date) {
  const [att, prof, jobs] = await Promise.all([
    supabase.from('attendance').select('*').order('date', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('role', 'employee'),
    api('/admin/pending-jobs').catch(() => null),
  ]);
  const failed = [att, prof].find(r => r.error);
  if (failed) throw new Error(failed.error.message || 'Could not load the data');

  const first = new Map(); // employee id -> earliest clock-in that day
  (att.data || [])
    .filter(r => r.clock_in && dayKey(r.date || r.clock_in) === date)
    .forEach(r => {
      const cur = first.get(r.user_id);
      if (!cur || new Date(r.clock_in) < new Date(cur)) first.set(r.user_id, r.clock_in);
    });

  const attendance = (prof.data || [])
    .map(p => {
      const clockIn = first.get(p.id) || null;
      const t = clockIn ? new Date(clockIn) : null;
      return { id: p.id, name: p.full_name || 'Employee', clockIn, late: !!t && t.getHours() * 60 + t.getMinutes() > LATE_AFTER_MIN };
    })
    // Clocked-in first (earliest first), then the ones who are not in.
    .sort((a, b) => (a.clockIn && b.clockIn) ? new Date(a.clockIn) - new Date(b.clockIn)
      : a.clockIn ? -1 : b.clockIn ? 1 : a.name.localeCompare(b.name));

  const groups = new Map();
  (Array.isArray(jobs) ? jobs : []).forEach(j => {
    const id = j.employee_id;
    if (!groups.has(id)) groups.set(id, { id, name: j.employee_name || 'Employee', jobs: [] });
    groups.get(id).jobs.push({
      ticket: j.ticket_no || '—',
      customer: j.full_name || 'Customer',
      service: j.service_item || '',
      deadline: j.sla_deadline,
      paused: !!j.sla_paused,
      overdue: !!j.overdue,
    });
  });
  const pending = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  pending.forEach(g => g.jobs.sort((a, b) => (a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity)));

  return {
    date,
    attendance,
    present: attendance.filter(a => a.clockIn).length,
    late: attendance.filter(a => a.late).length,
    pending,
    pendingKnown: Array.isArray(jobs),
    pendingTotal: pending.reduce((n, g) => n + g.jobs.length, 0),
    overdueTotal: pending.reduce((n, g) => n + g.jobs.filter(j => j.overdue).length, 0),
  };
}

const clip = (v, n) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// WhatsApp does not draw tables, but a ``` block is monospaced, so padded
// columns line up exactly like a table.
function monoTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  return ['```', line(headers), widths.map(w => '-'.repeat(w)).join('  '), ...rows.map(line), '```'].join('\n');
}

const prettyDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function buildAttendanceText(r) {
  const rows = r.attendance.map(a => [clip(a.name, 22), a.clockIn ? `${clock(a.clockIn)}${a.late ? ' (late)' : ''}` : 'Not in']);
  const head = `*Attendance – ${prettyDate(r.date)}*\n${r.present} of ${r.attendance.length} clocked in`;
  return rows.length ? `${head}\n\n${monoTable(['Employee', 'Clock-in'], rows)}` : `${head}\n\nNo employees found.`;
}

function slaCell(j) {
  if (!j.deadline) return '—';
  if (j.paused) return `${dayTime(j.deadline)} (paused)`;
  return `${dayTime(j.deadline)}${j.overdue ? ' LATE' : ''}`;
}

function buildPendingText(r) {
  const now = new Date();
  const head = `*Pending jobs – ${prettyDate(ymd(now))}, ${clock(now)}*`;
  if (!r.pendingKnown) return `${head}\n\nPending jobs could not be loaded.`;
  if (!r.pending.length) return `${head}\n\nNo pending jobs.`;
  const parts = [`${head}\n${r.pendingTotal} pending${r.overdueTotal ? ` · ${r.overdueTotal} past SLA` : ''}`];
  r.pending.forEach(g => {
    const rows = g.jobs.map(j => [clip(j.ticket, 18), clip(j.customer, 22), slaCell(j)]);
    parts.push(`*${g.name}* – ${g.jobs.length} job${g.jobs.length === 1 ? '' : 's'}\n${monoTable(['Ticket', 'Customer', 'SLA'], rows)}`);
  });
  return parts.join('\n\n');
}

const kpi = (label, value, color) => `
  <div class="card" style="padding:14px 16px;">
    <div style="font-size:.78rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em;">${esc(label)}</div>
    <div style="font-size:1.55rem;font-weight:800;margin-top:4px;${color ? `color:${color};` : ''}">${esc(value)}</div>
  </div>`;

export async function renderDailyReportTab(container) {
  if (!state.date) state.date = ymd(new Date());
  showLoader(container);
  try {
    state.report = await buildReport(state.date);
    state.attText = buildAttendanceText(state.report);
    state.pendText = buildPendingText(state.report);
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

const messageCard = (id, title, note) => `
  <div class="card" style="margin-bottom:18px;">
    <div class="card-header"><span class="card-title">${esc(title)}</span></div>
    <div class="card-body">
      <textarea id="dr-${id}-text" rows="${id === 'att' ? 12 : 18}" style="width:100%;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.88rem;line-height:1.5;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface, transparent);color:inherit;resize:vertical;"></textarea>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="dr-${id}-send" style="background:#25D366;border-color:#25D366;">
          <span style="width:16px;height:16px;display:inline-flex;vertical-align:middle;margin-right:6px;">${ICONS.whatsapp || ''}</span>Send on WhatsApp
        </button>
        <button class="btn btn-secondary" id="dr-${id}-copy">Copy text</button>
        <button class="btn btn-secondary" id="dr-${id}-reset">Reset text</button>
      </div>
      ${note ? `<p style="color:var(--text-dim);font-size:.85rem;margin:12px 0 0;">${note}</p>` : ''}
    </div>
  </div>`;

function paint(container) {
  const r = state.report;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Daily Report</h1>
        <p>Two WhatsApp messages: attendance and pending jobs. Review each, then send it to the group yourself.</p>
      </div>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div class="form-group" style="margin:0;"><label>Attendance date</label><input type="date" id="dr-date" value="${esc(state.date)}" max="${esc(ymd(new Date()))}"></div>
        <button class="btn btn-secondary" id="dr-refresh">${ICONS.refresh || ''}<span>Refresh</span></button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px;">
      ${kpi('Clocked in', `${r.present} / ${r.attendance.length}`, 'var(--success, #15a05a)')}
      ${kpi('Late', r.late, r.late ? 'var(--warning, #b7791f)' : '')}
      ${kpi('Pending jobs', r.pendingKnown ? r.pendingTotal : '—')}
      ${kpi('Past SLA', r.pendingKnown ? r.overdueTotal : '—', r.overdueTotal ? 'var(--danger)' : '')}
    </div>

    ${messageCard('att', 'Message 1 — Attendance', 'Everyone who is not clocked in shows as “Not in”. You can edit the text before sending.')}
    ${messageCard('pend', 'Message 2 — Pending jobs', 'Open jobs per employee with the SLA deadline, as of right now (the date above does not change this one). “LATE” means the SLA time has already passed.')}
  `;

  const $ = (s) => container.querySelector(s);
  $('#dr-date').onchange = (e) => {
    if (!e.target.value) return;
    state.date = e.target.value;
    renderDailyReportTab(container);
  };
  $('#dr-refresh').onclick = () => renderDailyReportTab(container);

  const wire = (id, original) => {
    const box = $(`#dr-${id}-text`);
    box.value = original;
    $(`#dr-${id}-reset`).onclick = () => { box.value = original; };
    $(`#dr-${id}-copy`).onclick = async () => {
      try {
        await navigator.clipboard.writeText(box.value);
        toast('Copied — paste it into the WhatsApp group', 'success');
      } catch {
        box.select();
        toast('Press Ctrl+C to copy the selected text', 'info');
      }
    };
    $(`#dr-${id}-send`).onclick = () => {
      const text = box.value.trim();
      if (!text) { toast('The message is empty', 'warning'); return; }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      try { localStorage.setItem('daily-report-sent', ymd(new Date())); } catch { /* cosmetic */ }
    };
  };
  wire('att', state.attText);
  wire('pend', state.pendText);
}
