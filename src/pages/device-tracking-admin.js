// Device Tracking Admin Panel View
import { supabase } from '../supabase.js';
import { toast, formatDateTime, formatDate } from '../utils.js';
import { getAllDeviceTracking, saveFollowUpStatus, saveDeviceReturn } from './device-tracking.js';
import { ICONS } from '../icons.js';

export async function renderDeviceTrackingTab(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.wrench}</span>
          <span>Device Tracking</span>
        </h1>
        <p>Devices taken for service and their follow-up / return status.</p>
      </div>
    </div>

    <div style="margin-bottom: 20px; display: flex; gap: 12px;">
      <input type="text" id="dt-search" placeholder="Search by ticket, phone, or customer..."
             style="flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px;">
      <select id="dt-device-status" style="padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px;">
        <option value="">All Device Status</option>
        <option value="taken">📸 Device Taken</option>
        <option value="returned">✅ Device Returned</option>
      </select>
      <select id="dt-followup-status" style="padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px;">
        <option value="">All Follow-up Status</option>
        <option value="awaiting_parts">Awaiting Parts</option>
        <option value="repair_progress">Repair in Progress</option>
        <option value="ready_return">Ready to Return</option>
        <option value="returned">Device Returned</option>
      </select>
      <label style="display:flex;align-items:center;gap:6px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;white-space:nowrap;cursor:pointer;font-size:0.85rem;">
        <input type="checkbox" id="dt-flagged-only"/> ⚠️ Closed without return
      </label>
    </div>

    <div id="dt-loading" style="text-align: center; padding: 40px;">
      <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
      <p>Loading device tracking data...</p>
    </div>

    <div id="dt-content" style="display: none;"></div>
  `;

  const loadingEl = container.querySelector('#dt-loading');
  const contentEl = container.querySelector('#dt-content');
  const searchInput = container.querySelector('#dt-search');
  const deviceStatusSelect = container.querySelector('#dt-device-status');
  const followupStatusSelect = container.querySelector('#dt-followup-status');
  const flaggedOnlyCheckbox = container.querySelector('#dt-flagged-only');

  let allData = [];

  // Load initial data
  const { data, error } = await getAllDeviceTracking();
  if (error) {
    toast('Failed to load device tracking data', 'error');
    loadingEl.innerHTML = '<p style="color: var(--danger);">Failed to load data</p>';
    return;
  }

  const onRefresh = () => renderDeviceTrackingTab(container);

  allData = data;
  loadingEl.style.display = 'none';
  contentEl.style.display = 'block';
  renderTable(contentEl, allData, onRefresh);

  // Filter functionality
  const applyFilters = () => {
    const search = searchInput.value.toLowerCase();
    const deviceStatus = deviceStatusSelect.value;
    const followupStatus = followupStatusSelect.value;
    const flaggedOnly = flaggedOnlyCheckbox.checked;

    const filtered = allData.filter(item => {
      const matchesSearch = !search ||
        item.ticket_no?.toLowerCase().includes(search) ||
        item.phone?.includes(search) ||
        item.full_name?.toLowerCase().includes(search);

      const matchesDeviceStatus = !deviceStatus || item.device_status === deviceStatus;
      const matchesFollowupStatus = !followupStatus || item.follow_up_status === followupStatus;
      const matchesFlagged = !flaggedOnly || isClosedWithoutReturn(item);

      return matchesSearch && matchesDeviceStatus && matchesFollowupStatus && matchesFlagged;
    });

    renderTable(contentEl, filtered, onRefresh);
  };

  searchInput.addEventListener('input', applyFilters);
  deviceStatusSelect.addEventListener('change', applyFilters);
  followupStatusSelect.addEventListener('change', applyFilters);
  flaggedOnlyCheckbox.addEventListener('change', applyFilters);
}

// A job is closed but the device trail never reached "returned" - the exact gap
// left by an employee turning device-service off instead of logging a real return.
const CLOSED_JOB_STATUSES = new Set(['resolved', 'closed', 'case_closed', 'foc', 'issue_not_resolved']);
function isClosedWithoutReturn(item) {
  const jobClosed = CLOSED_JOB_STATUSES.has(item.status);
  const deviceReturned = item.device_status === 'returned' || item.follow_up_status === 'returned'
    || (item.device_return_logs && item.device_return_logs.length > 0);
  return jobClosed && !deviceReturned;
}

function renderTable(container, data, onRefresh) {
  if (data.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; background: var(--bg-soft); border-radius: 12px;">
        <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
        <h3>No device tracking data found</h3>
        <p style="color: var(--text-soft);">Devices taken for service will appear here</p>
      </div>
    `;
    return;
  }

  const html = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Devices Taken for Service</span>
        <span class="badge" style="background: var(--bg-soft);">${data.length}</span>
      </div>
      <div class="card-body" style="padding: 0; overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--bg-soft); border-bottom: 2px solid var(--border);">
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Ticket</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Customer</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Service</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Device Status</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Follow-up</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Taken By</th>
              <th style="padding: 12px 16px; text-align: right; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);"></th>
            </tr>
          </thead>
          <tbody>
            ${data.map(item => `
              <tr style="border-bottom: 1px solid var(--border);" data-id="${item.id}">
                <td style="padding: 14px 16px;"><strong style="color: var(--primary);">${item.ticket_no || '—'}</strong></td>
                <td style="padding: 14px 16px;">
                  <div style="font-weight: 600;">${item.full_name || 'Client'}</div>
                  <small style="color: var(--text-dim);">${item.phone || ''}</small>
                </td>
                <td style="padding: 14px 16px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.service_item || '—'}</td>
                <td style="padding: 14px 16px;">
                  ${renderDeviceStatusBadge(item.device_status)}
                  ${isClosedWithoutReturn(item) ? '<div style="margin-top:4px;"><span style="background:#fee2e2;color:#991b1b;padding:3px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;">⚠️ Closed, no return logged</span></div>' : ''}
                </td>
                <td style="padding: 14px 16px;">${renderFollowupStatusBadge(item.follow_up_status)}</td>
                <td style="padding: 14px 16px;">
                  ${item.device_taken_logs && item.device_taken_logs.length > 0
                    ? `<small>${item.device_taken_logs[0].profiles?.full_name || '—'}</small><br><small style="color: var(--text-dim);">${formatDate(item.device_taken_logs[0].taken_at)}</small>`
                    : '<small style="color: var(--text-dim);">—</small>'}
                </td>
                <td style="padding: 14px 16px; text-align: right;">
                  <button class="btn btn-secondary btn-sm view-details" data-id="${item.id}" style="cursor: pointer;">View / Follow-up</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Add click handlers for view details
  container.querySelectorAll('.view-details').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.getAttribute('data-id');
      const item = data.find(d => d.id === id);
      if (item) showDeviceDetails(item, onRefresh);
    });
  });
}

function renderDeviceStatusBadge(status) {
  const badges = {
    'taken': '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">📸 Taken</span>',
    'returned': '<span style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">✅ Returned</span>',
    'in_service': '<span style="background: #dbeafe; color: #0c4a6e; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">🔧 In Service</span>',
    'pending': '<span style="background: #f3f4f6; color: #6b7280; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">⏳ Pending</span>',
  };
  return badges[status] || '<span style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">—</span>';
}

function renderFollowupStatusBadge(status) {
  const badges = {
    'none': '<span style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: var(--text-dim);">—</span>',
    'awaiting_parts': '<span style="background: #fecaca; color: #7f1d1d; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">⏳ Awaiting Parts</span>',
    'repair_progress': '<span style="background: #dbeafe; color: #0c4a6e; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">🔧 In Progress</span>',
    'ready_return': '<span style="background: #bfdbfe; color: #1e3a8a; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">📦 Ready</span>',
    'returned': '<span style="background: #86efac; color: #15803d; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">✅ Returned</span>',
  };
  return badges[status] || '<span style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">—</span>';
}

function showDeviceDetails(item, onRefresh) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width: 700px;">
      <div class="modal-header">
        <span class="modal-title"><span style="width:20px;height:20px;display:inline-flex;vertical-align:middle;">${ICONS.wrench}</span><span style="margin-left: 8px;">Device Tracking Details</span></span>
        <button class="modal-close" id="close-modal" style="background: none; border: none; font-size: 24px; cursor: pointer;">✕</button>
      </div>
      <div class="modal-body">
        <div style="background: var(--bg-soft); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-dim); font-weight: 800; margin-bottom: 4px;">Ticket</div>
              <div style="font-weight: 700;">${item.ticket_no}</div>
            </div>
            <div>
              <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-dim); font-weight: 800; margin-bottom: 4px;">Customer</div>
              <div style="font-weight: 700;">${item.full_name}</div>
            </div>
          </div>
          <div>
            <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-dim); font-weight: 800; margin-bottom: 4px;">Service Item</div>
            <div>${item.service_item || '—'}</div>
          </div>
        </div>

        <div style="background: rgba(16,185,129,0.06); padding: 16px; border-radius: 12px; border: 1px solid var(--primary); margin-bottom: 16px;">
          <h4 style="margin: 0 0 12px 0;">📋 Follow-up &amp; Update</h4>

          <div style="margin-bottom: 12px;">
            <div style="font-weight: 600; margin-bottom: 8px; font-size: 0.9rem;">Add follow-up update</div>
            <select id="admin-followup-status" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">
              <option value="awaiting_parts">⏳ Awaiting Parts</option>
              <option value="repair_progress">🔧 Repair in Progress</option>
              <option value="ready_return">📦 Ready to Return</option>
              <option value="returned">✅ Returned to Client</option>
            </select>
            <textarea id="admin-followup-notes" rows="2" placeholder="Update notes..." style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;"></textarea>
            <button class="btn btn-primary btn-sm" id="admin-save-followup">Add update</button>
          </div>

          <div style="padding-top: 12px; border-top: 1px solid rgba(16,185,129,0.2);">
            <div style="font-weight: 600; margin-bottom: 8px; font-size: 0.9rem;">Mark returned / sent back to client</div>
            <input type="file" id="admin-return-image" accept="image/*" style="margin-bottom: 8px; display: block;">
            <select id="admin-return-condition" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">
              <option value="repaired">Repaired</option>
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="lost">Lost</option>
            </select>
            <input type="text" id="admin-return-notes" placeholder="Return notes..." style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">
            <button class="btn btn-secondary btn-sm" id="admin-save-return">Mark returned</button>
          </div>
        </div>

        ${item.device_taken_logs && item.device_taken_logs.length > 0 ? `
          <div style="background: rgba(250, 204, 21, 0.05); padding: 16px; border-radius: 12px; border: 1px solid rgba(250, 204, 21, 0.2); margin-bottom: 16px;">
            <h4 style="margin: 0 0 12px 0;">📸 Device Taken</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Taken By</small>
                <div style="margin-top: 4px;">${item.device_taken_logs[0].profiles?.full_name || 'Unknown'}</div>
              </div>
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Taken On</small>
                <div style="margin-top: 4px;">${formatDateTime(item.device_taken_logs[0].taken_at)}</div>
              </div>
            </div>
            ${item.device_taken_logs[0].device_image_url ? `
              <div style="margin-bottom: 12px;">
                <small style="color: var(--text-dim); font-weight: 600;">Device Image</small>
                <img src="${item.device_taken_logs[0].device_image_url}" alt="Device" style="width: 100%; max-height: 300px; border-radius: 8px; margin-top: 8px; object-fit: cover;">
              </div>
            ` : ''}
            ${item.device_taken_logs[0].device_description ? `
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Description</small>
                <div style="margin-top: 4px; padding: 8px; background: white; border-radius: 6px; font-size: 0.9rem;">${item.device_taken_logs[0].device_description}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${item.device_return_logs && item.device_return_logs.length > 0 ? `
          <div style="background: rgba(34, 197, 94, 0.05); padding: 16px; border-radius: 12px; border: 1px solid rgba(34, 197, 94, 0.2); margin-bottom: 16px;">
            <h4 style="margin: 0 0 12px 0;">✅ Device Returned</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Condition</small>
                <div style="margin-top: 4px; padding: 4px 8px; background: #dcfce7; color: #15803d; border-radius: 4px; display: inline-block; font-weight: 600;">${item.device_return_logs[0].device_condition?.toUpperCase() || 'GOOD'}</div>
              </div>
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Returned On</small>
                <div style="margin-top: 4px;">${formatDateTime(item.device_return_logs[0].returned_at)}</div>
              </div>
            </div>
            ${item.device_return_logs[0].return_image_url ? `
              <div style="margin-bottom: 12px;">
                <small style="color: var(--text-dim); font-weight: 600;">Return Image</small>
                <img src="${item.device_return_logs[0].return_image_url}" alt="Return" style="width: 100%; max-height: 300px; border-radius: 8px; margin-top: 8px; object-fit: cover;">
              </div>
            ` : ''}
            ${item.device_return_logs[0].return_notes ? `
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Notes</small>
                <div style="margin-top: 4px; padding: 8px; background: white; border-radius: 6px; font-size: 0.9rem;">${item.device_return_logs[0].return_notes}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${item.device_follow_up_logs && item.device_follow_up_logs.length > 0 ? `
          <div style="margin-top: 16px;">
            <h4 style="margin: 0 0 12px 0;">📋 Follow-up Updates</h4>
            ${item.device_follow_up_logs.map(log => `
              <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                  <strong style="color: var(--primary);">${log.status?.replace(/_/g, ' ').toUpperCase()}</strong>
                  <small style="color: var(--text-dim);">${formatDateTime(log.created_at)}</small>
                </div>
                ${log.notes ? `<div style="font-size: 0.9rem;">${log.notes}</div>` : ''}
                ${log.profiles?.full_name ? `<small style="color: var(--text-dim); margin-top: 4px; display: block;">Updated by: ${log.profiles.full_name}</small>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="close-modal-btn">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#close-modal').onclick = modal.querySelector('#close-modal-btn').onclick = () => modal.remove();

  const followBtn = modal.querySelector('#admin-save-followup');
  if (followBtn) followBtn.onclick = async () => {
    const status = modal.querySelector('#admin-followup-status').value;
    const notes = modal.querySelector('#admin-followup-notes').value.trim();
    followBtn.disabled = true; followBtn.textContent = 'Saving…';
    const { error } = await saveFollowUpStatus(item.id, status, notes);
    if (error) { followBtn.disabled = false; followBtn.textContent = 'Add update'; return toast(error.message || 'Could not save', 'error'); }
    toast('Follow-up update added', 'success');
    modal.remove();
    onRefresh?.();
  };

  const returnBtn = modal.querySelector('#admin-save-return');
  if (returnBtn) returnBtn.onclick = async () => {
    const file = modal.querySelector('#admin-return-image').files?.[0] || null;
    const condition = modal.querySelector('#admin-return-condition').value;
    const notes = modal.querySelector('#admin-return-notes').value.trim();
    returnBtn.disabled = true; returnBtn.textContent = 'Saving…';
    const { error } = await saveDeviceReturn(item.id, file, condition, notes);
    if (error) { returnBtn.disabled = false; returnBtn.textContent = 'Mark returned'; return toast(error.message || 'Could not save', 'error'); }
    toast('Device return recorded', 'success');
    modal.remove();
    onRefresh?.();
  };
}
