import { supabase } from '../supabase.js';
import { toast, formatDateTime, showLoader } from '../utils.js';
import { ICONS } from '../icons.js';

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const couponValue = (r) => (r.type === 'percent')
  ? `${Number(r.value)}% off${r.max_discount ? ` (max ${inr(r.max_discount)})` : ''}`
  : `${inr(r.value)} off`;

export async function renderDiscountsTab(container) {
  showLoader(container);
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="card"><div class="card-body" style="color:var(--danger)">Could not load coupons: ${esc(error.message)}</div></div>`;
    return;
  }
  const rows = data || [];
  const isExpired = (r) => r.expires_at && new Date(r.expires_at).getTime() < Date.now();
  const isUsedUp = (r) => r.usage_limit != null && Number(r.used_count) >= Number(r.usage_limit);
  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;">
      <div><h1>Coupons</h1><p>Create redeemable coupon codes employees enter at billing. Customers quote a code to get the discount.</p></div>
      <button class="btn btn-primary" id="coupon-add">${ICONS.plus}<span>Add Coupon</span></button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Discount</th><th>Min Bill</th><th>Usage</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No coupons yet. Create one to let customers redeem a discount.</td></tr>' : rows.map(r => {
              const expired = isExpired(r);
              const usedUp = isUsedUp(r);
              const live = Number(r.active) === 1 && !expired && !usedUp;
              const statusLabel = Number(r.active) !== 1 ? 'Hidden' : expired ? 'Expired' : usedUp ? 'Used up' : 'Active';
              return `
              <tr>
                <td><code style="font-size:0.82rem;font-weight:800;color:var(--primary);letter-spacing:.04em;">${esc(r.code)}</code>${r.description ? `<br/><small style="color:var(--text-soft)">${esc(r.description)}</small>` : ''}</td>
                <td><b style="color:var(--success)">${esc(couponValue(r))}</b></td>
                <td>${Number(r.min_amount) > 0 ? inr(r.min_amount) : '—'}</td>
                <td>${Number(r.used_count) || 0}${r.usage_limit != null ? ` / ${r.usage_limit}` : ' / ∞'}</td>
                <td>${r.expires_at ? `<small style="color:${expired ? 'var(--danger)' : 'var(--text-dim)'}">${formatDateTime(r.expires_at)}</small>` : '<small style="color:var(--text-dim)">Never</small>'}</td>
                <td><span class="badge ${live ? 'badge-resolved' : 'badge-danger'}">${statusLabel}</span></td>
                <td>
                  <button class="btn btn-secondary btn-sm coupon-edit" data-id="${esc(r.id)}">${ICONS.edit}<span>Edit</span></button>
                  <button class="btn btn-secondary btn-sm coupon-toggle" data-id="${esc(r.id)}">${Number(r.active) === 1 ? 'Hide' : 'Show'}</button>
                  <button class="btn btn-secondary btn-sm coupon-delete" data-id="${esc(r.id)}" style="color:var(--danger)">${ICONS.close}<span>Delete</span></button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  const refresh = () => renderDiscountsTab(container);
  container.querySelector('#coupon-add').onclick = () => openCouponEditor(null, refresh);
  container.querySelectorAll('.coupon-edit').forEach(btn => btn.onclick = () => openCouponEditor(rows.find(r => r.id === btn.dataset.id), refresh));
  container.querySelectorAll('.coupon-toggle').forEach(btn => btn.onclick = async () => {
    const row = rows.find(r => r.id === btn.dataset.id);
    const { error: e } = await supabase.from('coupons').update({ active: Number(row.active) === 1 ? 0 : 1 }).eq('id', row.id);
    if (e) return toast(e.message, 'error');
    toast(Number(row.active) === 1 ? 'Coupon hidden' : 'Coupon active', 'success');
    refresh();
  });
  container.querySelectorAll('.coupon-delete').forEach(btn => btn.onclick = async () => {
    if (!confirm('Delete this coupon?')) return;
    const { error: e } = await supabase.from('coupons').delete().eq('id', btn.dataset.id);
    if (e) return toast(e.message, 'error');
    toast('Coupon deleted', 'success');
    refresh();
  });
}

