// Sales — quotations, invoices, credit notes, receipts and what is still owed.
//
// One screen for the whole selling side. The arithmetic is never done here: the
// editor asks the server to price the document as it is typed, so what the
// customer is quoted and what the invoice carries are the same numbers from the
// same engine.
//
// What the screen refuses to let you do is deliberate — an issued document has
// no edit button, only cancel; a paid one has neither. That is not the UI being
// awkward, it is what keeps the books worth reading.
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
  { key: 'invoice', label: 'Invoices' },
  { key: 'estimate', label: 'Quotations' },
  { key: 'credit_note', label: 'Credit Notes' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'receivables', label: 'Outstanding' },
];

const STATUS_CHIP = {
  draft: ['muted', 'Draft'],
  issued: ['ok', 'Issued'],
  accepted: ['ok', 'Accepted'],
  rejected: ['danger', 'Rejected'],
  expired: ['muted', 'Expired'],
  converted: ['ok', 'Converted'],
  cancelled: ['danger', 'Cancelled'],
};

const PAYMENT_CHIP = {
  unpaid: ['warn', 'Unpaid'],
  part_paid: ['warn', 'Part paid'],
  paid: ['ok', 'Paid'],
  overdue: ['danger', 'Overdue'],
  draft: ['muted', 'Draft'],
  cancelled: ['danger', 'Cancelled'],
  'n/a': ['muted', '—'],
};

const fyStart = () => {
  const now = new Date();
  const year = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
};

const state = { tab: 'invoice', from: fyStart(), to: ymd(new Date()), q: '', status: 'all' };
let rows = [];
let receipts = [];
let receivables = null;
let parties = [];
let items = [];
let taxRates = [];

