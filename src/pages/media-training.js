import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { toast, formatDateTime, showLoader } from '../utils.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function money(value) {
  const val = Math.round(Number(value) || 0);
  return `₹${val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function mediaPreview(item) {
  const url = escapeAttr(item.url || '');
  if (!url) return '';
  if (item.kind === 'video') {
    return `<video src="${url}" controls playsinline style="width:100%;max-height:260px;border-radius:8px;background:#000;"></video>`;
  }
  return `<img src="${url}" alt="${escapeAttr(item.caption || item.title || 'Media')}" style="width:100%;max-height:260px;object-fit:cover;border-radius:8px;display:block;"/>`;
}

async function uploadMediaFile(file) {
  if (!file) throw new Error('Choose an image or video file first.');
  const form = new FormData();
  form.append('file', file);
  const token = localStorage.getItem('auth_token');
  const apiBase = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ? '/api'
    : 'http://localhost:5000/api';
  const res = await fetch(`${apiBase}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

function fileKind(file) {
  return String(file?.type || '').startsWith('video/') ? 'video' : 'image';
}

function deviceMatches(target) {
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  if (target === 'mobile') return isMobile;
  if (target === 'desktop') return !isMobile;
  return true;
}

function showPopupAd(item, storageKey) {
  if (!item?.url || sessionStorage.getItem(storageKey) === '1') return;
  sessionStorage.setItem(storageKey, '1');
  const isVideo = (item.kind || 'image').toLowerCase() === 'video';
  const url = escapeAttr(item.url || '');
  const overlay = document.createElement('div');
  overlay.className = 'media-popup-overlay';
  overlay.innerHTML = `
    <div class="media-popup-dialog" role="dialog" aria-modal="true">
      <button type="button" class="media-popup-close" aria-label="Close">${ICONS.close}</button>
      <div class="media-popup-frame">
        ${isVideo
          ? `<video src="${url}" controls autoplay muted playsinline></video>`
          : `<img src="${url}" alt="${escapeAttr(item.caption || 'Popup ad')}"/>`}
      </div>
      ${item.caption ? `<div class="media-popup-caption">${escapeHtml(item.caption)}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.media-popup-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

export async function mountEmployeePopupAds() {
  try {
    const { data } = await supabase
      .from('ads')
      .select('*')
      .eq('placement', 'popup_employee')
      .eq('active', 1)
      .order('position', { ascending: true });
    const now = Date.now();
    const item = (data || []).find(ad => {
      if (!deviceMatches(ad.device_target || 'both')) return false;
      if (ad.starts_at && new Date(ad.starts_at).getTime() > now) return false;
      if (ad.expires_at && new Date(ad.expires_at).getTime() <= now) return false;
      return true;
    });
    if (item) showPopupAd(item, `employee-popup-${item.id}`);
  } catch (err) {
    console.warn('[popup ads] employee load failed', err);
  }
}

function openPopupAdEditor(ad, onChange) {
  const editing = !!ad;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">${editing ? 'Edit popup' : 'Add popup'}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Media type</label>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <label style="flex:1;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;text-align:center;font-weight:700;">
            <input type="radio" name="popup-kind" value="image" ${!ad || ad.kind === "image" ? "checked" : ""} style="margin-right:6px"/> Image
          </label>
          <label style="flex:1;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;text-align:center;font-weight:700;">
            <input type="radio" name="popup-kind" value="video" ${ad?.kind === "video" ? "checked" : ""} style="margin-right:6px"/> Video
          </label>
        </div>
        <div style="margin-bottom:14px;">
          <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Media source</label>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <label style="font-size:0.85rem;cursor:pointer;"><input type="radio" name="popup-media-source" value="upload" checked> Upload file</label>
            <label style="font-size:0.85rem;cursor:pointer;"><input type="radio" name="popup-media-source" value="url"> Enter URL</label>
          </div>
          <div id="popup-media-upload-div">
            <input type="file" id="popup-file" accept="image/*,video/*" style="width:100%;padding:8px;border-radius:10px;border:1px dashed var(--border);background:var(--bg);font-size:0.9rem;" />
          </div>
          <div id="popup-media-url-div" style="display:none;">
            <input id="popup-url" type="url" placeholder="https://…/image.jpg or https://…/video.mp4"
                   value="${escapeHtml(ad?.url || "")}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
          ${ad?.url ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;overflow:hidden;text-overflow:ellipsis;">Current: <a href="${escapeHtml(ad.url)}" target="_blank" style="color:var(--primary)">${escapeHtml(ad.url)}</a></div>` : ""}
        </div>
        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Popup target ${editing ? '' : '(required)'}</label>
        <select id="popup-placement" ${editing ? 'disabled' : ''} style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;margin-bottom:14px;">
          <option value="popup_landing" ${ad?.placement === "popup_landing" ? "selected" : ""}>Landing page popup</option>
          <option value="popup_employee" ${ad?.placement === "popup_employee" ? "selected" : ""}>Employee portal popup</option>
        </select>
        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Device target</label>
        <select id="popup-device-target" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;margin-bottom:14px;">
          <option value="both" ${!ad?.device_target || ad.device_target === "both" ? "selected" : ""}>Both mobile and desktop</option>
          <option value="desktop" ${ad?.device_target === "desktop" ? "selected" : ""}>Desktop only</option>
          <option value="mobile" ${ad?.device_target === "mobile" ? "selected" : ""}>Mobile only</option>
        </select>
        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Caption (optional)</label>
        <input id="popup-caption" type="text" maxlength="255" placeholder="Title or description"
               value="${escapeHtml(ad?.caption || "")}"
               style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;margin-bottom:14px;"/>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div>
            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Duration (seconds)</label>
            <input id="popup-duration" type="number" min="2" max="60" step="0.5"
                   value="${ad ? (Number(ad.duration_ms) || 6000) / 1000 : 6}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
          <div>
            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Position</label>
            <input id="popup-position" type="number" min="0" step="1"
                   value="${ad?.position ?? 0}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.9rem;margin-bottom:14px;">
          <input id="popup-active" type="checkbox" ${!ad || ad.active ? "checked" : ""}/>
          Active (show popup)
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="popup-cancel">Cancel</button>
        <button class="btn btn-primary" id="popup-save">${editing ? "Save" : "Add popup"}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#popup-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelectorAll('input[name="popup-media-source"]').forEach((r) => {
    r.onchange = () => {
      overlay.querySelector('#popup-media-upload-div').style.display = r.value === 'upload' ? 'block' : 'none';
      overlay.querySelector('#popup-media-url-div').style.display = r.value === 'url' ? 'block' : 'none';
    };
  });

  overlay.querySelector('#popup-save').onclick = async () => {
    const kind = overlay.querySelector('input[name="popup-kind"]:checked').value;
    const caption = overlay.querySelector('#popup-caption').value.trim();
    const durationSec = parseFloat(overlay.querySelector('#popup-duration').value);
    const position = parseInt(overlay.querySelector('#popup-position').value, 10) || 0;
    const active = overlay.querySelector('#popup-active').checked ? 1 : 0;
    const deviceTarget = overlay.querySelector('#popup-device-target').value;
    const placement = overlay.querySelector('#popup-placement').value;

    const radioUpload = overlay.querySelector('input[name="popup-media-source"][value="upload"]').checked;
    const fileInput = overlay.querySelector('#popup-file');
    let url = overlay.querySelector('#popup-url').value.trim();

    if (radioUpload && fileInput.files.length > 0) {
      const btn = overlay.querySelector('#popup-save');
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      try {
        url = await uploadMediaFile(fileInput.files[0]);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = editing ? 'Save' : 'Add popup';
        return toast(err.message, 'error');
      }
    }

    if (!url) {
      if (ad?.url) {
        url = ad.url;
      } else {
        return toast('Media file or URL is required', 'error');
      }
    }

    if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/'))
      return toast('URL must start with http(s):// or /uploads/', 'error');

    if (!Number.isFinite(durationSec) || durationSec < 2)
      return toast('Duration must be at least 2 seconds', 'error');

    const payload = {
      kind,
      url,
      caption: caption || null,
      placement,
      device_target: deviceTarget,
      duration_ms: Math.round(durationSec * 1000),
      position,
      active,
    };

    let res;
    if (editing) {
      res = await supabase.from('ads').update(payload).eq('id', ad.id);
    } else {
      res = await supabase.from('ads').insert(payload);
    }

    if (res.error)
      return toast('Could not save: ' + (res.error.message || ''), 'error');

    toast(editing ? 'Popup updated' : 'Popup added', 'success');
    close();
    if (onChange) onChange();
  };
}

