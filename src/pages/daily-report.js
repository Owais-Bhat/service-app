// Daily Report — the end-of-day text for the staff WhatsApp group.
//
// Who clocked in and when, what each person collected, what was invoiced. The
// page only builds the text and opens WhatsApp with it: the admin picks the
// group and presses send. Nothing is posted automatically. At 17:30 the server
// pushes a "daily report is ready" notification that brings the admin here.
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
const num = (v) => Number(v) || 0;
const inr = (v) => `₹${Math.round(num(v)).toLocaleString('en-IN')}`;
const rupees = (paise) => num(paise) / 100;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const clock = (v) => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

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

const paidDay = (r) => dayKey(r.payment_received_at || r.cash_collected_at || r.bill_generated_at || r.created_at);

const state = { date: '', report: null, text: '' };

async function buildReport(date) {
  const [att, prof, eod, paid, docs, rec] = await Promise.all([
    supabase.from('attendance').select('*, profiles(full_name)').order('date', { ascending: false }),
    supabase.from('profiles').select('id, full_name, worker_type').eq('role', 'employee'),
    supabase.from('eod_reports').select('employee_id, date'),
    supabase.from('inquiries').select('*').eq('payment_status', 'paid').order('payment_received_at', { ascending: false }),
    api(`/sales/documents?doc_type=invoice&from=${date}&to=${date}`).catch(() => null),
    api(`/payments?from=${date}&to=${date}&direction=in`).catch(() => null),
  ]);
  const failed = [att, prof, eod, paid].find(r => r.error);
  if (failed) throw new Error(failed.error.message || 'Could not load the data');

  const eodSet = new Set((eod.data || []).map(e => `${e.employee_id}|${dayKey(e.date)}`));
  const people = new Map();
  const person = (id, name, worker) => {
    if (!people.has(id)) {
      people.set(id, {
        id, name: name || 'Employee', worker: worker === 'gig' ? 'Gig' : 'Fixed',
        clockIn: null, clockOut: null, late: false, eod: eodSet.has(`${id}|${date}`),
        jobs: 0, cash: 0, online: 0,
      });
    }
    return people.get(id);
  };

  (prof.data || []).forEach(p => person(p.id, p.full_name, p.worker_type));

  (att.data || [])
    .filter(r => r.clock_in && dayKey(r.date || r.clock_in) === date)
    .forEach(r => {
      const s = person(r.user_id, r.profiles?.full_name);
      // Several clock-ins in a day: the first one counts, the last clock-out.
      if (!s.clockIn || new Date(r.clock_in) < new Date(s.clockIn)) s.clockIn = r.clock_in;
      if (r.clock_out && (!s.clockOut || new Date(r.clock_out) > new Date(s.clockOut))) s.clockOut = r.clock_out;
    });
  people.forEach(s => {
    if (!s.clockIn) return;
    const t = new Date(s.clockIn);
    s.late = t.getHours() * 60 + t.getMinutes() > LATE_AFTER_MIN;
  });

  (paid.data || [])
    .filter(r => num(r.bill_total) > 0 && paidDay(r) === date)
    .forEach(r => {
      const id = r.assigned_employee_id || r.claimed_by_gig_worker_id;
      if (!id) return;
      const s = person(id, null);
      const amount = num(r.bill_total);
      s.jobs += 1;
      if (String(r.payment_method || '').toLowerCase() === 'cash') s.cash += amount; else s.online += amount;
    });

  const everyone = [...people.values()];
  const staff = everyone.filter(s => s.clockIn || s.jobs > 0)
    .sort((a, b) => String(a.clockIn || '9').localeCompare(String(b.clockIn || '9')) || a.name.localeCompare(b.name));
  const present = staff.filter(s => s.clockIn);
  const sunday = new Date(`${date}T00:00:00`).getDay() === 0;
  const notIn = sunday ? [] : (prof.data || []).filter(p => !present.some(s => s.id === p.id)).map(p => p.full_name || 'Employee');
  const eodPending = present.filter(s => !s.eod).map(s => s.name);

  const invoices = Array.isArray(docs)
    ? docs.filter(d => dayKey(d.doc_date) === date && !['draft', 'cancelled', 'void'].includes(String(d.status || '').toLowerCase()))
    : null;
  const dayReceipts = Array.isArray(rec) ? rec.filter(r => dayKey(r.payment_date) === date) : null;

  const cash = everyone.reduce((n, s) => n + s.cash, 0);
  const online = everyone.reduce((n, s) => n + s.online, 0);
  return {
    date, staff, notIn, eodPending,
    totals: {
      present: present.length, late: present.filter(s => s.late).length,
      jobs: everyone.reduce((n, s) => n + s.jobs, 0), cash, online, collected: cash + online,
    },
    sales: invoices ? {
      count: invoices.length,
      total: invoices.reduce((n, d) => n + rupees(d.total_paise), 0),
      lines: invoices.map(d => ({ docNo: d.doc_no, party: d.party_name || 'Customer', total: rupees(d.total_paise) })),
    } : null,
    receipts: dayReceipts ? { count: dayReceipts.length, total: dayReceipts.reduce((n, r) => n + rupees(r.amount_paise), 0) } : null,
  };
}

