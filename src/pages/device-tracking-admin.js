// Device Tracking Admin Panel View
import { supabase } from '../supabase.js';
import { toast, formatDateTime, formatDate } from '../utils.js';
import { getAllDeviceTracking } from './device-tracking.js';
import { ICONS } from '../icons.js';

export async function renderDeviceTrackingTab(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${ICONS.alert} Device Tracking</h1>
        <p>Monitor all devices taken for service and their return status.</p>
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

  let allData = [];

  // Load initial data
  const { data, error } = await getAllDeviceTracking();
  if (error) {
    toast('Failed to load device tracking data', 'error');
    loadingEl.innerHTML = '<p style="color: var(--danger);">Failed to load data</p>';
    return;
  }

  allData = data;
  loadingEl.style.display = 'none';
  contentEl.style.display = 'block';
  renderTable(contentEl, allData);

  // Filter functionality
  const applyFilters = () => {
    const search = searchInput.value.toLowerCase();
    const deviceStatus = deviceStatusSelect.value;
    const followupStatus = followupStatusSelect.value;

    const filtered = allData.filter(item => {
      const matchesSearch = !search ||
        item.ticket_no?.toLowerCase().includes(search) ||
        item.phone?.includes(search) ||
        item.full_name?.toLowerCase().includes(search);

      const matchesDeviceStatus = !deviceStatus || item.device_status === deviceStatus;
      const matchesFollowupStatus = !followupStatus || item.follow_up_status === followupStatus;

      return matchesSearch && matchesDeviceStatus && matchesFollowupStatus;
    });

    renderTable(contentEl, filtered);
  };

  searchInput.addEventListener('input', applyFilters);
  deviceStatusSelect.addEventListener('change', applyFilters);
  followupStatusSelect.addEventListener('change', applyFilters);
}

function renderTable(container, data) {
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
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: var(--bg-soft); border-bottom: 2px solid var(--border);">
            <th style="padding: 12px; text-align: left; font-weight: 600;">Ticket</th>
            <th style="padding: 12px; text-align: left; font-weight: 600;">Customer</th>
            <th style="padding: 12px; text-align: left; font-weight: 600;">Service</th>
            <th style="padding: 12px; text-align: left; font-weight: 600;">Device Status</th>
            <th style="padding: 12px; text-align: left; font-weight: 600;">Follow-up</th>
            <th style="padding: 12px; text-align: left; font-weight: 600;">Taken By</th>
            <th style="padding: 12px; text-align: left; font-weight: 600;">Details</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(item => `
            <tr style="border-bottom: 1px solid var(--border); hover-effect" data-id="${item.id}">
              <td style="padding: 12px;"><strong>${item.ticket_no}</strong></td>
              <td style="padding: 12px;">
                <div style="font-weight: 600;">${item.full_name}</div>
                <small style="color: var(--text-dim);">${item.phone}</small>
              </td>
              <td style="padding: 12px; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${item.service_item || '—'}</td>
              <td style="padding: 12px;">
                ${renderDeviceStatusBadge(item.device_status)}
              </td>
              <td style="padding: 12px;">
                ${renderFollowupStatusBadge(item.follow_up_status)}
              </td>
              <td style="padding: 12px;">
                ${item.device_taken_logs && item.device_taken_logs.length > 0
                  ? `<small>${item.device_taken_logs[0].profiles?.full_name || '—'}</small><br><small style="color: var(--text-dim);">${formatDate(item.device_taken_logs[0].taken_at)}</small>`
                  : '<small style="color: var(--text-dim);">—</small>'}
              </td>
              <td style="padding: 12px;">
                <button class="btn btn-secondary btn-sm view-details" data-id="${item.id}" style="cursor: pointer;">View</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;

  // Add click handlers for view details
  container.querySelectorAll('.view-details').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.getAttribute('data-id');
      const item = data.find(d => d.id === id);
      if (item) showDeviceDetails(item);
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

function showDeviceDetails(item) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width: 700px;">
      <div class="modal-header">
        <span class="modal-title">${ICONS.alert}<span style="margin-left: 8px;">Device Tracking Details</span></span>
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
}