export async function renderPopupAdsTab(container) {
  showLoader(container);
  const { data, error } = await supabase.from('ads').select('*').order('position', { ascending: true });
  if (error) {
    container.innerHTML = `<div class="card"><div class="card-body">Could not load media: ${escapeHtml(error.message)}</div></div>`;
    return;
  }
  const items = (data || []).filter(item => ['popup_landing', 'popup_employee'].includes(item.placement));
  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Popup Ads</h1>
        <p>Upload full-screen popup images or videos for the landing page and employee portal</p>
      </div>
    </div>
    <div class="card" style="margin-bottom:22px;">
      <div class="card-header"><span class="card-title">${ICONS.upload}<span style="margin-left:8px">Upload Media</span></span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
          <div class="form-group"><label>Popup target</label><select id="media-placement"><option value="popup_landing">Landing page popup</option><option value="popup_employee">Employee portal popup</option></select></div>
          <div class="form-group"><label>Device target</label><select id="media-device-target"><option value="both">Both</option><option value="desktop">Desktop only</option><option value="mobile">Mobile only</option></select></div>
          <div class="form-group"><label>Caption</label><input id="media-caption" placeholder="Short title shown with the media"/></div>
          <div class="form-group"><label>Position</label><input id="media-position" type="number" value="0"/></div>
          <div class="form-group"><label>Duration (seconds)</label><input id="media-duration" type="number" min="2" value="6"/></div>
          <div class="form-group"><label>File</label><input id="media-file" type="file" accept="image/*,video/*"/></div>
        </div>
        <div style="padding:12px;border-radius:8px;background:var(--bg-soft);border:1px solid var(--border);font-size:0.84rem;color:var(--text-soft);line-height:1.55;margin-top:6px;">
          <b>Recommended popup sizes:</b> desktop 1200x800, mobile 900x1200, square 1080x1080. Use JPG/WebP/PNG under 2 MB for images and MP4/WebM under 20 MB for videos.
        </div>
        <button class="btn btn-primary" id="media-save" style="margin-top:14px;">${ICONS.upload}<span>Upload & Publish</span></button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Published Media</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Preview</th><th>Placement</th><th>Caption</th><th>Status</th><th>Position</th><th style="width:240px">Actions</th></tr></thead>
          <tbody>
            ${items.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-dim)">No media uploaded yet</td></tr>' : items.map(item => `
              <tr>
                <td style="width:180px">${mediaPreview(item)}</td>
                <td><span class="badge badge-open">${escapeHtml(item.placement === 'popup_employee' ? 'Employee popup' : 'Landing popup')}</span><br/><small style="color:var(--text-dim)">${escapeHtml(item.device_target || 'both')}</small></td>
                <td><b>${escapeHtml(item.caption || 'Untitled')}</b><br/><small style="color:var(--text-dim)">${escapeHtml(item.kind)}</small></td>
                <td>${Number(item.active) === 1 ? '<span class="badge badge-resolved">Active</span>' : '<span class="badge badge-medium">Hidden</span>'}</td>
                <td>${Number(item.position) || 0}</td>
                <td><button class="btn btn-secondary btn-sm popup-edit-btn" data-id="${escapeAttr(item.id)}">Edit</button><button class="btn btn-secondary btn-sm media-toggle" data-id="${escapeAttr(item.id)}" data-active="${Number(item.active) === 1 ? 0 : 1}">${Number(item.active) === 1 ? 'Hide' : 'Show'}</button><button class="btn btn-secondary btn-sm popup-delete-btn" data-id="${escapeAttr(item.id)}" style="color:var(--danger)">Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelector('#media-save').onclick = async () => {
    const btn = container.querySelector('#media-save');
    const file = container.querySelector('#media-file').files[0];
    btn.disabled = true;
    btn.innerHTML = '<span>Uploading...</span>';
    try {
      const url = await uploadMediaFile(file);
      const { error: saveErr } = await supabase.from('ads').insert({
        kind: fileKind(file),
        url,
        caption: container.querySelector('#media-caption').value.trim(),
        placement: container.querySelector('#media-placement').value,
        device_target: container.querySelector('#media-device-target').value,
        duration_ms: Math.max(2, Number(container.querySelector('#media-duration').value) || 6) * 1000,
        position: Number(container.querySelector('#media-position').value) || 0,
        active: 1,
      });
      if (saveErr) throw new Error(saveErr.message);
      toast('Media published', 'success');
      renderPopupAdsTab(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `${ICONS.upload}<span>Upload & Publish</span>`;
    }
  };
  const refresh = () => renderPopupAdsTab(container);
  container.querySelectorAll('.popup-edit-btn').forEach(btn => {
    btn.onclick = () => {
      const ad = items.find(i => String(i.id) === btn.dataset.id);
      if (ad) openPopupAdEditor(ad, refresh);
    };
  });
  container.querySelectorAll('.media-toggle').forEach(btn => {
    btn.onclick = async () => {
      const { error: updateErr } = await supabase.from('ads').update({ active: Number(btn.dataset.active) }).eq('id', btn.dataset.id);
      if (updateErr) toast(updateErr.message, 'error');
      else refresh();
    };
  });
  container.querySelectorAll('.popup-delete-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this popup ad? This cannot be undone.')) return;
      const { error: deleteErr } = await supabase.from('ads').delete().eq('id', btn.dataset.id);
      if (deleteErr) return toast('Could not delete: ' + (deleteErr.message || ''), 'error');
      toast('Popup ad deleted', 'success');
      refresh();
    };
  });
}

