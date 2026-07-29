import { supabase } from '../supabase.js';
import { formatDate, showLoader, exportToCSV } from '../utils.js';
import { ICONS } from '../icons.js';

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
const num = (v) => Number(v) || 0;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function dateKey(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (match) return match[1];
  const d = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
}

function rangeFor(period) {
  const now = new Date();
  const end = now.toLocaleDateString('en-CA');
  const start = new Date(now);
  if (period === 'daily') return { from: end, to: end };
  if (period === 'weekly') start.setDate(now.getDate() - 6);
  else if (period === 'monthly') start.setMonth(now.getMonth(), 1);
  else if (period === 'yearly') start.setMonth(0, 1);
  else return { from: '', to: '' };
  return { from: start.toLocaleDateString('en-CA'), to: end };
}

function paymentDate(row) {
  return dateKey(row.payment_received_at || row.cash_collected_at || row.bill_generated_at || row.updated_at || row.created_at);
}

function filterRows(rows, filters) {
  return rows.filter(row => {
    const key = paymentDate(row);
    if (filters.from && key && key < filters.from) return false;
    if (filters.to && key && key > filters.to) return false;
    if (filters.employee && filters.employee !== 'all' && row.assigned_employee_id !== filters.employee) return false;
    return true;
  });
}

// Money model per ticket. Bill total already includes platform fee + GST, so we
// back each component out of the stored figures (always reconciles to net):
//   net             = bill_total          → total collected from the client (incl. GST + platform)
//   gst             = gst_amount          → tax portion
//   platform        = platform_fee        → platform/convenience fee
//   travel          = transport_fee
//   discount        = discount_amount     → discount the employee gave (company's profit cut)
//   extra           = extra_cost          → additional charges
//   taxable         = net − gst           → pre-tax amount
//   servicesSubtotal= taxable − extra − platform − travel + discount
//   service         = servicesSubtotal + extra   → service + additions (the part the employee sees)
function amounts(row) {
  const net = num(row.bill_total);
  const gst = num(row.gst_amount);
  const platform = num(row.platform_fee);
  const travel = num(row.transport_fee);
  const discount = num(row.discount_amount);
  const extra = num(row.extra_cost);
  const taxable = Math.max(0, net - gst);
  const servicesSubtotal = Math.max(0, taxable - extra - platform - travel + discount);
  const service = servicesSubtotal + extra;
  const gross = service + travel;
  const gstRate = taxable > 0 ? Math.round((gst / taxable) * 100) : 0;
  return { net, gst, gstRate, platform, travel, discount, extra, taxable, servicesSubtotal, service, gross };
}

// ── BILL DETAIL (per-ticket breakdown) ───────────────────────────
let _pricingCache = null;
async function loadPricingMap() {
  if (_pricingCache) return _pricingCache;
  const { data } = await supabase.from('service_pricing').select('id,name,cost');
  const map = new Map();
  (data || []).forEach(s => map.set(String(s.id), { name: s.name, cost: Number(s.cost) || 0 }));
  _pricingCache = map;
  return map;
}

const bdRow = (label, value, opts = {}) =>
  `<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--border);font-size:.92rem;${opts.total ? 'font-weight:800;border-bottom:none;border-top:2px solid var(--border);margin-top:4px;padding-top:12px;' : ''}${opts.color ? `color:${opts.color};` : ''}"><span>${label}</span><span>${value}</span></div>`;

