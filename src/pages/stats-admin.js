// Stats — a live operations overview built around what needs doing right now:
// today's counters at the top, then what needs attention, money, the pipeline,
// who is performing, what kind of work is coming in, and how the volume is
// trending. Everything is derived client-side from the same tables the rest of
// the portal reads, so nothing here can drift from the lists.
import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { showLoader, calculateSLA } from '../utils.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dateKey = (d) => (d ? new Date(d).toLocaleDateString('en-CA') : '');
const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const num = (n) => Number(n) || 0;

const OPEN_STATUSES = new Set(['pending', 'open', 'assigned', 'in_progress', 'reopened', 'issue_not_resolved']);
const DONE_STATUSES = new Set(['resolved', 'closed', 'case_closed', 'foc']);

// Service items are free text, so group them the way the business talks about
// them rather than trusting an exact match.
const CATEGORIES = [
  { key: 'CCTV', match: /cctv|camera|dvr|nvr/i, color: 'var(--primary)' },
  { key: 'Networking', match: /network|router|wifi|lan|internet/i, color: '#3b82f6' },
  { key: 'Gate Automation', match: /gate|barrier|boom/i, color: '#f59e0b' },
  { key: 'VDP', match: /door phone|vdp|intercom|doorbell/i, color: '#8b5cf6' },
  { key: 'Biometric', match: /biometric|fingerprint|attendance machine|face/i, color: '#14b8a6' },
  { key: 'Access Control', match: /access control|lock|rfid/i, color: '#ef4444' },
];
const categoryOf = (item) => CATEGORIES.find(c => c.match.test(String(item || '')))?.key || 'Other';

const RANGES = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
];

let state = { range: 'today', trend: 7 };
let data = { inquiries: [], profiles: [], attendance: [], eod: [], complaints: [] };

export async function renderAdminStats(container) {
  showLoader(container);
  try {
    const [inq, prf, att, eod, cmp] = await Promise.all([
      supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('attendance').select('*').order('clock_in', { ascending: false }),
      supabase.from('eod_reports').select('*').order('date', { ascending: false }),
      supabase.from('complaints').select('*'),
    ]);
    data = {
      inquiries: inq.data || [],
      profiles: prf.data || [],
      attendance: att.data || [],
      eod: eod.data || [],
      complaints: cmp.data || [],
    };
  } catch (err) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:40px"><p style="color:var(--danger)">${esc(err.message)}</p></div>`;
    return;
  }
  paint(container);
  if (container._statsTimer) clearInterval(container._statsTimer);
  container._statsTimer = setInterval(() => {
    if (!document.body.contains(container)) return clearInterval(container._statsTimer);
    renderAdminStats(container);
  }, 120000);
}

function rangeRows() {
  const days = RANGES.find(r => r.key === state.range).days;
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return data.inquiries.filter(r => new Date(r.created_at) >= from);
}

