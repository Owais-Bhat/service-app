// Service Log — admin's day-to-day service register, same columns as the old
// Service_Log.xlsx sheet (Date, Technician, Customer, Service, Problem, Items,
// Amount, Payment Status) plus its Paid/Pending/Unpaid summary. An entry can
// be linked to a real ticket (pre-fills customer/service/problem/technician)
// but every field stays editable, and the amount is always typed by hand.
import { toast, exportToCSV } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const authHeaders = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(!!body),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthStart = () => today().slice(0, 8) + '01';
const fmtDate = (ymd) => {
  if (!ymd) return '—';
  const [y, m, d] = String(ymd).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

const STATUSES = [
  { key: 'paid', label: 'Paid', badge: 'badge-success' },
  { key: 'pending', label: 'Pending', badge: 'badge-pending' },
  { key: 'unpaid', label: 'Unpaid', badge: 'badge-danger' },
];
const statusOf = (k) => STATUSES.find(s => s.key === k) || STATUSES[1];

const filters = { from: monthStart(), to: today(), technician_id: '', status: '', q: '' };
let technicians = [];
let rows = [];

export async function renderServiceLogTab(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.clipboard}</span>
          <span>Service Log</span>
        </h1>
        <p>Daily service register — link a ticket or write it by hand, enter the amount, and track payment.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary" id="sl-export">${ICONS.download}<span>Export CSV</span></button>
        <button class="btn btn-primary" id="sl-add">${ICONS.plus}<span>New Entry</span></button>
      </div>
    </div>

    <div id="sl-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:18px;"></div>

    <div class="card" style="margin-bottom:18px;">
      <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;align-items:end;">
        <div class="form-group" style="margin:0;"><label>From</label><input type="date" id="sl-from" value="${filters.from}"></div>
        <div class="form-group" style="margin:0;"><label>To</label><input type="date" id="sl-to" value="${filters.to}"></div>
        <div class="form-group" style="margin:0;"><label>Technician</label><select id="sl-tech"><option value="">All technicians</option></select></div>
        <div class="form-group" style="margin:0;"><label>Payment</label>
          <select id="sl-status"><option value="">All</option>${STATUSES.map(s => `<option value="${s.key}"${filters.status === s.key ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
        </div>
        <div class="form-group" style="margin:0;"><label>Search</label><input type="text" id="sl-q" placeholder="Customer, ticket, phone…" value="${esc(filters.q)}"></div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Date</th><th>Ticket</th><th>Technician</th><th>Customer</th><th>Type of Service</th>
          <th>Problem</th><th>Items Taken / Used</th><th style="text-align:right">Amount</th><th>Payment</th><th></th>
        </tr></thead>
        <tbody id="sl-body"><tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-dim)">Loading…</td></tr></tbody>
      </table></div>
    </div>
  `;

  const $ = (sel) => container.querySelector(sel);
  let searchTimer;
  $('#sl-from').onchange = (e) => { filters.from = e.target.value; load(container); };
  $('#sl-to').onchange = (e) => { filters.to = e.target.value; load(container); };
  $('#sl-tech').onchange = (e) => { filters.technician_id = e.target.value; load(container); };
  $('#sl-status').onchange = (e) => { filters.status = e.target.value; load(container); };
  $('#sl-q').oninput = (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filters.q = e.target.value; load(container); }, 300);
  };
  $('#sl-add').onclick = () => openEntryModal(null, () => load(container));
  $('#sl-export').onclick = () => {
    if (!rows.length) return toast('Nothing to export', 'info');
    exportToCSV(`service-log-${filters.from || 'all'}-to-${filters.to || 'all'}.csv`, rows.map(r => ({
      Date: fmtDate(r.log_date),
      Ticket: r.ticket_no || '',
      'Technician Name': r.technician_name || '',
      'Name of Customer': r.customer_name,
      Phone: r.customer_phone || '',
      'Type of Service': r.service_type || '',
      'Problem Description': r.problem || '',
      'Items Taken / Used': r.items_used || '',
      Amount: Number(r.amount || 0),
      'Payment Status': statusOf(r.payment_status).label,
    })));
  };

  try {
    technicians = await api('GET', '/service-logs/technicians');
    $('#sl-tech').innerHTML = `<option value="">All technicians</option>` +
      technicians.map(t => `<option value="${esc(t.id)}"${filters.technician_id === t.id ? ' selected' : ''}>${esc(t.full_name)}</option>`).join('');
  } catch (err) {
    toast(err.message, 'error');
  }
  load(container);
}