export async function renderTrainingAdminTab(container) {
  showLoader(container);
  const [{ data: items }, { data: completions }, { data: employees }] = await Promise.all([
    supabase.from('training_items').select('*').order('position', { ascending: true }),
    supabase.from('training_completions').select('*, profiles(full_name)').order('completed_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name').eq('role', 'employee'),
  ]);
  const itemList = items || [];
  const employeeList = employees || [];
  const completionList = completions || [];
  const byItem = new Map();
  completionList.forEach(row => {
    if (!byItem.has(row.item_id)) byItem.set(row.item_id, []);
    byItem.get(row.item_id).push(row);
  });
  const empCount = employeeList.length || 1;
  const completionPctOf = (item) => Math.round(((byItem.get(item.id) || []).length / empCount) * 100);
  const avgCompletion = itemList.length ? Math.round(itemList.reduce((s, i) => s + completionPctOf(i), 0) / itemList.length) : 0;
  const fullyDone = itemList.filter(i => (byItem.get(i.id) || []).length >= empCount && empCount > 0).length;

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div><h1>Employee Tutorials</h1><p>Upload training media and monitor completion live</p></div>
    </div>

    <div class="stats-grid" style="margin-bottom:22px;">
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${itemList.length}</div><div class="stat-label">Tutorials</div></div>
      <div class="stat-card"><div class="stat-value">${employeeList.length}</div><div class="stat-label">Employees</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${avgCompletion}%</div><div class="stat-label">Avg Completion</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${fullyDone}</div><div class="stat-label">Fully Completed</div></div>
    </div>

    <div class="card tut-upload" style="margin-bottom:22px;">
      <div class="card-header"><span class="card-title">${ICONS.upload}<span style="margin-left:8px">Upload New Tutorial</span></span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;">
          <div class="form-group"><label>Title</label><input id="training-title" placeholder="e.g. How to bill a service"/></div>
          <div class="form-group"><label>Category</label><input id="training-category" placeholder="e.g. Billing, Safety" value="General"/></div>
          <div class="form-group"><label>Position (order)</label><input id="training-position" type="number" value="0"/></div>
          <div class="form-group"><label>Image / Video file</label><input id="training-file" type="file" accept="image/*,video/*"/></div>
        </div>
        <div class="form-group"><label>Description</label><textarea id="training-desc" rows="2" placeholder="What should the employee learn from this?"></textarea></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;"><input id="training-required" type="checkbox" checked style="width:18px;height:18px;"/> Required for all employees</label>
          <button class="btn btn-primary" id="training-save">${ICONS.upload}<span>Upload Tutorial</span></button>
        </div>
      </div>
    </div>

    <div class="tut-admin-grid">
      ${itemList.length === 0 ? '<div class="card"><div class="card-body" style="text-align:center;padding:36px;color:var(--text-dim)">No tutorials uploaded yet — add your first above.</div></div>' : itemList.map(item => {
        const done = byItem.get(item.id) || [];
        const doneIds = new Set(done.map(x => x.employee_id));
        const pendingNames = employeeList.filter(e => !doneIds.has(e.id)).map(e => e.full_name);
        const pctv = completionPctOf(item);
        const req = Number(item.required) !== 0;
        return `
          <div class="card tut-admin-card ${Number(item.active) === 1 ? '' : 'is-hidden'}">
            <div class="tut-admin-thumb">
              ${item.kind === 'video' ? `<video src="${escapeAttr(item.url)}#t=0.1" muted preload="metadata"></video><span class="tut-play">${ICONS.play}</span>` : `<img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.title)}"/>`}
              <div class="tut-badges">
                <span class="tut-type">${item.kind === 'video' ? '📹 Video' : '🖼️ Image'}</span>
                ${req ? '<span class="tut-req">Required</span>' : '<span class="tut-opt">Optional</span>'}
                ${Number(item.active) === 1 ? '' : '<span class="tut-hidden-tag">Hidden</span>'}
              </div>
            </div>
            <div class="tut-admin-body">
              <div class="tut-admin-head">
                <div class="tut-title">${escapeHtml(item.title)}</div>
                <span class="badge badge-open">${escapeHtml(item.category || 'General')}</span>
              </div>
              <p class="tut-desc">${escapeHtml(item.description || '')}</p>
              <div class="tut-admin-progress">
                <div class="tut-admin-progress-top"><span>${done.length} / ${employeeList.length} completed</span><b>${pctv}%</b></div>
                <div class="tut-bar"><span style="width:${pctv}%"></span></div>
              </div>
              ${pendingNames.length
                ? `<details class="tut-pending"><summary>${pendingNames.length} pending</summary><div class="tut-pending-list">${pendingNames.map(n => escapeHtml(n)).join(', ')}</div></details>`
                : '<span class="badge badge-resolved" style="margin-top:8px;display:inline-block;">✓ All employees complete</span>'}
              <div class="tut-admin-actions">
                <button class="btn btn-secondary btn-sm training-edit" data-id="${escapeAttr(item.id)}">${ICONS.edit}<span>Edit</span></button>
                <button class="btn btn-secondary btn-sm training-toggle" data-id="${escapeAttr(item.id)}" data-active="${Number(item.active) === 1 ? 0 : 1}">${Number(item.active) === 1 ? 'Hide' : 'Show'}</button>
                <button class="btn btn-secondary btn-sm training-delete" data-id="${escapeAttr(item.id)}" style="color:var(--danger)">${ICONS.close}<span>Delete</span></button>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
  container.querySelector('#training-save').onclick = async () => {
    const btn = container.querySelector('#training-save');
    const file = container.querySelector('#training-file').files[0];
    const title = container.querySelector('#training-title').value.trim();
    if (!title) return toast('Tutorial title is required', 'warning');
    btn.disabled = true;
    btn.innerHTML = '<span>Uploading...</span>';
    try {
      const url = await uploadMediaFile(file);
      const { error } = await supabase.from('training_items').insert({
        title,
        description: container.querySelector('#training-desc').value.trim(),
        category: container.querySelector('#training-category').value.trim() || 'General',
        required: container.querySelector('#training-required').checked ? 1 : 0,
        kind: fileKind(file),
        url,
        position: Number(container.querySelector('#training-position').value) || 0,
        active: 1,
      });
      if (error) throw new Error(error.message);
      toast('Tutorial uploaded', 'success');
      renderTrainingAdminTab(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `${ICONS.upload}<span>Upload Tutorial</span>`;
    }
  };
  container.querySelectorAll('.training-toggle').forEach(btn => {
    btn.onclick = async () => {
      const { error } = await supabase.from('training_items').update({ active: Number(btn.dataset.active) }).eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else renderTrainingAdminTab(container);
    };
  });
  container.querySelectorAll('.training-edit').forEach(btn => {
    btn.onclick = () => {
      const item = itemList.find(i => String(i.id) === btn.dataset.id);
      if (item) openTutorialEditor(item, () => renderTrainingAdminTab(container));
    };
  });
  container.querySelectorAll('.training-delete').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this tutorial? Completion records for it will also be removed. This cannot be undone.')) return;
      const id = btn.dataset.id;
      const { error: delCompErr } = await supabase.from('training_completions').delete().eq('item_id', id);
      if (delCompErr) return toast('Could not remove completions: ' + delCompErr.message, 'error');
      const { error: delErr } = await supabase.from('training_items').delete().eq('id', id);
      if (delErr) return toast('Could not delete: ' + delErr.message, 'error');
      toast('Tutorial deleted', 'success');
      renderTrainingAdminTab(container);
    };
  });
}

