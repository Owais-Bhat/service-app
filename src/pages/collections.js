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

// Money model per ticket.
//  net      = bill_total            → the amount actually collected from the client
//  discount = discount_amount       → the discount the employee gave (company's profit cut, "mine")
//  gross    = net + discount        → service price BEFORE any discount
//  travel   = transport_fee
//  service  = gross − travel        → service + any additions (the part the employee sees)
function amounts(row) {
  const net = num(row.bill_total);
  const discount = num(row.discount_amount);
  const travel = num(row.transport_fee);
  const gross = net + discount;
  const service = Math.max(0, gross - travel);
  return { net, discount, travel, gross, service };
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
    ${bdRow('Travel', inr(m.travel))}
    ${admin
      ? bdRow('Discount given (your profit cut)', `-${inr(m.discount)}`, { color: 'var(--danger)' })
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

// What the ADMIN sees: gross, discount given (profit cut) and net collected.
function summarizeAdmin(rows) {
  return rows.reduce((a, r) => {
    const m = amounts(r);
    a.service += m.service; a.travel += m.travel; a.gross += m.gross;
    a.discount += m.discount; a.net += m.net; a.count += 1;
    return a;
  }, { service: 0, travel: 0, gross: 0, discount: 0, net: 0, count: 0 });
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

  container.innerHTML = `
    <div class="page-header collection-header">
      <div>
        <h1>My Collections</h1>
        <p>Service charges and travel you have collected</p>
      </div>
      <button class="btn btn-secondary" id="collections-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>
    <div class="collection-filters">
      ${['daily','weekly','monthly','yearly','all'].map(p => `<button class="sr-filter ${p === (container.dataset.period || 'monthly') ? 'active' : ''}" data-period="${p}">${p}</button>`).join('')}
      <input type="date" id="coll-from" value="${filters.from}">
      <input type="date" id="coll-to" value="${filters.to}">
      <button class="btn btn-secondary btn-sm" id="coll-apply">Apply</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${inr(totals.service)}</div><div class="stat-label">Service (${totals.count})</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${inr(totals.travel)}</div><div class="stat-label">Travel</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${inr(totals.total)}</div><div class="stat-label">Total Collection</div></div>
    </div>
    <div class="card">${employeeTable(visible)}</div>
  `;

  container.querySelector('#collections-refresh').onclick = () => renderEmployeeCollections(container);
  container.querySelectorAll('.coll-row').forEach(tr => tr.onclick = () => {
    const r = visible.find(x => String(x.id) === tr.dataset.id);
    if (r) openBillDetail(r, { admin: false });
  });
  container.querySelectorAll('.collection-filters .sr-filter').forEach(btn => {
    btn.onclick = () => {
      container.dataset.period = btn.dataset.period;
      container.dataset.from = '';
      container.dataset.to = '';
      renderEmployeeCollections(container);
    };
  });
  container.querySelector('#coll-apply').onclick = () => {
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
        <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Employee</th><th>Service</th><th>Travel</th><th>Discount</th><th>Net</th></tr></thead>
        <tbody>
          ${rows.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim)">No collections found</td></tr>' : rows.map(r => {
            const m = amounts(r);
            return `
            <tr class="coll-row" data-id="${escapeHtml(r.id)}" style="cursor:pointer;">
              <td><small style="color:var(--text-dim)">${paymentDate(r) ? formatDate(paymentDate(r)) : '-'}</small></td>
              <td><code style="font-size:0.75rem;color:var(--primary)">${escapeHtml(r.ticket_no || '-')}</code></td>
              <td><b>${escapeHtml(r.full_name || 'Client')}</b><br/><small style="color:var(--text-dim)">${escapeHtml(r.service_item || '')}</small></td>
              <td>${escapeHtml(profileById.get(r.assigned_employee_id)?.full_name || 'Employee')}</td>
              <td>${inr(m.service)}</td>
              <td>${inr(m.travel)}</td>
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
  const [{ data: rowsData }, { data: profiles }] = await Promise.all([
    supabase.from('inquiries').select('*').eq('payment_status', 'paid').order('payment_received_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name,phone').eq('role', 'employee'),
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

  container.innerHTML = `
    <div class="page-header collection-header">
      <div>
        <h1>Collection Reports</h1>
        <p>Detailed service collections, discounts (your profit cut) and net by employee</p>
      </div>
      <button class="btn btn-primary" id="coll-export">${ICONS.download}<span>Export</span></button>
    </div>
    <div class="collection-filters">
      ${['daily','weekly','monthly','yearly','all'].map(p => `<button class="sr-filter ${p === (container.dataset.period || 'monthly') ? 'active' : ''}" data-period="${p}">${p}</button>`).join('')}
      <select id="coll-employee">
        <option value="all">All employees</option>
        ${employees.map(e => `<option value="${e.id}" ${filters.employee === e.id ? 'selected' : ''}>${escapeHtml(e.full_name || e.phone || e.id)}</option>`).join('')}
      </select>
      <input type="date" id="coll-from" value="${filters.from}">
      <input type="date" id="coll-to" value="${filters.to}">
      <button class="btn btn-secondary btn-sm" id="coll-apply">Apply</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${inr(totals.service)}</div><div class="stat-label">Service (${totals.count})</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${inr(totals.travel)}</div><div class="stat-label">Travel</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${inr(totals.discount)}</div><div class="stat-label">Discount Given (profit cut)</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${inr(totals.net)}</div><div class="stat-label">Net Collected</div></div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">By Employee</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Service</th><th>Travel</th><th>Discount</th><th>Net</th></tr></thead>
          <tbody>${empRows.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--text-dim)">No collections found</td></tr>' : empRows.map(e => `
            <tr><td><b>${escapeHtml(e.name)}</b></td><td>${inr(e.service)}</td><td>${inr(e.travel)}</td><td style="color:var(--danger)">${e.discount > 0 ? '-' + inr(e.discount) : '—'}</td><td><b>${inr(e.net)}</b></td></tr>
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
  container.querySelectorAll('.collection-filters .sr-filter').forEach(btn => {
    btn.onclick = () => {
      container.dataset.period = btn.dataset.period;
      container.dataset.from = '';
      container.dataset.to = '';
      renderAdminCollections(container);
    };
  });
  container.querySelector('#coll-apply').onclick = () => {
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
      discount: m.discount,
      net: m.net,
      payment_method: r.payment_method === 'cash' ? 'cash' : 'online',
    };
  }));
}