export async function renderSalesTab(container) {
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    [parties, items, taxRates] = await Promise.all([
      api('GET', '/parties?kind=all&limit=1000'),
      api('GET', '/inventory/items?all=1').catch(() => []),
      api('GET', '/accounting/tax-rates').catch(() => []),
    ]);
    await loadTab();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

async function loadTab() {
  const range = `from=${state.from}&to=${state.to}`;
  if (state.tab === 'receipts') {
    receipts = await api('GET', `/payments?${range}&direction=in`);
  } else if (state.tab === 'receivables') {
    receivables = await api('GET', `/sales/receivables?as_on=${state.to}`);
  } else {
    rows = await api('GET', `/sales/documents?doc_type=${state.tab}&status=${state.status}&${range}&q=${encodeURIComponent(state.q)}`);
  }
}

function paint(container) {
  const isDocTab = !['receipts', 'receivables'].includes(state.tab);

  container.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1>Sales</h1>
          <p>Quotations, invoices, credit notes and the money against them</p>
        </div>
        <div class="at2-headbtns">
          <button class="btn btn-secondary" id="sl-export">${ICONS.download}<span>Export</span></button>
          <button class="btn btn-secondary" id="sl-receipt">${ICONS.wallet || ICONS.receipt}<span>Record Receipt</span></button>
          <button class="btn btn-primary" id="sl-new">${ICONS.plus}<span>New ${state.tab === 'estimate' ? 'Quotation' : state.tab === 'credit_note' ? 'Credit Note' : 'Invoice'}</span></button>
        </div>
      </div>

      ${kpiRow()}

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="at2-panel">
        <div class="at2-filters">
          <label class="at2-dates">From <input type="date" id="sl-from" value="${state.from}"></label>
          <label class="at2-dates">To <input type="date" id="sl-to" value="${state.to}"></label>
          ${isDocTab ? `
            <input type="search" id="sl-q" class="at2-search" placeholder="Number, customer or reference" value="${esc(state.q)}">
            <select id="sl-status" style="padding:8px 10px;border-radius:9px">
              ${[['all', 'All states'], ['draft', 'Drafts'], ['issued', 'Issued'], ['accepted', 'Accepted'], ['converted', 'Converted'], ['cancelled', 'Cancelled']]
      .map(([v, l]) => `<option value="${v}"${state.status === v ? ' selected' : ''}>${l}</option>`).join('')}
            </select>` : ''}
          <span class="at2-scope">${esc(scopeLine())}</span>
        </div>
        <div class="at2-body" id="sl-body"></div>
      </div>
    </div>`;

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = async () => {
      state.tab = btn.dataset.tab;
      await loadTab();
      paint(container);
    };
  });

  const reload = async () => {
    state.from = container.querySelector('#sl-from').value || state.from;
    state.to = container.querySelector('#sl-to').value || state.to;
    await loadTab();
    paint(container);
  };
  container.querySelector('#sl-from').onchange = reload;
  container.querySelector('#sl-to').onchange = reload;

  const search = container.querySelector('#sl-q');
  if (search) {
    let timer;
    search.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { state.q = search.value.trim(); await loadTab(); paintBody(container); }, 250);
    };
  }
  const status = container.querySelector('#sl-status');
  if (status) status.onchange = async () => { state.status = status.value; await loadTab(); paintBody(container); };

  container.querySelector('#sl-new').onclick = () => openEditor(container, {
    doc_type: ['estimate', 'credit_note'].includes(state.tab) ? state.tab : 'invoice',
  });
  container.querySelector('#sl-receipt').onclick = () => openReceiptModal(container);
  container.querySelector('#sl-export').onclick = () => exportCurrent();

  paintBody(container);
}

function scopeLine() {
  if (state.tab === 'receivables') return `Outstanding as on ${day(state.to)} — issued invoices less posted receipts`;
  if (state.tab === 'receipts') return `Receipts dated ${day(state.from)} — ${day(state.to)}`;
  return `${day(state.from)} — ${day(state.to)}`;
}

function kpiRow() {
  const kpi = (icon, label, value, tone) => `
    <div class="at2-kpi">
      <span class="at2-kpi-ico tone-${tone}">${icon || ''}</span>
      <div><div class="at2-kpi-label">${esc(label)}</div><div class="at2-kpi-value tone-${tone}">${value}</div></div>
    </div>`;

  if (state.tab === 'receivables' && receivables) {
    const b = receivables.buckets;
    return `<div class="at2-kpis">
      ${kpi(ICONS.receipt, 'Outstanding', rupees(receivables.total_paise), 'amber')}
      ${kpi(ICONS.clock, 'Not yet due', rupees(b.current), 'green')}
      ${kpi(ICONS.alert, '1–30 days', rupees(b.d1_30), 'amber')}
      ${kpi(ICONS.alert, '31–90 days', rupees(b.d31_60 + b.d61_90), 'red')}
      ${kpi(ICONS.alert, 'Over 90 days', rupees(b.d90_plus), 'red')}
    </div>`;
  }

  if (state.tab === 'receipts') {
    const total = receipts.reduce((s, r) => s + Number(r.amount_paise), 0);
    const unallocated = receipts.reduce((s, r) => s + Number(r.unallocated_paise), 0);
    return `<div class="at2-kpis">
      ${kpi(ICONS.wallet || ICONS.receipt, 'Received', rupees(total), 'green')}
      ${kpi(ICONS.receipt, 'Receipts', String(receipts.length), 'muted')}
      ${kpi(ICONS.alert, 'On account (unallocated)', rupees(unallocated), unallocated ? 'amber' : 'green')}
    </div>`;
  }

  const issued = rows.filter(r => r.status === 'issued');
  const value = issued.reduce((s, r) => s + Number(r.total_paise), 0);
  const due = issued.reduce((s, r) => s + Number(r.balance_paise || 0), 0);
  return `<div class="at2-kpis">
    ${kpi(ICONS.receipt, 'Documents', String(rows.length), 'muted')}
    ${kpi(ICONS.check, 'Issued value', rupees(value), 'green')}
    ${kpi(ICONS.alert, 'Still due', rupees(due), due ? 'amber' : 'green')}
    ${kpi(ICONS.edit, 'Drafts', String(rows.filter(r => r.status === 'draft').length), 'muted')}
  </div>`;
}

function paintBody(container) {
  const body = container.querySelector('#sl-body');
  if (!body) return;
  if (state.tab === 'receipts') return paintReceipts(container, body);
  if (state.tab === 'receivables') return paintReceivables(container, body);

  if (!rows.length) {
    body.innerHTML = '<div class="at2-empty">Nothing here for this range.</div>';
    return;
  }

  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr>
        <th>No.</th><th>Date</th><th>Customer</th><th>Status</th>
        <th style="text-align:right">Total</th><th style="text-align:right">Due</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(r => {
    const [sTone, sLabel] = STATUS_CHIP[r.status] || ['muted', r.status];
    const [pTone, pLabel] = PAYMENT_CHIP[r.payment_status] || ['muted', ''];
    return `
          <tr data-open="${esc(r.id)}" style="cursor:pointer">
            <td><code style="font-size:0.72rem">${esc(r.doc_no || 'draft')}</code></td>
            <td style="white-space:nowrap">${esc(day(r.doc_date))}</td>
            <td><b>${esc(r.party_name || '—')}</b>${r.reference ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(r.reference)}</div>` : ''}</td>
            <td>
              <span class="at2-chip ${sTone}">${esc(sLabel)}</span>
              ${r.doc_type === 'invoice' && r.status === 'issued' ? ` <span class="at2-chip ${pTone}">${esc(pLabel)}</span>` : ''}
            </td>
            <td style="text-align:right;white-space:nowrap"><b>${rupees(r.total_paise)}</b></td>
            <td style="text-align:right;white-space:nowrap">${Number(r.balance_paise) > 0 ? rupees(r.balance_paise) : '—'}</td>
            <td>${ICONS['chevron-right'] || ''}</td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>`;

  body.querySelectorAll('[data-open]').forEach(tr => {
    tr.onclick = () => openDetail(container, tr.dataset.open);
  });
}

function paintReceipts(container, body) {
  if (!receipts.length) {
    body.innerHTML = '<div class="at2-empty">No receipts in this range.</div>';
    return;
  }
  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>No.</th><th>Date</th><th>From</th><th>Method</th><th>Reference</th>
        <th style="text-align:right">Amount</th><th style="text-align:right">On account</th></tr></thead>
      <tbody>
        ${receipts.map(p => `
          <tr data-pay="${esc(p.id)}" style="cursor:pointer">
            <td><code style="font-size:0.72rem">${esc(p.payment_no || '—')}</code></td>
            <td style="white-space:nowrap">${esc(day(p.payment_date))}</td>
            <td><b>${esc(p.party_name || '—')}</b></td>
            <td><span class="at2-chip muted">${esc(p.method)}</span></td>
            <td>${esc(p.reference || '—')}</td>
            <td style="text-align:right"><b>${rupees(p.amount_paise)}</b></td>
            <td style="text-align:right">${Number(p.unallocated_paise) ? `<span style="color:var(--warning)">${rupees(p.unallocated_paise)}</span>` : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="at2-note">Money received but not yet put against an invoice stays visible here as "on account" rather than disappearing into a customer's total.</p>`;

  body.querySelectorAll('[data-pay]').forEach(tr => {
    tr.onclick = () => openPaymentDetail(container, tr.dataset.pay);
  });
}

function paintReceivables(container, body) {
  if (!receivables?.invoices.length) {
    body.innerHTML = '<div class="at2-empty">Nothing outstanding. Every issued invoice is settled.</div>';
    return;
  }
  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Due</th><th>Age</th>
        <th style="text-align:right">Invoiced</th><th style="text-align:right">Outstanding</th></tr></thead>
      <tbody>
        ${receivables.invoices.map(r => {
    const tone = r.bucket === 'current' ? 'ok' : r.bucket === 'd1_30' ? 'warn' : 'danger';
    return `
          <tr data-open="${esc(r.id)}" style="cursor:pointer">
            <td><code style="font-size:0.72rem">${esc(r.doc_no)}</code></td>
            <td><b>${esc(r.party_name || '—')}</b>${r.party_phone ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(r.party_phone)}</div>` : ''}</td>
            <td style="white-space:nowrap">${esc(day(r.doc_date))}</td>
            <td style="white-space:nowrap">${esc(day(r.due_date))}</td>
            <td><span class="at2-chip ${tone}">${r.days_overdue > 0 ? `${r.days_overdue} days late` : 'not due'}</span></td>
            <td style="text-align:right">${rupees(r.total_paise)}</td>
            <td style="text-align:right"><b style="color:var(--warning)">${rupees(r.outstanding_paise)}</b></td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>
    <p class="at2-note">Scope: ${esc(receivables.scope.basis)}, as on ${esc(receivables.scope.as_on)}.</p>`;

  body.querySelectorAll('[data-open]').forEach(tr => {
    tr.onclick = () => openDetail(container, tr.dataset.open);
  });
}

// ── the editor ──────────────────────────────────────────────────────────
// Lines are typed here, but every figure on screen comes back from the server's
// pricing call. Nothing is calculated in the browser, so the quotation and the
// invoice can never drift apart.
async function openEditor(container, { doc_type: docTypeArg = 'invoice', existing = null }) {
  const docType = existing?.document?.doc_type || docTypeArg;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const doc = existing?.document || null;
  // A quotation that has already gone out is revised, not edited as a draft.
  const revising = !!(doc && doc.status !== 'draft');
  const gstOptions = taxRates.filter(t => t.treatment === 'gst' && !t.effective_to);

  const lineRow = (line = {}) => `
    <tr class="sl-line">
      <td>
        <input type="text" class="sl-desc" list="sl-items" value="${esc(line.description || '')}" placeholder="Item or work done" style="min-width:160px">
        <input type="hidden" class="sl-item-id" value="${esc(line.item_id || '')}">
      </td>
      <td><input type="text" class="sl-hsn" value="${esc(line.hsn_sac || '')}" placeholder="HSN" style="width:70px"></td>
      <td><input type="number" class="sl-qty" step="0.001" min="0" value="${line.quantity ?? 1}" style="width:70px"></td>
      <td><input type="number" class="sl-rate" step="0.01" min="0" value="${line.rate_paise !== undefined ? Number(line.rate_paise) / 100 : ''}" style="width:90px"></td>
      <td><input type="number" class="sl-disc" step="0.01" min="0" max="100" value="${line.discount_bps ? Number(line.discount_bps) / 100 : ''}" placeholder="0" style="width:60px"></td>
      <td>
        <select class="sl-tax" style="width:90px">
          ${gstOptions.map(t => `<option value="${t.rate_bps}"${Number(line.tax_rate_bps) === Number(t.rate_bps) ? ' selected' : ''}>${Number(t.rate_bps) / 100}%</option>`).join('')}
          <option value="exempt"${line.tax_treatment === 'exempt' ? ' selected' : ''}>Exempt</option>
          <option value="nil_rated"${line.tax_treatment === 'nil_rated' ? ' selected' : ''}>Nil rated</option>
          <option value="non_gst"${line.tax_treatment === 'non_gst' ? ' selected' : ''}>Non-GST</option>
        </select>
      </td>
      <td class="sl-amount" style="text-align:right;white-space:nowrap">—</td>
      <td><button class="at2-photo sl-del" title="Remove">${ICONS.close}</button></td>
    </tr>`;

  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:940px">
      <div class="modal-header">
        <span class="modal-title">${revising ? `Revise quotation ${esc(doc.doc_no || '')}` : doc ? `Edit ${esc(doc.doc_type === 'estimate' ? 'quotation' : doc.doc_type.replace('_', ' '))}` : `New ${docType === 'estimate' ? 'quotation' : docType.replace('_', ' ')}`}</span>
        <button class="modal-close" id="sl-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        ${revising ? `<div class="at2-notice warn">This quotation has already gone out. Saving keeps its number (<b>${esc(doc.doc_no || '')}</b>) and marks it <b>revision ${Number(doc.revision_no || 0) + 1}</b>.
          ${doc.status === 'accepted' ? 'The customer had accepted the earlier version, so it goes back to <b>sent</b> until they agree to this one.' : ''}</div>` : ''}
        <datalist id="sl-items">
          ${items.map(i => `<option value="${esc(i.name)}" data-id="${esc(i.id)}">`).join('')}
        </datalist>

        <div class="at2-grid">
          <div class="form-group"><label>Customer *</label>
            <select id="sl-party">
              <option value="">— Choose —</option>
              ${parties.map(p => `<option value="${esc(p.id)}"${doc?.party_id === p.id ? ' selected' : ''}>${esc(p.display_name)}${p.phone ? ` · ${esc(p.phone)}` : ''}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Date</label>
            <input type="date" id="sl-date" value="${doc ? ymd(doc.doc_date) : ymd(new Date())}"></div>
          ${docType === 'estimate' ? `
          <div class="form-group"><label>Valid until</label>
            <input type="date" id="sl-valid" value="${doc?.valid_until ? ymd(doc.valid_until) : ''}"></div>` : `
          <div class="form-group"><label>Due date <small style="color:var(--text-dim)">(from credit terms if blank)</small></label>
            <input type="date" id="sl-due" value="${doc?.due_date ? ymd(doc.due_date) : ''}"></div>`}
          <div class="form-group"><label>Reference</label>
            <input type="text" id="sl-ref" value="${esc(doc?.reference || '')}" placeholder="Their PO / job no"></div>
        </div>

        <label class="at2-check" style="margin-bottom:10px">
          <input type="checkbox" id="sl-inclusive" ${doc?.prices_include_tax ? 'checked' : ''}>
          The rates below already include tax
        </label>

        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Description</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Disc %</th><th>Tax</th><th style="text-align:right">Amount</th><th></th></tr></thead>
          <tbody id="sl-lines">
            ${(existing?.lines?.filter(l => l.kind === 'item') || [{}]).map(lineRow).join('')}
          </tbody>
        </table></div>

        <div class="at2-editfoot">
          <div class="at2-editfoot-left">
            <button class="at2-addline" id="sl-add">${ICONS.plus}<span>Add line</span></button>
            <div class="at2-inline-field"><label for="sl-docdisc">Document discount ₹</label>
              <input type="number" id="sl-docdisc" step="0.01" min="0" placeholder="0" value="${doc?.doc_discount_paise ? Number(doc.doc_discount_paise) / 100 : ''}"></div>
          </div>
          <div class="at2-totals" id="sl-totals"></div>
        </div>

        <div class="form-group"><label>Notes for the customer</label>
          <textarea id="sl-notes" rows="2">${esc(doc?.notes || '')}</textarea></div>
        <div class="form-group"><label>Terms</label>
          <textarea id="sl-terms" rows="2">${esc(doc?.terms || '')}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="sl-cancel">Cancel</button>
        ${revising
      ? '<button class="btn btn-primary" id="sl-revise">Save revision</button>'
      : '<button class="btn btn-secondary" id="sl-save">Save draft</button><button class="btn btn-primary" id="sl-issue">Save &amp; issue</button>'}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#sl-close').onclick = close;
  $('#sl-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const collect = () => {
    const lines = [...overlay.querySelectorAll('.sl-line')].map(tr => {
      const taxValue = tr.querySelector('.sl-tax').value;
      const isTreatment = Number.isNaN(Number(taxValue));
      return {
        item_id: tr.querySelector('.sl-item-id').value || null,
        description: tr.querySelector('.sl-desc').value.trim(),
        hsn_sac: tr.querySelector('.sl-hsn').value.trim() || null,
        quantity: Number(tr.querySelector('.sl-qty').value) || 0,
        rate: tr.querySelector('.sl-rate').value || 0,
        discount_bps: Math.round((Number(tr.querySelector('.sl-disc').value) || 0) * 100),
        tax_rate_bps: isTreatment ? 0 : Number(taxValue),
        tax_treatment: isTreatment ? taxValue : 'gst',
      };
    }).filter(l => l.description && l.quantity > 0);

    return {
      doc_type: doc?.doc_type || docType,
      party_id: $('#sl-party').value || null,
      doc_date: $('#sl-date').value,
      due_date: $('#sl-due')?.value || null,
      valid_until: $('#sl-valid')?.value || null,
      reference: $('#sl-ref').value.trim(),
      prices_include_tax: $('#sl-inclusive').checked,
      doc_discount: $('#sl-docdisc').value || 0,
      notes: $('#sl-notes').value.trim(),
      terms: $('#sl-terms').value.trim(),
      lines,
    };
  };

  // Priced by the server on every change, so the editor shows the same figures
  // the document will carry.
  let priceTimer;
  const reprice = async () => {
    const payload = collect();
    if (!payload.lines.length) {
      $('#sl-totals').innerHTML = '<div class="empty">Add a line to see the total</div>';
      return;
    }
    try {
      const priced = await api('POST', '/sales/preview', payload);
      const t = priced.totals;
      [...overlay.querySelectorAll('.sl-line')].forEach((tr, i) => {
        const line = priced.lines[i];
        tr.querySelector('.sl-amount').textContent = line ? rupees(line.amount_paise) : '—';
      });
      $('#sl-totals').innerHTML = `
        <div class="row"><span>Taxable value</span><b>${rupees(t.taxable_paise)}</b></div>
        ${t.cgst_paise ? `<div class="row"><span>CGST</span><b>${rupees(t.cgst_paise)}</b></div><div class="row"><span>${t.utgst_paise ? 'UTGST' : 'SGST'}</span><b>${rupees(t.sgst_paise + t.utgst_paise)}</b></div>` : ''}
        ${t.igst_paise ? `<div class="row"><span>IGST</span><b>${rupees(t.igst_paise)}</b></div>` : ''}
        ${t.round_off_paise ? `<div class="row"><span>Rounding</span><b>${rupees(t.round_off_paise)}</b></div>` : ''}
        <div class="grand"><span>Total</span><b>${rupees(t.total_paise)}</b></div>
        <div class="hint">${priced.supply_type === 'inter' ? 'Inter-state supply — IGST' : 'Intra-state supply — CGST + SGST'}</div>`;
    } catch (err) {
      $('#sl-totals').innerHTML = `<div class="bad">${esc(err.message)}</div>`;
    }
  };
  const queueReprice = () => { clearTimeout(priceTimer); priceTimer = setTimeout(reprice, 300); };

  const wireLines = () => {
    overlay.querySelectorAll('.sl-line').forEach(tr => {
      tr.querySelectorAll('input, select').forEach(el => { el.oninput = queueReprice; el.onchange = queueReprice; });
      // Picking a known item fills its rate, HSN and tax from the catalogue.
      tr.querySelector('.sl-desc').onchange = (e) => {
        const match = items.find(i => i.name === e.target.value);
        if (match) {
          tr.querySelector('.sl-item-id').value = match.id;
          tr.querySelector('.sl-hsn').value = match.hsn_sac || '';
          if (!tr.querySelector('.sl-rate').value) {
            tr.querySelector('.sl-rate').value = Number(match.selling_rate_paise ? match.selling_rate_paise / 100 : match.selling_rate) || '';
          }
          const rate = Math.round(Number(match.gst_rate || 18) * 100);
          const opt = [...tr.querySelector('.sl-tax').options].find(o => Number(o.value) === rate);
          if (opt) tr.querySelector('.sl-tax').value = opt.value;
        } else {
          tr.querySelector('.sl-item-id').value = '';
        }
        queueReprice();
      };
      tr.querySelector('.sl-del').onclick = () => {
        if (overlay.querySelectorAll('.sl-line').length <= 1) return toast('A document needs at least one line', 'warning');
        tr.remove();
        queueReprice();
      };
    });
  };
  wireLines();
  $('#sl-party').onchange = queueReprice;
  $('#sl-inclusive').onchange = queueReprice;
  $('#sl-docdisc').oninput = queueReprice;
  $('#sl-add').onclick = () => {
    $('#sl-lines').insertAdjacentHTML('beforeend', lineRow());
    wireLines();
  };
  reprice();

  const save = async (thenIssue) => {
    const payload = collect();
    if (!payload.party_id) return toast('Choose the customer', 'warning');
    if (!payload.lines.length) return toast('Add at least one line', 'warning');

    const btn = thenIssue ? $('#sl-issue') : $('#sl-save');
    btn.disabled = true;
    try {
      const saved = doc
        ? await api('PATCH', `/sales/documents/${doc.id}`, payload)
        : await api('POST', '/sales/documents', payload);
      const id = saved.document.id;

      if (thenIssue) {
        await api('POST', `/sales/documents/${id}/issue`);
        toast('Issued', 'success');
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
  if (revising) {
    $('#sl-revise').onclick = async () => {
      const payload = collect();
      if (!payload.party_id) return toast('Choose the customer', 'warning');
      if (!payload.lines.length) return toast('Add at least one line', 'warning');
      const btn = $('#sl-revise');
      btn.disabled = true;
      try {
        await api('POST', `/sales/documents/${doc.id}/revise`, payload);
        toast('Quotation revised', 'success');
        close();
        await loadTab();
        paint(container);
        openDetail(container, doc.id);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    };
  } else {
    $('#sl-save').onclick = () => save(false);
    $('#sl-issue').onclick = () => save(true);
  }
}

// ── detail ──────────────────────────────────────────────────────────────
async function openDetail(container, id) {
  let loaded;
  try {
    loaded = await api('GET', `/sales/documents/${encodeURIComponent(id)}`);
  } catch (err) { return toast(err.message, 'error'); }

  const { document: doc, lines, allocations, paid_paise: paid, balance_paise: balance, payment_status: payStatus } = loaded;
  const snapshot = doc.party_snapshot || {};
  const [sTone, sLabel] = STATUS_CHIP[doc.status] || ['muted', doc.status];
  const isDraft = doc.status === 'draft';
  const canPay = doc.doc_type === 'invoice' && doc.status === 'issued' && balance > 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:720px">
      <div class="modal-header">
        <span class="modal-title">${esc(doc.doc_no || 'Draft')} <span class="at2-chip ${sTone}">${esc(sLabel)}</span>${Number(doc.revision_no) > 0 ? ` <span class="at2-chip warn">Revision ${Number(doc.revision_no)}</span>` : ""}</span>
        <button class="modal-close" id="sd-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <div style="font-weight:800;font-size:1rem">${esc(snapshot.display_name || doc.party_name || '—')}</div>
            <div style="font-size:0.82rem;color:var(--text-dim)">
              ${esc(snapshot.phone || doc.party_phone || '')}${snapshot.gstin ? ` · GSTIN ${esc(snapshot.gstin)}` : ''}
            </div>
            <div style="font-size:0.8rem;color:var(--text-dim);margin-top:4px">
              ${esc(day(doc.doc_date))}${doc.due_date ? ` · due ${esc(day(doc.due_date))}` : ''}
              · ${doc.supply_type === 'inter' ? 'inter-state (IGST)' : 'intra-state (CGST+SGST)'}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:1.3rem;font-weight:800;color:var(--primary)">${rupees(doc.total_paise)}</div>
            ${doc.doc_type === 'invoice' && !isDraft ? `
              <div style="font-size:0.82rem;color:${balance > 0 ? 'var(--warning)' : 'var(--primary)'}">
                ${balance > 0 ? `${rupees(paid)} paid · ${rupees(balance)} due` : 'Paid in full'}
              </div>` : ''}
          </div>
        </div>

        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th>
            <th style="text-align:right">Tax</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${lines.map(l => `
              <tr>
                <td>${esc(l.description)}${l.hsn_sac ? `<div style="font-size:0.7rem;color:var(--text-dim)">HSN ${esc(l.hsn_sac)}</div>` : ''}</td>
                <td style="text-align:right">${Number(l.quantity)}${l.unit ? ` ${esc(l.unit)}` : ''}</td>
                <td style="text-align:right">${rupees(l.rate_paise)}</td>
                <td style="text-align:right">${l.tax_treatment !== 'gst' ? esc(l.tax_treatment.replace('_', ' ')) : `${Number(l.tax_rate_bps) / 100}%`}</td>
                <td style="text-align:right"><b>${rupees(l.amount_paise)}</b></td>
              </tr>`).join('')}
            <tr><td colspan="4" style="text-align:right">Taxable</td><td style="text-align:right">${rupees(doc.taxable_paise)}</td></tr>
            ${Number(doc.cgst_paise) ? `<tr><td colspan="4" style="text-align:right">CGST + SGST</td><td style="text-align:right">${rupees(Number(doc.cgst_paise) + Number(doc.sgst_paise) + Number(doc.utgst_paise))}</td></tr>` : ''}
            ${Number(doc.igst_paise) ? `<tr><td colspan="4" style="text-align:right">IGST</td><td style="text-align:right">${rupees(doc.igst_paise)}</td></tr>` : ''}
            ${Number(doc.round_off_paise) ? `<tr><td colspan="4" style="text-align:right">Rounding</td><td style="text-align:right">${rupees(doc.round_off_paise)}</td></tr>` : ''}
            <tr><td colspan="4" style="text-align:right"><b>Total</b></td><td style="text-align:right"><b style="color:var(--primary)">${rupees(doc.total_paise)}</b></td></tr>
          </tbody>
        </table></div>

        ${allocations.length ? `
        <div class="card" style="margin-top:14px">
          <div class="card-header"><span class="card-title">Payments received</span></div>
          <div class="table-wrap"><table class="at2-tbl"><tbody>
            ${allocations.map(a => `
              <tr>
                <td><code style="font-size:0.72rem">${esc(a.payment_no || '')}</code> ${esc(day(a.payment_date))}</td>
                <td>${esc(a.method || '')}${a.reference ? ` · ${esc(a.reference)}` : ''}</td>
                <td style="text-align:right"><b>${rupees(a.amount_paise)}</b></td>
              </tr>`).join('')}
          </tbody></table></div>
        </div>` : ''}

        ${doc.status === 'cancelled' ? `
          <p class="at2-note" style="color:var(--danger)">Cancelled ${esc(day(doc.cancelled_at))} — ${esc(doc.cancel_reason || '')}. The ledger entry was reversed; both entries stay on record.</p>` : ''}
        ${doc.converted_to_id ? '<p class="at2-note">This document has already been converted.</p>' : ''}
        ${doc.doc_type === 'estimate' && doc.accepted_at ? `<p class="at2-note">Accepted ${esc(day(doc.accepted_at))}${doc.acceptance_method ? ` via ${esc(doc.acceptance_method)}` : ''}${doc.acceptance_note ? ` — ${esc(doc.acceptance_note)}` : ''}</p>` : ''}
      </div>
      <div class="modal-footer" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="sd-cancel">Close</button>
        ${!isDraft ? '<button class="btn btn-secondary" id="sd-pdf">Open PDF</button>' : ''}
        ${isDraft ? '<button class="btn btn-secondary" id="sd-edit">Edit</button>' : ''}
        ${doc.doc_type === 'estimate' && ['issued', 'accepted', 'rejected', 'expired'].includes(doc.status) && !doc.converted_to_id
      ? '<button class="btn btn-secondary" id="sd-revise">Edit / revise</button>' : ''}
        ${isDraft ? '<button class="btn btn-primary" id="sd-issue">Issue</button>' : ''}
        ${doc.doc_type === 'estimate' && ['issued', 'accepted'].includes(doc.status) && !doc.converted_to_id
      ? '<button class="btn btn-secondary" id="sd-accept">Mark accepted</button><button class="btn btn-primary" id="sd-convert">Convert to invoice</button>' : ''}
        ${canPay ? '<button class="btn btn-primary" id="sd-pay">Record payment</button>' : ''}
        ${!isDraft && doc.status !== 'cancelled' ? '<button class="btn btn-secondary" id="sd-void">Cancel document</button>' : ''}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#sd-close').onclick = close;
  $('#sd-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const refresh = async () => { close(); await loadTab(); paint(container); };

  if ($('#sd-pdf')) {
    $('#sd-pdf').onclick = async () => {
      // The PDF needs the token, so it is fetched and opened as a blob rather
      // than linked to directly.
      try {
        const res = await fetch(`${API}/sales/documents/${doc.id}/pdf`, { headers: authHeaders(false) });
        if (!res.ok) throw new Error('Could not generate the PDF');
        const url = URL.createObjectURL(await res.blob());
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { toast(err.message, 'error'); }
    };
  }

  if ($('#sd-edit')) $('#sd-edit').onclick = () => { close(); openEditor(container, { existing: loaded }); };
  if ($('#sd-revise')) $('#sd-revise').onclick = () => { close(); openEditor(container, { existing: loaded }); };

  if ($('#sd-issue')) {
    $('#sd-issue').onclick = async () => {
      if (!confirm('Once issued, this document takes its number and cannot be edited. Issue it?')) return;
      try {
        await api('POST', `/sales/documents/${doc.id}/issue`);
        toast('Issued', 'success');
        await refresh();
        openDetail(container, doc.id);
      } catch (err) { toast(err.message, 'error'); }
    };
  }

  if ($('#sd-accept')) {
    $('#sd-accept').onclick = async () => {
      const method = prompt('How did the customer accept it? (call, WhatsApp, email, signed copy)');
      if (!method) return;
      try {
        await api('POST', `/sales/documents/${doc.id}/acceptance`, { status: 'accepted', method });
        toast('Recorded', 'success');
        await refresh();
      } catch (err) { toast(err.message, 'error'); }
    };
  }

  if ($('#sd-convert')) {
    $('#sd-convert').onclick = async () => {
      try {
        const out = await api('POST', `/sales/documents/${doc.id}/convert`, { to: 'invoice' });
        toast(out.reused ? 'This quotation already has an invoice' : 'Invoice drafted', 'success');
        close();
        state.tab = 'invoice';
        await loadTab();
        paint(container);
        openDetail(container, out.document.id);
      } catch (err) { toast(err.message, 'error'); }
    };
  }

  if ($('#sd-pay')) {
    $('#sd-pay').onclick = () => { close(); openReceiptModal(container, { document: doc, balance }); };
  }

  if ($('#sd-void')) {
    $('#sd-void').onclick = async () => {
      const reason = prompt('A posted document is cancelled, not deleted, and its ledger entry is reversed. Why?');
      if (!reason) return;
      try {
        await api('POST', `/sales/documents/${doc.id}/cancel`, { reason });
        toast('Cancelled and reversed', 'success');
        await refresh();
      } catch (err) { toast(err.message, 'error'); }
    };
  }
}

// ── receipts ────────────────────────────────────────────────────────────
async function openReceiptModal(container, { document: doc = null, balance = 0 } = {}) {
  let open = [];
  if (!doc) {
    try { open = (await api('GET', '/sales/receivables')).invoices; } catch { open = []; }
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">Record a receipt</span>
        <button class="modal-close" id="rc-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div class="at2-grid">
          <div class="form-group"><label>From *</label>
            <select id="rc-party" ${doc ? 'disabled' : ''}>
              <option value="">— Choose —</option>
              ${parties.map(p => `<option value="${esc(p.id)}"${doc?.party_id === p.id ? ' selected' : ''}>${esc(p.display_name)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Date</label><input type="date" id="rc-date" value="${ymd(new Date())}"></div>
          <div class="form-group"><label>Amount ₹ *</label>
            <input type="number" id="rc-amount" step="0.01" min="0" value="${balance ? (balance / 100).toFixed(2) : ''}"></div>
          <div class="form-group"><label>Method</label>
            <select id="rc-method">
              ${[['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank transfer'], ['card', 'Card'], ['cheque', 'Cheque'], ['other', 'Other']]
      .map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Reference</label>
            <input type="text" id="rc-ref" placeholder="UPI ref, cheque no"></div>
        </div>

        ${doc ? `
          <p class="at2-note">Against ${esc(doc.doc_no)} — ${rupees(balance)} outstanding.</p>`
      : `
          <div class="form-group"><label>Put against</label>
            <select id="rc-doc">
              <option value="">Leave on account (advance)</option>
              ${open.map(o => `<option value="${esc(o.id)}" data-out="${o.outstanding_paise}">${esc(o.doc_no)} · ${esc(o.party_name)} · ${rupees(o.outstanding_paise)} due</option>`).join('')}
            </select>
            <small style="color:var(--text-dim);font-size:0.75rem">Money not put against an invoice stays visible as an advance.</small>
          </div>`}

        <div class="form-group"><label>Note</label><input type="text" id="rc-note"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="rc-cancel">Cancel</button>
        <button class="btn btn-primary" id="rc-save">Record receipt</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#rc-close').onclick = close;
  $('#rc-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  // Choosing an invoice fills in what it still owes and who it belongs to.
  const docPicker = $('#rc-doc');
  if (docPicker) {
    docPicker.onchange = () => {
      const chosen = open.find(o => o.id === docPicker.value);
      if (!chosen) return;
      $('#rc-party').value = chosen.party_id;
      if (!$('#rc-amount').value) $('#rc-amount').value = (chosen.outstanding_paise / 100).toFixed(2);
    };
  }

  $('#rc-save').onclick = async () => {
    const partyId = doc ? doc.party_id : $('#rc-party').value;
    const amount = Number($('#rc-amount').value);
    if (!partyId) return toast('Who paid?', 'warning');
    if (!(amount > 0)) return toast('Enter the amount', 'warning');

    const targetId = doc ? doc.id : ($('#rc-doc')?.value || null);
    const body = {
      party_id: partyId,
      payment_date: $('#rc-date').value,
      method: $('#rc-method').value,
      amount: String(amount),
      reference: $('#rc-ref').value.trim(),
      notes: $('#rc-note').value.trim(),
      // The receipt is this form's own submission, so a double click records
      // the money once.
      idempotency_key: `receipt:${partyId}:${$('#rc-date').value}:${amount}:${Date.now()}`,
      allocations: targetId ? [{ document_id: targetId, amount: String(amount) }] : [],
    };

    const btn = $('#rc-save');
    btn.disabled = true;
    try {
      await api('POST', '/payments', body);
      toast('Receipt recorded', 'success');
      close();
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

async function openPaymentDetail(container, id) {
  let loaded;
  try { loaded = await api('GET', `/payments/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }
  const { payment, allocations, unallocated_paise: unallocated } = loaded;

  let open = [];
  if (unallocated > 0) {
    try {
      open = (await api('GET', '/sales/receivables')).invoices.filter(i => i.party_id === payment.party_id);
    } catch { open = []; }
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:520px">
      <div class="modal-header">
        <span class="modal-title">${esc(payment.payment_no || 'Receipt')}</span>
        <button class="modal-close" id="pd2-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="font-weight:800;font-size:1.1rem">${rupees(payment.amount_paise)}</div>
        <div style="font-size:0.84rem;color:var(--text-dim);margin-bottom:14px">
          ${esc(payment.party_name || '')} · ${esc(day(payment.payment_date))} · ${esc(payment.method)}
          ${payment.reference ? ` · ${esc(payment.reference)}` : ''}
        </div>

        ${allocations.length ? `
        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Put against</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${allocations.map(a => `
            <tr><td><code style="font-size:0.72rem">${esc(a.doc_no || '')}</code> ${esc(day(a.doc_date))}</td>
              <td style="text-align:right"><b>${rupees(a.amount_paise)}</b></td></tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="at2-note">Not put against any invoice yet.</p>'}

        ${unallocated > 0 ? `
        <div class="card" style="margin-top:14px">
          <div class="card-header"><span class="card-title">On account: ${rupees(unallocated)}</span></div>
          <div style="padding:14px">
            ${open.length ? `
              <div class="form-group"><label>Apply to</label>
                <select id="pd2-doc">
                  ${open.map(o => `<option value="${esc(o.id)}" data-out="${o.outstanding_paise}">${esc(o.doc_no)} · ${rupees(o.outstanding_paise)} due</option>`).join('')}
                </select></div>
              <div class="form-group"><label>Amount ₹</label>
                <input type="number" id="pd2-amount" step="0.01" min="0" value="${(Math.min(unallocated, open[0].outstanding_paise) / 100).toFixed(2)}"></div>
              <button class="btn btn-primary" id="pd2-apply">Apply</button>`
      : '<p class="at2-note" style="margin:0">This customer has no outstanding invoices to apply it to.</p>'}
          </div>
        </div>` : ''}
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="pd2-cancel">Close</button></div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#pd2-close').onclick = close;
  overlay.querySelector('#pd2-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const apply = overlay.querySelector('#pd2-apply');
  if (apply) {
    apply.onclick = async () => {
      const documentId = overlay.querySelector('#pd2-doc').value;
      const amount = overlay.querySelector('#pd2-amount').value;
      apply.disabled = true;
      try {
        await api('POST', `/payments/${payment.id}/allocate`, {
          allocations: [{ document_id: documentId, amount: String(amount) }],
        });
        toast('Applied', 'success');
        close();
        await loadTab();
        paint(container);
      } catch (err) {
        toast(err.message, 'error');
        apply.disabled = false;
      }
    };
  }
}

function exportCurrent() {
  if (state.tab === 'receipts') {
    if (!receipts.length) return toast('Nothing to export', 'info');
    return exportToCSV(`receipts-${state.from}-to-${state.to}.csv`, receipts.map(p => ({
      No: p.payment_no || '', Date: ymd(p.payment_date), From: p.party_name || '',
      Method: p.method, Reference: p.reference || '',
      'Amount (₹)': (Number(p.amount_paise) / 100).toFixed(2),
      'On account (₹)': (Number(p.unallocated_paise) / 100).toFixed(2),
    })));
  }
  if (state.tab === 'receivables') {
    if (!receivables?.invoices.length) return toast('Nothing to export', 'info');
    return exportToCSV(`outstanding-as-on-${receivables.as_on}.csv`, receivables.invoices.map(r => ({
      Invoice: r.doc_no, Customer: r.party_name || '', Phone: r.party_phone || '',
      Date: ymd(r.doc_date), Due: r.due_date ? ymd(r.due_date) : '',
      'Days late': r.days_overdue > 0 ? r.days_overdue : 0,
      'Invoiced (₹)': (Number(r.total_paise) / 100).toFixed(2),
      'Outstanding (₹)': (r.outstanding_paise / 100).toFixed(2),
    })));
  }
  if (!rows.length) return toast('Nothing to export', 'info');
  exportToCSV(`${state.tab}-${state.from}-to-${state.to}.csv`, rows.map(r => ({
    No: r.doc_no || 'draft', Date: ymd(r.doc_date), Customer: r.party_name || '',
    Status: r.status, Payment: r.payment_status,
    Taxable: (Number(r.taxable_paise) / 100).toFixed(2),
    Tax: ((Number(r.cgst_paise) + Number(r.sgst_paise) + Number(r.utgst_paise) + Number(r.igst_paise)) / 100).toFixed(2),
    'Total (₹)': (Number(r.total_paise) / 100).toFixed(2),
    'Due (₹)': (Number(r.balance_paise || 0) / 100).toFixed(2),
  })));
}