function openTutorialEditor(item, onChange) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">Edit tutorial</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Title</label><input id="te-title" value="${escapeHtml(item.title || '')}" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/></div>
        <div class="form-group"><label>Description</label><textarea id="te-desc" rows="3" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;">${escapeHtml(item.description || '')}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label>Category</label><input id="te-category" value="${escapeAttr(item.category || 'General')}" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/></div>
          <div class="form-group"><label>Position</label><input id="te-position" type="number" value="${Number(item.position) || 0}" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.9rem;margin-bottom:12px;">
          <input id="te-required" type="checkbox" ${Number(item.required) !== 0 ? 'checked' : ''}/> Required for all employees
        </label>
        <div class="form-group">
          <label>Replace media (optional)</label>
          <input id="te-file" type="file" accept="image/*,video/*" style="width:100%;padding:8px;border-radius:10px;border:1px dashed var(--border);background:var(--bg);font-size:0.9rem;"/>
          ${item.url ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;overflow:hidden;text-overflow:ellipsis;">Current: <a href="${escapeHtml(item.url)}" target="_blank" style="color:var(--primary)">${escapeHtml(item.url)}</a></div>` : ''}
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.9rem;">
          <input id="te-active" type="checkbox" ${Number(item.active) === 1 ? 'checked' : ''}/> Active (visible to employees)
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="te-cancel">Cancel</button>
        <button class="btn btn-primary" id="te-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#te-cancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#te-save').onclick = async () => {
    const title = overlay.querySelector('#te-title').value.trim();
    if (!title) return toast('Title is required', 'warning');
    const payload = {
      title,
      description: overlay.querySelector('#te-desc').value.trim(),
      category: overlay.querySelector('#te-category').value.trim() || 'General',
      required: overlay.querySelector('#te-required').checked ? 1 : 0,
      position: Number(overlay.querySelector('#te-position').value) || 0,
      active: overlay.querySelector('#te-active').checked ? 1 : 0,
    };
    const file = overlay.querySelector('#te-file').files[0];
    const btn = overlay.querySelector('#te-save');
    btn.disabled = true;
    btn.textContent = file ? 'Uploading...' : 'Saving...';
    try {
      if (file) {
        payload.url = await uploadMediaFile(file);
        payload.kind = fileKind(file);
      }
      const { error } = await supabase.from('training_items').update(payload).eq('id', item.id);
      if (error) throw new Error(error.message);
      toast('Tutorial updated', 'success');
      close();
      if (onChange) onChange();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  };
}

