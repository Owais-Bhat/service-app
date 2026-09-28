// Customers & Suppliers — one address book shared by every module.
//
// Until now a customer existed only as a name and a phone number repeated on
// each job sheet, so the same shop appeared five times and nobody could say
// what it owed. This is the master record: contact details, GST treatment,
// credit terms, addresses, and a balance read straight from the ledger rather
// than from a stored field that could disagree with the accounts.
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
const initials = (n) => String(n || '?').trim().charAt(0).toUpperCase();

const TABS = [
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'duplicates', label: 'Duplicates' },
];

const GST_TREATMENTS = [
  ['unregistered', 'Unregistered'],
  ['registered', 'Registered (has GSTIN)'],
  ['composition', 'Composition scheme'],
  ['consumer', 'Consumer'],
  ['overseas', 'Overseas'],
  ['sez', 'SEZ'],
];

// State codes as they appear in a GSTIN — the place of supply decides whether a
// sale is CGST+SGST or IGST, so it is a field, never a guess.
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

const state = { tab: 'customers', q: '', showInactive: false };
let rows = [];
let duplicates = [];

export async function renderPartiesTab(container) {
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    await load();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

async function load() {
  const kind = state.tab === 'suppliers' ? 'supplier' : 'customer';
  rows = await api('GET', `/parties?kind=${kind}&active=${state.showInactive ? 'all' : '1'}&q=${encodeURIComponent(state.q)}`);
  if (state.tab === 'duplicates') duplicates = await api('GET', '/parties/duplicates/suggest');
}

function kpis() {
  const owing = rows.filter(r => Number(r.balance_paise) > 0);
  const owed = rows.filter(r => Number(r.balance_paise) < 0);
  const total = rows.reduce((sum, r) => sum + Number(r.balance_paise || 0), 0);
  return { count: rows.length, owing: owing.length, owed: owed.length, total };
}

function paint(container) {
  const k = kpis();
  const isSupplier = state.tab === 'suppliers';

  container.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1 class="at2-title">Customers &amp; Suppliers</h1>
          <p class="at2-sub">One record per party, shared by jobs, invoices, purchases and the ledger</p>
        </div>
        <div class="at2-headbtns">
          <button class="btn btn-secondary" id="pt-export">${ICONS.download}<span>Export</span></button>
          <button class="btn btn-primary" id="pt-new">${ICONS.plus}<span>New ${isSupplier ? 'Supplier' : 'Customer'}</span></button>
        </div>
      </div>

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="at2-kpis">
        ${kpi(ICONS.users, 'On file', k.count, 'green')}
        ${kpi(ICONS.receipt, isSupplier ? 'We owe' : 'Owe us', k.owing, 'amber')}
        ${kpi(ICONS.check, isSupplier ? 'In credit' : 'In advance', k.owed, 'green')}
        ${kpi(ICONS.wallet || ICONS.receipt, 'Net balance', rupees(k.total), k.total > 0 ? 'warn' : 'green')}
      </div>

      <div class="at2-panel">
        <div class="at2-filters">
          <input type="search" id="pt-q" class="at2-search" placeholder="Search name, phone, GSTIN or email" value="${esc(state.q)}">
          <label class="at2-check">
            <input type="checkbox" id="pt-inactive" ${state.showInactive ? 'checked' : ''}> Show inactive
          </label>
        </div>
        <div class="at2-body" id="pt-body"></div>
      </div>
    </div>`;

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = async () => {
      state.tab = btn.dataset.tab;
      await load();
      paint(container);
    };
  });

  const search = container.querySelector('#pt-q');
  let timer;
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      state.q = search.value.trim();
      await load();
      paintBody(container);
    }, 250);
  };
  container.querySelector('#pt-inactive').onchange = async (e) => {
    state.showInactive = e.target.checked;
    await load();
    paintBody(container);
  };
  container.querySelector('#pt-new').onclick = () => openPartyModal(container, null, isSupplier ? 'supplier' : 'customer');
  container.querySelector('#pt-export').onclick = () => exportRows();

  paintBody(container);
}

function kpi(icon, label, value, tone) {
  return `
    <div class="at2-kpi">
      <span class="at2-kpi-ico tone-${tone}">${icon || ''}</span>
      <div>
        <div class="at2-kpi-label">${esc(label)}</div>
        <div class="at2-kpi-value tone-${tone}">${value}</div>
      </div>
    </div>`;
}

function paintBody(container) {
  const body = container.querySelector('#pt-body');
  if (!body) return;

  if (state.tab === 'duplicates') return paintDuplicates(container, body);

  if (!rows.length) {
    body.innerHTML = '<div class="at2-empty">Nobody on file yet. Add the first one, or import from your existing jobs.</div>';
    return;
  }

  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr>
        <th>Name</th><th>Phone</th><th>GST</th><th>Place of supply</th>
        <th>Terms</th><th style="text-align:right">Balance</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(r => {
    const balance = Number(r.balance_paise || 0);
    const stateName = (STATES.find(s => s[0] === r.place_of_supply_state_code) || [])[1];
    return `
          <tr data-open="${esc(r.id)}" style="cursor:pointer">
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <span class="at2-avatar">${esc(initials(r.display_name))}</span>
                <div>
                  <b>${esc(r.display_name)}</b>
                  ${r.active ? '' : ' <span class="at2-chip muted">Inactive</span>'}
                  ${r.legal_name && r.legal_name !== r.display_name ? `<div style="font-size:0.75rem;color:var(--text-dim)">${esc(r.legal_name)}</div>` : ''}
                </div>
              </div>
            </td>
            <td style="white-space:nowrap">${esc(r.phone || '—')}</td>
            <td>${r.gstin
      ? `<code style="font-size:0.72rem">${esc(r.gstin)}</code>`
      : `<span class="at2-chip muted">${esc((GST_TREATMENTS.find(g => g[0] === r.gst_treatment) || ['', 'Unregistered'])[1])}</span>`}</td>
            <td>${esc(stateName || '—')}</td>
            <td style="white-space:nowrap">${Number(r.credit_days) ? `${r.credit_days} days` : 'On delivery'}</td>
            <td style="text-align:right;white-space:nowrap">
              ${balance === 0 ? '<span style="color:var(--text-dim)">Settled</span>'
      : `<b style="color:${balance > 0 ? 'var(--warning)' : 'var(--primary)'}">${rupees(Math.abs(balance))}</b>
                   <div style="font-size:0.7rem;color:var(--text-dim)">${balance > 0 ? 'receivable' : 'advance'}</div>`}
            </td>
            <td style="white-space:nowrap">
              <button class="at2-photo" data-edit="${esc(r.id)}" title="Edit">${ICONS.edit}</button>
            </td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>`;

  body.querySelectorAll('[data-open]').forEach(tr => {
    tr.onclick = (e) => {
      if (e.target.closest('[data-edit]')) return;
      openPartyDetail(container, tr.dataset.open);
    };
  });
  body.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const row = rows.find(r => r.id === btn.dataset.edit);
      if (row) openPartyModal(container, row);
    };
  });
}

// Two records for one shop is what every address book grown from job sheets
// looks like. The server proposes the pairs; a person decides, and the merge
// carries the ledger across rather than leaving a balance stranded.
function paintDuplicates(container, body) {
  if (!duplicates.length) {
    body.innerHTML = '<div class="at2-empty">No likely duplicates found. Matching is by phone, GSTIN and name.</div>';
    return;
  }

  body.innerHTML = duplicates.map((g, gi) => `
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <span class="card-title">${esc(g.parties[0].display_name)}</span>
        <span class="at2-chip warn">matched on ${esc(g.reason)}</span>
      </div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Keep</th><th>Name</th><th>Phone</th><th>GSTIN</th><th>Added</th></tr></thead>
        <tbody>
          ${g.parties.map((p, i) => `
            <tr>
              <td><input type="radio" name="keep-${gi}" value="${esc(p.id)}" ${i === 0 ? 'checked' : ''}></td>
              <td><b>${esc(p.display_name)}</b></td>
              <td>${esc(p.phone || '—')}</td>
              <td>${esc(p.gstin || '—')}</td>
              <td>${p.created_at ? esc(new Date(p.created_at).toLocaleDateString('en-IN')) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>
      <div style="padding:12px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="text" class="dup-reason" placeholder="Why are these the same party?" style="flex:1;min-width:200px">
        <button class="btn btn-primary" data-merge="${gi}">Merge the rest into the kept one</button>
      </div>
    </div>`).join('');

  body.querySelectorAll('[data-merge]').forEach(btn => {
    btn.onclick = async () => {
      const gi = Number(btn.dataset.merge);
      const group = duplicates[gi];
      const card = btn.closest('.card');
      const keepId = card.querySelector(`input[name="keep-${gi}"]:checked`)?.value;
      const reason = card.querySelector('.dup-reason').value.trim();
      if (!keepId) return toast('Choose which record to keep', 'warning');
      if (!reason) return toast('A merge is permanent — say why these are the same party', 'warning');

      const mergeIds = group.parties.map(p => p.id).filter(id => id !== keepId);
      if (!confirm(`Merge ${mergeIds.length} record${mergeIds.length === 1 ? '' : 's'} into ${esc(group.parties.find(p => p.id === keepId).display_name)}?\n\nBalances, addresses and job links move to the kept record. This cannot be undone.`)) return;

      btn.disabled = true;
      try {
        await api('POST', '/parties/merge', { keep_id: keepId, merge_ids: mergeIds, reason });
        toast('Merged', 'success');
        await load();
        paint(container);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    };
  });
}

function openPartyModal(container, existing = null, defaultKind = 'customer') {
  const isEdit = !!existing;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:620px">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? 'Edit' : 'New'} ${esc(existing?.kind === 'supplier' ? 'Supplier' : defaultKind === 'supplier' ? 'Supplier' : 'Customer')}</span>
        <button class="modal-close" id="pm-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
          <div class="form-group"><label>Name *</label>
            <input type="text" id="pm-name" value="${esc(existing?.display_name || '')}" placeholder="Shop or person as everyone calls them"></div>
          <div class="form-group"><label>Legal name <small style="color:var(--text-dim)">(on the invoice)</small></label>
            <input type="text" id="pm-legal" value="${esc(existing?.legal_name || '')}"></div>
          <div class="form-group"><label>Phone</label>
            <input type="tel" id="pm-phone" value="${esc(existing?.phone || '')}" placeholder="10 digits"></div>
          <div class="form-group"><label>Email</label>
            <input type="email" id="pm-email" value="${esc(existing?.email || '')}"></div>
          <div class="form-group"><label>They are a</label>
            <select id="pm-kind">
              ${[['customer', 'Customer'], ['supplier', 'Supplier'], ['both', 'Both']].map(([v, l]) =>
    `<option value="${v}"${(existing?.kind || defaultKind) === v ? ' selected' : ''}>${l}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>GST treatment</label>
            <select id="pm-treatment">
              ${GST_TREATMENTS.map(([v, l]) => `<option value="${v}"${(existing?.gst_treatment || 'unregistered') === v ? ' selected' : ''}>${l}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>GSTIN</label>
            <input type="text" id="pm-gstin" value="${esc(existing?.gstin || '')}" placeholder="15 characters" maxlength="15" style="text-transform:uppercase">
            <small id="pm-gstin-note" style="color:var(--text-dim);font-size:0.75rem"></small></div>
          <div class="form-group"><label>Place of supply</label>
            <select id="pm-state">
              <option value="">— Not set —</option>
              ${STATES.map(([code, name]) => `<option value="${code}"${existing?.place_of_supply_state_code === code ? ' selected' : ''}>${name}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Credit days</label>
            <input type="number" id="pm-credit-days" min="0" value="${Number(existing?.credit_days || 0)}"></div>
          <div class="form-group"><label>Credit limit (₹)</label>
            <input type="number" id="pm-credit-limit" min="0" step="0.01" value="${existing ? (Number(existing.credit_limit_paise || 0) / 100) : ''}"></div>
          <div class="form-group"><label>Opening balance (₹)</label>
            <input type="number" id="pm-open" step="0.01" value="${existing ? (Number(existing.opening_balance_paise || 0) / 100) : ''}"
              placeholder="What was outstanding before NEST"></div>
          <div class="form-group"><label>Opening balance is</label>
            <select id="pm-open-type">
              <option value="receivable"${existing?.opening_balance_type !== 'payable' ? ' selected' : ''}>They owe us</option>
              <option value="payable"${existing?.opening_balance_type === 'payable' ? ' selected' : ''}>We owe them</option>
            </select></div>
        </div>

        ${isEdit ? '' : `
        <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:12px">
          <label style="font-weight:700;font-size:0.85rem">Billing address</label>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:8px">
            <div class="form-group"><label>Address</label><input type="text" id="pm-line1"></div>
            <div class="form-group"><label>City</label><input type="text" id="pm-city"></div>
            <div class="form-group"><label>Pincode</label><input type="text" id="pm-pin" maxlength="6"></div>
          </div>
        </div>`}

        <div class="form-group"><label>Notes</label><textarea id="pm-notes" rows="2">${esc(existing?.notes || '')}</textarea></div>
        ${isEdit ? `
        <div class="form-group"><label>Reason for this change <small style="color:var(--text-dim)">(kept in the audit trail)</small></label>
          <input type="text" id="pm-reason"></div>
        <label class="at2-check"><input type="checkbox" id="pm-active" ${existing.active ? 'checked' : ''}> Active</label>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="pm-cancel">Cancel</button>
        <button class="btn btn-primary" id="pm-save">${isEdit ? 'Save Changes' : 'Create'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#pm-close').onclick = close;
  $('#pm-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  // A GSTIN carries its state and proves registration, so the form follows it
  // instead of asking the same thing twice.
  const gstin = $('#pm-gstin');
  gstin.oninput = () => {
    const value = gstin.value.toUpperCase().trim();
    gstin.value = value;
    const note = $('#pm-gstin-note');
    if (!value) { note.textContent = ''; return; }
    if (value.length !== 15) { note.textContent = `${value.length}/15 characters`; return; }
    const code = value.slice(0, 2);
    const st = STATES.find(s => s[0] === code);
    note.textContent = st ? `Registered in ${st[1]}` : 'Unknown state code';
    if (st) { $('#pm-state').value = code; $('#pm-treatment').value = 'registered'; }
  };

  $('#pm-save').onclick = async () => {
    const body = {
      display_name: $('#pm-name').value.trim(),
      legal_name: $('#pm-legal').value.trim(),
      phone: $('#pm-phone').value.trim(),
      email: $('#pm-email').value.trim(),
      kind: $('#pm-kind').value,
      gst_treatment: $('#pm-treatment').value,
      gstin: gstin.value.trim(),
      place_of_supply_state_code: $('#pm-state').value,
      credit_days: Number($('#pm-credit-days').value) || 0,
      credit_limit: $('#pm-credit-limit').value || 0,
      opening_balance: $('#pm-open').value || 0,
      opening_balance_type: $('#pm-open-type').value,
      notes: $('#pm-notes').value.trim(),
    };
    if (!body.display_name) return toast('A name is required', 'warning');

    if (isEdit) {
      body.reason = $('#pm-reason').value.trim();
      body.active = $('#pm-active').checked;
    } else if ($('#pm-line1').value.trim()) {
      body.addresses = [{
        kind: 'billing', line1: $('#pm-line1').value.trim(), city: $('#pm-city').value.trim(),
        pincode: $('#pm-pin').value.trim(), state_code: body.place_of_supply_state_code, is_default: true,
      }];
    }

    const btn = $('#pm-save');
    btn.disabled = true;
    try {
      if (isEdit) await api('PATCH', `/parties/${existing.id}`, body);
      else await api('POST', '/parties', body);
      toast(isEdit ? 'Saved' : 'Added', 'success');
      close();
      await load();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

async function openPartyDetail(container, id) {
  let payload;
  try {
    payload = await api('GET', `/parties/${encodeURIComponent(id)}`);
  } catch (err) {
    return toast(err.message, 'error');
  }
  const { party, addresses = [], receivable_paise: balance = 0 } = payload;
  const stateName = (STATES.find(s => s[0] === party.place_of_supply_state_code) || [])[1];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">${esc(party.display_name)}</span>
        <button class="modal-close" id="pd-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px">
          <div>
            <div class="at2-kpi-label">Balance</div>
            <div style="font-size:1.3rem;font-weight:800;color:${balance > 0 ? 'var(--warning)' : 'var(--primary)'}">
              ${rupees(Math.abs(balance))}
            </div>
            <small style="color:var(--text-dim)">${balance > 0 ? 'receivable' : balance < 0 ? 'in advance' : 'settled'} · from the ledger</small>
          </div>
          <div>
            <div class="at2-kpi-label">Terms</div>
            <div style="font-weight:700">${Number(party.credit_days) ? `${party.credit_days} days` : 'On delivery'}</div>
            <small style="color:var(--text-dim)">${Number(party.credit_limit_paise) ? `limit ${rupees(party.credit_limit_paise)}` : 'no limit set'}</small>
          </div>
        </div>

        <div class="table-wrap"><table class="at2-tbl"><tbody>
          <tr><td>Phone</td><td><b>${esc(party.phone || '—')}</b></td></tr>
          <tr><td>Email</td><td>${esc(party.email || '—')}</td></tr>
          <tr><td>GST treatment</td><td>${esc((GST_TREATMENTS.find(g => g[0] === party.gst_treatment) || ['', '—'])[1])}</td></tr>
          <tr><td>GSTIN</td><td>${party.gstin ? `<code>${esc(party.gstin)}</code>` : '—'}</td></tr>
          <tr><td>Place of supply</td><td>${esc(stateName || '—')}</td></tr>
          <tr><td>Opening balance</td><td>${rupees(party.opening_balance_paise)} ${esc(party.opening_balance_type)}${party.opening_balance_on ? ` on ${esc(new Date(party.opening_balance_on).toLocaleDateString('en-IN'))}` : ''}</td></tr>
        </tbody></table></div>

        ${addresses.length ? `
        <div class="card" style="margin-top:14px">
          <div class="card-header"><span class="card-title">Addresses</span></div>
          <div style="padding:0 14px 14px">
            ${addresses.map(a => `
              <div style="padding:8px 0;border-bottom:1px solid var(--border)">
                <span class="at2-chip ${a.kind === 'shipping' ? 'warn' : 'green'}">${esc(a.kind)}</span>
                <div style="margin-top:4px;font-size:0.86rem">${esc([a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ') || '—')}</div>
              </div>`).join('')}
          </div>
        </div>` : ''}

        ${party.notes ? `<div style="margin-top:14px;font-size:0.86rem;color:var(--text-soft);white-space:pre-wrap">${esc(party.notes)}</div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="pd-cancel">Close</button>
        <button class="btn btn-primary" id="pd-edit">Edit</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#pd-close').onclick = close;
  overlay.querySelector('#pd-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#pd-edit').onclick = () => { close(); openPartyModal(container, party); };
}

function exportRows() {
  if (!rows.length) return toast('Nothing to export', 'info');
  exportToCSV(`${state.tab}-${new Date().toISOString().slice(0, 10)}.csv`, rows.map(r => ({
    Name: r.display_name || '',
    'Legal name': r.legal_name || '',
    Phone: r.phone || '',
    Email: r.email || '',
    Type: r.kind,
    'GST treatment': r.gst_treatment,
    GSTIN: r.gstin || '',
    'Place of supply': (STATES.find(s => s[0] === r.place_of_supply_state_code) || [])[1] || '',
    'Credit days': r.credit_days || 0,
    'Balance (₹)': (Number(r.balance_paise || 0) / 100).toFixed(2),
    Active: r.active ? 'Yes' : 'No',
  })));
}
