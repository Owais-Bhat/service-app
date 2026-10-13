// Inventory — the goods side of the business. Items carry a purchase rate and
// a selling rate (admin only), stock is a running total kept in step with the
// movement ledger, and anything at or below its minimum is flagged here and
// pushed to admin as a notification by the server.
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
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const MOVEMENT_LABEL = {
  purchase: 'Purchase', consume: 'Used on job', return: 'Returned',
  adjust_in: 'Correction (in)', adjust_out: 'Correction (out)', damage: 'Damaged',
};

const TABS = [
  { key: 'items', label: 'Items' },
  { key: 'low', label: 'Low Stock' },
  { key: 'movements', label: 'Stock Ledger' },
];

const state = { tab: 'items', q: '', category: '', showInactive: false };
const selected = new Set(); // items ticked for a bulk delete
let items = [];
let movements = [];

export async function renderInventoryTab(container) {
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    items = await api('GET', '/inventory/items?all=1');
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

const lowStock = () => items.filter(i => Number(i.min_stock) > 0 && Number(i.quantity) <= Number(i.min_stock));

function filtered() {
  return items
    .filter(i => state.showInactive || i.active)
    .filter(i => !state.category || (i.category || 'Uncategorised') === state.category)
    .filter(i => !state.q || `${i.name} ${i.sku || ''} ${i.category || ''}`.toLowerCase().includes(state.q.toLowerCase()));
}

function paint(container) {
  const low = lowStock();
  const live = items.filter(i => i.active);
  const stockValue = live.reduce((s, i) => s + Number(i.quantity) * Number(i.purchase_rate || 0), 0);
  const retailValue = live.reduce((s, i) => s + Number(i.quantity) * Number(i.selling_rate || 0), 0);
  const categories = [...new Set(items.map(i => i.category || 'Uncategorised'))].sort();

  container.innerHTML = `
    <div class="at2">
      <div class="page-header">
        <div>
          <h1>Inventory</h1>
          <p>Items you stock and fit — purchase rate, selling rate and what's left</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="inv-export">${ICONS.download}<span>Export</span></button>
          <button class="btn btn-primary" id="inv-new">${ICONS.plus}<span>New Item</span></button>
        </div>
      </div>

      <div class="at2-kpis">
        ${kpi(ICONS.box, live.length, 'Items', '', 'muted')}
        ${kpi(ICONS.alert, low.length, 'Low Stock', '', low.length ? 'red' : 'muted')}
        ${kpi(ICONS.rupee, money(stockValue), 'Stock Value (cost)', '', 'green')}
        ${kpi(ICONS.receipt, money(retailValue), 'Stock Value (selling)', '', 'amber')}
        ${kpi(ICONS.check, money(retailValue - stockValue), 'Potential Margin', '', 'green')}
      </div>

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-invtab="${t.key}">${t.label}${t.key === 'low' && low.length ? ` (${low.length})` : ''}</button>`).join('')}
      </div>

      <div class="card at2-filters">
        <div class="card-body">
          <div class="form-group"><label>Category</label>
            <select id="inv-cat">
              <option value="">All categories</option>
              ${categories.map(c => `<option value="${esc(c)}"${state.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Search</label><input type="search" id="inv-q" placeholder="Item name or SKU…" value="${esc(state.q)}"></div>
          <label class="at2-check"><input type="checkbox" id="inv-inactive" ${state.showInactive ? 'checked' : ''}> Show inactive items (${items.filter(i => !i.active).length})</label>
        </div>
      </div>

      <div id="inv-body"></div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  container.querySelectorAll('[data-invtab]').forEach(b => {
    b.onclick = async () => {
      state.tab = b.dataset.invtab;
      if (state.tab === 'movements' && !movements.length) {
        try { movements = await api('GET', '/inventory/movements'); } catch (err) { toast(err.message, 'error'); }
      }
      paint(container);
    };
  });
  $('#inv-cat').onchange = (e) => { state.category = e.target.value; paint(container); };
  let t;
  $('#inv-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); paint(container); }, 250); };
  $('#inv-inactive').onchange = (e) => { state.showInactive = e.target.checked; paint(container); };
  $('#inv-new').onclick = () => openItemModal(container, null);
  $('#inv-export').onclick = () => {
    if (!items.length) return toast('Nothing to export', 'info');
    exportToCSV('inventory.csv', items.map(i => ({
      SKU: i.sku || '', Item: i.name, Category: i.category || '', Unit: i.unit || '',
      'Purchase rate': Number(i.purchase_rate || 0), 'Selling rate': Number(i.selling_rate || 0),
      'GST %': Number(i.gst_rate || 0), 'In stock': Number(i.quantity || 0), 'Minimum': Number(i.min_stock || 0),
      Active: i.active ? 'Yes' : 'No',
    })));
  };

  const body = $('#inv-body');
  if (state.tab === 'movements') paintMovements(container, body);
  else paintItems(container, body, state.tab === 'low' ? low : filtered());
}

function kpi(icon, value, label, note, tone) {
  return `
    <div class="at2-kpi">
      <span class="at2-kpi-ico tone-${tone}">${icon || ''}</span>
      <div>
        <div class="at2-kpi-label">${esc(label)}</div>
        <div class="at2-kpi-value tone-${tone}">${value}${note ? ` <small>(${note})</small>` : ''}</div>
      </div>
    </div>`;
}

function paintItems(container, body, list) {
  body.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${state.tab === 'low' ? 'Items at or below minimum' : 'Items'}</span>
        <span class="at2-count">${list.length} item${list.length === 1 ? '' : 's'}</span>
        <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" id="inv-bulkon" disabled>Activate selected (0)</button>
          <button class="btn btn-secondary btn-sm" id="inv-bulkoff" disabled>Hide selected (0)</button>
          <button class="btn btn-secondary btn-sm" id="inv-bulkdel" disabled>Delete selected (0)</button>
        </span>
      </div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr>
          <th style="width:34px"><input type="checkbox" id="inv-selall" title="Select every item in this list"></th><th>Item</th><th>Category</th><th>In stock</th><th>Min</th>
          <th>Purchase</th><th>Selling</th><th>Margin</th><th>GST</th><th></th>
        </tr></thead>
        <tbody>
          ${list.length ? list.map(i => {
            const margin = Number(i.selling_rate || 0) - Number(i.purchase_rate || 0);
            const pct = Number(i.selling_rate) > 0 ? Math.round((margin / Number(i.selling_rate)) * 100) : 0;
            const isLow = Number(i.min_stock) > 0 && Number(i.quantity) <= Number(i.min_stock);
            return `
              <tr>
                <td><input type="checkbox" class="inv-sel" data-sel="${esc(i.id)}"${selected.has(i.id) ? ' checked' : ''}></td>
                <td>
                  <b>${esc(i.name)}</b>${i.active ? '' : ' <span class="at2-chip muted">Inactive</span>'}
                  ${i.sku ? `<div style="font-size:0.75rem;color:var(--text-dim)">${esc(i.sku)}</div>` : ''}
                </td>
                <td>${esc(i.category || '—')}</td>
                <td><b class="${isLow ? 'tone-red' : ''}" style="${isLow ? 'color:var(--danger)' : ''}">${qty(i.quantity)}</b> <small style="color:var(--text-dim)">${esc(i.unit || 'pcs')}</small></td>
                <td>${qty(i.min_stock)}</td>
                <td>${money(i.purchase_rate)}</td>
                <td>${money(i.selling_rate)}</td>
                <td><span class="at2-chip ${margin > 0 ? 'ok' : 'danger'}">${money(margin)}${pct ? ` · ${pct}%` : ''}</span></td>
                <td>${Number(i.gst_rate || 0)}%</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-secondary btn-sm inv-stock" data-stock="${esc(i.id)}">Stock</button>
                  <button class="btn btn-secondary btn-sm inv-edit" data-edit="${esc(i.id)}">${ICONS.edit}</button>
                  <button class="at2-photo inv-del" data-del="${esc(i.id)}" title="Delete item">${ICONS.close}</button>
                </td>
              </tr>`;
          }).join('') : `<tr><td colspan="10" style="text-align:center;padding:26px;color:var(--text-dim)">${state.tab === 'low' ? 'Nothing is running low 🎉' : 'No items yet — add your first one.'}</td></tr>`}
        </tbody>
      </table></div>
    </div>`;

  body.querySelectorAll('[data-edit]').forEach(b => { b.onclick = () => openItemModal(container, items.find(i => i.id === b.dataset.edit)); });
  body.querySelectorAll('[data-stock]').forEach(b => { b.onclick = () => openStockModal(container, items.find(i => i.id === b.dataset.stock)); });
  body.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async () => {
      const item = items.find(i => i.id === b.dataset.del);
      if (!item || !confirm(`Delete "${item.name}"? Items already used on a bill are deactivated instead.`)) return;
      b.disabled = true;
      try {
        const res = await api('DELETE', `/inventory/items/${item.id}`);
        toast(res.deactivated ? 'Item deactivated (it is used on bills)' : 'Item deleted', 'success');
        renderInventoryTab(container);
      } catch (err) {
        toast(err.message, 'error');
        b.disabled = false;
      }
    };
  });

  wireBulkDelete(container, body, list);
}

