// Past Records — the invoices, quotations, payments, purchases and returns brought over from Vyapar.
//
// They are here to look up and read: who was billed what, when, for which items, and what was paid. They are
// not accounting entries — the books start from the opening balances and stock brought in with them — so
// nothing here changes a balance, a stock count or a GST return.
import { toast } from '../utils.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export const TYPE_LABEL = {
  sale: 'Invoice', estimate: 'Quotation', purchase: 'Purchase', payment_in: 'Payment received', payment_out: 'Payment made',
  sale_return: 'Credit note', purchase_return: 'Purchase return', expense: 'Expense', delivery_challan: 'Delivery challan', other: 'Other',
};
const TABS = [
  ['all', 'All'], ['sale', 'Invoices'], ['estimate', 'Quotations'], ['payment_in', 'Payments received'],
  ['purchase', 'Purchases'], ['payment_out', 'Payments made'], ['sale_return', 'Credit notes'], ['purchase_return', 'Purchase returns'],
];
const STATE = { paid: ['ok', 'Paid'], partly_paid: ['warn', 'Part paid'], unpaid: ['muted', 'Unpaid'], open: ['muted', 'Open'], closed: ['ok', 'Closed'] };
const PAGE = 100;

const view = { type: 'all', q: '', from: '', to: '' };
let root = null;
let rows = [];
let total = 0;
let sum = 0;

export async function renderPastRecordsTab(container) {
  root = container;
  paint();
  await load(true);
}

function paint() {
  root.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1>Past Records</h1>
          <p>Old invoices, quotations, payments and purchases from Vyapar — to look up. They do not change any balance or stock.</p>
        </div>
      </div>
      <div class="at2-tabs">
        ${TABS.map(([key, label]) => `<button class="at2-tab${view.type === key ? ' on' : ''}" data-type="${key}">${label}</button>`).join('')}
      </div>
      <div class="at2-panel">
        <div class="at2-filters">
          <input type="search" id="pr-q" class="at2-search" placeholder="Number, customer, phone or reference" value="${esc(view.q)}">
          <label class="at2-dates">From <input type="date" id="pr-from" value="${esc(view.from)}"></label>
          <label class="at2-dates">To <input type="date" id="pr-to" value="${esc(view.to)}"></label>
          <span class="at2-scope" id="pr-scope"></span>
        </div>
        <div class="at2-body" id="pr-body"></div>
      </div>
    </div>`;
  root.querySelectorAll('[data-type]').forEach(b => { b.onclick = async () => { view.type = b.dataset.type; paint(); await load(true); }; });
  let timer;
  root.querySelector('#pr-q').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { view.q = e.target.value.trim(); load(true); }, 300); };
  root.querySelector('#pr-from').onchange = (e) => { view.from = e.target.value; load(true); };
  root.querySelector('#pr-to').onchange = (e) => { view.to = e.target.value; load(true); };
}

async function load(reset) {
  if (reset) rows = [];
  const body = root.querySelector('#pr-body');
  if (reset) body.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  const params = new URLSearchParams({ type: view.type, limit: PAGE, offset: rows.length });
  if (view.q) params.set('q', view.q);
  if (view.from) params.set('from', view.from);
  if (view.to) params.set('to', view.to);
  try {
    const out = await api(`/vyapar/history?${params}`);
    rows = reset ? out.rows : rows.concat(out.rows);
    total = out.total;
    sum = out.total_paise;
  } catch (err) {
    body.innerHTML = `<div class="at2-empty" style="color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paintRows();
}

