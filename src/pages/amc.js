// AMC Contracts — annual maintenance contracts.
//
// The steadiest repeat income a CCTV business has, so the screen is built
// around the three moments it is won or lost: the term is invoiced, the free
// visits are counted, and the renewal is chased before the contract lapses.
//
// A contract's invoice is an ordinary sales invoice — it appears in Sales, ages,
// is chased and is paid like any other. Nothing is calculated here that the
// server does not also decide.
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';
import { openQuickParty } from './party-quick-add.js';
import { warrantyChip } from './devices.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (v) => { const [y, m, d] = String(v).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const day = (v) => v ? dayOf(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATE_CHIP = {
  active: ['ok', 'Running'],
  upcoming: ['muted', 'Not started'],
  expired: ['danger', 'Expired'],
  renewed: ['muted', 'Renewed'],
  cancelled: ['muted', 'Cancelled'],
};

const TABS = [
  { key: 'contracts', label: 'Contracts' },
  { key: 'renewals', label: 'Renewals Due' },
];

const view = { tab: 'contracts', q: '', filter: 'all' };
let root = null;
let data = { contracts: [], summary: {} };
let renewals = [];
let parties = [];
let taxRates = [];

export async function renderAmcTab(container) {
  root = container;
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    [parties, taxRates] = await Promise.all([
      api('GET', '/parties?kind=all&limit=1000'),
      api('GET', '/accounting/tax-rates').catch(() => []),
    ]);
    await load();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint();
}

async function load() {
  [data, renewals] = await Promise.all([
    api('GET', `/amc/contracts?q=${encodeURIComponent(view.q)}`),
    api('GET', '/amc/renewals?days=45').then(r => r.contracts),
  ]);
}

const reload = async () => { await load(); paint(); };