// Tick boxes and the "Delete selected" button.
function wireBulkDelete(container, body, list) {
  const btn = body.querySelector('#inv-bulkdel');
  const bulkOn = body.querySelector('#inv-bulkon');
  const bulkOff = body.querySelector('#inv-bulkoff');
  const all = body.querySelector('#inv-selall');
  if (!btn || !all || !bulkOn || !bulkOff) return;
  const shown = new Set(list.map(i => i.id));
  const refresh = () => {
    const n = [...selected].filter(id => shown.has(id)).length;
    btn.textContent = `Delete selected (${n})`;
    btn.disabled = n === 0;
    const chosen = list.filter(i => selected.has(i.id));
    const off = chosen.filter(i => !i.active).length;   // inactive now: can be activated
    const on = chosen.length - off;                      // active now: can be hidden
    bulkOn.textContent = `Activate selected (${off})`;
    bulkOn.disabled = off === 0;
    bulkOff.textContent = `Hide selected (${on})`;
    bulkOff.disabled = on === 0;
    all.checked = list.length > 0 && n === list.length;
    all.indeterminate = n > 0 && n < list.length;
  };
  body.querySelectorAll('.inv-sel').forEach(cb => {
    cb.onchange = () => { if (cb.checked) selected.add(cb.dataset.sel); else selected.delete(cb.dataset.sel); refresh(); };
  });
  all.onchange = () => {
    list.forEach(i => { if (all.checked) selected.add(i.id); else selected.delete(i.id); });
    body.querySelectorAll('.inv-sel').forEach(cb => { cb.checked = all.checked; });
    refresh();
  };
  btn.onclick = () => openBulkDelete(container, [...selected].filter(id => shown.has(id)));

  // Activate or hide every ticked item that is not already so.
  const setActive = async (active) => {
    const ids = list.filter(i => selected.has(i.id) && !!i.active !== active).map(i => i.id);
    if (!ids.length) return;
    bulkOn.disabled = true; bulkOff.disabled = true;
    try {
      const out = await api('POST', '/inventory/items/bulk-active', { ids, active });
      toast(`${out.changed} item${out.changed === 1 ? '' : 's'} ${active ? 'activated' : 'hidden'}`, 'success');
      ids.forEach(id => selected.delete(id));
      renderInventoryTab(container);
    } catch (err) {
      toast(err.message, 'error');
      refresh();
    }
  };
  bulkOn.onclick = () => setActive(true);
  bulkOff.onclick = () => setActive(false);
  refresh();
}

