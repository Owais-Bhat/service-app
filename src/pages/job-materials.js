// Record the stock a technician used on a job — or brought back from it.
//
// This is the step between "I gave him stock" (a transfer to his van) and the
// books: what was fitted on this ticket, from which van, and what to charge for
// it. Approving it takes the goods out of the van, puts the cost into the
// accounts and makes the material available to invoice.
//
//   Used     : fitted or consumed on the job        -> leaves the van
//   Returned : came back from the job (a removed or unused device) -> goes back in
//
// Stock the technician simply did not use and carried back to the shop is not
// this: that is a transfer from his van to the store (Stock -> Take back).
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';
import { attachItemPicker } from './item-picker.js';

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
const qtyText = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const sellRate = (i) => Number(i.selling_rate_paise ? i.selling_rate_paise / 100 : i.selling_rate) || '';

/**
 * @param {{ job?: object, onDone?: Function }} opts  `job` is a row from /jobs/search, when the ticket is already known
 */
export async function openMaterialsModal({ job = null, onDone = null } = {}) {
  let items; let locations;
  try {
    [items, locations] = await Promise.all([api('GET', '/inventory/items?all=1'), api('GET', '/stock/locations')]);
  } catch (err) { return toast(err.message, 'error'); }
  const owned = locations.filter(l => l.owned);
  const defaultStore = owned.find(l => l.is_default) || owned[0];

  const state = { job, held: new Map(), kind: 'used' };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:820px">
      <div class="modal-header"><span class="modal-title">Record stock used on a job</span><button class="modal-close" id="jm-close">${ICONS.close}</button></div>
      <div class="modal-body">
        <div class="at2-notice" style="margin-bottom:12px">
          <b>1.</b> Give the technician stock (<i>Stock → Give to technician</i>) &nbsp; <b>2.</b> He fits it on a job — record it <b>here</b> &nbsp;
          <b>3.</b> Whatever he did not use and brings back to the shop: <i>Stock → Take back</i>.
        </div>

        <div class="form-group"><label>What are you recording?</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <label class="at2-check" style="text-transform:none;letter-spacing:0;font-size:0.88rem;font-weight:600"><input type="radio" name="jm-kind" value="used" checked> Used / fitted on the job</label>
            <label class="at2-check" style="text-transform:none;letter-spacing:0;font-size:0.88rem;font-weight:600"><input type="radio" name="jm-kind" value="returned"> Came back from the job (removed or unused device)</label>
          </div></div>

        <div class="form-group"><label>Job *</label>
          <input type="text" id="jm-job" placeholder="Search by ticket number, customer name or phone" autocomplete="off">
          <div id="jm-jobresults" style="margin-top:6px"></div>
          <div id="jm-jobchosen"></div></div>

        <div class="form-group"><label id="jm-loclabel">Taken from</label>
          <select id="jm-location">${owned.map(l => `<option value="${esc(l.id)}"${l === defaultStore ? ' selected' : ''}>${esc(l.name)}${l.employee_name ? ` · ${esc(l.employee_name)}` : ''}</option>`).join('')}</select></div>

        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th id="jm-ratehead">Charge ₹ each</th><th></th></tr></thead>
          <tbody id="jm-lines"></tbody>
        </table></div>
        <button class="btn btn-secondary" id="jm-add" style="margin-top:8px">${ICONS.plus}<span>Add item</span></button>

        <div class="form-group" style="margin-top:12px"><label>Note <small>(optional)</small></label><input type="text" id="jm-note" placeholder="e.g. 2 cameras replaced, cable run 40 m"></div>
        <label class="at2-check" id="jm-extra-wrap"><input type="checkbox" id="jm-extra"> The customer agreed to this extra work</label>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="jm-cancel">Cancel</button><button class="btn btn-primary" id="jm-save">Record</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => { overlay.querySelectorAll('.jm-line').forEach(tr => tr._picker?.destroy()); overlay.remove(); };
  $('#jm-close').onclick = close;
  $('#jm-cancel').onclick = close;

  // ── which job ─────────────────────────────────────────────────────────
  const paintChosen = () => {
    const j = state.job;
    $('#jm-jobchosen').innerHTML = j ? `
      <div style="padding:10px 12px;border-radius:10px;border:1.5px solid var(--primary);background:rgba(21,160,90,0.08);font-size:0.84rem">
        <b>${esc(j.ticket_no || '—')}</b> · ${esc(j.full_name)} · ${esc(j.phone || '')}
        <div style="color:var(--text-dim);font-size:0.78rem">${j.job_type === 'installation' ? 'Installation' : 'Service'}: ${esc(j.what || '')}${j.employee_name ? ` · technician ${esc(j.employee_name)}` : ''} · ${esc(j.status || '')}</div>
      </div>` : '';
  };
  paintChosen();

  let jobTimer;
  const searchJobs = async () => {
    try {
      const rows = await api('GET', `/jobs/search?q=${encodeURIComponent($('#jm-job').value.trim())}`);
      $('#jm-jobresults').innerHTML = rows.length ? `
        <div style="max-height:190px;overflow:auto;border:1.5px solid var(--border);border-radius:10px">
          ${rows.map((r, n) => `<div class="jm-jobrow" data-n="${n}" style="padding:8px 10px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border)">
            <b>${esc(r.ticket_no || '—')}</b> · ${esc(r.full_name)} <small style="color:var(--text-dim)">${esc(r.phone || '')} · ${esc(r.what || '')} · ${esc(r.status || '')}${r.employee_name ? ` · ${esc(r.employee_name)}` : ''}</small></div>`).join('')}
        </div>` : '<div style="font-size:0.8rem;color:var(--text-dim)">No ticket matches.</div>';
      $('#jm-jobresults').querySelectorAll('.jm-jobrow').forEach(el => {
        el.onclick = () => {
          state.job = rows[Number(el.dataset.n)];
          $('#jm-jobresults').innerHTML = '';
          $('#jm-job').value = '';
          paintChosen();
          // A job that has a technician defaults to his van, if he has one.
          const van = owned.find(l => l.kind === 'van' && l.employee_id && l.employee_id === state.job.assigned_employee_id);
          if (van) { $('#jm-location').value = van.id; loadHeld(); }
        };
      });
    } catch (err) { $('#jm-jobresults').innerHTML = `<div style="color:var(--danger);font-size:0.8rem">${esc(err.message)}</div>`; }
  };
  $('#jm-job').oninput = () => { clearTimeout(jobTimer); jobTimer = setTimeout(searchJobs, 250); };
  $('#jm-job').onfocus = () => { if (!$('#jm-jobresults').innerHTML) searchJobs(); };

  // ── what the chosen place holds ───────────────────────────────────────
  const hintFor = (item) => {
    if (state.kind === 'returned') return item.base_unit || item.unit || '';
    const held = state.held.get(item.id);
    return held === undefined ? '' : `${qtyText(held)} here`;
  };
  async function loadHeld() {
    try {
      const rows = await api('GET', `/stock/locations/${encodeURIComponent($('#jm-location').value)}/items`);
      state.held = new Map(rows.map(r => [r.id, Number(r.held_qty)]));
    } catch { state.held = new Map(); }
    checkQuantities();
  }
  function checkQuantities() {
    overlay.querySelectorAll('.jm-line').forEach(tr => {
      const item = tr._picker?.item();
      const q = Number(tr.querySelector('.jm-qty').value) || 0;
      const warn = tr.querySelector('.jm-warn');
      const held = item ? state.held.get(item.id) : undefined;
      warn.textContent = state.kind === 'used' && item && q > (held || 0) ? `Only ${qtyText(held || 0)} recorded here` : '';
    });
  }

  // ── lines ─────────────────────────────────────────────────────────────
  const addLine = () => {
    const tr = document.createElement('tr');
    tr.className = 'jm-line';
    tr.innerHTML = `
      <td><input type="text" class="jm-item" placeholder="Search item…" style="min-width:210px"><div class="jm-warn" style="font-size:0.72rem;color:var(--danger)"></div></td>
      <td><input type="number" class="jm-qty" min="0" step="0.001" style="width:84px"></td>
      <td class="jm-unit" style="color:var(--text-dim)">—</td>
      <td class="jm-ratecell"><input type="number" class="jm-rate" min="0" step="0.01" style="width:96px"></td>
      <td><button class="at2-photo jm-del" title="Remove">${ICONS.close}</button></td>`;
    $('#jm-lines').appendChild(tr);
    tr._picker = attachItemPicker(tr.querySelector('.jm-item'), {
      items: () => items, hint: hintFor,
      onPick: (item) => {
        tr.querySelector('.jm-unit').textContent = item.base_unit || item.unit || '';
        if (!tr.querySelector('.jm-rate').value) tr.querySelector('.jm-rate').value = sellRate(item);
        tr.querySelector('.jm-qty').focus();
        checkQuantities();
      },
    });
    tr.querySelector('.jm-qty').oninput = checkQuantities;
    tr.querySelector('.jm-del').onclick = () => {
      if (overlay.querySelectorAll('.jm-line').length <= 1) return;
      tr._picker.destroy();
      tr.remove();
    };
  };
  addLine();
  $('#jm-add').onclick = addLine;

  const syncKind = () => {
    state.kind = overlay.querySelector('input[name=jm-kind]:checked').value;
    const returned = state.kind === 'returned';
    $('#jm-loclabel').textContent = returned ? 'Goes back into' : 'Taken from';
    $('#jm-ratehead').style.display = returned ? 'none' : '';
    overlay.querySelectorAll('.jm-ratecell').forEach(td => { td.style.display = returned ? 'none' : ''; });
    $('#jm-extra-wrap').style.display = returned ? 'none' : '';
    checkQuantities();
  };
  overlay.querySelectorAll('input[name=jm-kind]').forEach(r => { r.onchange = syncKind; });
  $('#jm-location').onchange = loadHeld;
  loadHeld();

  // ── save ──────────────────────────────────────────────────────────────
  $('#jm-save').onclick = async () => {
    if (!state.job) return toast('Choose the job these were used on', 'warning');
    const lines = [...overlay.querySelectorAll('.jm-line')].map(tr => {
      const item = tr._picker.item();
      const quantity = Number(tr.querySelector('.jm-qty').value) || 0;
      return item && quantity > 0 ? {
        item_id: item.id, description: item.name, quantity, unit: item.base_unit || item.unit || null,
        sell_rate: state.kind === 'used' ? (tr.querySelector('.jm-rate').value || 0) : undefined,
      } : null;
    }).filter(Boolean);
    if (!lines.length) return toast('Choose at least one item and a quantity', 'warning');

    const van = owned.find(l => l.id === $('#jm-location').value);
    const btn = $('#jm-save');
    btn.disabled = true;
    try {
      const out = await api('POST', '/jobs/materials', {
        job_type: state.job.job_type, job_id: state.job.job_id, location_id: $('#jm-location').value,
        employee_id: van?.employee_id || state.job.assigned_employee_id || undefined,
        kind: state.kind, note: $('#jm-note').value.trim() || undefined,
        customer_approved: state.kind === 'used' && $('#jm-extra').checked,
        lines,
      });
      if (out.issue.status === 'submitted') {
        if (confirm('Saved. It is waiting for approval — approve it now?\n\nApproving takes the stock out of the van and puts the cost in the accounts.')) {
          await api('POST', `/jobs/materials/${encodeURIComponent(out.issue.id)}/approve`);
          toast('Recorded and approved', 'success');
        } else {
          toast('Saved — approve it in Job Costing → Awaiting Approval', 'success');
        }
      } else {
        toast('Recorded', 'success');
      }
      close();
      if (onDone) await onDone();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}
