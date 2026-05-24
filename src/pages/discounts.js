import { supabase } from '../supabase.js';
import { toast, formatDateTime, showLoader } from '../utils.js';
import { ICONS } from '../icons.js';

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

export async function renderDiscountsTab(container) {
  showLoader(container);
  const { data, error } = await supabase.from('discount_presets').select('*').order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="card"><div class="card-body" style="color:var(--danger)">Could not load discounts: ${esc(error.message)}</div></div>`;
    return;
  }
  const rows = data || [];
  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;">
      <div><h1>Discounts</h1><p>Create predefined discounts employees can select while billing</p></div>
      <button class="btn btn-primary" id="discount-add">${ICONS.plus}<span>Add Discount</span></button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Amount</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-dim)">No discount presets yet</td></tr>' : rows.map(r => `
              <tr>
                <td><b>${esc(r.name)}</b></td>
                <td><b style="color:var(--success)">${inr(r.amount)}</b></td>
                <td style="max-width:360px;white-space:normal;color:var(--text-soft)">${esc(r.description || '-')}</td>
                <td><span class="badge ${Number(r.active) === 1 ? 'badge-resolved' : 'badge-danger'}">${Number(r.active) === 1 ? 'Active' : 'Hidden'}</span></td>
                <td>
                  <button class="btn btn-secondary btn-sm discount-edit" data-id="${esc(r.id)}">${ICONS.edit}<span>Edit</span></button>
                  <button class="btn btn-secondary btn-sm discount-toggle" data-id="${esc(r.id)}">${Number(r.active) === 1 ? 'Hide' : 'Show'}</button>
                  <button class="btn btn-secondary btn-sm discount-delete" data-id="${esc(r.id)}" style="color:var(--danger)">${ICONS.close}<span>Delete</span></button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  const refresh = () => renderDiscountsTab(container);
  container.querySelector('#discount-add').onclick = () => openDiscountEditor(null, refresh);
  container.querySelectorAll('.discount-edit').forEach(btn => btn.onclick = () => openDiscountEditor(rows.find(r => r.id === btn.dataset.id), refresh));
  container.querySelectorAll('.discount-toggle').forEach(btn => btn.onclick = async () => {
    const row = rows.find(r => r.id === btn.dataset.id);
    const { error: e } = await supabase.from('discount_presets').update({ active: Number(row.active) === 1 ? 0 : 1 }).eq('id', row.id);
    if (e) return toast(e.message, 'error');
    toast(Number(row.active) === 1 ? 'Discount hidden' : 'Discount active', 'success');
    refresh();
  });
  container.querySelectorAll('.discount-delete').forEach(btn => btn.onclick = async () => {
    if (!confirm('Delete this discount?')) return;
    const { error: e } = await supabase.from('discount_presets').delete().eq('id', btn.dataset.id);
    if (e) return toast(e.message, 'error');
    toast('Discount deleted', 'success');
    refresh();
  });
}

function openDiscountEditor(row, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header"><span class="modal-title">${row ? 'Edit Discount' : 'Add Discount'}</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <label class="notice-editor-label">Discount Name</label>
        <input id="disc-name" class="notice-editor-input" value="${esc(row?.name || '')}" placeholder="Festival offer">
        <label class="notice-editor-label">Amount</label>
        <input id="disc-amount" class="notice-editor-input" type="number" min="0" step="1" value="${row?.amount || ''}" placeholder="100">
        <label class="notice-editor-label">Description</label>
        <textarea id="disc-desc" class="notice-editor-input notice-editor-textarea" rows="3" placeholder="Shown to employees while billing">${esc(row?.description || '')}</textarea>
        <label class="notice-editor-check"><input id="disc-active" type="checkbox" ${!row || Number(row.active) === 1 ? 'checked' : ''}> Active</label>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="disc-cancel">Cancel</button><button class="btn btn-primary" id="disc-save">Save</button></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#disc-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#disc-save').onclick = async () => {
    const payload = {
      name: overlay.querySelector('#disc-name').value.trim(),
      amount: Number(overlay.querySelector('#disc-amount').value) || 0,
      description: overlay.querySelector('#disc-desc').value.trim() || null,
      active: overlay.querySelector('#disc-active').checked ? 1 : 0,
    };
    if (!payload.name) return toast('Enter discount name', 'warning');
    if (payload.amount <= 0) return toast('Enter discount amount', 'warning');
    const res = row
      ? await supabase.from('discount_presets').update(payload).eq('id', row.id)
      : await supabase.from('discount_presets').insert(payload);
    if (res.error) return toast(res.error.message, 'error');
    toast(row ? 'Discount updated' : 'Discount added', 'success');
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