function paint() {
  const s = data.summary || {};
  root.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1>AMC Contracts</h1>
          <p>Annual maintenance — invoice the term, count the visits, renew before it lapses</p>
        </div>
        <div class="at2-headbtns">
          <button class="btn btn-primary" id="amc-new">${ICONS.plus}<span>New contract</span></button>
        </div>
      </div>

      <div class="at2-stats">
        <div class="at2-stat"><div class="k">Running contracts</div><div class="v">${Number(s.running || 0)}</div><div class="s">${rupees(s.running_value_paise)} a year</div></div>
        <div class="at2-stat ${s.lapsing_30 ? 'warn' : 'muted'}"><div class="k">Ending in 30 days</div><div class="v">${Number(s.lapsing_30 || 0)}</div><div class="s">${rupees(s.lapsing_30_value_paise)} to renew</div></div>
        <div class="at2-stat ${s.lapsed ? 'danger' : 'muted'}"><div class="k">Lapsed, not renewed</div><div class="v ${s.lapsed ? 'bad' : ''}">${Number(s.lapsed || 0)}</div><div class="s">${rupees(s.lapsed_value_paise)} to win back</div></div>
        <div class="at2-stat ${s.not_invoiced ? 'warn' : 'muted'}"><div class="k">Not invoiced yet</div><div class="v">${Number(s.not_invoiced || 0)}</div><div class="s">${rupees(s.unpaid_paise)} invoiced, unpaid</div></div>
      </div>

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${view.tab === t.key ? ' on' : ''}" data-tab="${t.key}">${t.label}${t.key === 'renewals' && renewals.length ? ` <span class="at2-chip warn" style="margin-left:4px">${renewals.length}</span>` : ''}</button>`).join('')}
      </div>

      <div class="at2-panel">
        ${view.tab === 'contracts' ? `
        <div class="at2-filters">
          <input type="search" id="amc-q" class="at2-search" placeholder="Customer, contract number or what it covers" value="${esc(view.q)}">
          <select id="amc-filter" style="padding:8px 10px;border-radius:9px">
            ${[['all', 'All'], ['active', 'Running'], ['expired', 'Expired'], ['renewed', 'Renewed'], ['upcoming', 'Not started'], ['cancelled', 'Cancelled']]
      .map(([v, l]) => `<option value="${v}"${view.filter === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="at2-body" id="amc-body"></div>
      </div>
    </div>`;

  root.querySelectorAll('[data-tab]').forEach(btn => { btn.onclick = () => { view.tab = btn.dataset.tab; paint(); }; });
  root.querySelector('#amc-new').onclick = () => openEditor();
  const q = root.querySelector('#amc-q');
  if (q) {
    let timer;
    q.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => { view.q = q.value.trim(); await load(); paintBody(); }, 250); };
  }
  const filter = root.querySelector('#amc-filter');
  if (filter) filter.onchange = () => { view.filter = filter.value; paintBody(); };
  paintBody();
}

function paintBody() {
  const body = root.querySelector('#amc-body');
  if (view.tab === 'renewals') return paintRenewals(body);

  const rows = data.contracts.filter(c => view.filter === 'all' || c.state === view.filter);
  if (!rows.length) {
    body.innerHTML = `<div class="empty" style="padding:38px;text-align:center;color:var(--text-dim)">
      ${data.contracts.length ? 'No contract matches.' : 'No contracts yet. Start with your best customer — a running CCTV site is the easiest AMC to sign.'}</div>`;
    return;
  }
  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Contract</th><th>Customer</th><th>Term</th><th style="text-align:right">Amount</th><th>Visits</th><th>Invoice</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(c => {
    const [tone, label] = STATE_CHIP[c.state] || ['muted', c.state];
    const left = c.state === 'active' ? `${c.days_left} days left` : c.state === 'expired' ? `${c.days_overdue} days ago` : '';
    return `
          <tr data-open="${esc(c.id)}">
            <td><code style="font-size:0.72rem">${esc(c.contract_no || '')}</code><div style="font-size:0.78rem;color:var(--text-dim)">${esc(c.title)}</div></td>
            <td><b>${esc(c.party_name || '—')}</b><div style="font-size:0.74rem;color:var(--text-dim)">${esc(c.party_phone || '')}</div></td>
            <td style="white-space:nowrap">${esc(day(c.start_date))} – ${esc(day(c.end_date))}<div style="font-size:0.74rem;color:var(--text-dim)">${esc(left)}</div></td>
            <td style="text-align:right">${rupees(c.amount_paise)}${Number(c.tax_rate_bps) ? '<div style="font-size:0.7rem;color:var(--text-dim)">+ GST</div>' : ''}</td>
            <td>${visitsCell(c)}</td>
            <td>${invoiceCell(c)}</td>
            <td><span class="at2-chip ${tone}">${esc(label)}</span></td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>`;
  body.querySelectorAll('[data-open]').forEach(tr => { tr.onclick = () => openDetail(tr.dataset.open); });
}

function visitsCell(c) {
  if (c.visits_included === null) return `${c.visits_used} <span style="color:var(--text-dim);font-size:0.74rem">of unlimited</span>`;
  const over = c.visits_over ? ` <span class="at2-chip danger">+${c.visits_over} chargeable</span>` : '';
  return `<b>${c.visits_used}</b> <span style="color:var(--text-dim);font-size:0.78rem">of ${c.visits_included}</span>${over}`;
}

function invoiceCell(c) {
  if (!c.has_invoice) return c.state === 'cancelled' ? '—' : '<span class="at2-chip warn">Not invoiced</span>';
  const due = Number(c.invoice_due_paise);
  return `<code style="font-size:0.72rem">${esc(c.invoice_no || '')}</code>
    <div style="font-size:0.74rem;color:${due > 0 ? 'var(--warning)' : 'var(--primary)'}">${due > 0 ? `${rupees(due)} due` : 'Paid'}</div>`;
}

// ── renewals ────────────────────────────────────────────────────────────
function paintRenewals(body) {
  if (!renewals.length) {
    body.innerHTML = '<div class="empty" style="padding:38px;text-align:center;color:var(--text-dim)">Nothing is about to lapse in the next 45 days, and nothing has lapsed unrenewed.</div>';
    return;
  }
  const URGENCY = {
    expired: ['danger', 'Expired'],
    week: ['danger', 'This week'],
    fortnight: ['warn', 'Within 15 days'],
    month: ['ok', 'Within 45 days'],
  };
  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Customer</th><th>Contract</th><th>Ends</th><th style="text-align:right">Renew for</th><th>Reminded</th><th></th></tr></thead>
      <tbody>
        ${renewals.map(c => {
    const [tone, label] = URGENCY[c.urgency] || ['muted', ''];
    return `
          <tr>
            <td><b>${esc(c.party_name || '—')}</b><div style="font-size:0.74rem;color:var(--text-dim)">${esc(c.party_phone || 'no phone')}</div></td>
            <td><code style="font-size:0.72rem">${esc(c.contract_no || '')}</code><div style="font-size:0.78rem;color:var(--text-dim)">${esc(c.title)}</div></td>
            <td style="white-space:nowrap">${esc(day(c.end_date))}<div><span class="at2-chip ${tone}">${esc(label)}</span>
              <span style="font-size:0.74rem;color:var(--text-dim)"> ${c.state === 'expired' ? `${c.days_overdue} days ago` : `${c.days_left} days`}</span></div></td>
            <td style="text-align:right"><b>${rupees(c.amount_paise)}</b></td>
            <td style="font-size:0.76rem;color:var(--text-dim)">${c.reminders_sent ? `${c.reminders_sent}× · ${esc(day(c.last_reminded_at))}` : 'not yet'}</td>
            <td style="white-space:nowrap;text-align:right">
              ${c.whatsapp_url ? `<button class="btn btn-secondary" data-wa="${esc(c.id)}" style="padding:6px 10px">WhatsApp</button>` : ''}
              <button class="btn btn-primary" data-renew="${esc(c.id)}" style="padding:6px 10px">Renew</button>
            </td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>
    <p class="at2-note">WhatsApp opens the customer's chat with the message written for you; it is sent from your own phone. Renewing starts the next term the day after this one ends.</p>`;

  body.querySelectorAll('[data-wa]').forEach(btn => {
    btn.onclick = async () => {
      const c = renewals.find(r => r.id === btn.dataset.wa);
      window.open(c.whatsapp_url, '_blank', 'noopener');
      try { await api('POST', `/amc/contracts/${encodeURIComponent(c.id)}/reminded`); await reload(); } catch { /* the chat is open; the count can wait */ }
    };
  });
  body.querySelectorAll('[data-renew]').forEach(btn => { btn.onclick = () => openRenew(btn.dataset.renew); });
}

// ── the editor ──────────────────────────────────────────────────────────
function openEditor(existing = null) {
  const c = existing;
  const today = new Date();
  const start = c ? String(c.start_date).slice(0, 10) : ymd(today);
  const end = c ? String(c.end_date).slice(0, 10) : ymd(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate() - 1));
  const gst = taxRates.filter(t => t.treatment === 'gst' && !t.effective_to);
  const invoiced = c?.has_invoice;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:760px">
      <div class="modal-header">
        <span class="modal-title">${c ? `Edit ${esc(c.contract_no)}` : 'New AMC contract'}</span>
        <button class="modal-close" id="ae-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        ${invoiced ? '<div class="at2-notice warn">This term has been invoiced, so the amount and tax are fixed. To change them, cancel the invoice in Sales first.</div>' : ''}
        <div class="form-group"><label>Customer *</label>
          <div class="at2-select-row">
            <select id="ae-party" ${c ? 'disabled' : ''}>
              <option value="">— Choose —</option>
              ${parties.map(p => `<option value="${esc(p.id)}"${c?.party_id === p.id ? ' selected' : ''}>${esc(p.display_name)}${p.phone ? ` · ${esc(p.phone)}` : ''}</option>`).join('')}
            </select>
            ${c ? '' : `<button type="button" class="at2-plus" id="ae-newparty" title="Add a new customer">${ICONS.plus}<span>New</span></button>`}
          </div></div>
        <div class="form-group"><label>What it covers *</label>
          <input type="text" id="ae-title" value="${esc(c?.title || '')}" placeholder="CCTV — 8 cameras, 1 DVR"></div>
        <div class="form-group"><label>Site address</label>
          <input type="text" id="ae-site" value="${esc(c?.site || '')}" placeholder="Where the equipment is"></div>
        <div class="form-group"><label>Equipment covered</label>
          <textarea id="ae-equip" rows="2" placeholder="e.g. Hikvision 8ch DVR, 6 × 5MP dome, 2 × 5MP bullet, 1 TB HDD">${esc(c?.equipment || '')}</textarea></div>
        <div class="at2-grid">
          <div class="form-group"><label>Starts *</label><input type="date" id="ae-start" value="${start}"></div>
          <div class="form-group"><label>Ends *</label><input type="date" id="ae-end" value="${end}"></div>
          <div class="form-group"><label>Free visits <small>(blank = unlimited)</small></label>
            <input type="number" id="ae-visits" min="0" step="1" value="${c?.visits_included ?? (c ? '' : 4)}" placeholder="unlimited"></div>
        </div>
        <div class="at2-grid">
          <div class="form-group"><label>Contract amount ₹ <small>(before GST)</small></label>
            <input type="number" id="ae-amount" min="0" step="0.01" value="${c ? Number(c.amount_paise) / 100 : ''}" ${invoiced ? 'disabled' : ''}></div>
          <div class="form-group"><label>GST</label>
            <select id="ae-tax" ${invoiced ? 'disabled' : ''}>
              ${gst.map(t => `<option value="${t.rate_bps}"${c && c.tax_treatment === 'gst' && Number(c.tax_rate_bps) === Number(t.rate_bps) ? ' selected' : (!c && Number(t.rate_bps) === 1800 ? ' selected' : '')}>${Number(t.rate_bps) / 100}%</option>`).join('')}
              <option value="exempt"${c?.tax_treatment === 'exempt' ? ' selected' : ''}>Exempt</option>
              <option value="nil_rated"${c?.tax_treatment === 'nil_rated' ? ' selected' : ''}>Nil rated</option>
              <option value="non_gst"${c?.tax_treatment === 'non_gst' ? ' selected' : ''}>Non-GST</option>
            </select></div>
        </div>
        <div class="form-group"><label>Terms <small>(printed on the invoice)</small></label>
          <textarea id="ae-terms" rows="2">${esc(c?.terms || '')}</textarea></div>
        <div class="form-group"><label>Internal notes</label>
          <input type="text" id="ae-notes" value="${esc(c?.notes || '')}"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ae-cancel">Cancel</button>
        <button class="btn btn-primary" id="ae-save">${c ? 'Save changes' : 'Create contract'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#ae-close').onclick = close;
  $('#ae-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  if ($('#ae-newparty')) {
    $('#ae-newparty').onclick = () => openQuickParty({
      kind: 'customer',
      onCreated: (p) => {
        parties.push(p);
        $('#ae-party').appendChild(new Option(`${p.display_name}${p.phone ? ` · ${p.phone}` : ''}`, p.id, true, true));
        $('#ae-party').value = p.id;
      },
    });
  }
  // Starting a term moves its end a year on, until the end is set by hand.
  if (!c) {
    let endTouched = false;
    $('#ae-end').oninput = () => { endTouched = true; };
    $('#ae-start').onchange = () => {
      if (endTouched || !$('#ae-start').value) return;
      const s = dayOf($('#ae-start').value);
      $('#ae-end').value = ymd(new Date(s.getFullYear() + 1, s.getMonth(), s.getDate() - 1));
    };
  }

  $('#ae-save').onclick = async () => {
    const taxValue = $('#ae-tax').value;
    const isTreatment = Number.isNaN(Number(taxValue));
    const payload = {
      party_id: $('#ae-party').value,
      title: $('#ae-title').value.trim(),
      site: $('#ae-site').value.trim(),
      equipment: $('#ae-equip').value.trim(),
      start_date: $('#ae-start').value,
      end_date: $('#ae-end').value,
      visits_included: $('#ae-visits').value === '' ? null : Number($('#ae-visits').value),
      terms: $('#ae-terms').value.trim(),
      notes: $('#ae-notes').value.trim(),
    };
    if (!invoiced) {
      payload.amount = $('#ae-amount').value || 0;
      payload.tax_treatment = isTreatment ? taxValue : 'gst';
      payload.tax_rate_bps = isTreatment ? 0 : Number(taxValue);
    }
    if (!payload.party_id) return toast('Choose the customer', 'warning');
    if (!payload.title) return toast('Say what the contract covers', 'warning');
    const btn = $('#ae-save');
    btn.disabled = true;
    try {
      const saved = c ? await api('PATCH', `/amc/contracts/${encodeURIComponent(c.id)}`, payload) : await api('POST', '/amc/contracts', payload);
      toast(c ? 'Saved' : `Contract ${saved.contract.contract_no} created`, 'success');
      close();
      await reload();
      if (!c) openDetail(saved.contract.id);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

// ── renew ───────────────────────────────────────────────────────────────
async function openRenew(id) {
  let loaded;
  try { loaded = await api('GET', `/amc/contracts/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }
  const c = loaded.contract;
  const nextStart = new Date(dayOf(c.end_date)); nextStart.setDate(nextStart.getDate() + 1);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10050';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:460px">
      <div class="modal-header"><span class="modal-title">Renew ${esc(c.contract_no)}</span><button class="modal-close" id="rn-close">${ICONS.close}</button></div>
      <div class="modal-body">
        <p style="margin:0 0 12px;color:var(--text-dim);font-size:0.86rem">${esc(c.party_name)} — ${esc(c.title)}. The next term runs the same length as this one.</p>
        <div class="form-group"><label>New term starts</label><input type="date" id="rn-start" value="${ymd(nextStart)}"></div>
        <div class="form-group"><label>Amount ₹ <small>(before GST)</small></label><input type="number" id="rn-amount" min="0" step="0.01" value="${Number(c.amount_paise) / 100}"></div>
        <label class="at2-check"><input type="checkbox" id="rn-invoice" checked> Raise the invoice for the new term now</label>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="rn-cancel">Cancel</button><button class="btn btn-primary" id="rn-go">Renew</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#rn-close').onclick = close;
  $('#rn-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  $('#rn-go').onclick = async () => {
    const btn = $('#rn-go');
    btn.disabled = true;
    try {
      const renewed = await api('POST', `/amc/contracts/${encodeURIComponent(id)}/renew`, { start_date: $('#rn-start').value, amount: $('#rn-amount').value });
      let note = `Renewed as ${renewed.contract.contract_no}`;
      if ($('#rn-invoice').checked) {
        try {
          const inv = await api('POST', `/amc/contracts/${encodeURIComponent(renewed.contract.id)}/invoice`, {});
          note += ` — invoice ${inv.invoice.doc_no} raised`;
        } catch (err) { toast(`Renewed, but the invoice was not raised: ${err.message}`, 'warning'); }
      }
      toast(note, 'success');
      close();
      document.querySelectorAll('.modal-overlay').forEach(o => { if (o !== overlay) o.remove(); });
      await reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

// ── detail ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  let loaded;
  try { loaded = await api('GET', `/amc/contracts/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }
  const { contract: c, visits, earlier_terms: earlier } = loaded;
  // The customer's registered equipment: what this contract covers, and what it does not yet.
  let equipment = [];
  try { equipment = (await api('GET', `/devices?party_id=${encodeURIComponent(c.party_id)}`)).devices; } catch { /* no access to the register */ }
  const covered = equipment.filter(x => x.amc_contract_id === c.id);
  const uncovered = equipment.filter(x => !x.amc_contract_id);
  const [tone, label] = STATE_CHIP[c.state] || ['muted', c.state];
  const live = c.state !== 'cancelled';
  const canRenew = live && !c.renewed_to_id;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:780px">
      <div class="modal-header">
        <span class="modal-title">${esc(c.contract_no)} <span class="at2-chip ${tone}">${esc(label)}</span></span>
        <button class="modal-close" id="ad-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <div style="font-weight:800;font-size:1.02rem">${esc(c.party_name || '—')}</div>
            <div style="font-size:0.84rem;color:var(--text-dim)">${esc(c.party_phone || '')}</div>
            <div style="margin-top:6px;font-size:0.9rem"><b>${esc(c.title)}</b></div>
            ${c.site ? `<div style="font-size:0.8rem;color:var(--text-dim)">${esc(c.site)}</div>` : ''}
            ${c.equipment ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:4px;white-space:pre-wrap">${esc(c.equipment)}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div style="font-size:1.35rem;font-weight:800;color:var(--primary)">${rupees(c.amount_paise)}</div>
            <div style="font-size:0.78rem;color:var(--text-dim)">${Number(c.tax_rate_bps) ? `+ ${Number(c.tax_rate_bps) / 100}% GST` : c.tax_treatment === 'gst' ? 'no GST' : esc(c.tax_treatment.replace('_', ' '))}</div>
            <div style="font-size:0.84rem;margin-top:6px">${esc(day(c.start_date))} – ${esc(day(c.end_date))}</div>
            <div style="font-size:0.78rem;color:${c.state === 'expired' ? 'var(--danger)' : 'var(--text-dim)'}">
              ${c.state === 'expired' ? `expired ${c.days_overdue} days ago` : c.days_left !== null ? `${c.days_left} days left` : ''}</div>
          </div>
        </div>

        <div class="at2-stats" style="margin:0 0 12px">
          <div class="at2-stat ${c.has_invoice ? '' : 'warn'}"><div class="k">Invoice</div>
            <div class="v" style="font-size:1rem">${c.has_invoice ? esc(c.invoice_no) : 'Not raised'}</div>
            <div class="s">${c.has_invoice ? (Number(c.invoice_due_paise) > 0 ? `${rupees(c.invoice_due_paise)} due` : 'Paid in full') : 'Term not billed yet'}</div></div>
          <div class="at2-stat ${c.visits_over ? 'danger' : ''}"><div class="k">Visits</div>
            <div class="v">${c.visits_used}${c.visits_included !== null ? ` / ${c.visits_included}` : ''}</div>
            <div class="s">${c.visits_included === null ? 'unlimited' : c.visits_left ? `${c.visits_left} free left` : c.visits_over ? `${c.visits_over} chargeable` : 'free visits used up'}</div></div>
        </div>

        ${c.notes ? `<p class="at2-note">${esc(c.notes)}</p>` : ''}
        ${c.state === 'cancelled' ? `<div class="at2-notice danger">Cancelled${c.cancelled_reason ? ` — ${esc(c.cancelled_reason)}` : ''}.</div>` : ''}
        ${c.renewed_to_id ? '<div class="at2-notice">This term has been renewed. The next term is its own contract.</div>' : ''}

        <div class="card" style="margin-top:6px">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <span class="card-title">Visits</span>
            ${live ? '<button class="btn btn-secondary" id="ad-addvisit" style="padding:6px 10px">Log a visit</button>' : ''}
          </div>
          ${visits.length ? `<div class="table-wrap"><table class="at2-tbl"><tbody>
            ${visits.map(v => `<tr>
              <td style="white-space:nowrap">${esc(day(v.visit_date))}</td>
              <td>${v.kind === 'complaint' ? 'Complaint' : 'Scheduled'}${v.ticket_ref ? ` · <code style="font-size:0.72rem">${esc(v.ticket_ref)}</code>` : ''}</td>
              <td>${esc(v.note || '')}</td>
              <td>${v.chargeable ? '<span class="at2-chip danger">Chargeable</span>' : '<span class="at2-chip ok">Free</span>'}</td>
              <td style="text-align:right"><button class="at2-photo" data-delvisit="${esc(v.id)}" title="Remove this visit">${ICONS.close}</button></td>
            </tr>`).join('')}
          </tbody></table></div>` : '<div style="padding:14px;color:var(--text-dim);font-size:0.84rem">No visits logged yet.</div>'}
        </div>

        ${equipment.length ? `
        <div class="card" style="margin-top:12px">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <span class="card-title">Covered equipment (${covered.reduce((n, x) => n + x.quantity, 0)})</span>
            ${live && uncovered.length ? `<button class="btn btn-secondary" id="ad-cover" style="padding:6px 10px">Cover the other ${uncovered.length} device${uncovered.length === 1 ? '' : 's'}</button>` : ''}
          </div>
          ${covered.length ? `<div class="table-wrap"><table class="at2-tbl"><tbody>
            ${covered.map(x => { const [wt, wl] = warrantyChip(x); return `<tr>
              <td>${x.quantity > 1 ? `<b>${x.quantity} ×</b> ` : ''}<b>${esc([x.brand, x.model].filter(Boolean).join(' ') || x.category_label)}</b><div style="font-size:0.74rem;color:var(--text-dim)">${esc(x.site_name || '')}${x.location_note ? ` · ${esc(x.location_note)}` : ''}</div></td>
              <td><code style="font-size:0.72rem">${esc(x.serial_no || '')}</code></td>
              <td><span class="at2-chip ${wt}">${wl}</span></td>
              <td>${x.status === 'faulty' ? '<span class="at2-chip danger">Faulty</span>' : ''}</td></tr>`; }).join('')}
          </tbody></table></div>` : '<div style="padding:14px;color:var(--text-dim);font-size:0.84rem">No registered device is linked to this contract yet.</div>'}
        </div>` : ''}

        ${earlier.length ? `<p class="at2-note">Earlier terms: ${earlier.map(t => `${esc(t.contract_no)} (${esc(day(t.start_date))} – ${esc(day(t.end_date))}, ${rupees(t.amount_paise)})`).join(' · ')}</p>` : ''}
      </div>
      <div class="modal-footer" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="ad-cancel">Close</button>
        ${live ? '<button class="btn btn-secondary" id="ad-edit">Edit</button>' : ''}
        ${live ? `<button class="btn btn-secondary" id="ad-void">Cancel contract</button>` : ''}
        ${c.has_invoice ? '<button class="btn btn-secondary" id="ad-pdf">Open invoice PDF</button>' : ''}
        ${live && !c.has_invoice ? '<button class="btn btn-primary" id="ad-invoice">Invoice this term</button>' : ''}
        ${canRenew ? '<button class="btn btn-primary" id="ad-renew">Renew</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#ad-close').onclick = close;
  $('#ad-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const again = async () => { close(); await reload(); openDetail(id); };

  if ($('#ad-edit')) $('#ad-edit').onclick = () => { close(); openEditor(c); };
  if ($('#ad-renew')) $('#ad-renew').onclick = () => openRenew(id);

  if ($('#ad-invoice')) {
    $('#ad-invoice').onclick = async () => {
      if (!confirm(`Raise and issue the invoice for ${rupees(c.amount_paise)}${Number(c.tax_rate_bps) ? ' + GST' : ''} to ${c.party_name}? It goes on their account straight away.`)) return;
      $('#ad-invoice').disabled = true;
      try {
        const out = await api('POST', `/amc/contracts/${encodeURIComponent(id)}/invoice`, {});
        toast(`Invoice ${out.invoice.doc_no} raised`, 'success');
        await again();
      } catch (err) { toast(err.message, 'error'); $('#ad-invoice').disabled = false; }
    };
  }

  if ($('#ad-pdf')) {
    $('#ad-pdf').onclick = async () => {
      try {
        const res = await fetch(`${API}/sales/documents/${encodeURIComponent(c.invoice_id)}/pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` } });
        if (!res.ok) throw new Error('Could not open the PDF');
        window.open(URL.createObjectURL(await res.blob()), '_blank');
      } catch (err) { toast(err.message, 'error'); }
    };
  }

  if ($('#ad-void')) {
    $('#ad-void').onclick = async () => {
      const reason = prompt('Why is this contract being cancelled? (optional)');
      if (reason === null) return;
      try {
        await api('POST', `/amc/contracts/${encodeURIComponent(id)}/cancel`, { reason });
        toast('Contract cancelled', 'success');
        await again();
      } catch (err) { toast(err.message, 'error'); }
    };
  }

  if ($('#ad-addvisit')) $('#ad-addvisit').onclick = () => openVisit(c, again);
  if ($('#ad-cover')) {
    $('#ad-cover').onclick = async () => {
      try {
        const out = await api('POST', `/amc/contracts/${encodeURIComponent(id)}/cover-devices`, {});
        toast(`${out.covered} device${out.covered === 1 ? '' : 's'} now covered`, 'success');
        await again();
      } catch (err) { toast(err.message, 'error'); }
    };
  }

  overlay.querySelectorAll('[data-delvisit]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Remove this visit from the count?')) return;
      try { await api('DELETE', `/amc/visits/${encodeURIComponent(btn.dataset.delvisit)}`); await again(); } catch (err) { toast(err.message, 'error'); }
    };
  });
}

function openVisit(c, done) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10050';
  const free = c.visits_included === null || c.visits_left > 0;
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:440px">
      <div class="modal-header"><span class="modal-title">Log a visit</span><button class="modal-close" id="lv-close">${ICONS.close}</button></div>
      <div class="modal-body">
        ${free ? '' : '<div class="at2-notice warn">The free visits are used up. This visit will be marked <b>chargeable</b>.</div>'}
        <div class="form-group"><label>Date</label><input type="date" id="lv-date" value="${ymd(new Date())}"></div>
        <div class="form-group"><label>Kind</label>
          <select id="lv-kind"><option value="scheduled">Scheduled check-up</option><option value="complaint">Complaint / fault</option></select></div>
        <div class="form-group"><label>Service ticket no. <small>(if there was one)</small></label><input type="text" id="lv-ticket" placeholder="e.g. NE-1234"></div>
        <div class="form-group"><label>Note</label><input type="text" id="lv-note" placeholder="What was done"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="lv-cancel">Cancel</button><button class="btn btn-primary" id="lv-save">Log visit</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#lv-close').onclick = close;
  $('#lv-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  $('#lv-save').onclick = async () => {
    $('#lv-save').disabled = true;
    try {
      const out = await api('POST', `/amc/contracts/${encodeURIComponent(c.id)}/visits`, {
        visit_date: $('#lv-date').value, kind: $('#lv-kind').value, ticket_ref: $('#lv-ticket').value.trim(), note: $('#lv-note').value.trim(),
      });
      toast(out.chargeable ? 'Visit logged — chargeable' : 'Visit logged', 'success');
      close();
      await done();
    } catch (err) { toast(err.message, 'error'); $('#lv-save').disabled = false; }
  };
}