// Opens the full bill breakdown for one ticket. admin=true shows discount
// (your profit cut) + net collected; employees see service + additions + travel only.
async function openBillDetail(row, { admin }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <span class="modal-title">Bill Detail — ${escapeHtml(row.ticket_no || '')}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body" id="bill-detail-body"><div style="text-align:center;padding:34px;color:var(--text-dim)">Loading…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const [{ data: links }, pricing] = await Promise.all([
    supabase.from('inquiry_services').select('*').eq('inquiry_id', row.id),
    loadPricingMap(),
  ]);
  const items = (links || []).map(l => pricing.get(String(l.service_id))).filter(Boolean);
  const m = amounts(row);
  const extra = num(row.extra_cost);

  const lineRows = items.length
    ? items.map(it => bdRow(escapeHtml(it.name || 'Service'), inr(it.cost))).join('')
    : bdRow('<span style="color:var(--text-dim)">Service charge</span>', inr(Math.max(0, m.service - extra)));

  const body = overlay.querySelector('#bill-detail-body');
  body.innerHTML = `
    <div style="margin-bottom:12px;">
      <b>${escapeHtml(row.full_name || 'Client')}</b><br>
      <small style="color:var(--text-dim)">${escapeHtml(row.service_item || '')}${paymentDate(row) ? ' · ' + formatDate(paymentDate(row)) : ''}</small>
    </div>
    <div style="text-transform:uppercase;letter-spacing:.05em;font-size:.72rem;font-weight:700;color:var(--text-dim);margin-bottom:4px;">Services</div>
    ${lineRows}
    ${extra > 0 ? bdRow(`Additional charges${row.extra_cost_reason ? ` (${escapeHtml(row.extra_cost_reason)})` : ''}`, inr(extra)) : ''}
    ${admin && m.platform > 0 ? bdRow('Platform fee', inr(m.platform)) : ''}
    ${bdRow('Travel', inr(m.travel))}
    ${admin
      ? (m.discount > 0 ? bdRow('Discount given (your profit cut)', `-${inr(m.discount)}`, { color: 'var(--danger)' }) : '')
        + bdRow('Taxable', inr(m.taxable))
        + (m.gst > 0 ? bdRow(`GST${m.gstRate ? ` (${m.gstRate}%)` : ''}`, inr(m.gst)) : '')
        + bdRow('Net collected', inr(m.net), { total: true })
        + bdRow('<span style="color:var(--text-dim)">Payment mode</span>', row.payment_method === 'cash' ? 'Cash' : 'Online')
      : bdRow('Total', inr(m.service + m.travel), { total: true })}
  `;
}

// What the EMPLOYEE is allowed to see: service + travel only (no discount/profit).
function summarizeEmployee(rows) {
  return rows.reduce((a, r) => {
    const m = amounts(r);
    a.service += m.service; a.travel += m.travel; a.total += m.service + m.travel; a.count += 1;
    return a;
  }, { service: 0, travel: 0, total: 0, count: 0 });
}

// What the ADMIN sees: service, travel, platform fee, GST, discount and net.
function summarizeAdmin(rows) {
  return rows.reduce((a, r) => {
    const m = amounts(r);
    a.service += m.service; a.travel += m.travel; a.platform += m.platform;
    a.gst += m.gst; a.discount += m.discount; a.net += m.net; a.count += 1;
    return a;
  }, { service: 0, travel: 0, platform: 0, gst: 0, discount: 0, net: 0, count: 0 });
}

