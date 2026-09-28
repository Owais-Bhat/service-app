// Purchases — what we ordered, what turned up, what we were billed for, and
// what we still owe.
//
// The four documents are separate on purpose, and the screen keeps them that
// way: ordering moves nothing, receiving puts goods on the shelf, the bill
// records what is owed and touches no stock, and a return sends goods back.
// Receiving against an order only ever offers what is still outstanding, so a
// partial delivery cannot be over-received.
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
    method, headers: authHeaders(!!body), body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const ymd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const TABS = [
  { key: 'purchase_order', label: 'Orders' },
  { key: 'goods_receipt', label: 'Receipts' },
  { key: 'supplier_bill', label: 'Bills' },
  { key: 'purchase_return', label: 'Returns' },
  { key: 'payables', label: 'Payables' },
];

const DOC_LABEL = {
  purchase_order: 'Purchase order', goods_receipt: 'Goods receipt',
  supplier_bill: 'Supplier bill', purchase_return: 'Purchase return',
};

const STATUS_CHIP = {
  draft: ['muted', 'Draft'],
  issued: ['ok', 'Issued'],
  partially_received: ['warn', 'Part received'],
  received: ['ok', 'Received'],
  cancelled: ['danger', 'Cancelled'],
  closed: ['muted', 'Closed'],
};

const fyStart = () => {
  const now = new Date();
  const year = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
};

const state = { tab: 'purchase_order', from: fyStart(), to: ymd(new Date()), q: '', status: 'all' };
let rows = [];
let payables = null;
let suppliers = [];
let items = [];
let locations = [];

