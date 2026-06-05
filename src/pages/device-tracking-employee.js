// Employee Device Tracking Functions
import { toast, formatDateTime, formatDate } from '../utils.js';

const API_URL = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const getHeaders = () => {
  const token = localStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

// Get devices assigned to this employee
export async function getEmployeeDevices(employeeId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/employee/${employeeId}`, { headers: getHeaders() });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load devices');
    }

    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error loading employee devices:', err);
    return { data: [], error: err };
  }
}

// Get device status for specific inquiry
export async function getDeviceStatus(inquiryId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`, { headers: getHeaders() });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load status');
    }

    return { data, error: null };
  } catch (err) {
    console.error('Error loading device status:', err);
    return { data: null, error: err };
  }
}

// Helper function to get device taken info
export async function getDeviceTakenInfo(inquiryId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load status');
    return { data: data.device_taken_logs, error: null };
  } catch (err) {
    console.error('Error loading device taken info:', err);
    return { data: null, error: err };
  }
}

// Helper function to get device return info
export async function getDeviceReturnInfo(inquiryId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load status');
    return { data: data.device_return_logs, error: null };
  } catch (err) {
    console.error('Error loading device return info:', err);
    return { data: null, error: err };
  }
}

// Helper function to get follow-up logs
export async function getFollowUpLogs(inquiryId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load status');
    return { data: data.device_follow_up_logs || [], error: null };
  } catch (err) {
    console.error('Error loading follow-up logs:', err);
    return { data: [], error: err };
  }
}

// Render device tracking section in service modal
export function renderDeviceTrackingTab(inquiryId, taken, returned, followups) {
  return `
    <div style="padding: 20px 0;">
      ${taken ? `
        <div style="background: rgba(250, 204, 21, 0.1); padding: 16px; border-radius: 12px; border: 1px solid rgba(250, 204, 21, 0.2); margin-bottom: 16px;">
          <h4 style="margin: 0 0 12px 0;">📸 Device Taken</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Taken By</small>
              <div style="margin-top: 4px;">${taken.profiles?.full_name || 'Unknown'}</div>
            </div>
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Taken On</small>
              <div style="margin-top: 4px;">${formatDateTime(taken.taken_at)}</div>
            </div>
          </div>
          ${taken.device_image_url ? `
            <div style="margin-bottom: 12px;">
              <small style="color: var(--text-dim); font-weight: 600;">Device Image</small>
              <img src="${taken.device_image_url}" alt="Device" style="width: 100%; max-height: 200px; border-radius: 8px; margin-top: 8px; object-fit: cover;">
            </div>
          ` : ''}
          ${taken.device_description ? `
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Description</small>
              <div style="margin-top: 4px; padding: 8px; background: white; border-radius: 6px; font-size: 0.9rem;">${taken.device_description}</div>
            </div>
          ` : ''}
        </div>
      ` : `
        <div style="background: var(--bg-soft); padding: 16px; border-radius: 12px; text-align: center; margin-bottom: 16px;">
          <p style="color: var(--text-dim); margin: 0;">Device not yet marked as taken</p>
        </div>
      `}

      ${returned ? `
        <div style="background: rgba(34, 197, 94, 0.1); padding: 16px; border-radius: 12px; border: 1px solid rgba(34, 197, 94, 0.2);">
          <h4 style="margin: 0 0 12px 0;">✅ Device Returned</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Condition</small>
              <div style="margin-top: 4px; padding: 4px 8px; background: #dcfce7; color: #15803d; border-radius: 4px; display: inline-block; font-weight: 600;">${returned.device_condition?.toUpperCase() || 'GOOD'}</div>
            </div>
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Returned On</small>
              <div style="margin-top: 4px;">${formatDateTime(returned.returned_at)}</div>
            </div>
          </div>
          ${returned.return_image_url ? `
            <div style="margin-bottom: 12px;">
              <small style="color: var(--text-dim); font-weight: 600;">Return Image</small>
              <img src="${returned.return_image_url}" alt="Return" style="width: 100%; max-height: 200px; border-radius: 8px; margin-top: 8px; object-fit: cover;">
            </div>
          ` : ''}
          ${returned.return_notes ? `
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Notes</small>
              <div style="margin-top: 4px; padding: 8px; background: white; border-radius: 6px; font-size: 0.9rem;">${returned.return_notes}</div>
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// Render follow-up status section
export function renderFollowUpTab(followups) {
  return `
    <div style="padding: 20px 0;">
      ${followups && followups.length > 0 ? `
        <div>
          <h4 style="margin: 0 0 16px 0;">Follow-up Updates</h4>
          ${followups.map(log => `
            <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <strong style="color: var(--primary);">${log.status?.replace(/_/g, ' ').toUpperCase()}</strong>
                <small style="color: var(--text-dim);">${formatDateTime(log.created_at)}</small>
              </div>
              ${log.notes ? `<div style="font-size: 0.9rem; margin-bottom: 4px;">${log.notes}</div>` : ''}
              ${log.profiles?.full_name ? `<small style="color: var(--text-dim);">By: ${log.profiles.full_name}</small>` : ''}
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="background: var(--bg-soft); padding: 16px; border-radius: 12px; text-align: center;">
          <p style="color: var(--text-dim); margin: 0;">No follow-up updates yet</p>
        </div>
      `}
    </div>
  `;
}

// Get status badge HTML
export function getDeviceStatusBadge(status) {
  const badges = {
    'taken': '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">📸 Device Taken</span>',
    'returned': '<span style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">✅ Returned</span>',
    'pending': '<span style="background: #f3f4f6; color: #6b7280; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">⏳ Pending</span>',
  };
  return badges[status] || '<span style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">—</span>';
}