function paint(container) {
  const today = dateKey(new Date());
  const rows = rangeRows();
  const rangeLabel = RANGES.find(r => r.key === state.range).label;

  const open = data.inquiries.filter(r => OPEN_STATUSES.has(String(r.status || '').toLowerCase()));
  const newCount = rows.length;
  const pendingAssign = open.filter(r => !r.assigned_employee_id).length;
  const inProgress = open.filter(r => String(r.status).toLowerCase() === 'in_progress').length;
  const resolvedToday = data.inquiries.filter(r => DONE_STATUSES.has(String(r.status || '').toLowerCase()) && dateKey(r.updated_at || r.created_at) === today).length;
  const overdue = open.filter(r => r.assigned_at && new Date() > calculateSLA(r.assigned_at)).length;

  container.innerHTML = `
    <div class="st2">
      <div class="page-header">
        <div>
          <h1>Stats</h1>
          <p>Live operations overview</p>
        </div>
        <div class="st2-rangewrap">
          ${ICONS.calendar || ''}
          <select id="st2-range">
            ${RANGES.map(r => `<option value="${r.key}"${state.range === r.key ? ' selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <section class="st2-card st2-ops">
        <header class="st2-head"><b>${esc(rangeLabel)}'s Operations</b></header>
        <div class="st2-opsgrid">
          ${opTile(ICONS.clipboard, newCount, 'New Requests', 'New service requests', 'blue')}
          ${opTile(ICONS.clock, pendingAssign, 'Pending Assignment', 'Waiting for technician', 'amber')}
          ${opTile(ICONS.wrench, inProgress, 'In Progress', 'Active jobs', 'violet')}
          ${opTile(ICONS.check, resolvedToday, 'Resolved Today', 'Completed jobs', 'green')}
          ${opTile(ICONS.alert, overdue, 'Overdue', 'Beyond SLA / target', 'red')}
        </div>
      </section>

      <div class="st2-row st2-row-2">
        ${attentionCard(open)}
        <div class="st2-stack">
          ${collectionCard(today)}
          ${pipelineCard(open)}
        </div>
      </div>

      <div class="st2-row st2-row-3">
        ${technicianCard(open)}
        ${categoriesCard(rows)}
        ${trendCard()}
      </div>

      ${revenueCard()}
    </div>
  `;

  container.querySelector('#st2-range').onchange = (e) => { state.range = e.target.value; paint(container); };
  container.querySelectorAll('[data-trend]').forEach(btn => {
    btn.onclick = () => { state.trend = Number(btn.dataset.trend); paint(container); };
  });
}

function opTile(icon, value, label, sub, tone) {
  return `
    <div class="st2-op tone-${tone}">
      <span class="st2-op-ico">${icon || ''}</span>
      <div class="st2-op-body">
        <span class="st2-op-label">${esc(label)}</span>
        <span class="st2-op-value">${value}</span>
        <span class="st2-op-sub">${esc(sub)}</span>
      </div>
    </div>`;
}

function attentionCard(open) {
  const today = dateKey(new Date());
  const unassigned = open.filter(r => !r.assigned_employee_id);
  const oldest = unassigned.reduce((acc, r) => {
    const t = new Date(r.created_at).getTime();
    return acc == null || t < acc ? t : acc;
  }, null);
  const oldestText = oldest == null ? '—' : (() => {
    const mins = Math.round((Date.now() - oldest) / 60000);
    const h = Math.floor(mins / 60);
    return h ? `Oldest: ${h}h ${mins % 60}m` : `Oldest: ${mins}m`;
  })();
  const overdue = open.filter(r => r.assigned_at && new Date() > calculateSLA(r.assigned_at));
  const unpaid = data.inquiries.filter(r => (num(r.bill_total) > 0 || num(r.bill_amount) > 0) && r.payment_status !== 'paid' && r.payment_status !== 'foc');
  const unpaidTotal = unpaid.reduce((s, r) => s + (num(r.bill_total) || num(r.bill_amount)), 0);
  const attendedToday = new Set(data.attendance.filter(a => dateKey(a.clock_in) === today).map(a => a.user_id));
  const eodToday = new Set(data.eod.filter(e => e.date === today).map(e => e.employee_id));
  const eodPending = [...attendedToday].filter(id => id && !eodToday.has(id)).length;
  const openComplaints = data.complaints.filter(c => !DONE_STATUSES.has(String(c.status || 'open').toLowerCase())).length;

  const rows = [
    { icon: ICONS.clipboard, label: 'Unassigned Requests', value: unassigned.length, note: oldestText, tone: 'red' },
    { icon: ICONS.clock, label: 'Overdue Requests', value: overdue.length, note: 'Need immediate action', tone: 'red' },
    { icon: ICONS.receipt, label: 'Unpaid Bills', value: unpaid.length, note: `${money(unpaidTotal)} pending`, tone: 'amber' },
    { icon: ICONS.clipboard, label: 'EOD Pending', value: eodPending, note: 'Technicians', tone: 'amber' },
    { icon: ICONS.shield, label: 'Complaints', value: openComplaints, note: 'Open', tone: openComplaints ? 'red' : 'muted' },
  ];

  return `
    <section class="st2-card">
      <header class="st2-head st2-head-danger">${ICONS.alert || ''}<b>Attention Required</b></header>
      <div class="st2-attn">
        ${rows.map(r => `
          <div class="st2-attn-row">
            <span class="st2-attn-ico tone-${r.tone}">${r.icon || ''}</span>
            <span class="st2-attn-label">${esc(r.label)}</span>
            <b class="st2-attn-value tone-${r.tone}">${r.value}</b>
            <span class="st2-attn-note">${esc(r.note)}</span>
          </div>`).join('')}
      </div>
    </section>`;
}

function collectionCard(today) {
  const billedToday = data.inquiries
    .filter(r => dateKey(r.bill_generated_at || r.updated_at) === today)
    .reduce((s, r) => s + (num(r.bill_total) || num(r.bill_amount)), 0);
  const collectedToday = data.inquiries
    .filter(r => r.payment_status === 'paid' && dateKey(r.payment_received_at || r.updated_at) === today)
    .reduce((s, r) => s + (num(r.bill_total) || num(r.bill_amount)), 0);
  const unpaid = data.inquiries.filter(r => (num(r.bill_total) > 0 || num(r.bill_amount) > 0) && r.payment_status !== 'paid' && r.payment_status !== 'foc');
  const pending = unpaid.reduce((s, r) => s + (num(r.bill_total) || num(r.bill_amount)), 0);

  return `
    <section class="st2-card">
      <header class="st2-head">${ICONS.rupee || ''}<b>Collection Overview</b></header>
      <div class="st2-quad">
        ${quad("Today's Billing", money(billedToday))}
        ${quad('Collected Today', money(collectedToday), 'green')}
        ${quad('Pending Collection', money(pending), 'amber')}
        ${quad('Unpaid Bills', unpaid.length, 'red')}
      </div>
    </section>`;
}

function quad(label, value, tone = '') {
  return `
    <div class="st2-quad-cell">
      <span class="st2-quad-label">${esc(label)}</span>
      <span class="st2-quad-value ${tone ? 'tone-' + tone : ''}">${value}</span>
    </div>`;
}

function pipelineCard(open) {
  const s = (name) => String(name || '').toLowerCase();
  const stages = [
    { label: 'New', tone: 'blue', n: open.filter(r => ['open', 'pending'].includes(s(r.status)) && !r.assigned_employee_id).length },
    { label: 'Pending', tone: 'amber', n: open.filter(r => r.assigned_employee_id && r.assignment_status === 'pending').length },
    { label: 'Assigned', tone: 'sky', n: open.filter(r => r.assigned_employee_id && r.assignment_status === 'accepted' && s(r.status) !== 'in_progress').length },
    { label: 'In Progress', tone: 'violet', n: open.filter(r => s(r.status) === 'in_progress').length },
    { label: 'Reopened', tone: 'amber', n: open.filter(r => Number(r.reopened) === 1).length },
    { label: 'Resolved', tone: 'green', n: data.inquiries.filter(r => ['resolved', 'closed', 'foc'].includes(s(r.status))).length },
    { label: 'Issue', tone: 'red', n: data.inquiries.filter(r => s(r.status) === 'issue_not_resolved').length },
  ];
  return `
    <section class="st2-card">
      <header class="st2-head">${ICONS.refresh || ''}<b>Service Pipeline</b><span class="st2-head-note">Total active: ${open.length}</span></header>
      <div class="st2-pipe">
        ${stages.map(st => `
          <div class="st2-pipe-step tone-${st.tone}">
            <span class="st2-pipe-label">${esc(st.label)}</span>
            <b class="st2-pipe-value">${st.n}</b>
          </div>`).join('')}
      </div>
    </section>`;
}

function technicianCard(open) {
  const techs = data.profiles.filter(p => p.role === 'employee');
  const rows = techs.map(t => {
    const mine = data.inquiries.filter(r => r.assigned_employee_id === t.id);
    const done = mine.filter(r => DONE_STATUSES.has(String(r.status || '').toLowerCase()));
    const onTime = done.filter(r => r.assigned_at && new Date(r.updated_at || r.created_at) <= calculateSLA(r.assigned_at)).length;
    const active = mine.filter(r => OPEN_STATUSES.has(String(r.status || '').toLowerCase()));
    return {
      name: t.full_name || 'Employee',
      active: active.length,
      completed: done.length,
      onTime: done.length ? Math.round((onTime / done.length) * 100) : null,
      pending: active.filter(r => !r.employee_update_at).length,
    };
  }).filter(r => r.active || r.completed)
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 8);

  return `
    <section class="st2-card">
      <header class="st2-head">${ICONS.users || ''}<b>Technician Performance</b></header>
      <div class="st2-tbl-wrap">
        <table class="st2-tbl">
          <thead><tr><th>Technician</th><th>Active</th><th>Completed</th><th>On-time</th><th>Pending</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `
              <tr>
                <td><span class="st2-dot"></span>${esc(r.name)}</td>
                <td>${r.active}</td>
                <td>${r.completed}</td>
                <td class="${r.onTime == null ? '' : r.onTime >= 90 ? 'tone-green' : r.onTime >= 75 ? 'tone-amber' : 'tone-red'}">${r.onTime == null ? '—' : r.onTime + '%'}</td>
                <td>${r.pending}</td>
              </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:18px">No technician activity yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`;
}

function categoriesCard(rows) {
  const counts = new Map();
  rows.forEach(r => {
    const k = categoryOf(r.service_item);
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  const total = rows.length || 1;
  const list = [...CATEGORIES.map(c => c.key), 'Other']
    .map(key => ({ key, n: counts.get(key) || 0, color: CATEGORIES.find(c => c.key === key)?.color || 'var(--text-dim)' }))
    .filter(c => c.n)
    .sort((a, b) => b.n - a.n);

  return `
    <section class="st2-card">
      <header class="st2-head">${ICONS.box || ''}<b>Service Categories</b></header>
      <div class="st2-cats">
        ${list.length ? list.map(c => {
          const pct = Math.round((c.n / total) * 100);
          return `
            <div class="st2-cat">
              <span class="st2-cat-dot" style="background:${c.color}"></span>
              <span class="st2-cat-name">${esc(c.key)}</span>
              <b class="st2-cat-n">${c.n}</b>
              <span class="st2-cat-pct">${pct}%</span>
              <span class="st2-cat-bar"><i style="width:${pct}%;background:${c.color}"></i></span>
            </div>`;
        }).join('') : '<div class="st2-empty">No requests in this range</div>'}
      </div>
    </section>`;
}

function trendCard() {
  const days = state.trend;
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    buckets.push({ key, label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), n: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  data.inquiries.forEach(r => {
    const i = index.get(dateKey(r.created_at));
    if (i != null) buckets[i].n++;
  });

  const max = Math.max(1, ...buckets.map(b => b.n));
  const W = 100, H = 46;
  const pts = buckets.map((b, i) => {
    const x = buckets.length === 1 ? W / 2 : (i / (buckets.length - 1)) * W;
    const y = H - (b.n / max) * (H - 6) - 3;
    return [x, y];
  });
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const ticks = buckets.filter((_, i) => i === 0 || i === buckets.length - 1 || i === Math.floor(buckets.length / 2));

  return `
    <section class="st2-card">
      <header class="st2-head">
        ${ICONS.chart || ICONS.clipboard || ''}<b>Service Requests Trend</b>
        <span class="st2-trendbtns">
          ${[7, 30, 90].map(d => `<button class="st2-trendbtn${state.trend === d ? ' on' : ''}" data-trend="${d}">${d} Days</button>`).join('')}
        </span>
      </header>
      <div class="st2-trend">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="st2-chart">
          <defs>
            <linearGradient id="st2grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#st2grad)"></path>
          <path d="${line}" fill="none" stroke="var(--primary)" stroke-width="0.8" vector-effect="non-scaling-stroke"></path>
        </svg>
        <div class="st2-trend-x">${ticks.map(t => `<span>${esc(t.label)}</span>`).join('')}</div>
        <div class="st2-trend-foot">
          <span><b>${buckets.reduce((s, b) => s + b.n, 0)}</b> requests in ${days} days</span>
          <span>Peak <b>${max}</b> in a day</span>
        </div>
      </div>
    </section>`;
}

function revenueCard() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ofMonth = data.inquiries.filter(r => String(dateKey(r.bill_generated_at || r.created_at)).startsWith(monthKey));
  const billed = ofMonth.reduce((s, r) => s + (num(r.bill_total) || num(r.bill_amount)), 0);
  const collected = ofMonth.filter(r => r.payment_status === 'paid').reduce((s, r) => s + (num(r.bill_total) || num(r.bill_amount)), 0);
  const unpaid = ofMonth.filter(r => (num(r.bill_total) > 0 || num(r.bill_amount) > 0) && r.payment_status !== 'paid' && r.payment_status !== 'foc');
  const pending = unpaid.reduce((s, r) => s + (num(r.bill_total) || num(r.bill_amount)), 0);

  return `
    <section class="st2-card">
      <header class="st2-head">${ICONS.rupee || ''}<b>Revenue & Collection</b><span class="st2-head-note">This month</span></header>
      <div class="st2-quad">
        ${quad('Total Billed', money(billed))}
        ${quad('Collected', money(collected), 'green')}
        ${quad('Pending', money(pending), 'amber')}
        ${quad('Unpaid Bills', unpaid.length, 'red')}
      </div>
    </section>`;
}


