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

export async function renderPortalMediaTab(container) {
  showLoader(container);
  const { data, error } = await supabase.from('ads').select('*').order('position', { ascending: true });
  if (error) {
    container.innerHTML = `<div class="card"><div class="card-body">Could not load media: ${escapeHtml(error.message)}</div></div>`;
    return;
  }
  const items = data || [];
  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Portal Media</h1>
        <p>Upload popup images or videos for the landing page and employee portal</p>
      </div>
      <button class="btn btn-secondary" id="media-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>
    <div class="card" style="margin-bottom:22px;">
      <div class="card-header"><span class="card-title">${ICONS.upload}<span style="margin-left:8px">Upload Media</span></span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
          <div class="form-group"><label>Placement</label><select id="media-placement"><option value="landing">Landing page</option><option value="employee">Employee portal</option></select></div>
          <div class="form-group"><label>Caption</label><input id="media-caption" placeholder="Short title shown with the media"/></div>
          <div class="form-group"><label>Position</label><input id="media-position" type="number" value="0"/></div>
          <div class="form-group"><label>Duration (seconds)</label><input id="media-duration" type="number" min="2" value="6"/></div>
          <div class="form-group"><label>File</label><input id="media-file" type="file" accept="image/*,video/*"/></div>
        </div>
        <div style="padding:12px;border-radius:8px;background:var(--bg-soft);border:1px solid var(--border);font-size:0.84rem;color:var(--text-soft);line-height:1.55;margin-top:6px;">
          <b>Recommended sizes:</b> landing desktop 1920x900, landing mobile 1080x1440, employee portal 1600x900 or 1080x1080. Use JPG/WebP/PNG under 2 MB for images and MP4/WebM under 20 MB for videos. Keep important text centered so it is not cropped on phones.
        </div>
        <button class="btn btn-primary" id="media-save" style="margin-top:14px;">${ICONS.upload}<span>Upload & Publish</span></button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Published Media</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Preview</th><th>Placement</th><th>Caption</th><th>Status</th><th>Position</th><th></th></tr></thead>
          <tbody>
            ${items.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-dim)">No media uploaded yet</td></tr>' : items.map(item => `
              <tr>
                <td style="width:180px">${mediaPreview(item)}</td>
                <td><span class="badge badge-open">${escapeHtml(item.placement || 'landing')}</span></td>
                <td><b>${escapeHtml(item.caption || 'Untitled')}</b><br/><small style="color:var(--text-dim)">${escapeHtml(item.kind)}</small></td>
                <td>${Number(item.active) === 1 ? '<span class="badge badge-resolved">Active</span>' : '<span class="badge badge-medium">Hidden</span>'}</td>
                <td>${Number(item.position) || 0}</td>
                <td><button class="btn btn-secondary btn-sm media-toggle" data-id="${escapeAttr(item.id)}" data-active="${Number(item.active) === 1 ? 0 : 1}">${Number(item.active) === 1 ? 'Hide' : 'Show'}</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelector('#media-refresh').onclick = () => renderPortalMediaTab(container);
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
        duration_ms: Math.max(2, Number(container.querySelector('#media-duration').value) || 6) * 1000,
        position: Number(container.querySelector('#media-position').value) || 0,
        active: 1,
      });
      if (saveErr) throw new Error(saveErr.message);
      toast('Media published', 'success');
      renderPortalMediaTab(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `${ICONS.upload}<span>Upload & Publish</span>`;
    }
  };
  container.querySelectorAll('.media-toggle').forEach(btn => {
    btn.onclick = async () => {
      const { error: updateErr } = await supabase.from('ads').update({ active: Number(btn.dataset.active) }).eq('id', btn.dataset.id);
      if (updateErr) toast(updateErr.message, 'error');
      else renderPortalMediaTab(container);
    };
  });
}