// WhatsApp formatting: *bold*. Short lines so it reads well in a group.
function buildText(r) {
  const pretty = new Date(`${r.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const out = [`*Daily Report – ${pretty}*`];

  out.push('', `*Attendance* (${r.totals.present} clocked in${r.totals.late ? `, ${r.totals.late} late` : ''})`);
  const present = r.staff.filter(s => s.clockIn);
  if (!present.length) out.push('Nobody clocked in');
  present.forEach(s => out.push(`• ${s.name} – in ${clock(s.clockIn)}${s.late ? ' (late)' : ''}, ${s.clockOut ? `out ${clock(s.clockOut)}` : 'still on duty'}`));
  if (r.notIn.length) out.push(`Not clocked in: ${r.notIn.join(', ')}`);

  out.push('', `*Collections* – ${inr(r.totals.collected)}`);
  if (r.totals.collected > 0) out.push(`Cash ${inr(r.totals.cash)} · Online ${inr(r.totals.online)}`);
  const collectors = r.staff.filter(s => s.jobs > 0);
  if (!collectors.length) out.push('No payments collected');
  collectors.forEach(s => out.push(`• ${s.name} – ${inr(s.cash + s.online)} (${s.jobs} job${s.jobs === 1 ? '' : 's'})`));

  if (r.sales) {
    out.push('', `*Sales* – ${r.sales.count} invoice${r.sales.count === 1 ? '' : 's'}, ${inr(r.sales.total)}`);
    r.sales.lines.slice(0, 12).forEach(l => out.push(`• ${l.docNo} · ${l.party} – ${inr(l.total)}`));
    if (r.sales.lines.length > 12) out.push(`…and ${r.sales.lines.length - 12} more`);
  }
  if (r.receipts && r.receipts.count > 0) out.push(`Receipts recorded: ${r.receipts.count} · ${inr(r.receipts.total)}`);
  if (r.eodPending.length) out.push('', `*EOD pending:* ${r.eodPending.join(', ')}`);
  return out.join('\n');
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
    state.text = buildText(state.report);
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

function paint(container) {
  const r = state.report;
  const t = r.totals;
  const th = 'text-align:left;padding:9px 10px;font-size:.78rem;color:var(--text-dim);border-bottom:1px solid var(--border);';
  const td = 'padding:10px;border-bottom:1px solid var(--border);font-size:.92rem;';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Daily Report</h1>
        <p>Clock-ins, collections and sales — review it, then send it to the WhatsApp group</p>
      </div>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div class="form-group" style="margin:0;"><label>Date</label><input type="date" id="dr-date" value="${esc(state.date)}" max="${esc(ymd(new Date()))}"></div>
        <button class="btn btn-secondary" id="dr-refresh">${ICONS.refresh || ''}<span>Refresh</span></button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px;">
      ${kpi('Clocked in', `${t.present}${t.late ? ` (${t.late} late)` : ''}`, 'var(--success, #15a05a)')}
      ${kpi('Collected', inr(t.collected))}
      ${kpi('Jobs paid', t.jobs)}
      ${kpi('Sales', r.sales ? inr(r.sales.total) : '—')}
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div class="card-header"><span class="card-title">Message</span></div>
      <div class="card-body">
        <textarea id="dr-text" rows="16" style="width:100%;font-family:inherit;font-size:.95rem;line-height:1.5;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface, transparent);color:inherit;resize:vertical;"></textarea>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="dr-send" style="background:#25D366;border-color:#25D366;">
            <span style="width:16px;height:16px;display:inline-flex;vertical-align:middle;margin-right:6px;">${ICONS.whatsapp || ''}</span>Send on WhatsApp
          </button>
          <button class="btn btn-secondary" id="dr-copy">Copy text</button>
          <button class="btn btn-secondary" id="dr-reset">Reset text</button>
        </div>
        <p style="color:var(--text-dim);font-size:.85rem;margin:12px 0 0;">
          WhatsApp opens with this text. Pick the group and press send yourself — nothing is posted automatically.
          You can edit the message above first. A reminder arrives here every day at 5:30 PM.
        </p>
        ${r.sales === null ? '<p style="color:var(--warning, #b7791f);font-size:.85rem;margin:8px 0 0;">Sales could not be read, so they are left out of the message.</p>' : ''}
      </div>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div class="card-header"><span class="card-title">Attendance</span></div>
      <div class="card-body" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th style="${th}">Employee</th><th style="${th}">In</th><th style="${th}">Out</th><th style="${th}">Status</th><th style="${th}">EOD</th></tr></thead>
          <tbody>
            ${r.staff.filter(s => s.clockIn).map(s => `
              <tr>
                <td style="${td}"><b>${esc(s.name)}</b></td>
                <td style="${td}">${clock(s.clockIn)}</td>
                <td style="${td}">${s.clockOut ? clock(s.clockOut) : 'On duty'}</td>
                <td style="${td}color:${s.late ? 'var(--warning, #b7791f)' : 'var(--success, #15a05a)'};font-weight:700;">${s.late ? 'Late' : 'On time'}</td>
                <td style="${td}">${s.eod ? 'Done' : 'Pending'}</td>
              </tr>`).join('') || `<tr><td style="${td}" colspan="5">Nobody clocked in on this day.</td></tr>`}
          </tbody>
        </table>
        ${r.notIn.length ? `<p style="margin:12px 0 0;color:var(--danger);font-size:.9rem;"><b>Not clocked in:</b> ${esc(r.notIn.join(', '))}</p>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Collections</span></div>
      <div class="card-body" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th style="${th}">Employee</th><th style="${th}">Jobs</th><th style="${th}">Cash</th><th style="${th}">Online</th><th style="${th}">Total</th></tr></thead>
          <tbody>
            ${r.staff.filter(s => s.jobs > 0).map(s => `
              <tr>
                <td style="${td}"><b>${esc(s.name)}</b></td>
                <td style="${td}">${s.jobs}</td>
                <td style="${td}">${inr(s.cash)}</td>
                <td style="${td}">${inr(s.online)}</td>
                <td style="${td}font-weight:800;">${inr(s.cash + s.online)}</td>
              </tr>`).join('') || `<tr><td style="${td}" colspan="5">No payments collected on this day.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const $ = (s) => container.querySelector(s);
  const box = $('#dr-text');
  box.value = state.text;

  $('#dr-date').onchange = (e) => {
    if (!e.target.value) return;
    state.date = e.target.value;
    renderDailyReportTab(container);
  };
  $('#dr-refresh').onclick = () => renderDailyReportTab(container);
  $('#dr-reset').onclick = () => { box.value = state.text; };
  $('#dr-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(box.value);
      toast('Copied — paste it into the WhatsApp group', 'success');
    } catch {
      box.select();
      toast('Press Ctrl+C to copy the selected text', 'info');
    }
  };
  $('#dr-send').onclick = () => {
    const text = box.value.trim();
    if (!text) { toast('The message is empty', 'warning'); return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    try { localStorage.setItem('daily-report-sent', state.report.date); } catch { /* cosmetic */ }
  };
}
