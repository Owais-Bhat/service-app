// A customer or supplier added without leaving the invoice or purchase order
// being written. It is the same record Customers & Suppliers holds — this is
// only a shorter door into it.
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';

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

let businessState = null;
async function stateOfBusiness() {
  if (businessState === null) {
    try { businessState = (await api('GET', '/accounting/business')).business?.state_code || ''; } catch { businessState = ''; }
  }
  return businessState;
}

/**
 * @param {'customer'|'supplier'} kind
 * @param {(party: object) => void} onCreated  called with the saved party
 */
export function openQuickParty({ kind = 'customer', onCreated }) {
  const word = kind === 'supplier' ? 'supplier' : 'customer';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10050'; // above the invoice or order that opened it
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:480px">
      <div class="modal-header">
        <span class="modal-title">New ${word}</span>
        <button class="modal-close" id="qp-close" type="button">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Name *</label><input type="text" id="qp-name" placeholder="Person or company" autocomplete="off"></div>
        <div class="at2-grid">
          <div class="form-group"><label>Phone</label><input type="tel" id="qp-phone" placeholder="10-digit mobile"></div>
          <div class="form-group"><label>GSTIN <small>(if registered)</small></label><input type="text" id="qp-gstin" maxlength="15" placeholder="15 characters" style="text-transform:uppercase"></div>
        </div>
        <div class="at2-grid">
          <div class="form-group"><label>City / area</label><input type="text" id="qp-city" placeholder="Srinagar"></div>
          <div class="form-group"><label>Credit days</label><input type="number" id="qp-credit" min="0" step="1" placeholder="0"></div>
        </div>
        <small style="color:var(--text-dim);font-size:0.78rem">It is saved in Customers &amp; Suppliers too, where the rest of the details can be added.</small>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="qp-cancel" type="button">Cancel</button>
        <button class="btn btn-primary" id="qp-save" type="button">Save ${word}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#qp-close').onclick = close;
  $('#qp-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  setTimeout(() => $('#qp-name')?.focus(), 60);

  const save = async () => {
    const name = $('#qp-name').value.trim();
    if (!name) { toast(`Enter the ${word}'s name`, 'warning'); $('#qp-name').focus(); return; }
    const gstin = $('#qp-gstin').value.trim().toUpperCase();
    const city = $('#qp-city').value.trim();
    const state = await stateOfBusiness();

    const btn = $('#qp-save');
    btn.disabled = true;
    try {
      const party = await api('POST', '/parties', {
        display_name: name, kind: word,
        phone: $('#qp-phone').value.trim() || null,
        gstin: gstin || null,
        // The state a supply is taxed for: taken from the GSTIN when there is
        // one (the server does that), else assumed to be the business's own.
        place_of_supply_state_code: gstin ? undefined : (state || undefined),
        credit_days: Number($('#qp-credit').value) || 0,
        addresses: city ? [{ kind: 'billing', city, state_code: state || undefined, is_default: true }] : [],
      });
      toast(`${esc(name)} added`, 'success');
      close();
      onCreated?.(party);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
  $('#qp-save').onclick = save;
  overlay.querySelectorAll('input').forEach((el) => { el.onkeydown = (e) => { if (e.key === 'Enter') save(); }; });
}
