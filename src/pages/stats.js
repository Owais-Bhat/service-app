// Stats Dashboard — live computed metrics + user-defined custom stat cards.
// Admin sees org-wide stats; employee sees personal stats.
// Custom cards are persisted in localStorage per role.

import { supabase } from '../supabase.js';
import { showLoader, toast, calculateSLA } from '../utils.js';
import { ICONS } from '../icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dateKey = (d) => (d ? new Date(d).toLocaleDateString('en-CA') : '');
const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const ICON_OPTS = [
  { key: 'check',     svg: ICONS.check },
  { key: 'ticket',    svg: ICONS.ticket },
  { key: 'clock',     svg: ICONS.clock },
  { key: 'rupee',     svg: ICONS.rupee },
  { key: 'users',     svg: ICONS.users },
  { key: 'user',      svg: ICONS.user },
  { key: 'inbox',     svg: ICONS.inbox },
  { key: 'shield',    svg: ICONS.shield },
  { key: 'receipt',   svg: ICONS.receipt },
  { key: 'box',       svg: ICONS.box },
  { key: 'star',      svg: ICONS.star },
  { key: 'refresh',   svg: ICONS.refresh },
  { key: 'dashboard', svg: ICONS.dashboard },
  { key: 'bell',      svg: ICONS.bell },
  { key: 'wrench',    svg: ICONS.wrench },
  { key: 'alert',     svg: ICONS.alert },
  { key: 'card',      svg: ICONS.card },
  { key: 'pin',       svg: ICONS.pin },
  { key: 'clipboard', svg: ICONS.clipboard },
  { key: 'hourglass', svg: ICONS.hourglass },
];

const COLOR_OPTS = [
  { key: 'green',  label: 'Green',  css: 'var(--success)'          },
  { key: 'blue',   label: 'Blue',   css: 'var(--primary)'          },
  { key: 'amber',  label: 'Amber',  css: 'var(--warning)'          },
  { key: 'red',    label: 'Red',    css: 'var(--danger)'           },
  { key: 'purple', label: 'Purple', css: '#7c5cfc'                 },
  { key: 'sky',    label: 'Sky',    css: '#2e9bff'                 },
  { key: 'teal',   label: 'Teal',   css: '#0ea5a5'                 },
];

function iconSvg(key) { return ICON_OPTS.find(o => o.key === key)?.svg || ICONS.check; }
function colorCss(key) { return COLOR_OPTS.find(o => o.key === key)?.css || 'var(--primary)'; }

