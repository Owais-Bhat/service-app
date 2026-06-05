// Device Tracking Module
import { toast, formatDateTime } from '../utils.js';

const API_URL = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const getHeaders = () => {
  const token = localStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

// Load device taken log for an inquiry
export async function loadDeviceTakenLog(inquiryId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load status');
    return { data: data.device_taken_logs, error: null };
  } catch (err) {
    console.error('Error loading device taken log:', err);
    return { data: null, error: err };
  }
}

// Load device return log for an inquiry
export async function loadDeviceReturnLog(inquiryId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load status');
    return { data: data.device_return_logs, error: null };
  } catch (err) {
    console.error('Error loading device return log:', err);
    return { data: null, error: err };
  }
}

// Load device follow-up logs
export async function loadDeviceFollowUpLogs(inquiryId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load status');
    return { data: data.device_follow_up_logs || [], error: null };
  } catch (err) {
    console.error('Error loading device follow-up logs:', err);
    return { data: [], error: err };
  }
}

// Save device taken with image
export async function saveDeviceTaken(inquiryId, employeeId, imageFile, description) {
  try {
    let imageUrl = null;

    // Upload image if provided via Node.js backend upload endpoint
    if (imageFile) {
      const formData = new FormData();
      formData.append('file', imageFile);

      const uploadRes = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');
      imageUrl = uploadData.url;
    }

    // Save device taken log via our backend API
    const res = await fetch(`${API_URL}/device-tracking/taken`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        inquiry_id: inquiryId,
        description,
        device_image_url: imageUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save device taken log');

    return { data, error: null };
  } catch (err) {
    console.error('Error saving device taken:', err);
    return { data: null, error: err };
  }
}

// Save device return with image
export async function saveDeviceReturn(inquiryId, imageFile, condition, notes) {
  try {
    let imageUrl = null;

    // Upload image if provided via Node.js backend upload endpoint
    if (imageFile) {
      const formData = new FormData();
      formData.append('file', imageFile);

      const uploadRes = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');
      imageUrl = uploadData.url;
    }

    // Save device return log via our backend API
    const res = await fetch(`${API_URL}/device-tracking/return`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        inquiry_id: inquiryId,
        device_condition: condition,
        return_notes: notes,
        return_image_url: imageUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save device return log');

    return { data, error: null };
  } catch (err) {
    console.error('Error saving device return:', err);
    return { data: null, error: err };
  }
}

// Add follow-up status update
export async function saveFollowUpStatus(inquiryId, status, notes, userId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/followup`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        inquiry_id: inquiryId,
        status,
        notes,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save follow-up status');

    return { data, error: null };
  } catch (err) {
    console.error('Error saving follow-up status:', err);
    return { data: null, error: err };
  }
}

// Get all device tracking data for admin panel
export async function getAllDeviceTracking() {
  try {
    const res = await fetch(`${API_URL}/device-tracking/all`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load device tracking');
    }

    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error loading all device tracking:', err);
    return { data: [], error: err };
  }
}