function paintRows() {
  const body = root.querySelector('#pr-body');
  root.querySelector('#pr-scope').textContent = total ? `${total.toLocaleString('en-IN')} records · ${rupees(sum)} in all` : '';
  if (!rows.length) {
    body.innerHTML = '<div class="at2-empty">Nothing here. If you have not yet brought the Vyapar data in, do it under Accounts → Data Migration → From Vyapar.</div>';
    return;
  }
  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Date</th><th>Type</th><th>No.</th><th>Party</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(r => {
    const [tone, label] = STATE[r.payment_state] || [null, null];
    return `<tr data-open="${esc(r.id)}" style="cursor:pointer">
          <td style="white-space:nowrap">${esc(day(r.doc_date))}</td>
          <td>${esc(TYPE_LABEL[r.doc_type] || r.doc_type)}</td>
          <td><code style="font-size:0.72rem">${esc(r.doc_no || '—')}</code></td>
          <td>${esc(r.party_name || '—')}${r.party_phone ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(r.party_phone)}</div>` : ''}</td>
          <td style="text-align:right"><b>${rupees(r.total_paise)}</b></td>
          <td>${label ? `<span class="at2-chip ${tone}">${label}</span>` : ''}${r.payment_mode ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(r.payment_mode)}</div>` : ''}</td>
        </tr>`;
  }).join('')}
      </tbody>
    </table></div>
    ${rows.length < total ? `<div style="text-align:center;padding:14px"><button class="btn btn-secondary" id="pr-more">Show more (${(total - rows.length).toLocaleString('en-IN')} left)</button></div>` : ''}`;
  body.querySelectorAll('[data-open]').forEach(tr => { tr.onclick = () => openRecord(tr.dataset.open); });
  const more = body.querySelector('#pr-more');
  if (more) more.onclick = async () => { more.disabled = true; await load(false); };
}

/** One record in full — also used from a customer's page. */
export async function openRecord(id) {
  let out;
  try { out = await api(`/vyapar/history/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }
  const { document: d, lines, related } = out;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const money = d.doc_type === 'payment_in' || d.doc_type === 'payment_out';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:860px">
      <div class="modal-header">
        <span class="modal-title">${esc(TYPE_LABEL[d.doc_type] || d.doc_type)} ${esc(d.doc_no || '')}</span>
        <button class="modal-close" id="pr-close">✕</button>
      </div>
      <div class="modal-body">
        <p class="at2-note" style="margin:0 0 12px">A record from Vyapar, kept to look at. It does not change any balance or stock.</p>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px">
          <div><div class="at2-kpi-label">Date</div><b>${esc(day(d.doc_date))}</b></div>
          <div><div class="at2-kpi-label">Party</div><b>${esc(d.party_name || '—')}</b>${d.party_phone ? `<div style="font-size:0.78rem">${esc(d.party_phone)}</div>` : ''}</div>
          <div><div class="at2-kpi-label">Total</div><b style="font-size:1.1rem">${rupees(d.total_paise)}</b></div>
          ${!money && Number(d.paid_paise) ? `<div><div class="at2-kpi-label">Received when billed</div><b>${rupees(d.paid_paise)}</b></div>` : ''}
          ${d.payment_mode ? `<div><div class="at2-kpi-label">Paid by</div><b>${esc(d.payment_mode)}</b></div>` : ''}
          ${d.reference ? `<div><div class="at2-kpi-label">Reference</div><b>${esc(d.reference)}</b></div>` : ''}
        </div>
        ${lines.length ? `
        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>#</th><th>Item</th><th>HSN</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Disc.</th><th style="text-align:right">GST</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${lines.map(l => `
            <tr><td>${l.line_no}</td>
              <td><b>${esc(l.item_name)}</b>${l.serial_no ? `<div style="font-size:0.72rem;color:var(--text-dim)">Serial: ${esc(l.serial_no)}</div>` : ''}</td>
              <td>${esc(l.hsn_sac || '')}</td>
              <td style="text-align:right">${Number(l.quantity)} ${esc(l.unit || '')}</td>
              <td style="text-align:right">${rupees(l.rate_paise)}</td>
              <td style="text-align:right">${Number(l.discount_paise) ? rupees(l.discount_paise) : '—'}</td>
              <td style="text-align:right">${l.tax_rate_bps ? `${Number(l.tax_rate_bps) / 100}%` : '—'}</td>
              <td style="text-align:right"><b>${rupees(l.amount_paise)}</b></td></tr>`).join('')}
          </tbody></table></div>` : ''}
        ${(d.charges || []).length ? `<p class="at2-note">Extra charges: ${d.charges.map(c => `${esc(c.name)} ${rupees(c.amount_paise)}`).join(', ')}</p>` : ''}
        ${Number(d.discount_paise) ? `<p class="at2-note">Discount: ${rupees(d.discount_paise)}</p>` : ''}
        ${d.notes ? `<p class="at2-note" style="white-space:pre-wrap">${esc(d.notes)}</p>` : ''}
        ${related.length ? `
        <div class="card" style="margin-top:14px"><div class="card-header"><span class="card-title">Linked records</span></div>
          <div class="table-wrap"><table class="at2-tbl"><tbody>${related.map(r => `
            <tr${r.record ? ` data-rel="${esc(r.record.id)}" style="cursor:pointer"` : ''}>
              <td>${{ payment: 'Payment against it', converted_to: 'Became', converted_from: 'Came from' }[r.kind] || esc(r.kind)}</td>
              <td>${r.record ? `${esc(TYPE_LABEL[r.record.doc_type] || r.record.doc_type)} <code>${esc(r.record.doc_no || '')}</code> · ${esc(day(r.record.doc_date))}` : '—'}</td>
              <td style="text-align:right">${r.amount_paise !== null ? rupees(r.amount_paise) : ''}</td></tr>`).join('')}
          </tbody></table></div></div>` : ''}
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="pr-done">Close</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#pr-close').onclick = close;
  overlay.querySelector('#pr-done').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelectorAll('[data-rel]').forEach(tr => { tr.onclick = () => { close(); openRecord(tr.dataset.rel); }; });
}

/** The records of one party — the small table on a customer's page. */
export async function recordsOfParty(partyId, limit = 15) {
  return api(`/vyapar/history?party_id=${encodeURIComponent(partyId)}&limit=${limit}`);
}
