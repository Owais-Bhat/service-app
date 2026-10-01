// Business & Tax Setup — who the invoice comes from, how documents are
// numbered, and which tax rates exist.
//
// Two things this screen is deliberate about:
//   * NEST is the portal; the legal issuer on every document is the business
//     entered here. The software does not invent that.
//   * A tax rate is never edited in place. Changing one closes the old rate the
//     day before and opens a new one, so a document raised last year still
//     prices the way it was raised.
import { toast } from '../utils.js';
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

// Uploads go through the app's existing endpoint, which stores the bytes and
// hands back a path. The form keeps that path in a hidden field so saving works
// exactly as it did when these were typed-in URLs.
async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

function imageField(id, label, value, note) {
  return `
    <div class="form-group bs-imgfield" data-img="${id}">
      <label>${esc(label)}</label>
      <input type="hidden" id="${id}" value="${esc(value || '')}">
      <div class="bs-imgbox">
        <div class="bs-imgpreview" id="${id}-preview">
          ${value ? `<img src="${esc(value)}" alt="${esc(label)}">` : '<span>Nothing uploaded</span>'}
        </div>
        <div class="bs-imgactions">
          <input type="file" id="${id}-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
          <button type="button" class="btn btn-secondary btn-sm" data-pick="${id}">${ICONS.upload || ICONS.plus}<span>Upload</span></button>
          <button type="button" class="btn btn-secondary btn-sm" data-clear="${id}"${value ? '' : ' hidden'}>Remove</button>
        </div>
      </div>
      ${note ? `<small style="color:var(--text-dim);font-size:0.75rem">${esc(note)}</small>` : ''}
    </div>`;
}
const day = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATES = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'],
  ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'],
  ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
];

const DOC_LABEL = {
  invoice: 'Tax invoice', estimate: 'Estimate / quotation', sales_order: 'Sales order',
  delivery_challan: 'Delivery challan', credit_note: 'Credit note', debit_note: 'Debit note',
  proforma: 'Proforma invoice', receipt: 'Payment receipt', payment: 'Payment made',
  purchase_order: 'Purchase order', grn: 'Goods receipt', supplier_bill: 'Supplier bill',
  purchase_return: 'Purchase return', journal: 'Journal entry', expense: 'Expense',
};

const TREATMENT_LABEL = {
  gst: 'GST', exempt: 'Exempt', nil_rated: 'Nil rated', zero_rated: 'Zero rated', non_gst: 'Non-GST',
};