// Shows what would happen first; nothing is deleted until the word DELETE is typed.
async function openBulkDelete(container, ids) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" style="max-width:560px"><div class="modal-body"><div class="loading-screen"><div class="spinner"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  let plan;
  try {
    plan = await api('POST', '/inventory/items/bulk-delete', { ids, dry_run: true });
  } catch (err) {
    close();
    return toast(err.message, 'error');
  }

  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">Delete ${ids.length} item${ids.length === 1 ? '' : 's'}</span>
        <button class="modal-close" id="bd-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div class="at2-notice ${plan.will_delete ? 'warn' : 'info'}">
          <b>${plan.will_delete}</b> will be deleted for good${plan.reverse_value_paise ? `, and their opening stock worth <b>${money(plan.reverse_value_paise / 100)}</b> is taken back out of the books` : ''}.
          This cannot be undone — take a Backup first (Data Migration → Backup).
        </div>
        ${plan.will_keep ? `
          <div class="at2-notice info"><b>${plan.will_keep}</b> cannot be deleted because bills, purchases, jobs or stock counts still refer to them. They will be <b>hidden</b> (made inactive) instead.</div>
          <div class="table-wrap" style="max-height:200px;overflow:auto"><table class="at2-tbl"><tbody>
            ${plan.keep.slice(0, 30).map(k => `<tr><td>${esc(k.name)}</td><td style="color:var(--text-dim);font-size:0.78rem">${esc(k.reason)}</td></tr>`).join('')}
            ${plan.will_keep > 30 ? `<tr><td colspan="2" style="color:var(--text-dim)">…and ${plan.will_keep - 30} more</td></tr>` : ''}
          </tbody></table></div>` : ''}
        ${plan.will_delete || plan.will_keep ? `
          <div class="form-group" style="margin-top:14px">
            <label>Type <b>DELETE</b> to confirm</label>
            <input type="text" id="bd-word" autocomplete="off" placeholder="DELETE">
          </div>` : '<p>Nothing to do.</p>'}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="bd-cancel">Cancel</button>
        <button class="btn btn-primary" id="bd-go" disabled style="background:var(--danger)">Delete</button>
      </div>
    </div>`;

  const $ = (s) => overlay.querySelector(s);
  $('#bd-close').onclick = close;
  $('#bd-cancel').onclick = close;
  const word = $('#bd-word');
  const go = $('#bd-go');
  if (word) word.oninput = () => { go.disabled = word.value.trim() !== 'DELETE'; };
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = 'Deleting…';
    try {
      const out = await api('POST', '/inventory/items/bulk-delete', { ids, dry_run: false, confirm: 'DELETE' });
      toast(`${out.deleted} deleted${out.hidden ? `, ${out.hidden} hidden` : ''}`, 'success');
      ids.forEach(id => selected.delete(id));
      close();
      renderInventoryTab(container);
    } catch (err) {
      toast(err.message, 'error');
      go.disabled = false;
      go.textContent = 'Delete';
    }
  };
}

function paintMovements(container, body) {
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Stock Ledger</span><span class="at2-count">${movements.length} entries</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>When</th><th>Item</th><th>Movement</th><th>Qty</th><th>Rate</th><th>Job</th><th>Note</th></tr></thead>
        <tbody>
          ${movements.length ? movements.map(m => `
            <tr>
              <td style="white-space:nowrap">${esc(when(m.created_at))}</td>
              <td>${esc(m.item_name)}</td>
              <td><span class="at2-chip ${Number(m.quantity) > 0 ? 'ok' : 'warn'}">${esc(MOVEMENT_LABEL[m.type] || m.type)}</span></td>
              <td><b style="color:${Number(m.quantity) > 0 ? 'var(--primary)' : 'var(--danger)'}">${Number(m.quantity) > 0 ? '+' : ''}${qty(m.quantity)}</b> <small style="color:var(--text-dim)">${esc(m.unit || '')}</small></td>
              <td>${m.rate == null ? '—' : esc(money(m.rate))}</td>
              <td>${m.ref_id ? `<span style="font-size:0.78rem;color:var(--text-dim)">${esc(m.ref_type || '')}</span>` : '—'}</td>
              <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.note || '')}</td>
            </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;padding:26px;color:var(--text-dim)">No stock movements yet</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}

