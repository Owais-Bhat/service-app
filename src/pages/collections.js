import { supabase } from '../supabase.js';
import { formatDate, showLoader, exportToCSV } from '../utils.js';
import { ICONS } from '../icons.js';

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

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

function summarize(rows) {
  const cash = rows.filter(r => r.payment_method === 'cash');
  const online = rows.filter(r => r.payment_method !== 'cash');
  return {
    cashAmount: cash.reduce((a, r) => a + (Number(r.bill_total) || 0), 0),
    onlineAmount: online.reduce((a, r) => a + (Number(r.bill_total) || 0), 0),
    cashCount: cash.length,
    onlineCount: online.length,
  };
}

function rowsTable(rows, profileById) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Employee</th><th>Mode</th><th>Amount</th></tr></thead>
        <tbody>
          ${rows.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No collections found</td></tr>' : rows.map(r => `
            <tr>
              <td><small style="color:var(--text-dim)">${paymentDate(r) ? formatDate(paymentDate(r)) : '-'}</small></td>
              <td><code style="font-size:0.75rem;color:var(--primary)">${escapeHtml(r.ticket_no || '-')}</code></td>
              <td><b>${escapeHtml(r.full_name || 'Client')}</b><br/><small style="color:var(--text-dim)">${escapeHtml(r.service_item || '')}</small></td>
              <td>${escapeHtml(profileById.get(r.assigned_employee_id)?.full_name || 'Employee')}</td>
              <td><span class="badge ${r.payment_method === 'cash' ? 'badge-medium' : 'badge-resolved'}">${r.payment_method === 'cash' ? 'Cash' : 'Online'}</span></td>
              <td><b>${inr(r.bill_total)}</b></td>
            </tr>
          `).join('')}
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

  const rows = Array.isArray(data) ? data.filter(r => Number(r.bill_total) > 0) : [];
  const filters = { ...rangeFor(container.dataset.period || 'monthly') };
  filters.from = container.dataset.from || filters.from;
  filters.to = container.dataset.to || filters.to;
  const visible = filterRows(rows, filters);
  const totals = summarize(visible);

  container.innerHTML = `
    <div class="page-header collection-header">
      <div>
        <h1>My Collections</h1>
        <p>Your own cash and online payment totals</p>
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
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${inr(totals.cashAmount)}</div><div class="stat-label">Cash (${totals.cashCount})</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${inr(totals.onlineAmount)}</div><div class="stat-label">Online (${totals.onlineCount})</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${inr(totals.cashAmount + totals.onlineAmount)}</div><div class="stat-label">Total Collection</div></div>
    </div>
    <div class="card">${rowsTable(visible, new Map())}</div>
  `;

  container.querySelector('#collections-refresh').onclick = () => renderEmployeeCollections(container);
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

export async function renderAdminCollections(container) {
  showLoader(container);
  const [{ data: rowsData }, { data: profiles }] = await Promise.all([
    supabase.from('inquiries').select('*').eq('payment_status', 'paid').order('payment_received_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name,phone').eq('role', 'employee'),
  ]);
  const rows = (rowsData || []).filter(r => Number(r.bill_total) > 0);
  const employees = profiles || [];
  const profileById = new Map(employees.map(e => [e.id, e]));
  const baseRange = rangeFor(container.dataset.period || 'monthly');
  const filters = {
    from: container.dataset.from || baseRange.from,
    to: container.dataset.to || baseRange.to,
    employee: container.dataset.employee || 'all',
  };
  const visible = filterRows(rows, filters);
  const totals = summarize(visible);

  const byEmp = new Map();
  visible.forEach(r => {
    const id = r.assigned_employee_id || 'unassigned';
    if (!byEmp.has(id)) byEmp.set(id, []);
    byEmp.get(id).push(r);
  });
  const empRows = [...byEmp.entries()].map(([id, list]) => {
    const s = summarize(list);
    return { id, name: profileById.get(id)?.full_name || 'Unassigned', ...s };
  }).sort((a, b) => (b.cashAmount + b.onlineAmount) - (a.cashAmount + a.onlineAmount));

  container.innerHTML = `
    <div class="page-header collection-header">
      <div>
        <h1>Collection Reports</h1>
        <p>Cash and online totals by employee and grand total</p>
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
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${inr(totals.cashAmount)}</div><div class="stat-label">Grand Cash (${totals.cashCount})</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${inr(totals.onlineAmount)}</div><div class="stat-label">Grand Online (${totals.onlineCount})</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${inr(totals.cashAmount + totals.onlineAmount)}</div><div class="stat-label">Grand Total</div></div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">By Employee</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Cash</th><th>Online</th><th>Total</th></tr></thead>
          <tbody>${empRows.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--text-dim)">No collections found</td></tr>' : empRows.map(e => `
            <tr><td><b>${escapeHtml(e.name)}</b></td><td>${inr(e.cashAmount)} <small>(${e.cashCount})</small></td><td>${inr(e.onlineAmount)} <small>(${e.onlineCount})</small></td><td><b>${inr(e.cashAmount + e.onlineAmount)}</b></td></tr>
          `).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="card">${rowsTable(visible, profileById)}</div>
  `;

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
  container.querySelector('#coll-export').onclick = () => exportToCSV('collection-report.csv', visible.map(r => ({
    date: paymentDate(r),
    ticket: r.ticket_no || '',
    customer: r.full_name || '',
    employee: profileById.get(r.assigned_employee_id)?.full_name || '',
    payment_method: r.payment_method === 'cash' ? 'cash' : 'online',
    amount: Number(r.bill_total) || 0,
  })));
}