export async function renderEmployeeMediaTab(container) {
  showLoader(container);
  const { data } = await supabase.from('ads').select('*').eq('placement', 'employee').eq('active', 1).order('position', { ascending: true });
  const items = data || [];
  container.innerHTML = `
    <div class="page-header"><h1>Portal Media</h1><p>Updates and media shared by admin</p></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;">
      ${items.length === 0 ? '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-dim);padding:36px;">No portal media right now</div></div>' : items.map(item => `
        <div class="card">
          <div class="card-body">
            ${mediaPreview(item)}
            <div style="font-weight:800;margin-top:12px;color:var(--text);">${escapeHtml(item.caption || 'Update')}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
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
  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div><h1>Employee Tutorials</h1><p>Upload training media and monitor completion live</p></div>
      <button class="btn btn-secondary" id="training-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>
    <div class="card" style="margin-bottom:22px;">
      <div class="card-header"><span class="card-title">${ICONS.upload}<span style="margin-left:8px">Upload Tutorial</span></span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
          <div class="form-group"><label>Title</label><input id="training-title" placeholder="Training title"/></div>
          <div class="form-group"><label>Position</label><input id="training-position" type="number" value="0"/></div>
          <div class="form-group"><label>File</label><input id="training-file" type="file" accept="image/*,video/*"/></div>
        </div>
        <div class="form-group"><label>Description</label><textarea id="training-desc" rows="3" placeholder="What employee must learn from this tutorial"></textarea></div>
        <button class="btn btn-primary" id="training-save">${ICONS.upload}<span>Upload Tutorial</span></button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Training Completion Report</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tutorial</th><th>Media</th><th>Completed</th><th>Pending Employees</th><th>Latest Completion</th><th></th></tr></thead>
          <tbody>
            ${itemList.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-dim)">No tutorials uploaded yet</td></tr>' : itemList.map(item => {
              const done = byItem.get(item.id) || [];
              const doneIds = new Set(done.map(x => x.employee_id));
              const pending = employeeList.filter(e => !doneIds.has(e.id)).map(e => e.full_name).join(', ');
              return `<tr>
                <td><b>${escapeHtml(item.title)}</b><br/><small style="color:var(--text-dim)">${escapeHtml(item.description || '')}</small></td>
                <td style="width:180px">${mediaPreview(item)}</td>
                <td><b style="color:var(--primary)">${done.length}</b> / ${employeeList.length}</td>
                <td style="max-width:320px;white-space:normal;">${pending ? escapeHtml(pending) : '<span class="badge badge-resolved">All complete</span>'}</td>
                <td>${done[0] ? `${escapeHtml(done[0].profiles?.full_name || 'Employee')}<br/><small>${formatDateTime(done[0].completed_at)}</small>` : '-'}</td>
                <td><button class="btn btn-secondary btn-sm training-toggle" data-id="${escapeAttr(item.id)}" data-active="${Number(item.active) === 1 ? 0 : 1}">${Number(item.active) === 1 ? 'Hide' : 'Show'}</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelector('#training-refresh').onclick = () => renderTrainingAdminTab(container);
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
  container.innerHTML = `
    <div class="page-header"><h1>Employee Tutorials</h1><p>Complete required image and video training</p></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;">
      ${itemList.length === 0 ? '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-dim);padding:36px;">No tutorials assigned</div></div>' : itemList.map(item => `
        <div class="card">
          <div class="card-body">
            ${mediaPreview(item)}
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-top:12px;">
              <div>
                <div style="font-weight:800;color:var(--text);">${escapeHtml(item.title)}</div>
                <p style="margin:6px 0 0;color:var(--text-soft);font-size:0.9rem;">${escapeHtml(item.description || '')}</p>
              </div>
              ${done.has(item.id) ? '<span class="badge badge-resolved">Completed</span>' : '<span class="badge badge-medium">Pending</span>'}
            </div>
            <button class="btn ${done.has(item.id) ? 'btn-secondary' : 'btn-primary'} btn-wide mark-training" data-id="${escapeAttr(item.id)}" ${done.has(item.id) ? 'disabled' : ''} style="margin-top:14px;">${ICONS.check}<span>${done.has(item.id) ? 'Completed' : 'Mark Complete'}</span></button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  container.querySelectorAll('.mark-training').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      const { error } = await supabase.from('training_completions').insert({
        item_id: btn.dataset.id,
        employee_id: user.id,
        completed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      if (error) {
        toast(error.message, 'error');
        btn.disabled = false;
      } else {
        toast('Training marked complete', 'success');
        renderEmployeeTrainingTab(container);
      }
    };
  });
}

export async function renderAIReportTab(container) {
  showLoader(container);
  const [{ data: inquiries }, { data: employees }, { data: attendance }, { data: eodReports }, { data: cashCollections }] = await Promise.all([
    supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name').eq('role', 'employee'),
    supabase.from('attendance').select('*').order('date', { ascending: false }),
    supabase.from('eod_reports').select('*').order('created_at', { ascending: false }),
    supabase.from('cash_collections').select('*').order('created_at', { ascending: false }),
  ]);
  const serviceRows = inquiries || [];
  const paidRevenue = serviceRows.filter(x => x.payment_status === 'paid').reduce((sum, x) => sum + Number(x.bill_total || x.bill_amount || 0), 0);
  const unpaid = serviceRows.filter(x => x.bill_amount && x.payment_status !== 'paid').reduce((sum, x) => sum + Number(x.bill_total || x.bill_amount || 0), 0);
  const issues = serviceRows.filter(x => x.status === 'issue_not_resolved');
  const active = serviceRows.filter(x => !['resolved', 'closed', 'issue_not_resolved'].includes(x.status));
  const resolved = serviceRows.filter(x => ['resolved', 'closed'].includes(x.status));
  const employeeRows = (employees || []).map(emp => {
    const assigned = serviceRows.filter(x => x.assigned_employee_id === emp.id);
    const empResolved = assigned.filter(x => ['resolved', 'closed'].includes(x.status)).length;
    const empIssues = assigned.filter(x => x.status === 'issue_not_resolved').length;
    const todayAttendance = (attendance || []).find(x => x.user_id === emp.id && String(x.date || '').slice(0, 10) === new Date().toLocaleDateString('en-CA'));
    return { ...emp, assigned: assigned.length, resolved: empResolved, issues: empIssues, online: Boolean(todayAttendance?.clock_in && !todayAttendance?.clock_out) };
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
          <thead><tr><th>Employee</th><th>Assigned</th><th>Resolved</th><th>Issues</th><th>Status</th></tr></thead>
          <tbody>
            ${employeeRows.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--text-dim)">No employees found</td></tr>' : employeeRows.map(emp => `
              <tr><td><b>${escapeHtml(emp.full_name || 'Employee')}</b></td><td>${emp.assigned}</td><td style="color:var(--success);font-weight:800">${emp.resolved}</td><td style="color:var(--danger);font-weight:800">${emp.issues}</td><td>${emp.online ? '<span class="badge badge-resolved">Online</span>' : '<span class="badge badge-medium">Offline</span>'}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