// ── Stat card builders ────────────────────────────────────────────────────
function liveCard(icon, value, label, color = 'var(--primary)', sub = '') {
  return `<div class="glass stat-mini">
    <div class="ic" style="background:${color}1a;color:${color}">${icon}</div>
    <div class="v" style="color:${color}">${value}</div>
    <div class="l">${label}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

function customCard(card, idx) {
  const svg   = iconSvg(card.icon);
  const color = colorCss(card.color);
  return `<div class="glass stat-mini stat-custom" data-idx="${idx}">
    <div class="ic" style="background:${color}1a;color:${color}">${svg}</div>
    <div class="v" style="color:${color}">${esc(String(card.value))}</div>
    <div class="l">${esc(card.label)}</div>
    ${card.note ? `<div class="stat-sub">${esc(card.note)}</div>` : ''}
    <div class="stat-custom-actions">
      <button class="btn btn-secondary btn-sm edit-stat-btn" data-idx="${idx}" title="Edit">${ICONS.edit}</button>
      <button class="btn btn-secondary btn-sm del-stat-btn"  data-idx="${idx}" title="Remove">${ICONS.close}</button>
    </div>
  </div>`;
}

function addCard() {
  return `<div class="glass stat-mini stat-add-btn" id="add-stat-btn" style="cursor:pointer;border:2px dashed var(--border);justify-content:center;align-items:center;flex-direction:column;gap:8px;min-height:110px">
    <div style="font-size:1.8rem;color:var(--text-dim);line-height:1">${ICONS.plus}</div>
    <div style="font-size:0.82rem;font-weight:700;color:var(--text-dim)">Add Stat</div>
  </div>`;
}

// ── Modal for add / edit ─────────────────────────────────────────────────
function buildModal(card = {}) {
  const iconOptHtml = ICON_OPTS.map(o =>
    `<button type="button" class="icon-opt-btn${card.icon === o.key ? ' selected' : ''}" data-icon="${o.key}"
      style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;
             border:2px solid ${card.icon === o.key ? 'var(--primary)' : 'var(--border)'};background:var(--bg);cursor:pointer">
      ${o.svg}
    </button>`
  ).join('');

  const colorOptHtml = COLOR_OPTS.map(o =>
    `<button type="button" class="color-opt-btn${card.color === o.key ? ' selected' : ''}" data-color="${o.key}"
      title="${o.label}"
      style="width:28px;height:28px;border-radius:50%;background:${o.css};border:3px solid ${card.color === o.key ? 'var(--text)' : 'transparent'};cursor:pointer">
    </button>`
  ).join('');

  return `<div class="modal-overlay" id="stat-modal-overlay">
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <span class="modal-title">${ICONS.check}<span style="margin-left:8px">${card.label ? 'Edit Stat' : 'Add Custom Stat'}</span></span>
        <button class="modal-close" id="stat-modal-close">${ICONS.close}</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
        <div class="form-group">
          <label>Label</label>
          <input id="stat-label" class="form-control" placeholder="e.g. Monthly Target" value="${esc(card.label || '')}">
        </div>
        <div class="form-group">
          <label>Value</label>
          <input id="stat-value" class="form-control" placeholder="e.g. 50 or ₹12,000" value="${esc(String(card.value ?? ''))}">
        </div>
        <div class="form-group">
          <label>Note <span style="color:var(--text-dim);font-size:0.78rem">(optional)</span></label>
          <input id="stat-note" class="form-control" placeholder="e.g. set by manager" value="${esc(card.note || '')}">
        </div>
        <div class="form-group">
          <label>Icon</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${iconOptHtml}</div>
          <input type="hidden" id="stat-icon" value="${esc(card.icon || 'check')}">
        </div>
        <div class="form-group">
          <label>Color</label>
          <div style="display:flex;gap:8px;align-items:center">${colorOptHtml}</div>
          <input type="hidden" id="stat-color" value="${esc(card.color || 'blue')}">
        </div>
      </div>
      <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid var(--border)">
        <button class="btn btn-secondary" id="stat-modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="stat-modal-save">Save</button>
      </div>
    </div>
  </div>`;
}

// ── Modal wiring ──────────────────────────────────────────────────────────
function openModal(container, storageKey, cards, editIdx = -1) {
  const existing = editIdx >= 0 ? cards[editIdx] : {};
  document.body.insertAdjacentHTML('beforeend', buildModal(existing));
  const overlay = document.getElementById('stat-modal-overlay');

  // Icon selection
  overlay.querySelectorAll('.icon-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.icon-opt-btn').forEach(b => {
        b.style.borderColor = 'var(--border)'; b.classList.remove('selected');
      });
      btn.style.borderColor = 'var(--primary)'; btn.classList.add('selected');
      overlay.querySelector('#stat-icon').value = btn.dataset.icon;
    });
  });

  // Color selection
  overlay.querySelectorAll('.color-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.color-opt-btn').forEach(b => {
        b.style.borderColor = 'transparent'; b.classList.remove('selected');
      });
      btn.style.borderColor = 'var(--text)'; btn.classList.add('selected');
      overlay.querySelector('#stat-color').value = btn.dataset.color;
    });
  });

  const close = () => overlay.remove();
  overlay.querySelector('#stat-modal-close').onclick = close;
  overlay.querySelector('#stat-modal-cancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#stat-modal-save').onclick = () => {
    const label = overlay.querySelector('#stat-label').value.trim();
    const value = overlay.querySelector('#stat-value').value.trim();
    if (!label || !value) { toast('Label and Value are required', 'error'); return; }
    const card = {
      label,
      value,
      note:  overlay.querySelector('#stat-note').value.trim(),
      icon:  overlay.querySelector('#stat-icon').value || 'check',
      color: overlay.querySelector('#stat-color').value || 'blue',
    };
    if (editIdx >= 0) cards[editIdx] = card;
    else cards.push(card);
    localStorage.setItem(storageKey, JSON.stringify(cards));
    close();
    rerenderCustom(container, storageKey, cards);
    toast(editIdx >= 0 ? 'Stat updated' : 'Stat added', 'success');
  };
}

function rerenderCustom(container, storageKey, cards) {
  const wrap = container.querySelector('#custom-stats-grid');
  if (!wrap) return;
  wrap.innerHTML = cards.map((c, i) => customCard(c, i)).join('') + addCard();
  bindCustomActions(container, storageKey, cards);
}

function bindCustomActions(container, storageKey, cards) {
  container.querySelector('#add-stat-btn')?.addEventListener('click', () =>
    openModal(container, storageKey, cards)
  );
  container.querySelectorAll('.edit-stat-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openModal(container, storageKey, cards, Number(btn.dataset.idx));
    })
  );
  container.querySelectorAll('.del-stat-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      cards.splice(idx, 1);
      localStorage.setItem(storageKey, JSON.stringify(cards));
      rerenderCustom(container, storageKey, cards);
      toast('Stat removed', 'success');
    })
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────
function section(title, subtitle, gridId, cardsHtml) {
  return `<div class="card" style="margin-bottom:24px">
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <span class="card-title">${title}</span>
        ${subtitle ? `<span style="font-size:0.78rem;color:var(--text-dim);margin-left:10px">${subtitle}</span>` : ''}
      </div>
    </div>
    <div class="card-body" style="padding-top:0">
      <div class="grid-stats" id="${gridId}">${cardsHtml}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN STATS
// ═══════════════════════════════════════════════════════════════════════════
export async function renderAdminStats(container) {
  showLoader(container);
  const today = new Date().toLocaleDateString('en-CA');
  const storageKey = 'nest-custom-stats-admin';

  let inquiries = [], attendance = [], complaints = [], profiles = [], eodReports = [];
  try {
    const [inqRes, attRes, cmpRes, prfRes, eodRes] = await Promise.all([
      supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
      supabase.from('attendance').select('*').order('clock_in', { ascending: false }),
      supabase.from('complaints').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('eod_reports').select('*').order('date', { ascending: false }),
    ]);
    inquiries   = inqRes.data  || [];
    attendance  = attRes.data  || [];
    complaints  = cmpRes.data  || [];
    profiles    = prfRes.data  || [];
    eodReports  = eodRes.data  || [];
  } catch (err) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:40px"><p style="color:var(--danger)">${esc(err.message)}</p></div>`;
    return;
  }

  // ── Compute stats ─────────────────────────────────────────────────────
  const allRows = inquiries;
  const resolved = allRows.filter(x => ['resolved', 'closed'].includes(x.status));
  const active   = allRows.filter(x => !['resolved', 'closed', 'issue_not_resolved'].includes(x.status));

  const newToday       = allRows.filter(x => dateKey(x.created_at) === today).length;
  const resolvedToday  = resolved.filter(x => dateKey(x.updated_at || x.created_at) === today).length;
  const inProgress     = allRows.filter(x => x.status === 'in_progress').length;
  const pendingAssign  = active.filter(x => !x.assigned_employee_id).length;
  const unpaidBills    = allRows.filter(x => x.bill_amount && x.payment_status !== 'paid').length;
  const cashPending    = allRows
    .filter(x => x.payment_method === 'cash' && x.payment_status === 'paid' && x.cash_collected_at && !x.cash_submitted_at)
    .reduce((s, x) => s + (Number(x.bill_total) || 0), 0);
  const openComplaints = complaints.filter(x => !['resolved', 'closed'].includes(String(x.status || '').toLowerCase())).length;

  // On-time resolved today
  const onTimeToday = resolved.filter(x => {
    if (dateKey(x.updated_at || x.created_at) !== today) return false;
    return new Date(x.updated_at || x.created_at) <= calculateSLA(x.created_at);
  }).length;
  const onTimeRate  = resolvedToday > 0 ? Math.round((onTimeToday / resolvedToday) * 100) : 0;

  // Attendance today (employees clocked in, not out)
  const empProfiles   = profiles.filter(x => x.role === 'employee');
  const empTotal      = empProfiles.length;
  const todayAtt      = attendance.filter(x => dateKey(x.clock_in) === today);
  const clockedIn     = todayAtt.filter(x => x.clock_in && !x.clock_out).length;

  // EOD warnings (employees with attendance today but no EOD)
  const attendedIds   = new Set(todayAtt.map(x => x.user_id).filter(Boolean));
  const eodTodayIds   = new Set(eodReports.filter(x => x.date === today).map(x => x.employee_id).filter(Boolean));
  const eodWarnings   = [...attendedIds].filter(id => !eodTodayIds.has(id)).length;

  // Daily target from localStorage
  const todayTarget  = Math.max(1, parseInt(localStorage.getItem('nest-daily-target') || '8', 10));
  const targetPct    = Math.min(100, Math.round((resolvedToday / todayTarget) * 100));

  const billed       = allRows.filter(x => x.bill_amount || x.bill_total).length;
  const paid         = allRows.filter(x => x.payment_status === 'paid').length;
  const collPct      = billed > 0 ? Math.round((paid / billed) * 100) : 0;

  // ── Build live section ────────────────────────────────────────────────
  const liveCards = [
    liveCard(ICONS.inbox,     newToday,                  'New Today',           '#2e9bff'),
    liveCard(ICONS.check,     `${resolvedToday} / ${todayTarget}`, 'Resolved / Target', resolvedToday >= todayTarget ? 'var(--success)' : 'var(--primary)',
      `<div style="margin-top:6px;height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${targetPct}%;background:${resolvedToday >= todayTarget ? 'var(--success)' : 'var(--primary)'};border-radius:3px"></div></div>`),
    liveCard(ICONS.hourglass, `${onTimeRate}%`,           'On-Time Rate',        onTimeRate >= 80 ? 'var(--success)' : onTimeRate >= 60 ? 'var(--warning)' : resolvedToday === 0 ? 'var(--text-dim)' : 'var(--danger)',
      resolvedToday === 0 ? 'none resolved yet' : `${onTimeToday}/${resolvedToday} within SLA`),
    liveCard(ICONS.refresh,   inProgress,                'In Progress',         '#7c5cfc'),
    liveCard(ICONS.clock,     pendingAssign,             'Pending Assignment',  'var(--warning)'),
    liveCard(ICONS.receipt,   unpaidBills,               'Unpaid Bills',        'var(--danger)'),
    liveCard(ICONS.rupee,     money(cashPending),        'Cash Pending',        'var(--warning)'),
    liveCard(ICONS.shield,    openComplaints,            'Open Complaints',     'var(--danger)'),
    liveCard(ICONS.clipboard, eodWarnings,               'EOD Warnings',        eodWarnings > 0 ? 'var(--warning)' : 'var(--success)'),
    liveCard(ICONS.clock,     clockedIn,                 'Clocked In Now',      'var(--success)',  `of ${empTotal} employees`),
    liveCard(ICONS.ticket,    allRows.length,            'Total Requests',      'var(--primary)',  'all time'),
    liveCard(ICONS.check,     resolved.length,           'Total Resolved',      'var(--success)',  'all time'),
    liveCard(ICONS.card,      `${collPct}%`,             'Collection Rate',     collPct >= 80 ? 'var(--success)' : 'var(--warning)', `${paid}/${billed} bills paid`),
    liveCard(ICONS.users,     empTotal,                  'Total Employees',     '#0ea5a5'),
  ].join('');

  // ── Custom section ────────────────────────────────────────────────────
  let customCards = [];
  try { customCards = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { customCards = []; }

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      <div>
        <h1 style="display:inline-flex;align-items:center;gap:10px">${ICONS.dashboard}<span>Stats</span></h1>
        <p style="color:var(--text-soft);margin:4px 0 0">All metrics in one place — live data + your custom cards</p>
      </div>
      <button class="btn btn-secondary" id="stats-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>
    ${section('Live Operations', 'auto-refreshes on reload', 'live-stats-grid', liveCards)}
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <span class="card-title">Custom Stats</span>
          <span style="font-size:0.78rem;color:var(--text-dim);margin-left:10px">add, edit or remove your own cards</span>
        </div>
      </div>
      <div class="card-body" style="padding-top:0">
        <div class="grid-stats" id="custom-stats-grid">
          ${customCards.map((c, i) => customCard(c, i)).join('')}${addCard()}
        </div>
      </div>
    </div>`;

  container.querySelector('#stats-refresh')?.addEventListener('click', () => renderAdminStats(container));
  bindCustomActions(container, storageKey, customCards);
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE STATS
// ═══════════════════════════════════════════════════════════════════════════
export async function renderEmployeeStats(container) {
  showLoader(container);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const today      = new Date().toLocaleDateString('en-CA');
  const storageKey = 'nest-custom-stats-employee';

  let attendance = null, tasks = [], eodReport = null, allInquiries = [], attHistory = [], eodHistory = [];
  try {
    const [attRes, tasksRes, eodRes, inqRes, attHistRes, eodHistRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('tickets').select('*, inquiries(*)').eq('assigned_to', user.id).order('created_at', { ascending: false }),
      supabase.from('eod_reports').select('*').eq('employee_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('inquiries').select('*').eq('assigned_employee_id', user.id).order('created_at', { ascending: false }),
      supabase.from('attendance').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('eod_reports').select('*').eq('employee_id', user.id).order('date', { ascending: false }),
    ]);
    attendance   = attRes.data;
    tasks        = tasksRes.data  || [];
    eodReport    = eodRes.data;
    allInquiries = inqRes.data    || [];
    attHistory   = attHistRes.data || [];
    eodHistory   = eodHistRes.data || [];
  } catch (err) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:40px"><p style="color:var(--danger)">${esc(err.message)}</p></div>`;
    return;
  }

  // ── Compute stats ─────────────────────────────────────────────────────
  const isClockedIn  = !!attendance?.clock_in && !attendance?.clock_out;
  const isClockedOut = !!attendance?.clock_out;

  const activeTasks    = tasks.filter(x => !['resolved', 'closed'].includes(x.status));
  const completedAll   = tasks.filter(x => ['resolved', 'closed'].includes(x.status));
  const completedToday = completedAll.filter(x => dateKey(x.updated_at || x.created_at) === today).length;

  // On-time completed today
  const onTimeToday = completedAll.filter(x => {
    if (dateKey(x.updated_at || x.created_at) !== today) return false;
    const inq = Array.isArray(x.inquiries) ? x.inquiries[0] : null;
    const createdAt = inq?.created_at || x.created_at;
    return new Date(x.updated_at || x.created_at) <= calculateSLA(createdAt);
  }).length;
  const onTimeRate = completedToday > 0 ? Math.round((onTimeToday / completedToday) * 100) : 0;

  const acceptedInq  = allInquiries.filter(x => x.assignment_status === 'accepted').length;
  const pendingInq   = allInquiries.filter(x => x.assignment_status === 'pending').length;

  // Missed EODs (attendance rows without matching EOD)
  const eodDatesSet  = new Set(eodHistory.map(x => x.date));
  const missedEods   = attHistory.filter(x => x.date !== today && !eodDatesSet.has(x.date)).length;

  // Working days this month
  const monthKey     = today.slice(0, 7);
  const daysWorked   = attHistory.filter(x => x.date?.startsWith(monthKey) && x.clock_in).length;

  // Daily target (personal, stored same key or employee key)
  const dailyTarget  = Math.max(1, parseInt(localStorage.getItem('nest-daily-target-emp') || '5', 10));
  const targetPct    = Math.min(100, Math.round((completedToday / dailyTarget) * 100));

  // ── Build live cards ──────────────────────────────────────────────────
  const liveCards = [
    liveCard(ICONS.clock,
      isClockedIn ? 'IN' : isClockedOut ? 'OUT' : '—',
      'Clock Status',
      isClockedIn ? 'var(--success)' : isClockedOut ? 'var(--warning)' : 'var(--text-dim)',
      isClockedIn ? 'currently clocked in' : isClockedOut ? 'clocked out today' : 'not clocked in'),
    liveCard(ICONS.check,
      `${completedToday} / ${dailyTarget}`,
      'Completed / Target',
      completedToday >= dailyTarget ? 'var(--success)' : 'var(--primary)',
      `<div style="margin-top:6px;height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${targetPct}%;background:${completedToday >= dailyTarget ? 'var(--success)' : 'var(--primary)'};border-radius:3px"></div></div>`),
    liveCard(ICONS.hourglass,
      `${onTimeRate}%`,
      'On-Time Rate Today',
      onTimeRate >= 80 ? 'var(--success)' : onTimeRate >= 60 ? 'var(--warning)' : completedToday === 0 ? 'var(--text-dim)' : 'var(--danger)',
      completedToday === 0 ? 'no completions yet' : `${onTimeToday}/${completedToday} within SLA`),
    liveCard(ICONS.ticket,    activeTasks.length,    'Active Tasks',         '#7c5cfc'),
    liveCard(ICONS.inbox,     acceptedInq,           'Accepted Requests',   'var(--primary)'),
    liveCard(ICONS.clock,     pendingInq,            'Pending Review',      'var(--warning)',     'awaiting your response'),
    liveCard(ICONS.check,     completedAll.length,   'Total Completed',     'var(--success)',     'all time'),
    liveCard(ICONS.clipboard, eodReport ? '✓ Done' : '✗ Pending', 'EOD Today', eodReport ? 'var(--success)' : 'var(--warning)'),
    liveCard(ICONS.shield,    missedEods,            'Missed EODs',         missedEods > 0 ? 'var(--danger)' : 'var(--success)',   'past days'),
    liveCard(ICONS.calendar || ICONS.clock, daysWorked, 'Days Worked', 'var(--primary)',          `this month`),
  ].join('');

  // Daily target input card
  const targetInputCard = `
    <div class="glass stat-mini" style="justify-content:center;flex-direction:column;gap:6px;padding:14px 16px">
      <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em">Daily Target</div>
      <input type="number" id="emp-daily-target" min="1" max="99" value="${dailyTarget}"
        style="width:70px;padding:6px 10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-weight:800;font-size:1.2rem;text-align:center">
      <div style="font-size:0.72rem;color:var(--text-dim)">tasks / day</div>
    </div>`;

  let customCards = [];
  try { customCards = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { customCards = []; }

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      <div>
        <h1 style="display:inline-flex;align-items:center;gap:10px">${ICONS.dashboard}<span>My Stats</span></h1>
        <p style="color:var(--text-soft);margin:4px 0 0">Your personal metrics — live data + custom cards</p>
      </div>
      <button class="btn btn-secondary" id="stats-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>
    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <span class="card-title">Live Stats</span>
        <span style="font-size:0.78rem;color:var(--text-dim);margin-left:10px">auto-refreshes on reload</span>
      </div>
      <div class="card-body" style="padding-top:0">
        <div class="grid-stats">
          ${liveCards}${targetInputCard}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <span class="card-title">Custom Stats</span>
          <span style="font-size:0.78rem;color:var(--text-dim);margin-left:10px">add your own cards</span>
        </div>
      </div>
      <div class="card-body" style="padding-top:0">
        <div class="grid-stats" id="custom-stats-grid">
          ${customCards.map((c, i) => customCard(c, i)).join('')}${addCard()}
        </div>
      </div>
    </div>`;

  container.querySelector('#stats-refresh')?.addEventListener('click', () => renderEmployeeStats(container));
  bindCustomActions(container, storageKey, customCards);

  container.querySelector('#emp-daily-target')?.addEventListener('change', e => {
    const v = Math.max(1, parseInt(e.target.value, 10) || 5);
    e.target.value = v;
    localStorage.setItem('nest-daily-target-emp', String(v));
    toast('Daily target saved', 'success');
  });
}