// Full-screen viewer for a tutorial (image lightbox / video player).
function openTutorialViewer(item) {
  const overlay = document.createElement('div');
  overlay.className = 'tut-viewer';
  overlay.innerHTML = `
    <div class="tut-viewer-card">
      <button class="tut-viewer-close" aria-label="Close">×</button>
      <div class="tut-viewer-media">
        ${item.kind === 'video'
          ? `<video src="${escapeAttr(item.url)}" controls autoplay playsinline></video>`
          : `<img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.title)}"/>`}
      </div>
      <div class="tut-viewer-info">
        <div class="tut-viewer-title">${escapeHtml(item.title)}</div>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.tut-viewer-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });
}

export async function renderEmployeeTrainingTab(container) {
  showLoader(container);
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: items }, { data: completions }] = await Promise.all([
    supabase.from('training_items').select('*').eq('active', 1).order('position', { ascending: true }),
    supabase.from('training_completions').select('*').eq('employee_id', user.id),
  ]);
  const done = new Set((completions || []).map(x => x.item_id));
  const itemList = items || [];
  const total = itemList.length;
  const completedCount = itemList.filter(i => done.has(i.id)).length;
  const requiredItems = itemList.filter(i => Number(i.required) !== 0);
  const requiredPending = requiredItems.filter(i => !done.has(i.id)).length;
  const pct = total ? Math.round((completedCount / total) * 100) : 0;
  const categories = [...new Set(itemList.map(i => i.category || 'General'))];

  const card = (item) => {
    const isDone = done.has(item.id);
    const req = Number(item.required) !== 0;
    return `
      <div class="tut-card ${isDone ? 'is-done' : ''}" data-cat="${escapeAttr(item.category || 'General')}" data-done="${isDone ? '1' : '0'}" data-req="${req ? '1' : '0'}" data-search="${escapeAttr((item.title + ' ' + (item.description || '')).toLowerCase())}">
        <div class="tut-thumb tut-watch" data-id="${escapeAttr(item.id)}">
          ${item.kind === 'video'
            ? `<video src="${escapeAttr(item.url)}#t=0.1" muted playsinline preload="metadata"></video><span class="tut-play">${ICONS.play}</span>`
            : `<img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.title)}"/>`}
          ${isDone ? '<span class="tut-done-tick">✓</span>' : ''}
          <div class="tut-badges">
            <span class="tut-type">${item.kind === 'video' ? '📹 Video' : '🖼️ Image'}</span>
            ${req ? '<span class="tut-req">Required</span>' : '<span class="tut-opt">Optional</span>'}
          </div>
        </div>
        <div class="tut-body">
          <div class="tut-title">${escapeHtml(item.title)}</div>
          <p class="tut-desc">${escapeHtml(item.description || '')}</p>
          <div class="tut-actions">
            <button class="btn btn-secondary btn-sm tut-watch" data-id="${escapeAttr(item.id)}">${ICONS.play}<span>Watch</span></button>
            <button class="btn ${isDone ? 'btn-secondary' : 'btn-primary'} btn-sm mark-training" data-id="${escapeAttr(item.id)}" ${isDone ? 'disabled' : ''}>${ICONS.check}<span>${isDone ? 'Completed' : 'Mark Complete'}</span></button>
          </div>
        </div>
      </div>`;
  };

  container.innerHTML = `
    <div class="page-header"><h1>Employee Tutorials</h1><p>Complete your image &amp; video training</p></div>
    ${total === 0 ? `
      <div class="card"><div class="card-body" style="text-align:center;color:var(--text-dim);padding:48px;">
        <div style="font-size:2.4rem;margin-bottom:10px;">🎓</div>
        <p style="font-weight:700;color:var(--text);">No tutorials assigned yet</p>
        <p style="font-size:0.86rem;">Your trainer hasn't added any tutorials. Check back soon.</p>
      </div></div>
    ` : `
      <div class="card tut-progress">
        <div class="tut-ring" style="background:conic-gradient(var(--primary) ${pct * 3.6}deg, var(--border) 0deg);"><div class="tut-ring-inner">${pct}<small>%</small></div></div>
        <div class="tut-progress-meta">
          <div class="tut-progress-title">Your training progress</div>
          <div class="tut-progress-sub">${completedCount} of ${total} completed${requiredPending ? ` · <b style="color:var(--warning)">${requiredPending} required pending</b>` : ' · <b style="color:var(--success)">all required done 🎉</b>'}</div>
          <div class="tut-bar"><span style="width:${pct}%"></span></div>
        </div>
      </div>

      <div class="tut-toolbar">
        <div class="sr-filter-bar" id="tut-filters">
          <button class="sr-filter active" data-f="all">All <span class="sr-filter-count">${total}</span></button>
          <button class="sr-filter" data-f="required">Required <span class="sr-filter-count">${requiredItems.length}</span></button>
          <button class="sr-filter" data-f="pending">Pending <span class="sr-filter-count">${total - completedCount}</span></button>
          <button class="sr-filter" data-f="completed">Completed <span class="sr-filter-count">${completedCount}</span></button>
          ${categories.length > 1 ? categories.map(c => `<button class="sr-filter" data-f="cat:${escapeAttr(c)}">${escapeHtml(c)}</button>`).join('') : ''}
        </div>
        <label class="tut-search"><span>${ICONS.search}</span><input id="tut-search" type="search" placeholder="Search tutorials..." autocomplete="off"/></label>
      </div>

      <div class="tut-grid" id="tut-grid">${itemList.map(card).join('')}</div>
      <div id="tut-empty" style="display:none;text-align:center;padding:30px;color:var(--text-dim);">No tutorials match this filter.</div>
    `}
  `;

  if (total === 0) return;

  let filter = 'all', query = '';
  const applyFilters = () => {
    let shown = 0;
    container.querySelectorAll('#tut-grid .tut-card').forEach(c => {
      let ok = true;
      if (filter === 'required') ok = c.dataset.req === '1';
      else if (filter === 'pending') ok = c.dataset.done === '0';
      else if (filter === 'completed') ok = c.dataset.done === '1';
      else if (filter.startsWith('cat:')) ok = c.dataset.cat === filter.slice(4);
      if (ok && query) ok = c.dataset.search.includes(query);
      c.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    const empty = container.querySelector('#tut-empty');
    if (empty) empty.style.display = shown ? 'none' : 'block';
  };
  container.querySelectorAll('#tut-filters .sr-filter').forEach(b => b.onclick = () => {
    container.querySelectorAll('#tut-filters .sr-filter').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); filter = b.dataset.f; applyFilters();
  });
  const searchEl = container.querySelector('#tut-search');
  if (searchEl) searchEl.oninput = (e) => { query = e.target.value.trim().toLowerCase(); applyFilters(); };

  container.querySelectorAll('.tut-watch').forEach(el => el.onclick = () => {
    const item = itemList.find(i => String(i.id) === el.dataset.id);
    if (item) openTutorialViewer(item);
  });

  container.querySelectorAll('.mark-training').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      btn.disabled = true;
      const { error } = await supabase.from('training_completions').insert({
        item_id: btn.dataset.id,
        employee_id: user.id,
        completed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      if (error) { toast(error.message, 'error'); btn.disabled = false; }
      else { toast('🎉 Training marked complete', 'success'); renderEmployeeTrainingTab(container); }
    };
  });
}

export async function renderAIReportTab(container) {
  showLoader(container);
  const [{ data: inquiries }, { data: employees }, { data: attendance }, { data: eodReports }, { data: cashCollections }] = await Promise.all([
    supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name,worker_type').eq('role', 'employee'),
    supabase.from('attendance').select('*').order('date', { ascending: false }),
    supabase.from('eod_reports').select('*').order('created_at', { ascending: false }),
    supabase.from('cash_collections').select('*').order('created_at', { ascending: false }),
  ]);
  const serviceRows = inquiries || [];
  const paidRevenue = serviceRows.filter(x => x.payment_status === 'paid').reduce((sum, x) => sum + Number(x.bill_total || x.bill_amount || 0), 0);
  const unpaid = serviceRows.filter(x => x.bill_amount && x.payment_status !== 'paid').reduce((sum, x) => sum + Number(x.bill_total || x.bill_amount || 0), 0);
  const gigRows = serviceRows.filter(x => Number(x.is_gig_job) === 1);
  const gigRevenue = gigRows.filter(x => x.payment_status === 'paid').reduce((sum, x) => sum + Number(x.bill_total || 0), 0);
  const gigPayoutTotal = gigRows.reduce((sum, x) => sum + (Number(x.gig_payout_amount) || 0), 0);
  const issues = serviceRows.filter(x => x.status === 'issue_not_resolved');
  const active = serviceRows.filter(x => !['resolved', 'closed', 'issue_not_resolved'].includes(x.status));
  const resolved = serviceRows.filter(x => ['resolved', 'closed'].includes(x.status));
  const employeeRows = (employees || []).map(emp => {
    const assigned = serviceRows.filter(x => x.assigned_employee_id === emp.id);
    const empResolved = assigned.filter(x => ['resolved', 'closed'].includes(x.status)).length;
    const empIssues = assigned.filter(x => x.status === 'issue_not_resolved').length;
    const todayAttendance = (attendance || []).find(x => x.user_id === emp.id && String(x.date || '').slice(0, 10) === new Date().toLocaleDateString('en-CA'));
    return { ...emp, assigned: assigned.length, resolved: empResolved, issues: empIssues, online: Boolean(todayAttendance?.clock_in && !todayAttendance?.clock_out), isGig: emp.worker_type === 'gig' };
  }).sort((a, b) => b.resolved - a.resolved || b.assigned - a.assigned);
  const cashPending = (cashCollections || []).filter(x => x.status !== 'submitted').reduce((sum, x) => sum + Number(x.amount || 0), 0);
  container.innerHTML = `
    <div class="page-header"><h1>AI Report</h1><p>Business finance and employee progress summary</p></div>
    <div class="stats-grid" style="margin-bottom:22px;">
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${money(paidRevenue)}</div><div class="stat-label">Paid Revenue</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${money(unpaid)}</div><div class="stat-label">Awaiting Payment</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${money(cashPending)}</div><div class="stat-label">Cash Pending</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${resolved.length}</div><div class="stat-label">Resolved Services</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${issues.length}</div><div class="stat-label">Issue Not Resolved</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${active.length}</div><div class="stat-label">Active Services</div></div>
      ${gigRows.length ? `<div class="stat-card"><div class="stat-value" style="color:var(--primary)">${money(gigRevenue)}</div><div class="stat-label">Gig Pool Revenue · ${gigRows.length} job${gigRows.length !== 1 ? 's' : ''}</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--text)">${money(gigPayoutTotal)}</div><div class="stat-label">Gig Worker Payouts</div></div>` : ''}
    </div>
    <div class="card" style="margin-bottom:22px;">
      <div class="card-header"><span class="card-title">Business Notes</span></div>
      <div class="card-body" style="line-height:1.6;color:var(--text-soft);">
        <p><b>Finance:</b> ${unpaid > 0 ? `Collect ${money(unpaid)} from unpaid bills.` : 'No unpaid bill amount is pending.'} ${cashPending > 0 ? `Cash handover pending is ${money(cashPending)}.` : 'No cash handover is pending.'}</p>
        <p><b>Service quality:</b> ${issues.length ? `${issues.length} service(s) are marked Issue Not Resolved and need follow-up.` : 'No unresolved issue services are currently marked.'}</p>
        <p><b>Employee progress:</b> ${(eodReports || []).length} EOD reports are recorded. ${employeeRows.filter(x => x.online).length} employee(s) are currently clocked in.</p>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Employee Progress</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Type</th><th>Assigned</th><th>Resolved</th><th>Issues</th><th>Status</th></tr></thead>
          <tbody>
            ${employeeRows.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-dim)">No employees found</td></tr>' : employeeRows.map(emp => `
              <tr><td><b>${escapeHtml(emp.full_name || 'Employee')}</b></td><td><span class="badge ${emp.isGig ? 'badge-assigned' : 'badge-in_progress'}">${emp.isGig ? 'Gig' : 'Fixed'}</span></td><td>${emp.assigned}</td><td style="color:var(--success);font-weight:800">${emp.resolved}</td><td style="color:var(--danger);font-weight:800">${emp.issues}</td><td>${emp.online ? '<span class="badge badge-resolved">Online</span>' : '<span class="badge badge-medium">Offline</span>'}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