const TABS = [
  { key: 'business', label: 'Business' },
  { key: 'numbering', label: 'Numbering' },
  { key: 'tax', label: 'Tax Rates' },
  { key: 'service', label: 'Service Income' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

const state = { tab: 'business' };
let serviceInfo = null;
let serviceError = '';
let info = null;
let series = [];
let taxRates = [];

export async function renderBusinessSettingsTab(container) {
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    info = await api('GET', '/accounting/business');
    await loadTab();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

async function loadTab() {
  if (state.tab === 'numbering') series = await api('GET', '/accounting/series');
  if (state.tab === 'tax') taxRates = await api('GET', '/accounting/tax-rates');
  if (state.tab === 'whatsapp') await loadWhatsapp();
  if (state.tab === 'service') {
    serviceInfo = null;
    serviceError = '';
    try { serviceInfo = await api('GET', '/service-ledger/status'); } catch (err) { serviceError = err.message; }
  }
}

function paint(container) {
  const b = info.business;
  const pending = info.setup_pending || [];

  container.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1 class="at2-title">Business &amp; Tax Setup</h1>
          <p class="at2-sub">The legal issuer on every document, its numbering, and the tax rates available to it</p>
        </div>
        <div class="at2-headbtns">
          <span class="at2-chip ${b.setup_complete ? 'ok' : 'amber'}">
            ${b.setup_complete ? 'Setup confirmed' : 'Setup incomplete'}
          </span>
        </div>
      </div>

      ${pending.length ? `
      <div class="at2-notice warn">
        <b>Still needed before tax documents can be issued</b>
        <ul>${pending.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>` : ''}

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="at2-panel">
        <div class="at2-body" id="bs-body"></div>
      </div>
    </div>`;

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = async () => {
      state.tab = btn.dataset.tab;
      await loadTab();
      paint(container);
    };
  });

  paintBody(container);
}

function paintBody(container) {
  const body = container.querySelector('#bs-body');
  if (state.tab === 'business') return paintBusiness(container, body);
  if (state.tab === 'numbering') return paintNumbering(container, body);
  if (state.tab === 'tax') return paintTax(container, body);
  if (state.tab === 'service') return paintService(container, body);
  if (state.tab === 'whatsapp') return paintWhatsapp(container, body);
}

function paintBusiness(container, body) {
  const b = info.business;
  const field = (id, label, value, type = 'text', note = '') => `
    <div class="form-group">
      <label>${esc(label)}</label>
      <input type="${type}" id="${id}" value="${esc(value ?? '')}">
      ${note ? `<small style="color:var(--text-dim);font-size:0.75rem">${esc(note)}</small>` : ''}
    </div>`;

  body.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Legal identity</span></div>
      <div style="padding:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
        ${field('bs-legal', 'Legal name *', b.legal_name, 'text', 'Exactly as registered — this prints on the invoice')}
        ${field('bs-trade', 'Trade name', b.trade_name)}
        <div class="form-group">
          <label>Registration</label>
          <select id="bs-reg">
            ${[['unregistered', 'Not GST registered'], ['regular', 'Regular (GST)'], ['composition', 'Composition scheme']]
      .map(([v, l]) => `<option value="${v}"${b.registration_type === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <small style="color:var(--text-dim);font-size:0.75rem">Decides which documents are legal to issue</small>
        </div>
        ${field('bs-gstin', 'GSTIN', b.gstin, 'text', '15 characters — checked before it is saved')}
        ${field('bs-pan', 'PAN', b.pan)}
        <div class="form-group">
          <label>State *</label>
          <select id="bs-state">
            <option value="">— Not set —</option>
            ${STATES.map(([code, name]) => `<option value="${code}"${b.state_code === code ? ' selected' : ''}>${name}</option>`).join('')}
          </select>
          <small style="color:var(--text-dim);font-size:0.75rem">Decides CGST+SGST versus IGST on every sale</small>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="card-header"><span class="card-title">Address &amp; contact</span></div>
      <div style="padding:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
        ${field('bs-line1', 'Address line 1', b.address_line1)}
        ${field('bs-line2', 'Address line 2', b.address_line2)}
        ${field('bs-city', 'City', b.city)}
        ${field('bs-pin', 'Pincode', b.pincode)}
        ${field('bs-phone', 'Phone', b.phone, 'tel')}
        ${field('bs-email', 'Email', b.email, 'email')}
        ${field('bs-website', 'Website', b.website)}
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="card-header"><span class="card-title">Money &amp; documents</span></div>
      <div style="padding:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
        ${field('bs-bank', 'Bank name', b.bank_name)}
        ${field('bs-acct', 'Account number', b.bank_account_no)}
        ${field('bs-ifsc', 'IFSC', b.bank_ifsc)}
        ${field('bs-branch', 'Branch', b.bank_branch)}
        ${field('bs-upi', 'UPI ID', b.upi_id)}
        ${imageField('bs-logo', 'Logo', b.logo_url, 'Printed top-left on every document. A PNG about 400px wide works well.')}
        ${imageField('bs-sign', 'Signature', b.signature_url, 'Printed above "Authorised signatory". A PNG with a transparent background looks best.')}
        <div class="form-group">
          <label>Financial year starts</label>
          <select id="bs-fy">
            ${[[4, 'April (India)'], [1, 'January']].map(([v, l]) =>
      `<option value="${v}"${Number(b.fy_start_month) === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <small style="color:var(--text-dim);font-size:0.75rem">Current year: ${esc(info.fy_label)}</small>
        </div>
      </div>
      <div style="padding:0 14px 14px">
        <div class="form-group"><label>Invoice footer / terms</label><textarea id="bs-footer" rows="3">${esc(b.invoice_footer || '')}</textarea></div>
        <div class="form-group"><label>Payment instructions</label><textarea id="bs-payinfo" rows="2">${esc(b.payment_instructions || '')}</textarea></div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <div style="padding:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <label class="at2-check">
          <input type="checkbox" id="bs-complete" ${b.setup_complete ? 'checked' : ''}>
          I confirm these are the correct legal details for issuing documents
        </label>
        <div style="flex:1"></div>
        <button class="btn btn-primary" id="bs-save">Save business details</button>
      </div>
      <p class="at2-note" style="padding:0 14px 14px">
        Tax features stay locked until this is confirmed. Nothing here is guessed for you — an invoice issuer is a legal
        fact, not a default.
      </p>
    </div>`;

  // Upload controls: pick a file, it goes up, the preview and the hidden field
  // both follow. Saving is unchanged.
  body.querySelectorAll('[data-pick]').forEach(btn => {
    const id = btn.dataset.pick;
    const input = body.querySelector(`#${id}-file`);
    btn.onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) return toast('Choose an image file', 'warning');
      btn.disabled = true;
      try {
        const url = await uploadImage(file);
        body.querySelector(`#${id}`).value = url;
        body.querySelector(`#${id}-preview`).innerHTML = `<img src="${esc(url)}" alt="">`;
        body.querySelector(`[data-clear="${id}"]`).hidden = false;
        toast('Uploaded — remember to save', 'success');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        input.value = '';
      }
    };
  });

  body.querySelectorAll('[data-clear]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.clear;
      body.querySelector(`#${id}`).value = '';
      body.querySelector(`#${id}-preview`).innerHTML = '<span>Nothing uploaded</span>';
      btn.hidden = true;
      toast('Removed — remember to save', 'info');
    };
  });

  body.querySelector('#bs-save').onclick = async (e) => {
    const val = (id) => body.querySelector(id).value.trim();
    const payload = {
      legal_name: val('#bs-legal'), trade_name: val('#bs-trade'),
      registration_type: body.querySelector('#bs-reg').value,
      gstin: val('#bs-gstin').toUpperCase(), pan: val('#bs-pan').toUpperCase(),
      state_code: body.querySelector('#bs-state').value,
      address_line1: val('#bs-line1'), address_line2: val('#bs-line2'),
      city: val('#bs-city'), pincode: val('#bs-pin'),
      phone: val('#bs-phone'), email: val('#bs-email'), website: val('#bs-website'),
      bank_name: val('#bs-bank'), bank_account_no: val('#bs-acct'),
      bank_ifsc: val('#bs-ifsc').toUpperCase(), bank_branch: val('#bs-branch'), upi_id: val('#bs-upi'),
      logo_url: val('#bs-logo'), signature_url: val('#bs-sign'),
      fy_start_month: Number(body.querySelector('#bs-fy').value),
      invoice_footer: val('#bs-footer'), payment_instructions: val('#bs-payinfo'),
      setup_complete: body.querySelector('#bs-complete').checked ? 1 : 0,
    };
    if (!payload.legal_name) return toast('The legal name is required', 'warning');
    if (payload.registration_type === 'regular' && !payload.gstin) {
      return toast('A GST-registered business needs its GSTIN', 'warning');
    }

    e.target.disabled = true;
    try {
      const out = await api('PUT', '/accounting/business', payload);
      info = await api('GET', '/accounting/business');
      toast('Saved', 'success');
      paint(container);
      void out;
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  };
}

function paintNumbering(container, body) {
  if (!series.length) {
    body.innerHTML = '<div class="at2-empty">No series yet — they are created the first time each document type is raised.</div>';
    return;
  }

  const byYear = {};
  series.forEach(s => { (byYear[s.fy_label] ||= []).push(s); });

  body.innerHTML = Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0])).map(([year, list]) => `
    <div class="card" style="margin-bottom:12px">
      <div class="card-header"><span class="card-title">${esc(year)}</span><span class="at2-count">${list.length} series</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Document</th><th>Prefix</th><th>Next</th><th>Preview</th><th></th></tr></thead>
        <tbody>
          ${list.map(s => `
            <tr>
              <td><b>${esc(DOC_LABEL[s.doc_type] || s.doc_type)}</b></td>
              <td><code style="font-size:0.72rem">${esc(s.prefix || '')}</code></td>
              <td>${s.next_number}</td>
              <td><code style="font-size:0.72rem">${esc(`${s.prefix || ''}${String(s.next_number).padStart(s.padding || 1, '0')}${s.suffix || ''}`)}</code></td>
              <td><button class="at2-photo" data-series="${esc(s.id)}" title="Edit">${ICONS.edit}</button></td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`).join('') + `
    <p class="at2-note">
      Numbers are handed out one at a time by the database, so two documents raised at the same moment can never share
      a number. Lowering "next" can repeat a number already printed, so it asks for a reason and is recorded.
    </p>`;

  body.querySelectorAll('[data-series]').forEach(btn => {
    btn.onclick = () => {
      const row = series.find(s => s.id === btn.dataset.series);
      if (row) openSeriesModal(container, row);
    };
  });
}

function openSeriesModal(container, row) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:460px">
      <div class="modal-header">
        <span class="modal-title">${esc(DOC_LABEL[row.doc_type] || row.doc_type)} — ${esc(row.fy_label)}</span>
        <button class="modal-close" id="sm-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Prefix</label><input type="text" id="sm-prefix" value="${esc(row.prefix || '')}"></div>
        <div class="form-group"><label>Suffix</label><input type="text" id="sm-suffix" value="${esc(row.suffix || '')}"></div>
        <div class="form-group"><label>Digits</label><input type="number" id="sm-pad" min="1" max="10" value="${row.padding || 4}"></div>
        <div class="form-group"><label>Next number</label><input type="number" id="sm-next" min="1" value="${row.next_number}"></div>
        <div class="form-group"><label>Reason <small style="color:var(--text-dim)">(needed if you lower the next number)</small></label>
          <input type="text" id="sm-reason"></div>
        <div id="sm-preview" style="font-size:0.85rem;color:var(--text-soft)"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="sm-cancel">Cancel</button>
        <button class="btn btn-primary" id="sm-save">Save</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#sm-close').onclick = close;
  $('#sm-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const preview = () => {
    const n = String($('#sm-next').value || 1).padStart(Number($('#sm-pad').value) || 1, '0');
    $('#sm-preview').textContent = `Next document: ${$('#sm-prefix').value}${n}${$('#sm-suffix').value}`;
  };
  ['#sm-prefix', '#sm-suffix', '#sm-pad', '#sm-next'].forEach(sel => { $(sel).oninput = preview; });
  preview();

  $('#sm-save').onclick = async () => {
    const btn = $('#sm-save');
    btn.disabled = true;
    try {
      await api('PATCH', `/accounting/series/${row.id}`, {
        prefix: $('#sm-prefix').value, suffix: $('#sm-suffix').value,
        padding: Number($('#sm-pad').value), next_number: Number($('#sm-next').value),
        reason: $('#sm-reason').value.trim(),
      });
      toast('Saved', 'success');
      close();
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

// ── Service income → the books ─────────────────────────────────────────
// Service and installation bills and payments live on the tickets. This tab
// says from which date they are written into the ledger, and shows what is
// waiting on the owner.
function paintService(container, body) {
  if (!serviceInfo) {
    body.innerHTML = `<div class="at2-empty">${esc(serviceError || 'Could not load')}</div>`;
    return;
  }
  const s = serviceInfo;
  const attention = s.attention || [];
  const inputDate = s.from || new Date().toISOString().slice(0, 10);

  body.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-header"><span class="card-title">Service &amp; installation income in the ledger</span>
        <span class="at2-chip ${s.enabled ? 'ok' : 'warn'}" style="margin-left:8px">${s.enabled ? `On from ${esc(day(s.from))}` : 'Off'}</span></div>
      <div style="padding:14px;font-size:0.86rem;line-height:1.7;color:var(--text-soft)">
        Every service ticket and installation with a bill is written into the books by itself:
        <b>the bill</b> (customer owes you, sales, GST, discount), <b>the payment</b> (bank, till, or cash a technician is carrying)
        and <b>the cash handed in</b>. If a ticket is corrected, un-marked as paid or deleted, the old entry is reversed and a new one is posted — nothing is edited or lost.
        <br>Only tickets billed <b>on or after</b> the date below are posted. Anything billed earlier belongs in the opening balances, so it is not counted twice.
      </div>
      <div style="padding:0 14px 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin:0">
          <label>Post tickets billed from</label>
          <input type="date" id="sl-from" value="${esc(inputDate)}">
        </div>
        <button class="btn btn-primary" id="sl-save">Save date</button>
        <button class="btn btn-secondary" id="sl-sync">Sync now</button>
        ${s.enabled ? '<button class="btn btn-secondary" id="sl-off">Switch off</button>' : ''}
      </div>
    </div>

    <div class="at2-kpis" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <div class="card" style="padding:12px 18px"><div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase">Bills in the books</div><div style="font-size:1.4rem;font-weight:800">${s.billed}</div></div>
      <div class="card" style="padding:12px 18px"><div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase">Payments recorded</div><div style="font-size:1.4rem;font-weight:800">${s.collected}</div></div>
      <div class="card" style="padding:12px 18px"><div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase">Need attention</div><div style="font-size:1.4rem;font-weight:800;color:${attention.length ? 'var(--danger)' : 'inherit'}">${attention.length}</div></div>
    </div>

    ${attention.length ? `
    <div class="at2-notice danger" style="padding:14px 16px 6px">
      <b>Could not be posted</b>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Ticket</th><th>Type</th><th>Why</th></tr></thead>
        <tbody>${attention.map(a => `<tr><td><b>${esc(a.ticket_ref || a.source_id.slice(0, 8))}</b></td><td>${esc(a.source_type === 'installation' ? 'Installation' : 'Service')}</td><td>${esc(a.note || '')}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="at2-note">Usually a closed accounting period or a missing business state. Fix it, then press Sync now — it is also retried every few minutes.</p>
    </div>` : `<p class="at2-note">${s.enabled ? 'Nothing is waiting. New bills and payments appear in the ledger within a moment of being saved.' : 'Switched off — tickets are not being posted.'}</p>`}`;

  const save = async (from, message) => {
    try {
      await api('PUT', '/service-ledger/settings', { from });
      toast(message, 'success');
      await loadTab();
      paintBody(container);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  body.querySelector('#sl-save').onclick = () => {
    const v = body.querySelector('#sl-from').value;
    if (!v) return toast('Choose the date', 'warning');
    save(v, `Posting tickets billed from ${day(v)}`);
  };
  const off = body.querySelector('#sl-off');
  if (off) off.onclick = () => save(null, 'Switched off');
  body.querySelector('#sl-sync').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const out = await api('POST', '/service-ledger/sync');
      toast(out.checked ? `${out.synced} posted, ${out.blocked} need attention` : 'Everything is already up to date', 'success');
      await loadTab();
      paintBody(container);
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  };
}

function paintTax(container, body) {
  const live = taxRates.filter(t => !t.effective_to);
  const past = taxRates.filter(t => t.effective_to);

  const table = (list, title) => `
    <div class="card" style="margin-bottom:12px">
      <div class="card-header"><span class="card-title">${title}</span><span class="at2-count">${list.length}</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Name</th><th>Treatment</th><th>Rate</th><th>From</th><th>To</th><th></th></tr></thead>
        <tbody>
          ${list.map(t => `
            <tr>
              <td><b>${esc(t.name)}</b>${t.is_default ? ' <span class="at2-chip ok">default</span>' : ''}</td>
              <td><span class="at2-chip ${t.treatment === 'gst' ? 'ok' : 'muted'}">${esc(TREATMENT_LABEL[t.treatment] || t.treatment)}</span></td>
              <td>${t.treatment === 'gst' ? `${Number(t.rate_bps) / 100}%` : '—'}</td>
              <td>${esc(day(t.effective_from))}</td>
              <td>${t.effective_to ? esc(day(t.effective_to)) : 'current'}</td>
              <td>${t.effective_to ? '' : `<button class="btn btn-secondary btn-sm" data-change="${esc(t.id)}">Change rate</button>`}</td>
            </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:16px">None</td></tr>'}
        </tbody>
      </table></div>
    </div>`;

  body.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn btn-secondary" id="bs-new-tax">${ICONS.plus}<span>Add rate</span></button>
    </div>
    ${table(live, 'In force')}
    ${past.length ? table(past, 'Superseded') : ''}
    <p class="at2-note">
      Exempt, nil-rated, zero-rated and non-GST are four different treatments, not one switch — which one applies to a
      supply is a statutory question for your accountant, and the document type follows from it.
      Changing a rate never rewrites an old document: it closes the current rate the day before the new one starts.
    </p>`;

  body.querySelector('#bs-new-tax').onclick = () => openTaxModal(container);
  body.querySelectorAll('[data-change]').forEach(btn => {
    btn.onclick = () => {
      const row = taxRates.find(t => t.id === btn.dataset.change);
      if (row) openTaxModal(container, row);
    };
  });
}

function openTaxModal(container, supersedes = null) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:460px">
      <div class="modal-header">
        <span class="modal-title">${supersedes ? `Change ${esc(supersedes.name)}` : 'New tax rate'}</span>
        <button class="modal-close" id="tm-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        ${supersedes ? `<p style="font-size:0.85rem;color:var(--text-soft);margin-bottom:12px">
          The current rate stays on record and closes the day before the new one starts. Documents already raised keep
          the rate they were raised at.</p>` : ''}
        <div class="form-group"><label>Name</label>
          <input type="text" id="tm-name" value="${esc(supersedes?.name || '')}" placeholder="e.g. GST 18%"></div>
        <div class="form-group"><label>Treatment</label>
          <select id="tm-treatment" ${supersedes ? 'disabled' : ''}>
            ${Object.entries(TREATMENT_LABEL).map(([v, l]) =>
    `<option value="${v}"${(supersedes?.treatment || 'gst') === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Rate %</label>
          <input type="number" id="tm-rate" step="0.01" min="0" value="${supersedes ? Number(supersedes.rate_bps) / 100 : ''}"></div>
        <div class="form-group"><label>Effective from</label>
          <input type="date" id="tm-from" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label>Reason</label><input type="text" id="tm-reason" placeholder="e.g. notification 0X/2026"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="tm-cancel">Cancel</button>
        <button class="btn btn-primary" id="tm-save">Save</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#tm-close').onclick = close;
  $('#tm-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('#tm-save').onclick = async () => {
    const treatment = $('#tm-treatment').value;
    const body = {
      name: $('#tm-name').value.trim(),
      treatment,
      rate_bps: Math.round((Number($('#tm-rate').value) || 0) * 100),
      effective_from: $('#tm-from').value,
      reason: $('#tm-reason').value.trim(),
      supersedes_id: supersedes?.id,
    };
    if (!body.effective_from) return toast('Pick the date this rate starts', 'warning');
    if (treatment === 'gst' && !body.rate_bps && !body.name.includes('0')) {
      return toast('Enter the rate percentage', 'warning');
    }
    const btn = $('#tm-save');
    btn.disabled = true;
    try {
      await api('POST', '/accounting/tax-rates', body);
      toast('Saved', 'success');
      close();
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

// ── WhatsApp ────────────────────────────────────────────────────────────
// Fast2SMS's WhatsApp API sends only pre-approved templates, so this tab holds
// the id of each template and shows the wording to register it with.
let wa = null;
let waLog = [];
let waError = '';

async function loadWhatsapp() {
  wa = null; waLog = []; waError = '';
  try {
    [wa, waLog] = await Promise.all([api('GET', '/whatsapp/settings'), api('GET', '/whatsapp/log?limit=15')]);
  } catch (err) { waError = err.message; }
}

function paintWhatsapp(container, body) {
  if (!wa) { body.innerHTML = `<div class="at2-empty">${esc(waError || 'Could not load')}</div>`; return; }
  const ready = wa.enabled && wa.phone_number_id && wa.api_key_set && wa.templates.some(t => t.message_id && t.enabled);
  const PURPOSE_NAME = Object.fromEntries(wa.templates.map(t => [t.purpose, t.label]));
  const stamp = (v) => v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  body.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-header"><span class="card-title">WhatsApp sending (Fast2SMS)</span>
        <span class="at2-chip ${ready ? 'ok' : 'warn'}" style="margin-left:8px">${ready ? 'Ready' : 'Not set up'}</span></div>
      <div style="padding:14px;font-size:0.86rem;line-height:1.7;color:var(--text-soft)">
        WhatsApp lets a business start a chat only with a <b>template it has had approved</b>. So: create each template below in your
        Fast2SMS dashboard (WhatsApp → Templates) using the suggested wording, wait for Meta's approval, then paste its <b>template id</b> here.
        Messages cost per send, from your Fast2SMS wallet.
        <ol style="margin:8px 0 0 18px;padding:0">
          <li>Paste the <b>WhatsApp phone number id</b> below (Fast2SMS → WhatsApp Manager → Numbers) and, for each approved template, its <b>MESSAGE ID</b> — the short number (like 35143) in WhatsApp Manager → Templates. <b>Not</b> the long Template ID.</li>
          <li>Tick <b>Sending is switched on</b> and press <b>Save WhatsApp settings</b>.</li>
          <li>On a template's card, type <b>your own mobile</b> and press <b>Send test</b> — a sample arrives on your WhatsApp.</li>
          <li>To send a real one: open an issued <b>invoice or quotation</b> in Sales and press <b>Send on WhatsApp</b> — the customer gets the PDF.</li>
        </ol>
        ${wa.api_key_set ? '' : '<div class="at2-notice danger" style="margin-top:8px">The Fast2SMS API key (<code>SMS_API</code>) is not set on the server, so nothing can be sent.</div>'}
      </div>
      <div style="padding:0 14px 14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;align-items:end">
        <label class="at2-check"><input type="checkbox" id="wa-on" ${wa.enabled ? 'checked' : ''}> Sending is switched on</label>
        <div class="form-group" style="margin:0"><label>WhatsApp phone number id</label>
          <input type="text" id="wa-pnid" value="${esc(wa.phone_number_id)}" placeholder="e.g. 579519398574288" inputmode="numeric">
          <small style="color:var(--text-dim);font-size:0.75rem">The long number shown against your WhatsApp number in Fast2SMS</small></div>
      </div>
    </div>

    ${wa.templates.map(t => `
    <div class="card" style="margin-bottom:14px" data-purpose="${esc(t.purpose)}">
      <div class="card-header"><span class="card-title">${esc(t.label)}</span>
        <span class="at2-chip ${t.message_id && t.enabled ? 'ok' : 'muted'}" style="margin-left:8px">${t.message_id ? (t.enabled ? 'Template set' : 'Turned off') : 'No template yet'}</span></div>
      <div style="padding:14px;display:grid;grid-template-columns:minmax(200px,260px) 1fr;gap:14px">
        <div>
          <div class="form-group"><label>Message ID</label>
            <input type="text" class="wa-mid" value="${esc(t.message_id)}" placeholder="e.g. 35143" inputmode="numeric">
            <small style="color:var(--text-dim);font-size:0.72rem">The short <b>MESSAGE ID</b> in Fast2SMS — not the long Template ID</small></div>
          <label class="at2-check"><input type="checkbox" class="wa-ten" ${t.enabled ? 'checked' : ''}> Use it</label>
          <div style="margin-top:12px">
            <label style="font-size:0.74rem;font-weight:700">Try it on your own phone</label>
            <div style="display:flex;gap:6px;margin-top:4px">
              <input type="tel" class="wa-testphone" placeholder="Your 10-digit mobile" inputmode="numeric" style="flex:1;min-width:0">
              <button class="btn btn-secondary wa-test" type="button">Send test</button>
            </div>
            <small style="color:var(--text-dim);font-size:0.72rem;display:block;margin-top:4px">Sends a sample message to this number — nothing goes to a customer.${t.media ? ' It attaches the PDF of your latest issued invoice or quotation.' : ''}</small>
          </div>
        </div>
        <div style="font-size:0.82rem;line-height:1.6">
          <div style="font-weight:800;font-size:0.7rem;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-dim)">Variables, in this order</div>
          ${t.vars.map((v, i) => `<div><code>{{${i + 1}}}</code> ${esc(v)}</div>`).join('')}
          ${t.header ? `<div style="margin-top:4px"><b>${esc(t.header)}</b></div>` : ''}
          <div style="font-weight:800;font-size:0.7rem;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-dim);margin-top:8px">Suggested wording</div>
          <div style="padding:8px 10px;border-radius:10px;background:rgba(127,127,127,0.1);user-select:all">${esc(t.suggested)}</div>
        </div>
      </div>
    </div>`).join('')}

    <div style="display:flex;justify-content:flex-end;margin-bottom:14px"><button class="btn btn-primary" id="wa-save">Save WhatsApp settings</button></div>

    <div class="card">
      <div class="card-header"><span class="card-title">Recent messages</span></div>
      ${waLog.length ? `<div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>When</th><th>Message</th><th>To</th><th>Result</th></tr></thead>
        <tbody>${waLog.map(m => `<tr>
          <td style="white-space:nowrap">${esc(stamp(m.created_at))}</td>
          <td>${esc(PURPOSE_NAME[m.purpose] || m.purpose)}${m.party_name ? `<div style="font-size:0.74rem;color:var(--text-dim)">${esc(m.party_name)}</div>` : ''}</td>
          <td>${esc(m.phone)}</td>
          <td>${m.status === 'sent' ? '<span class="at2-chip ok">Accepted</span>' : m.status === 'failed' ? `<span class="at2-chip danger">Failed</span><div style="font-size:0.74rem;color:var(--text-dim)">${esc(m.error || '')}</div>` : '<span class="at2-chip muted">Queued</span>'}</td>
        </tr>`).join('')}</tbody></table></div>
        <p class="at2-note" style="padding:0 14px 12px">"Accepted" means Fast2SMS took it. Delivery to the phone is shown in your Fast2SMS dashboard.</p>` : '<div style="padding:14px;color:var(--text-dim);font-size:0.84rem">Nothing sent yet.</div>'}
    </div>`;

  const collect = () => ({
    enabled: body.querySelector('#wa-on').checked,
    phone_number_id: body.querySelector('#wa-pnid').value.trim(),
    templates: [...body.querySelectorAll('[data-purpose]')].map(card => ({
      purpose: card.dataset.purpose,
      message_id: card.querySelector('.wa-mid').value.trim(),
      enabled: card.querySelector('.wa-ten').checked,
    })),
  });
  const save = async () => { wa = { ...wa, ...(await api('PUT', '/whatsapp/settings', collect())) }; };

  body.querySelector('#wa-save').onclick = async () => {
    try { await save(); toast('WhatsApp settings saved', 'success'); paintWhatsapp(container, body); } catch (err) { toast(err.message, 'error'); }
  };
  body.querySelectorAll('.wa-test').forEach(btn => {
    btn.onclick = async () => {
      const card = btn.closest('[data-purpose]');
      const phone = card.querySelector('.wa-testphone').value.trim();
      if (!phone) return toast('Type your own mobile number to receive the test', 'warning');
      btn.disabled = true;
      try {
        await save();
        await api('POST', '/whatsapp/test', { purpose: card.dataset.purpose, phone });
        toast('Test sent — check your WhatsApp', 'success');
      } catch (err) { toast(err.message, 'error'); }
      await loadWhatsapp();
      paintWhatsapp(container, body);
    };
  });
}
