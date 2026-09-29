// Stock — what is on the shelf, what is in the vans, what is reserved, and
// what every device's history is.
//
// The numbers here are read from the movement ledger, not from a separate
// count, so the screen cannot show a figure the accounts disagree with. A
// discrepancy, if one ever appeared, is shown as a discrepancy rather than
// quietly reconciled.
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
  { key: 'onhand', label: 'On Hand' },
  { key: 'locations', label: 'Locations & Vans' },
  { key: 'serials', label: 'Serial Numbers' },
  { key: 'counts', label: 'Stock Count' },
];

const SERIAL_CHIP = {
  in_stock: ['ok', 'In stock'],
  with_technician: ['warn', 'With technician'],
  installed: ['muted', 'Installed'],
  returned: ['muted', 'Returned'],
  scrapped: ['danger', 'Scrapped'],
  customer_owned: ['warn', "Customer's own"],
};

const state = { tab: 'onhand', q: '', locationId: '' };
let valuation = null;
let locations = [];
let locationItems = [];
let serials = [];
let items = [];
let canSeeCost = true;

export async function renderStockTab(container) {
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    locations = await api('GET', '/stock/locations');
    items = await api('GET', '/inventory/items?all=1').catch(() => []);
    state.locationId = state.locationId || (locations.find(l => l.is_default)?.id || '');
    await loadTab();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

async function loadTab() {
  if (state.tab === 'onhand') {
    try {
      valuation = await api('GET', '/stock/valuation');
      canSeeCost = true;
    } catch {
      // A storekeeper without cost rights still sees quantities.
      canSeeCost = false;
      valuation = { items: items.map(i => ({ id: i.id, name: i.name, sku: i.sku, unit: i.base_unit || i.unit, quantity: Number(i.quantity), value_paise: 0, avg_cost_paise: 0, quantity_matches: true })), total_value_paise: 0, discrepancies: [] };
    }
  }
  if (state.tab === 'locations' && state.locationId) {
    locationItems = await api('GET', `/stock/locations/${state.locationId}/items`);
  }
  if (state.tab === 'serials') {
    serials = await api('GET', `/stock/serials?q=${encodeURIComponent(state.q)}&limit=300`);
  }
}

function paint(container) {
  container.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1>Stock</h1>
          <p>On the shelf, in the vans, reserved, and every device we can point at</p>
        </div>
        <div class="at2-headbtns">
          <button class="btn btn-secondary" id="st-template">${ICONS.download}<span>Template</span></button>
          <button class="btn btn-secondary" id="st-import">${ICONS.upload || ICONS.plus}<span>Import Excel</span></button>
          <button class="btn btn-secondary" id="st-export">${ICONS.download}<span>Export</span></button>
          <button class="btn btn-secondary" id="st-adjust">${ICONS.edit}<span>Adjust</span></button>
          <button class="btn btn-primary" id="st-transfer">${ICONS['arrow-right'] || ICONS.plus}<span>Transfer</span></button>
        </div>
      </div>

      ${kpiRow()}

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="at2-panel">
        <div class="at2-filters">
          ${state.tab === 'locations' ? `
            <select id="st-location" style="padding:8px 10px;border-radius:9px;min-width:200px">
              ${locations.map(l => `<option value="${esc(l.id)}"${state.locationId === l.id ? ' selected' : ''}>${esc(l.name)}${l.employee_name ? ` · ${esc(l.employee_name)}` : ''}${l.owned ? '' : ' (not ours)'}</option>`).join('')}
            </select>
            <button class="btn btn-secondary btn-sm" id="st-new-location">${ICONS.plus}<span>New location</span></button>` : ''}
          ${['onhand', 'serials'].includes(state.tab) ? `<input type="search" id="st-q" class="at2-search" placeholder="${state.tab === 'serials' ? 'Serial number' : 'Item name or SKU'}" value="${esc(state.q)}">` : ''}
          <span class="at2-scope">${esc(scopeLine())}</span>
        </div>
        <div class="at2-body" id="st-body"></div>
      </div>
    </div>`;

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = async () => { state.tab = btn.dataset.tab; await loadTab(); paint(container); };
  });

  const search = container.querySelector('#st-q');
  if (search) {
    let timer;
    search.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        state.q = search.value.trim();
        if (state.tab === 'serials') await loadTab();
        paintBody(container);
      }, 250);
    };
  }
  const locationPicker = container.querySelector('#st-location');
  if (locationPicker) {
    locationPicker.onchange = async () => { state.locationId = locationPicker.value; await loadTab(); paintBody(container); };
  }
  const newLocation = container.querySelector('#st-new-location');
  if (newLocation) newLocation.onclick = () => openLocationModal(container);

  container.querySelector('#st-transfer').onclick = () => openTransferModal(container);
  container.querySelector('#st-adjust').onclick = () => openAdjustModal(container);
  container.querySelector('#st-export').onclick = () => exportCurrent();
  container.querySelector('#st-template').onclick = () => downloadTemplate();
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.xlsx,.xls,.csv';
  importInput.style.display = 'none';
  container.appendChild(importInput);
  container.querySelector('#st-import').onclick = () => { importInput.value = ''; importInput.click(); };
  importInput.onchange = () => { if (importInput.files[0]) openImportModal(container, importInput.files[0]); };

  paintBody(container);
}

function scopeLine() {
  if (state.tab === 'onhand') return canSeeCost ? 'Valued at moving average cost, from the stock ledger' : 'Quantities from the stock ledger';
  if (state.tab === 'locations') return 'Held at this location, from the movements against it';
  if (state.tab === 'serials') return 'Every device we have received or taken in';
  return 'Count what is there, then approve the difference';
}

function kpiRow() {
  const kpi = (icon, label, value, tone) => `
    <div class="at2-kpi">
      <span class="at2-kpi-ico tone-${tone}">${icon || ''}</span>
      <div><div class="at2-kpi-label">${esc(label)}</div><div class="at2-kpi-value tone-${tone}">${value}</div></div>
    </div>`;

  const withStock = (valuation?.items || []).filter(i => i.quantity > 0).length;
  const low = items.filter(i => Number(i.min_stock) > 0 && Number(i.quantity) <= Number(i.min_stock)).length;
  const vans = locations.filter(l => l.kind === 'van').length;
  const discrepancies = valuation?.discrepancies?.length || 0;

  return `<div class="at2-kpis">
    ${kpi(ICONS.box, 'Items in stock', String(withStock), 'muted')}
    ${canSeeCost ? kpi(ICONS.wallet || ICONS.receipt, 'Stock value', rupees(valuation?.total_value_paise || 0), 'green') : ''}
    ${kpi(ICONS.alert, 'Low stock', String(low), low ? 'amber' : 'green')}
    ${kpi(ICONS.user, 'Technician vans', String(vans), 'muted')}
    ${discrepancies ? kpi(ICONS.alert, 'Ledger mismatch', String(discrepancies), 'red') : ''}
  </div>`;
}

function paintBody(container) {
  const body = container.querySelector('#st-body');
  if (!body) return;
  if (state.tab === 'onhand') return paintOnHand(container, body);
  if (state.tab === 'locations') return paintLocation(container, body);
  if (state.tab === 'serials') return paintSerials(body);
  if (state.tab === 'counts') return paintCount(container, body);
}

function paintOnHand(container, body) {
  const q = state.q.toLowerCase();
  const rows = (valuation?.items || [])
    .filter(i => !q || i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q));

  if (!rows.length) {
    body.innerHTML = '<div class="at2-empty">Nothing in stock yet. Receive a delivery to put something on the shelf.</div>';
    return;
  }

  body.innerHTML = `
    ${valuation.discrepancies?.length ? `
      <div class="at2-notice warn">
        <b>${valuation.discrepancies.length} item(s) have a stock count that their movement history does not explain.</b>
        Stock that was on the shelf before accounting started shows this until it is brought into the books —
        Accounts → <b>Data Migration → Stock on the Shelf</b>. Anything else is worth counting and correcting with Adjust.
      </div>` : ''}
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Item</th><th>SKU</th><th style="text-align:right">On hand</th>
        ${canSeeCost ? '<th style="text-align:right">Avg cost</th><th style="text-align:right">Value</th>' : ''}
        <th></th></tr></thead>
      <tbody>
        ${rows.map(i => `
          <tr>
            <td><b>${esc(i.name)}</b>${i.quantity_matches === false ? ' <span class="at2-chip danger">ledger mismatch</span>' : ''}</td>
            <td>${esc(i.sku || '—')}</td>
            <td style="text-align:right"><b>${i.quantity}</b> <small style="color:var(--text-dim)">${esc(i.unit || '')}</small></td>
            ${canSeeCost ? `<td style="text-align:right">${rupees(i.avg_cost_paise)}</td>
            <td style="text-align:right"><b>${rupees(i.value_paise)}</b></td>` : ''}
            <td><button class="at2-photo" data-avail="${esc(i.id)}" title="Availability">${ICONS.eye || ICONS.search}</button></td>
          </tr>`).join('')}
        ${canSeeCost ? `
        <tr style="border-top:2px solid var(--border)">
          <td colspan="4" style="text-align:right"><b>Total</b></td>
          <td style="text-align:right"><b style="color:var(--primary)">${rupees(valuation.total_value_paise)}</b></td><td></td>
        </tr>` : ''}
      </tbody>
    </table></div>
    <p class="at2-note">${esc(valuation.method ? `Valuation method: ${valuation.method}. ` : '')}Reservations do not reduce this — they reduce what is available to promise.</p>`;

  body.querySelectorAll('[data-avail]').forEach(btn => {
    btn.onclick = async () => {
      try {
        const a = await api('GET', `/stock/availability/${btn.dataset.avail}`);
        toast(`${a.name}: ${a.on_hand} on hand · ${a.reserved} reserved · ${a.available} available`, 'info', 6000);
      } catch (err) { toast(err.message, 'error'); }
    };
  });
}

function paintLocation(container, body) {
  const location = locations.find(l => l.id === state.locationId);
  if (!locationItems.length) {
    body.innerHTML = `<div class="at2-empty">${esc(location?.name || 'This location')} is holding nothing right now.</div>`;
    return;
  }
  const total = locationItems.reduce((s, r) => s + Number(r.value_paise), 0);

  body.innerHTML = `
    ${location && !location.owned ? '<p class="at2-note" style="margin-top:0">These belong to customers. They are tracked here and counted in no valuation of ours.</p>' : ''}
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Item</th><th style="text-align:right">Held</th>${canSeeCost && location?.owned ? '<th style="text-align:right">Value</th>' : ''}</tr></thead>
      <tbody>
        ${locationItems.map(r => `
          <tr>
            <td><b>${esc(r.name)}</b>${r.sku ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(r.sku)}</div>` : ''}</td>
            <td style="text-align:right"><b>${r.held_qty}</b> <small style="color:var(--text-dim)">${esc(r.base_unit || r.unit || '')}</small></td>
            ${canSeeCost && location?.owned ? `<td style="text-align:right">${rupees(r.value_paise)}</td>` : ''}
          </tr>`).join('')}
        ${canSeeCost && location?.owned ? `
        <tr style="border-top:2px solid var(--border)"><td colspan="2" style="text-align:right"><b>Total</b></td>
          <td style="text-align:right"><b style="color:var(--primary)">${rupees(total)}</b></td></tr>` : ''}
      </tbody>
    </table></div>
    <p class="at2-note">Moving stock to a van is not a sale and not an expense — the business owns it either way, and it comes back or gets used on a job.</p>`;
}

function paintSerials(body) {
  if (!serials.length) {
    body.innerHTML = '<div class="at2-empty">No devices on record yet. Serial numbers are captured when goods are received.</div>';
    return;
  }
  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Serial</th><th>Item</th><th>Status</th><th>Where</th><th>From / for</th><th>Warranty</th></tr></thead>
      <tbody>
        ${serials.map(s => {
    const [tone, label] = SERIAL_CHIP[s.status] || ['muted', s.status];
    const expired = s.warranty_until && new Date(s.warranty_until) < new Date();
    return `
          <tr>
            <td><code style="font-size:0.74rem">${esc(s.serial_no)}</code></td>
            <td>${esc(s.item_name)}</td>
            <td><span class="at2-chip ${tone}">${esc(label)}</span>${Number(s.owned) ? '' : ' <span class="at2-chip muted">not ours</span>'}</td>
            <td>${esc(s.location_name || '—')}</td>
            <td>${esc(s.customer_name || s.supplier_name || '—')}</td>
            <td>${s.warranty_until
      ? `<span style="color:${expired ? 'var(--text-dim)' : 'var(--primary)'}">${esc(day(s.warranty_until))}${expired ? ' (over)' : ''}</span>`
      : '—'}</td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>
    <p class="at2-note">A device left by a customer for repair is on this list too, marked "not ours" — tracked, never valued as stock.</p>`;
}

function paintCount(container, body) {
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Count what is on the shelf</span></div>
      <div style="padding:14px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px">
          <div class="form-group" style="margin:0"><label>Date</label><input type="date" id="ct-date" value="${ymd(new Date())}"></div>
          <div class="form-group" style="margin:0"><label>Location</label>
            <select id="ct-location">
              ${locations.filter(l => l.owned).map(l => `<option value="${esc(l.id)}"${l.is_default ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}
            </select></div>
          <div class="form-group" style="margin:0"><label>Note</label><input type="text" id="ct-note" placeholder="e.g. month-end count"></div>
        </div>

        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Item</th><th style="text-align:right">System says</th><th>Counted</th><th>Difference</th></tr></thead>
          <tbody id="ct-lines">
            ${(valuation?.items || []).filter(i => i.quantity !== 0).map(i => `
              <tr data-item="${esc(i.id)}">
                <td>${esc(i.name)}</td>
                <td style="text-align:right" class="ct-expected" data-qty="${i.quantity}">${i.quantity}</td>
                <td><input type="number" class="ct-counted" step="0.001" min="0" value="${i.quantity}" style="width:100px"></td>
                <td class="ct-diff" style="color:var(--text-dim)">—</td>
              </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:16px">Nothing in stock to count</td></tr>'}
          </tbody>
        </table></div>

        <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-primary" id="ct-save">Save count</button>
          <p class="at2-note" style="margin:0;flex:1;min-width:240px">
            Saving records what was found. Nothing moves until the count is approved, and the difference is posted to
            shrinkage so it appears in the accounts rather than quietly changing a number.
          </p>
        </div>
      </div>
    </div>`;

  const recalc = () => {
    body.querySelectorAll('[data-item]').forEach(tr => {
      const expected = Number(tr.querySelector('.ct-expected').dataset.qty);
      const counted = Number(tr.querySelector('.ct-counted').value);
      const diff = Math.round((counted - expected) * 1000) / 1000;
      const cell = tr.querySelector('.ct-diff');
      cell.textContent = diff === 0 ? '—' : (diff > 0 ? `+${diff}` : String(diff));
      cell.style.color = diff === 0 ? 'var(--text-dim)' : diff > 0 ? 'var(--primary)' : 'var(--danger)';
    });
  };
  body.querySelectorAll('.ct-counted').forEach(el => { el.oninput = recalc; });

  const save = body.querySelector('#ct-save');
  if (save) {
    save.onclick = async () => {
      const lines = [...body.querySelectorAll('[data-item]')].map(tr => ({
        item_id: tr.dataset.item,
        counted_qty: Number(tr.querySelector('.ct-counted').value) || 0,
      }));
      if (!lines.length) return toast('Nothing to count', 'warning');

      save.disabled = true;
      try {
        const out = await api('POST', '/stock/counts', {
          count_date: body.querySelector('#ct-date').value,
          location_id: body.querySelector('#ct-location').value,
          note: body.querySelector('#ct-note').value.trim(),
          lines,
        });
        const differences = out.lines.filter(l => Number(l.difference_qty) !== 0);
        if (!differences.length) {
          toast('Count saved — everything matched', 'success');
        } else if (confirm(`${differences.length} item(s) differ from the system.\n\nApprove the count and post the difference to shrinkage?`)) {
          await api('POST', `/stock/counts/${out.count.id}/approve`);
          toast('Count approved and posted', 'success');
        } else {
          toast('Count saved, not approved — stock is unchanged', 'info');
        }
        await loadTab();
        paint(container);
      } catch (err) {
        toast(err.message, 'error');
        save.disabled = false;
      }
    };
  }
}

// ── modals ──────────────────────────────────────────────────────────────
function openTransferModal(container) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const owned = locations.filter(l => l.owned);

  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">Transfer stock</span>
        <button class="modal-close" id="tr-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label>From</label>
            <select id="tr-from">${owned.map(l => `<option value="${esc(l.id)}"${l.is_default ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
          <div class="form-group"><label>To</label>
            <select id="tr-to">${owned.map(l => `<option value="${esc(l.id)}"${l.kind === 'van' ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
        </div>

        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Item</th><th>Quantity</th><th></th></tr></thead>
          <tbody id="tr-lines">
            <tr class="tr-line">
              <td><select class="tr-item"><option value="">— Choose —</option>${items.map(i => `<option value="${esc(i.id)}">${esc(i.name)} (${Number(i.quantity)} ${esc(i.base_unit || i.unit || '')})</option>`).join('')}</select></td>
              <td><input type="number" class="tr-qty" step="0.001" min="0" style="width:100px"></td>
              <td><button class="at2-photo tr-del" title="Remove">${ICONS.close}</button></td>
            </tr>
          </tbody>
        </table></div>
        <button class="btn btn-secondary" id="tr-add" style="margin-top:8px">${ICONS.plus}<span>Add item</span></button>

        <div class="form-group" style="margin-top:12px"><label>Note</label><input type="text" id="tr-note" placeholder="e.g. loading the van for tomorrow"></div>
        <p class="at2-note">A transfer is not a sale and not an expense — it records where the goods are, nothing more.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="tr-cancel">Cancel</button>
        <button class="btn btn-primary" id="tr-save">Transfer</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#tr-close').onclick = close;
  $('#tr-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const wire = () => {
    overlay.querySelectorAll('.tr-del').forEach(btn => {
      btn.onclick = () => {
        if (overlay.querySelectorAll('.tr-line').length <= 1) return;
        btn.closest('.tr-line').remove();
      };
    });
  };
  wire();
  $('#tr-add').onclick = () => {
    const first = overlay.querySelector('.tr-line');
    const clone = first.cloneNode(true);
    clone.querySelector('.tr-item').value = '';
    clone.querySelector('.tr-qty').value = '';
    $('#tr-lines').appendChild(clone);
    wire();
  };

  $('#tr-save').onclick = async () => {
    const lines = [...overlay.querySelectorAll('.tr-line')].map(tr => ({
      item_id: tr.querySelector('.tr-item').value,
      quantity: Number(tr.querySelector('.tr-qty').value) || 0,
    })).filter(l => l.item_id && l.quantity > 0);

    if (!lines.length) return toast('Choose an item and a quantity', 'warning');
    if ($('#tr-from').value === $('#tr-to').value) return toast('Pick two different locations', 'warning');

    const btn = $('#tr-save');
    btn.disabled = true;
    try {
      const to = locations.find(l => l.id === $('#tr-to').value);
      await api('POST', '/stock/transfers', {
        from_location_id: $('#tr-from').value,
        to_location_id: $('#tr-to').value,
        employee_id: to?.employee_id || null,
        note: $('#tr-note').value.trim(),
        lines,
      });
      toast('Transferred', 'success');
      close();
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

function openAdjustModal(container) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:480px">
      <div class="modal-header">
        <span class="modal-title">Adjust stock</span>
        <button class="modal-close" id="ad-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Item</label>
          <select id="ad-item"><option value="">— Choose —</option>
            ${items.map(i => `<option value="${esc(i.id)}">${esc(i.name)} (${Number(i.quantity)} ${esc(i.base_unit || i.unit || '')})</option>`).join('')}
          </select></div>
        <div class="form-group"><label>What happened</label>
          <select id="ad-type">
            <option value="adjust_in">Found more than the system says</option>
            <option value="adjust_out">Less than the system says</option>
            <option value="damage">Damaged / written off</option>
          </select></div>
        <div class="form-group"><label>Quantity</label><input type="number" id="ad-qty" step="0.001" min="0"></div>
        <div class="form-group"><label>Location</label>
          <select id="ad-location">${locations.filter(l => l.owned).map(l => `<option value="${esc(l.id)}"${l.is_default ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Reason *</label><input type="text" id="ad-reason" placeholder="Required — this is kept in the audit trail"></div>
        <p class="at2-note">An adjustment changes what the books say the business owns, so it is recorded with who made it and why.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ad-cancel">Cancel</button>
        <button class="btn btn-primary" id="ad-save">Record adjustment</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#ad-close').onclick = close;
  $('#ad-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('#ad-save').onclick = async () => {
    const body = {
      item_id: $('#ad-item').value,
      type: $('#ad-type').value,
      quantity: Number($('#ad-qty').value) || 0,
      location_id: $('#ad-location').value,
      reason: $('#ad-reason').value.trim(),
    };
    if (!body.item_id) return toast('Choose the item', 'warning');
    if (!(body.quantity > 0)) return toast('Enter the quantity', 'warning');
    if (!body.reason) return toast('A reason is required', 'warning');

    const btn = $('#ad-save');
    btn.disabled = true;
    try {
      await api('POST', '/stock/adjustments', body);
      toast('Adjustment recorded', 'success');
      close();
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

// ── Excel import ───────────────────────────────────────────────────────
// The sheet is read here, in the browser, and sent as plain rows. The server
// checks it — the same check for the preview and for the real import — so
// what the screen shows is what would be saved.
let xlsxLoader = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoader) return xlsxLoader;
  xlsxLoader = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    el.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('Excel reader did not load')));
    el.onerror = () => { xlsxLoader = null; reject(new Error('Could not load the Excel reader — check the internet connection, or save the sheet as CSV')); };
    document.head.appendChild(el);
  });
  return xlsxLoader;
}

function parseCSV(textValue) {
  const rows = [];
  let cur = '', row = [], quoted = false;
  for (let i = 0; i < textValue.length; i += 1) {
    const c = textValue[i];
    if (quoted) {
      if (c === '"' && textValue[i + 1] === '"') { cur += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); cur = ''; row = []; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c ?? '').trim() !== ''));
}

async function readSheet(file) {
  if (/\.csv$/i.test(file.name)) return parseCSV((await file.text()).replace(/^﻿/, ''));
  const XLSX = await loadXLSX();
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = book.SheetNames.find(n => n.trim().toLowerCase() === 'items') || book.SheetNames[0];
  return XLSX.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
}

const GUIDE = [
  ['Column', 'Needed?', 'What to write'],
  ['Item Name', 'Yes', 'The name as it should print on a bill.'],
  ['SKU', 'No', 'Your own code. Must be unique. If a SKU already exists, that item is updated instead of a new one being made.'],
  ['Category', 'No', 'Any word — Cameras, Cables, Accessories.'],
  ['HSN/SAC', 'No', 'Tax code, 4 to 8 digits. Prints on GST bills.'],
  ['Unit', 'No', 'pcs, m, roll, box, set. Left empty = pcs.'],
  ['Purchase Rate', 'Yes', 'What one unit costs you, in rupees, without GST. Numbers only — no ₹ sign.'],
  ['Selling Rate', 'Yes', 'What you charge for one unit, in rupees, without GST.'],
  ['GST %', 'No', '0, 5, 12, 18 or 28. Left empty = 18.'],
  ['Opening Qty', 'No', 'How many you have right now. Up to 3 decimals (90.5 metres). Only for items that have no stock yet.'],
  ['Opening Rate', 'No', 'Cost of one unit of the stock you have. Left empty = Purchase Rate.'],
  ['Min Stock', 'No', 'You get a low-stock warning below this number.'],
  ['Location', 'No', 'Where it is kept — must already exist under Locations & Vans. Left empty = Main Store.'],
  ['Brand / Model', 'No', 'Free text.'],
  ['Warranty (months)', 'No', 'A whole number, like 12 or 24.'],
  ['Track Serial', 'No', 'Y if every piece has its own serial number (cameras, DVRs). Otherwise N or empty.'],
  ['Serial Numbers', 'No', 'Only when Track Serial is Y. Separate with commas. The count must equal Opening Qty.'],
  [],
  ['Rules'],
  ['Keep the first row (the headings) exactly as it is. Delete the three sample rows before you add your own.'],
  ['One row is one item. Nothing is saved until every row is correct — you will see the problems first.'],
  ['Opening Qty is only for items that have no stock yet. To change stock later, use Adjust or a Stock Count.'],
];

async function downloadTemplate() {
  try {
    const t = await api('GET', '/stock/import/template');
    let XLSX = null;
    // A .csv template still works if the Excel writer cannot be fetched.
    try { XLSX = await loadXLSX(); } catch { XLSX = null; }

    if (XLSX) {
      const book = XLSX.utils.book_new();
      const items = XLSX.utils.aoa_to_sheet([t.columns, ...t.sample_rows]);
      items['!cols'] = t.columns.map((c, i) => ({ wch: i === 0 ? 30 : i === t.columns.length - 1 ? 40 : Math.max(12, c.length + 2) }));
      const guide = XLSX.utils.aoa_to_sheet(GUIDE);
      guide['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 100 }];
      XLSX.utils.book_append_sheet(book, items, 'Items');
      XLSX.utils.book_append_sheet(book, guide, 'How to fill');
      XLSX.writeFile(book, 'stock-import-template.xlsx');
    } else {
      const csv = [t.columns, ...t.sample_rows]
        .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'stock-import-template.csv';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }
    toast('Template downloaded — delete the 3 sample rows, then add your items', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openImportModal(container, file) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:980px;width:96vw">
      <div class="modal-header">
        <span class="modal-title">Import stock — ${esc(file.name)}</span>
        <button class="modal-close" id="im-close">${ICONS.close}</button>
      </div>
      <div class="modal-body" id="im-body"><div class="loading-screen"><div class="spinner"></div></div></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="im-cancel">Close</button>
        <button class="btn btn-primary" id="im-go" disabled>Import</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#im-close').onclick = close;
  $('#im-cancel').onclick = close;

  const body = $('#im-body');
  const go = $('#im-go');
  let table;
  let check;
  try {
    table = await readSheet(file);
    check = await api('POST', '/stock/import', { rows: table, dry_run: true, file_name: file.name });
  } catch (err) {
    body.innerHTML = `<div class="at2-empty" style="color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }

  const sm = check.summary;
  const problemRows = check.rows.filter(r => r.problems.length);
  body.innerHTML = `
    <div class="at2-chiprow" style="display:flex;margin:0 0 12px">
      <span class="at2-chip ok">${sm.rows} row${sm.rows === 1 ? '' : 's'}</span>
      <span class="at2-chip ok">${sm.create} new</span>
      <span class="at2-chip warn">${sm.update} updated</span>
      <span class="at2-chip ok">${sm.with_stock} with opening stock</span>
      ${canSeeCost ? `<span class="at2-chip ok">stock value ${rupees(sm.total_value_paise)}</span>` : ''}
      ${problemRows.length ? `<span class="at2-chip danger">${problemRows.length} row${problemRows.length === 1 ? '' : 's'} with problems</span>` : ''}
    </div>

    ${check.errors.length ? `
      <div class="at2-notice danger" style="max-height:190px;overflow:auto">
        <b>Nothing will be imported until these are fixed</b>
        <ul>
          ${check.errors.slice(0, 60).map(e => `<li>${esc(e)}</li>`).join('')}
          ${check.errors.length > 60 ? `<li>…and ${check.errors.length - 60} more</li>` : ''}
        </ul>
        <div style="font-size:0.78rem;color:var(--text-dim);margin-top:6px">Fix the sheet in Excel, then choose it again with Import Excel.</div>
      </div>` : ''}

    ${check.ignored_columns.length ? `<p class="at2-note" style="margin:0 0 10px">Columns not recognised and ignored: ${esc(check.ignored_columns.join(', '))}</p>` : ''}

    ${check.rows.length ? `
    <div class="table-wrap" style="max-height:340px;overflow:auto"><table class="at2-tbl">
      <thead><tr><th>Row</th><th></th><th>Item</th><th>SKU</th><th>Unit</th>
        <th style="text-align:right">Purchase</th><th style="text-align:right">Selling</th><th style="text-align:right">GST</th>
        <th style="text-align:right">Opening</th><th>Location</th></tr></thead>
      <tbody>
        ${check.rows.slice(0, 300).map(r => `
          <tr${r.problems.length ? ' style="background:rgba(239,68,68,0.07)"' : ''}>
            <td>${r.row}</td>
            <td><span class="at2-chip ${r.problems.length ? 'danger' : r.action === 'create' ? 'ok' : 'warn'}">${r.problems.length ? 'fix' : r.action === 'create' ? 'new' : 'update'}</span></td>
            <td><b>${esc(r.name)}</b>${r.serials ? ` <small style="color:var(--text-dim)">${r.serials} serial${r.serials === 1 ? '' : 's'}</small>` : ''}</td>
            <td>${esc(r.sku || '—')}</td><td>${esc(r.unit)}</td>
            <td style="text-align:right">${r.purchase_rate ?? '—'}</td>
            <td style="text-align:right">${r.selling_rate ?? '—'}</td>
            <td style="text-align:right">${r.gst_rate}%</td>
            <td style="text-align:right">${r.opening_qty > 0 ? `<b>${r.opening_qty}</b>` : '—'}</td>
            <td>${esc(r.location || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table></div>
    ${check.rows.length > 300 ? `<p class="at2-note">Showing the first 300 rows. All ${check.rows.length} are checked.</p>` : ''}` : ''}

    ${check.ok ? `
      <div class="form-group" style="margin-top:14px;max-width:280px">
        <label>Opening stock counts from *</label>
        <input type="date" id="im-date" value="${ymd(new Date())}">
      </div>
      <p class="at2-note">${sm.with_stock ? 'The stock value is recorded once in the books as Inventory against Opening Balance Equity, so the stock and the accounts start in agreement. ' : ''}Importing the same file again will not add stock twice.</p>` : ''}`;

  if (!check.ok) return;
  go.disabled = false;
  go.textContent = `Import ${sm.rows} item${sm.rows === 1 ? '' : 's'}`;
  go.onclick = async () => {
    const date = $('#im-date').value;
    if (!date) return toast('Choose the opening stock date', 'warning');
    go.disabled = true;
    go.textContent = 'Importing…';
    try {
      const out = await api('POST', '/stock/import', { rows: table, dry_run: false, opening_date: date, file_name: file.name });
      const d = out.done;
      toast(`Done — ${d.created} added, ${d.updated} updated, ${d.stocked} with opening stock`, 'success');
      close();
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      go.disabled = false;
      go.textContent = `Import ${sm.rows} item${sm.rows === 1 ? '' : 's'}`;
    }
  };
}

function openLocationModal(container) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:440px">
      <div class="modal-header">
        <span class="modal-title">New location</span>
        <button class="modal-close" id="lo-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Name</label><input type="text" id="lo-name" placeholder="e.g. Rashid's van"></div>
        <div class="form-group"><label>Kind</label>
          <select id="lo-kind">
            <option value="store">Store</option>
            <option value="van">Technician van</option>
            <option value="site">Site</option>
            <option value="damaged">Damaged / quarantine</option>
          </select></div>
        <div class="form-group" id="lo-emp-wrap" style="display:none"><label>Technician</label>
          <select id="lo-employee"><option value="">— Choose —</option></select></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="lo-cancel">Cancel</button>
        <button class="btn btn-primary" id="lo-save">Create</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#lo-close').onclick = close;
  $('#lo-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  // Only a van belongs to someone, so the picker appears only for one.
  $('#lo-kind').onchange = async () => {
    const isVan = $('#lo-kind').value === 'van';
    $('#lo-emp-wrap').style.display = isVan ? '' : 'none';
    if (isVan && $('#lo-employee').options.length <= 1) {
      try {
        const staff = await api('GET', '/data/profiles?eq=role:employee&order=full_name:asc');
        $('#lo-employee').innerHTML = '<option value="">— Choose —</option>'
          + staff.map(p => `<option value="${esc(p.id)}">${esc(p.full_name)}</option>`).join('');
      } catch { /* the list is a convenience, not a requirement */ }
    }
  };

  $('#lo-save').onclick = async () => {
    const name = $('#lo-name').value.trim();
    if (!name) return toast('A name is required', 'warning');
    const btn = $('#lo-save');
    btn.disabled = true;
    try {
      await api('POST', '/stock/locations', {
        name, kind: $('#lo-kind').value, employee_id: $('#lo-employee').value || null,
      });
      toast('Location created', 'success');
      close();
      locations = await api('GET', '/stock/locations');
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

function exportCurrent() {
  if (state.tab === 'onhand' && valuation) {
    return exportToCSV(`stock-on-hand-${ymd(new Date())}.csv`, valuation.items.map(i => ({
      Item: i.name, SKU: i.sku || '', Unit: i.unit || '', 'On hand': i.quantity,
      ...(canSeeCost ? {
        'Avg cost (₹)': (i.avg_cost_paise / 100).toFixed(2),
        'Value (₹)': (i.value_paise / 100).toFixed(2),
      } : {}),
    })));
  }
  if (state.tab === 'locations') {
    const location = locations.find(l => l.id === state.locationId);
    return exportToCSV(`stock-${(location?.name || 'location').replace(/\W+/g, '-')}.csv`, locationItems.map(r => ({
      Item: r.name, SKU: r.sku || '', Held: r.held_qty, Unit: r.base_unit || r.unit || '',
      'Value (₹)': (Number(r.value_paise) / 100).toFixed(2),
    })));
  }
  if (state.tab === 'serials') {
    return exportToCSV(`serial-numbers-${ymd(new Date())}.csv`, serials.map(s => ({
      Serial: s.serial_no, Item: s.item_name, Status: s.status, Ours: Number(s.owned) ? 'Yes' : 'No',
      Location: s.location_name || '', Supplier: s.supplier_name || '', Customer: s.customer_name || '',
      'Warranty until': s.warranty_until ? ymd(s.warranty_until) : '',
    })));
  }
  toast('Nothing to export on this tab', 'info');
}
