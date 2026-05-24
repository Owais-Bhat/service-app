import { supabase } from '../supabase.js';
import { toast, formatDateTime, showLoader } from '../utils.js';
import { ICONS } from '../icons.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function setButtonLoading(btn, label = 'Saving') {
  if (!btn) return () => {};
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('is-loading');
  btn.innerHTML = `<span class="btn-spinner"></span><span>${label}</span>`;
  return () => {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    btn.innerHTML = originalHTML;
  };
}

function toDatetimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export async function renderNoticesTab(container) {
  showLoader(container);
  const { data, error } = await supabase.from('notices').select('*').order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger);">Could not load notices: ${escapeHtml(error.message || '')}</div></div>`;
    return;
  }

  const notices = data || [];
  const activeCount = notices.filter(n => Number(n.active) === 1).length;
  container.innerHTML = `
    <div class="page-header admin-notice-header">
      <div>
        <h1><span>${ICONS.clipboard}</span> Notice Board</h1>
        <p>Publish staff notices directly to the employee dashboard</p>
      </div>
      <button class="btn btn-primary" id="notice-add-btn">${ICONS.plus}<span>New Notice</span></button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${notices.length}</div><div class="stat-label">Total Notices</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${activeCount}</div><div class="stat-label">Active</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--text-dim)">${notices.length - activeCount}</div><div class="stat-label">Hidden</div></div>
    </div>
    <div class="admin-notice-grid">
      ${notices.length === 0 ? `
        <div class="card"><div class="card-body admin-notice-empty">${ICONS.clipboard}<p>No notices yet</p></div></div>
      ` : notices.map(n => `
        <article class="admin-notice-card notice-${escapeAttr(n.priority || 'normal')}">
          <div class="admin-notice-top">
            <span class="admin-notice-icon">${n.priority === 'urgent' ? ICONS.alert : n.priority === 'high' ? ICONS.star : ICONS.clipboard}</span>
            <div>
              <span class="badge ${Number(n.active) === 1 ? 'badge-resolved' : 'badge-danger'}">${Number(n.active) === 1 ? 'Active' : 'Hidden'}</span>
              <span class="badge badge-${n.priority === 'urgent' ? 'danger' : n.priority === 'high' ? 'medium' : 'open'}">${escapeHtml(n.priority || 'normal')}</span>
            </div>
          </div>
          <h3>${escapeHtml(n.title)}</h3>
          <p>${escapeHtml(n.body)}</p>
          <small>Posted ${formatDateTime(n.created_at)}${n.expires_at ? ` · Expires ${formatDateTime(n.expires_at)}` : ''}</small>
          <div class="admin-notice-actions">
            <button class="btn btn-secondary btn-sm notice-edit-btn" data-id="${escapeAttr(n.id)}">${ICONS.edit}<span>Edit</span></button>
            <button class="btn btn-secondary btn-sm notice-toggle-btn" data-id="${escapeAttr(n.id)}">${Number(n.active) === 1 ? 'Hide' : 'Show'}</button>
            <button class="btn btn-secondary btn-sm notice-delete-btn" data-id="${escapeAttr(n.id)}" style="color:var(--danger)">${ICONS.close}<span>Delete</span></button>
          </div>
        </article>
      `).join('')}
    </div>
  `;

  const refresh = () => renderNoticesTab(container);
  container.querySelector('#notice-add-btn').onclick = () => openNoticeEditor(null, refresh);
  container.querySelectorAll('.notice-edit-btn').forEach(btn => {
    btn.onclick = () => openNoticeEditor(notices.find(n => n.id === btn.dataset.id), refresh);
  });
  container.querySelectorAll('.notice-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const notice = notices.find(n => n.id === btn.dataset.id);
      const { error: updateError } = await supabase.from('notices').update({ active: Number(notice.active) === 1 ? 0 : 1 }).eq('id', notice.id);
      if (updateError) return toast('Could not update notice: ' + (updateError.message || ''), 'error');
      toast(Number(notice.active) === 1 ? 'Notice hidden' : 'Notice published', 'success');
      refresh();
    };
  });
  container.querySelectorAll('.notice-delete-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this notice?')) return;
      const { error: deleteError } = await supabase.from('notices').delete().eq('id', btn.dataset.id);
      if (deleteError) return toast('Could not delete notice: ' + (deleteError.message || ''), 'error');
      toast('Notice deleted', 'success');
      refresh();
    };
  });
}

function openNoticeEditor(notice, onChange) {
  const editing = !!notice;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">${editing ? 'Edit Notice' : 'New Notice'}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <label class="notice-editor-label">Title</label>
        <input id="notice-title" maxlength="160" value="${escapeAttr(notice?.title || '')}" placeholder="Morning briefing at 10 AM" class="notice-editor-input">
        <label class="notice-editor-label">Notice Message</label>
        <textarea id="notice-body" rows="5" placeholder="Write the update employees should see..." class="notice-editor-input notice-editor-textarea">${escapeHtml(notice?.body || '')}</textarea>
        <div class="notice-editor-grid">
          <div>
            <label class="notice-editor-label">Priority</label>
            <select id="notice-priority" class="notice-editor-input">
              <option value="normal" ${(notice?.priority || 'normal') === 'normal' ? 'selected' : ''}>Normal</option>
              <option value="high" ${notice?.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="urgent" ${notice?.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
            </select>
          </div>
          <div>
            <label class="notice-editor-label">Expires At</label>
            <input id="notice-expires" type="datetime-local" value="${toDatetimeLocal(notice?.expires_at)}" class="notice-editor-input">
          </div>
        </div>
        <label class="notice-editor-check">
          <input id="notice-active" type="checkbox" ${!notice || Number(notice.active) === 1 ? 'checked' : ''}>
          Publish to employee dashboard
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="notice-cancel">Cancel</button>
        <button class="btn btn-primary" id="notice-save">${editing ? 'Save Notice' : 'Publish Notice'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#notice-cancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#notice-save').onclick = async () => {
    const title = overlay.querySelector('#notice-title').value.trim();
    const body = overlay.querySelector('#notice-body').value.trim();
    const priority = overlay.querySelector('#notice-priority').value;
    const expires = overlay.querySelector('#notice-expires').value;
    const active = overlay.querySelector('#notice-active').checked ? 1 : 0;
    if (!title) return toast('Notice title is required', 'warning');
    if (!body) return toast('Notice message is required', 'warning');

    const payload = {
      title,
      body,
      priority,
      active,
      expires_at: expires ? new Date(expires).toISOString().slice(0, 19).replace('T', ' ') : null,
    };
    if (!editing) {
      const { data: { user } } = await supabase.auth.getUser();
      payload.created_by = user?.id || null;
    }

    const btn = overlay.querySelector('#notice-save');
    const restore = setButtonLoading(btn, 'Saving');
    const res = editing
      ? await supabase.from('notices').update(payload).eq('id', notice.id)
      : await supabase.from('notices').insert(payload);
    restore();
    if (res.error) return toast('Could not save notice: ' + (res.error.message || ''), 'error');
    toast(editing ? 'Notice updated' : 'Notice published', 'success');
    close();
    if (onChange) onChange();
  };
}