function openItemModal(container, item) {
  const isEdit = !!item;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? 'Edit Item' : 'New Item'}</span>
        <button class="modal-close" id="inv-m-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          <div class="form-group"><label>Item name</label><input type="text" id="inv-name" value="${esc(item?.name || '')}" placeholder="e.g. 2MP Dome Camera"></div>
          <div class="form-group"><label>SKU <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label><input type="text" id="inv-sku" value="${esc(item?.sku || '')}"></div>
          <div class="form-group"><label>Category</label><input type="text" id="inv-category" value="${esc(item?.category || '')}" placeholder="e.g. Cameras"></div>
          <div class="form-group"><label>Unit</label><input type="text" id="inv-unit" value="${esc(item?.unit || 'pcs')}" placeholder="pcs / metre / box"></div>
          <div class="form-group"><label>Purchase rate (₹)</label><input type="number" id="inv-purchase" min="0" step="0.01" value="${item ? Number(item.purchase_rate) : ''}"></div>
          <div class="form-group"><label>Selling rate (₹)</label><input type="number" id="inv-selling" min="0" step="0.01" value="${item ? Number(item.selling_rate) : ''}"></div>
          <div class="form-group"><label>GST %</label><input type="number" id="inv-gst" min="0" step="0.01" value="${item ? Number(item.gst_rate) : 18}"></div>
          <div class="form-group"><label>Minimum stock</label><input type="number" id="inv-min" min="0" step="0.01" value="${item ? Number(item.min_stock) : 0}"></div>
          ${isEdit ? '' : '<div class="form-group"><label>Opening stock</label><input type="number" id="inv-opening" min="0" step="0.01" value="0"></div>'}
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:0.85rem;">
          <input type="checkbox" id="inv-active" ${item && !item.active ? '' : 'checked'}> Active (available when billing)
        </label>
        <small style="display:block;margin-top:10px;color:var(--text-dim);font-size:0.78rem;">
          Technicians see the selling rate only. On installations they can adjust it for that job; the purchase rate never leaves this screen.
        </small>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="inv-m-cancel">Cancel</button>
        <button class="btn btn-primary" id="inv-m-save">${isEdit ? 'Save Changes' : 'Add Item'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (s) => overlay.querySelector(s);
  const close = () => overlay.remove();
  $('#inv-m-close').onclick = close;
  $('#inv-m-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('#inv-m-save').onclick = async () => {
    const payload = {
      name: $('#inv-name').value.trim(),
      sku: $('#inv-sku').value.trim(),
      category: $('#inv-category').value.trim(),
      unit: $('#inv-unit').value.trim() || 'pcs',
      purchase_rate: $('#inv-purchase').value,
      selling_rate: $('#inv-selling').value,
      gst_rate: $('#inv-gst').value,
      min_stock: $('#inv-min').value,
      active: $('#inv-active').checked,
    };
    if (!isEdit) payload.opening_stock = $('#inv-opening').value;
    if (!payload.name) return toast('Item name is required', 'warning');
    const btn = $('#inv-m-save');
    btn.disabled = true;
    try {
      if (isEdit) await api('PUT', `/inventory/items/${item.id}`, payload);
      else await api('POST', '/inventory/items', payload);
      toast(isEdit ? 'Item updated' : 'Item added', 'success');
      close();
      movements = [];
      renderInventoryTab(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

function openStockModal(container, item) {
  if (!item) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px;">
      <div class="modal-header">
        <span class="modal-title">Stock — ${esc(item.name)}</span>
        <button class="modal-close" id="inv-s-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:14px;font-size:0.86rem;color:var(--text-soft);">
          In stock now: <b style="color:var(--text)">${qty(item.quantity)} ${esc(item.unit || 'pcs')}</b>
        </div>
        <div class="form-group"><label>Movement</label>
          <select id="inv-s-type">
            <option value="purchase">Purchase (stock in)</option>
            <option value="return">Returned from a job</option>
            <option value="adjust_in">Correction — add</option>
            <option value="adjust_out">Correction — remove</option>
            <option value="damage">Damaged / lost</option>
          </select>
        </div>
        <div class="form-group"><label>Quantity</label><input type="number" id="inv-s-qty" min="0.01" step="0.01" placeholder="0"></div>
        <div class="form-group" id="inv-s-ratewrap"><label>Purchase rate (₹) <span style="color:var(--text-dim);font-weight:500;">— updates the item's cost</span></label><input type="number" id="inv-s-rate" min="0" step="0.01" value="${Number(item.purchase_rate)}"></div>
        <div class="form-group"><label>Note <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label><input type="text" id="inv-s-note" placeholder="Invoice no, vendor, reason…"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="inv-s-cancel">Cancel</button>
        <button class="btn btn-primary" id="inv-s-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (s) => overlay.querySelector(s);
  const close = () => overlay.remove();
  $('#inv-s-close').onclick = close;
  $('#inv-s-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  $('#inv-s-type').onchange = (e) => {
    $('#inv-s-ratewrap').style.display = e.target.value === 'purchase' ? 'block' : 'none';
  };

  $('#inv-s-save').onclick = async () => {
    const quantity = Number($('#inv-s-qty').value);
    if (!(quantity > 0)) return toast('Enter a quantity', 'warning');
    const btn = $('#inv-s-save');
    btn.disabled = true;
    try {
      await api('POST', '/inventory/movements', {
        item_id: item.id,
        type: $('#inv-s-type').value,
        quantity,
        rate: $('#inv-s-type').value === 'purchase' ? $('#inv-s-rate').value : null,
        note: $('#inv-s-note').value.trim() || null,
      });
      toast('Stock updated', 'success');
      close();
      movements = [];
      renderInventoryTab(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}
