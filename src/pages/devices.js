// Sites & Devices — what is installed at each customer, and until when it is
// under warranty.
//
// The register exists so that whoever picks up a call already knows the DVR at
// that site, its disk, its last fault — and so the right part goes out on the
// first visit. A device is never deleted: a swapped one is marked *replaced* and
// points at what took its place, so a site's history stays readable.
import { toast, makeSearchableSelect } from '../utils.js';
import { ICONS } from '../icons.js';
import { openQuickParty } from './party-quick-add.js';

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
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (v) => { const [y, m, d] = String(v).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const day = (v) => v ? dayOf(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const CATEGORIES = {
  dvr: 'DVR', nvr: 'NVR', camera: 'Camera', switch: 'Switch', router: 'Router', hdd: 'Hard disk',
  ups: 'UPS', smps: 'Power supply', access: 'Access control', intercom: 'Intercom', other: 'Other',
};
const BRANDS = ['Hikvision', 'Dahua', 'CP Plus', 'Prama', 'Ezviz', 'Uniview', 'TP-Link', 'D-Link', 'Netgear', 'Cisco', 'Tenda', 'Seagate', 'WD', 'Toshiba', 'APC', 'Luminous'];

const WARRANTY_CHIP = {
  in_warranty: ['ok', 'In warranty'],
  ending: ['warn', 'Ending soon'],
  expired: ['danger', 'Expired'],
  none: ['muted', 'Not recorded'],
};
const STATUS_CHIP = {
  working: ['ok', 'Working'],
  faulty: ['danger', 'Faulty'],
  replaced: ['muted', 'Replaced'],
  removed: ['muted', 'Removed'],
};
const EVENT_LABEL = { installed: 'Installed', service: 'Service', repair: 'Repair', replaced: 'Replaced', note: 'Note' };

export function warrantyText(d) {
  if (!d.warranty_until) return 'no warranty date';
  if (d.warranty_state === 'expired') return `ended ${Math.abs(d.warranty_days)} days ago`;
  return `${d.warranty_days} days left`;
}
export const warrantyChip = (d) => WARRANTY_CHIP[d.warranty_state] || WARRANTY_CHIP.none;

const view = { q: '', warranty: '', status: '' };
let root = null;
let data = { devices: [], summary: {} };
let parties = [];

export async function renderDevicesTab(container) {
  root = container;
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    parties = await api('GET', '/parties?kind=all&limit=5000');
    await load();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint();
}

async function load() {
  const qs = new URLSearchParams();
  if (view.q) qs.set('q', view.q);
  if (view.warranty) qs.set('warranty', view.warranty);
  if (view.status) qs.set('status', view.status);
  data = await api('GET', `/devices?${qs}`);
}
const reload = async () => { await load(); paint(); };

function paint() {
  const s = data.summary || {};
  root.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1>Sites &amp; Devices</h1>
          <p>What is installed at each customer, and until when it is under warranty</p>
        </div>
        <div class="at2-headbtns">
          <button class="btn btn-primary" id="dv-new">${ICONS.plus}<span>Add device</span></button>
        </div>
      </div>

      <div class="at2-stats">
        <div class="at2-stat"><div class="k">Registered</div><div class="v">${Number(s.units || 0)}</div><div class="s">${Number(s.devices || 0)} entries · ${Number(s.customers || 0)} customers</div></div>
        <div class="at2-stat"><div class="k">In warranty</div><div class="v">${Number(s.in_warranty || 0)}</div><div class="s">${Number(s.under_amc || 0)} also under AMC</div></div>
        <div class="at2-stat ${s.warranty_ending ? 'warn' : 'muted'}"><div class="k">Warranty ending (60 days)</div><div class="v">${Number(s.warranty_ending || 0)}</div><div class="s">a good time to offer AMC</div></div>
        <div class="at2-stat ${s.faulty ? 'danger' : 'muted'}"><div class="k">Marked faulty</div><div class="v ${s.faulty ? 'bad' : ''}">${Number(s.faulty || 0)}</div><div class="s">waiting to be fixed</div></div>
      </div>

      <div class="at2-panel">
        <div class="at2-filters">
          <input type="search" id="dv-q" class="at2-search" placeholder="Customer, brand, model, serial or place" value="${esc(view.q)}">
          <select id="dv-warranty" style="padding:8px 10px;border-radius:9px">
            ${[['', 'Any warranty'], ['in_warranty', 'In warranty'], ['ending', 'Ending soon'], ['expired', 'Expired'], ['none', 'Not recorded']]
      .map(([v, l]) => `<option value="${v}"${view.warranty === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <select id="dv-status" style="padding:8px 10px;border-radius:9px">
            ${[['', 'Working & faulty'], ['faulty', 'Faulty only'], ['replaced', 'Replaced'], ['removed', 'Removed']]
      .map(([v, l]) => `<option value="${v}"${view.status === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="at2-body" id="dv-body"></div>
      </div>
    </div>`;

  root.querySelector('#dv-new').onclick = () => openEditor();
  const q = root.querySelector('#dv-q');
  let timer;
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => { view.q = q.value.trim(); await load(); paintBody(); }, 250); };
  root.querySelector('#dv-warranty').onchange = async (e) => { view.warranty = e.target.value; await load(); paintBody(); };
  root.querySelector('#dv-status').onchange = async (e) => { view.status = e.target.value; await load(); paintBody(); };
  paintBody();
}

function paintBody() {
  const body = root.querySelector('#dv-body');
  const rows = data.devices;
  if (!rows.length) {
    body.innerHTML = `<div class="empty" style="padding:38px;text-align:center;color:var(--text-dim)">
      ${view.q || view.warranty || view.status ? 'Nothing matches.' : 'No devices registered yet. Add the DVR at your best customer first — then the cameras on it.'}</div>`;
    return;
  }
  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Customer / site</th><th>Device</th><th>Serial</th><th>Where</th><th>Installed</th><th>Warranty</th><th>AMC</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(d => {
    const [wt, wl] = warrantyChip(d);
    const [st, sl] = STATUS_CHIP[d.status] || ['muted', d.status];
    return `
          <tr data-open="${esc(d.id)}">
            <td><b>${esc(d.party_name || '—')}</b><div style="font-size:0.74rem;color:var(--text-dim)">${esc(d.site_name || 'no site set')}</div></td>
            <td>${d.quantity > 1 ? `<b>${d.quantity} ×</b> ` : ''}<b>${esc([d.brand, d.model].filter(Boolean).join(' ') || d.category_label)}</b><div style="font-size:0.74rem;color:var(--text-dim)">${esc(d.category_label)}</div></td>
            <td><code style="font-size:0.72rem">${esc(d.serial_no || '—')}</code></td>
            <td style="font-size:0.82rem">${esc(d.location_note || '—')}</td>
            <td style="white-space:nowrap">${esc(day(d.installed_on))}</td>
            <td style="white-space:nowrap"><span class="at2-chip ${wt}">${wl}</span><div style="font-size:0.72rem;color:var(--text-dim)">${d.warranty_until ? `${esc(day(d.warranty_until))}` : ''}</div></td>
            <td>${d.amc_contract_no ? `<code style="font-size:0.72rem">${esc(d.amc_contract_no)}</code>` : '<span style="color:var(--text-dim)">—</span>'}</td>
            <td><span class="at2-chip ${st}">${sl}</span></td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>`;
  body.querySelectorAll('[data-open]').forEach(tr => { tr.onclick = () => openDetail(tr.dataset.open); });
}

// ── the editor ──────────────────────────────────────────────────────────
export function openEditor(existing = null, { partyId = null, onSaved = null } = {}) {
  const d = existing;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:760px">
      <div class="modal-header">
        <span class="modal-title">${d ? 'Edit device' : 'Add a device'}</span>
        <button class="modal-close" id="de-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <datalist id="de-brands">${BRANDS.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
        <div class="form-group"><label>Customer *</label>
          <div class="at2-select-row">
            <select id="de-party" ${d ? 'disabled' : ''}>
              <option value="">— Choose —</option>
              ${parties.map(p => `<option value="${esc(p.id)}"${(d?.party_id || partyId) === p.id ? ' selected' : ''}>${esc(p.display_name)}${p.phone ? ` · ${esc(p.phone)}` : ''}</option>`).join('')}
            </select>
            ${d ? '' : `<button type="button" class="at2-plus" id="de-newparty" title="Add a new customer">${ICONS.plus}<span>New</span></button>`}
          </div></div>
        <div class="form-group"><label>Site</label>
          <div class="at2-select-row"><select id="de-site"><option value="">— No site set —</option></select>
            <button type="button" class="at2-plus" id="de-newsite" title="Add a site for this customer">${ICONS.plus}<span>Site</span></button></div></div>

        <div class="at2-grid">
          <div class="form-group"><label>Kind</label>
            <select id="de-cat">${Object.entries(CATEGORIES).map(([k, l]) => `<option value="${k}"${(d?.category || 'dvr') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="form-group"><label>Brand</label><input type="text" id="de-brand" list="de-brands" value="${esc(d?.brand || '')}" placeholder="Hikvision" autocomplete="off"></div>
          <div class="form-group"><label>Model</label><input type="text" id="de-model" value="${esc(d?.model || '')}" placeholder="DS-7208HQHI-K1"></div>
        </div>
        <div class="at2-grid">
          <div class="form-group"><label>Serial no.</label><input type="text" id="de-serial" value="${esc(d?.serial_no || '')}"></div>
          <div class="form-group"><label>Quantity <small>(identical units)</small></label><input type="number" id="de-qty" min="1" max="500" step="1" value="${d?.quantity || 1}"></div>
          <div class="form-group"><label>Where it is</label><input type="text" id="de-loc" value="${esc(d?.location_note || '')}" placeholder="Front gate, reception…"></div>
        </div>
        <div class="at2-grid">
          <div class="form-group"><label>Installed on</label><input type="date" id="de-inst" value="${d?.installed_on || ymd(new Date())}"></div>
          <div class="form-group"><label>Warranty until
            <span style="float:right;font-weight:600"><a href="#" data-yrs="1">+1 yr</a> · <a href="#" data-yrs="2">+2 yr</a> · <a href="#" data-yrs="3">+3 yr</a></span></label>
            <input type="date" id="de-warr" value="${d?.warranty_until || ''}"></div>
          <div class="form-group"><label>Under AMC contract</label><select id="de-amc"><option value="">— Not covered —</option></select></div>
        </div>
        <div class="form-group"><label>Fitted under <small>(ticket or invoice no.)</small></label><input type="text" id="de-ref" value="${esc(d?.install_ref || '')}"></div>
        <div class="form-group"><label>Notes</label><textarea id="de-notes" rows="2">${esc(d?.notes || '')}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="de-cancel">Cancel</button>
        <button class="btn btn-primary" id="de-save">${d ? 'Save changes' : 'Add to register'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#de-close').onclick = close;
  $('#de-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  // A customer's sites and running contracts fill their own pickers.
  const loadFor = async (pid, keep = {}) => {
    const site = $('#de-site'); const amc = $('#de-amc');
    site.innerHTML = '<option value="">— No site set —</option>';
    amc.innerHTML = '<option value="">— Not covered —</option>';
    if (!pid) return;
    try {
      const [sites, contracts] = await Promise.all([
        api('GET', `/device-sites?party_id=${encodeURIComponent(pid)}`),
        api('GET', `/amc/contracts?party_id=${encodeURIComponent(pid)}`).catch(() => ({ contracts: [] })),
      ]);
      sites.forEach(s => site.appendChild(new Option(s.name, s.id)));
      contracts.contracts.filter(c => ['active', 'upcoming', 'expired'].includes(c.state) && !c.renewed_to_id)
        .forEach(c => amc.appendChild(new Option(`${c.contract_no} · ${c.title}`, c.id)));
      if (keep.site_id) site.value = keep.site_id;
      if (keep.amc_contract_id) amc.value = keep.amc_contract_id;
      if (!site.value && sites.length === 1) site.value = sites[0].id;
    } catch { /* the pickers stay empty; the rest of the form still works */ }
  };
  makeSearchableSelect($('#de-party'));
  loadFor(d?.party_id || partyId, d || {});
  $('#de-party').onchange = () => loadFor($('#de-party').value);

  if ($('#de-newparty')) {
    $('#de-newparty').onclick = () => openQuickParty({
      kind: 'customer',
      onCreated: (p) => {
        parties.push(p);
        $('#de-party').appendChild(new Option(`${p.display_name}${p.phone ? ` · ${p.phone}` : ''}`, p.id, true, true));
        $('#de-party').value = p.id;
        loadFor(p.id);
      },
    });
  }
  $('#de-newsite').onclick = async () => {
    const pid = $('#de-party').value;
    if (!pid) return toast('Choose the customer first', 'warning');
    const name = prompt('Name of the site (e.g. Main shop, Godown, Home)');
    if (!name || !name.trim()) return;
    const address = prompt('Address of the site (optional)') || '';
    try {
      const out = await api('POST', '/device-sites', { party_id: pid, name: name.trim(), address: address.trim() });
      $('#de-site').appendChild(new Option(out.site.name, out.site.id, true, true));
      $('#de-site').value = out.site.id;
    } catch (err) { toast(err.message, 'error'); }
  };
  overlay.querySelectorAll('[data-yrs]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const from = $('#de-inst').value ? dayOf($('#de-inst').value) : new Date();
      $('#de-warr').value = ymd(new Date(from.getFullYear() + Number(a.dataset.yrs), from.getMonth(), from.getDate()));
    };
  });

  $('#de-save').onclick = async () => {
    const payload = {
      party_id: $('#de-party').value,
      site_id: $('#de-site').value || null,
      category: $('#de-cat').value,
      brand: $('#de-brand').value.trim(),
      model: $('#de-model').value.trim(),
      serial_no: $('#de-serial').value.trim(),
      quantity: Number($('#de-qty').value) || 1,
      location_note: $('#de-loc').value.trim(),
      installed_on: $('#de-inst').value || null,
      warranty_until: $('#de-warr').value || null,
      amc_contract_id: $('#de-amc').value || null,
      install_ref: $('#de-ref').value.trim(),
      notes: $('#de-notes').value.trim(),
    };
    if (!payload.party_id) return toast('Choose the customer', 'warning');
    const btn = $('#de-save');
    btn.disabled = true;
    try {
      const saved = d ? await api('PATCH', `/devices/${encodeURIComponent(d.id)}`, payload) : await api('POST', '/devices', payload);
      toast(d ? 'Saved' : 'Added to the register', 'success');
      close();
      if (onSaved) await onSaved(saved); else await reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

// ── detail ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  let loaded;
  try { loaded = await api('GET', `/devices/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }
  const { device: d, events, replaced_by: replacedBy, replaces } = loaded;
  const [wt, wl] = warrantyChip(d);
  const [st, sl] = STATUS_CHIP[d.status] || ['muted', d.status];
  const open = ['working', 'faulty'].includes(d.status);
  const name = [d.brand, d.model].filter(Boolean).join(' ') || d.category_label;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:740px">
      <div class="modal-header">
        <span class="modal-title">${d.quantity > 1 ? `${d.quantity} × ` : ''}${esc(name)} <span class="at2-chip ${st}">${esc(sl)}</span></span>
        <button class="modal-close" id="dd-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <div style="font-weight:800;font-size:1.02rem">${esc(d.party_name || '—')}</div>
            <div style="font-size:0.82rem;color:var(--text-dim)">${esc(d.party_phone || '')}</div>
            <div style="font-size:0.84rem;margin-top:6px">${esc(d.site_name || 'No site set')}${d.location_note ? ` · ${esc(d.location_note)}` : ''}</div>
            <div style="font-size:0.8rem;color:var(--text-dim);margin-top:2px">${esc(d.category_label)}${d.serial_no ? ` · Serial <code>${esc(d.serial_no)}</code>` : ''}</div>
          </div>
          <div style="text-align:right">
            <span class="at2-chip ${wt}">${wl}</span>
            <div style="font-size:0.84rem;margin-top:6px">${d.warranty_until ? `Until ${esc(day(d.warranty_until))}` : 'No warranty date'}</div>
            <div style="font-size:0.76rem;color:var(--text-dim)">${esc(warrantyText(d))}</div>
            <div style="font-size:0.8rem;margin-top:6px">Installed ${esc(day(d.installed_on))}</div>
          </div>
        </div>
        ${d.amc_contract_no ? `<p class="at2-note">Covered by AMC <b>${esc(d.amc_contract_no)}</b>${d.amc_end_date ? ` (ends ${esc(day(d.amc_end_date))})` : ''}.</p>` : ''}
        ${replacedBy ? `<div class="at2-notice">Replaced by <b>${esc([replacedBy.brand, replacedBy.model].filter(Boolean).join(' ') || 'a newer device')}</b>${replacedBy.serial_no ? ` (serial ${esc(replacedBy.serial_no)})` : ''}.</div>` : ''}
        ${replaces ? `<p class="at2-note">This took the place of <b>${esc([replaces.brand, replaces.model].filter(Boolean).join(' ') || 'an earlier device')}</b>${replaces.serial_no ? ` (serial ${esc(replaces.serial_no)})` : ''}.</p>` : ''}
        ${d.notes ? `<p class="at2-note">${esc(d.notes)}</p>` : ''}

        <div class="card" style="margin-top:6px">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <span class="card-title">History</span>
            ${open ? '<button class="btn btn-secondary" id="dd-addevent" style="padding:6px 10px">Add to history</button>' : ''}
          </div>
          <div class="table-wrap"><table class="at2-tbl"><tbody>
            ${events.map(e => `<tr>
              <td style="white-space:nowrap">${esc(day(e.event_date))}</td>
              <td><span class="at2-chip ${e.kind === 'repair' ? 'warn' : e.kind === 'replaced' ? 'danger' : 'muted'}">${esc(EVENT_LABEL[e.kind] || e.kind)}</span></td>
              <td>${esc(e.note || '')}${e.ticket_ref ? ` <code style="font-size:0.72rem">${esc(e.ticket_ref)}</code>` : ''}</td>
            </tr>`).join('') || '<tr><td style="color:var(--text-dim)">Nothing recorded yet.</td></tr>'}
          </tbody></table></div>
        </div>
      </div>
      <div class="modal-footer" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="dd-cancel">Close</button>
        ${open ? '<button class="btn btn-secondary" id="dd-edit">Edit</button>' : ''}
        ${open ? `<button class="btn btn-secondary" id="dd-flag">${d.status === 'faulty' ? 'Mark working' : 'Mark faulty'}</button>` : ''}
        ${d.status === 'removed' ? '<button class="btn btn-secondary" id="dd-restore">Put back</button>' : ''}
        ${open ? '<button class="btn btn-secondary" id="dd-remove">Taken away</button>' : ''}
        ${open ? '<button class="btn btn-primary" id="dd-replace">Replace</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#dd-close').onclick = close;
  $('#dd-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const again = async () => { close(); await reload(); openDetail(id); };
  const patch = async (payload, msg) => {
    try { await api('PATCH', `/devices/${encodeURIComponent(id)}`, payload); toast(msg, 'success'); await again(); } catch (err) { toast(err.message, 'error'); }
  };

  if ($('#dd-edit')) $('#dd-edit').onclick = () => { close(); openEditor(d); };
  if ($('#dd-flag')) $('#dd-flag').onclick = () => patch({ status: d.status === 'faulty' ? 'working' : 'faulty' }, d.status === 'faulty' ? 'Back to working' : 'Marked faulty');
  if ($('#dd-restore')) $('#dd-restore').onclick = () => patch({ status: 'working' }, 'Put back');
  if ($('#dd-remove')) $('#dd-remove').onclick = () => { if (confirm('Mark this device as taken away? Its history stays.')) patch({ status: 'removed' }, 'Marked as taken away'); };
  if ($('#dd-addevent')) $('#dd-addevent').onclick = () => openEvent(id, again);
  if ($('#dd-replace')) $('#dd-replace').onclick = () => openReplace(d, () => { close(); reload(); });
}

function openEvent(id, done) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10050';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:440px">
      <div class="modal-header"><span class="modal-title">Add to history</span><button class="modal-close" id="ev-close">${ICONS.close}</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Date</label><input type="date" id="ev-date" value="${ymd(new Date())}"></div>
        <div class="form-group"><label>What happened</label>
          <select id="ev-kind"><option value="service">Serviced</option><option value="repair">Repaired</option><option value="note">Note</option></select></div>
        <div class="form-group"><label>Note</label><input type="text" id="ev-note" placeholder="Cleaned lens, reset password, changed adapter…"></div>
        <div class="form-group"><label>Ticket no. <small>(optional)</small></label><input type="text" id="ev-ticket"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="ev-cancel">Cancel</button><button class="btn btn-primary" id="ev-save">Add</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#ev-close').onclick = close;
  $('#ev-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  $('#ev-save').onclick = async () => {
    $('#ev-save').disabled = true;
    try {
      await api('POST', `/devices/${encodeURIComponent(id)}/events`, { event_date: $('#ev-date').value, kind: $('#ev-kind').value, note: $('#ev-note').value.trim(), ticket_ref: $('#ev-ticket').value.trim() });
      close();
      await done();
    } catch (err) { toast(err.message, 'error'); $('#ev-save').disabled = false; }
  };
}

function openReplace(d, done) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10050';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:520px">
      <div class="modal-header"><span class="modal-title">Replace ${esc([d.brand, d.model].filter(Boolean).join(' ') || d.category_label)}</span><button class="modal-close" id="rp-close">${ICONS.close}</button></div>
      <div class="modal-body">
        <p style="margin:0 0 12px;color:var(--text-dim);font-size:0.84rem">The new device takes its place — same customer, site, spot and contract. The old one stays on record as replaced.</p>
        <datalist id="rp-brands">${BRANDS.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
        <div class="at2-grid">
          <div class="form-group"><label>New brand</label><input type="text" id="rp-brand" list="rp-brands" value="${esc(d.brand || '')}" autocomplete="off"></div>
          <div class="form-group"><label>New model</label><input type="text" id="rp-model"></div>
        </div>
        <div class="at2-grid">
          <div class="form-group"><label>Serial no.</label><input type="text" id="rp-serial"></div>
          <div class="form-group"><label>Fitted on</label><input type="date" id="rp-inst" value="${ymd(new Date())}"></div>
          <div class="form-group"><label>Warranty until</label><input type="date" id="rp-warr"></div>
        </div>
        <div class="form-group"><label>Why <small>(optional)</small></label><input type="text" id="rp-reason" placeholder="Burnt in a power surge"></div>
        <div class="form-group"><label>Ticket no. <small>(optional)</small></label><input type="text" id="rp-ticket"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="rp-cancel">Cancel</button><button class="btn btn-primary" id="rp-go">Replace</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#rp-close').onclick = close;
  $('#rp-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  $('#rp-go').onclick = async () => {
    $('#rp-go').disabled = true;
    try {
      await api('POST', `/devices/${encodeURIComponent(d.id)}/replace`, {
        brand: $('#rp-brand').value.trim(), model: $('#rp-model').value.trim(), serial_no: $('#rp-serial').value.trim(),
        installed_on: $('#rp-inst').value || null, warranty_until: $('#rp-warr').value || null,
        reason: $('#rp-reason').value.trim(), ticket_ref: $('#rp-ticket').value.trim(),
      });
      toast('Replaced — the new device is on the register', 'success');
      close();
      await done();
    } catch (err) { toast(err.message, 'error'); $('#rp-go').disabled = false; }
  };
}