// ── EMPLOYEE COLLECTIONS ─────────────────────────────────────────
function employeeTable(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Service</th><th>Travel</th><th>Total</th></tr></thead>
        <tbody>
          ${rows.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No collections found</td></tr>' : rows.map(r => {
            const m = amounts(r);
            return `
            <tr class="coll-row" data-id="${escapeHtml(r.id)}" style="cursor:pointer;">
              <td><small style="color:var(--text-dim)">${paymentDate(r) ? formatDate(paymentDate(r)) : '-'}</small></td>
              <td><code style="font-size:0.75rem;color:var(--primary)">${escapeHtml(r.ticket_no || '-')}</code></td>
              <td><b>${escapeHtml(r.full_name || 'Client')}</b><br/><small style="color:var(--text-dim)">${escapeHtml(r.service_item || '')}</small></td>
              <td>${inr(m.service)}</td>
              <td>${inr(m.travel)}</td>
              <td><b>${inr(m.service + m.travel)}</b></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderEmployeeCollections(container) {
  showLoader(container);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const { data } = await supabase.from('inquiries')
    .select('*')
    .eq('assigned_employee_id', user.id)
    .eq('payment_status', 'paid')
    .order('payment_received_at', { ascending: false });

  const rows = Array.isArray(data) ? data.filter(r => num(r.bill_total) > 0) : [];
  const filters = { ...rangeFor(container.dataset.period || 'monthly') };
  filters.from = container.dataset.from || filters.from;
  filters.to = container.dataset.to || filters.to;
  const visible = filterRows(rows, filters);
  const totals = summarizeEmployee(visible);
  const gigRows = visible.filter(r => Number(r.is_gig_job) === 1);
  const gigTotal = gigRows.reduce((sum, r) => sum + (Number(r.gig_payout_amount) || 0), 0);
  const gigPaid = gigRows.filter(r => r.gig_payout_status === 'paid').reduce((sum, r) => sum + (Number(r.gig_payout_amount) || 0), 0);
  const gigUnpaid = gigTotal - gigPaid;

  const activePeriod = container.dataset.period || 'monthly';
  container.innerHTML = `
    <div class="page-header collection-header">
      <div>
        <h1>My Collections</h1>
        <p>Service charges and travel you have collected</p>
      </div>
    </div>

    <div class="coll-filter-bar">
      <div class="coll-filter-group">
        <label class="coll-filter-label">Period</label>
        <select id="coll-period" class="coll-select">
          <option value="daily"   ${activePeriod === 'daily'   ? 'selected' : ''}>Today</option>
          <option value="weekly"  ${activePeriod === 'weekly'  ? 'selected' : ''}>This Week</option>
          <option value="monthly" ${activePeriod === 'monthly' ? 'selected' : ''}>This Month</option>
          <option value="yearly"  ${activePeriod === 'yearly'  ? 'selected' : ''}>This Year</option>
          <option value="custom"  ${activePeriod === 'custom'  ? 'selected' : ''}>Custom Range</option>
          <option value="all"     ${activePeriod === 'all'     ? 'selected' : ''}>All Time</option>
        </select>
      </div>
      <div class="coll-filter-group coll-date-wrap" id="coll-custom-dates" style="${activePeriod === 'custom' ? '' : 'display:none'}">
        <label class="coll-filter-label">From</label>
        <input type="date" id="coll-from" class="coll-date-input" value="${filters.from}">
        <label class="coll-filter-label" style="margin-left:8px;">To</label>
        <input type="date" id="coll-to" class="coll-date-input" value="${filters.to}">
        <button class="btn btn-primary btn-sm" id="coll-apply">Apply</button>
      </div>
    </div>

    <div class="coll-stats-row">
      <div class="coll-stat-card coll-stat-service">
        <div class="coll-stat-icon">🔧</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${inr(totals.service)}</div>
          <div class="coll-stat-lbl">Service · ${totals.count} ticket${totals.count !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-travel">
        <div class="coll-stat-icon">🚗</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${inr(totals.travel)}</div>
          <div class="coll-stat-lbl">Travel</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-total">
        <div class="coll-stat-icon">💰</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${inr(totals.total)}</div>
          <div class="coll-stat-lbl">Total Collected</div>
        </div>
      </div>
    </div>

    ${gigRows.length > 0 ? `
      <div class="card" style="margin-bottom:24px;padding:18px;">
        <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:14px;">Your Gig Pool Earnings</div>
        <div class="coll-stats-row">
          <div class="coll-stat-card">
            <div class="coll-stat-icon">🎯</div>
            <div class="coll-stat-body">
              <div class="coll-stat-val">${inr(gigTotal)}</div>
              <div class="coll-stat-lbl">Earned from Public Jobs · ${gigRows.length} job${gigRows.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <div class="coll-stat-card">
            <div class="coll-stat-icon">✅</div>
            <div class="coll-stat-body">
              <div class="coll-stat-val" style="color:var(--success)">${inr(gigPaid)}</div>
              <div class="coll-stat-lbl">Paid Out</div>
            </div>
          </div>
          <div class="coll-stat-card">
            <div class="coll-stat-icon">⏳</div>
            <div class="coll-stat-body">
              <div class="coll-stat-val" style="color:var(--warning)">${inr(gigUnpaid)}</div>
              <div class="coll-stat-lbl">Awaiting Payout</div>
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="card">${employeeTable(visible)}</div>
  `;

  container.querySelectorAll('.coll-row').forEach(tr => tr.onclick = () => {
    const r = visible.find(x => String(x.id) === tr.dataset.id);
    if (r) openBillDetail(r, { admin: false });
  });
  container.querySelector('#coll-period').onchange = function () {
    const p = this.value;
    const customDates = container.querySelector('#coll-custom-dates');
    if (p === 'custom') {
      customDates.style.display = '';
    } else {
      customDates.style.display = 'none';
      container.dataset.period = p;
      container.dataset.from = '';
      container.dataset.to = '';
      renderEmployeeCollections(container);
    }
  };
  const applyBtn = container.querySelector('#coll-apply');
  if (applyBtn) applyBtn.onclick = () => {
    container.dataset.period = 'custom';
    container.dataset.from = container.querySelector('#coll-from').value;
    container.dataset.to = container.querySelector('#coll-to').value;
    renderEmployeeCollections(container);
  };
}

// ── ADMIN COLLECTIONS ────────────────────────────────────────────
function adminTable(rows, profileById) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Employee</th><th>Service</th><th>Travel</th><th>Platform</th><th>GST</th><th>Discount</th><th>Net</th></tr></thead>
        <tbody>
          ${rows.length === 0 ? '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-dim)">No collections found</td></tr>' : rows.map(r => {
            const m = amounts(r);
            return `
            <tr class="coll-row" data-id="${escapeHtml(r.id)}" style="cursor:pointer;">
              <td><small style="color:var(--text-dim)">${paymentDate(r) ? formatDate(paymentDate(r)) : '-'}</small></td>
              <td><code style="font-size:0.75rem;color:var(--primary)">${escapeHtml(r.ticket_no || '-')}</code></td>
              <td><b>${escapeHtml(r.full_name || 'Client')}</b><br/><small style="color:var(--text-dim)">${escapeHtml(r.service_item || '')}</small></td>
              <td>${escapeHtml(profileById.get(r.assigned_employee_id)?.full_name || 'Employee')}</td>
              <td>${inr(m.service)}</td>
              <td>${inr(m.travel)}</td>
              <td>${m.platform > 0 ? inr(m.platform) : '<small style="color:var(--text-dim)">—</small>'}</td>
              <td>${m.gst > 0 ? `${inr(m.gst)}${m.gstRate ? `<br/><small style="color:var(--text-dim)">${m.gstRate}%</small>` : ''}` : '<small style="color:var(--text-dim)">—</small>'}</td>
              <td>${m.discount > 0 ? `<span style="color:var(--danger)">-${inr(m.discount)}</span>` : '<small style="color:var(--text-dim)">—</small>'}</td>
              <td><b>${inr(m.net)}</b><br/><small style="color:var(--text-dim)">${r.payment_method === 'cash' ? 'Cash' : 'Online'}</small></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminCollections(container) {
  showLoader(container);
  const [{ data: rowsData }, { data: profiles }, { data: gigRowsData }] = await Promise.all([
    supabase.from('inquiries').select('*').eq('payment_status', 'paid').order('payment_received_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name,phone,worker_type').eq('role', 'employee'),
    // Gig jobs shown regardless of payment status (billed-not-yet-paid still
    // matters to the admin) — unlike the rest of this page, which is "money
    // actually collected" and correctly excludes unpaid bills.
    supabase.from('inquiries').select('*').eq('is_gig_job', 1),
  ]);
  const rows = (rowsData || []).filter(r => num(r.bill_total) > 0);
  const employees = profiles || [];
  const profileById = new Map(employees.map(e => [e.id, e]));
  const baseRange = rangeFor(container.dataset.period || 'monthly');
  const filters = {
    from: container.dataset.from || baseRange.from,
    to: container.dataset.to || baseRange.to,
    employee: container.dataset.employee || 'all',
  };
  const visible = filterRows(rows, filters);
  const totals = summarizeAdmin(visible);

  const byEmp = new Map();
  visible.forEach(r => {
    const id = r.assigned_employee_id || 'unassigned';
    if (!byEmp.has(id)) byEmp.set(id, []);
    byEmp.get(id).push(r);
  });
  const empRows = [...byEmp.entries()].map(([id, list]) => {
    const s = summarizeAdmin(list);
    return { id, name: profileById.get(id)?.full_name || 'Unassigned', ...s };
  }).sort((a, b) => b.net - a.net);

  const gigAll = (gigRowsData || []).filter(r => num(r.bill_total) > 0);
  const gigVisible = filterRows(gigAll, filters);
  const gigTotalPayout = gigVisible.reduce((sum, r) => sum + (Number(r.gig_payout_amount) || 0), 0);
  const gigNet = gigVisible.reduce((sum, r) => sum + num(r.bill_total), 0);
  const gigCompanyKeeps = gigNet - gigTotalPayout;
  const gigUnpaidCount = gigVisible.filter(r => r.payment_status !== 'paid').length;
  const byGigWorker = new Map();
  gigVisible.forEach(r => {
    const id = r.claimed_by_gig_worker_id || r.assigned_employee_id || 'unknown';
    if (!byGigWorker.has(id)) byGigWorker.set(id, { count: 0, payout: 0, net: 0 });
    const g = byGigWorker.get(id);
    g.count += 1;
    g.payout += Number(r.gig_payout_amount) || 0;
    g.net += num(r.bill_total);
  });
  const gigWorkerRows = [...byGigWorker.entries()]
    .map(([id, s]) => ({ id, name: profileById.get(id)?.full_name || 'Gig Worker', ...s }))
    .sort((a, b) => b.payout - a.payout);

  const activePeriod = container.dataset.period || 'monthly';
  container.innerHTML = `
    <div class="page-header collection-header">
      <div>
        <h1>Collection Reports</h1>
        <p>Detailed service collections, discounts and net by employee</p>
      </div>
      <button class="btn btn-primary" id="coll-export">${ICONS.download}<span>Export</span></button>
    </div>

    <div class="coll-filter-bar">
      <div class="coll-filter-group">
        <label class="coll-filter-label">Period</label>
        <select id="coll-period" class="coll-select">
          <option value="daily"   ${activePeriod === 'daily'   ? 'selected' : ''}>Today</option>
          <option value="weekly"  ${activePeriod === 'weekly'  ? 'selected' : ''}>This Week</option>
          <option value="monthly" ${activePeriod === 'monthly' ? 'selected' : ''}>This Month</option>
          <option value="yearly"  ${activePeriod === 'yearly'  ? 'selected' : ''}>This Year</option>
          <option value="custom"  ${activePeriod === 'custom'  ? 'selected' : ''}>Custom Range</option>
          <option value="all"     ${activePeriod === 'all'     ? 'selected' : ''}>All Time</option>
        </select>
      </div>
      <div class="coll-filter-group">
        <label class="coll-filter-label">Employee</label>
        <select id="coll-employee" class="coll-select">
          <option value="all">All Employees</option>
          ${employees.map(e => `<option value="${e.id}" ${filters.employee === e.id ? 'selected' : ''}>${escapeHtml(e.full_name || e.phone || e.id)}</option>`).join('')}
        </select>
      </div>
      <div class="coll-filter-group coll-date-wrap" id="coll-custom-dates" style="${activePeriod === 'custom' ? '' : 'display:none'}">
        <label class="coll-filter-label">From</label>
        <input type="date" id="coll-from" class="coll-date-input" value="${filters.from}">
        <label class="coll-filter-label" style="margin-left:8px;">To</label>
        <input type="date" id="coll-to" class="coll-date-input" value="${filters.to}">
        <button class="btn btn-primary btn-sm" id="coll-apply">Apply</button>
      </div>
    </div>

    <div class="coll-stats-row">
      <div class="coll-stat-card coll-stat-service">
        <div class="coll-stat-icon">🔧</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${inr(totals.service)}</div>
          <div class="coll-stat-lbl">Service · ${totals.count} ticket${totals.count !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-travel">
        <div class="coll-stat-icon">🚗</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${inr(totals.travel)}</div>
          <div class="coll-stat-lbl">Travel</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-platform">
        <div class="coll-stat-icon">🏷️</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${inr(totals.platform)}</div>
          <div class="coll-stat-lbl">Platform Fee</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-gst">
        <div class="coll-stat-icon">🧾</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${inr(totals.gst)}</div>
          <div class="coll-stat-lbl">GST (18%)</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-discount">
        <div class="coll-stat-icon">🎁</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${inr(totals.discount)}</div>
          <div class="coll-stat-lbl">Discount Given</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-total">
        <div class="coll-stat-icon">💰</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${inr(totals.net)}</div>
          <div class="coll-stat-lbl">Net Collected</div>
        </div>
      </div>
    </div>

    ${gigVisible.length > 0 ? `
      <div class="card" style="margin-bottom:20px;padding:18px;">
        <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:14px;">Gig Pool Earnings</div>
        <div class="coll-stats-row" style="margin-bottom:16px;">
          <div class="coll-stat-card">
            <div class="coll-stat-icon">🎯</div>
            <div class="coll-stat-body">
              <div class="coll-stat-val">${inr(gigNet)}</div>
              <div class="coll-stat-lbl">Gig Jobs Collected · ${gigVisible.length} job${gigVisible.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <div class="coll-stat-card">
            <div class="coll-stat-icon">🏢</div>
            <div class="coll-stat-body">
              <div class="coll-stat-val">${inr(gigCompanyKeeps)}</div>
              <div class="coll-stat-lbl">Company Keeps (GST + Platform)</div>
            </div>
          </div>
          <div class="coll-stat-card">
            <div class="coll-stat-icon">👷</div>
            <div class="coll-stat-body">
              <div class="coll-stat-val">${inr(gigTotalPayout)}</div>
              <div class="coll-stat-lbl">Gig Worker Payouts</div>
            </div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Gig Worker</th><th>Jobs</th><th>Collected</th><th>Payout</th></tr></thead>
            <tbody>${gigWorkerRows.map(g => `<tr><td><b>${escapeHtml(g.name)}</b></td><td>${g.count}</td><td>${inr(g.net)}</td><td><b style="color:var(--primary)">${inr(g.payout)}</b></td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">By Employee</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Service</th><th>Travel</th><th>Platform</th><th>GST</th><th>Discount</th><th>Net</th></tr></thead>
          <tbody>${empRows.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-dim)">No collections found</td></tr>' : empRows.map(e => `
            <tr><td><b>${escapeHtml(e.name)}</b></td><td>${inr(e.service)}</td><td>${inr(e.travel)}</td><td>${inr(e.platform)}</td><td>${inr(e.gst)}</td><td style="color:var(--danger)">${e.discount > 0 ? '-' + inr(e.discount) : '—'}</td><td><b>${inr(e.net)}</b></td></tr>
          `).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="card">${adminTable(visible, profileById)}</div>
  `;

  container.querySelectorAll('.coll-row').forEach(tr => tr.onclick = () => {
    const r = visible.find(x => String(x.id) === tr.dataset.id);
    if (r) openBillDetail(r, { admin: true });
  });
  container.querySelector('#coll-period').onchange = function () {
    const p = this.value;
    const customDates = container.querySelector('#coll-custom-dates');
    if (p === 'custom') {
      customDates.style.display = '';
    } else {
      customDates.style.display = 'none';
      container.dataset.period = p;
      container.dataset.employee = container.querySelector('#coll-employee').value;
      container.dataset.from = '';
      container.dataset.to = '';
      renderAdminCollections(container);
    }
  };
  container.querySelector('#coll-employee').onchange = function () {
    container.dataset.employee = this.value;
    renderAdminCollections(container);
  };
  const applyBtn = container.querySelector('#coll-apply');
  if (applyBtn) applyBtn.onclick = () => {
    container.dataset.period = 'custom';
    container.dataset.employee = container.querySelector('#coll-employee').value;
    container.dataset.from = container.querySelector('#coll-from').value;
    container.dataset.to = container.querySelector('#coll-to').value;
    renderAdminCollections(container);
  };
  container.querySelector('#coll-export').onclick = () => exportToCSV('collection-report.csv', visible.map(r => {
    const m = amounts(r);
    return {
      date: paymentDate(r),
      ticket: r.ticket_no || '',
      customer: r.full_name || '',
      employee: profileById.get(r.assigned_employee_id)?.full_name || '',
      service: m.service,
      travel: m.travel,
      platform_fee: m.platform,
      gst: m.gst,
      discount: m.discount,
      net: m.net,
      payment_method: r.payment_method === 'cash' ? 'cash' : 'online',
    };
  }));
}
