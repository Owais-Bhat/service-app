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

// Downscale + recompress a device photo client-side before upload. On-site
// signal is often weak, so shrinking a 4-8MB phone photo to a couple hundred
// KB is the difference between an instant save and a stalled spinner. Falls
// back to the original file untouched if it isn't an image or compression
// fails for any reason (never blocks the save on a compression error).
async function compressImage(file, maxDim = 1440, quality = 0.72) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // compression didn't help - keep original
    return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// Load device taken log for an inquiry
export async function loadDeviceTakenLog(inquiryId) {
  try {
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`, { headers: getHeaders() });
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
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`, { headers: getHeaders() });
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
    const res = await fetch(`${API_URL}/device-tracking/status/${inquiryId}`, { headers: getHeaders() });
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
      formData.append('file', await compressImage(imageFile));

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
      formData.append('file', await compressImage(imageFile));

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
    const res = await fetch(`${API_URL}/device-tracking/all`, { headers: getHeaders() });
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