async function load(container) {
  const body = container.querySelector('#sl-body');
  if (!body) return;
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  try {
    rows = await api('GET', `/service-logs${qs ? '?' + qs : ''}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--danger)">${esc(err.message)}</td></tr>`;
    return;
  }
  renderSummary(container);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--text-dim)">No entries for these filters. Click <b>New Entry</b> to add one.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r => {
    const st = statusOf(r.payment_status);
    return `<tr data-id="${esc(r.id)}" class="sl-row" style="cursor:pointer;">
      <td style="white-space:nowrap">${fmtDate(r.log_date)}</td>
      <td style="font-family:monospace;white-space:nowrap">${esc(r.ticket_no || '—')}</td>
      <td>${esc(r.technician_name || '—')}</td>
      <td><b>${esc(r.customer_name)}</b>${r.customer_phone ? `<div style="font-size:0.78rem;color:var(--text-dim)">${esc(r.customer_phone)}</div>` : ''}</td>
      <td>${esc(r.service_type || '—')}</td>
      <td style="max-width:240px;white-space:pre-wrap">${esc(r.problem || '—')}</td>
      <td style="max-width:200px;white-space:pre-wrap">${esc(r.items_used || '—')}</td>
      <td style="text-align:right;font-weight:700;white-space:nowrap">${inr(r.amount)}</td>
      <td><span class="badge ${st.badge}">${st.label}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm sl-edit" data-id="${esc(r.id)}" title="Edit">${ICONS.edit}</button>
        <button class="btn btn-secondary btn-sm sl-del" data-id="${esc(r.id)}" title="Delete" style="color:var(--danger)">${ICONS.close}</button>
      </td>
    </tr>`;
  }).join('');

  const byId = (id) => rows.find(r => r.id === id);
  body.querySelectorAll('.sl-row').forEach(tr => {
    tr.onclick = (e) => {
      if (e.target.closest('.sl-del')) return;
      openEntryModal(byId(tr.dataset.id), () => load(container));
    };
  });
  body.querySelectorAll('.sl-del').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const r = byId(btn.dataset.id);
      if (!r || !confirm(`Delete the entry for ${r.customer_name} (${fmtDate(r.log_date)})?`)) return;
      try {
        await api('DELETE', `/service-logs/${r.id}`);
        toast('Entry deleted', 'success');
        load(container);
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  });
}

function renderSummary(container) {
  const el = container.querySelector('#sl-summary');
  const sum = (list) => list.reduce((s, r) => s + Number(r.amount || 0), 0);
  const cards = [
    ...STATUSES.map(s => {
      const list = rows.filter(r => r.payment_status === s.key);
      return { label: s.label, jobs: list.length, amount: sum(list), color: s.key === 'paid' ? 'var(--success)' : s.key === 'pending' ? 'var(--warning)' : 'var(--danger)' };
    }),
    { label: 'Total', jobs: rows.length, amount: sum(rows), color: 'var(--primary)' },
  ];
  el.innerHTML = cards.map(c => `
    <div class="card" style="padding:16px;border-left:4px solid ${c.color};">
      <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim)">${c.label}</div>
      <div style="font-size:1.4rem;font-weight:800;color:${c.color};margin-top:4px">${inr(c.amount)}</div>
      <div style="font-size:0.8rem;color:var(--text-dim)">${c.jobs} job${c.jobs === 1 ? '' : 's'}</div>
    </div>`).join('');
}

