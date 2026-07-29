// Stats Dashboard — live computed metrics + user-defined custom stat cards.
// Admin sees org-wide stats; employee sees personal stats.
// Custom cards are persisted in localStorage per role.

import { supabase } from '../supabase.js';
import { showLoader, toast, calculateSLA, formatTime } from '../utils.js';
import { ICONS } from '../icons.js';
import { renderDashboardHero, kpiCard } from './dashboard-widgets.js';

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

  let inquiries = [], attendance = [], complaints = [], profiles = [], eodReports = [], stocks = [];
  try {
    const [inqRes, attRes, cmpRes, prfRes, eodRes, invRes] = await Promise.all([
      supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
      supabase.from('attendance').select('*').order('clock_in', { ascending: false }),
      supabase.from('complaints').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('eod_reports').select('*').order('date', { ascending: false }),
      supabase.from('inventory').select('id,quantity,min_stock'),
    ]);
    inquiries  = inqRes.data  || [];
    attendance = attRes.data  || [];
    complaints = cmpRes.data  || [];
    profiles   = prfRes.data  || [];
    eodReports = eodRes.data  || [];
    stocks     = invRes.data  || [];
  } catch (err) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:40px"><p style="color:var(--danger)">${esc(err.message)}</p></div>`;
    return;
  }

  const allRows = inquiries;
  const resolved = allRows.filter(x => ['resolved', 'closed'].includes(x.status));
  const active   = allRows.filter(x => !['resolved', 'closed', 'issue_not_resolved'].includes(x.status));

  // ── Daily metrics ──────────────────────────────────────────────────────
  const newToday      = allRows.filter(x => dateKey(x.created_at) === today).length;
  const resolvedToday = resolved.filter(x => dateKey(x.updated_at || x.created_at) === today).length;
  const inProgress    = allRows.filter(x => x.status === 'in_progress').length;
  const pendingAssign = active.filter(x => !x.assigned_employee_id).length;
  const unpaidBills   = allRows.filter(x => x.bill_amount && x.payment_status !== 'paid').length;
  const cashPending   = allRows
    .filter(x => x.payment_method === 'cash' && x.payment_status === 'paid' && x.cash_collected_at && !x.cash_submitted_at)
    .reduce((s, x) => s + (Number(x.bill_total) || 0), 0);
  const openCmp       = complaints.filter(x => !['resolved', 'closed'].includes(String(x.status || '').toLowerCase())).length;
  const lowStock      = stocks.filter(x => x.quantity <= x.min_stock).length;

  // On-time rate
  const onTimeToday = resolved.filter(x => {
    if (dateKey(x.updated_at || x.created_at) !== today) return false;
    return new Date(x.updated_at || x.created_at) <= calculateSLA(x.assigned_at || x.created_at);
  }).length;
  const onTimeRate = resolvedToday > 0 ? Math.round((onTimeToday / resolvedToday) * 100) : 0;

  // Attendance & EOD
  const empTotal   = profiles.filter(x => x.role === 'employee').length;
  const todayAtt   = attendance.filter(x => dateKey(x.clock_in) === today);
  const clockedIn  = todayAtt.filter(x => x.clock_in && !x.clock_out).length;
  const attendedIds = new Set(todayAtt.map(x => x.user_id).filter(Boolean));
  const eodTodayIds = new Set(eodReports.filter(x => x.date === today).map(x => x.employee_id).filter(Boolean));
  const eodWarnCount = [...attendedIds].filter(id => !eodTodayIds.has(id)).length;

  // Billing
  const billed        = allRows.filter(x => x.bill_amount || x.bill_total).length;
  const paid          = allRows.filter(x => x.payment_status === 'paid').length;
  const assignedCount = allRows.filter(x => x.assigned_employee_id).length;

  // Daily target
  const todayTarget = Math.max(1, parseInt(localStorage.getItem('nest-daily-target') || '8', 10));
  const targetPct   = Math.min(100, Math.round((resolvedToday / todayTarget) * 100));

  // ── 6-month trend ─────────────────────────────────────────────────────
  const months = [];
  const nowD = new Date();
  for (let k = 5; k >= 0; k--) months.push(new Date(nowD.getFullYear(), nowD.getMonth() - k, 1));
  const trendLabels = months.map(d => d.toLocaleDateString('en-US', { month: 'short' }));
  const trendValues = months.map(d =>
    allRows.filter(x => {
      const c = new Date(x.created_at);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    }).length
  );

  // ── Category breakdown ────────────────────────────────────────────────
  const catMap = new Map([['CCTV', 0], ['Networking', 0], ['Biometric', 0], ['Gate Automation', 0], ['Other', 0]]);
  allRows.forEach(x => {
    const s = (x.service_item || '').toLowerCase();
    if (s.includes('cctv') || s.includes('camera') || s.includes('dvr') || s.includes('nvr'))
      catMap.set('CCTV', catMap.get('CCTV') + 1);
    else if (s.includes('network') || s.includes('wifi') || s.includes('switch') || s.includes('router'))
      catMap.set('Networking', catMap.get('Networking') + 1);
    else if (s.includes('biometric') || s.includes('attendance') || s.includes('fingerprint'))
      catMap.set('Biometric', catMap.get('Biometric') + 1);
    else if (s.includes('gate') || s.includes('barrier') || s.includes('boom') || s.includes('automation'))
      catMap.set('Gate Automation', catMap.get('Gate Automation') + 1);
    else
      catMap.set('Other', catMap.get('Other') + 1);
  });
  const categorySegs = [
    { label: 'CCTV',       value: catMap.get('CCTV'),           color: '#15a05a' },
    { label: 'Networking',  value: catMap.get('Networking'),      color: '#0ea5a5' },
    { label: 'Biometric',   value: catMap.get('Biometric'),       color: '#6366f1' },
    { label: 'Gate Auto',   value: catMap.get('Gate Automation'), color: '#e08a14' },
    { label: 'Other',       value: catMap.get('Other'),           color: '#94a3b8' },
  ].filter(s => s.value > 0);

  // ── Pipeline & Alerts ─────────────────────────────────────────────────
  const pipeline = [
    { label: 'New',         value: newToday,      color: 'var(--primary)' },
    { label: 'Pending',     value: pendingAssign, color: '#f5a524' },
    { label: 'In Progress', value: inProgress,    color: '#2e9bff' },
    { label: 'Resolved',    value: resolvedToday, color: 'var(--success)' },
  ];
  const alertData = [
    { label: 'Low Stock',  value: lowStock,      color: '#f5a524' },
    { label: 'Unpaid',     value: unpaidBills,   color: '#f0556d' },
    { label: 'Complaints', value: openCmp,       color: '#ef4444' },
    { label: 'EOD Warn',   value: eodWarnCount,  color: '#7c5cfc' },
  ];

  // ── Company bars ──────────────────────────────────────────────────────
  const phoneToCompany = new Map();
  const profileById    = new Map();
  profiles.forEach(pr => {
    if (pr.phone && pr.company) phoneToCompany.set(pr.phone, pr.company);
    if (pr.id) profileById.set(pr.id, pr);
  });
  const companyMap = new Map();
  allRows.forEach(inq => {
    const company = inq.company_name || phoneToCompany.get(inq.phone) || 'Walk-in / Unregistered';
    if (!companyMap.has(company)) companyMap.set(company, { total: 0, active: 0, resolved: 0 });
    const e = companyMap.get(company);
    e.total++;
    if (['resolved', 'closed'].includes(inq.status)) e.resolved++; else e.active++;
  });
  const companyRows = [...companyMap.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);

  // ── Top technicians ───────────────────────────────────────────────────
  const techMap = new Map();
  allRows.forEach(x => {
    if (!x.assigned_employee_id || !['resolved', 'closed'].includes(x.status)) return;
    const prof = profileById.get(x.assigned_employee_id);
    if (!prof?.full_name || prof.role === 'admin') return;
    if (!techMap.has(x.assigned_employee_id))
      techMap.set(x.assigned_employee_id, { name: prof.full_name, jobs: 0 });
    techMap.get(x.assigned_employee_id).jobs++;
  });
  const topTechs = [...techMap.values()].sort((a, b) => b.jobs - a.jobs).slice(0, 6);

  // Status segs for fallback donut
  let sOpen = 0, sProg = 0, sRes = 0, sOther = 0;
  allRows.forEach(x => {
    if (['resolved', 'closed'].includes(x.status)) sRes++;
    else if (x.status === 'in_progress') sProg++;
    else if (['pending', 'open'].includes(x.status)) sOpen++;
    else sOther++;
  });
  const statusSegs = [
    { label: 'Open',        color: '#3B82F6', value: sOpen },
    { label: 'In Progress', color: '#f5a524', value: sProg },
    { label: 'Resolved',    color: '#15a05a', value: sRes  },
  ];
  if (sOther) statusSegs.push({ label: 'Other', color: '#94a3b8', value: sOther });

  // ── Mini stat cards ───────────────────────────────────────────────────
  const miniCards = [
    liveCard(ICONS.inbox,     newToday,            'New Today',          '#2e9bff'),
    liveCard(ICONS.clock,     pendingAssign,       'Pending Assignment', 'var(--warning)'),
    liveCard(ICONS.refresh,   inProgress,          'In Progress',        '#7c5cfc'),
    liveCard(ICONS.check,     resolvedToday,       'Resolved Today',     'var(--success)'),
    liveCard(ICONS.receipt,   unpaidBills,         'Unpaid Bills',       'var(--danger)'),
    liveCard(ICONS.rupee,     money(cashPending),  'Cash Pending',       'var(--warning)'),
    liveCard(ICONS.shield,    openCmp,             'Open Complaints',    'var(--danger)'),
    liveCard(ICONS.clipboard, eodWarnCount,        'EOD Warnings',       eodWarnCount > 0 ? 'var(--warning)' : 'var(--success)'),
  ].join('');

  // ── Custom cards ──────────────────────────────────────────────────────
  let customCards = [];
  try { customCards = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { customCards = []; }

  // ── Render page shell ─────────────────────────────────────────────────
  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      <div>
        <h1 style="display:inline-flex;align-items:center;gap:10px">${ICONS.dashboard}<span>Stats</span></h1>
        <p style="color:var(--text-soft);margin:4px 0 0">Live analytics — charts, trends &amp; metrics</p>
      </div>
    </div>

    <div id="stats-hero" class="dash-hero"></div>

    <div class="card" id="today-scorecard" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span class="card-title" style="display:inline-flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${resolvedToday >= todayTarget ? 'var(--success)' : 'var(--primary)'};display:inline-block"></span>
          Today's Scorecard
        </span>
        <div style="display:inline-flex;align-items:center;gap:8px;font-size:0.82rem;">
          <span style="color:var(--text-dim);font-weight:600;">Daily Target:</span>
          <input type="number" id="daily-target-input" min="1" max="999" value="${todayTarget}"
                 style="width:64px;padding:4px 10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-weight:700;font-size:0.9rem;text-align:center;">
        </div>
      </div>
      <div class="card-body" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding:0;">
        <div style="padding:20px 24px;text-align:center;border-right:1px solid var(--border);">
          <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Resolved Today</div>
          <div style="font-size:2.8rem;font-weight:800;line-height:1;color:${resolvedToday >= todayTarget ? 'var(--success)' : 'var(--text)'}">
            ${resolvedToday}<span style="font-size:1.1rem;font-weight:600;color:var(--text-dim)"> / ${todayTarget}</span>
          </div>
          <div style="margin-top:14px;height:8px;background:var(--border);border-radius:6px;overflow:hidden">
            <div id="target-progress-bar" style="height:100%;width:${targetPct}%;background:${resolvedToday >= todayTarget ? 'var(--success)' : 'var(--primary)'};border-radius:6px;transition:width 0.5s ease;min-width:${resolvedToday > 0 ? 4 : 0}px"></div>
          </div>
          <div style="margin-top:8px;font-size:0.78rem;font-weight:600;color:${resolvedToday >= todayTarget ? 'var(--success)' : 'var(--text-dim)'}">
            ${resolvedToday >= todayTarget ? '🎯 Goal reached!' : `${todayTarget - resolvedToday} more to reach goal`}
          </div>
        </div>
        <div style="padding:20px 24px;text-align:center;border-right:1px solid var(--border);">
          <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">On-Time Rate Today</div>
          <div style="font-size:2.8rem;font-weight:800;line-height:1;color:${onTimeRate >= 80 ? 'var(--success)' : onTimeRate >= 60 ? 'var(--warning)' : resolvedToday === 0 ? 'var(--text-dim)' : 'var(--danger)'}">
            ${onTimeRate}<span style="font-size:1.1rem;font-weight:600;color:var(--text-dim)">%</span>
          </div>
          <div style="margin-top:14px;height:8px;background:var(--border);border-radius:6px;overflow:hidden">
            <div style="height:100%;width:${onTimeRate}%;background:${onTimeRate >= 80 ? 'var(--success)' : onTimeRate >= 60 ? 'var(--warning)' : 'var(--danger)'};border-radius:6px;min-width:${onTimeToday > 0 ? 4 : 0}px"></div>
          </div>
          <div style="margin-top:8px;font-size:0.78rem;font-weight:600;color:var(--text-dim)">
            ${resolvedToday === 0 ? 'No tickets resolved yet today' : `${onTimeToday} of ${resolvedToday} within SLA (12 hrs)`}
          </div>
        </div>
        <div style="padding:20px 24px;text-align:center;">
          <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">New Today</div>
          <div style="font-size:2.8rem;font-weight:800;line-height:1;color:var(--primary)">${newToday}</div>
          <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <span style="padding:3px 10px;border-radius:20px;background:rgba(124,92,252,0.12);color:var(--violet,#7c5cfc);font-size:0.75rem;font-weight:700">${inProgress} in progress</span>
            <span style="padding:3px 10px;border-radius:20px;background:rgba(245,165,36,0.12);color:var(--amber,var(--warning));font-size:0.75rem;font-weight:700">${pendingAssign} unassigned</span>
          </div>
          <div style="margin-top:8px;font-size:0.78rem;font-weight:600;color:var(--text-dim)">
            ${newToday > 0 && resolvedToday > 0 ? `Net ${newToday > resolvedToday ? '+' : ''}${newToday - resolvedToday} tickets ${newToday > resolvedToday ? 'added' : 'cleared'} today` : newToday > 0 ? 'All pending action' : 'Clean slate today'}
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><span class="card-title">Quick Metrics</span></div>
      <div class="card-body" style="padding-top:0">
        <div class="grid-stats">${miniCards}</div>
      </div>
    </div>

  `;

  // ── Inject charts hero ────────────────────────────────────────────────
  container.querySelector('#stats-hero').innerHTML = renderDashboardHero({
    resolutionRate:  allRows.length ? (resolved.length / allRows.length) * 100 : 0,
    assignmentRate:  allRows.length ? (assignedCount / allRows.length) * 100    : 0,
    collectionRate:  billed         ? (paid / billed) * 100                     : 0,
    attendanceRate:  empTotal       ? (clockedIn / empTotal) * 100              : 0,
    resolved: resolved.length, totalReq: allRows.length,
    assigned: assignedCount,
    paid, billed,
    inCount: clockedIn, empTotal,
    trendLabels, trendValues, statusSegs,
    pipeline, alerts: alertData,
    companies: companyRows,
    topTechs, categorySegs,
  });

  // ── Events ────────────────────────────────────────────────────────────
  container.querySelector('#daily-target-input')?.addEventListener('change', (e) => {
    const v = Math.max(1, parseInt(e.target.value, 10) || 8);
    e.target.value = v;
    localStorage.setItem('nest-daily-target', String(v));
    const bar = container.querySelector('#target-progress-bar');
    if (bar) {
      bar.style.width = Math.min(100, Math.round((resolvedToday / v) * 100)) + '%';
      bar.style.background = resolvedToday >= v ? 'var(--success)' : 'var(--primary)';
    }
  });
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
    const baseAt = inq?.assigned_at || inq?.created_at || x.assigned_at || x.created_at;
    return new Date(x.updated_at || x.created_at) <= calculateSLA(baseAt);
  }).length;
  const onTimeRate = completedToday > 0 ? Math.round((onTimeToday / completedToday) * 100) : 0;

  const acceptedInqAll = allInquiries.filter(x => x.assignment_status === 'accepted');
  const acceptedInq  = acceptedInqAll.length;
  const pendingInq   = allInquiries.filter(x => x.assignment_status === 'pending').length;

  // Jobs summary (for stat cards + donut — mirrors My Tasks)
  const _DONE_ST = new Set(['resolved', 'closed', 'case_closed', 'paid', 'foc']);
  const _ISSUE_ST = 'issue_not_resolved';
  const jobsIssueTasksCount = tasks.filter(x => {
    const st = (Array.isArray(x.inquiries) ? x.inquiries[0]?.status : null) || x.status || '';
    return st === _ISSUE_ST;
  }).length;
  const jobsActiveInqCount    = acceptedInqAll.filter(x => !_DONE_ST.has(x.status) && x.status !== _ISSUE_ST).length;
  const jobsResolvedInqCount  = acceptedInqAll.filter(x => _DONE_ST.has(x.status)).length;
  const jobsIssueInqCount     = acceptedInqAll.filter(x => x.status === _ISSUE_ST).length;
  const jobsTotal      = tasks.length + acceptedInq;
  const jobsActive     = activeTasks.length + jobsActiveInqCount;
  const jobsCompleted  = completedAll.length + jobsResolvedInqCount;
  const jobsIssues     = jobsIssueTasksCount + jobsIssueInqCount;
  const _donutSegs = [
    { label: 'Active',    value: jobsActive,    color: 'var(--warning)' },
    { label: 'Completed', value: jobsCompleted, color: 'var(--success)' },
    { label: 'Issues',    value: jobsIssues,    color: 'var(--danger)'  },
  ];
  const _donutTotal = _donutSegs.reduce((s, x) => s + x.value, 0);
  const _DONUT_C = 2 * Math.PI * 44;
  let _donutAcc = 0;
  const _donutArcs = _donutSegs.filter(s => s.value > 0).map(s => {
    const dash = (s.value / _donutTotal) * _DONUT_C;
    const arc = `<circle cx="60" cy="60" r="44" fill="none" stroke="${s.color}" stroke-width="14"
      stroke-dasharray="${dash.toFixed(2)} ${(_DONUT_C - dash).toFixed(2)}" stroke-dashoffset="${(-_donutAcc).toFixed(2)}"/>`;
    _donutAcc += dash;
    return arc;
  }).join('');
  const jobsDonutHtml = `
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header"><span class="card-title">Jobs Overview</span></div>
      <div class="card-body" style="padding-top:0;">
        <div class="stats-grid" style="margin-bottom:20px;">
          <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${jobsTotal}</div><div class="stat-label">Total Jobs</div></div>
          <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${jobsActive}</div><div class="stat-label">Active</div></div>
          <div class="stat-card"><div class="stat-value" style="color:var(--success)">${jobsCompleted}</div><div class="stat-label">Completed</div></div>
          <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${jobsIssues}</div><div class="stat-label">Issues</div></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap;">
          <svg width="150" height="150" viewBox="0 0 120 120" role="img" aria-label="Job status distribution">
            <g transform="rotate(-90 60 60)">
              <circle cx="60" cy="60" r="44" fill="none" stroke="var(--border)" stroke-width="14"/>
              ${_donutArcs}
            </g>
            <text x="60" y="58" text-anchor="middle" font-size="24" font-weight="800" fill="var(--text)" font-family="var(--font-display)">${_donutTotal}</text>
            <text x="60" y="74" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="1" fill="var(--text-dim)">TOTAL JOBS</text>
          </svg>
          <div style="display:flex;flex-direction:column;gap:10px;min-width:160px;">
            ${_donutSegs.map(s => `
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;"></span>
                <span style="flex:1;font-size:0.85rem;font-weight:600;color:var(--text-soft);">${s.label}</span>
                <span style="font-size:0.9rem;font-weight:800;">${s.value}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;

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

  const _statsCompletedCount = completedAll.length;
  const _statsWorkTotal = activeTasks.length + acceptedInq + _statsCompletedCount;
  const _statsShare = (n) => _statsWorkTotal ? (n / _statsWorkTotal) * 100 : 0;
  const _statsKpis = `<div class="dash-kpis" style="margin-bottom:24px;">
    ${kpiCard(isClockedIn ? 100 : 0, 'Clock Status',
      isClockedIn ? 'Since ' + formatTime(attendance?.clock_in) : isClockedOut ? 'Clocked out today' : 'Not clocked in',
      isClockedIn ? 'var(--success)' : 'var(--text-dim)',
      isClockedIn ? 'IN' : 'OUT')}
    ${kpiCard(_statsShare(activeTasks.length), 'Active Tasks', `of ${_statsWorkTotal} total jobs`, 'var(--warning)', `${activeTasks.length}`)}
    ${kpiCard(_statsShare(acceptedInq), 'Accepted Requests', 'awaiting completion', 'var(--info)', `${acceptedInq}`)}
    ${kpiCard(_statsShare(_statsCompletedCount), 'Completed', `${_statsCompletedCount} of ${_statsWorkTotal} resolved`, 'var(--success)', `${_statsCompletedCount}`)}
  </div>`;

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      <div>
        <h1 style="display:inline-flex;align-items:center;gap:10px">${ICONS.dashboard}<span>My Stats</span></h1>
        <p style="color:var(--text-soft);margin:4px 0 0">Your personal metrics — live data + custom cards</p>
      </div>
    </div>
    ${_statsKpis}
    ${jobsDonutHtml}
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
  `;

  bindCustomActions(container, storageKey, customCards);

  container.querySelector('#emp-daily-target')?.addEventListener('change', e => {
    const v = Math.max(1, parseInt(e.target.value, 10) || 5);
    e.target.value = v;
    localStorage.setItem('nest-daily-target-emp', String(v));
    toast('Daily target saved', 'success');
  });
}