export async function renderPurchasesTab(container) {
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    [suppliers, items, locations] = await Promise.all([
      api('GET', '/parties?kind=supplier&limit=1000'),
      api('GET', '/inventory/items?all=1').catch(() => []),
      api('GET', '/stock/locations').catch(() => []),
    ]);
    await loadTab();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

async function loadTab() {
  if (state.tab === 'payables') {
    payables = await api('GET', `/purchases/payables?as_on=${state.to}`);
  } else {
    rows = await api('GET', `/purchases/documents?doc_type=${state.tab}&status=${state.status}&from=${state.from}&to=${state.to}&q=${encodeURIComponent(state.q)}`);
  }
}

function paint(container) {
  const isDocTab = state.tab !== 'payables';

  container.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1>Purchases</h1>
          <p>Orders, deliveries, supplier bills and what is still to pay</p>
        </div>
        <div class="at2-headbtns">
          <button class="btn btn-secondary" id="pu-export">${ICONS.download}<span>Export</span></button>
          <button class="btn btn-secondary" id="pu-pay">${ICONS.wallet || ICONS.receipt}<span>Pay Supplier</span></button>
          <button class="btn btn-primary" id="pu-new">${ICONS.plus}<span>New ${esc(DOC_LABEL[state.tab] || 'Order')}</span></button>
        </div>
      </div>

      ${kpiRow()}

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="at2-panel">
        <div class="at2-filters">
          <label class="at2-dates">From <input type="date" id="pu-from" value="${state.from}"></label>
          <label class="at2-dates">To <input type="date" id="pu-to" value="${state.to}"></label>
          ${isDocTab ? `<input type="search" id="pu-q" class="at2-search" placeholder="Number, supplier or their invoice no" value="${esc(state.q)}">` : ''}
          <span class="at2-scope">${esc(state.tab === 'payables'
      ? `Unpaid supplier bills as on ${day(state.to)}`
      : `${day(state.from)} — ${day(state.to)}`)}</span>
        </div>
        <div class="at2-body" id="pu-body"></div>
      </div>
    </div>`;

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = async () => { state.tab = btn.dataset.tab; await loadTab(); paint(container); };
  });
  const reload = async () => {
    state.from = container.querySelector('#pu-from').value || state.from;
    state.to = container.querySelector('#pu-to').value || state.to;
    await loadTab();
    paint(container);
  };
  container.querySelector('#pu-from').onchange = reload;
  container.querySelector('#pu-to').onchange = reload;

  const search = container.querySelector('#pu-q');
  if (search) {
    let timer;
    search.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { state.q = search.value.trim(); await loadTab(); paintBody(container); }, 250);
    };
  }

  container.querySelector('#pu-new').onclick = () => openEditor(container, {
    docType: state.tab === 'payables' ? 'purchase_order' : state.tab,
  });
  container.querySelector('#pu-pay').onclick = () => openPaymentModal(container);
  container.querySelector('#pu-export').onclick = () => exportCurrent();

  paintBody(container);
}

function kpiRow() {
  const kpi = (icon, label, value, tone) => `
    <div class="at2-kpi">
      <span class="at2-kpi-ico tone-${tone}">${icon || ''}</span>
      <div><div class="at2-kpi-label">${esc(label)}</div><div class="at2-kpi-value tone-${tone}">${value}</div></div>
    </div>`;

  if (state.tab === 'payables' && payables) {
    const b = payables.buckets;
    return `<div class="at2-kpis">
      ${kpi(ICONS.receipt, 'We owe', rupees(payables.total_paise), 'amber')}
      ${kpi(ICONS.clock, 'Not yet due', rupees(b.current), 'green')}
      ${kpi(ICONS.alert, '1–30 days', rupees(b.d1_30), 'amber')}
      ${kpi(ICONS.alert, 'Over 30 days', rupees(b.d31_60 + b.d61_90 + b.d90_plus), 'red')}
    </div>`;
  }

  const issued = rows.filter(r => r.status !== 'draft' && r.status !== 'cancelled');
  const value = issued.reduce((s, r) => s + Number(r.total_paise), 0);
  const awaiting = rows.filter(r => ['issued', 'partially_received'].includes(r.status)).length;
  return `<div class="at2-kpis">
    ${kpi(ICONS.box, 'Documents', String(rows.length), 'muted')}
    ${kpi(ICONS.receipt, 'Value', rupees(value), 'green')}
    ${kpi(ICONS.clock, state.tab === 'purchase_order' ? 'Still to arrive' : 'Open', String(awaiting), awaiting ? 'amber' : 'green')}
    ${kpi(ICONS.edit, 'Drafts', String(rows.filter(r => r.status === 'draft').length), 'muted')}
  </div>`;
}

function paintBody(container) {
  const body = container.querySelector('#pu-body');
  if (!body) return;

  if (state.tab === 'payables') {
    if (!payables?.bills.length) {
      body.innerHTML = '<div class="at2-empty">Nothing outstanding — every supplier bill is settled.</div>';
      return;
    }
    body.innerHTML = `
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Bill</th><th>Supplier</th><th>Their ref</th><th>Date</th><th>Age</th>
          <th style="text-align:right">Billed</th><th style="text-align:right">Outstanding</th></tr></thead>
        <tbody>
          ${payables.bills.map(b => {
      const tone = b.bucket === 'current' ? 'ok' : b.bucket === 'd1_30' ? 'warn' : 'danger';
      return `
            <tr data-open="${esc(b.id)}" style="cursor:pointer">
              <td><code style="font-size:0.72rem">${esc(b.doc_no)}</code></td>
              <td><b>${esc(b.party_name || '—')}</b></td>
              <td>${esc(b.supplier_ref || '—')}</td>
              <td style="white-space:nowrap">${esc(day(b.doc_date))}</td>
              <td><span class="at2-chip ${tone}">${b.days_overdue > 0 ? `${b.days_overdue} days` : 'not due'}</span></td>
              <td style="text-align:right">${rupees(b.total_paise)}</td>
              <td style="text-align:right"><b style="color:var(--warning)">${rupees(b.outstanding_paise)}</b></td>
            </tr>`;
    }).join('')}
        </tbody>
      </table></div>
      <p class="at2-note">Scope: ${esc(payables.scope.basis)}, as on ${esc(payables.scope.as_on)}.</p>`;

    body.querySelectorAll('[data-open]').forEach(tr => { tr.onclick = () => openDetail(container, tr.dataset.open); });
    return;
  }

  if (!rows.length) {
    body.innerHTML = '<div class="at2-empty">Nothing here for this range.</div>';
    return;
  }

  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>No.</th><th>Date</th><th>Supplier</th><th>Status</th>
        ${state.tab === 'goods_receipt' ? '<th>Into</th>' : ''}
        <th style="text-align:right">Total</th>${state.tab === 'supplier_bill' ? '<th style="text-align:right">Due</th>' : ''}<th></th></tr></thead>
      <tbody>
        ${rows.map(r => {
    const [tone, label] = STATUS_CHIP[r.status] || ['muted', r.status];
    return `
          <tr data-open="${esc(r.id)}" style="cursor:pointer">
            <td><code style="font-size:0.72rem">${esc(r.doc_no || 'draft')}</code></td>
            <td style="white-space:nowrap">${esc(day(r.doc_date))}</td>
            <td><b>${esc(r.party_name || '—')}</b>${r.supplier_ref ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(r.supplier_ref)}</div>` : ''}</td>
            <td><span class="at2-chip ${tone}">${esc(label)}</span></td>
            ${state.tab === 'goods_receipt' ? `<td>${esc(r.location_name || '—')}</td>` : ''}
            <td style="text-align:right;white-space:nowrap"><b>${rupees(r.total_paise)}</b></td>
            ${state.tab === 'supplier_bill' ? `<td style="text-align:right">${Number(r.balance_paise) > 0 ? rupees(r.balance_paise) : '—'}</td>` : ''}
            <td>${ICONS['chevron-right'] || ''}</td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>`;

  body.querySelectorAll('[data-open]').forEach(tr => { tr.onclick = () => openDetail(container, tr.dataset.open); });
}

// ── editor ──────────────────────────────────────────────────────────────
function openEditor(container, { docType = 'purchase_order', existing = null, grnId = null, poId = null }) {
  const doc = existing?.document || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const lineRow = (line = {}) => `
    <tr class="pu-line">
      <td>
        <input type="text" class="pu-desc" list="pu-items" value="${esc(line.description || '')}" placeholder="What is being bought" style="min-width:150px">
        <input type="hidden" class="pu-item-id" value="${esc(line.item_id || '')}">
      </td>
      <td><input type="number" class="pu-qty" step="0.001" min="0" value="${line.quantity ?? 1}" style="width:70px"></td>
      <td><input type="text" class="pu-unit" value="${esc(line.unit || '')}" placeholder="unit" style="width:64px"></td>
      <td><input type="number" class="pu-rate" step="0.01" min="0" value="${line.rate_paise !== undefined ? Number(line.rate_paise) / 100 : ''}" style="width:90px"></td>
      <td>
        <select class="pu-tax" style="width:84px">
          ${[0, 500, 1200, 1800, 2800].map(b => `<option value="${b}"${Number(line.tax_rate_bps) === b ? ' selected' : ''}>${b / 100}%</option>`).join('')}
          <option value="exempt"${line.tax_treatment === 'exempt' ? ' selected' : ''}>Exempt</option>
        </select>
      </td>
      <td><input type="text" class="pu-serials" value="${esc((line.serial_numbers || []).join(', '))}" placeholder="serial nos" style="min-width:120px"></td>
      <td><button class="at2-photo pu-del" title="Remove">${ICONS.close}</button></td>
    </tr>`;

  overlay.innerHTML = `
    <div class="modal" style="max-width:900px">
      <div class="modal-header">
        <span class="modal-title">${doc && doc.id ? 'Edit' : 'New'} ${esc(DOC_LABEL[docType] || 'document').toLowerCase()}${grnId ? ' — against a goods receipt' : ''}</span>
        <button class="modal-close" id="pu-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <datalist id="pu-items">${items.map(i => `<option value="${esc(i.name)}">`).join('')}</datalist>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
          <div class="form-group"><label>Supplier *</label>
            <select id="pu-party">
              <option value="">— Choose —</option>
              ${suppliers.map(p => `<option value="${esc(p.id)}"${doc?.party_id === p.id ? ' selected' : ''}>${esc(p.display_name)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Date</label>
            <input type="date" id="pu-date" value="${doc ? ymd(doc.doc_date) : ymd(new Date())}"></div>
          ${['goods_receipt', 'purchase_return'].includes(docType) ? `
          <div class="form-group"><label>Into / from</label>
            <select id="pu-location">
              ${locations.filter(l => l.owned).map(l => `<option value="${esc(l.id)}"${doc?.location_id === l.id || (!doc && l.is_default) ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}
            </select></div>` : ''}
          ${docType === 'supplier_bill' ? `
          <div class="form-group"><label>Their invoice no</label>
            <input type="text" id="pu-ref" value="${esc(doc?.supplier_ref || '')}"></div>
          <div class="form-group"><label>Due date</label>
            <input type="date" id="pu-due" value="${doc?.due_date ? ymd(doc.due_date) : ''}"></div>` : ''}
        </div>

        ${docType === 'supplier_bill' ? `
        <label class="at2-check" style="margin-bottom:10px">
          <input type="checkbox" id="pu-credit" ${doc ? (doc.input_credit_eligible ? 'checked' : '') : 'checked'}>
          The tax on this bill can be claimed as input credit
        </label>` : ''}

        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Tax</th><th>Serial numbers</th><th></th></tr></thead>
          <tbody id="pu-lines">
            ${(existing?.lines?.filter(l => l.kind === 'item') || [{}]).map(lineRow).join('')}
          </tbody>
        </table></div>

        <div style="display:flex;gap:10px;align-items:flex-end;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-secondary" id="pu-add">${ICONS.plus}<span>Add line</span></button>
          <div class="form-group" style="margin:0"><label style="font-size:0.75rem">Freight / other charges ₹</label>
            <input type="number" id="pu-freight" step="0.01" min="0" style="width:130px" placeholder="0">
            <small style="color:var(--text-dim);font-size:0.72rem">Added to the cost of the goods</small></div>
          <div style="flex:1"></div>
          <div id="pu-totals" style="min-width:240px"></div>
        </div>

        <div class="form-group" style="margin-top:12px"><label>Notes</label>
          <textarea id="pu-notes" rows="2">${esc(doc?.notes || '')}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="pu-cancel">Cancel</button>
        <button class="btn btn-secondary" id="pu-save">Save draft</button>
        <button class="btn btn-primary" id="pu-issue">Save &amp; issue</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#pu-close').onclick = close;
  $('#pu-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const collect = () => {
    const lines = [...overlay.querySelectorAll('.pu-line')].map(tr => {
      const taxValue = tr.querySelector('.pu-tax').value;
      const isTreatment = Number.isNaN(Number(taxValue));
      const serials = tr.querySelector('.pu-serials').value.split(',').map(s => s.trim()).filter(Boolean);
      return {
        item_id: tr.querySelector('.pu-item-id').value || null,
        description: tr.querySelector('.pu-desc').value.trim(),
        quantity: Number(tr.querySelector('.pu-qty').value) || 0,
        unit: tr.querySelector('.pu-unit').value.trim() || null,
        rate: tr.querySelector('.pu-rate').value || 0,
        tax_rate_bps: isTreatment ? 0 : Number(taxValue),
        tax_treatment: isTreatment ? taxValue : 'gst',
        serial_numbers: serials.length ? serials : null,
      };
    }).filter(l => l.description && l.quantity > 0);

    const freight = Number($('#pu-freight').value) || 0;
    return {
      doc_type: doc?.doc_type || docType,
      party_id: $('#pu-party').value || null,
      doc_date: $('#pu-date').value,
      due_date: $('#pu-due')?.value || null,
      location_id: $('#pu-location')?.value || null,
      supplier_ref: $('#pu-ref')?.value.trim() || null,
      // Set when this bill answers a goods receipt: the stock came in there,
      // so the bill only clears what that receipt parked.
      grn_id: grnId || doc?.grn_id || null,
      po_id: poId || doc?.po_id || null,
      input_credit_eligible: $('#pu-credit') ? $('#pu-credit').checked : true,
      notes: $('#pu-notes').value.trim(),
      lines,
      charges: freight ? [{ label: 'Freight', amount: String(freight), tax_rate_bps: 0, tax_treatment: 'exempt' }] : [],
    };
  };

  const wireLines = () => {
    overlay.querySelectorAll('.pu-line').forEach(tr => {
      tr.querySelector('.pu-desc').onchange = (e) => {
        const match = items.find(i => i.name === e.target.value);
        tr.querySelector('.pu-item-id').value = match ? match.id : '';
        if (match && !tr.querySelector('.pu-unit').value) tr.querySelector('.pu-unit').value = match.base_unit || match.unit || '';
        if (match && !tr.querySelector('.pu-rate').value && match.purchase_rate) tr.querySelector('.pu-rate').value = Number(match.purchase_rate);
        if (match) {
          const rate = Math.round(Number(match.gst_rate || 18) * 100);
          const opt = [...tr.querySelector('.pu-tax').options].find(o => Number(o.value) === rate);
          if (opt) tr.querySelector('.pu-tax').value = opt.value;
        }
        updateTotals();
      };
      tr.querySelectorAll('input, select').forEach(el => { el.oninput = updateTotals; el.onchange = el.onchange || updateTotals; });
      tr.querySelector('.pu-del').onclick = () => {
        if (overlay.querySelectorAll('.pu-line').length <= 1) return toast('A document needs at least one line', 'warning');
        tr.remove();
        updateTotals();
      };
    });
  };

  // A rough total while typing; the server has the last word when it saves.
  function updateTotals() {
    const payload = collect();
    const taxable = payload.lines.reduce((s, l) => s + (Number(l.rate) * l.quantity), 0);
    const tax = payload.lines.reduce((s, l) => s + (Number(l.rate) * l.quantity * (l.tax_rate_bps / 10000)), 0);
    const freight = payload.charges.reduce((s, c) => s + Number(c.amount), 0);
    $('#pu-totals').innerHTML = `
      <div style="font-size:0.84rem;color:var(--text-soft);line-height:1.7">
        <div style="display:flex;justify-content:space-between"><span>Goods</span><b>${rupees(Math.round(taxable * 100))}</b></div>
        ${freight ? `<div style="display:flex;justify-content:space-between"><span>Freight</span><b>${rupees(Math.round(freight * 100))}</b></div>` : ''}
        <div style="display:flex;justify-content:space-between"><span>Tax</span><b>${rupees(Math.round(tax * 100))}</b></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:4px;padding-top:4px">
          <b>Approx total</b><b style="color:var(--primary)">${rupees(Math.round((taxable + tax + freight) * 100))}</b></div>
      </div>`;
  }

  wireLines();
  updateTotals();
  $('#pu-add').onclick = () => { $('#pu-lines').insertAdjacentHTML('beforeend', lineRow()); wireLines(); };
  $('#pu-freight').oninput = updateTotals;

  const save = async (thenIssue) => {
    const payload = collect();
    if (!payload.party_id) return toast('Choose the supplier', 'warning');
    if (!payload.lines.length) return toast('Add at least one line', 'warning');

    const btn = thenIssue ? $('#pu-issue') : $('#pu-save');
    btn.disabled = true;
    try {
      const saved = doc?.id
        ? await api('PATCH', `/purchases/documents/${doc.id}`, payload)
        : await api('POST', '/purchases/documents', payload);
      const id = saved.document.id;
      if (thenIssue) {
        await api('POST', `/purchases/documents/${id}/issue`);
        toast(payload.doc_type === 'goods_receipt' ? 'Received into stock' : 'Issued', 'success');
      } else {
        toast('Draft saved', 'success');
      }
      close();
      await loadTab();
      paint(container);
      if (thenIssue) openDetail(container, id);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
  $('#pu-save').onclick = () => save(false);
  $('#pu-issue').onclick = () => save(true);
}

// ── detail ──────────────────────────────────────────────────────────────
async function openDetail(container, id) {
  let loaded;
  try { loaded = await api('GET', `/purchases/documents/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }

  const { document: doc, lines, allocations, paid_paise: paid, balance_paise: balance } = loaded;
  const [tone, label] = STATUS_CHIP[doc.status] || ['muted', doc.status];
  const isDraft = doc.status === 'draft';
  const isOrder = doc.doc_type === 'purchase_order';
  const canReceive = isOrder && ['issued', 'partially_received'].includes(doc.status);
  const canBill = doc.doc_type === 'goods_receipt' && doc.status === 'issued';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:720px">
      <div class="modal-header">
        <span class="modal-title">${esc(doc.doc_no || 'Draft')} <span class="at2-chip ${tone}">${esc(label)}</span></span>
        <button class="modal-close" id="pd-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <div style="font-weight:800;font-size:1rem">${esc(doc.party_name || '—')}</div>
            <div style="font-size:0.82rem;color:var(--text-dim)">
              ${esc(DOC_LABEL[doc.doc_type])} · ${esc(day(doc.doc_date))}
              ${doc.supplier_ref ? ` · their ref ${esc(doc.supplier_ref)}` : ''}
              ${doc.location_name ? ` · ${esc(doc.location_name)}` : ''}
            </div>
            ${doc.grn_id ? '<div style="font-size:0.78rem;color:var(--text-dim);margin-top:4px">Billed against a goods receipt — the stock came in there, not here.</div>' : ''}
          </div>
          <div style="text-align:right">
            <div style="font-size:1.3rem;font-weight:800;color:var(--primary)">${rupees(doc.total_paise)}</div>
            ${doc.doc_type === 'supplier_bill' && !isDraft ? `
              <div style="font-size:0.82rem;color:${balance > 0 ? 'var(--warning)' : 'var(--primary)'}">
                ${balance > 0 ? `${rupees(paid)} paid · ${rupees(balance)} due` : 'Paid in full'}</div>` : ''}
          </div>
        </div>

        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Item</th><th style="text-align:right">Qty</th>
            ${isOrder ? '<th style="text-align:right">Received</th>' : ''}
            <th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${lines.map(l => `
              <tr>
                <td>${esc(l.description)}
                  ${Number(l.landed_cost_paise) ? `<div style="font-size:0.7rem;color:var(--text-dim)">incl. ${rupees(l.landed_cost_paise)} freight</div>` : ''}
                  ${l.serial_numbers?.length ? `<div style="font-size:0.7rem;color:var(--text-dim)">${esc(l.serial_numbers.join(', '))}</div>` : ''}</td>
                <td style="text-align:right">${Number(l.quantity)}${l.unit ? ` ${esc(l.unit)}` : ''}
                  ${Number(l.base_quantity) !== Number(l.quantity) ? `<div style="font-size:0.7rem;color:var(--text-dim)">= ${Number(l.base_quantity)} in stock</div>` : ''}</td>
                ${isOrder ? `<td style="text-align:right">${Number(l.received_qty)}</td>` : ''}
                <td style="text-align:right">${rupees(l.rate_paise)}</td>
                <td style="text-align:right"><b>${rupees(l.amount_paise)}</b></td>
              </tr>`).join('')}
            <tr><td colspan="${isOrder ? 4 : 3}" style="text-align:right">Taxable</td><td style="text-align:right">${rupees(doc.taxable_paise)}</td></tr>
            ${Number(doc.cgst_paise) ? `<tr><td colspan="${isOrder ? 4 : 3}" style="text-align:right">CGST + SGST</td><td style="text-align:right">${rupees(Number(doc.cgst_paise) + Number(doc.sgst_paise) + Number(doc.utgst_paise))}</td></tr>` : ''}
            ${Number(doc.igst_paise) ? `<tr><td colspan="${isOrder ? 4 : 3}" style="text-align:right">IGST</td><td style="text-align:right">${rupees(doc.igst_paise)}</td></tr>` : ''}
            <tr><td colspan="${isOrder ? 4 : 3}" style="text-align:right"><b>Total</b></td><td style="text-align:right"><b style="color:var(--primary)">${rupees(doc.total_paise)}</b></td></tr>
          </tbody>
        </table></div>

        ${allocations.length ? `
        <div class="card" style="margin-top:14px">
          <div class="card-header"><span class="card-title">Payments made</span></div>
          <div class="table-wrap"><table class="at2-tbl"><tbody>
            ${allocations.map(a => `
              <tr><td><code style="font-size:0.72rem">${esc(a.payment_no || '')}</code> ${esc(day(a.payment_date))}</td>
                <td>${esc(a.method || '')}${a.reference ? ` · ${esc(a.reference)}` : ''}</td>
                <td style="text-align:right"><b>${rupees(a.amount_paise)}</b></td></tr>`).join('')}
          </tbody></table></div>
        </div>` : ''}

        ${doc.status === 'cancelled' ? `<p class="at2-note" style="color:var(--danger)">Cancelled — ${esc(doc.cancel_reason || '')}</p>` : ''}
        ${doc.input_credit_eligible === 0 ? '<p class="at2-note">Input credit not claimed on this bill — the tax stays in the cost.</p>' : ''}
      </div>
      <div class="modal-footer" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="pd-cancel">Close</button>
        ${isDraft ? '<button class="btn btn-secondary" id="pd-edit">Edit</button><button class="btn btn-primary" id="pd-issue">Issue</button>' : ''}
        ${canReceive ? '<button class="btn btn-primary" id="pd-receive">Receive goods</button>' : ''}
        ${canBill ? '<button class="btn btn-primary" id="pd-bill">Enter supplier bill</button>' : ''}
        ${doc.doc_type === 'supplier_bill' && doc.status === 'issued' && balance > 0 ? '<button class="btn btn-primary" id="pd-pay">Pay</button>' : ''}
        ${!isDraft && doc.status !== 'cancelled' ? '<button class="btn btn-secondary" id="pd-void">Cancel document</button>' : ''}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#pd-close').onclick = close;
  $('#pd-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const refresh = async () => { close(); await loadTab(); paint(container); };

  if ($('#pd-edit')) $('#pd-edit').onclick = () => { close(); openEditor(container, { docType: doc.doc_type, existing: loaded }); };

  if ($('#pd-issue')) {
    $('#pd-issue').onclick = async () => {
      try {
        await api('POST', `/purchases/documents/${doc.id}/issue`);
        toast('Issued', 'success');
        await refresh();
        openDetail(container, doc.id);
      } catch (err) { toast(err.message, 'error'); }
    };
  }

  if ($('#pd-receive')) $('#pd-receive').onclick = () => { close(); openReceiveModal(container, loaded); };

  if ($('#pd-bill')) {
    // The bill repeats the receipt's lines and points back at it, so the goods
    // are not received a second time.
    $('#pd-bill').onclick = () => {
      close();
      openEditor(container, {
        docType: 'supplier_bill',
        grnId: doc.id,
        poId: doc.po_id,
        existing: {
          document: {
            doc_type: 'supplier_bill', party_id: doc.party_id, doc_date: ymd(new Date()),
            grn_id: doc.id, input_credit_eligible: 1,
          },
          lines: lines.filter(l => l.kind === 'item'),
        },
      });
    };
  }

  if ($('#pd-pay')) $('#pd-pay').onclick = () => { close(); openPaymentModal(container, { document: doc, balance }); };

  if ($('#pd-void')) {
    $('#pd-void').onclick = async () => {
      const reason = prompt('A posted document is cancelled, not deleted — its ledger entry is reversed and stock comes back off. Why?');
      if (!reason) return;
      try {
        await api('POST', `/purchases/documents/${doc.id}/cancel`, { reason });
        toast('Cancelled', 'success');
        await refresh();
      } catch (err) { toast(err.message, 'error'); }
    };
  }
}

// Receiving against an order offers exactly what is still outstanding.
function openReceiveModal(container, order) {
  const outstanding = order.lines
    .filter(l => l.kind === 'item')
    .map(l => ({ ...l, left: Number(l.base_quantity) - Number(l.received_qty) }))
    .filter(l => l.left > 0);

  if (!outstanding.length) return toast('Everything on this order has arrived', 'info');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:680px">
      <div class="modal-header">
        <span class="modal-title">Receive against ${esc(order.document.doc_no)}</span>
        <button class="modal-close" id="rv-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
          <div class="form-group"><label>Date</label><input type="date" id="rv-date" value="${ymd(new Date())}"></div>
          <div class="form-group"><label>Into</label>
            <select id="rv-location">
              ${locations.filter(l => l.owned).map(l => `<option value="${esc(l.id)}"${l.is_default ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Their delivery note</label><input type="text" id="rv-ref"></div>
        </div>

        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Item</th><th style="text-align:right">Still to come</th><th>Receiving now</th><th>Serial numbers</th></tr></thead>
          <tbody>
            ${outstanding.map(l => `
              <tr data-line="${esc(l.id)}">
                <td>${esc(l.description)}</td>
                <td style="text-align:right">${l.left}</td>
                <td><input type="number" class="rv-qty" step="0.001" min="0" max="${l.left}" value="${l.left}" style="width:90px"></td>
                <td><input type="text" class="rv-serials" placeholder="comma separated" style="min-width:140px"></td>
              </tr>`).join('')}
          </tbody>
        </table></div>
        <p class="at2-note">Only what has actually arrived. The order stays open for the rest.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="rv-cancel">Cancel</button>
        <button class="btn btn-primary" id="rv-save">Receive into stock</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#rv-close').onclick = close;
  overlay.querySelector('#rv-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  overlay.querySelector('#rv-save').onclick = async (e) => {
    const lines = [...overlay.querySelectorAll('[data-line]')].map(tr => {
      const serials = tr.querySelector('.rv-serials').value.split(',').map(s => s.trim()).filter(Boolean);
      return {
        po_line_id: tr.dataset.line,
        quantity: Number(tr.querySelector('.rv-qty').value) || 0,
        serial_numbers: serials.length ? serials : null,
      };
    }).filter(l => l.quantity > 0);

    if (!lines.length) return toast('Nothing to receive', 'warning');

    e.target.disabled = true;
    try {
      const receipt = await api('POST', `/purchases/orders/${order.document.id}/receive`, {
        doc_date: overlay.querySelector('#rv-date').value,
        location_id: overlay.querySelector('#rv-location').value,
        supplier_ref: overlay.querySelector('#rv-ref').value.trim() || null,
        lines,
      });
      toast('Received into stock', 'success');
      close();
      state.tab = 'goods_receipt';
      await loadTab();
      paint(container);
      openDetail(container, receipt.document.id);
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  };
}

function openPaymentModal(container, { document: doc = null, balance = 0 } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <span class="modal-title">Pay a supplier</span>
        <button class="modal-close" id="sp-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
          <div class="form-group"><label>Supplier *</label>
            <select id="sp-party" ${doc ? 'disabled' : ''}>
              <option value="">— Choose —</option>
              ${suppliers.map(p => `<option value="${esc(p.id)}"${doc?.party_id === p.id ? ' selected' : ''}>${esc(p.display_name)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Date</label><input type="date" id="sp-date" value="${ymd(new Date())}"></div>
          <div class="form-group"><label>Amount ₹ *</label>
            <input type="number" id="sp-amount" step="0.01" min="0" value="${balance ? (balance / 100).toFixed(2) : ''}"></div>
          <div class="form-group"><label>Method</label>
            <select id="sp-method">
              ${[['bank', 'Bank transfer'], ['cash', 'Cash'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['card', 'Card']]
      .map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Reference</label><input type="text" id="sp-ref"></div>
        </div>
        ${doc ? `<p class="at2-note">Against ${esc(doc.doc_no)} — ${rupees(balance)} outstanding.</p>`
      : '<p class="at2-note">Money not put against a bill stays as an advance to the supplier.</p>'}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="sp-cancel">Cancel</button>
        <button class="btn btn-primary" id="sp-save">Record payment</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#sp-close').onclick = close;
  $('#sp-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('#sp-save').onclick = async () => {
    const partyId = doc ? doc.party_id : $('#sp-party').value;
    const amount = Number($('#sp-amount').value);
    if (!partyId) return toast('Which supplier?', 'warning');
    if (!(amount > 0)) return toast('Enter the amount', 'warning');

    const btn = $('#sp-save');
    btn.disabled = true;
    try {
      await api('POST', '/purchases/payments', {
        party_id: partyId,
        payment_date: $('#sp-date').value,
        method: $('#sp-method').value,
        amount: String(amount),
        reference: $('#sp-ref').value.trim(),
        idempotency_key: `supplier:${partyId}:${$('#sp-date').value}:${amount}:${Date.now()}`,
        allocations: doc ? [{ document_id: doc.id, amount: String(amount) }] : [],
      });
      toast('Payment recorded', 'success');
      close();
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

function exportCurrent() {
  if (state.tab === 'payables') {
    if (!payables?.bills.length) return toast('Nothing to export', 'info');
    return exportToCSV(`payables-as-on-${payables.as_on}.csv`, payables.bills.map(b => ({
      Bill: b.doc_no, Supplier: b.party_name || '', 'Their ref': b.supplier_ref || '',
      Date: ymd(b.doc_date), Due: b.due_date ? ymd(b.due_date) : '',
      'Days late': b.days_overdue > 0 ? b.days_overdue : 0,
      'Billed (₹)': (Number(b.total_paise) / 100).toFixed(2),
      'Outstanding (₹)': (b.outstanding_paise / 100).toFixed(2),
    })));
  }
  if (!rows.length) return toast('Nothing to export', 'info');
  exportToCSV(`${state.tab}-${state.from}-to-${state.to}.csv`, rows.map(r => ({
    No: r.doc_no || 'draft', Date: ymd(r.doc_date), Supplier: r.party_name || '',
    'Their ref': r.supplier_ref || '', Status: r.status, Location: r.location_name || '',
    Taxable: (Number(r.taxable_paise) / 100).toFixed(2),
    'Total (₹)': (Number(r.total_paise) / 100).toFixed(2),
    'Due (₹)': (Number(r.balance_paise || 0) / 100).toFixed(2),
  })));
}