// Convert a stored DATETIME (or null) into the value a datetime-local input wants.
function toLocalInput(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openCouponEditor(row, onDone) {
  const isPercent = row?.type === 'percent';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:540px">
      <div class="modal-header"><span class="modal-title">${row ? 'Edit Coupon' : 'Add Coupon'}</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <label class="notice-editor-label">Coupon Code</label>
        <input id="cp-code" class="notice-editor-input" value="${esc(row?.code || '')}" placeholder="SAVE50" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700;">
        <label class="notice-editor-label">Discount Type</label>
        <select id="cp-type" class="notice-editor-input">
          <option value="fixed" ${!isPercent ? 'selected' : ''}>Fixed amount (₹ off)</option>
          <option value="percent" ${isPercent ? 'selected' : ''}>Percentage (% off)</option>
        </select>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label class="notice-editor-label"><span id="cp-value-label">${isPercent ? 'Percent off (%)' : 'Amount off (₹)'}</span></label>
            <input id="cp-value" class="notice-editor-input" type="number" min="0" step="1" value="${row?.value ?? ''}" placeholder="${isPercent ? '10' : '50'}">
          </div>
          <div id="cp-maxwrap" style="display:${isPercent ? 'block' : 'none'};">
            <label class="notice-editor-label">Max discount (₹, optional)</label>
            <input id="cp-max" class="notice-editor-input" type="number" min="0" step="1" value="${row?.max_discount ?? ''}" placeholder="200">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label class="notice-editor-label">Min bill (₹, optional)</label>
            <input id="cp-min" class="notice-editor-input" type="number" min="0" step="1" value="${row?.min_amount ? Number(row.min_amount) : ''}" placeholder="0">
          </div>
          <div>
            <label class="notice-editor-label">Usage limit (optional)</label>
            <input id="cp-limit" class="notice-editor-input" type="number" min="1" step="1" value="${row?.usage_limit ?? ''}" placeholder="Unlimited">
          </div>
        </div>
        <label class="notice-editor-label">Expires at (optional)</label>
        <input id="cp-expires" class="notice-editor-input" type="datetime-local" value="${toLocalInput(row?.expires_at)}">
        <label class="notice-editor-label">Description (optional)</label>
        <textarea id="cp-desc" class="notice-editor-input notice-editor-textarea" rows="2" placeholder="Internal note, e.g. Diwali festival offer">${esc(row?.description || '')}</textarea>
        <label class="notice-editor-check"><input id="cp-active" type="checkbox" ${!row || Number(row.active) === 1 ? 'checked' : ''}> Active</label>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="cp-cancel">Cancel</button><button class="btn btn-primary" id="cp-save">Save</button></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#cp-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const typeSel = overlay.querySelector('#cp-type');
  const syncType = () => {
    const pct = typeSel.value === 'percent';
    overlay.querySelector('#cp-maxwrap').style.display = pct ? 'block' : 'none';
    overlay.querySelector('#cp-value-label').textContent = pct ? 'Percent off (%)' : 'Amount off (₹)';
  };
  typeSel.onchange = syncType;

  overlay.querySelector('#cp-save').onclick = async () => {
    const type = typeSel.value === 'percent' ? 'percent' : 'fixed';
    const code = overlay.querySelector('#cp-code').value.trim().toUpperCase();
    const value = Number(overlay.querySelector('#cp-value').value) || 0;
    const maxDiscount = overlay.querySelector('#cp-max').value ? Number(overlay.querySelector('#cp-max').value) : null;
    const minAmount = Number(overlay.querySelector('#cp-min').value) || 0;
    const usageLimit = overlay.querySelector('#cp-limit').value ? Math.max(1, parseInt(overlay.querySelector('#cp-limit').value, 10)) : null;
    const expiresRaw = overlay.querySelector('#cp-expires').value;
    const expiresAt = expiresRaw ? expiresRaw.replace('T', ' ') + ':00' : null;
    if (!code) return toast('Enter a coupon code', 'warning');
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) return toast('Code: 2–40 letters, numbers, - or _', 'warning');
    if (value <= 0) return toast('Enter a discount value above 0', 'warning');
    if (type === 'percent' && value > 100) return toast('Percentage cannot exceed 100', 'warning');
    const payload = {
      code, type, value,
      max_discount: type === 'percent' ? maxDiscount : null,
      min_amount: minAmount,
      usage_limit: usageLimit,
      expires_at: expiresAt,
      description: overlay.querySelector('#cp-desc').value.trim() || null,
      active: overlay.querySelector('#cp-active').checked ? 1 : 0,
    };
    const res = row
      ? await supabase.from('coupons').update(payload).eq('id', row.id)
      : await supabase.from('coupons').insert(payload);
    if (res.error) {
      const msg = /duplicate|unique/i.test(res.error.message || '') ? 'That coupon code already exists' : res.error.message;
      return toast(msg, 'error');
    }
    toast(row ? 'Coupon updated' : 'Coupon created', 'success');
    close();
    onDone();
  };
}

export async function renderDiscountRequestsTab(container) {
  showLoader(container);
  const [{ data: rowsData }, { data: profiles }] = await Promise.all([
    supabase.from('inquiries').select('*').order('bill_generated_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name,phone'),
  ]);
  const profileById = new Map((profiles || []).map(p => [p.id, p]));
  const rows = (rowsData || []).filter(r => Number(r.discount_amount) > 0);
  container.innerHTML = `
    <div class="page-header">
      <h1>Discount Details</h1>
      <p>All bills where employees applied admin or manual discounts</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${rows.length}</div><div class="stat-label">Discounted Bills</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${inr(rows.reduce((a,r)=>a + Number(r.discount_amount || 0),0))}</div><div class="stat-label">Total Discount</div></div>
      <div class="stat-card"><div class="stat-value">${rows.filter(r => r.discount_reason).length}</div><div class="stat-label">Manual Reasons</div></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Employee</th><th>Discount</th><th>Reason / Source</th></tr></thead>
          <tbody>
            ${rows.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No discounts applied yet</td></tr>' : rows.map(r => `
              <tr>
                <td><small style="color:var(--text-dim)">${r.bill_generated_at ? formatDateTime(r.bill_generated_at) : '-'}</small></td>
                <td><code style="font-size:0.75rem;color:var(--primary)">${esc(r.ticket_no || '-')}</code></td>
                <td><b>${esc(r.full_name || 'Client')}</b><br/><small>${esc(r.service_item || '')}</small></td>
                <td>${esc(profileById.get(r.assigned_employee_id)?.full_name || 'Employee')}</td>
                <td><b style="color:var(--success)">${inr(r.discount_amount)}</b><br/><small>${esc(r.discount_label || 'Discount')}</small></td>
                <td style="max-width:420px;white-space:normal;color:var(--text-soft)">${esc(r.discount_reason || (r.discount_preset_id ? 'Admin preset selected, no reason required' : 'Automatic discount'))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