function openEntryModal(entry, onSaved) {
  const e = entry || { log_date: today(), payment_status: 'pending' };
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-header">
        <span class="modal-title">${entry ? 'Edit Service Entry' : 'New Service Entry'}</span>
        <button class="modal-close" id="sl-m-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-group" style="position:relative;">
          <label>Ticket <span style="color:var(--text-dim);font-weight:500;">(optional — search by ticket no, name or phone to auto-fill)</span></label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="sl-m-ticket" autocomplete="off" placeholder="Search ticket…" value="${esc(e.ticket_no || '')}" style="flex:1;">
            <button type="button" class="btn btn-secondary btn-sm" id="sl-m-unlink" style="${e.inquiry_id ? '' : 'display:none;'}">Unlink</button>
          </div>
          <div id="sl-m-results" class="card" style="display:none;position:absolute;left:0;right:0;z-index:10;max-height:260px;overflow:auto;margin-top:4px;padding:4px;"></div>
          <small id="sl-m-linked" style="display:block;margin-top:6px;color:var(--primary);font-size:0.78rem;">${e.inquiry_id ? 'Linked to ticket ' + esc(e.ticket_no || '') : ''}</small>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          <div class="form-group"><label>Date</label><input type="date" id="sl-m-date" value="${esc(String(e.log_date || today()).slice(0, 10))}"></div>
          <div class="form-group"><label>Technician Name</label>
            <select id="sl-m-tech">
              <option value="">— Select —</option>
              ${technicians.map(t => `<option value="${esc(t.id)}"${e.technician_id === t.id ? ' selected' : ''}>${esc(t.full_name)}</option>`).join('')}
              ${e.technician_name && !e.technician_id ? `<option value="" selected>${esc(e.technician_name)}</option>` : ''}
            </select>
          </div>
          <div class="form-group"><label>Name of Customer</label><input type="text" id="sl-m-customer" value="${esc(e.customer_name || '')}" placeholder="Customer name"></div>
          <div class="form-group"><label>Phone <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label><input type="tel" id="sl-m-phone" value="${esc(e.customer_phone || '')}"></div>
          <div class="form-group"><label>Type of Service</label><input type="text" id="sl-m-service" value="${esc(e.service_type || '')}" placeholder="e.g. CCTV repair"></div>
          <div class="form-group"><label>Amount (₹)</label><input type="number" id="sl-m-amount" min="0" step="1" value="${e.amount != null ? Number(e.amount) : ''}" placeholder="0"></div>
          <div class="form-group"><label>Payment Status</label>
            <select id="sl-m-status">${STATUSES.map(s => `<option value="${s.key}"${e.payment_status === s.key ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group"><label>Problem Description</label><textarea id="sl-m-problem" rows="3">${esc(e.problem || '')}</textarea></div>
        <div class="form-group"><label>Items Taken / Used</label><textarea id="sl-m-items" rows="2" placeholder="e.g. 1TB HDD, 2 BNC connectors">${esc(e.items_used || '')}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="sl-m-cancel">Cancel</button>
        <button class="btn btn-primary" id="sl-m-save">${ICONS.check}<span>${entry ? 'Save Changes' : 'Add Entry'}</span></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#sl-m-close').onclick = close;
  $('#sl-m-cancel').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

  let inquiryId = e.inquiry_id || null;
  const setLinked = (ticket) => {
    inquiryId = ticket ? ticket.id : null;
    $('#sl-m-linked').textContent = ticket ? `Linked to ticket ${ticket.ticket_no || ''}` : '';
    $('#sl-m-unlink').style.display = ticket ? '' : 'none';
  };
  $('#sl-m-unlink').onclick = () => setLinked(null);

  // Ticket search → pick → pre-fill (only overwrites fields from the ticket;
  // amount is left for the admin to type unless it's still empty).
  const results = $('#sl-m-results');
  let tickets = [];
  let timer;
  $('#sl-m-ticket').oninput = (ev) => {
    clearTimeout(timer);
    const q = ev.target.value.trim();
    if (q.length < 2) { results.style.display = 'none'; return; }
    timer = setTimeout(async () => {
      try {
        tickets = await api('GET', `/service-logs/tickets?q=${encodeURIComponent(q)}`);
      } catch (err) {
        toast(err.message, 'error');
        return;
      }
      results.innerHTML = tickets.length
        ? tickets.map((t, i) => `
            <div class="sl-pick" data-i="${i}" style="padding:8px 10px;border-radius:8px;cursor:pointer;">
              <b style="font-family:monospace;color:var(--primary)">${esc(t.ticket_no || 'No ticket')}</b>
              · ${esc(t.full_name)}${t.phone ? ' · ' + esc(t.phone) : ''}
              <div style="font-size:0.78rem;color:var(--text-dim)">${esc(t.service_item || '')}${t.assigned_name ? ' — ' + esc(t.assigned_name) : ''}</div>
            </div>`).join('')
        : '<div style="padding:10px;color:var(--text-dim)">No matching tickets</div>';
      results.style.display = 'block';
      results.querySelectorAll('.sl-pick').forEach(el => {
        el.onmouseenter = () => { el.style.background = 'var(--bg-soft)'; };
        el.onmouseleave = () => { el.style.background = ''; };
        el.onclick = () => {
          const t = tickets[Number(el.dataset.i)];
          $('#sl-m-ticket').value = t.ticket_no || '';
          $('#sl-m-customer').value = t.full_name || '';
          $('#sl-m-phone').value = t.phone || '';
          if (t.service_item) $('#sl-m-service').value = t.service_item;
          const problem = [t.description, t.employee_update_detail].filter(Boolean).join('\n');
          if (problem) $('#sl-m-problem').value = problem;
          if (t.assigned_employee_id && technicians.some(x => x.id === t.assigned_employee_id)) {
            $('#sl-m-tech').value = t.assigned_employee_id;
          }
          if (!$('#sl-m-amount').value && Number(t.bill_amount) > 0) $('#sl-m-amount').value = Number(t.bill_amount);
          if (t.payment_status === 'paid') $('#sl-m-status').value = 'paid';
          setLinked(t);
          results.style.display = 'none';
        };
      });
    }, 250);
  };

  $('#sl-m-save').onclick = async () => {
    const techSel = $('#sl-m-tech');
    const techId = techSel.value || null;
    const techName = techSel.selectedIndex > 0 ? techSel.options[techSel.selectedIndex].text : null;
    const payload = {
      log_date: $('#sl-m-date').value,
      inquiry_id: inquiryId,
      ticket_no: $('#sl-m-ticket').value.trim() || null,
      technician_id: techId,
      technician_name: techName,
      customer_name: $('#sl-m-customer').value.trim(),
      customer_phone: $('#sl-m-phone').value.trim(),
      service_type: $('#sl-m-service').value.trim(),
      problem: $('#sl-m-problem').value.trim(),
      items_used: $('#sl-m-items').value.trim(),
      amount: $('#sl-m-amount').value,
      payment_status: $('#sl-m-status').value,
    };
    if (!payload.customer_name) return toast('Customer name is required', 'error');
    const btn = $('#sl-m-save');
    btn.disabled = true;
    try {
      if (entry) await api('PUT', `/service-logs/${entry.id}`, payload);
      else await api('POST', '/service-logs', payload);
      toast(entry ? 'Entry updated' : 'Entry added', 'success');
      close();
      onSaved?.();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}
