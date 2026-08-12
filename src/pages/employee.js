import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime, formatTime, showNotification, calculateSLA, effectiveSLADeadline, isSlaPaused, formatTimeRemaining, formatSLADeadline, exportToCSV, showLoader } from '../utils.js';
import { ICONS } from '../icons.js';
import { saveDeviceTaken, saveDeviceReturn, saveFollowUpStatus, loadDeviceTakenLog, loadDeviceReturnLog, loadDeviceFollowUpLogs } from './device-tracking.js';
import { getEmployeeDevices, getDeviceStatus, renderDeviceTrackingTab, renderFollowUpTab } from './device-tracking-employee.js';
import { kpiCard } from './dashboard-widgets.js';

// Device tracking master on/off (admin-controlled). Cached after first fetch.
let deviceTrackingEnabled = true;
async function loadDeviceTrackingEnabled() {
  try {
    const base = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '/api' : 'http://localhost:5000/api';
    const res = await fetch(`${base}/settings/device-tracking`);
    const data = await res.json();
    deviceTrackingEnabled = data.enabled !== false;
  } catch { deviceTrackingEnabled = true; }
  return deviceTrackingEnabled;
}

// A ticket is locked (read-only) once it reaches a terminal state.
// 'resolved' and 'case_closed' lock the modal; 'issue_not_resolved' stays editable.
function isLocked(status) {
  return ['resolved', 'case_closed', 'foc'].includes(displayStatus(status));
}

async function setTicketDeviceFlag(inquiryId, enabled) {
  const base = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '/api' : 'http://localhost:5000/api';
  const res = await fetch(`${base}/device-tracking/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    body: JSON.stringify({ inquiry_id: inquiryId, enabled }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Could not update device flag');
  }
  return res.json();
}

// Tries GPS first (enableHighAccuracy), falls back to network-based location
// (WiFi/cell) if GPS doesn't respond in time. The fallback is instant on
// iPhone and avoids the 12-second freeze from watchPosition on iOS Safari.
function getHighAccuracyPosition({ maxWaitMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    let done = false;

    const tryLow = () => {
      navigator.geolocation.getCurrentPosition(
        pos => { if (!done) { done = true; resolve(pos); } },
        err => { if (!done) { done = true; reject(err); } },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    };

    const fallbackTimer = setTimeout(tryLow, maxWaitMs);

    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(fallbackTimer); if (!done) { done = true; resolve(pos); } },
      ()  => { clearTimeout(fallbackTimer); if (!done) tryLow(); },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
    );
  });
}

async function reverseGeocode(lat, lng) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
  const data = await res.json();
  return data.display_name || '';
}

function mapLink(lat, lng) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function inquiryMapLink(inq) {
  if (inq?.customer_lat != null && inq?.customer_lng != null) {
    return mapLink(inq.customer_lat, inq.customer_lng);
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inq?.location || '')}`;
}

function setButtonLoading(btn, label = 'Loading...') {
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

async function openTaskModalWithLoader(btn, taskId, inqId, currentStatus, onDone) {
  const restore = setButtonLoading(btn, 'Loading');
  try {
    await openTaskModal(taskId, inqId, currentStatus, onDone);
  } catch (err) {
    console.error(err);
    toast('Could not open service manager', 'error');
  } finally {
    restore();
  }
}

// Renders the "Devices in Service" container (tickets the employee sent to the
// service center). Shared by the Tasks view and the Dashboard. Hidden entirely
// when the master device-tracking feature is off or no devices are in service.
const FOLLOWUP_LABELS = {
  none: 'Not started', awaiting_parts: '⏳ Awaiting Parts', repair_progress: '🔧 In Repair',
  ready_return: '📦 Ready to Return', returned: '✅ Returned', taken: '📸 Taken',
};
async function populateDevicesInService(container, employeeId, opts = {}) {
  const card = container.querySelector('#devices-in-service-card');
  const list = container.querySelector('#devices-in-service-list');
  if (!card || !list) return;
  if (!(await loadDeviceTrackingEnabled())) { card.dataset.hasDevices = '0'; if (!opts.deferShow) card.style.display = 'none'; return; }

  const { data } = await getEmployeeDevices(employeeId);
  const inService = (data || []).filter(d => Number(d.device_service_enabled) === 1);
  if (inService.length === 0) { card.dataset.hasDevices = '0'; if (!opts.deferShow) card.style.display = 'none'; return; }

  list.innerHTML = inService.map(d => {
    const fu = d.follow_up_status && d.follow_up_status !== 'none'
      ? d.follow_up_status : (d.device_taken_logs ? 'taken' : 'none');
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:0.9rem;color:var(--primary);">${escapeHtml(d.ticket_no || '—')}</div>
          <div style="font-size:0.82rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.full_name || 'Client')} · ${escapeHtml(d.service_item || 'Service')}</div>
          <span class="badge" style="margin-top:4px;display:inline-block;">${FOLLOWUP_LABELS[fu] || fu}</span>
        </div>
        <button class="btn btn-secondary btn-sm dev-manage-btn" data-id="${d.id}" data-status="${escapeAttr(d.status || 'in_progress')}">Manage</button>
      </div>`;
  }).join('');
  card.dataset.hasDevices = '1';
  // On the My Tasks page the card's visibility is controlled by the
  // "Device Follow Up" filter tab; elsewhere it shows as soon as data loads.
  if (!opts.deferShow) card.style.display = 'block';

  // Daily nudge: remind the employee once per day (per device set) to update the
  // follow-up status of devices still in service.
  try {
    const pending = inService.filter(d => (d.follow_up_status || 'none') !== 'returned');
    const dayKey = `dev_reminder_${employeeId}_${new Date().toISOString().slice(0, 10)}`;
    if (pending.length && !localStorage.getItem(dayKey)) {
      localStorage.setItem(dayKey, '1');
      showNotification({
        title: 'Device follow-up reminder',
        body: `You have ${pending.length} device(s) in service. Please update their status today.`,
        type: 'alert',
        tag: 'device-followup-daily',
      });
      toast(`Reminder: update follow-up for ${pending.length} device(s) in service`, 'info');
    }
  } catch {}

  list.querySelectorAll('.dev-manage-btn').forEach(btn => {
    btn.onclick = () => openTaskModalWithLoader(btn, null, btn.dataset.id, btn.dataset.status, () => {
      // Re-render the host view after the modal closes.
      const tasksHost = document.querySelector('#task-list');
      if (tasksHost) renderEmployeeTasks(container);
      else populateDevicesInService(container, employeeId);
    });
  });
}

// Sidebar page: device follow-up management for the logged-in employee.
export async function renderEmployeeFollowUp(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  if (!(await loadDeviceTrackingEnabled())) {
    container.innerHTML = `
      <div class="page-header"><div><h1>Device Follow-up</h1></div></div>
      <div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim)">Device tracking is currently turned off by admin.</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;color:var(--primary);">${ICONS.wrench}</span>
          <span>Device Follow-up</span>
        </h1>
        <p>Update the progress of devices you have taken for service.</p>
      </div>
    </div>
    <div id="fu-list"><div style="text-align:center;padding:30px;color:var(--text-dim);">Loading…</div></div>`;

  const listEl = container.querySelector('#fu-list');
  const { data } = await getEmployeeDevices(user.id);
  const inService = (data || []).filter(d => Number(d.device_service_enabled) === 1 || d.device_taken_logs);

  if (inService.length === 0) {
    listEl.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim)">No devices in service right now. Take a device from a ticket's <b>Device Service</b> tab to start tracking.</div></div>`;
    return;
  }

  const details = await Promise.all(inService.map(d => getDeviceStatus(d.id)));

  listEl.innerHTML = inService.map((d, idx) => {
    const followups = details[idx]?.data?.device_follow_up_logs || [];
    return `
      <div class="card" style="margin-bottom:14px;" data-inq="${escapeAttr(d.id)}">
        <div class="card-header"><span class="card-title">${escapeHtml(d.ticket_no || '—')} · ${escapeHtml(d.full_name || 'Client')}</span></div>
        <div class="card-body">
          <div style="font-size:0.85rem;color:var(--text-soft);margin-bottom:12px;">${escapeHtml(d.service_item || 'Service')}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px 18px;background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:14px;font-size:0.84rem;">
            ${[
              ['Customer', d.full_name],
              ['Phone', d.phone],
              ['Company', d.company_name],
              ['Address', d.address],
              ['Device', d.device_type],
              ['Serial No', d.device_serial_no],
              ['Preferred Time', d.preferred_time],
              ['Bill No', d.bill_no],
            ].filter(([, v]) => v).map(([k, v]) => `
              <div><div style="color:var(--text-dim);font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:.04em;">${k}</div><div>${escapeHtml(v)}</div></div>
            `).join('')}
          </div>
          <div class="form-group">
            <label>Update follow-up status</label>
            <select class="fu-status">
              <option value="awaiting_parts">⏳ Awaiting Parts</option>
              <option value="repair_progress">🔧 Repair in Progress</option>
              <option value="ready_return">📦 Ready to Return</option>
              <option value="returned">✅ Returned to Client</option>
            </select>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea class="fu-notes" rows="2" placeholder="Latest update on this device..."></textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm fu-save" data-inq="${escapeAttr(d.id)}">Add update</button>
            <button class="btn btn-secondary btn-sm fu-open" data-inq="${escapeAttr(d.id)}" data-status="${escapeAttr(d.status || 'in_progress')}">Open ticket to complete service</button>
          </div>
          <div class="fu-history" style="margin-top:14px;">${renderFollowUpTab(followups)}</div>
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.fu-save').forEach(btn => {
    btn.onclick = async () => {
      const card = btn.closest('[data-inq]');
      const inqId = btn.dataset.inq;
      const status = card.querySelector('.fu-status').value;
      const notes = card.querySelector('.fu-notes').value.trim();
      btn.disabled = true; btn.textContent = 'Saving…';
      const { error } = await saveFollowUpStatus(inqId, status, notes, user.id);
      btn.disabled = false; btn.textContent = 'Add update';
      if (error) return toast(error.message || 'Could not save', 'error');
      toast('Follow-up update added', 'success');
      const { data: st } = await getDeviceStatus(inqId);
      const hist = card.querySelector('.fu-history');
      if (hist) hist.innerHTML = renderFollowUpTab(st?.device_follow_up_logs || []);
      const notesEl = card.querySelector('.fu-notes'); if (notesEl) notesEl.value = '';
    };
  });

  // Open the full Manage Service ticket so the employee can finish/resolve it.
  listEl.querySelectorAll('.fu-open').forEach(btn => {
    btn.onclick = () => openTaskModalWithLoader(btn, null, btn.dataset.inq, btn.dataset.status, () => renderEmployeeFollowUp(container));
  });
}

// Business info shown on every premium bill.
const BUSINESS = {
  name: 'Networking Experts',
  tagline: 'Service | Installation | Support',
  address: 'Srinagar, J&K, India',
  phone: '+91 8899133144',
  email: 'support@networkingexperts.in',
  gstin: '-',
};

function displayStatus(status) {
  return status === 'closed' ? 'resolved' : (status || 'open');
}

function statusText(status) {
  const shown = displayStatus(status);
  const labels = {
    pending: 'received',
    open: 'received',
    assigned: 'assigned',
    in_progress: 'in progress',
    resolved: 'resolved',
    issue_not_resolved: 'issue not resolved',
    case_closed: 'case closed',
    foc: 'FOC (free)',
  };
  return labels[shown] || shown.replace('_', ' ');
}

// Lazily inject PDF renderer libraries. Try the html2pdf bundle first, then
// load html2canvas + jsPDF separately if a CDN blocks one of the files.
let _html2pdfPromise = null;
function loadScriptFromSources(sources) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      const src = sources[i++];
      if (!src) return reject(new Error('Could not load PDF library'));
      const existing = document.querySelector(`script[data-pdf-src="${src}"]`);
      if (existing?.dataset.loaded === 'true') return resolve();
      const s = existing || document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.pdfSrc = src;
      s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
      s.onerror = () => {
        s.remove();
        tryNext();
      };
      if (!existing) document.head.appendChild(s);
    };
    tryNext();
  });
}

function loadHtml2Pdf() {
  if (window.html2canvas && (window.jspdf?.jsPDF || window.jsPDF)) {
    return Promise.resolve({ html2canvas: window.html2canvas, jsPDF: window.jspdf?.jsPDF || window.jsPDF });
  }
  if (_html2pdfPromise) return _html2pdfPromise;
  _html2pdfPromise = (async () => {
    await loadScriptFromSources([
      'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
      'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
      'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
    ]).catch(() => {});

    if (!window.html2canvas) {
      await loadScriptFromSources([
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js',
      ]);
    }

    if (!(window.jspdf?.jsPDF || window.jsPDF)) {
      await loadScriptFromSources([
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
        'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
      ]);
    }

    const html2canvas = window.html2canvas;
    const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
    if (!html2canvas || !JsPDF) {
      throw new Error('PDF renderer did not load correctly');
    }
    return { html2canvas, jsPDF: JsPDF };
  })().catch(err => {
    _html2pdfPromise = null;
    throw err;
  });
  return _html2pdfPromise;
}

// Premium printable bill template, used by employee + admin.
export function renderPremiumBillHTML(data) {
  const LOGO_URL = new URL('../assets/logo.png', import.meta.url).href;
  // Ultra-robust currency formatter - avoids toLocaleString to prevent potential JS errors in older browsers.
  const inr = (n) => {
    const val = Math.round(Number(n) || 0);
    return '₹' + val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const today = new Date();
  const issued = `${today.getDate().toString().padStart(2,'0')}/${(today.getMonth()+1).toString().padStart(2,'0')}/${today.getFullYear()}`;
  const billNo = `NX-${(data.customer?.ticket_no || Date.now()).toString().slice(-8)}`;
  
  const services = Array.isArray(data.services) ? data.services : [];
  const itemRows = services.map((s, i) => `
    <tr style="display:table-row !important;">
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#9CA3AF; width:30px;">${i + 1}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#1F2937;">${esc(s.name)}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#0F172A; text-align:right; font-weight:700;">${inr(s.cost)}</td>
    </tr>`).join('') || `<tr style="display:table-row !important;"><td colspan="3" style="display:table-cell !important; text-align:center;color:#9CA3AF;padding:20px;">No itemised services</td></tr>`;

  const extraRow = Number(data.extra) > 0 ? `
    <tr style="display:table-row !important;">
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#9CA3AF;">${services.length + 1}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#1F2937;">Additional charges${data.extraReason ? ` <small style="color:#6B7280">(${esc(data.extraReason)})</small>` : ''}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#0F172A; text-align:right; font-weight:700;">${inr(data.extra)}</td>
    </tr>` : '';
  const breakdownRow = (label, amount, { color = '#374151', bold = false, border = '', total = false } = {}) => `
    <div style="display:flex !important; align-items:center !important; justify-content:space-between !important; gap:16px !important; min-height:${total ? '38px' : '28px'} !important; ${border}">
      <span style="display:block !important; flex:1 1 auto !important; color:${color} !important; font-weight:${bold ? '700' : '400'} !important;">${label}</span>
      <span style="display:block !important; flex:0 0 112px !important; width:112px !important; color:${total ? '#10B981' : color} !important; font-weight:${total ? '900' : '700'} !important; text-align:right !important; white-space:nowrap !important;">${amount}</span>
    </div>`;
  const breakdownRows = [
    breakdownRow('Services subtotal', inr(data.servicesSubtotal)),
    Number(data.extra) > 0 ? breakdownRow('Extra charges', inr(data.extra)) : '',
    breakdownRow('Platform fee', inr(data.platform)),
    breakdownRow('Transport', inr(data.transport)),
    breakdownRow('Taxable', inr(data.taxable), { bold: true, border: 'border-top:1px solid #eee !important; padding-top:5px !important;' }),
    breakdownRow('GST (18%)', inr(data.gst)),
    Number(data.discount) > 0 ? breakdownRow(esc(data.discountLabel || 'Discount'), `-${inr(data.discount)}`, { color: '#059669' }) : '',
    breakdownRow('Total', inr(data.total), { bold: true, total: true, border: 'border-top:2px solid #10B981 !important; margin-top:2px !important;' }),
  ].join('');

  return `
  <div class="premium-bill" id="premium-bill-print" style="font-family:Arial, sans-serif !important; background:#ffffff !important; color:#0F172A !important; padding:40px !important; width:794px !important; box-sizing:border-box !important; display:block !important; visibility:visible !important; opacity:1 !important;">
    <div class="pb-header" style="display:flex !important; flex-direction:row !important; justify-content:space-between !important; align-items:center !important; border-bottom:1px dashed #eee !important; padding-bottom:20px !important; margin-bottom:20px !important;">
      <div class="pb-brand" style="display:flex !important; align-items:center !important; gap:12px !important;">
        <img src="${LOGO_URL}" alt="${BUSINESS.name}" style="width:50px; height:50px; object-fit:contain;" onerror="this.style.display='none'"/>
        <div>
          <div style="font-size:20px; font-weight:800; color:#064E3B;">${BUSINESS.name}</div>
          <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:1px;">${BUSINESS.tagline}</div>
        </div>
      </div>
      <div class="pb-meta" style="text-align:right !important;">
        <div style="display:inline-block; background:#10B981; color:#fff; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:800; margin-bottom:8px;">TAX INVOICE</div>
        <div style="font-size:12px; color:#4B5563;">Bill # <b style="color:#0F172A;">${esc(billNo)}</b></div>
        <div style="font-size:12px; color:#4B5563;">Date: <b style="color:#0F172A;">${issued}</b></div>
      </div>
    </div>

    <div class="pb-parties" style="display:grid !important; grid-template-columns:1fr 1fr !important; gap:30px !important; margin-bottom:20px !important; border-bottom:1px dashed #eee !important; padding-bottom:20px !important;">
      <div>
        <div style="font-size:10px; font-weight:800; color:#10B981; text-transform:uppercase; margin-bottom:6px;">Billed To</div>
        <div style="font-size:16px; font-weight:800; color:#0F172A;">${esc(data.customer?.name || '-')}</div>
        <div style="font-size:13px; color:#4B5563;">${esc(data.customer?.phone || '')}</div>
        ${data.customer?.company ? `<div style="font-size:13px; color:#4B5563;">${esc(data.customer.company)}</div>` : ''}
        <div style="font-size:13px; color:#6B7280; font-style:italic;">${esc(data.customer?.location || '')}</div>
      </div>
      <div>
        <div style="font-size:10px; font-weight:800; color:#10B981; text-transform:uppercase; margin-bottom:6px;">Service Details</div>
        <div style="font-size:13px; color:#4B5563;"><b>Ticket:</b> ${esc(data.customer?.ticket_no || '-')}</div>
        <div style="font-size:13px; color:#4B5563;"><b>Service:</b> ${esc(data.customer?.service_item || '-')}</div>
        ${data.customer?.device_type ? `<div style="font-size:13px; color:#4B5563;"><b>Device:</b> ${esc(data.customer.device_type)}</div>` : ''}
        ${data.technician ? `<div style="font-size:13px; color:#4B5563;"><b>Technician:</b> ${esc(data.technician)}</div>` : ''}
      </div>
    </div>

    <table style="width:100% !important; border-collapse:collapse !important; margin-bottom:20px !important; display:table !important;">
      <thead>
        <tr style="background:#f9fafb; border-bottom:2px solid #10B981; display:table-row !important;">
          <th style="display:table-cell !important; padding:12px; text-align:left; font-size:11px; color:#064E3B; text-transform:uppercase; width:30px;">#</th>
          <th style="display:table-cell !important; padding:12px; text-align:left; font-size:11px; color:#064E3B; text-transform:uppercase;">Description</th>
          <th style="display:table-cell !important; padding:12px; text-align:right; font-size:11px; color:#064E3B; text-transform:uppercase;">Amount</th>
        </tr>
      </thead>
      <tbody style="display:table-row-group !important;">${itemRows}${extraRow}</tbody>
    </table>

    <div style="margin-left:auto; width:300px; background:#f9fafb; padding:15px; border-radius:12px; display:block !important;">
      <div style="display:inline-block; background:#10B981; color:#fff; padding:3px 10px; border-radius:15px; font-size:9px; font-weight:800; margin-bottom:12px;">AMOUNT BREAKDOWN</div>
      <div style="display:block !important; width:100% !important; font-size:13px !important; color:#374151 !important;">${breakdownRows}</div>
    </div>

    ${data.paymentLink ? `
      <div style="margin-top:20px; padding:20px; border:1px dashed #10B981; border-radius:12px; text-align:center; background:rgba(16,185,129,0.02);">
        <div style="font-weight:800; font-size:11px; color:#064E3B; text-transform:uppercase; margin-bottom:10px;">Secure Payment</div>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.paymentLink)}" style="width:120px; height:120px; margin:0 auto 10px; display:block; border-radius:8px;"/>
        <div style="font-size:11px; color:#2563EB; word-break:break-all;">${esc(data.paymentLink)}</div>
      </div>` : ''}

    <div style="margin-top:30px; padding-top:20px; border-top:1px dashed #eee; text-align:center;">
      <div style="font-weight:800; color:#10B981; font-size:14px;">Thank you for your business!</div>
      <div style="font-size:11px; color:#6B7280; margin-top:5px;">
        ${BUSINESS.address} | ${BUSINESS.phone} | ${BUSINESS.email}
      </div>
      <div style="font-size:10px; color:#9CA3AF; margin-top:5px;">GSTIN: ${BUSINESS.gstin} | Computer Generated Invoice</div>
    </div>
  </div>`;
}

// Render the bill HTML to a PDF Blob.
async function renderBillToPdfBlob(billHTML, filename) {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.classList.add('pdf-rendering');
  wrapper.style.width = '794px';
  wrapper.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    'width:794px',
    'min-height:1123px',
    'background:#ffffff',
    'pointer-events:none',
    'z-index:-1',
  ].join(';');

  const sandbox = document.createElement('div');
  sandbox.style.cssText = 'width:794px;min-height:1123px;background:#ffffff;padding:0;box-sizing:border-box;';
  sandbox.innerHTML = billHTML;
  wrapper.appendChild(sandbox);
  document.body.appendChild(wrapper);

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise(r => setTimeout(r, 50));

  const imgs = [...sandbox.querySelectorAll('img')];
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 2500);
    });
  }));

  try {
    const { html2canvas, jsPDF: JsPDF } = await loadHtml2Pdf();

    const node = sandbox.firstElementChild;
    node.style.display = 'block';
    node.style.overflow = 'visible';
    node.style.position = 'relative';
    node.style.width = '794px';
    node.style.maxWidth = '794px';
    node.style.minHeight = '1123px';

    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
      width: 794,
      height: node.scrollHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new JsPDF({
      unit: 'px',
      format: [794, 1123],
      orientation: 'portrait',
      hotfixes: ['px_scaling'],
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 1.0);

    let remainingHeight = imgHeight;
    let y = 0;
    pdf.addImage(imgData, 'JPEG', 0, y, imgWidth, imgHeight, undefined, 'FAST');
    remainingHeight -= pageHeight;

    while (remainingHeight > 0) {
      y -= pageHeight;
      pdf.addPage([794, 1123], 'portrait');
      pdf.addImage(imgData, 'JPEG', 0, y, imgWidth, imgHeight, undefined, 'FAST');
      remainingHeight -= pageHeight;
    }

    const blob = pdf.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });
    return { blob, file };
  } finally {
    wrapper.remove();
  }
}

function openBillPrintWindow(billHTML, filename) {
  const printWindow = window.open('', '_blank', 'width=900,height=1200');
  if (!printWindow) {
    throw new Error('Allow popups to print or save this bill as PDF');
  }
  printWindow.opener = null;

  const safeTitle = String(filename || 'invoice.pdf').replace(/[<>&"]/g, '');
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-shell { width: 794px; min-height: 1123px; background: #ffffff; }
    @media print {
      body { display: block; }
      .print-shell { width: 100%; min-height: auto; }
    }
  </style>
</head>
<body>
  <div class="print-shell">${billHTML}</div>
  <script>
    const finish = () => setTimeout(() => window.print(), 150);
    const images = Array.from(document.images || []);
    if (!images.length) finish();
    else Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 2500);
    }))).then(finish);
  </script>
</body>
</html>`);
  printWindow.document.close();
}

function fitBillPreview(overlay) {
  const stage = overlay.querySelector('#bill-preview-stage');
  const container = overlay.querySelector('#bill-preview-container');
  const body = overlay.querySelector('.modal-body');
  if (!stage || !container || !body) return;

  container.style.transform = 'scale(1)';
  stage.style.height = 'auto';

  const availableWidth = Math.max(260, body.clientWidth - 16);
  const scale = Math.min(1, availableWidth / 794);
  container.style.transform = `scale(${scale})`;
  stage.style.height = `${container.offsetHeight * scale}px`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const r = String(fr.result || '');
      resolve(r.includes(',') ? r.slice(r.indexOf(',') + 1) : r);
    };
    fr.onerror = () => reject(fr.error || new Error('Could not read PDF blob'));
    fr.readAsDataURL(blob);
  });
}

async function uploadBillPdf(blob, filename, inquiry_id) {
  const dataBase64 = await blobToBase64(blob);
  const token = localStorage.getItem('auth_token');
  const res = await fetch('/api/bills/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ dataBase64, filename, inquiry_id: inquiry_id || null }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Upload failed');
  }
  const { url } = await res.json();
  return url;
}

/**
 * Generate the bill PDF for the given bill data and upload it to the server.
 * Returns the public URL of the uploaded PDF.
 * If an existing pdfUrl is provided (already stored on the inquiry) it is returned immediately
 * without generating a new PDF.
 */
// Ask the server to render the invoice PDF (consistent output, no CDN/browser
// rendering). Throws if the server can't (e.g. pdfkit not installed) so the
// caller can fall back to the in-browser renderer.
async function generateBillPdfServer(billData, inquiryId) {
  const token = localStorage.getItem('auth_token');
  const filename = `Invoice-${billData.customer?.ticket_no || 'service'}.pdf`;
  const res = await fetch('/api/bills/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ billData, inquiry_id: inquiryId || null, filename }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Server PDF generation failed');
  }
  const { url } = await res.json();
  return url;
}

export async function shareBillToPublicLink(billData, { inquiryId = null, existingUrl = null } = {}) {
  if (existingUrl) return existingUrl;
  // Prefer the server-rendered PDF; fall back to the in-browser renderer if the
  // server can't generate it (older deploy, pdfkit not installed, etc.).
  try {
    return await generateBillPdfServer(billData, inquiryId);
  } catch (err) {
    console.warn('[bill] server PDF unavailable, using browser render:', err.message);
    const billHTML = renderPremiumBillHTML(billData);
    const filename = `Invoice-${billData.customer?.ticket_no || 'service'}.pdf`;
    const { blob } = await renderBillToPdfBlob(billHTML, filename);
    return uploadBillPdf(blob, filename, inquiryId);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function billShortCaption(data, pdfUrl) {
  const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
  const services = Array.isArray(data.services) ? data.services : [];
  const lines = [
    `Hi ${data.customer?.name || 'Customer'}!`,
    `Your service invoice from *${BUSINESS.name}* is ready.`,
    `Ticket: *${data.customer?.ticket_no || '-'}*`,
    `Device: *${data.customer?.device_type || 'General Service'}*`,
    '',
    `*Bill Breakdown:*`,
  ];
  if (services.length) {
    services.forEach((s, i) => lines.push(`${i + 1}. ${s.name}: *${inr(s.cost)}*`));
  } else {
    lines.push(`- Services Subtotal: *${inr(data.servicesSubtotal)}*`);
  }
  if (data.extra > 0) {
    lines.push(`- Additional Charges: *${inr(data.extra)}*${data.extraReason ? ` (${data.extraReason})` : ''}`);
  }
  lines.push(`- Platform Fee: *${inr(data.platform)}*`);
  if (data.km > 0) {
    lines.push(`- Transport (${data.km} km): *${inr(data.transport)}*`);
  }
  if (data.discount > 0) {
    lines.push(`- Discount: *-${inr(data.discount)}*${data.discountLabel ? ` (${data.discountLabel})` : ''}`);
  }
  lines.push(
    `- GST (18%): *${inr(data.gst)}*`,
    `------------------------------`,
    `*Total Payable: ${inr(data.total)}*`,
    `------------------------------`,
    `Payment Status: *${String(data.paymentStatus || 'unpaid').toUpperCase()}*`
  );
  // Always include the downloadable PDF invoice link so the customer gets the
  // full tax invoice — not just this text summary.
  if (pdfUrl) {
    lines.push('', `View / download your invoice (PDF):`, pdfUrl);
  }
  if (data.paymentStatus !== 'paid' && data.paymentLink) {
    lines.push('', `Pay here:`, data.paymentLink);
  }
  lines.push('', `- ${BUSINESS.name}`);
  return lines.join('\n');
}

export function openPremiumBillModal(data, opts = {}) {
  const { onSent, allowShare = true, title = 'Service Invoice Preview', inquiryId = null, existingPdfUrl = null } = opts;
  const billHTML = renderPremiumBillHTML(data);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay premium-bill-modal';
  overlay.innerHTML = `
    <div class="modal-card modal-large">
      <div class="modal-header">
        <h3>${title}</h3>
        <button type="button" class="modal-close premium-bill-close" id="pb-close" title="Close bill" aria-label="Close bill">${ICONS.close}</button>
      </div>
      <div class="modal-body" style="background:#F8FAFC; padding:20px; overflow-x:auto;">
        <div id="bill-preview-stage" style="width:100%; display:flex; justify-content:center;">
          <div id="bill-preview-container" style="background:white; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); border-radius:8px; width:794px; margin:0 auto; transform-origin: top center;">
            ${billHTML}
          </div>
        </div>
      </div>
      <div class="modal-footer" style="gap:12px;">
        <button class="btn btn-secondary" id="pb-cancel">Close</button>
        <button class="btn btn-secondary" id="pb-print">Print / Save PDF</button>
        ${allowShare ? `<button class="btn btn-primary" id="pb-whatsapp">${ICONS.whatsapp}<span>Send via WhatsApp</span></button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => fitBillPreview(overlay));
  const onResize = () => fitBillPreview(overlay);
  window.addEventListener('resize', onResize);
  const onKeydown = (e) => {
    if (e.key === 'Escape') closeBillModal();
  };
  const closeBillModal = () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  window.addEventListener('keydown', onKeydown);
  overlay.querySelector('#pb-close').onclick = closeBillModal;
  overlay.querySelector('#pb-cancel').onclick = closeBillModal;
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeBillModal();
  });

  const filename = `Invoice-${data.customer?.ticket_no || 'service'}.pdf`;

  overlay.querySelector('#pb-print').onclick = () => {
    try {
      openBillPrintWindow(billHTML, filename);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not open print window', 'error');
    }
  };

  if (allowShare) {
    overlay.querySelector('#pb-whatsapp').onclick = async () => {
      const btn = overlay.querySelector('#pb-whatsapp');
      btn.disabled = true;
      const originalHTML = btn.innerHTML;
      const phone = (data.customer?.phone || '').replace(/\D/g, '');
      if (!phone) {
        toast('Client phone number is missing on this inquiry', 'error');
        btn.disabled = false; btn.innerHTML = originalHTML;
        return;
      }

      try {
        btn.innerHTML = `<span>... preparing PDF</span>`;
        const pdfUrl = await shareBillToPublicLink(data, { inquiryId, existingUrl: existingPdfUrl });

        const caption = billShortCaption(data, pdfUrl);
        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(caption)}`;
        window.open(waUrl, '_blank');

        toast('WhatsApp opened with PDF link - send the message to the client.', 'success');
        if (typeof onSent === 'function') {
          try { await onSent(pdfUrl); } catch { }
        }
      } catch (err) {
        console.error(err);
        toast(err.message || 'Could not send bill', 'error');
      } finally {
        btn.disabled = false; btn.innerHTML = originalHTML;
      }
    };
  }
}

function getMonthKey(date = new Date()) {
  return date.toLocaleDateString('en-CA').slice(0, 7);
}

function dateKey(value) {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString('en-CA');
  const raw = String(value).trim();
  const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (dateOnly) return dateOnly[1];
  const d = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
}

function attendanceDateKey(row) {
  return dateKey(row?.date || row?.clock_in);
}

function daysBetweenInclusive(start, end) {
  if (!start || !end) return 0;
  const a = dateKey(start);
  const b = dateKey(end);
  if (!a || !b) return 0;
  const startDate = new Date(`${a}T00:00:00`);
  const endDate = new Date(`${b}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return 0;
  return Math.floor((endDate - startDate) / 86400000) + 1;
}

function hoursWorked(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const diff = new Date(clockOut) - new Date(clockIn);
  if (!Number.isFinite(diff) || diff < 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

let employeeAutoClockOutTime = '18:00';
const STRICT_EOD_LIMIT = 4;

function parseClockOutTime(value = employeeAutoClockOutTime) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return { hour: 18, minute: 0, label: '18:00' };
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute, label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

async function loadEmployeeClockOutTime() {
  const apiBase = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '/api' : 'http://localhost:5000/api';
  try {
    const res = await fetch(`${apiBase}/settings/attendance`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
    });
    if (res.ok) {
      const data = await res.json();
      employeeAutoClockOutTime = parseClockOutTime(data.autoClockOutTime).label;
    }
  } catch (err) {
    console.warn('[employee] could not load clock-out settings', err);
  }
  return parseClockOutTime();
}

// Global on/off switches for the fixed-employee clock-in requirements —
// public endpoint (no auth) so this can be read before deciding whether to
// open the camera. Combined per-employee with photo_clockin_exempt /
// geofence_clockin_exempt (fetched separately) to get the final requirement.
async function loadClockInRequirements() {
  const apiBase = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '/api' : 'http://localhost:5000/api';
  try {
    const res = await fetch(`${apiBase}/settings/clockin-requirements`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('[employee] could not load clock-in requirements', err);
  }
  return { photoRequired: true, geofenceRequired: true };
}

function isPastAutoClockOut(now = new Date()) {
  const { hour, minute } = parseClockOutTime();
  const cutoff = new Date(now);
  cutoff.setHours(hour, minute, 0, 0);
  return now >= cutoff;
}

// The forced clock-in popup only appears from 8:30 AM onward (and until the
// employee clocks out / the auto clock-out cutoff). Before 8:30 it stays hidden.
const CLOCKIN_POPUP_START_HOUR = 8;
const CLOCKIN_POPUP_START_MIN = 30;
function isBeforeClockInWindow(now = new Date()) {
  const start = new Date(now);
  start.setHours(CLOCKIN_POPUP_START_HOUR, CLOCKIN_POPUP_START_MIN, 0, 0);
  return now < start;
}

function isForgottenClockOut(row, today = new Date().toLocaleDateString('en-CA')) {
  if (!row?.clock_in || row?.clock_out) return false;
  return attendanceDateKey(row) !== today || isPastAutoClockOut();
}

function getMissedEodRows(attendanceRows = [], reports = [], today = new Date().toLocaleDateString('en-CA')) {
  const reportDates = new Set((reports || []).map(report => dateKey(report.date || report.created_at)).filter(Boolean));
  return (attendanceRows || []).filter(row => {
    const rowDate = attendanceDateKey(row);
    if (!row?.clock_in || !rowDate || reportDates.has(rowDate)) return false;
    return rowDate !== today || isPastAutoClockOut();
  });
}

function money(value) {
  return `\u20B9${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

function byNewestCreated(a, b) {
  const aDate = a?.created_at || a?.inquiries?.[0]?.created_at || 0;
  const bDate = b?.created_at || b?.inquiries?.[0]?.created_at || 0;
  return new Date(bDate) - new Date(aDate);
}

function elapsedTime(start, end = new Date()) {
  if (!start) return '-';
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '-';
  const diff = Math.max(0, endDate.getTime() - startDate.getTime());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function starsHtml(n) {
  const v = Math.round(Number(n) || 0);
  return Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < v ? 'var(--warning)' : 'var(--border)'};display:inline-flex;width:14px;height:14px">${i < v ? ICONS.star : ICONS.starOutline}</span>`
  ).join('');
}

async function getEmployeeContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null };
  const [{ data: profile }, { data: attendance }, { data: leaves }, { data: reports }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('attendance').select('*').eq('user_id', user.id).order('date', { ascending: false }),
    supabase.from('leave_requests').select('*').eq('employee_id', user.id).order('created_at', { ascending: false }),
    supabase.from('eod_reports').select('*').eq('employee_id', user.id).order('date', { ascending: false }),
  ]);
  return { user, profile: profile || user, attendance: attendance || [], leaves: leaves || [], reports: reports || [] };
}

async function readSheetAsRows(file) {
  const { read, utils } = await import('https://cdn.sheetjs.com/xlsx-0.18.5/package/xlsx.mjs');
  const buffer = await file.arrayBuffer();
  const workbook = read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = utils.sheet_to_json(sheet, { header: 1 });
  return rows.length > 1 ? rows.slice(1) : [];
}

async function importServiceRows(rows) {
  let inserted = 0, skipped = 0, errors = [];
  const batch = [];
  for (const row of rows) {
    const [category, sub_category, sub_sub_category, cost] = Array.isArray(row) ? row : [row.category, row.sub_category, row.sub_sub_category, row.cost];
    if (!category || !sub_sub_category) { skipped++; continue; }
    const numCost = parseFloat(cost) || 0;
    if (numCost < 0) { skipped++; continue; }
    batch.push({
      id: crypto.randomUUID?.() || `svc-${Date.now()}-${Math.random()}`,
      category: String(category).trim(),
      sub_category: sub_category ? String(sub_category).trim() : null,
      sub_sub_category: String(sub_sub_category).trim(),
      name: String(sub_sub_category).trim(),
      cost: numCost,
    });
  }
  for (let j = 0; j < batch.length; j += 10) {
    const chunk = batch.slice(j, j + 10);
    let retries = 0;
    while (retries < 3) {
      const { error } = await supabase.from('service_pricing').insert(chunk);
      if (error?.status === 429) {
        retries++;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries)));
        continue;
      }
      if (error) { errors.push(error.message); skipped += chunk.length; }
      else inserted += chunk.length;
      break;
    }
    if (retries === 3) { errors.push('Rate limited - batch skipped'); skipped += chunk.length; }
  }
  return { inserted, skipped, errors };
}

function downloadTemplateCSV() {
  const template = [
    ['Main Category', 'Sub Category', 'Sub-Sub Category', 'Price'],
    ['Network Installation', 'Setup', 'Basic Setup', '500'],
    ['Network Installation', 'Setup', 'Advanced Setup', '1000'],
    ['Repair', 'Hardware', 'Cable Replacement', '300'],
  ];
  const csv = template.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'service-pricing-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Face verification for fixed-employee clock-in. @vladmandic/face-api is
// dynamically imported so gig workers and every other page never pay for its
// bundle; models are fetched from /models (bundled locally, not a CDN) once
// and cached in module scope for the rest of the session.
let faceApiModelsPromise = null;
async function loadFaceApiModels() {
  if (!faceApiModelsPromise) {
    faceApiModelsPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ]);
      return faceapi;
    })();
  }
  return faceApiModelsPromise;
}

// Runs face detection on the captured selfie File, returning a 128-length
// descriptor array, or null if no face was clearly detected.
async function extractFaceDescriptor(file) {
  const faceapi = await loadFaceApiModels();
  const img = await faceapi.bufferToImage(file);
  const result = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return result ? Array.from(result.descriptor) : null;
}

export async function renderEmployeeDashboard(container) {
  showLoader(container);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const today = new Date().toLocaleDateString('en-CA');
  const clockOutSetting = await loadEmployeeClockOutTime();
  const isGigWorker = user.worker_type === 'gig';
  const clockInRequirements = isGigWorker ? null : await loadClockInRequirements();
  let attendance, attendanceHistory = [], eodHistory = [], tasks, eodReport, pendingInquiries = [], acceptedInquiries = [], notices = [], feedbackRows = [], allProfiles = [], eodExempt = false, poolJobs = [], needsPhotoClockIn = false, needsGeofenceClockIn = false;

  try {
    const res = await Promise.all([
      supabase.from('attendance').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('tickets').select('*, inquiries(*)').eq('assigned_to', user.id).order('created_at', { ascending: false }),
      supabase.from('eod_reports').select('*').eq('employee_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('inquiries').select('*').eq('assigned_employee_id', user.id).in('assignment_status', ['pending', 'accepted']).order('created_at', { ascending: false }),
      supabase.from('attendance').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('notices').select('*').eq('active', 1).order('created_at', { ascending: false }),
      supabase.from('eod_reports').select('*').eq('employee_id', user.id).order('date', { ascending: false }),
      supabase.from('inquiries').select('feedback_rating,employee_rating,feedback_employee_id,assigned_employee_id,feedback_at'),
      supabase.from('profiles').select('id,full_name,role'),
      supabase.from('profiles').select('eod_exempt,photo_clockin_exempt,geofence_clockin_exempt').eq('id', user.id).maybeSingle(),
      isGigWorker
        ? supabase.from('inquiries').select('*').eq('pool_status', 'pool').order('pool_released_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    attendance = res[0].data; tasks = res[1].data; eodReport = res[2].data;
    poolJobs = res[10]?.data || [];
    eodExempt = Boolean(res[9]?.data?.eod_exempt);
    needsPhotoClockIn = !isGigWorker && !!clockInRequirements?.photoRequired && !res[9]?.data?.photo_clockin_exempt;
    needsGeofenceClockIn = !isGigWorker && !!clockInRequirements?.geofenceRequired && !res[9]?.data?.geofence_clockin_exempt;
    feedbackRows = (res[7]?.data || []).filter(r => r.feedback_rating != null);
    allProfiles = res[8]?.data || [];
    attendanceHistory = res[4].data || [];
    notices = (res[5].data || [])
      .filter(n => !n.expires_at || new Date(n.expires_at) >= new Date())
      .slice(0, 4);
    eodHistory = res[6].data || [];
    const allInquiries = res[3].data || [];
    // Link each ticket to its inquiry (shim doesn't resolve nested joins; fall
    // back to a direct ticket_id fetch for any state) so route/accepted cards
    // show full customer details + contact buttons.
    const byTicket = new Map();
    allInquiries.forEach(i => { if (i.ticket_id) byTicket.set(String(i.ticket_id), i); });
    const missingIds = (tasks || [])
      .filter(t => !(t.inquiries && t.inquiries.length) && !byTicket.has(String(t.id)))
      .map(t => t.id).filter(Boolean);
    if (missingIds.length) {
      const { data: extra } = await supabase.from('inquiries').select('*').in('ticket_id', missingIds);
      (extra || []).forEach(i => { if (i.ticket_id) byTicket.set(String(i.ticket_id), i); });
    }
    tasks = (tasks || []).map(t => {
      if (t.inquiries && t.inquiries.length) return t;
      const linked = byTicket.get(String(t.id));
      return linked ? { ...t, inquiries: [linked] } : t;
    });
    const taskInquiryIds = new Set((tasks || []).map(task => task.inquiries?.[0]?.id).filter(Boolean));

    // Build phone → company map for labelling service jobs

    pendingInquiries = allInquiries.filter(x => x.assignment_status === 'pending').sort(byNewestCreated);
    acceptedInquiries = allInquiries
      .filter(x => x.assignment_status === 'accepted' && !taskInquiryIds.has(x.id) && !['resolved', 'closed', 'case_closed', 'paid', 'foc', 'issue_not_resolved'].includes(x.status))
      .sort(byNewestCreated)
      .map(x => ({ ...x, _company: x.company_name || null }));
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);display:inline-flex;align-items:center;gap:8px;">${ICONS.alert}<span>Error</span></h3><p>${err.message}</p></div></div>`;
    return;
  }

  const t = tasks || [];
  const _DONE_ST = new Set(['resolved', 'case_closed', 'foc', 'paid']);
  const activeTasks = t.filter(x => {
    const status = displayStatus(x.status);
    if (_DONE_ST.has(status)) return false;
    const inq = x.inquiries?.[0];
    if (!inq) return status === 'assigned' || status === 'in_progress' || status === 'open';
    return inq.assignment_status === 'accepted' && !_DONE_ST.has(displayStatus(inq.status));
  });
  const isClockedIn = !!attendance?.clock_in;
  const isClockedOut = !!attendance?.clock_out;
  const clockInClosed = isPastAutoClockOut();
  // Clock Out is always clickable once clocked in — clicking it opens the EOD
  // popup first (if not yet submitted), then clocks out.
  const canClockOut = isClockedIn && !isClockedOut;
  const missedEods = getMissedEodRows(attendanceHistory, eodHistory, today);
  const strictEodBlock = missedEods.length >= STRICT_EOD_LIMIT && !eodExempt;
  // Today's Route shows ALL in-progress / on-plate tasks (not just today's new
  // ones) so the employee always sees everything still to be done.
  const todayTasks = [
    ...activeTasks,
    ...acceptedInquiries,
  ].sort(byNewestCreated);
  const routeActiveCount = todayTasks.filter(item => displayStatus((item.inquiries?.[0] || item).status || item.status) === 'in_progress').length;
  const routePct = todayTasks.length ? Math.round((routeActiveCount / todayTasks.length) * 100) : 0;

  // Reopened tickets (customer clicked "issue not resolved") — shown separately.
  const reopenedItems = todayTasks.filter(item => Number((item.inquiries?.[0] || item)?.reopened) === 1);

  // ── Leaderboard (DESIGN third column) — monthly feedback ratings ──
  const _empMap = new Map((allProfiles || []).filter(p => p.role === 'employee').map(p => [p.id, p]));
  const _monthKey = getMonthKey();
  const _monthFb = (feedbackRows || []).filter(r => String(r.feedback_at || r.updated_at || '').startsWith(_monthKey));
  const _agg = new Map();
  _monthFb.forEach(r => {
    const empId = r.feedback_employee_id || r.assigned_employee_id;
    if (!empId || !_empMap.has(empId)) return;
    const score = Number(r.employee_rating || r.feedback_rating || 0);
    if (!score) return;
    if (!_agg.has(empId)) _agg.set(empId, { total: 0, count: 0 });
    const e = _agg.get(empId);
    e.total += score; e.count += 1;
  });
  const leaderboard = [..._agg.entries()]
    .map(([id, a]) => ({ id, name: _empMap.get(id)?.full_name || 'Employee', avg: a.total / a.count, count: a.count }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .map((e, i) => ({ ...e, rank: i + 1, you: e.id === user.id }));
  const lbTop = leaderboard.slice(0, 3);
  const myLb = leaderboard.find(e => e.you);
  if (myLb && !lbTop.some(e => e.you)) lbTop.push(myLb);
  const lbInitials = (name) => String(name).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

  container.innerHTML = `
    <!-- ── Horizontal clock row ── -->
    <div class="card emp-clock-row" style="margin-bottom:18px;">
      <div class="emp-clock-left">
        <div id="live-clock" class="clock-time">--:--:--</div>
        <div class="clock-date">${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div class="chip" style="margin-top:8px;width:fit-content;color:${isClockedIn && !isClockedOut ? 'var(--accent,var(--primary))' : 'var(--text-3,var(--text-dim))'};">
          <i style="width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block;"></i>
          ${isClockedOut ? 'Clocked out' : isClockedIn ? 'Clocked in' : 'Not started'}
        </div>
        ${isClockedIn ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;">Since ${formatTime(attendance.clock_in)}</div>` : ''}
        ${isClockedOut ? `<div class="chip" style="margin-top:8px;width:fit-content;color:var(--accent,var(--primary));">${ICONS.check}<span>${formatTime(attendance.clock_in)} → ${formatTime(attendance.clock_out)}</span></div>` : ''}
        ${attendance?.location ? `<p class="attendance-location" style="margin-top:8px;justify-content:flex-start;">${ICONS.pin}<span>${escapeHtml(attendance.location)}</span></p>` : ''}
      </div>
      <div class="emp-clock-right">
        ${(isClockedIn || isClockedOut || missedEods.length > 0) ? `
          <button class="btn btn-sm emp-eod-btn ${eodReport ? 'emp-eod-ok' : missedEods.length ? (strictEodBlock ? 'emp-eod-err' : 'emp-eod-warn') : 'emp-eod-ok'}" id="btn-eod-status">
            ${eodReport ? ICONS.check : missedEods.length ? ICONS.alert : ICONS.clipboard}
            <span>${eodReport ? 'EOD Submitted' : missedEods.length ? (strictEodBlock ? 'Restricted' : 'EOD Warning') : 'EOD Status'}</span>
          </button>
        ` : ''}
        ${isBeforeClockInWindow() && !isClockedIn ? `<p class="attendance-lock-note" style="text-align:center;justify-content:center;margin-bottom:8px;">${ICONS.clock}<span>Clock-in opens at 8:30 AM</span></p>` : ''}
        ${clockInClosed && !isClockedIn ? `<p class="attendance-lock-note" style="text-align:center;justify-content:center;margin-bottom:8px;">${ICONS.clock}<span>Closed after ${clockOutSetting.label}</span></p>` : ''}
        <button class="btn ${canClockOut ? 'btn-danger' : 'btn-primary'} emp-clock-toggle" id="btn-clock-toggle" ${isClockedOut || (!canClockOut && (strictEodBlock || clockInClosed || isBeforeClockInWindow())) ? 'disabled' : ''}>
          ${canClockOut ? ICONS.pause : ICONS.play}
          <span>${isClockedOut ? 'Session Done' : canClockOut ? 'Clock Out' : 'Clock In'}</span>
        </button>
      </div>
    </div>

    <!-- ── Notice Board ── -->
    <div class="card" style="margin-bottom:18px;">
      <div class="emp-slide-head">
        <span style="display:inline-flex;align-items:center;gap:8px;font-weight:700;">${ICONS.bell} Notice Board</span>
        ${notices.length ? `<span class="df-badge" style="background:var(--primary);margin-left:4px;">${notices.length}</span>` : ''}
      </div>
      ${notices.length === 0 ? `<p style="margin:10px 18px 14px;font-size:0.87rem;color:var(--text-dim);">No active notices right now.</p>` : `<div class="emp-notices-list">${notices.map((n, i) => `<div class="emp-notice-item" data-notice-idx="${i}" role="button" tabindex="0"><div class="emp-notice-ico">${ICONS.bell}</div><div style="flex:1;min-width:0;"><div class="emp-notice-title">${escapeHtml(n.title || 'Notice')}</div><div class="emp-notice-date">${formatDate(n.created_at)}</div></div><span style="color:var(--text-dim);flex-shrink:0;">${ICONS.arrowRight}</span></div>`).join('')}</div>`}
    </div>

    ${isGigWorker ? `
      <div class="card list-card" id="dash-public-jobs" style="margin-bottom:18px;cursor:pointer;" role="button" tabindex="0">
        <div class="card-head">
          <h3>${ICONS.inbox} Public Jobs</h3>
          <span class="chip" style="color:${poolJobs.length ? 'var(--amber, #f5a524)' : 'var(--text-dim)'};">${poolJobs.length} open</span>
        </div>
        ${poolJobs.length === 0
          ? `<p style="margin:0 18px 16px;font-size:0.87rem;color:var(--text-dim);">No jobs in the public pool right now. Tap to check anytime.</p>`
          : `<div class="list">${poolJobs.slice(0, 3).map(j => `
              <div class="lrow">
                <div class="lrow-ico" style="background:rgba(245,165,36,0.16);color:var(--amber, #f5a524);">${ICONS.inbox}</div>
                <div class="lrow-main">
                  <b>${escapeHtml(j.service_item || 'Service request')}</b>
                  <span class="lsub">${escapeHtml(j.full_name || 'Client')} · ${formatDateTime(j.pool_released_at || j.created_at)}</span>
                </div>
              </div>
            `).join('')}${poolJobs.length > 3 ? `<p style="margin:10px 18px 0;font-size:0.82rem;color:var(--text-dim);">+${poolJobs.length - 3} more — tap to view all</p>` : ''}</div>`}
      </div>
    ` : ''}

    ${pendingInquiries.length ? `
      <div class="card list-card" style="margin-bottom:18px;border-color:rgba(245,165,36,0.4);">
        <div class="card-head">
          <h3>${ICONS.alert} Requests Waiting For Accept</h3>
          <span class="chip" style="color:var(--amber, #f5a524);">${pendingInquiries.length} pending</span>
        </div>
        <div class="list">
          ${pendingInquiries.map(inq => `
            <div class="lrow">
              <div class="lrow-ico" style="background:rgba(245,165,36,0.16);color:var(--amber, #f5a524);">${ICONS.alert}</div>
              <div class="lrow-main">
                <b>${escapeHtml(inq.full_name || 'Client')}</b>
                <span class="lsub"><em class="id-mono" style="font-style:normal">${escapeHtml(inq.ticket_no || 'No ticket')}</em> · ${escapeHtml(inq.service_item || 'Service request')} · ${formatDateTime(inq.created_at)}</span>
              </div>
              <button class="btn btn-primary btn-sm accept-btn" data-id="${escapeAttr(inq.id)}" data-ticket-id="${escapeAttr(inq.ticket_id || '')}">${ICONS.check}<span>Accept</span></button>
              <button class="btn btn-secondary btn-sm decline-btn" data-id="${escapeAttr(inq.id)}">${ICONS.close}<span class="hide-sm">Decline</span></button>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Today's Route (full-width) -->
    <div class="card" style="margin-bottom:18px;overflow:hidden;">
      <div class="card-head" style="padding:16px 18px 14px;">
        <h3>${ICONS.wrench} Today's Route</h3>
        <span class="chip">${todayTasks.length} stop${todayTasks.length === 1 ? '' : 's'}</span>
      </div>
      ${todayTasks.length > 0 ? `
      <div class="route-progress-wrap">
        <div class="route-progress-label">
          <span>${routeActiveCount ? `${routeActiveCount} in progress` : 'Not started yet'}</span>
          <span>${routePct}%</span>
        </div>
        <div class="bar"><i style="width:${routePct}%;"></i></div>
      </div>` : ''}
      <div>
        ${todayTasks.length === 0
          ? `<div style="text-align:center;padding:32px 18px;color:var(--text-3,var(--text-dim));font-size:0.86rem;">No tasks assigned right now.</div>`
          : todayTasks.map((item, idx) => {
              const inq = item.inquiries?.[0] || item;
              const id = item.inquiries ? item.id : (inq.ticket_id || '');
              const st = displayStatus(inq.status || item.status || 'assigned');
              const isActive = st === 'in_progress';
              const isLast = idx === todayTasks.length - 1;
              const badgeCls = isActive ? 'progress' : st === 'assigned' ? 'assigned' : 'open';
              return `
              <div class="route-stop">
                <div class="route-track">
                  <div class="route-dot ${isActive ? 'route-dot-active' : 'route-dot-pending'}">
                    ${isActive
                      ? `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 2a6 6 0 0 1 6 6"/><path d="M8 5v3l2.5 1.5"/></svg>`
                      : `${idx + 1}`}
                  </div>
                  ${!isLast ? '<div class="route-line"></div>' : ''}
                </div>
                <div class="route-body">
                  <div class="route-name">${escapeHtml(inq.full_name || item.title || 'Service task')}</div>
                  <div class="route-sub"><em class="id-mono" style="font-style:normal">${escapeHtml(inq.ticket_no || 'No ticket')}</em> · ${escapeHtml(inq.service_item || item.description || 'Service request')}</div>
                  <div class="route-sub" style="margin-top:2px;">${formatDateTime(inq.created_at || item.created_at)}</div>
                  <div class="route-actions">
                    <span class="badge ${badgeCls}">${statusText(inq.status || item.status || 'assigned')}</span>
                    <button class="btn btn-secondary btn-sm task-btn" data-id="${escapeAttr(id)}" data-inq-id="${escapeAttr(inq.id || '')}" data-status="${escapeAttr(inq.status || item.status || 'assigned')}">${ICONS.edit}<span>Open</span></button>
                  </div>
                </div>
              </div>`;
            }).join('')}
      </div>
    </div>

    ${reopenedItems.length ? `
      <div class="card list-card" style="margin-bottom:18px;border:1px solid var(--warning);">
        <div class="card-head">
          <h3>🔁 Reopened Tickets</h3>
          <span class="chip" style="background:var(--warning);color:#fff;">${reopenedItems.length}</span>
        </div>
        <div class="list">
          ${reopenedItems.map(item => {
            const inq = item.inquiries?.[0] || item;
            const id = item.inquiries ? item.id : (inq.ticket_id || '');
            return `
            <div class="lrow">
              <div class="lrow-ico" style="color:var(--warning);">${ICONS.refresh}</div>
              <div class="lrow-main">
                <b>${escapeHtml(inq.full_name || item.title || 'Client')}</b>
                <span class="lsub"><em class="id-mono" style="font-style:normal">${escapeHtml(inq.ticket_no || 'No ticket')}</em> · ${escapeHtml(inq.service_item || 'Service')} · free rework</span>
              </div>
              <button class="btn btn-secondary btn-sm task-btn" data-id="${escapeAttr(id)}" data-inq-id="${escapeAttr(inq.id || '')}" data-status="${escapeAttr(inq.status || item.status || 'in_progress')}">${ICONS.edit}<span>Open</span></button>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : ''}

    ${acceptedInquiries.length ? `
      <div class="card list-card" style="margin-bottom:18px;">
        <div class="card-head">
          <h3>${ICONS.ticket} Accepted Requests</h3>
          <span class="chip">${acceptedInquiries.length}</span>
        </div>
        <div class="list">
          ${acceptedInquiries.map(inq => {
            const st = displayStatus(inq.status);
            const badgeCls = st === 'in_progress' ? 'progress' : st === 'resolved' ? 'resolved' : st === 'assigned' ? 'assigned' : 'open';
            return `
            <div class="lrow emp-job-card" data-status="${st}">
              <div class="lrow-ico">${ICONS.ticket}</div>
              <div class="lrow-main">
                <b>${escapeHtml(inq.full_name || 'Client')}</b>
                <span class="lsub"><em class="id-mono" style="font-style:normal">${escapeHtml(inq.ticket_no || 'No ticket')}</em> · ${escapeHtml(inq.service_item || 'Service request')} · ${formatDateTime(inq.created_at)}</span>
              </div>
              <span class="badge ${badgeCls} hide-sm">${statusText(inq.status)}</span>
              <button class="btn btn-secondary btn-sm task-btn" data-id="${inq.ticket_id || ''}" data-inq-id="${inq.id}" data-status="${inq.status}">
                ${ICONS.edit}<span>Update</span>
              </button>
              <button class="btn btn-primary btn-sm" onclick="window.open('${escapeAttr(inquiryMapLink(inq))}')">
                ${ICONS.pin}<span class="hide-sm">Map</span>
              </button>
            </div>
          `;}).join('')}
        </div>
      </div>
    ` : ''}

    <div id="devices-in-service-card" style="display:none;margin-bottom:18px;">
      <div class="card list-card">
        <div class="card-head"><h3>${ICONS.wrench} Devices in Service</h3></div>
        <div id="devices-in-service-list">
          <div style="text-align:center;padding:20px;color:var(--text-3, var(--text-dim));font-size:0.85rem;">Loading…</div>
        </div>
      </div>
    </div>

    <!-- Leave Request (hidden; opened from Attendance page) -->
    <div class="card" style="display:none">
      <div class="card-body">
        <button class="btn btn-secondary btn-wide" id="btn-open-leave-modal">
          ${ICONS.plus}<span>Submit Leave Request</span>
        </button>
      </div>
    </div>
  `;

  // Live clock
  const clockEl = container.querySelector('#live-clock');
  const tick = () => { if (clockEl) clockEl.textContent = new Date().toLocaleTimeString(); };
  tick(); setInterval(tick, 1000);

  // Company filter tabs for service jobs
  const tabBar = container.querySelector('#emp-company-tabs');
  if (tabBar) {
    tabBar.querySelectorAll('.sr-filter').forEach(btn => {
      btn.onclick = () => {
        tabBar.querySelectorAll('.sr-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const company = btn.dataset.company;
        container.querySelectorAll('.emp-job-card').forEach(card => {
          card.style.display = (company === 'all' || card.dataset.company === company) ? '' : 'none';
        });
      };
    });
  }

  const bind = (sel, cb) => {
    const el = container.querySelector(sel);
    if (el) el.onclick = cb;
  };

  // Opens the device's front camera via a native file input and resolves with
  // the captured File, or null if the user backed out without taking a photo.
  // Uses the same native-camera pattern already used for device-service photos
  // elsewhere in this file, just capture="user" (front camera) for a selfie.
  const capturePhoto = () => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'user';
    input.style.display = 'none';
    document.body.appendChild(input);
    let resolved = false;
    input.addEventListener('change', () => {
      resolved = true;
      const file = input.files && input.files[0] ? input.files[0] : null;
      document.body.removeChild(input);
      resolve(file);
    });
    window.addEventListener('focus', function onFocus() {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (!resolved && document.body.contains(input)) {
          document.body.removeChild(input);
          resolve(null);
        }
      }, 500);
    }, { once: true });
    input.click();
  });

  // Gig workers: unchanged plain clock-in, no photo/geofence requirement.
  const plainClockIn = async () => {
    const btn = container.querySelector('#btn-clock-toggle');
    btn.disabled = true; btn.innerHTML = `${ICONS.crosshair}<span>Getting location…</span>`;
    let locationStr = 'Unknown';
    let coords = { lat: null, lng: null, accuracy: null };
    try {
      const pos = await getHighAccuracyPosition();
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      coords = { lat, lng, accuracy };
      try {
        locationStr = await reverseGeocode(lat, lng) || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } catch (err) {
        locationStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    } catch (_) {}
    const { error } = await supabase.from('attendance').insert({
      user_id: user.id, clock_in: new Date().toISOString(), date: today, location: locationStr,
      latitude: coords.lat, longitude: coords.lng, status: 'present'
    });
    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`; }
    else { toast('Clocked in!', 'success'); renderEmployeeDashboard(container); }
  };

  // Fixed employees: photo/face verification and/or the geofence check via
  // the dedicated endpoint, each only when currently required for this
  // employee (needsPhotoClockIn / needsGeofenceClockIn — admin-controlled,
  // globally and per-employee). The endpoint itself independently re-checks
  // both server-side, so this only decides what UI steps to run.
  const smartClockIn = async () => {
    const btn = container.querySelector('#btn-clock-toggle');
    btn.disabled = true; btn.innerHTML = `${ICONS.crosshair}<span>Getting location…</span>`;
    let coords = null;
    try {
      const pos = await getHighAccuracyPosition();
      coords = pos.coords;
    } catch (err) {
      if (needsGeofenceClockIn) {
        toast('Could not get your location. Enable location access and try again.', 'error');
        btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
        return;
      }
      // Location isn't required right now — proceed without it.
    }

    let file = null;
    let faceDescriptor = null;
    if (needsPhotoClockIn) {
      btn.innerHTML = `${ICONS.crosshair}<span>Opening camera…</span>`;
      file = await capturePhoto();
      if (!file) {
        btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
        return;
      }

      btn.innerHTML = `${ICONS.crosshair}<span>Verifying face…</span>`;
      try {
        faceDescriptor = await extractFaceDescriptor(file);
      } catch (err) {
        toast('Could not load face verification. Check your connection and try again.', 'error');
        btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
        return;
      }
      if (!faceDescriptor) {
        toast('No face detected — retake the photo facing the camera in good light.', 'error');
        btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
        return;
      }
    }

    btn.innerHTML = `${ICONS.crosshair}<span>Clocking in…</span>`;
    const formData = new FormData();
    if (file) formData.append('photo', file);
    if (coords) {
      formData.append('lat', String(coords.latitude));
      formData.append('lng', String(coords.longitude));
      formData.append('accuracy', String(coords.accuracy || ''));
    }
    if (faceDescriptor) formData.append('faceDescriptor', JSON.stringify(faceDescriptor));

    try {
      const token = localStorage.getItem('auth_token');
      const apiBase = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
        ? '/api' : 'http://localhost:5000/api';
      const res = await fetch(`${apiBase}/attendance/clock-in-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Could not clock in', 'error');
        btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
        return;
      }
      toast('Clocked in!', 'success');
      renderEmployeeDashboard(container);
    } catch (err) {
      toast('Network error — could not clock in', 'error');
      btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
    }
  };

  // Single Clock In / Clock Out toggle
  bind('#btn-clock-toggle', async () => {
    if (canClockOut) {
      if (!eodReport) { openEodClockOutModal(); return; }
      await doClockOut();
      return;
    }
    if (strictEodBlock) {
      toast('Clock-in is restricted because you have 4 or more missed EOD reports. Contact admin.', 'error');
      return;
    }
    if (isBeforeClockInWindow()) {
      toast('Clock-in is not allowed before 8:00 AM.', 'error');
      return;
    }
    if (isPastAutoClockOut()) {
      toast(`Clock-in is closed after ${parseClockOutTime().label}. Please contact admin.`, 'error');
      return;
    }
    if (isGigWorker) {
      await plainClockIn();
    } else {
      await smartClockIn();
    }
  });

  // Clock Out — EOD report popup appears first; clock-out happens after submit.
  const doClockOut = async () => {
    const { error } = await supabase.from('attendance').update({ clock_out: new Date().toISOString() })
      .eq('user_id', user.id).eq('date', today);
    if (error) toast(error.message, 'error');
    else { toast('Clocked out!', 'success'); renderEmployeeDashboard(container); }
  };
  const openEodClockOutModal = () => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <span class="modal-title">End of Day Report</span>
          <button class="modal-close" id="eod-modal-x">✕</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-soft);font-size:0.88rem;margin:0 0 14px;">Submit your EOD report to clock out for today.</p>
          <div class="field">
            <label>Today's progress</label>
            <textarea id="eod-modal-content" rows="5" placeholder="What did you achieve today? Break it down briefly..."></textarea>
          </div>
          <button class="btn btn-primary" id="eod-modal-submit" style="width:100%;">
            <span>Submit Report &amp; Clock Out</span>${ICONS.arrowRight}
          </button>
          <p class="eod-fineprint" style="margin-top:10px;">Reports are visible to your manager immediately.</p>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#eod-modal-x').onclick = () => ov.remove();
    ov.querySelector('#eod-modal-submit').onclick = async () => {
      const content = ov.querySelector('#eod-modal-content').value.trim();
      if (!content) { toast('Please write your report', 'warning'); return; }
      const b = ov.querySelector('#eod-modal-submit');
      b.disabled = true; b.textContent = 'Submitting...';
      const { error } = await supabase.from('eod_reports').insert({ employee_id: user.id, content, date: today });
      if (error) { toast(error.message, 'error'); b.disabled = false; b.innerHTML = `<span>Submit Report &amp; Clock Out</span>${ICONS.arrowRight}`; return; }
      toast('EOD Report submitted!', 'success');
      ov.remove();
      await doClockOut();
    };
  };
  // EOD status button popup
  container.querySelector('#btn-eod-status')?.addEventListener('click', () => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    const isOk = !!eodReport;
    const isErr = !isOk && strictEodBlock && missedEods.length > 0;
    const isWarn = !isOk && !isErr && missedEods.length > 0;
    const iconColor = isOk ? 'var(--success)' : isErr ? 'var(--danger)' : 'var(--warning)';
    const title = isOk ? 'EOD Submitted' : isErr ? 'Clock-in Restricted' : 'EOD Warning';
    const icon = isOk ? ICONS.check : ICONS.alert;
    const body = isOk
      ? 'Your End of Day report for today has been submitted successfully. Great work!'
      : `You have ${missedEods.length} missed EOD report${missedEods.length === 1 ? '' : 's'}. ${isErr ? 'Clock-in is restricted until you contact admin.' : 'Please submit your EOD report before the day closes.'}`;
    ov.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <span class="modal-title" style="color:${iconColor};">${icon}<span>${title}</span></span>
          <button class="modal-close" id="eod-status-close">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin:0;font-size:0.9rem;color:var(--text-soft);line-height:1.6;">${body}</p>
          ${missedEods.length > 0 ? `<div style="margin-top:14px;padding:10px 12px;background:var(--bg-soft);border-radius:8px;font-size:0.83rem;color:var(--text-dim);">Missed dates: ${missedEods.map(d => formatDate(d)).join(', ')}</div>` : ''}
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#eod-status-close').onclick = () => ov.remove();
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  });

  // Notice modal
  container.querySelectorAll('.emp-notice-item').forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.noticeIdx, 10);
      const n = notices[idx];
      if (!n) return;
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `
        <div class="modal" style="max-width:600px;">
          <div class="modal-header">
            <span class="modal-title">${ICONS.bell}<span>${escapeHtml(n.title || 'Notice')}</span></span>
            <button class="modal-close" id="notice-close-btn">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.85rem;color:var(--text-dim);margin:0 0 16px">${formatDateTime(n.created_at)}</p>
            <div style="line-height:1.7;white-space:pre-wrap;font-size:0.95rem;">${escapeHtml(n.body || n.message || n.content || '(No details available.)')}</div>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const close = () => ov.remove();
      ov.querySelector('#notice-close-btn').onclick = close;
      ov.onclick = (e) => { if (e.target === ov) close(); };
    };
  });

  // EOD
  const eodBtn = container.querySelector('#btn-submit-eod');
  if (eodBtn) {
    bind('#btn-submit-eod', async () => {
      const content = container.querySelector('#eod-content').value.trim();
      if (!content) { toast('Please write your report', 'warning'); return; }
      const eodBtnActual = container.querySelector('#btn-submit-eod');
      eodBtnActual.disabled = true; eodBtnActual.textContent = 'Submitting...';
      const { error } = await supabase.from('eod_reports').insert({ employee_id: user.id, content, date: today });
      if (error) { toast(error.message, 'error'); eodBtnActual.disabled = false; eodBtnActual.textContent = 'Submit Report →'; }
      else { toast('EOD Report submitted!', 'success'); renderEmployeeDashboard(container); }
    });
  }

  // ── Forced clock-in popup ──────────────────────────────────────
  // Shown right after login (dashboard is the landing page) until the
  // employee clocks in. No close button — clocking in is mandatory.
  document.querySelectorAll('.clockin-gate').forEach(el => el.remove());
  // Show only inside the 8:30 AM → clock-out window. Hidden before 8:30, after
  // the employee clocks out, or once the auto clock-out cutoff passes.
  if (!isClockedIn && !isClockedOut && !clockInClosed && !strictEodBlock && !isBeforeClockInWindow()) {
    const gate = document.createElement('div');
    gate.className = 'modal-overlay clockin-gate';
    gate.innerHTML = `
      <div class="modal" style="max-width:430px;">
        <div class="modal-body" style="padding:32px;text-align:center;">
          <div style="width:68px;height:68px;border-radius:50%;background:var(--accent-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
            <span style="width:30px;height:30px;display:flex;">${ICONS.clock}</span>
          </div>
          <h3 style="margin:0 0 6px;font-family:var(--font-display);">Clock in to start your day</h3>
          <p style="color:var(--text-soft);font-size:0.9rem;margin:0 0 20px;line-height:1.5;">You must clock in before using the portal. Your location will be recorded.</p>
          <button class="btn btn-primary" id="gate-clock-in" style="width:100%;">${ICONS.play}<span>Clock In Now</span></button>
        </div>
      </div>`;
    document.body.appendChild(gate);
    gate.querySelector('#gate-clock-in').onclick = () => {
      gate.remove();
      container.querySelector('#btn-clock-toggle')?.click();
    };
  }

  // Leave Request
  bind('#btn-open-leave-modal', () => openLeaveModal(user.id, () => renderEmployeeDashboard(container)));

  // Public Jobs widget → jump to the full Public Jobs tab
  bind('#dash-public-jobs', () => { if (window.__appNav) window.__appNav('public-jobs'); });

  // Task update buttons
  container.querySelectorAll('.task-btn').forEach(btn => {
    btn.onclick = () => openTaskModalWithLoader(btn, btn.dataset.id, btn.dataset.inqId, btn.dataset.status, () => renderEmployeeDashboard(container));
  });

  // Devices in Service container (tickets sent to the service center).
  populateDevicesInService(container, user.id);

  // Accept/Decline logic
  container.querySelectorAll('.accept-btn').forEach(btn => {
    btn.onclick = async () => {
      const ops = [
        supabase.from('inquiries').update({
          assignment_status: 'accepted',
          status: 'in_progress',
        }).eq('id', btn.dataset.id)
      ];
      if (btn.dataset.ticketId) {
        ops.push(supabase.from('tickets').update({ status: 'in_progress' }).eq('id', btn.dataset.ticketId));
      }
      const results = await Promise.all(ops);
      const error = results.find(r => r.error)?.error;
      if (error) toast(error.message, 'error');
      else { toast('Task accepted!', 'success'); renderEmployeeDashboard(container); }
    };
  });

  container.querySelectorAll('.decline-btn').forEach(btn => {
    btn.onclick = () => {
      const reason = prompt('Please provide a reason for declining:');
      if (reason === null) return;
      if (!reason.trim()) { toast('Reason is required to decline', 'warning'); return; }
      
      (async () => {
        const { error } = await supabase.from('inquiries').update({ 
          assignment_status: 'declined', 
          decline_reason: reason.trim(),
          status: 'open' // Put back to open for re-assignment
        }).eq('id', btn.dataset.id);
        
        if (error) toast(error.message, 'error');
        else { toast('Task declined', 'info'); renderEmployeeDashboard(container); }
      })();
    };
  });

  // Real-time listener for new assignments + payments - fires sound + browser notification.
  const channel = supabase.channel(`employee-jobs-${user.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'inquiries',
      filter: `assigned_employee_id=eq.${user.id}`
    }, payload => {
      const row = payload.new;
      if (payload.eventType === 'INSERT' || (payload.eventType === 'UPDATE' && row?.assignment_status === 'pending')) {
        showNotification({
          title: '🔔 New Job Assigned',
          body: `${row?.full_name || 'A client'} - ${row?.service_item || 'new service'}`,
          type: 'alert',
          tag: `assign-${row?.id || ''}`,
        });
      } else if (payload.eventType === 'UPDATE' && row?.payment_status === 'paid') {
        showNotification({
          title: '💰 Payment Received',
          body: `${row?.full_name || 'Client'} paid for ticket ${row?.ticket_no || ''}`,
          type: 'payment',
          tag: `pay-${row?.id || ''}`,
        });
      }
      renderEmployeeDashboard(container);
    })
    .subscribe();

  // Cleanup
  const checkRemoval = setInterval(() => {
    if (!document.body.contains(container)) {
      supabase.removeChannel(channel);
      clearInterval(checkRemoval);
    }
  }, 5000);
}

export async function renderEmployeeAttendanceRecords(container) {
  showLoader(container);
  const { user, profile, attendance, reports } = await getEmployeeContext();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const monthKey = getMonthKey();
  const monthRows = attendance.filter(x => String(x.date || '').startsWith(monthKey));
  const presentDays = new Set(monthRows.map(x => x.date)).size;
  const completed = monthRows.filter(x => x.clock_in && x.clock_out);
  const missedEodRows = getMissedEodRows(attendance, reports);
  const strictEodBlock = missedEodRows.length >= STRICT_EOD_LIMIT && !profile?.eod_exempt;
  const totalMins = completed.reduce((sum, x) => sum + Math.max(0, new Date(x.clock_out) - new Date(x.clock_in)) / 60000, 0);
  const totalHours = `${Math.floor(totalMins / 60)}h ${Math.round(totalMins % 60)}m`;

  container.innerHTML = `
    <div class="page-header">
      <h1>Attendance Records</h1>
      <p>Your check-ins, locations, and monthly attendance count</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${presentDays}</div><div class="stat-label">Days Present This Month</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${monthRows.filter(x => x.clock_in && !x.clock_out && !isForgottenClockOut(x)).length}</div><div class="stat-label">Active Sessions</div></div>
      <div class="stat-card"><div class="stat-value" style="color:${missedEodRows.length ? 'var(--danger)' : 'var(--success)'}">${missedEodRows.length}</div><div class="stat-label">${strictEodBlock ? 'Strict Warning' : 'Missed EOD'}</div></div>
      <div class="stat-card"><div class="stat-value" style="font-size:1.7rem;color:var(--warning)">${totalHours}</div><div class="stat-label">Logged Hours This Month</div></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Location</th></tr></thead>
          <tbody>
            ${attendance.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-dim)">No attendance records yet</td></tr>' :
              attendance.map(x => `<tr>
                <td>${formatDate(x.date)}</td>
                <td><span class="badge badge-open">${formatTime(x.clock_in)}</span></td>
                <td>${x.clock_out
                  ? `<span class="badge badge-resolved">${formatTime(x.clock_out)}</span>`
                  : isForgottenClockOut(x)
                    ? '<span class="badge badge-open">Auto clock-out pending</span>'
                    : '<span class="badge badge-open">Active</span>'}</td>
                <td>${hoursWorked(x.clock_in, x.clock_out) || '-'}</td>
                <td><small>${x.location || '-'}</small></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function renderEmployeeLeaveRequests(container) {
  showLoader(container);
  const { user, leaves } = await getEmployeeContext();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const pending = leaves.filter(x => x.status === 'pending').length;
  const approved = leaves.filter(x => x.status === 'approved').reduce((sum, x) => sum + daysBetweenInclusive(x.start_date, x.end_date), 0);

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Leave Requests</h1>
        <p>Submit leave and track approval from admin</p>
      </div>
      <button class="btn btn-primary" id="leave-new">${ICONS.plus}<span>New Request</span></button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">Pending Requests</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${approved}</div><div class="stat-label">Approved Leave Days</div></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            ${leaves.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-dim)">No leave requests yet</td></tr>' :
              leaves.map(x => `<tr>
                <td><small>${formatDate(x.start_date)} to ${formatDate(x.end_date)}</small></td>
                <td>${daysBetweenInclusive(x.start_date, x.end_date)}</td>
                <td style="max-width:360px;white-space:normal">${x.reason}</td>
                <td><span class="badge badge-${x.status}">${x.status}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#leave-new').onclick = () => openLeaveModal(user.id, () => renderEmployeeLeaveRequests(container));
}

export async function renderEmployeeEODReports(container) {
  showLoader(container);
  const { user, reports } = await getEmployeeContext();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }
  const today = new Date().toLocaleDateString('en-CA');
  const todayReport = reports.find(x => x.date === today);

  container.innerHTML = `
    <div class="page-header">
      <h1>EOD Reports</h1>
      <p>View every daily summary you have submitted</p>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title sr-icon-title">${ICONS.clipboard}<span>Today's Summary</span></span></div>
      <div class="card-body">
        ${todayReport ? `
          <div class="eod-done">
            <div class="eod-done-ring">${ICONS.check}</div>
            <h3 class="eod-done-title">Submitted today</h3>
            <p class="eod-done-sub">${todayReport.content}</p>
          </div>
        ` : `
          <div class="form-group">
            <label class="sr-icon-label">${ICONS.edit}<span>Today's progress</span></label>
            <textarea id="employee-eod-content" rows="5" placeholder="What did you complete today?"></textarea>
          </div>
          <button class="btn btn-primary btn-wide" id="employee-eod-submit">Submit Daily Report</button>
        `}
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Submitted</th><th>Summary</th></tr></thead>
          <tbody>
            ${reports.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-dim)">No reports yet</td></tr>' :
              reports.map(x => `<tr>
                <td>${formatDate(x.date)}</td>
                <td>${formatTime(x.created_at)}</td>
                <td style="max-width:560px;white-space:normal;line-height:1.5">${x.content}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const btn = container.querySelector('#employee-eod-submit');
  if (btn) {
    btn.onclick = async () => {
      const content = container.querySelector('#employee-eod-content').value.trim();
      if (!content) { toast('Please write your report', 'warning'); return; }
      btn.disabled = true; btn.textContent = 'Submitting...';
      const { error } = await supabase.from('eod_reports').insert({ employee_id: user.id, content, date: today });
      if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = 'Submit Daily Report'; }
      else { toast('EOD Report submitted!', 'success'); renderEmployeeEODReports(container); }
    };
  }
}

// ── EMPLOYEE: MY CASH ────────────────────────────────────
// Lists every cash payment this technician has collected. Pending balance
// = cash that hasn't yet been submitted to admin. Once admin records the
// submission in their Cash Collections tab, the row moves to "Submitted"
// and the pending total drops.
export async function renderEmployeeCash(container) {
  showLoader(container);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const { data: rows } = await supabase.from('inquiries')
    .select('*')
    .eq('assigned_employee_id', user.id)
    .eq('payment_method', 'cash')
    .eq('payment_status', 'paid')
    .order('cash_collected_at', { ascending: false });

  const list = (Array.isArray(rows) ? rows : []).filter(x => x.cash_collected_at);
  const pending = list.filter(x => !x.cash_submitted_at);
  const submitted = list.filter(x => x.cash_submitted_at);

  const totalPending = pending.reduce((acc, x) => acc + (Number(x.bill_total) || 0), 0);
  const totalSubmitted = submitted.reduce((acc, x) => acc + (Number(x.bill_total) || 0), 0);
  const totalEver = totalPending + totalSubmitted;

  const dateOf = (d) => {
    if (!d) return '-';
    try {
      const dt = new Date(String(d).replace(' ', 'T'));
      return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return d; }
  };

  const rowHtml = (items) => items.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No cash collections yet</td></tr>'
    : items.map(x => `
      <tr>
        <td><small style="color:var(--text-dim)">${dateOf(x.cash_collected_at)}</small></td>
        <td><code style="font-size:0.75rem;">${x.ticket_no || (x.id || '').slice(0,8)}</code></td>
        <td><b>${x.full_name || '-'}</b><br/><small style="color:var(--text-dim)">${x.phone || ''}</small></td>
        <td><small>${x.service_item || '-'}</small></td>
        <td><b>₹${Math.round(Number(x.bill_total) || 0).toLocaleString('en-IN')}</b></td>
        <td>${x.cash_submitted_at
          ? `<span class="badge badge-resolved">Submitted</span><br/><small style="color:var(--text-dim)">${dateOf(x.cash_submitted_at)}</small>`
          : '<span class="badge badge-medium">Pending</span>'}</td>
      </tr>`).join('');

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>My Cash</h1>
        <p>Cash you've collected from clients. Hand it to admin to clear the pending balance.</p>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning); font-size:1.9rem;">₹${Math.round(totalPending).toLocaleString('en-IN')}</div>
        <div class="stat-label">Pending Submission</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success); font-size:1.9rem;">₹${Math.round(totalSubmitted).toLocaleString('en-IN')}</div>
        <div class="stat-label">Already Submitted</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${list.length}</div>
        <div class="stat-label">Total Cash Jobs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size:1.7rem;">₹${Math.round(totalEver).toLocaleString('en-IN')}</div>
        <div class="stat-label">Total Collected (All Time)</div>
      </div>
    </div>

    ${totalPending > 0 ? `
      <div style="padding:14px 16px; border-radius:14px; background:rgba(245,158,11,0.08); border:1px dashed var(--warning); margin-bottom:18px; font-size:0.88rem; color:var(--text);">
        You have <b>₹${Math.round(totalPending).toLocaleString('en-IN')}</b> in cash to hand over to admin. Once admin records the submission in their Cash Collections tab, these entries will move to <b>Submitted</b>.
      </div>` : ''}

    <div class="df-wrap" style="margin-bottom:16px;">
      <button class="btn btn-secondary df-toggle" id="cash-filter-btn">${ICONS.filter}<span>Filters</span></button>
      <div class="df-panel" id="cash-panel" style="display:none">
        <div class="df-field">
          <span class="df-label">Status</span>
          <select id="cash-status-sel">
            <option value="pending">Pending (${pending.length})</option>
            <option value="submitted">Submitted (${submitted.length})</option>
            <option value="all">All (${list.length})</option>
          </select>
        </div>
        <div class="df-footer"><button class="btn btn-ghost btn-sm" id="cash-clear">Clear</button><button class="btn btn-primary btn-sm" id="cash-ok">Apply</button></div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Service</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>${rowHtml(pending)}</tbody>
        </table>
      </div>
    </div>
  `;

  const cashTabs = { pending, submitted, all: list };
  const cashPanel = container.querySelector('#cash-panel');
  const cashBtn = container.querySelector('#cash-filter-btn');
  const cashOutside = (e) => {
    if (!cashBtn.closest('.df-wrap').contains(e.target)) {
      cashPanel.style.display = 'none';
      cashBtn.classList.remove('df-open');
      document.removeEventListener('click', cashOutside);
    }
  };
  const cashClose = () => { cashPanel.style.display = 'none'; cashBtn.classList.remove('df-open'); document.removeEventListener('click', cashOutside); };
  cashBtn.onclick = (e) => {
    e.stopPropagation();
    if (cashPanel.style.display === 'none') {
      cashPanel.style.display = '';
      cashBtn.classList.add('df-open');
      setTimeout(() => document.addEventListener('click', cashOutside), 0);
    } else { cashClose(); }
  };
  container.querySelector('#cash-ok').onclick = () => {
    const items = cashTabs[container.querySelector('#cash-status-sel').value] || list;
    container.querySelector('tbody').innerHTML = rowHtml(items);
    cashClose();
  };
  container.querySelector('#cash-clear').onclick = () => {
    container.querySelector('#cash-status-sel').value = 'pending';
    container.querySelector('tbody').innerHTML = rowHtml(pending);
    cashClose();
  };
}

export async function renderEmployeeSalary(container) {
  showLoader(container);
  const { user, profile, attendance, leaves } = await getEmployeeContext();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const monthKey = getMonthKey();
  const monthRows = attendance.filter(x => String(x.date || '').startsWith(monthKey));
  const presentDays = new Set(monthRows.map(x => x.date)).size;
  const approvedLeaveDays = leaves
    .filter(x => x.status === 'approved' && String(x.start_date || '').startsWith(monthKey))
    .reduce((sum, x) => sum + daysBetweenInclusive(x.start_date, x.end_date), 0);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthlySalary = Number(profile?.salary) || 0;
  const perDay = monthlySalary / daysInMonth;
  const payableDays = presentDays + approvedLeaveDays;
  const estimated = perDay * payableDays;

  container.innerHTML = `
    <div class="page-header">
      <h1>Salary</h1>
      <p>Month-to-date salary estimate based on attendance and approved leave</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value" style="font-size:1.8rem">${money(monthlySalary)}</div><div class="stat-label">Monthly Salary</div></div>
      <div class="stat-card"><div class="stat-value">${presentDays}</div><div class="stat-label">Days Present</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${approvedLeaveDays}</div><div class="stat-label">Approved Leave Days</div></div>
      <div class="stat-card"><div class="stat-value" style="font-size:1.8rem;color:var(--warning)">${money(estimated)}</div><div class="stat-label">Estimated Earned</div></div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="salary-breakdown">
          <div><span>Payable days</span><b>${payableDays} / ${daysInMonth}</b></div>
          <div><span>Per day value</span><b>${money(perDay)}</b></div>
          <div><span>Formula</span><b>Present + approved leave</b></div>
        </div>
      </div>
    </div>
  `;
}

// ── EMPLOYEE: MY TASKS (dedicated page) ──────────────────
export async function renderEmployeeLeaderboard(container) {
  showLoader(container);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const monthKey = getMonthKey();
  const token = localStorage.getItem('auth_token');
  const lbData = await fetch(`/api/leaderboard?month=${monthKey}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  if (!lbData) {
    container.innerHTML = '<div class="card" style="padding:32px;text-align:center;color:var(--text-dim)">Could not load leaderboard. Please try again.</div>';
    return;
  }

  const monthly = lbData.monthly || [];
  const allTime = lbData.allTime || [];
  const myMonthly = monthly.find(x => x.id === user.id);
  const myAllTime = allTime.find(x => x.id === user.id);
  const myRank = monthly.findIndex(x => x.id === user.id) + 1;
  const myAllTimeRank = allTime.findIndex(x => x.id === user.id) + 1;

  // Podium: arrange as 2nd | 1st | 3rd
  const MEDAL = ['🥇', '🥈', '🥉'];
  const PODIUM_H = ['120px', '88px', '64px']; // bar heights: 1st tallest, 2nd medium, 3rd shortest
  const PODIUM_ORDER = [1, 0, 2];             // display order: 2nd, 1st, 3rd
  const initials = (name) => String(name).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

  // Always show 3 slots — pad with placeholder if fewer than 3 employees exist.
  const podiumSlots = PODIUM_ORDER.map(i => monthly[i] || { id: null, name: '—', count: 0, avg: 0, fiveStars: 0, _empty: true });

  const renderPodiumSlot = (e, rank) => {
    const isYou = e.id === user.id;
    return `
      <div class="lb-podium-slot lb-podium-slot-${rank}">
        <div class="lb-podium-medal">${MEDAL[rank]}</div>
        <div class="lb-podium-avatar ${e._empty ? 'lb-podium-empty-av' : ''} ${isYou ? 'lb-podium-you' : ''}">
          ${e._empty ? '?' : initials(e.name)}
        </div>
        <div class="lb-podium-name">${e._empty ? '<span style="color:var(--text-dim)">Available</span>' : escapeHtml(e.name) + (isYou ? ' <span class="lb-you-tag">You</span>' : '')}</div>
        <div class="lb-podium-reviews">${e._empty ? '<span style="color:var(--text-dim);font-size:0.75rem;">No one yet</span>' : `<b>${e.count}</b> review${e.count !== 1 ? 's' : ''}`}</div>
        <div class="lb-podium-stars">${e._empty || e.count === 0 ? '<span style="color:var(--text-dim);font-size:0.75rem;">No reviews yet</span>' : `${starsHtml(e.avg)} <span>${e.avg.toFixed(1)}</span>`}</div>
        <div class="lb-podium-bar" style="height:${PODIUM_H[rank]};${e._empty ? 'opacity:0.3;' : ''}"></div>
      </div>`;
  };

  const podiumHtml = `<div class="lb-podium">
    ${podiumSlots.map((e, slot) => renderPodiumSlot(e, PODIUM_ORDER[slot])).join('')}
  </div>`;

  container.innerHTML = `
    <div class="page-header">
      <h1>Leaderboard</h1>
      <p>Ranked by most reviews received this month.</p>
    </div>

    <!-- Podium -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header"><span class="card-title">🏆 Top 3 — Most Reviews</span></div>
      <div style="padding:24px 16px 8px;">
        ${podiumHtml}
      </div>
    </div>

    <!-- Monthly Rank Card -->
    <div class="lb-my-rank-card" style="margin-bottom:14px;">
      <div class="lb-my-rank-left">
        <div class="lb-my-rank-avatar">${initials(myMonthly?.name || 'Me')}</div>
        <div>
          <div class="lb-my-rank-name">${escapeHtml(myMonthly?.name || 'You')}</div>
          <div class="lb-my-rank-sub">Your position this month</div>
        </div>
      </div>
      <div class="lb-my-rank-stats">
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">#${myRank || '—'}</div>
          <div class="lb-my-stat-label">Rank</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${myMonthly?.count ?? 0}</div>
          <div class="lb-my-stat-label">Reviews</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${myMonthly && myMonthly.count > 0 ? myMonthly.avg.toFixed(1) : '—'}</div>
          <div class="lb-my-stat-label">Avg Rating</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${myMonthly?.fiveStars ?? 0}</div>
          <div class="lb-my-stat-label">5-Stars</div>
        </div>
      </div>
    </div>

    <!-- All-Time Rank Card -->
    <div class="lb-my-rank-card" style="margin-bottom:14px;">
      <div class="lb-my-rank-left">
        <div class="lb-my-rank-avatar">${initials(myAllTime?.name || 'Me')}</div>
        <div>
          <div class="lb-my-rank-name">${escapeHtml(myAllTime?.name || 'You')}</div>
          <div class="lb-my-rank-sub">Your all-time position</div>
        </div>
      </div>
      <div class="lb-my-rank-stats">
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">#${myAllTimeRank || '—'}</div>
          <div class="lb-my-stat-label">Rank</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${myAllTime?.count ?? 0}</div>
          <div class="lb-my-stat-label">Reviews</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${myAllTime && myAllTime.count > 0 ? myAllTime.avg.toFixed(1) : '—'}</div>
          <div class="lb-my-stat-label">Avg Rating</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${myAllTime?.fiveStars ?? 0}</div>
          <div class="lb-my-stat-label">5-Stars</div>
        </div>
      </div>
    </div>
  `;
}

export async function renderEmployeeEstimatorTab(container) {
  showLoader(container);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  try {
    const [{ data: pricing }, { data: discountPresets }, { data: companies }] = await Promise.all([
      supabase.from('service_pricing').select('*').order('category'),
      supabase.from('discount_presets').select('*').eq('active', 1).order('created_at', { ascending: false }),
      supabase.from('companies').select('*').order('name'),
    ]);

    const tree = {};
    (pricing || []).forEach(p => {
      const main = p.category || 'Uncategorized';
      const sub = (p.sub_category && p.sub_category.trim()) || '';
      const leaf = p.sub_sub_category || p.name || '';
      if (!leaf) return;
      tree[main] ??= {};
      tree[main][sub] ??= [];
      tree[main][sub].push({ id: p.id, leaf, cost: Number(p.cost) || 0 });
    });
    const mainOptions = Object.keys(tree).sort();
    const companyList = Array.isArray(companies) ? companies : [];
    const discountPresetList = Array.isArray(discountPresets) ? discountPresets : [];

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>Estimator</h1>
          <p>Prepare a complete service cost estimate and send it to the client on WhatsApp.</p>
        </div>
        <button class="btn btn-secondary" id="est-reset">${ICONS.refresh}<span>Reset</span></button>
      </div>

      <div class="estimator-layout">
        <div class="card estimator-form-card">
          <div class="card-header"><span class="card-title sr-icon-title">${ICONS.user}<span>Client Details</span></span></div>
          <div class="card-body">
            <div class="estimator-grid">
              <div class="form-group"><label>Client Name</label><input id="est-client-name" type="text" placeholder="Client name"></div>
              <div class="form-group"><label>WhatsApp Number</label><input id="est-client-phone" type="tel" placeholder="10 digit mobile number"></div>
              <div class="form-group"><label>Service / Project</label><input id="est-service-title" type="text" placeholder="e.g. CCTV service visit"></div>
              <div class="form-group"><label>Location</label><input id="est-location" type="text" placeholder="Client location"></div>
              <div class="form-group">
                <label>Company</label>
                <select id="est-company">
                  <option value="Networking Experts">Networking Experts</option>
                  ${companyList.map(c => `<option value="${escapeAttr(c.name || '')}">${escapeHtml(c.name || '')}</option>`).join('')}
                  <option value="Other">Other</option>
                </select>
              </div>
              <div class="form-group"><label>Custom Company</label><input id="est-company-custom" type="text" placeholder="Company name" disabled></div>
            </div>
          </div>
        </div>

        <div class="card estimator-form-card">
          <div class="card-header"><span class="card-title sr-icon-title">${ICONS.wrench}<span>Services</span></span></div>
          <div class="card-body">
            ${mainOptions.length === 0 ? `
              <div style="padding:14px;border-radius:12px;background:var(--bg-soft);color:var(--text-dim);font-size:0.9rem;">No service pricing is available yet.</div>
            ` : `
              <div class="form-group" style="position:relative;margin-bottom:12px;">
                <div class="search-input-wrap">
                  <span>${ICONS.search}</span>
                  <input class="search-input" id="est-svc-search" placeholder="Search service by name…" autocomplete="off">
                </div>
                <div id="est-svc-results" style="display:none;position:absolute;left:0;right:0;z-index:300;background:var(--bg);border:1px solid var(--border);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.14);margin-top:4px;max-height:240px;overflow-y:auto;"></div>
              </div>
              <div class="svc-picker-wrap">
                <select id="est-svc-main" class="svc-picker">
                  <option value="">Select Main Category...</option>
                  ${mainOptions.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('')}
                </select>
                <select id="est-svc-sub" class="svc-picker" disabled><option value="">Select Sub Category...</option></select>
                <select id="est-svc-leaf" class="svc-picker" disabled><option value="">Select Specific Issue...</option></select>
                <div class="svc-picker-actions">
                  <div class="svc-preview-text" id="est-svc-preview">Pick an issue to see the price.</div>
                  <button type="button" class="btn btn-primary btn-sm" id="est-svc-add" disabled>${ICONS.plus}<span>Add</span></button>
                </div>
              </div>
              <div id="est-selected-services" class="est-selected-services"></div>
            `}
          </div>
        </div>

        <div class="card estimator-form-card">
          <div class="card-header"><span class="card-title sr-icon-title">${ICONS.receipt}<span>Fees & Discount</span></span></div>
          <div class="card-body">
            <div class="estimator-grid">
              <div class="form-group"><label>Extra Charge</label><input id="est-extra" type="number" min="0" step="1" placeholder="0"></div>
              <div class="form-group"><label>Extra Reason</label><input id="est-extra-reason" type="text" placeholder="Material, labour, etc."></div>
              <div class="form-group"><label>Platform Fee</label><input id="est-platform" type="number" min="0" step="1" value="50"></div>
              <div class="form-group"><label>Travel Distance (km)</label><input id="est-km" type="number" min="0" step="0.1" placeholder="0"></div>
              <div class="form-group"><label>Travel Rate / km</label><input id="est-km-rate" type="number" min="0" step="1" value="5"></div>
              <div class="form-group"><label>GST %</label><input id="est-gst-rate" type="number" min="0" step="0.1" value="18"></div>
            </div>
            <div class="form-group">
              <label>Admin Discount</label>
              <select id="est-discount-preset">
                <option value="">No admin discount</option>
                ${discountPresetList.map(d => `<option value="${escapeAttr(d.id)}" data-amount="${Number(d.amount) || 0}" data-name="${escapeAttr(d.name || 'Discount')}">${escapeHtml(d.name || 'Discount')} - ${money(d.amount)}</option>`).join('')}
              </select>
            </div>
            <div class="estimator-grid">
              <div class="form-group"><label>Manual Discount</label><input id="est-manual-discount" type="number" min="0" step="1" placeholder="0"></div>
              <div class="form-group"><label>Discount Reason</label><input id="est-discount-reason" type="text" placeholder="Required for manual discount"></div>
            </div>
          </div>
        </div>

        <div class="card estimator-preview-card">
          <div class="card-header">
            <span class="card-title sr-icon-title">${ICONS.receipt}<span>Estimate Preview</span></span>
          </div>
          <div class="card-body">
            <div class="estimate-slip" id="estimate-slip"></div>
            <div class="estimator-actions">
              <button class="btn btn-secondary" id="est-copy">${ICONS.clipboard}<span>Copy Text</span></button>
              <button class="btn btn-primary" id="est-whatsapp">${ICONS.whatsapp}<span>Send WhatsApp</span></button>
            </div>
          </div>
        </div>
      </div>
    `;

    const selectedServices = [];
    const get = (id) => container.querySelector(id);
    const inr = money;
    const selectedBox = get('#est-selected-services');
    const slip = get('#estimate-slip');
    const mainSel = get('#est-svc-main');
    const subSel = get('#est-svc-sub');
    const leafSel = get('#est-svc-leaf');
    const preview = get('#est-svc-preview');
    const addBtn = get('#est-svc-add');
    const companySel = get('#est-company');
    const companyCustom = get('#est-company-custom');

    const getCompanyName = () => companySel.value === 'Other'
      ? companyCustom.value.trim()
      : companySel.value.trim();

    // ── Service search ──
    const svcSearchInput = get('#est-svc-search');
    const svcResultsBox = get('#est-svc-results');
    if (svcSearchInput) {
      // Flatten the pricing tree into a searchable list once
      const allServices = (pricing || []).map(p => ({
        id: p.id,
        leaf: p.sub_sub_category || p.name || '',
        sub: (p.sub_category && p.sub_category.trim()) || '',
        main: p.category || '',
        cost: Number(p.cost) || 0,
      })).filter(s => s.leaf);

      const hideSvcResults = () => { svcResultsBox.style.display = 'none'; svcResultsBox.innerHTML = ''; };
      svcSearchInput.oninput = () => {
        const q = svcSearchInput.value.trim().toLowerCase();
        if (q.length < 1) { hideSvcResults(); return; }
        const matches = allServices.filter(s =>
          s.leaf.toLowerCase().includes(q) ||
          s.sub.toLowerCase().includes(q) ||
          s.main.toLowerCase().includes(q)
        ).slice(0, 10);
        if (!matches.length) {
          svcResultsBox.innerHTML = '<div style="padding:12px 16px;color:var(--text-dim);font-size:0.87rem;">No services found</div>';
          svcResultsBox.style.display = 'block';
          return;
        }
        svcResultsBox.innerHTML = matches.map((s, i) => `
          <div class="est-svc-result" data-idx="${i}" style="padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;transition:background .12s;">
            <div style="min-width:0;">
              <div style="font-weight:700;font-size:0.88rem;">${escapeHtml(s.leaf)}</div>
              <div style="font-size:0.75rem;color:var(--text-dim);">${escapeHtml([s.main, s.sub].filter(Boolean).join(' › '))}</div>
            </div>
            <span style="font-weight:700;color:var(--primary);white-space:nowrap;font-size:0.88rem;">₹${s.cost.toLocaleString('en-IN')}</span>
          </div>`).join('');
        svcResultsBox.style.display = 'block';
        svcResultsBox.querySelectorAll('.est-svc-result').forEach((el, i) => {
          el.onmouseenter = () => { el.style.background = 'var(--bg-soft)'; };
          el.onmouseleave = () => { el.style.background = ''; };
          el.onclick = () => {
            const s = matches[i];
            selectedServices.push({ ...s });
            svcSearchInput.value = '';
            hideSvcResults();
            renderSelected();
            renderSlip();
          };
        });
      };
      container.addEventListener('click', (e) => {
        if (!e.target.closest('#est-svc-search') && !e.target.closest('#est-svc-results')) hideSvcResults();
      });
    }

    const calc = () => {
      const servicesSubtotal = selectedServices.reduce((sum, item) => sum + Number(item.cost || 0), 0);
      const extra = Math.max(0, Number(get('#est-extra').value) || 0);
      const platform = Math.max(0, Number(get('#est-platform').value) || 0);
      const km = Math.max(0, Number(get('#est-km').value) || 0);
      const kmRate = Math.max(0, Number(get('#est-km-rate').value) || 0);
      const transport = Math.round(km * kmRate);
      const presetOption = get('#est-discount-preset')?.selectedOptions?.[0];
      const presetDiscount = get('#est-discount-preset').value ? Number(presetOption?.dataset.amount || 0) : 0;
      const manualDiscount = Math.max(0, Number(get('#est-manual-discount').value) || 0);
      const preDiscount = servicesSubtotal + extra + platform + transport;
      const discount = Math.min(preDiscount, presetDiscount + manualDiscount);
      const gstRate = Math.max(0, Number(get('#est-gst-rate').value) || 0);
      const taxable = Math.max(0, preDiscount - discount);
      const gst = Math.round(taxable * gstRate / 100);
      const total = taxable + gst;
      const discountLabels = [];
      if (presetDiscount) discountLabels.push(presetOption?.dataset.name || 'Admin discount');
      if (manualDiscount) discountLabels.push('Manual discount');
      return {
        servicesSubtotal, extra, platform, km, kmRate, transport, presetDiscount,
        manualDiscount, discount, discountLabel: discountLabels.join(' + '),
        taxable, gstRate, gst, total,
      };
    };

    const renderSelected = () => {
      if (!selectedServices.length) {
        selectedBox.innerHTML = '<div class="est-empty">No services added yet</div>';
        return;
      }
      selectedBox.innerHTML = selectedServices.map((s, i) => `
        <div class="est-selected-row">
          <div><b>${escapeHtml(s.leaf)}</b><small>${escapeHtml([s.main, s.sub].filter(Boolean).join(' > '))}</small></div>
          <span>${inr(s.cost)}</span>
          <button type="button" class="btn btn-secondary btn-sm est-remove" data-idx="${i}" title="Remove">${ICONS.close}</button>
        </div>
      `).join('');
      selectedBox.querySelectorAll('.est-remove').forEach(btn => {
        btn.onclick = () => {
          selectedServices.splice(Number(btn.dataset.idx), 1);
          renderSelected();
          renderSlip();
        };
      });
    };

    const buildMessage = () => {
      const b = calc();
      const name = get('#est-client-name').value.trim() || 'Client';
      const serviceTitle = get('#est-service-title').value.trim() || 'Service estimate';
      const location = get('#est-location').value.trim();
      const lines = [
        `Hi ${name},`,
        `Here is your estimated cost from ${BUSINESS.name}.`,
        '',
        `Service: ${serviceTitle}`,
      ];
      if (location) lines.push(`Location: ${location}`);
      if (getCompanyName()) lines.push(`Company: ${getCompanyName()}`);
      lines.push('', 'Items:');
      if (selectedServices.length) {
        selectedServices.forEach((s, i) => lines.push(`${i + 1}. ${s.leaf} - ${inr(s.cost)}`));
      } else {
        lines.push('No itemised service selected');
      }
      if (b.extra > 0) lines.push(`Extra charge${get('#est-extra-reason').value.trim() ? ` (${get('#est-extra-reason').value.trim()})` : ''}: ${inr(b.extra)}`);
      lines.push('', `Services subtotal: ${inr(b.servicesSubtotal)}`);
      lines.push(`Platform fee: ${inr(b.platform)}`);
      lines.push(`Travel: ${b.km} km x ${inr(b.kmRate)} = ${inr(b.transport)}`);
      if (b.discount > 0) lines.push(`Discount${b.discountLabel ? ` (${b.discountLabel})` : ''}: -${inr(b.discount)}`);
      lines.push(`Taxable amount: ${inr(b.taxable)}`);
      lines.push(`GST (${b.gstRate}%): ${inr(b.gst)}`);
      lines.push(`Estimated total: ${inr(b.total)}`);
      lines.push('', 'Final bill may change if extra work or material is required.');
      lines.push(`- ${BUSINESS.name}`);
      return lines.join('\n');
    };

    const renderSlip = () => {
      const b = calc();
      const name = get('#est-client-name').value.trim() || 'Client';
      const serviceTitle = get('#est-service-title').value.trim() || 'Service estimate';
      slip.innerHTML = `
        <div class="estimate-slip-head">
          <div>
            <b>${BUSINESS.name}</b>
            <small>Cost Estimate</small>
          </div>
          <span>${new Date().toLocaleDateString('en-IN')}</span>
        </div>
        <div class="estimate-client">
          <b>${escapeHtml(name)}</b>
          <small>${escapeHtml(serviceTitle)}${get('#est-location').value.trim() ? ` - ${escapeHtml(get('#est-location').value.trim())}` : ''}</small>
        </div>
        <div class="estimate-items">
          ${selectedServices.length ? selectedServices.map(s => `<div><span>${escapeHtml(s.leaf)}</span><b>${inr(s.cost)}</b></div>`).join('') : '<div><span>No service selected</span><b>Rs.0</b></div>'}
          ${b.extra > 0 ? `<div><span>Extra charge</span><b>${inr(b.extra)}</b></div>` : ''}
        </div>
        <div class="bill-breakdown estimate-breakdown">
          <div class="bill-row"><span>Services subtotal</span><b>${inr(b.servicesSubtotal)}</b></div>
          <div class="bill-row"><span>Platform fee</span><b>${inr(b.platform)}</b></div>
          <div class="bill-row"><span>Travel (${b.km} km x ${inr(b.kmRate)})</span><b>${inr(b.transport)}</b></div>
          ${b.discount > 0 ? `<div class="bill-row bill-row-discount"><span>${escapeHtml(b.discountLabel || 'Discount')}</span><b>-${inr(b.discount)}</b></div>` : ''}
          <div class="bill-row"><span>Taxable amount</span><b>${inr(b.taxable)}</b></div>
          <div class="bill-row"><span>GST (${b.gstRate}%)</span><b>${inr(b.gst)}</b></div>
          <div class="bill-row bill-row-total"><span>Estimated total</span><b>${inr(b.total)}</b></div>
        </div>
        <div class="estimate-note">Final bill may change if extra work or material is required.</div>
      `;
    };

    const fillSubs = () => {
      const main = mainSel.value;
      subSel.innerHTML = '<option value="">Select Sub Category...</option>';
      leafSel.innerHTML = '<option value="">Select Specific Issue...</option>';
      leafSel.disabled = true;
      preview.textContent = 'Pick an issue to see the price.';
      addBtn.disabled = true;
      if (!main || !tree[main]) { subSel.disabled = true; return; }
      const subs = Object.keys(tree[main]).sort();
      subs.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub;
        opt.textContent = sub || '- (no sub-group)';
        subSel.appendChild(opt);
      });
      subSel.disabled = false;
      if (subs.length === 1) { subSel.value = subs[0]; fillLeaves(); }
    };

    const fillLeaves = () => {
      const main = mainSel.value;
      const sub = subSel.value;
      leafSel.innerHTML = '<option value="">Select Specific Issue...</option>';
      preview.textContent = 'Pick an issue to see the price.';
      addBtn.disabled = true;
      if (!main || !tree[main]?.[sub]) { leafSel.disabled = true; return; }
      tree[main][sub].forEach((leaf, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${leaf.leaf} (${money(leaf.cost)})`;
        leafSel.appendChild(opt);
      });
      leafSel.disabled = false;
    };

    const onLeafChange = () => {
      const leaf = tree[mainSel.value]?.[subSel.value]?.[Number(leafSel.value)];
      if (!leaf) {
        preview.textContent = 'Pick an issue to see the price.';
        addBtn.disabled = true;
        return;
      }
      preview.innerHTML = `Price: <b style="color:var(--primary)">${money(leaf.cost)}</b>`;
      addBtn.disabled = false;
    };

    if (mainSel) {
      mainSel.onchange = fillSubs;
      subSel.onchange = fillLeaves;
      leafSel.onchange = onLeafChange;
      addBtn.onclick = () => {
        const leaf = tree[mainSel.value]?.[subSel.value]?.[Number(leafSel.value)];
        if (!leaf) return;
        selectedServices.push({ ...leaf, main: mainSel.value, sub: subSel.value });
        renderSelected();
        renderSlip();
      };
    }

    companySel.onchange = () => {
      const isOther = companySel.value === 'Other';
      companyCustom.disabled = !isOther;
      if (!isOther) companyCustom.value = '';
      const normalized = getCompanyName().toLowerCase().replace(/\s+/g, ' ');
      get('#est-platform').value = normalized === 'networking experts' ? '50' : '100';
      renderSlip();
    };

    container.querySelectorAll('input, select').forEach(el => {
      if (!['est-svc-main', 'est-svc-sub', 'est-svc-leaf'].includes(el.id)) {
        el.addEventListener('input', renderSlip);
        el.addEventListener('change', renderSlip);
      }
    });

    get('#est-copy').onclick = async () => {
      await navigator.clipboard.writeText(buildMessage());
      toast('Estimate copied', 'success');
    };

    get('#est-whatsapp').onclick = () => {
      const b = calc();
      if (b.total <= 0) { toast('Add at least one service or charge', 'warning'); return; }
      if (b.manualDiscount > 0 && !get('#est-discount-reason').value.trim()) {
        toast('Enter reason for manual discount', 'warning');
        return;
      }
      const digits = get('#est-client-phone').value.replace(/\D/g, '');
      const phone = digits.length > 10 ? digits.slice(-10) : digits;
      if (phone.length !== 10) { toast('Enter a valid 10 digit WhatsApp number', 'warning'); return; }
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(buildMessage())}`, '_blank');
    };

    get('#est-reset').onclick = () => renderEmployeeEstimatorTab(container);
    renderSelected();
    renderSlip();
  } catch (err) {
    console.error('[employee estimator] initialization failed:', err);
    container.innerHTML = `
      <div class="card" style="padding:32px;text-align:center;">
        <p style="color:var(--danger);margin:0;font-weight:600;">Could not load estimator</p>
        <small style="color:var(--text-dim);">${escapeHtml(err?.message || 'An unexpected error occurred')}</small>
      </div>
    `;
  }
}

export async function renderEmployeeInstallations(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }
  showLoader(container);

  const { data: list, error } = await supabase
    .from('installations')
    .select('*')
    .eq('assigned_employee_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);">Error</h3><p>${escapeHtml(error.message)}</p></div></div>`;
    return;
  }

  const all = list || [];
  const statusBadgeClass = (s) => ({
    pending: 'badge-pending',
    assigned: 'badge-assigned',
    in_progress: 'badge-in_progress',
    completed: 'badge-resolved',
    cancelled: 'badge-danger',
  }[s] || 'badge-open');

  const nextAction = {
    assigned: { label: 'Start Installation', next: 'in_progress' },
    in_progress: { label: 'Mark Completed', next: 'completed' },
  };

  const card = (x) => {
    const action = nextAction[x.status];
    return `
    <div class="emp-job-card" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-sm); margin-bottom:20px; border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; gap:10px;">
        <div>
          <div style="font-weight:800; font-size:1.1rem; color:var(--primary)">${escapeHtml(x.full_name || 'Customer')}</div>
          ${x.company_name ? `<div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-top:2px;text-transform:uppercase;">${escapeHtml(x.company_name)}</div>` : ''}
        </div>
        <span class="badge ${statusBadgeClass(x.status)}">${escapeHtml((x.status || '').replace(/_/g, ' ').toUpperCase())}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div><div class="sr-meta-label">Installation</div><div class="sr-meta-value"><b>${escapeHtml(x.installation_type || '-')}</b></div></div>
        <div><div class="sr-meta-label">Ticket</div><div class="sr-meta-value sr-mono">${escapeHtml(x.ticket_no || '-')}</div></div>
        <div><div class="sr-meta-label">Preferred Date</div><div class="sr-meta-value">${formatDate(x.preferred_date)}</div></div>
        <div><div class="sr-meta-label">Preferred Slot</div><div class="sr-meta-value">${escapeHtml(x.preferred_time || '-')}</div></div>
      </div>
      <div style="margin-bottom:12px;">
        <div class="sr-meta-label">Address</div>
        <div class="sr-meta-value" style="white-space:pre-wrap;line-height:1.4;">${escapeHtml(x.address || x.location || '-')}</div>
      </div>
      ${x.description ? `<div style="margin-bottom:12px;"><div class="sr-meta-label">Instructions</div><div class="sr-meta-value" style="white-space:pre-wrap;line-height:1.4;">${escapeHtml(x.description)}</div></div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${x.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${escapeHtml(x.phone)}" style="text-decoration:none;">${ICONS.phone || ''}<span>Call</span></a>` : ''}
        <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.address || x.location || '')}" style="text-decoration:none;">${ICONS.pin || ''}<span>Directions</span></a>
        ${action ? `<button type="button" class="btn btn-primary btn-sm inst-action-btn" data-id="${x.id}" data-next="${action.next}">${action.label}</button>` : ''}
      </div>
    </div>`;
  };

  const active = all.filter((x) => !['completed', 'cancelled'].includes(x.status));
  const done = all.filter((x) => ['completed', 'cancelled'].includes(x.status));

  container.innerHTML = `
    <div class="page-header">
      <h1>My Installations</h1>
      <p>Installation jobs assigned to you</p>
    </div>
    ${all.length === 0 ? `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim)">No installations assigned to you yet</div></div>` : `
      ${active.map(card).join('') || '<p style="color:var(--text-dim);margin-bottom:16px;">No active installations</p>'}
      ${done.length ? `<h3 style="margin:24px 0 12px;color:var(--text-dim);font-size:0.9rem;text-transform:uppercase;">Completed / Cancelled</h3>${done.map(card).join('')}` : ''}
    `}
  `;

  container.querySelectorAll('.inst-action-btn').forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      const { error: updErr } = await supabase
        .from('installations')
        .update({ status: btn.dataset.next })
        .eq('id', btn.dataset.id);
      if (updErr) {
        toast(updErr.message, 'error');
        btn.disabled = false;
        return;
      }
      toast('Installation updated', 'success');
      renderEmployeeInstallations(container);
    };
  });
}

// Public gig-worker pool: jobs admin released because fixed employees were
// busy (or that auto-timed-out). First to "Claim" gets it — race-safe via a
// dedicated atomic server endpoint, not the plain Supabase-shim update.
export async function renderEmployeeGigPool(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }
  showLoader(container);

  const { data: list, error } = await supabase
    .from('inquiries')
    .select('*')
    .eq('pool_status', 'pool')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);">Error</h3><p>${escapeHtml(error.message)}</p></div></div>`;
    return;
  }

  const all = list || [];

  const card = (x) => `
    <div class="emp-job-card" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-sm); margin-bottom:20px; border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; gap:10px;">
        <div>
          <div style="font-weight:800; font-size:1.1rem; color:var(--primary)">${escapeHtml(x.full_name || 'Customer')}</div>
          ${x.company_name ? `<div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-top:2px;text-transform:uppercase;">${escapeHtml(x.company_name)}</div>` : ''}
        </div>
        <span class="badge badge-open">Available</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div><div class="sr-meta-label">Service</div><div class="sr-meta-value"><b>${escapeHtml(x.service_item || '-')}</b></div></div>
        <div><div class="sr-meta-label">Ticket</div><div class="sr-meta-value sr-mono">${escapeHtml(x.ticket_no || '-')}</div></div>
      </div>
      <div style="margin-bottom:12px;">
        <div class="sr-meta-label">Location</div>
        <div class="sr-meta-value" style="white-space:pre-wrap;line-height:1.4;">${escapeHtml(x.location || '-')}</div>
      </div>
      ${x.description ? `<div style="margin-bottom:12px;"><div class="sr-meta-label">Customer description</div><div class="sr-meta-value" style="white-space:pre-wrap;line-height:1.4;">${escapeHtml(x.description)}</div></div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.location || '')}" style="text-decoration:none;">${ICONS.pin || ''}<span>Directions</span></a>
        <button type="button" class="btn btn-primary btn-sm gig-claim-btn" data-id="${x.id}">${ICONS.check || ''}<span>Claim Job</span></button>
      </div>
    </div>`;

  container.innerHTML = `
    <div class="page-header">
      <h1>Public Jobs</h1>
      <p>First to claim gets it — payment for these jobs is online only</p>
    </div>
    ${all.length === 0 ? `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim)">No jobs in the public pool right now — check back soon</div></div>` : all.map(card).join('')}
  `;

  container.querySelectorAll('.gig-claim-btn').forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<span>Claiming…</span>';
      try {
        const base = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '/api' : 'http://localhost:5000/api';
        const token = localStorage.getItem('auth_token') || (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch(`${base}/inquiries/${encodeURIComponent(btn.dataset.id)}/claim`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 409) {
          toast('Too slow — another worker already claimed this job.', 'warning');
          renderEmployeeGigPool(container);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(data.error || 'Could not claim job', 'error');
          btn.disabled = false;
          btn.innerHTML = originalHTML;
          return;
        }
        toast('Job claimed! Check My Tasks.', 'success');
        renderEmployeeGigPool(container);
      } catch {
        toast('Network error — please retry', 'error');
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    };
  });
}

export async function renderEmployeeTasks(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  // Drop any previous live channel before (re)rendering to avoid duplicates.
  if (container._tasksChannel) {
    try { supabase.removeChannel(container._tasksChannel); } catch {}
    container._tasksChannel = null;
  }

  container.innerHTML = `
    <div class="employee-task-loader" role="status" aria-live="polite">
      <div class="employee-task-loader-card">
        <span class="employee-task-loader-spinner"></span>
        <div>
          <div class="employee-task-loader-title">Loading your tasks</div>
          <div class="employee-task-loader-sub">Fetching assigned jobs, active services, and pending requests...</div>
        </div>
      </div>
    </div>
  `;

  let tasks, pendingInquiries, acceptedInquiries;
  try {
    const [ticketsRes, inquiriesRes] = await Promise.all([
      supabase.from('tickets').select('*, inquiries(*)').eq('assigned_to', user.id).order('created_at', { ascending: false }),
      supabase.from('inquiries').select('*').eq('assigned_employee_id', user.id).in('assignment_status', ['pending', 'accepted']).order('created_at', { ascending: false }),
    ]);
    tasks = ticketsRes.data || [];
    const allInquiries = inquiriesRes.data || [];
    // The API shim doesn't resolve the nested inquiries(*) relation, so link each
    // ticket to its inquiry (inquiry.ticket_id === ticket.id) manually — this is
    // what powers the customer details, call/WhatsApp and map buttons on the card.
    const byTicket = new Map();
    allInquiries.forEach(i => { if (i.ticket_id) byTicket.set(String(i.ticket_id), i); });
    // Second pass: any ticket still unlinked (its inquiry isn't pending/accepted,
    // e.g. an in-progress one) — fetch its inquiry directly by ticket_id.
    const missingIds = tasks
      .filter(t => !(t.inquiries && t.inquiries.length) && !byTicket.has(String(t.id)))
      .map(t => t.id)
      .filter(Boolean);
    if (missingIds.length) {
      const { data: extra } = await supabase.from('inquiries').select('*').in('ticket_id', missingIds);
      (extra || []).forEach(i => { if (i.ticket_id) byTicket.set(String(i.ticket_id), i); });
    }
    tasks = tasks.map(t => {
      if (t.inquiries && t.inquiries.length) return t;
      const linked = byTicket.get(String(t.id));
      return linked ? { ...t, inquiries: [linked] } : t;
    });
    const taskInquiryIds = new Set(tasks.map(task => task.inquiries?.[0]?.id).filter(Boolean));
    pendingInquiries = allInquiries.filter(x => x.assignment_status === 'pending').sort(byNewestCreated);
    acceptedInquiries = allInquiries
      .filter(x => x.assignment_status === 'accepted' && !taskInquiryIds.has(x.id))
      .sort(byNewestCreated)
      .map(x => ({ ...x, _company: x.company_name || null }));
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);display:inline-flex;align-items:center;gap:8px;">${ICONS.alert}<span>Error</span></h3><p>${err.message}</p></div></div>`;
    return;
  }

  const activeTasks = tasks.filter(x => {
    const status = displayStatus(x.status);
    if (status === 'resolved' || status === 'issue_not_resolved' || status === 'foc') return false;
    const inq = x.inquiries?.[0];
    if (!inq) return status === 'assigned' || status === 'in_progress' || status === 'open';
    return inq.assignment_status === 'accepted' && !['resolved', 'issue_not_resolved'].includes(displayStatus(inq.status));
  });
  const completedTasks = tasks.filter(x => displayStatus(x.status) === 'resolved');
  const issueTasks = tasks.filter(x => displayStatus(x.status) === 'issue_not_resolved');
  const activeAcceptedInquiries = acceptedInquiries.filter(x => !['resolved', 'closed', 'issue_not_resolved'].includes(x.status));
  const resolvedAcceptedInquiries = acceptedInquiries.filter(x => ['resolved', 'closed'].includes(x.status));
  const issueAcceptedInquiries = acceptedInquiries.filter(x => x.status === 'issue_not_resolved');

  // Status group for the filter tabs. data-status on cards is displayStatus()
  // output, so 'closed' already maps to 'resolved'.
  const groupOf = (s) => {
    if (s === 'in_progress') return 'in_progress';
    if (s === 'resolved' || s === 'foc') return 'resolved'; // FOC counts as a completed service
    if (s === 'issue_not_resolved') return 'issue_not_resolved';
    if (s === 'case_closed') return 'case_closed';
    return 'active'; // open / assigned / pending
  };
  const allServiceItems = [...acceptedInquiries, ...tasks].sort(byNewestCreated);
  const statusCounts = { active: 0, in_progress: 0, resolved: 0, issue_not_resolved: 0, case_closed: 0 };
  allServiceItems.forEach(item => { statusCounts[groupOf(displayStatus(item.status))]++; });
  const isReopened = (item) => Number((item.inquiries?.[0] || item)?.reopened) === 1;
  const reopenedCount = allServiceItems.filter(isReopened).length;

  const jobCard = (inq) => {
    const shownStatus = displayStatus(inq.status);
    const serviceDeadline = inq.created_at ? effectiveSLADeadline(inq) : null;
    const terminalStatus = ['resolved', 'closed', 'issue_not_resolved', 'foc'].includes(shownStatus);
    const slaTimerText = terminalStatus ? 'Service Completed'
      : isSlaPaused(inq) ? '<span style="color:var(--warning)">⏸ Paused (device in service)</span>'
      : (serviceDeadline ? formatTimeRemaining(serviceDeadline) : '-');
    return `
    <div class="emp-job-card" data-status="${shownStatus}" data-reopened="${Number(inq.reopened) === 1 ? '1' : '0'}" data-company="${inq._company || ''}" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-sm); margin-bottom:20px; border:1px solid var(--border);${Number(inq.reopened) === 1 ? 'border-left:4px solid var(--warning);' : ''}">
       ${Number(inq.reopened) === 1 ? `<div style="display:inline-flex;align-items:center;gap:6px;font-size:0.72rem;font-weight:800;color:var(--warning);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">🔁 Reopened — free rework</div>` : ''}
       <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
         <div>
           <div style="font-weight:800; font-size:1.15rem; color:var(--primary)">${inq.full_name}</div>
           ${inq._company ? `<div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">${inq._company}</div>` : ''}
           <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;"><b>Ticket:</b> ${inq.ticket_no || '-'}</div>
           <div style="font-size:0.82rem; color:var(--text-dim); margin-top:4px;"><b>Created:</b> ${formatDateTime(inq.created_at)}</div>
           <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;">${inq.service_item}</div>
           ${inq.employee_update_detail ? `<div style="font-size:0.82rem;color:var(--text-soft);margin-top:8px;padding:10px;border-radius:10px;background:var(--bg-soft);"><b>Employee update:</b> ${escapeHtml(inq.employee_update_detail)}</div>` : ''}
         </div>
         <span class="badge badge-${shownStatus}" style="font-size:0.75rem">${statusText(inq.status)}</span>
       </div>

       <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px; margin-top:16px; padding-top:16px; border-top:1px solid rgba(16,185,129,0.1);">
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Contact Info</div>
           <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
             <span style="font-weight:700; font-size:0.95rem">${inq.phone}</span>
             <div style="display:flex; gap:6px;">
               <a href="tel:${inq.phone}" style="display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; background:var(--primary); color:white;">
                 <span style="width:16px;height:16px;display:flex;">${ICONS.phone}</span>
               </a>
               <a href="https://wa.me/${inq.phone.replace(/\D/g,'')}" target="_blank" style="display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; background:#25D366; color:white;">
                 <span style="width:16px;height:16px;display:flex;">${ICONS.whatsapp}</span>
               </a>
             </div>
           </div>
         </div>
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Service Location</div>
           <div style="font-size:0.88rem; font-weight:600; margin-top:8px; display:flex; align-items:flex-start; gap:6px;">
             <span style="width:18px;height:18px;display:flex;flex-shrink:0;color:var(--primary)">${ICONS.pin}</span>
             <span style="line-height:1.4">${inq.location || '-'}</span>
           </div>
         </div>
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Preferred Time</div>
           <div style="font-size:0.88rem; font-weight:700; margin-top:8px; color:var(--primary)">${inq.preferred_time || 'Flexible'}</div>
         </div>
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">SLA Timer</div>
           <div style="font-size:0.88rem; font-weight:700; margin-top:8px;">${slaTimerText}</div>
         </div>
       </div>

       <div style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap;">
         <button class="btn btn-secondary btn-sm task-btn" data-id="${inq.ticket_id}" data-inq-id="${inq.id}" data-status="${inq.status}" style="flex:1; min-width:120px; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
           <span style="width:16px;height:16px;display:flex;">${ICONS.edit}</span> Update Status
         </button>
         ${inq.phone ? `
           <a href="tel:${escapeAttr(inq.phone)}" class="btn btn-secondary btn-sm" style="flex:1; min-width:100px; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none;">
             <span style="width:16px;height:16px;display:flex;">${ICONS.phone}</span> Call
           </a>
           <a href="https://wa.me/${(inq.phone || '').replace(/\D/g, '')}" target="_blank" rel="noopener" class="btn btn-sm" style="flex:1; min-width:100px; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none; background:#25D366; color:#fff;">
             <span style="width:16px;height:16px;display:flex;">${ICONS.whatsapp}</span> WhatsApp
           </a>
         ` : ''}
         <button class="btn btn-primary btn-sm" onclick="window.open('${escapeAttr(inquiryMapLink(inq))}')" style="flex:1; min-width:120px; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
           <span style="width:16px;height:16px;display:flex;">${ICONS.pin}</span> Open Maps
         </button>
       </div>
    </div>
  `;
  };

  const taskCard = (task) => {
    const inq = task.inquiries?.[0];
    const shownStatus = displayStatus(task.status);
    return `
      <div class="emp-task-card" data-status="${shownStatus}" data-reopened="${Number(inq?.reopened) === 1 ? '1' : '0'}" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-sm); margin-bottom:20px; border:1px solid var(--border);${Number(inq?.reopened) === 1 ? 'border-left:4px solid var(--warning);' : ''}">
        ${Number(inq?.reopened) === 1 ? `<div style="display:inline-flex;align-items:center;gap:6px;font-size:0.72rem;font-weight:800;color:var(--warning);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">🔁 Reopened — free rework</div>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="flex:1">
            <div style="font-weight:800; font-size:1.1rem; color:var(--text)">${task.title}</div>
            <div style="font-size:0.82rem; color:var(--text-dim); margin-top:4px;"><b>Created:</b> ${formatDateTime(inq?.created_at || task.created_at)}</div>
            <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;">${task.description || 'No description provided.'}</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <span class="badge badge-${shownStatus}">${statusText(task.status)}</span>
            <span class="badge badge-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
          </div>
        </div>
        
        ${inq ? `
          <div style="margin-top:16px; padding:14px; background:var(--bg-soft); border-radius:14px; border:1px dashed var(--primary);">
            <div style="font-size:0.75rem; color:var(--primary); font-weight:800; text-transform:uppercase; margin-bottom:10px;">Linked Service Request</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Client</div>
                <div style="font-size:0.9rem; font-weight:700">${inq.full_name}</div>
              </div>
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Ticket</div>
                <div style="font-size:0.9rem; font-weight:700; color:var(--primary)">${inq.ticket_no || '-'}</div>
              </div>
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Contact</div>
                <div style="font-size:0.9rem; font-weight:700; display:flex; align-items:center; gap:6px;">
                  ${inq.phone}
                  <a href="tel:${inq.phone}" style="color:var(--primary); display:flex;"><span style="width:14px;height:14px;display:flex;">${ICONS.phone}</span></a>
                  <a href="https://wa.me/${(inq.phone || '').replace(/\\D/g, '')}" target="_blank" style="color:#25D366; display:flex;"><span style="width:14px;height:14px;display:flex;">${ICONS.whatsapp}</span></a>
                </div>
              </div>
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Service</div>
                <div style="font-size:0.9rem; font-weight:600">${inq.service_item || '-'}</div>
              </div>
              ${inq.employee_update_detail ? `
                <div style="grid-column: span 2">
                  <div style="font-size:0.7rem; color:var(--text-dim)">Employee update</div>
                  <div style="font-size:0.88rem; font-weight:600; white-space:pre-wrap;">${escapeHtml(inq.employee_update_detail)}</div>
                </div>
              ` : ''}
              <div style="grid-column: span 2">
                <div style="font-size:0.7rem; color:var(--text-dim)">Location</div>
                <div style="font-size:0.88rem; font-weight:600; display:flex; align-items:flex-start; gap:6px;">
                  <span style="width:14px;height:14px;display:flex;flex-shrink:0;color:var(--primary);margin-top:2px;">${ICONS.pin}</span>
                  ${inq.location || '-'}
                </div>
              </div>
            </div>
          </div>
        ` : ''}
        
        <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm task-btn" data-id="${task.id}" data-inq-id="${inq ? inq.id : ''}" data-status="${task.status}" style="flex:1; min-width:120px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">
            <span style="width:16px;height:16px;display:flex;">${ICONS.edit}</span> Update Status
          </button>
          ${inq && inq.phone ? `
            <a href="tel:${escapeAttr(inq.phone)}" class="btn btn-secondary btn-sm" style="flex:1; min-width:100px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700; text-decoration:none;">
              <span style="width:16px;height:16px;display:flex;">${ICONS.phone}</span> Call
            </a>
            <a href="https://wa.me/${(inq.phone || '').replace(/\D/g, '')}" target="_blank" rel="noopener" class="btn btn-sm" style="flex:1; min-width:100px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700; text-decoration:none; background:#25D366; color:#fff;">
              <span style="width:16px;height:16px;display:flex;">${ICONS.whatsapp}</span> WhatsApp
            </a>
          ` : ''}
          ${inq ? `
            <button class="btn btn-primary btn-sm" onclick="window.open('${escapeAttr(inquiryMapLink(inq))}')" style="flex:1; min-width:120px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">
              <span style="width:16px;height:16px;display:flex;">${ICONS.pin}</span> Open Maps
            </button>
          ` : ''}
        </div>
      </div>
    `;
  };

  const activeServiceCards = [
    ...activeAcceptedInquiries,
    ...activeTasks,
  ].sort(byNewestCreated);
  const resolvedServiceCards = [
    ...resolvedAcceptedInquiries,
    ...completedTasks,
  ].sort(byNewestCreated);
  const issueServiceCards = [
    ...issueAcceptedInquiries,
    ...issueTasks,
  ].sort(byNewestCreated);


  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1 style="display:flex; align-items:center; gap:12px;">
          <span style="width:32px; height:32px; display:flex; color:var(--primary);">${ICONS.ticket}</span>
          <span>My Tasks</span>
        </h1>
        <p>All your assigned tasks, service jobs, and pending assignments</p>
      </div>
    </div>

    ${pendingInquiries.length > 0 ? `
      <div style="margin-bottom:24px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
          <span style="width:24px;height:24px;color:var(--primary);display:flex;">${ICONS.alert}</span>
          <h2 style="margin:0; color:var(--primary); font-size:1.3rem;">New Assignments Pending</h2>
          <span style="background:var(--primary);color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;">${pendingInquiries.length}</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
          ${pendingInquiries.map(pi => `
            <div style="background:linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%); border:2px solid var(--primary); border-radius:16px; padding:20px; box-shadow:0 4px 12px rgba(16, 185, 129, 0.1);">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
                <div>
                  <div style="font-size:0.75rem; color:var(--primary); font-weight:800; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Service Request</div>
                  <div style="font-size:1.1rem; font-weight:800; color:var(--text);">${escapeHtml(pi.full_name)}</div>
                </div>
                <span style="background:var(--primary); color:white; padding:6px 12px; border-radius:20px; font-size:0.75rem; font-weight:700;">${escapeHtml(pi.service_item)}</span>
              </div>

              <div style="background:rgba(16, 185, 129, 0.08); border-left:3px solid var(--primary); padding:12px; border-radius:8px; margin-bottom:14px;">
                <div style="font-size:0.72rem; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Ticket</div>
                <div style="font-size:0.95rem; font-weight:700; color:var(--primary);">${escapeHtml(pi.ticket_no || 'NE-' + Math.random().toString(36).substring(2, 10).toUpperCase())}</div>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                <div>
                  <div style="font-size:0.7rem; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Created</div>
                  <div style="font-size:0.85rem; font-weight:600;">${formatDateTime(pi.created_at)}</div>
                </div>
                <div>
                  <div style="font-size:0.7rem; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Preferred Time</div>
                  <div style="font-size:0.85rem; font-weight:600; color:var(--primary);">${escapeHtml(pi.preferred_time || 'Flexible')}</div>
                </div>
              </div>

              <div style="margin-bottom:14px;">
                <div style="font-size:0.7rem; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Location</div>
                <div style="font-size:0.85rem; font-weight:600; display:flex; align-items:flex-start; gap:6px;">
                  <span style="color:var(--primary); flex-shrink:0; margin-top:2px; width:14px; height:14px; display:flex;">${ICONS.pin}</span>
                  <span>${escapeHtml(pi.location || 'Not specified')}</span>
                </div>
              </div>

              <div style="display:flex; gap:8px;">
                <button class="btn btn-primary btn-sm accept-btn" data-id="${pi.id}" data-ticket-id="${pi.ticket_id || ''}" style="flex:1; height:40px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">${ICONS.check}<span>Accept</span></button>
                <button class="btn btn-danger btn-sm decline-btn" data-id="${pi.id}" style="flex:1; height:40px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">${ICONS.close}<span>Decline</span></button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="df-wrap" style="margin-bottom:24px;">
      <button class="btn btn-secondary df-toggle" id="task-filter-btn">${ICONS.filter}<span>Filters</span><span class="df-badge" id="task-badge" style="display:none">0</span></button>
      <div class="df-panel" id="task-panel" style="display:none">
        <div class="df-field">
          <span class="df-label">Status</span>
          <select id="task-status-sel">
            <option value="in_progress">In Progress (${statusCounts.in_progress + statusCounts.active})</option>
            ${reopenedCount ? `<option value="reopened">🔁 Reopened (${reopenedCount})</option>` : ''}
            <option value="resolved">Resolved (${statusCounts.resolved})</option>
            <option value="issue_not_resolved">Issue Not Resolved (${statusCounts.issue_not_resolved})</option>
            <option value="device_followup">Device Follow Up</option>
            <option value="case_closed">Case Closed (${statusCounts.case_closed})</option>
          </select>
        </div>
        <div class="df-field">
          <span class="df-label">Search</span>
          <input id="task-search" type="search" placeholder="Search by title, client, or ticket…" autocomplete="off"/>
        </div>
        <div class="df-footer">
          <button class="btn btn-ghost btn-sm" id="task-filter-clear">Clear</button>
          <button class="btn btn-primary btn-sm" id="task-ok">Apply</button>
        </div>
      </div>
    </div>

    <div id="task-list">
      ${(tasks.length === 0 && acceptedInquiries.length === 0)
        ? '<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:var(--text-dim)"><div style="font-size:2rem;margin-bottom:12px;"></div><p style="font-weight:600;">No tasks assigned yet</p><p style="font-size:0.85rem;">Tasks will appear here once admin assigns service requests to you.</p></div></div>'
        : `
          <div class="card" id="services-card">
            <div class="card-header"><span class="card-title" id="services-card-title">Active Services</span></div>
            <div class="card-body emp-scroll-list emp-grid-2" id="services-list">
              ${allServiceItems.map(item => item.inquiries ? taskCard(item) : jobCard(item)).join('')}
              <div id="services-empty" style="display:none;text-align:center;padding:28px;color:var(--text-dim)">Nothing here for this status.</div>
            </div>
          </div>
        `}
    </div>

    <div id="devices-in-service-card" style="display:none;margin-top:16px;">
      <div class="card">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.wrench}<span>Devices in Service</span></span></div>
        <div class="card-body emp-scroll-list" id="devices-in-service-list">
          <div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.85rem;">Loading…</div>
        </div>
      </div>
    </div>
  `;

  // Populate the "Devices in Service" container (tickets sent to the service
  // center). Visibility is controlled by the "Device Follow Up" filter tab.
  populateDevicesInService(container, user.id, { deferShow: true });

  // Live auto-refresh: re-render this view the moment admin assigns/updates a
  // request for this employee — no manual refresh needed.
  let _tasksRerenderTimer = null;
  container._tasksChannel = supabase.channel(`employee-tasks-${user.id}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'inquiries',
      filter: `assigned_employee_id=eq.${user.id}`,
    }, (payload) => {
      const row = payload.new;
      if (payload.eventType === 'INSERT' || (payload.eventType === 'UPDATE' && row?.assignment_status === 'pending')) {
        showNotification({
          title: '🔔 New Job Assigned',
          body: `${row?.full_name || 'A client'} - ${row?.service_item || 'new service'}`,
          type: 'alert',
          tag: `assign-${row?.id || ''}`,
        });
      }
      // Debounce so a burst of changes triggers a single re-render.
      clearTimeout(_tasksRerenderTimer);
      _tasksRerenderTimer = setTimeout(() => {
        if (document.body.contains(container)) renderEmployeeTasks(container);
      }, 400);
    })
    .subscribe();

  // Clean up the channel once this view leaves the DOM.
  const _tasksChannelWatch = setInterval(() => {
    if (!document.body.contains(container)) {
      try { supabase.removeChannel(container._tasksChannel); } catch {}
      container._tasksChannel = null;
      clearInterval(_tasksChannelWatch);
    }
  }, 5000);

  // Status filters — each tab shows only its own services.
  const FILTER_TITLES = {
    active: 'In Progress Services',
    in_progress: 'In Progress Services',
    reopened: '🔁 Reopened Tickets (free rework)',
    resolved: 'Resolved Services',
    issue_not_resolved: 'Issue Not Resolved Services',
    case_closed: 'Case Closed Services',
  };
  let activeFilter = 'in_progress';
  let searchQuery = '';

  const applyFilters = () => {
    const servicesCard = container.querySelector('#services-card');
    const devicesCard = container.querySelector('#devices-in-service-card');
    const q = searchQuery.toLowerCase();

    if (activeFilter === 'device_followup') {
      if (servicesCard) servicesCard.style.display = 'none';
      if (devicesCard) {
        devicesCard.style.display = 'block';
        if (devicesCard.dataset.hasDevices !== '1') {
          const list = devicesCard.querySelector('#devices-in-service-list');
          if (list) list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text-dim)">No devices in the service center right now.</div>';
        }
      }
      return;
    }

    if (devicesCard) devicesCard.style.display = 'none';
    if (servicesCard) servicesCard.style.display = '';
    const title = container.querySelector('#services-card-title');
    if (title) title.textContent = FILTER_TITLES[activeFilter] || 'Services';

    let shown = 0;
    container.querySelectorAll('#services-list .emp-task-card, #services-list .emp-job-card').forEach(card => {
      const grp = groupOf(card.dataset.status);
      // "In Progress" also absorbs any not-yet-progressed accepted work, so an
      // accepted task is never hidden just because its status lagged behind.
      const matchesFilter = activeFilter === 'reopened'
        ? card.dataset.reopened === '1'
        : activeFilter === 'in_progress'
          ? (grp === 'in_progress' || grp === 'active')
          : grp === activeFilter;
      const ok = matchesFilter
        && (!q || card.textContent.toLowerCase().includes(q));
      card.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    const empty = container.querySelector('#services-empty');
    if (empty) empty.style.display = shown ? 'none' : '';
  };

  const taskPanel = container.querySelector('#task-panel');
  const taskBtn = container.querySelector('#task-filter-btn');
  const taskBadge = container.querySelector('#task-badge');
  const updateTaskBadge = () => {
    const n = (activeFilter !== 'in_progress' ? 1 : 0) + (searchQuery ? 1 : 0);
    taskBadge.textContent = n;
    taskBadge.style.display = n ? '' : 'none';
  };
  const taskOutside = (e) => {
    if (!taskBtn.closest('.df-wrap').contains(e.target)) {
      taskPanel.style.display = 'none';
      taskBtn.classList.remove('df-open');
      document.removeEventListener('click', taskOutside);
    }
  };
  taskBtn.onclick = (e) => {
    e.stopPropagation();
    if (taskPanel.style.display === 'none') {
      taskPanel.style.display = '';
      taskBtn.classList.add('df-open');
      setTimeout(() => document.addEventListener('click', taskOutside), 0);
    } else {
      taskPanel.style.display = 'none';
      taskBtn.classList.remove('df-open');
      document.removeEventListener('click', taskOutside);
    }
  };
  const searchInput = container.querySelector('#task-search');
  const taskClose = () => { taskPanel.style.display = 'none'; taskBtn.classList.remove('df-open'); document.removeEventListener('click', taskOutside); };
  container.querySelector('#task-ok').onclick = () => {
    activeFilter = container.querySelector('#task-status-sel').value;
    searchQuery = searchInput ? searchInput.value : '';
    applyFilters();
    updateTaskBadge();
    taskClose();
  };
  container.querySelector('#task-filter-clear').onclick = () => {
    activeFilter = 'in_progress';
    searchQuery = '';
    container.querySelector('#task-status-sel').value = 'in_progress';
    if (searchInput) searchInput.value = '';
    applyFilters();
    updateTaskBadge();
    taskClose();
  };
  applyFilters();

  // Task update buttons
  container.querySelectorAll('.task-btn').forEach(btn => {
    btn.onclick = () => openTaskModalWithLoader(btn, btn.dataset.id, btn.dataset.inqId, btn.dataset.status, () => renderEmployeeTasks(container));
  });

  // Accept/Decline
  container.querySelectorAll('.accept-btn').forEach(btn => {
    btn.onclick = async () => {
      const ops = [
        supabase.from('inquiries').update({ assignment_status: 'accepted', status: 'in_progress' }).eq('id', btn.dataset.id)
      ];
      if (btn.dataset.ticketId) {
        ops.push(supabase.from('tickets').update({ status: 'in_progress' }).eq('id', btn.dataset.ticketId));
      }
      const results = await Promise.all(ops);
      const error = results.find(r => r.error)?.error;
      if (error) toast(error.message, 'error');
      else { toast('Task accepted!', 'success'); renderEmployeeTasks(container); }
    };
  });

  container.querySelectorAll('.decline-btn').forEach(btn => {
    btn.onclick = () => {
      const reason = prompt('Please provide a reason for declining:');
      if (reason === null) return;
      if (!reason.trim()) { toast('Reason is required to decline', 'warning'); return; }
      (async () => {
        const { error } = await supabase.from('inquiries').update({
          assignment_status: 'declined', decline_reason: reason.trim(), status: 'open'
        }).eq('id', btn.dataset.id);
        if (error) toast(error.message, 'error');
        else { toast('Task declined', 'info'); renderEmployeeTasks(container); }
      })();
    };
  });
}

function openTaskModal(taskId, inqId, currentStatus, onDone) {
  return (async () => {
    const { data: pricing } = await supabase.from('service_pricing').select('*').order('category');
    const { data: discountPresets } = await supabase.from('discount_presets').select('*').eq('active', 1).order('created_at', { ascending: false });
    const { data: deviceTypes } = await supabase.from('device_types').select('name').order('name');
    const deviceTypeList = Array.isArray(deviceTypes) ? deviceTypes : [];
    const { data: companies } = await supabase.from('companies').select('*').order('name');
    const companyList = Array.isArray(companies) ? companies : [];
    const discountPresetList = Array.isArray(discountPresets) ? discountPresets : [];
    // Snapshot current payment state so we can gate the resolved submit button.
    let paymentState = { status: 'unpaid', received_at: null };
    let inquiryRow = null;
    if (inqId) {
      const { data: inqSnap } = await supabase.from('inquiries').select('*').eq('id', inqId).single();
      if (inqSnap) {
        inquiryRow = inqSnap;
        paymentState = { status: inqSnap.payment_status || 'unpaid', received_at: inqSnap.payment_received_at || null };
      }
    }
    if (!inquiryRow && taskId) {
      const { data: inqSnap } = await supabase.from('inquiries').select('*').eq('ticket_id', taskId).maybeSingle();
      if (inqSnap) {
        inquiryRow = inqSnap;
        inqId = inqSnap.id;
        paymentState = { status: inqSnap.payment_status || 'unpaid', received_at: inqSnap.payment_received_at || null };
      }
    }
    // Employee profile + most recent attendance (for technician name and clock-in coords).
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const empProfile = authUser ? (await supabase.from('profiles').select('*').eq('id', authUser.id).single()).data : null;
    const todayKey = new Date().toLocaleDateString('en-CA');
    let employeeCoords = { lat: null, lng: null, location: null };
    if (authUser) {
      const { data: att } = await supabase.from('attendance')
        .select('latitude,longitude,location,clock_in')
        .eq('user_id', authUser.id)
        .eq('date', todayKey)
        .order('clock_in', { ascending: false });
      if (Array.isArray(att) && att[0]) {
        employeeCoords = { lat: att[0].latitude, lng: att[0].longitude, location: att[0].location };
      }
    }
    // Build a tree: Main → Sub → leaves (each leaf = priced row). When a row
    // has no sub_category we group it under a synthetic '' key, surfaced as
    // "-" in the picker so the cascade still works for 2-level catalogs.
    const tree = {};
    (pricing || []).forEach(p => {
      const main = p.category || 'Uncategorized';
      const sub = (p.sub_category && p.sub_category.trim()) || '';
      const leaf = p.sub_sub_category || p.name || '';
      if (!leaf) return;
      tree[main] ??= {};
      tree[main][sub] ??= [];
      tree[main][sub].push({ id: p.id, leaf, cost: Number(p.cost) || 0 });
    });
    const mainOptions = Object.keys(tree).sort();
    
    const normalizedCurrentStatus = displayStatus(currentStatus);
    const isResolvedReadOnly = isLocked(normalizedCurrentStatus);
    const isResolving = normalizedCurrentStatus === 'resolved';
    // Device tracking feature flag (master) + per-ticket flag.
    await loadDeviceTrackingEnabled();
    const deviceFeatureOn = deviceTrackingEnabled;
    let deviceTicketOn = Number(inquiryRow?.device_service_enabled) === 1;
    // Whether a "device taken" log has actually been recorded for this ticket.
    // Once true, turning the toggle off can no longer stand in for a real
    // return — only a logged device_return_logs row (or an explicit returned
    // follow-up/status) unlocks billing. Refined by refreshDeviceHistory once
    // the device history loads.
    let deviceHasTakenLog = inquiryRow?.device_status === 'taken' || inquiryRow?.device_status === 'in_service';
    // Whether the device taken for service has been returned to the client. Used
    // to block completing the service while a device is still at the service center.
    let deviceReturned = (!(Number(inquiryRow?.device_service_enabled) === 1) && !deviceHasTakenLog)
      || inquiryRow?.follow_up_status === 'returned'
      || inquiryRow?.device_status === 'returned';
    // Effective SLA = rescheduled time (if any) + paused device time.
    const serviceDeadline = inquiryRow ? effectiveSLADeadline(inquiryRow) : null;
    const slaPaused = isSlaPaused(inquiryRow);
    const scheduledLocal = (() => {
      if (!inquiryRow?.scheduled_at) return '';
      const d = new Date(inquiryRow.scheduled_at);
      if (Number.isNaN(d.getTime())) return '';
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    })();
    const serviceElapsed = elapsedTime(inquiryRow?.created_at, inquiryRow?.updated_at || new Date());
    const serviceResolvedTime = ['resolved', 'closed', 'issue_not_resolved'].includes(displayStatus(inquiryRow?.status))
      ? elapsedTime(inquiryRow?.created_at, inquiryRow?.updated_at || inquiryRow?.bill_generated_at || new Date())
      : null;
    // Selected services chosen via the cascading picker. Each entry:
    // { id, main, sub, leaf, cost }.
    const selectedServices = [];
    if (inqId) {
      const { data: links } = await supabase.from('inquiry_services')
        .select('service_id, service_pricing(name, category, sub_category, sub_sub_category, cost)')
        .eq('inquiry_id', inqId);
      if (Array.isArray(links)) {
        const seenIds = new Set();
        links.forEach(link => {
          if (!link.service_id || seenIds.has(link.service_id)) return;
          seenIds.add(link.service_id);
          const p = link.service_pricing || {};
          selectedServices.push({
            id: link.service_id,
            main: p.category || 'Service',
            sub: p.sub_category || '',
            leaf: p.sub_sub_category || p.name || '',
            cost: Number(p.cost) || 0
          });
        });
      }
    }
    const linkedServicesSubtotal = () => selectedServices.reduce((acc, s) => acc + (Number(s.cost) || 0), 0);
    // bill_amount is stored as services + extra, so strip the extra back out
    // or reopening the modal double-counts it (extra is re-added by calcTotal).
    const savedServicesSubtotal = () =>
      Math.max(0, (Number(inquiryRow?.bill_amount) || 0) - (Number(inquiryRow?.extra_cost) || 0));
    const billServicesSubtotal = () => {
      const linkedSubtotal = linkedServicesSubtotal();
      return linkedSubtotal > 0 ? linkedSubtotal : savedServicesSubtotal();
    };

    let initialManualDiscount = 0;
    if (inquiryRow) {
      const servicesSubtotal = billServicesSubtotal();
      const extra = Number(inquiryRow.extra_cost) || 0;
      const km = Number(inquiryRow.transport_km) || 0;
      const transport = Math.round(km * 5);
      const companyName = inquiryRow.company_name || 'networking experts';
      const isNetworkingExperts = companyName.toLowerCase().replace(/\s+/g, ' ') === 'networking experts';
      const platform = isNetworkingExperts ? 50 : 100;

      // Coupon (if any) is auto-re-applied after the modal mounts; the manual
      // remainder is then back-filled. Start the manual field from the full
      // stored discount so a coupon-less reopen reproduces the same total.
      const totalDiscount = Number(inquiryRow.discount_amount) || 0;
      initialManualDiscount = Math.max(0, totalDiscount);
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:720px">
        <div class="modal-header">
          <span class="modal-title">Manage Service</span>
          <button class="modal-close" id="cm">&times;</button>
        </div>
        <div class="modal-body" style="padding-top:14px;">
          <div class="mst-tabs" role="tablist">
            <button type="button" class="mst-tab active" data-tab="status">${ICONS.pin}<span>Status</span></button>
            <button type="button" class="mst-tab" data-tab="device">${ICONS.wrench}<span>Device</span></button>
            <button type="button" class="mst-tab" data-tab="bill">${ICONS.receipt}<span>Bill</span></button>
          </div>

          ${inquiryRow ? `
            <div style="margin:0 0 16px;padding:16px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px;">
                <div>
                  <div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Ticket</div>
                  <div style="font-size:0.95rem;font-weight:700;color:var(--primary);">${escapeHtml(inquiryRow.ticket_no || 'No ticket')}</div>
                </div>
                <span class="badge badge-${displayStatus(inquiryRow.status)}">${statusText(inquiryRow.status)}</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(16,185,129,0.1);">
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Service Created</div>
                  <div style="font-size:0.88rem;font-weight:600;">${formatDateTime(inquiryRow.created_at)}</div>
                </div>
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Last Updated</div>
                  <div style="font-size:0.88rem;font-weight:600;">${inquiryRow.updated_at ? formatDateTime(inquiryRow.updated_at) : formatDateTime(inquiryRow.created_at)}</div>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Name</div>
                  <div style="font-size:0.88rem;font-weight:600;">${escapeHtml(inquiryRow.full_name || 'Client')}</div>
                </div>
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Phone</div>
                  <div style="font-size:0.88rem;font-weight:600;">${escapeHtml(inquiryRow.phone || '-')}</div>
                </div>
              </div>
              <div style="margin-bottom:14px;">
                <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Service Item</div>
                <div style="font-size:0.88rem;font-weight:600;">${escapeHtml(inquiryRow.service_item || 'Service request')}</div>
              </div>
              ${inquiryRow.description ? `
                <div style="margin-bottom:14px;padding:10px;background:rgba(16,185,129,0.05);border-radius:10px;border-left:3px solid var(--primary);">
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Customer Description</div>
                  <div style="font-size:0.82rem;line-height:1.4;color:var(--text);">${escapeHtml(inquiryRow.description)}</div>
                </div>
              ` : ''}
              <div style="margin-bottom:14px;">
                <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Location</div>
                <div style="font-size:0.88rem;font-weight:600;display:flex;align-items:flex-start;gap:6px;">
                  <span style="color:var(--primary);flex-shrink:0;margin-top:2px;width:16px;height:16px;display:flex;">${ICONS.pin}</span>
                  <span style="line-height:1.4;">${escapeHtml(inquiryRow.location || '-')}</span>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Preferred Time</div>
                  <div style="font-size:0.88rem;font-weight:600;color:var(--primary);">${escapeHtml(inquiryRow.preferred_time || 'Flexible')}</div>
                </div>
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">SLA Deadline${inquiryRow?.scheduled_at ? ' (rescheduled)' : ''}</div>
                  <div style="font-size:0.88rem;font-weight:600;">${['resolved', 'closed', 'issue_not_resolved', 'foc'].includes(inquiryRow?.status) ? 'Service Completed' : slaPaused ? '<span style="color:var(--warning)">⏸ Paused — device in service</span>' : (serviceDeadline ? formatSLADeadline(serviceDeadline) : '-')}</div>
                </div>
              </div>
            </div>
          ` : ''}

          ${inquiryRow ? `
            <div style="background:var(--bg-soft);border:1px solid var(--border);border-radius:14px;padding:14px;margin:0 0 12px;">
              <div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">Customer Details</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px 16px;font-size:0.85rem;margin-bottom:12px;">
                ${[
                  ['Name', inquiryRow.full_name],
                  ['Phone', inquiryRow.phone],
                  ['Ticket', inquiryRow.ticket_no],
                  ['Service', inquiryRow.service_item],
                  ['Company', inquiryRow.company_name],
                  ['Address', inquiryRow.address || inquiryRow.location],
                ].filter(([, v]) => v).map(([k, v]) => `<div><div style="color:var(--text-dim);font-size:0.7rem;font-weight:700;text-transform:uppercase;">${k}</div><div style="font-weight:600;">${escapeHtml(v)}</div></div>`).join('')}
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${inquiryRow.phone ? `
                  <a href="tel:${escapeAttr(inquiryRow.phone)}" class="btn btn-secondary btn-sm" style="flex:1;min-width:90px;height:38px;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;font-weight:700;"><span style="width:15px;height:15px;display:flex;">${ICONS.phone}</span>Call</a>
                  <a href="https://wa.me/${(inquiryRow.phone || '').replace(/\D/g, '')}" target="_blank" rel="noopener" class="btn btn-sm" style="flex:1;min-width:90px;height:38px;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;font-weight:700;background:#25D366;color:#fff;"><span style="width:15px;height:15px;display:flex;">${ICONS.whatsapp}</span>WhatsApp</a>
                ` : ''}
                <a href="${escapeAttr(inquiryMapLink(inquiryRow))}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="flex:1;min-width:90px;height:38px;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;font-weight:700;"><span style="width:15px;height:15px;display:flex;">${ICONS.pin}</span>Open Map</a>
              </div>
            </div>
          ` : ''}

          ${(employeeCoords.lat != null || inquiryRow?.customer_lat != null) ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px;">
              <a href="${employeeCoords.lat != null ? escapeAttr(mapLink(employeeCoords.lat, employeeCoords.lng)) : '#'}" target="_blank" rel="noopener"
                 style="padding:10px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);text-decoration:none;color:var(--text);font-size:0.78rem;${employeeCoords.lat == null ? 'pointer-events:none;opacity:.55;' : ''}">
                <b style="display:block;color:var(--primary);margin-bottom:3px;">Employee pin</b>
                <span>${escapeHtml(employeeCoords.location || 'Clock-in GPS')}</span>
              </a>
              <a href="${inquiryRow?.customer_lat != null ? escapeAttr(mapLink(inquiryRow.customer_lat, inquiryRow.customer_lng)) : '#'}" target="_blank" rel="noopener"
                 style="padding:10px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);text-decoration:none;color:var(--text);font-size:0.78rem;${inquiryRow?.customer_lat == null ? 'pointer-events:none;opacity:.55;' : ''}">
                <b style="display:block;color:var(--primary);margin-bottom:3px;">Client pin</b>
                <span>${escapeHtml(inquiryRow?.location || 'Customer GPS')}</span>
              </a>
            </div>
          ` : ''}

          ${inquiryRow?.description ? `
            <div style="margin:0 0 14px;padding:12px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);">
              <div style="font-size:0.72rem;font-weight:700;color:var(--primary);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:6px;">Client's reported issue</div>
              <div style="white-space:pre-wrap;line-height:1.45;font-size:0.86rem;">${escapeHtml(inquiryRow.description)}</div>
            </div>
          ` : ''}

          <!-- TAB 1: STATUS -->
          <div class="mst-pane active" data-pane="status">
            ${Number(inquiryRow?.reopened) === 1 ? `
              <div style="padding:12px 14px;border-radius:12px;background:rgba(245,158,11,0.12);border:1px solid var(--warning);margin-bottom:14px;font-size:0.85rem;line-height:1.5;">
                🔁 <b>Reopened ticket — issue not resolved.</b> The customer already paid for this service, so complete the rework as <b>FOC (Free of Cost)</b> — no new bill will be generated.
              </div>` : ''}
            <div class="form-group">
              <label>New Status</label>
              <select id="new-status" ${isResolvedReadOnly ? 'disabled' : ''}>
                ${Number(inquiryRow?.reopened) === 1 ? `
                  <option value="resolved" ${normalizedCurrentStatus==='resolved'?'selected':''}>Resolved</option>
                  <option value="foc" ${normalizedCurrentStatus==='foc'?'selected':''}>FOC — Free of Cost (no bill generated)</option>
                ` : `
                  <option value="in_progress" ${normalizedCurrentStatus==='in_progress'?'selected':''}>In Progress</option>
                  <option value="resolved" ${normalizedCurrentStatus==='resolved'?'selected':''}>Resolved</option>
                  <option value="reschedule">📅 Reschedule (set new visit time)</option>
                  <option value="issue_not_resolved" ${normalizedCurrentStatus==='issue_not_resolved'?'selected':''}>Issue Not Resolved</option>
                  <option value="case_closed" ${normalizedCurrentStatus==='case_closed'?'selected':''}>Case Closed — customer didn't cooperate / no fee</option>
                `}
              </select>
              <small id="case-closed-hint" style="display:${normalizedCurrentStatus==='case_closed'?'block':'none'}; margin-top:6px; color:var(--danger); font-size:0.75rem;">⚠️ Case Closed is final — the ticket will be locked and cannot be reopened.</small>
            </div>

            <div class="form-group" id="foc-billno-group" style="display:${normalizedCurrentStatus==='foc'?'block':'none'};">
              <label>Client Bill Number <span style="color:var(--danger)">*</span></label>
              <input type="text" id="foc-bill-no" value="${escapeHtml(inquiryRow?.bill_no || '')}" placeholder="Enter the customer's existing bill number" />
              <small style="color:var(--text-dim);font-size:0.75rem;">FOC service: no new bill is generated, but the client's bill number is required for the record.</small>
            </div>

            <div class="form-group" id="reschedule-group" style="display:none;">
              <label>New visit date &amp; time <span style="color:var(--danger)">*</span></label>
              <input type="datetime-local" id="reschedule-at" value="${scheduledLocal}" />
              <small style="color:var(--text-dim);font-size:0.75rem;">Saving sends the customer an SMS with this new time, and the SLA timer resets to it.</small>
            </div>

            <div class="form-group">
              <label id="progress-detail-label">Work Details / Progress Update <span style="color:var(--danger)">*</span></label>
              <textarea id="progress-detail" rows="5" placeholder="Describe what you did... (Mandatory)"></textarea>
            </div>

            <div id="feedback-link-box" style="display:none; padding:12px; border-radius:12px; background:rgba(16,185,129,0.07); border:1px solid var(--primary);">
              <div style="font-size:0.78rem; font-weight:700; color:var(--primary); margin-bottom:6px;"> Feedback Link for Client</div>
              <div style="display:flex; gap:8px;">
                <input id="feedback-url" type="text" readonly style="flex:1; font-size:0.78rem; background:var(--bg);"/>
                <button class="btn btn-secondary btn-sm" id="copy-feedback-url">Copy</button>
              </div>
              <button class="btn btn-primary btn-sm" id="share-feedback-wa" style="width:100%; margin-top:8px; justify-content:center; gap:8px;">
                ${ICONS.whatsapp}<span>Share Feedback Link via WhatsApp</span>
              </button>
            </div>
          </div>

          <!-- TAB 2: DEVICE INFO -->
          <div class="mst-pane" data-pane="device">
            <div class="form-group">
              <label>Company Name <span style="color:var(--danger)">*</span></label>
              <select id="resolve-company" style="margin-bottom:8px;" ${isResolvedReadOnly ? 'disabled' : ''}>
                <option value="">Select Company...</option>
                ${companyList.map(c => {
                  const isSel = (inquiryRow?.company_name || 'networking experts').toLowerCase() === c.name.toLowerCase();
                  return `<option value="${c.name.replace(/"/g,'&quot;')}" ${isSel ? 'selected' : ''}>${c.name}</option>`;
                }).join('')}
                <option value="Other">Other (Type manually)</option>
              </select>
              <input type="text" id="resolve-company-custom" placeholder="Type custom company name (Mandatory)" style="display:none;" ${isResolvedReadOnly ? 'disabled' : ''}/>
            </div>
            <div class="form-group">
              <label>Device Type</label>
              <input type="text" id="device-type" list="emp-device-types" placeholder="${deviceTypeList.length ? 'Start typing or pick...' : 'e.g. Video Door Phone'}" value="${(inquiryRow?.device_type || '').replace(/"/g,'&quot;')}" ${isResolvedReadOnly ? 'disabled' : ''}/>
              <datalist id="emp-device-types">
                ${deviceTypeList.map(d => `<option value="${(d.name || '').replace(/"/g,'&quot;')}"></option>`).join('')}
              </datalist>
              ${!isResolvedReadOnly ? `<div class="dt-chip-row">
                ${['CCTV DVR', 'CCTV Camera', 'NVR', 'Router', 'Video Door Phone', 'Biometric'].map(t => `<button type="button" class="dt-chip" data-target="device-type" data-mode="replace" data-fill="${t}">${t}</button>`).join('')}
              </div>` : ''}
              ${deviceTypeList.length === 0 ? '<small style="display:block; margin-top:6px; color:var(--text-dim); font-size:0.75rem;">Tip: ask admin to add device types so this becomes a quick-pick list.</small>' : ''}
            </div>
            <div class="form-group">
              <label>Device Serial No</label>
              <input type="text" id="device-serial" placeholder="e.g. SN-12345" value="${(inquiryRow?.device_serial_no || '').replace(/"/g,'&quot;')}" ${isResolvedReadOnly ? 'disabled' : ''}/>
            </div>
            <small style="display:block; color:var(--text-dim); font-size:0.78rem; margin-top:-4px;">These are saved on the inquiry whenever you press Save Changes - and they appear on the bill template.</small>
          </div>

          ${deviceFeatureOn ? `
          <!-- TAB: DEVICE SERVICE -->
          <div class="mst-pane" data-pane="service">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:12px;background:var(--bg-soft);border:1px solid var(--border);margin-bottom:14px;">
              <div>
                <div style="font-weight:700;font-size:0.9rem;">Send device to service center</div>
                <small style="color:var(--text-dim);font-size:0.76rem;">Turn on when you take the customer's device for off-site repair. The ticket stays In Progress.</small>
              </div>
              <label class="switch">
                <input type="checkbox" id="device-service-toggle" ${deviceTicketOn ? 'checked' : ''}>
                <span class="switch-slider"></span>
              </label>
            </div>

            <div id="device-service-body" style="display:${deviceTicketOn ? 'block' : 'none'};">
              <div class="form-group">
                <label>Device Photo (when taken) <span style="color:var(--danger)">*</span></label>
                <input type="file" id="device-taken-image" accept="image/*" capture="environment">
              </div>
              <div class="form-group">
                <label>Device Description / Condition on pickup</label>
                <textarea id="device-taken-desc" rows="3" placeholder="e.g. CCTV DVR, power issue, scratches on top panel"></textarea>
                <div class="dt-chip-row">
                  ${['No visible damage', 'Not powering on', 'Scratches / wear', 'Physical damage', 'Water damage'].map(t => `<button type="button" class="dt-chip" data-target="device-taken-desc" data-mode="append" data-fill="${t}">${t}</button>`).join('')}
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="save-device-taken">Save device taken</button>

              <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">

              <div class="form-group">
                <label>Return photo (when handing back to client) <span style="color:var(--danger)">*</span></label>
                <input type="file" id="device-return-image" accept="image/*" capture="environment">
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                  <label>Condition</label>
                  <select id="device-return-condition">
                    <option value="repaired">Repaired</option>
                    <option value="good">Good</option>
                    <option value="damaged">Damaged</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Return notes</label>
                  <input type="text" id="device-return-notes" placeholder="e.g. replaced adapter">
                </div>
              </div>
              <div class="dt-chip-row">
                ${['No issue found', 'Repaired & tested', 'Replaced part', 'Cleaned & reconfigured'].map(t => `<button type="button" class="dt-chip" data-target="device-return-notes" data-mode="append" data-fill="${t}">${t}</button>`).join('')}
              </div>
              <button type="button" class="btn btn-primary btn-sm" id="save-device-return">Mark returned / sent back to client</button>

              <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">

              <!-- Follow-up status updates (awaiting parts / in repair / ready to return) -->
              <div id="followup-body">
                <div style="font-weight:700;font-size:0.88rem;margin-bottom:8px;">Repair / follow-up progress</div>
                <div class="form-group">
                  <label>Update status</label>
                  <select id="device-followup-status">
                    <option value="awaiting_parts">⏳ Awaiting Parts</option>
                    <option value="repair_progress">🔧 Repair in Progress</option>
                    <option value="ready_return">📦 Ready to Return</option>
                    <option value="returned">✅ Returned to Client</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Progress note</label>
                  <textarea id="device-followup-notes" rows="2" placeholder="Latest update on this device..."></textarea>
                  <div class="dt-chip-row">
                    ${['Waiting for part', 'In repair', 'Diagnosing issue', 'Ready for pickup'].map(t => `<button type="button" class="dt-chip" data-target="device-followup-notes" data-mode="append" data-fill="${t}">${t}</button>`).join('')}
                  </div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="save-device-followup">Add follow-up update</button>
                <div id="followup-history" style="margin-top:14px;"></div>
              </div>
              <small id="followup-disabled-hint" style="display:none;color:var(--text-dim);">Turn on device service above to log follow-up updates.</small>

              <div id="device-history" style="margin-top:18px;"><div style="text-align:center;color:var(--text-dim);font-size:0.82rem;padding:10px;">Loading device history…</div></div>
            </div>
          </div>
          ` : ''}

          <!-- TAB 3: BILL -->
          <div class="mst-pane" data-pane="bill">
            <div id="bill-locked-hint" style="display:${isResolving ? 'none' : 'block'}; padding:14px; border-radius:12px; background:var(--bg-soft); border:1px dashed var(--border); margin-bottom:14px; font-size:0.85rem; color:var(--text-soft);">
              ℹ️ Set status to <b>Resolved</b> on the Status tab to enable billing.
            </div>
            <div id="device-return-banner" style="display:none; padding:14px; border-radius:12px; background:rgba(245,158,11,0.08); border:1px solid var(--warning); margin-bottom:14px; font-size:0.85rem; color:var(--text);">
              <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;">
                <div>🔧 <b>Device still at service center.</b> Mark it returned to unlock billing.</div>
                <button type="button" class="btn btn-primary btn-sm" id="go-to-device-return">Return the device →</button>
              </div>
            </div>
            <div id="pricing-section" style="display:${isResolving ? 'block' : 'none'};">
              <label style="font-weight:700; margin-bottom:8px; display:block;">Diagnose Issue & Add Services</label>
              ${(pricing || []).length === 0 ? `
                <p style="font-size:0.8rem; color:var(--text-dim); padding:10px; background:var(--bg-soft); border-radius:10px;">No standard services defined by Admin.</p>
              ` : `
                <div class="svc-search-row">
                  <div class="svc-search-input-wrap">
                    <span class="svc-search-icon">${ICONS.search}</span>
                    <input type="search" id="svc-search" class="svc-search-input" placeholder="Search services (e.g. CCTV, network, door, camera…)" autocomplete="off"/>
                    <div id="svc-results" class="svc-results"></div>
                  </div>
                </div>
                <div id="svc-selected" style="display:none; margin-bottom:12px;"></div>
              `}

              <div class="form-group">
                <label>Additional Charges (Optional)</label>
                <input type="number" id="extra-cost" placeholder="₹0" value="${inquiryRow?.extra_cost || ''}" style="margin-bottom:8px;"/>
                <input type="text" id="extra-reason" placeholder="Reason for extra charge..." value="${escapeHtml(inquiryRow?.extra_cost_reason || '')}"/>
              </div>

              <div class="form-group">
                <label>Redeem Coupon</label>
                <div style="display:flex;gap:8px;align-items:stretch;">
                  <input type="text" id="coupon-code" placeholder="Enter coupon code (e.g. SAVE50)" value="${escapeHtml(inquiryRow?.coupon_code || '')}" style="flex:1 1 auto;min-width:0;text-transform:uppercase;letter-spacing:.04em;font-weight:700;"/>
                  <button type="button" class="btn btn-secondary btn-sm" id="coupon-apply" style="white-space:nowrap;flex:0 0 auto;">Apply</button>
                  <button type="button" class="btn btn-secondary btn-sm" id="coupon-clear" style="white-space:nowrap;flex:0 0 auto;display:none;">Remove</button>
                </div>
                <small id="coupon-msg" style="display:none;margin-top:6px;font-size:0.75rem;font-weight:600;"></small>
                <label style="margin-top:12px;">Employee Discount (optional)</label>
                <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:8px;">
                  <input type="number" id="manual-discount" min="0" step="1" placeholder="Extra discount Rs.0" value="${initialManualDiscount || ''}"/>
                  <input type="text" id="discount-reason" placeholder="Reason required for employee discount" value="${escapeHtml(inquiryRow?.discount_reason || '')}"/>
                </div>
                <small style="display:block;margin-top:6px;color:var(--text-dim);font-size:0.75rem;">Coupons apply automatically once validated. Any extra employee/manual discount requires a reason and appears in Discount Details.</small>
              </div>

              <div class="form-group">
                <label>Transport Distance (km)</label>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <input type="number" id="transport-km" min="0" step="0.1" placeholder="0" value="${inquiryRow?.transport_km || ''}" style="flex:1; min-width:120px;"/>
                  <button type="button" class="btn btn-secondary btn-sm" id="capture-loc" style="white-space:nowrap" title="Capture your precise GPS location right now (you should be at the customer site)">📍 Capture My Location</button>
                  <button type="button" class="btn btn-secondary btn-sm" id="auto-km" style="white-space:nowrap" title="Calculate km from your clock-in location to the precise location">🧮 Auto km</button>
                </div>
                <small id="transport-km-hint" style="display:block; margin-top:6px; color:var(--text-dim); font-size:0.75rem;">₹5 per km  ?  capture your precise location at the customer site, then click 🧮 Auto km.</small>
                <small id="bill-loc-status" style="display:none; margin-top:4px; color:var(--primary); font-size:0.75rem; font-weight:600;"></small>
              </div>

              <div class="bill-breakdown" id="bill-breakdown">
                <div id="br-service-lines"></div>
                <div class="bill-row" id="br-extra-row" style="display:none;"><span id="br-extra-label">Additional charges</span><b id="br-extra">₹0</b></div>
                <div class="bill-row"><span>Platform fee</span><b id="br-platform">₹50</b></div>
                <div class="bill-row"><span>Transport (<span id="br-km">0</span> km x ₹5)</span><b id="br-transport">₹0</b></div>
                <div class="bill-row"><span>GST (18%)</span><b id="br-gst">₹0</b></div>
                <div class="bill-row bill-row-discount" id="br-discount-row" style="display:none;"><span>Discount</span><b id="br-discount">-₹0</b></div>
                <div class="bill-row bill-row-total"><span>Final total</span><b id="br-total">₹0</b></div>
                <input type="hidden" id="total-bill-display" value="0"/>
              </div>

              <button type="button" class="btn btn-primary btn-wide" id="open-bill-modal" style="margin-bottom:14px;">${ICONS.receipt}<span>Generate &amp; Send Premium Bill</span></button>
              <div id="bill-pdf-actions" style="display:${inquiryRow?.bill_pdf_url ? 'block' : 'none'}; margin-bottom:14px; padding:14px; border-radius:14px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.35);">
                <div style="font-weight:800; color:var(--success); font-size:0.88rem; margin-bottom:8px;">Saved bill ready</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <a class="btn btn-secondary btn-sm" id="bill-pdf-view" href="${escapeAttr(inquiryRow?.bill_pdf_url || '#')}" target="_blank" rel="noopener" style="text-decoration:none;">${ICONS.receipt}<span>View PDF</span></a>
                  <button type="button" class="btn btn-primary btn-sm" id="bill-details-whatsapp">${ICONS.whatsapp}<span>Send via WhatsApp</span></button>
                </div>
              </div>

              <!-- Payment Method choice.
                   Cash is restricted for gig workers, not for every ticket that ever
                   touched the pool - is_gig_job is a durable "was released once" flag
                   that never clears, so gating on it here would also hide Cash for a
                   Fixed employee who ends up completing a job with pool history.
                   Gate on the assigned employee's current worker_type instead. -->
              <div class="form-group" style="margin-bottom:14px;">
                <label>How will the client pay?</label>
                <div class="pay-method-toggle" id="pay-method-toggle">
                  <button type="button" class="pay-method-btn active" data-method="online">${ICONS.card}<span>Online (Razorpay)</span></button>
                  ${empProfile?.worker_type === 'gig' ? '' : `<button type="button" class="pay-method-btn" data-method="cash">${ICONS.rupee}<span>Cash on Service</span></button>`}
                </div>
                ${empProfile?.worker_type === 'gig' ? '<small style="display:block;margin-top:6px;color:var(--text-dim);font-size:0.78rem;">Gig workers are online payment only - cash is not permitted.</small>' : ''}
              </div>

              <!-- Cash collection section (hidden until method=cash) -->
              <div id="cash-section" style="display:none; padding:14px; background:rgba(245,158,11,0.06); border-radius:14px; border:1px solid var(--warning); margin-bottom:14px;">
                <div style="font-weight:700; font-size:0.9rem; color:var(--text); margin-bottom:8px;">Cash Collection</div>
                <div style="font-size:0.82rem; color:var(--text-soft); margin-bottom:12px;">
                  Mark this once you have <b>physically received</b> the cash from the client. The amount will appear in your <b>My Cash</b> tab as <i>pending submission</i> until you hand it to admin.
                </div>
                <button type="button" class="btn btn-primary btn-wide" id="mark-cash-btn" style="background:var(--warning); box-shadow:0 8px 24px rgba(245,158,11,0.32);">
                  Mark Cash Collected - <span id="cash-amount-display">₹0</span>
                </button>
                <div id="cash-collected-banner" style="display:none; margin-top:10px; padding:10px 12px; border-radius:10px; background:rgba(16,185,129,0.08); border:1px solid var(--success); font-size:0.85rem; color:var(--success); font-weight:700;">
                  Cash collected - appears in your My Cash tab.
                </div>
              </div>

              <!-- Payment Link + QR -->
              <div style="padding:14px; background:var(--bg-soft); border-radius:14px; border:1px solid var(--border);">
                <div class="icon-text-label" style="font-weight:700; font-size:0.85rem; margin-bottom:10px; color:var(--text)">${ICONS.card}<span>Payment Link & QR</span></div>
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                  <input id="emp-pay-link" type="url" placeholder="Payment link will appear here..." style="flex:1 1 auto; min-width:0; font-size:0.82rem;" readonly/>
                  <button class="btn btn-secondary btn-sm" id="emp-gen-link" style="white-space:nowrap; flex:0 0 auto;">${ICONS.link}<span>Generate</span></button>
                </div>
                <div id="emp-qr-wrap" style="display:none; text-align:center; margin-bottom:10px;">
                  <img id="emp-qr-img" src="" alt="QR Code" style="width:160px; height:160px; border-radius:12px; border:2px solid var(--primary);"/>
                  <div style="font-size:0.75rem; color:var(--text-dim); margin-top:6px;">Client can scan to pay</div>
                </div>
                <button class="btn btn-primary btn-sm" id="emp-share-wa" style="width:100%; display:none; gap:8px; justify-content:center;">
                  ${ICONS.whatsapp}<span>Share via WhatsApp</span>
                </button>

                <div id="emp-pay-status" style="margin-top:12px; padding:12px; border-radius:12px; background:var(--bg); border:2px solid var(--border); display:flex; align-items:center; gap:10px;">
                  <div id="emp-pay-status-icon" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; color:var(--text-dim);">${ICONS.clock}</div>
                  <div style="flex:1">
                    <div id="emp-pay-status-title" style="font-weight:800; font-size:0.9rem; color:var(--text)">Payment: Unpaid</div>
                    <div id="emp-pay-status-sub" style="font-size:0.75rem; color:var(--text-dim);">Generate a link, then wait for the client to pay.</div>
                  </div>
                  <button class="btn btn-secondary btn-sm" id="emp-pay-check" title="Re-check payment" style="white-space:nowrap">↻</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cm2">Cancel</button>
          <button class="btn btn-primary" id="save-update">Save Changes</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    // Wire close/cancel + backdrop EARLY so they always work even if a later
    // part of setup throws. (The full handler below adds polling/channel cleanup.)
    const _earlyClose = () => overlay.remove();
    overlay.querySelector('#cm')?.addEventListener('click', _earlyClose);
    overlay.querySelector('#cm2')?.addEventListener('click', _earlyClose);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) _earlyClose(); });
    if (inquiryRow?.employee_update_detail) {
      const updateBox = document.createElement('div');
      updateBox.style.cssText = 'padding:12px;border-radius:12px;background:var(--bg-soft);border:1px solid var(--border);margin:12px 0;';
      updateBox.innerHTML = `<div class="sr-meta-label">Last submitted detail</div><div class="sr-meta-value" style="white-space:pre-wrap;line-height:1.45;">${escapeHtml(inquiryRow.employee_update_detail)}</div><small style="color:var(--text-dim)">Status: ${statusText(inquiryRow.employee_update_status || inquiryRow.status)}${inquiryRow.employee_update_at ? ` - ${formatDateTime(inquiryRow.employee_update_at)}` : ''}</small>`;
      overlay.querySelector('[data-pane="status"]')?.appendChild(updateBox);
    }

    // ── Persist the "Work Details" draft so going back / closing the modal /
    // switching tabs never loses what the employee typed. The text is restored
    // when the modal reopens and cleared only after a successful save.
    const _draftKey = 'svc-progress-draft:' + (inqId || taskId || '');
    const _progressEl = overlay.querySelector('#progress-detail');
    const _statusEl = overlay.querySelector('#new-status');
    if (_progressEl) {
      let _savedDraft = '';
      try { _savedDraft = sessionStorage.getItem(_draftKey) || ''; } catch (_) {}
      // Prefer an unsaved draft; otherwise fall back to the last detail that was
      // actually submitted, so the employee can edit instead of retyping.
      _progressEl.value = _savedDraft || inquiryRow?.employee_update_detail || '';
      const _saveDraft = () => { try { sessionStorage.setItem(_draftKey, _progressEl.value); } catch (_) {} };
      _progressEl.addEventListener('input', _saveDraft);
      if (_statusEl) _statusEl.addEventListener('change', _saveDraft);
    }

    // Tab switcher - also drives the footer button label (Next → on intermediate tabs, Save on the last).
    const TAB_ORDER = ['status', 'device', 'bill'];
    const getActiveTab = () => overlay.querySelector('.mst-tab.active')?.dataset.tab || TAB_ORDER[0];
    const isLastTab = () => getActiveTab() === TAB_ORDER[TAB_ORDER.length - 1];
    const goToTab = (target) => {
      overlay.querySelectorAll('.mst-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === target));
      overlay.querySelectorAll('.mst-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === target));
      renderPayStatus();
    };
    overlay.querySelectorAll('.mst-tab').forEach(tabBtn => {
      tabBtn.onclick = () => goToTab(tabBtn.dataset.tab);
    });
    // Quick-fill chips (device type / pickup condition / return notes / follow-up
    // notes) - "replace" swaps the field's value outright (device type), "append"
    // adds onto whatever's already typed so multiple chips can stack.
    overlay.querySelectorAll('.dt-chip').forEach(chip => {
      chip.onclick = () => {
        const field = overlay.querySelector(`#${chip.dataset.target}`);
        if (!field) return;
        const text = chip.dataset.fill || '';
        if (chip.dataset.mode === 'append') {
          const cur = field.value.trim();
          field.value = cur ? `${cur}, ${text}` : text;
        } else {
          field.value = text;
        }
        field.dispatchEvent(new Event('input', { bubbles: true }));
        chip.classList.add('dt-chip-used');
        setTimeout(() => chip.classList.remove('dt-chip-used'), 250);
      };
    });
    const goToDeviceReturnBtn = overlay.querySelector('#go-to-device-return');
    if (goToDeviceReturnBtn) goToDeviceReturnBtn.onclick = () => {
      goToTab('status');
      const returnBtn = overlay.querySelector('#save-device-return');
      const target = returnBtn?.closest('.form-group') || returnBtn;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target) {
        target.style.transition = 'box-shadow .3s ease';
        target.style.boxShadow = '0 0 0 3px var(--warning)';
        setTimeout(() => { target.style.boxShadow = ''; }, 1600);
      }
    };

    // Device Service is no longer its own tab — its toggle lives in the STATUS
    // tab and, when turned on, expands to show the device serial + taken/return
    // photos + follow-up updates.
    (() => {
      const servicePane = overlay.querySelector('[data-pane="service"]');
      const statusPane = overlay.querySelector('[data-pane="status"]');
      if (!servicePane || !statusPane) return;
      servicePane.classList.remove('mst-pane');
      servicePane.removeAttribute('data-pane');
      servicePane.style.display = 'block';
      // Pull the serial number into the expanded device section (with the photos).
      const serialGroup = overlay.querySelector('#device-serial')?.closest('.form-group');
      const body = servicePane.querySelector('#device-service-body');
      if (serialGroup && body) body.insertBefore(serialGroup, body.firstChild);
      const hr = document.createElement('hr');
      hr.style.cssText = 'border:none;border-top:1px solid var(--border);margin:18px 0 14px;';
      statusPane.appendChild(hr);
      statusPane.appendChild(servicePane);
    })();

    const statusSel = overlay.querySelector('#new-status');
    const pricingSec = overlay.querySelector('#pricing-section');
    const totalDisplay = overlay.querySelector('#total-bill-display');
    const extraInput = overlay.querySelector('#extra-cost');
    const extraReasonInput = overlay.querySelector('#extra-reason');
    const couponCodeInput = overlay.querySelector('#coupon-code');
    const couponApplyBtn = overlay.querySelector('#coupon-apply');
    const couponClearBtn = overlay.querySelector('#coupon-clear');
    const couponMsg = overlay.querySelector('#coupon-msg');
    const manualDiscountInput = overlay.querySelector('#manual-discount');
    const discountReasonInput = overlay.querySelector('#discount-reason');
    const kmInput = overlay.querySelector('#transport-km');
    const saveBtn = overlay.querySelector('#save-update');

    // Bill constants
    const TRANSPORT_PER_KM = 5;
    // Roads aren't straight lines — multiply the straight-line (haversine) distance
    // by this factor to approximate real driving distance for the transport fee.
    const ROAD_FACTOR = 1.3;
    const GST_RATE = 0.18;
    const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

    const getSelectedCompany = () => {
      const selectEl = overlay.querySelector('#resolve-company');
      const customEl = overlay.querySelector('#resolve-company-custom');
      if (!selectEl) return '';
      if (selectEl.value === 'Other') {
        return customEl?.value.trim() || '';
      }
      return selectEl.value;
    };

    const getPlatformFee = () => {
      const companyName = getSelectedCompany();
      const isNetworkingExperts = companyName.toLowerCase().replace(/\s+/g, ' ') === 'networking experts';
      return isNetworkingExperts ? 50 : 100;
    };

    const ensureCompanyExists = async (companyName) => {
      if (!companyName) return;
      const nameClean = companyName.trim();
      if (nameClean.toLowerCase() === 'networking experts') return;
      
      const existsLocal = companyList.some(c => c.name.toLowerCase() === nameClean.toLowerCase());
      if (existsLocal) return;
      
      const { data: dbComp } = await supabase.from('companies').select('name').eq('name', nameClean).maybeSingle();
      if (dbComp) return;
      
      const { error } = await supabase.from('companies').insert({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
        name: nameClean
      });
      if (!error) {
        companyList.push({ name: nameClean });
      }
    };

    // Live breakdown - also stored on a closure object so the bill modal can read it.
    const bill = {
      servicesSubtotal: 0, extra: 0, platform: getPlatformFee(),
      km: 0, transport: 0, couponDiscount: 0, couponCode: '', couponLabel: '', manualDiscount: 0,
      discount: 0, discountLabel: '', discountReason: '', discountPresetId: null,
      taxable: 0, gst: 0, total: 0,
    };
    let billPdfUrl = inquiryRow?.bill_pdf_url || '';
    let _payLink = inquiryRow?.payment_link || '';

    const updateBillPdfActions = () => {
      const box = overlay.querySelector('#bill-pdf-actions');
      const view = overlay.querySelector('#bill-pdf-view');
      if (!box) return;
      box.style.display = billPdfUrl ? 'block' : 'none';
      if (billPdfUrl && view) view.href = billPdfUrl;
    };

    const buildCurrentBillData = (customer = inquiryRow || {}) => {
      const services = selectedServices.length
        ? selectedServices.map(s => ({ name: `${s.main}${s.sub ? ' > '+s.sub : ''} > ${s.leaf}`, cost: s.cost }))
        : (bill.servicesSubtotal > 0 ? [{ name: customer.service_item || 'Service', cost: bill.servicesSubtotal }] : []);

      return {
        ...bill,
        customer: {
          name: customer.full_name || '',
          phone: customer.phone || '',
          location: customer.location || '',
          company: getSelectedCompany() || customer.company_name || '',
          device_type: overlay.querySelector('#device-type')?.value.trim() || customer.device_type || '',
          device_serial: overlay.querySelector('#device-serial')?.value.trim() || customer.device_serial_no || '',
          service_item: customer.service_item || '',
          ticket_no: customer.ticket_no || '',
        },
        technician: empProfile?.full_name || 'Technician',
        services,
        extraReason: overlay.querySelector('#extra-reason')?.value.trim() || '',
        discountLabel: bill.discountLabel,
        discountReason: bill.manualDiscount > 0 ? bill.discountReason : '',
        paymentLink: _payLink || customer.payment_link || '',
        paymentStatus: customer.payment_status || 'unpaid',
      };
    };

    const calcTotal = () => {
      bill.servicesSubtotal = billServicesSubtotal();
      bill.extra = Number(extraInput.value) || 0;
      bill.km = Math.max(0, Number(kmInput.value) || 0);
      bill.transport = Math.round(bill.km * TRANSPORT_PER_KM);
      bill.platform = getPlatformFee();
      const base = bill.servicesSubtotal + bill.extra + bill.platform + bill.transport;
      bill.taxable = base;
      // GST is charged on the full base, then the coupon/discount comes off the
      // GRAND total (services + platform + transport + GST), per business rule.
      bill.gst = Math.round(base * GST_RATE);
      const grossTotal = base + bill.gst;
      const couponDiscount = Math.min(bill.couponDiscount || 0, grossTotal);
      bill.manualDiscount = Math.max(0, Number(manualDiscountInput?.value) || 0);
      bill.discount = Math.min(grossTotal, couponDiscount + bill.manualDiscount);
      const labels = [];
      if (couponDiscount > 0) labels.push(bill.couponLabel || (bill.couponCode ? `Coupon ${bill.couponCode}` : 'Coupon'));
      if (bill.manualDiscount > 0) labels.push('Employee discount');
      bill.discountLabel = labels.join(' + ') || '';
      bill.discountReason = discountReasonInput?.value.trim() || '';
      bill.total = grossTotal - bill.discount;

      const serviceLines = overlay.querySelector('#br-service-lines');
      if (serviceLines) {
        const serviceRows = selectedServices.length
          ? selectedServices.map(s => ({
              label: `${s.main}${s.sub ? ' > ' + s.sub : ''} > ${s.leaf}`,
              cost: Number(s.cost) || 0,
            }))
          : (bill.servicesSubtotal > 0
              ? [{ label: inquiryRow?.service_item || 'Service', cost: bill.servicesSubtotal }]
              : []);
        serviceLines.innerHTML = serviceRows.length
          ? serviceRows.map(s => `
              <div class="bill-row">
                <span>${escapeHtml(s.label)}</span>
                <b>${inr(s.cost)}</b>
              </div>
            `).join('')
          : `<div class="bill-row"><span>No service added</span><b>${inr(0)}</b></div>`;
      }
      const extraRow = overlay.querySelector('#br-extra-row');
      const extraLabel = overlay.querySelector('#br-extra-label');
      if (extraRow) extraRow.style.display = bill.extra > 0 ? 'flex' : 'none';
      if (extraLabel) {
        const reason = extraReasonInput?.value.trim();
        extraLabel.textContent = reason ? `Additional charges (${reason})` : 'Additional charges';
      }
      overlay.querySelector('#br-extra').textContent = inr(bill.extra);
      overlay.querySelector('#br-platform').textContent = inr(bill.platform);
      overlay.querySelector('#br-km').textContent = bill.km.toString();
      overlay.querySelector('#br-transport').textContent = inr(bill.transport);
      const discRow = overlay.querySelector('#br-discount-row');
      discRow.style.display = bill.discount > 0 ? 'flex' : 'none';
      discRow.querySelector('span').textContent = bill.discountLabel || 'Discount';
      overlay.querySelector('#br-discount').textContent = `-${inr(bill.discount)}`;
      overlay.querySelector('#br-gst').textContent = inr(bill.gst);
      overlay.querySelector('#br-total').textContent = inr(bill.total);
      totalDisplay.value = String(bill.total);
      const cashDisplay = overlay.querySelector('#cash-amount-display');
      if (cashDisplay) cashDisplay.textContent = inr(bill.total);
    };

    const validateDiscount = () => {
      calcTotal();
      if (bill.manualDiscount > 0 && !bill.discountReason) {
        toast('Please enter reason for employee discount', 'warning');
        return false;
      }
      return true;
    };

    // Haversine distance in km between two lat/lng pairs.
    const haversineKm = (lat1, lng1, lat2, lng2) => {
      const toRad = (d) => d * Math.PI / 180;
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    // Precise location captured at bill time (employee is at the customer site).
    // Takes priority over inquiryRow.customer_lat/lng for the transport calc.
    const billLoc = { lat: null, lng: null, accuracy: null };

    const autoKmBtn = overlay.querySelector('#auto-km');
    const captureBtn = overlay.querySelector('#capture-loc');
    const kmHint = overlay.querySelector('#transport-km-hint');
    const locStatus = overlay.querySelector('#bill-loc-status');

    const refreshAutoKmHint = () => {
      const eLat = employeeCoords.lat, eLng = employeeCoords.lng;
      const hasBill = billLoc.lat != null;
      const hasCust = inquiryRow?.customer_lat != null && inquiryRow?.customer_lng != null;
      if (eLat == null || eLng == null) {
        kmHint.textContent = '₹5 per km  ?  enter manually (no clock-in GPS on record for today).';
        autoKmBtn.disabled = true; autoKmBtn.style.opacity = '0.5';
        return;
      }
      if (!hasBill && !hasCust) {
        kmHint.textContent = '₹5 per km  ?  capture your precise location at the customer site to enable Auto km.';
        autoKmBtn.disabled = true; autoKmBtn.style.opacity = '0.5';
        return;
      }
      autoKmBtn.disabled = false; autoKmBtn.style.opacity = '1';
      kmHint.textContent = hasBill
        ? 'Start point: your clock-in location (fixed for today) → on-site capture. ₹5/km, auto-filled.'
        : 'Start point: your clock-in location (fixed for today) → customer GPS. ₹5/km, auto-filled. Capture on-site for best accuracy.';
    };
    refreshAutoKmHint();

    captureBtn.onclick = async () => {
      captureBtn.disabled = true;
      const originalText = captureBtn.textContent;
      captureBtn.innerHTML = '<span class="srf-spin"></span> Locating...';
      try {
        const pos = await getHighAccuracyPosition();
        const { latitude, longitude, accuracy } = pos.coords;
        billLoc.lat = latitude;
        billLoc.lng = longitude;
        billLoc.accuracy = accuracy;
        locStatus.style.display = 'block';
        locStatus.textContent = `📍 Captured: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`;
        toast(`Precise location captured (±${Math.round(accuracy)}m)`, 'success');
        refreshAutoKmHint();
      } catch (err) {
        toast('Could not capture location - check GPS permission', 'error');
        console.error('Capture location failed:', err);
      } finally {
        captureBtn.disabled = false;
        captureBtn.textContent = originalText;
      }
    };

    // Distance for the transport fee always starts from the employee's CLOCK-IN
    // location (fixed for the whole day) → the customer's location. Road factor
    // approximates real driving distance.
    const applyAutoKm = ({ silent } = {}) => {
      const eLat = employeeCoords.lat, eLng = employeeCoords.lng;
      if (eLat == null || eLng == null) return false;
      // Prefer captured bill-time precise location; fall back to customer's submitted coords.
      let dLat, dLng, source;
      if (billLoc.lat != null && billLoc.lng != null) {
        dLat = billLoc.lat; dLng = billLoc.lng; source = 'on-site capture';
      } else if (inquiryRow?.customer_lat != null && inquiryRow?.customer_lng != null) {
        dLat = inquiryRow.customer_lat; dLng = inquiryRow.customer_lng; source = 'customer GPS';
      } else {
        return false;
      }
      const km = haversineKm(Number(eLat), Number(eLng), Number(dLat), Number(dLng)) * ROAD_FACTOR;
      kmInput.value = km.toFixed(1);
      // `renderPayStatus` is defined later in setup — skip it on the silent
      // auto-fill (the initial paint calls it) to avoid a temporal-dead-zone throw.
      calcTotal();
      if (!silent) renderPayStatus();
      if (!silent) toast(`Distance: ${km.toFixed(1)} km (clock-in location → ${source})`, 'success');
      return true;
    };
    autoKmBtn.onclick = () => applyAutoKm({ silent: false });
    // Auto-fill the distance when the bill opens, using the locked clock-in origin
    // → the customer's location, so it's never forgotten or mis-measured.
    if (!kmInput.value || Number(kmInput.value) === 0) applyAutoKm({ silent: true });

    kmInput.oninput = () => { calcTotal(); renderPayStatus(); };
    const progressDetailInput = overlay.querySelector('#progress-detail');
    if (progressDetailInput) {
      progressDetailInput.oninput = () => { renderPayStatus(); };
    }
    const companySelect = overlay.querySelector('#resolve-company');
    const companyCustom = overlay.querySelector('#resolve-company-custom');

    const toggleCustomCompany = () => {
      if (companySelect.value === 'Other') {
        companyCustom.style.display = 'block';
      } else {
        companyCustom.style.display = 'none';
        companyCustom.value = '';
      }
      calcTotal();
      renderPayStatus();
    };

    if (companySelect) {
      companySelect.onchange = toggleCustomCompany;
      
      // Initialize state: if the current company name is not in the list, set to 'Other' and prefill custom field
      const initialCompany = inquiryRow?.company_name || 'networking experts';
      const isInList = companyList.some(c => c.name.toLowerCase() === initialCompany.toLowerCase());
      if (isInList) {
        companySelect.value = companyList.find(c => c.name.toLowerCase() === initialCompany.toLowerCase())?.name || initialCompany;
        companyCustom.style.display = 'none';
        companyCustom.value = '';
      } else {
        companySelect.value = 'Other';
        companyCustom.style.display = 'block';
        companyCustom.value = initialCompany;
      }
    }
    if (companyCustom) {
      companyCustom.oninput = () => { calcTotal(); renderPayStatus(); };
    }

    // ── Keyword search picker ────────────────────────────────────────────
    const svcSelectedBox = overlay.querySelector('#svc-selected');
    const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

    const renderSelectedList = () => {
      if (!svcSelectedBox) return;
      if (selectedServices.length === 0) { svcSelectedBox.style.display = 'none'; svcSelectedBox.innerHTML = ''; return; }
      svcSelectedBox.style.display = 'block';
      svcSelectedBox.innerHTML = `
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-dim); margin-bottom:6px;">Services performed (${selectedServices.length})</div>
        ${selectedServices.map((s, i) => `
          <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--bg); border:1px solid var(--border); border-radius:10px; margin-bottom:6px;">
            <div style="flex:1; font-size:0.85rem;">
              <b>${escHtml(s.main)}</b>${s.sub ? ` › ${escHtml(s.sub)}` : ''} › ${escHtml(s.leaf)}
            </div>
            <span style="font-weight:700; color:var(--primary);">₹${Number(s.cost).toLocaleString('en-IN')}</span>
            <button type="button" class="btn btn-danger btn-sm svc-remove" data-idx="${i}" title="Remove" ${isResolvedReadOnly ? 'style="display:none;" disabled' : ''}>✕</button>
          </div>
        `).join('')}
      `;
      svcSelectedBox.querySelectorAll('.svc-remove').forEach(btn => {
        btn.onclick = () => {
          selectedServices.splice(Number(btn.dataset.idx), 1);
          renderSelectedList(); calcTotal(); renderPayStatus();
        };
      });
    };

    // Build flat search index from pricing rows
    const flatPricing = (pricing || []).map(p => ({
      id: p.id,
      main: p.category || 'Uncategorized',
      sub: (p.sub_category || '').trim(),
      leaf: p.sub_sub_category || p.name || '',
      cost: Number(p.cost) || 0,
      _s: [p.category, p.sub_category, p.sub_sub_category, p.name].filter(Boolean).join(' ').toLowerCase()
    })).filter(p => p.leaf);

    const svcSearchInput = overlay.querySelector('#svc-search');
    const svcResultsBox = overlay.querySelector('#svc-results');

    const closeSvcResults = () => { if (svcResultsBox) { svcResultsBox.innerHTML = ''; svcResultsBox.style.display = 'none'; } };
    const addSvcItem = (p) => {
      if (selectedServices.some(s => s.id === p.id)) { toast('Already added', 'warning'); return; }
      selectedServices.push({ id: p.id, main: p.main, sub: p.sub, leaf: p.leaf, cost: p.cost });
      renderSelectedList(); calcTotal(); renderPayStatus();
      if (svcSearchInput) svcSearchInput.value = '';
      closeSvcResults();
    };

    // Finds services against category / sub-category / leaf name. Strict
    // AND-match first (every typed word must appear); if that yields nothing,
    // falls back to a looser ANY-word match so near-misses still surface
    // instead of showing "no results" for services that do exist.
    const findSvcMatches = (q) => {
      if (!q) return flatPricing;
      const words = q.split(/\s+/).filter(Boolean);
      const strict = flatPricing.filter(p => words.every(w => p._s.includes(w)));
      if (strict.length) return strict;
      return flatPricing.filter(p => words.some(w => p._s.includes(w)));
    };

    const renderSvcResults = (q) => {
      const matches = findSvcMatches(q);
      if (matches.length === 0) {
        svcResultsBox.innerHTML = `<div class="svc-result-empty">No services match "<b>${escHtml(q)}</b>"</div>`;
        svcResultsBox.style.display = 'block'; return;
      }
      const shown = matches.slice(0, 60);
      svcResultsBox.innerHTML = shown.map((p, i) => `
        <div class="svc-result-item" data-idx="${i}">
          <div class="svc-result-name">${escHtml(p.main)}${p.sub ? ` <span class="svc-result-sep">›</span> ${escHtml(p.sub)}` : ''} <span class="svc-result-sep">›</span> <b>${escHtml(p.leaf)}</b></div>
          <span class="svc-result-price">₹${p.cost.toLocaleString('en-IN')}</span>
        </div>`).join('') + (matches.length > shown.length ? `<div class="svc-result-empty">+${matches.length - shown.length} more — keep typing to narrow down</div>` : '');
      svcResultsBox.style.display = 'block';
      svcResultsBox.querySelectorAll('.svc-result-item').forEach((el, i) => {
        el.addEventListener('mousedown', (e) => { e.preventDefault(); addSvcItem(shown[i]); });
      });
    };

    if (svcSearchInput) {
      svcSearchInput.addEventListener('input', () => {
        renderSvcResults(svcSearchInput.value.trim().toLowerCase());
      });
      svcSearchInput.addEventListener('blur', () => setTimeout(closeSvcResults, 180));
      // Focusing an empty box now browses the full service list instead of
      // staying blank — the employee can scroll it rather than having to
      // already know the exact service name to search for.
      svcSearchInput.addEventListener('focus', () => renderSvcResults(svcSearchInput.value.trim().toLowerCase()));
    }

    // --- Live payment status panel + Save-button gating ---
    const payStatusBox = overlay.querySelector('#emp-pay-status');
    const payStatusIcon = overlay.querySelector('#emp-pay-status-icon');
    const payStatusTitle = overlay.querySelector('#emp-pay-status-title');
    const payStatusSub = overlay.querySelector('#emp-pay-status-sub');
    let _hasLinkBeenGenerated = false;
    let _paymentJustReceived = false;

    const renderPayStatus = () => {
      const resolving = statusSel.value === 'resolved';
      const total = Number(totalDisplay.value) || 0;
      const requiresPayment = resolving && total > 0;
      const paid = paymentState.status === 'paid';

      const returnBanner = overlay.querySelector('#device-return-banner');
      if (returnBanner) returnBanner.style.display = (deviceTicketOn && !deviceReturned) ? 'block' : 'none';

      if (paid) {
        payStatusBox.style.borderColor = 'var(--success)';
        payStatusBox.style.background = 'rgba(16,185,129,0.08)';
        payStatusIcon.innerHTML = ICONS.check;
        payStatusIcon.style.color = 'var(--success)';
        payStatusTitle.textContent = '✓ Payment Received';
        payStatusTitle.style.color = 'var(--success)';
        payStatusSub.textContent = paymentState.received_at
          ? `Received at ${formatTime(paymentState.received_at)} - you can now submit.`
          : 'You can now submit the resolution.';
      } else if (_hasLinkBeenGenerated) {
        payStatusBox.style.borderColor = 'var(--warning)';
        payStatusBox.style.background = 'rgba(245,158,11,0.06)';
        payStatusIcon.innerHTML = ICONS.clock;
        payStatusIcon.style.color = 'var(--warning)';
        payStatusTitle.textContent = '⏳ Waiting for Payment';
        payStatusTitle.style.color = 'var(--warning)';
        payStatusSub.textContent = 'Auto-checking every 3s - Save unlocks the moment Razorpay confirms.';
      } else {
        payStatusBox.style.borderColor = 'var(--border)';
        payStatusBox.style.background = 'var(--bg)';
        payStatusIcon.innerHTML = ICONS.clock;
        payStatusIcon.style.color = 'var(--text-dim)';
        payStatusTitle.textContent = `Payment: ${paymentState.status === 'paid' ? 'Paid' : 'Unpaid'}`;
        payStatusTitle.style.color = 'var(--text)';
        payStatusSub.textContent = requiresPayment
          ? 'Generate a link, then wait for the client to pay before submitting.'
          : 'Generate a link, then wait for the client to pay.';
      }

      const progressDetail = overlay.querySelector('#progress-detail')?.value.trim() || '';
      const companyName = getSelectedCompany();
      
      const isStatusTabValid = progressDetail.length > 0;
      const isDeviceTabValid = companyName.length > 0;

      if (isResolvedReadOnly) {
        saveBtn.disabled = true;
        saveBtn.textContent = isLastTab() ? 'Resolved' : 'Next →';
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.title = 'Resolved tasks are read-only.';
      } else if (!resolving) {
        const foc = statusSel.value === 'foc';
        const resched = statusSel.value === 'reschedule';
        const focBillNo = overlay.querySelector('#foc-bill-no')?.value.trim() || '';
        const reschedAt = overlay.querySelector('#reschedule-at')?.value || '';
        // Reschedule only needs a date/time — no work details required.
        if (resched) {
          if (!reschedAt) {
            saveBtn.disabled = true; saveBtn.textContent = 'Pick a date & time';
            saveBtn.style.opacity = '0.6'; saveBtn.style.cursor = 'not-allowed';
            saveBtn.title = 'Choose the new visit date & time first.';
          } else {
            saveBtn.disabled = false; saveBtn.textContent = '📅 Save Schedule';
            saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer'; saveBtn.title = '';
          }
        }
        // If the task is not resolved, the employee can save immediately on the first tab
        else if (!isStatusTabValid) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Save Changes';
          saveBtn.style.opacity = '0.6';
          saveBtn.style.cursor = 'not-allowed';
          saveBtn.title = 'Please fill out the Work Details / Progress Update first.';
        } else if (foc && !focBillNo) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Enter client bill number';
          saveBtn.style.opacity = '0.6';
          saveBtn.style.cursor = 'not-allowed';
          saveBtn.title = 'FOC requires the client\'s bill number before you can complete the service.';
        } else if (foc && deviceTicketOn && !deviceReturned) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Return device first';
          saveBtn.style.opacity = '0.6';
          saveBtn.style.cursor = 'not-allowed';
          saveBtn.title = 'This ticket has a device in service. Mark the device as returned before closing the service.';
        } else {
          saveBtn.disabled = false;
          saveBtn.textContent = foc ? 'Complete (FOC)' : 'Save Changes';
          saveBtn.style.opacity = '1';
          saveBtn.style.cursor = 'pointer';
          saveBtn.title = '';
        }
      } else if (!isLastTab()) {
        const currentTab = getActiveTab();
        let tabValid = true;
        let missingFieldMsg = '';
        if (currentTab === 'status') {
          tabValid = isStatusTabValid;
          missingFieldMsg = 'Please fill out the Work Details / Progress Update first.';
        } else if (currentTab === 'device') {
          tabValid = isDeviceTabValid;
          missingFieldMsg = 'Please fill out the Company Name first.';
        }
        
        if (!tabValid) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Next →';
          saveBtn.style.opacity = '0.6';
          saveBtn.style.cursor = 'not-allowed';
          saveBtn.title = missingFieldMsg;
        } else {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Next →';
          saveBtn.style.opacity = '1';
          saveBtn.style.cursor = 'pointer';
          saveBtn.title = '';
        }
      } else if (!isStatusTabValid || !isDeviceTabValid) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Save Changes';
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.title = 'Please fill out all mandatory fields in previous tabs (Status and Device Info).';
      } else if (deviceTicketOn && !deviceReturned) {
        // Can't complete the service while the customer's device is still at the
        // service center. The employee must mark it returned first.
        saveBtn.disabled = true;
        saveBtn.textContent = 'Return device first';
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.title = 'This ticket has a device in service. Mark the device as returned (Device Service tab) before completing the service.';
      } else if (requiresPayment && !paid) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Awaiting Payment...';
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.title = 'Payment must be detected automatically, or marked paid by admin, before you can submit a resolution.';
      } else {
        saveBtn.disabled = false;
        saveBtn.textContent = _paymentJustReceived ? '💰 Save & Resolve' : 'Save Changes';
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
        saveBtn.title = '';
      }
    };

    statusSel.onchange = () => {
      const resolving = statusSel.value === 'resolved';
      pricingSec.style.display = resolving ? 'block' : 'none';
      const lockHint = overlay.querySelector('#bill-locked-hint');
      if (lockHint) lockHint.style.display = resolving ? 'none' : 'block';
      // FOC: no bill generated, but the client's bill number is mandatory.
      const focGroup = overlay.querySelector('#foc-billno-group');
      if (focGroup) focGroup.style.display = statusSel.value === 'foc' ? 'block' : 'none';
      // Reschedule: show the date/time picker.
      const reschedGroup = overlay.querySelector('#reschedule-group');
      if (reschedGroup) reschedGroup.style.display = statusSel.value === 'reschedule' ? 'block' : 'none';
      // Case Closed UX: warn it's final and relabel the mandatory note as a reason.
      const closing = statusSel.value === 'case_closed';
      const ccHint = overlay.querySelector('#case-closed-hint');
      if (ccHint) ccHint.style.display = closing ? 'block' : 'none';
      const pdLabel = overlay.querySelector('#progress-detail-label');
      if (pdLabel) pdLabel.innerHTML = closing
        ? 'Reason for closing (customer didn\'t cooperate / no fee) <span style="color:var(--danger)">*</span>'
        : 'Work Details / Progress Update <span style="color:var(--danger)">*</span>';
      renderPayStatus();
    };
    // Re-evaluate the save gate as the FOC bill number is typed.
    overlay.querySelector('#foc-bill-no')?.addEventListener('input', () => renderPayStatus());
    // Re-evaluate the save gate as the reschedule date/time is picked.
    overlay.querySelector('#reschedule-at')?.addEventListener('input', () => renderPayStatus());
    // Reopened tickets only offer Resolved/FOC and default to Resolved — sync the
    // pricing/FOC sections to match that default on open.
    if (Number(inquiryRow?.reopened) === 1) statusSel.onchange();

    // ---- Device Service tab wiring ----
    if (deviceFeatureOn && inqId) {
      const dToggle = overlay.querySelector('#device-service-toggle');
      const dBody = overlay.querySelector('#device-service-body');
      const dHistory = overlay.querySelector('#device-history');
      const fBody = overlay.querySelector('#followup-body');
      const fHint = overlay.querySelector('#followup-disabled-hint');
      const fHistory = overlay.querySelector('#followup-history');
      const empId = authUser?.id || null;

      const refreshDeviceHistory = async () => {
        const { data } = await getDeviceStatus(inqId);
        const taken = data?.device_taken_logs || null;
        const returned = data?.device_return_logs || null;
        const followups = data?.device_follow_up_logs || [];
        if (dHistory) dHistory.innerHTML = renderDeviceTrackingTab(inqId, taken, returned, followups);
        if (fHistory) fHistory.innerHTML = renderFollowUpTab(followups);
        deviceHasTakenLog = !!taken;
        // A device counts as returned once a real return log exists or the latest
        // follow-up / device status is "returned". Turning the toggle off no longer
        // counts as "returned" once a taken log exists — that would silently skip
        // the return record admin relies on. Re-evaluate the save gate.
        deviceReturned = (!deviceTicketOn && !deviceHasTakenLog) || !!returned
          || data?.inquiry?.follow_up_status === 'returned'
          || data?.inquiry?.device_status === 'returned'
          || (followups[0]?.status === 'returned');
        renderPayStatus();
      };

      if (dToggle) {
        dToggle.onchange = async () => {
          const on = dToggle.checked;
          // A device pickup is already logged - turning this off must not be usable
          // as a shortcut past the return step. Send them to "Mark returned" instead.
          if (!on && deviceHasTakenLog) {
            dToggle.checked = true;
            toast('A device pickup is already logged for this ticket. Use "Mark returned / sent back to client" below to close it out — turning this off won\'t skip that step.', 'warning');
            return;
          }
          try {
            await setTicketDeviceFlag(inqId, on);
            deviceTicketOn = on;
            if (dBody) dBody.style.display = on ? 'block' : 'none';
            if (fBody) fBody.style.display = on ? 'block' : 'none';
            if (fHint) fHint.style.display = on ? 'none' : 'block';
            toast(on ? 'Device marked for service center' : 'Device service turned off', 'success');
            if (on) { refreshDeviceHistory(); }
            else { deviceReturned = true; renderPayStatus(); }
          } catch (e) {
            dToggle.checked = !on;
            toast(e.message || 'Could not update', 'error');
          }
        };
      }

      const takenBtn = overlay.querySelector('#save-device-taken');
      if (takenBtn) takenBtn.onclick = async () => {
        const file = overlay.querySelector('#device-taken-image')?.files?.[0] || null;
        const desc = overlay.querySelector('#device-taken-desc')?.value.trim() || '';
        if (!file) return toast('Please add a photo of the device first', 'warning');
        takenBtn.disabled = true; takenBtn.textContent = 'Saving…';
        const { error } = await saveDeviceTaken(inqId, empId, file, desc);
        takenBtn.disabled = false; takenBtn.textContent = 'Save device taken';
        if (error) return toast(error.message || 'Could not save', 'error');
        toast('Device taken saved', 'success');
        refreshDeviceHistory();
      };

      const followBtn = overlay.querySelector('#save-device-followup');
      if (followBtn) followBtn.onclick = async () => {
        const status = overlay.querySelector('#device-followup-status')?.value;
        const notes = overlay.querySelector('#device-followup-notes')?.value.trim() || '';
        followBtn.disabled = true; followBtn.textContent = 'Saving…';
        const { error } = await saveFollowUpStatus(inqId, status, notes, empId);
        followBtn.disabled = false; followBtn.textContent = 'Add follow-up update';
        if (error) return toast(error.message || 'Could not save', 'error');
        const notesEl = overlay.querySelector('#device-followup-notes'); if (notesEl) notesEl.value = '';
        toast('Follow-up update added', 'success');
        refreshDeviceHistory();
      };

      const returnBtn = overlay.querySelector('#save-device-return');
      if (returnBtn) returnBtn.onclick = async () => {
        const file = overlay.querySelector('#device-return-image')?.files?.[0] || null;
        const condition = overlay.querySelector('#device-return-condition')?.value || 'good';
        const notes = overlay.querySelector('#device-return-notes')?.value.trim() || '';
        if (!file) return toast('Please add a photo of the returned device first', 'warning');
        returnBtn.disabled = true; returnBtn.textContent = 'Saving…';
        const { error } = await saveDeviceReturn(inqId, file, condition, notes);
        returnBtn.disabled = false; returnBtn.textContent = 'Mark returned / sent back to client';
        if (error) return toast(error.message || 'Could not save', 'error');
        toast('Device return recorded', 'success');
        refreshDeviceHistory();
      };

      if (deviceTicketOn) refreshDeviceHistory();
    }
    extraInput.oninput = () => { calcTotal(); renderPayStatus(); };
    if (extraReasonInput) extraReasonInput.oninput = () => { calcTotal(); renderPayStatus(); };
    if (manualDiscountInput) manualDiscountInput.oninput = () => { calcTotal(); renderPayStatus(); };
    if (discountReasonInput) discountReasonInput.oninput = () => { calcTotal(); renderPayStatus(); };

    // ── Coupon redeem ────────────────────────────────────────────────────────
    const setCouponMsg = (text, kind) => {
      if (!couponMsg) return;
      if (!text) { couponMsg.style.display = 'none'; return; }
      couponMsg.style.display = 'block';
      couponMsg.textContent = text;
      couponMsg.style.color = kind === 'error' ? 'var(--danger)' : 'var(--primary)';
    };
    const reflectCouponApplied = (applied) => {
      if (couponClearBtn) couponClearBtn.style.display = applied ? 'inline-flex' : 'none';
      if (couponApplyBtn) couponApplyBtn.style.display = applied ? 'none' : 'inline-flex';
      if (couponCodeInput) couponCodeInput.readOnly = applied;
    };
    const clearCoupon = () => {
      bill.couponDiscount = 0; bill.couponCode = ''; bill.couponLabel = '';
      if (couponCodeInput) couponCodeInput.value = '';
      setCouponMsg('', 'info');
      reflectCouponApplied(false);
      calcTotal(); renderPayStatus();
    };
    const applyCoupon = async ({ silent = false } = {}) => {
      const code = (couponCodeInput?.value || '').trim().toUpperCase();
      if (!code) { if (!silent) toast('Enter a coupon code', 'warning'); return false; }
      // The amount the coupon is measured against = pre-discount bill total.
      calcTotal();
      const amount = bill.taxable + bill.gst;
      if (couponApplyBtn) { couponApplyBtn.disabled = true; couponApplyBtn.textContent = '...'; }
      try {
        const token = localStorage.getItem('auth_token') || (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ code, amount }),
        });
        const data = await res.json();
        if (!res.ok || !data.valid) {
          if (!silent) { bill.couponDiscount = 0; bill.couponCode = ''; bill.couponLabel = ''; }
          setCouponMsg(data.error || 'Invalid coupon', 'error');
          reflectCouponApplied(false);
          calcTotal(); renderPayStatus();
          return false;
        }
        bill.couponDiscount = Number(data.discount) || 0;
        bill.couponCode = code;
        bill.couponLabel = data.label || `Coupon ${code}`;
        setCouponMsg(`Applied: −₹${Math.round(bill.couponDiscount).toLocaleString('en-IN')} (${bill.couponLabel})`, 'info');
        reflectCouponApplied(true);
        calcTotal(); renderPayStatus();
        return true;
      } catch (err) {
        setCouponMsg('Could not validate coupon — check your connection', 'error');
        return false;
      } finally {
        if (couponApplyBtn) { couponApplyBtn.disabled = false; couponApplyBtn.textContent = 'Apply'; }
      }
    };
    if (couponApplyBtn) couponApplyBtn.onclick = () => applyCoupon();
    if (couponClearBtn) couponClearBtn.onclick = clearCoupon;
    if (couponCodeInput) couponCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } });

    // Consume one use of the applied coupon (best-effort; server is idempotent
    // per inquiry so calling it from multiple save paths won't double-count).
    const redeemCouponIfAny = async () => {
      if (!bill.couponCode) return;
      try {
        const amount = bill.taxable + bill.gst;
        const token = localStorage.getItem('auth_token') || (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch('/api/coupons/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ code: bill.couponCode, amount, inquiry_id: inqId || null }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409) toast(data.error || 'Coupon usage limit reached', 'warning');
        }
      } catch (_) { /* best-effort — discount already reflected in the bill */ }
    };

    // Persist the added service line items so they survive the employee going
    // "back" and reopening (the saved amount alone can't be edited without them).
    const persistSelectedServices = async () => {
      if (!inqId) return;
      try {
        const { error: delErr } = await supabase.from('inquiry_services').delete().eq('inquiry_id', inqId);
        if (delErr) throw delErr;
        const ids = selectedServices.map(s => s.id).filter(Boolean);
        if (ids.length) {
          const { error: insErr } = await supabase.from('inquiry_services').insert(ids.map(sid => ({ inquiry_id: inqId, service_id: sid })));
          if (insErr) throw insErr;
        }
      } catch (err) {
        console.error('Failed to save bill line items:', err);
        toast('Could not save itemised services — admin may only see the subtotal for this bill. Please retry.', 'warning');
      }
    };

    // Re-apply a coupon that was saved on this inquiry, then back-fill the manual
    // remainder so the reopened bill reproduces the same total without double-counting.
    if (inquiryRow?.coupon_code && couponCodeInput) {
      (async () => {
        const ok = await applyCoupon({ silent: true });
        if (ok) {
          const stored = Number(inquiryRow.discount_amount) || 0;
          const remainder = Math.max(0, stored - bill.couponDiscount);
          if (manualDiscountInput) manualDiscountInput.value = remainder || '';
          calcTotal(); renderPayStatus();
        }
      })();
    }

    // Active auto-poller: asks the backend to verify Razorpay directly, then falls
    // back to the saved DB state if the gateway cannot be reached.
    // When payment lands (online or cash), auto-submit a completed RESOLVED bill
    // so the ticket closes itself and never stays open. No-op if the form isn't
    // valid yet (save button disabled) or the status isn't Resolved.
    let _autoSaving = false;
    const autoSaveOnPaid = () => {
      if (_autoSaving) return;
      if (statusSel.value !== 'resolved') return;
      goToTab('bill');
      renderPayStatus();
      setTimeout(() => {
        const btn = overlay.querySelector('#save-update');
        if (btn && !btn.disabled) { _autoSaving = true; btn.click(); }
      }, 300);
    };

    const refreshPaymentFromDb = async (showToastOnChange) => {
      if (!inqId) return;
      let data = null;
      try {
        const token = localStorage.getItem('auth_token') || (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch('/api/payments/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ inquiry_id: inqId })
        });
        if (res.ok) data = await res.json();
      } catch {}
      if (!data) {
        const snap = await supabase.from('inquiries').select('payment_status,payment_received_at').eq('id', inqId).single();
        data = snap.data;
      }
      if (!data) return;
      const wasPaid = paymentState.status === 'paid';
      paymentState = { status: data.payment_status || 'unpaid', received_at: data.payment_received_at || null };
      if (!wasPaid && paymentState.status === 'paid') {
        _paymentJustReceived = true;
        showNotification({ title: '💰 Payment Received', body: 'Saving the resolution…', type: 'payment', tag: `pay-${inqId}` });
        renderPayStatus();
        autoSaveOnPaid();
        return;
      } else if (showToastOnChange) {
        toast(paymentState.status === 'paid' ? 'Payment confirmed' : 'Still waiting for client to pay...', paymentState.status === 'paid' ? 'success' : 'info');
      }
      renderPayStatus();
    };

    // Manual re-check button (visible feedback for the employee).
    overlay.querySelector('#emp-pay-check').onclick = () => refreshPaymentFromDb(true);

    // Auto-poll every 3 seconds. Stops as soon as we see 'paid'.
    let pollTimer = null;
    const stopPolling = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
    const startPolling = () => {
      if (pollTimer || !inqId) return;
      pollTimer = setInterval(async () => {
        if (paymentState.status === 'paid') return stopPolling();
        await refreshPaymentFromDb(false);
      }, 3000);
    };
    if (paymentState.status !== 'paid') startPolling();

    // Live subscription: react instantly when Razorpay webhook fires.
    const channel = supabase.channel(`task-modal-${inqId || taskId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'inquiries',
        filter: inqId ? `id=eq.${inqId}` : '',
      }, (payload) => {
        const row = payload.new;
        if (!row) return;
        if (inqId && row.id !== inqId) return;
        const wasPaid = paymentState.status === 'paid';
        if (row.payment_status) paymentState.status = row.payment_status;
        if (row.payment_received_at) paymentState.received_at = row.payment_received_at;
        if (!wasPaid && paymentState.status === 'paid') {
          _paymentJustReceived = true;
          showNotification({
            title: '💰 Payment Received!',
            body: 'Client just paid — saving the resolution…',
            type: 'payment',
            tag: `pay-${inqId}`,
          });
          renderPayStatus();
          autoSaveOnPaid();
          return;
        }
        renderPayStatus();
      })
      .subscribe();

    // Initial paint.
    renderSelectedList();
    calcTotal();
    renderPayStatus();
    if (isResolvedReadOnly) {
      overlay.querySelector('#progress-detail').disabled = true;
      overlay.querySelectorAll(`
        #pricing-section input:not(#total-bill-display),
        #pricing-section select,
        #pricing-section textarea,
        #svc-add,
        #capture-loc,
        #auto-km,
        .pay-method-btn,
        #mark-cash-btn,
        #emp-gen-link,
        #emp-pay-check
      `).forEach(el => {
        el.disabled = true;
        el.style.opacity = '0.6';
        el.style.cursor = 'not-allowed';
      });
      overlay.querySelectorAll('.mst-pane[data-pane="device"] input, .mst-pane[data-pane="device"] select').forEach(el => {
        el.disabled = true;
        el.style.opacity = '0.6';
        el.style.cursor = 'not-allowed';
      });
    }

    // Payment link generation + QR
    const genBtn = overlay.querySelector('#emp-gen-link');
    const payLinkInput = overlay.querySelector('#emp-pay-link');
    const qrWrap = overlay.querySelector('#emp-qr-wrap');
    const qrImg = overlay.querySelector('#emp-qr-img');
    const shareWaBtn = overlay.querySelector('#emp-share-wa');

    const showQR = (url) => {
      _payLink = url;
      payLinkInput.value = url;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
      qrWrap.style.display = 'block';
      shareWaBtn.style.display = 'flex';
    };

    if (genBtn) {
      genBtn.onclick = async () => {
        const total = Number(totalDisplay.value) || 0;
        if (!total) { toast('Select services or enter a bill amount first', 'warning'); return; }
        if (!validateDiscount()) return;

        const { data: inqData } = await supabase.from('inquiries').select('full_name,phone,service_item,ticket_no').eq('id', inqId).single();
        if (!inqData) { toast('Could not load inquiry details', 'error'); return; }

        genBtn.disabled = true; genBtn.textContent = '...';
        try {
          const compVal = getSelectedCompany();
          await ensureCompanyExists(compVal);

          const token = localStorage.getItem('auth_token') || (await supabase.auth.getSession()).data.session?.access_token;
          const res = await fetch('/api/payments/create-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              amount: total,
              description: `Service: ${inqData.service_item}`,
              ticket_no: inqData.ticket_no,
              customer: { name: inqData.full_name, phone: inqData.phone }
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed');
          showQR(data.short_url);
          await redeemCouponIfAny();
          await persistSelectedServices();
          // Persist full bill breakdown so admin can render the same template.
          await supabase.from('inquiries').update({
            payment_link: data.short_url,
            payment_link_id: data.id || null,
            bill_amount: bill.servicesSubtotal + bill.extra,
            extra_cost: bill.extra,
            extra_cost_reason: overlay.querySelector('#extra-reason')?.value.trim() || null,
            transport_km: bill.km,
            transport_fee: bill.transport,
            platform_fee: bill.platform,
            discount_amount: bill.discount,
            discount_label: bill.discountLabel || null,
            discount_reason: bill.manualDiscount > 0 ? bill.discountReason : null,
            discount_preset_id: bill.discountPresetId || null,
            coupon_code: bill.couponCode || null,
            gst_amount: bill.gst,
            bill_total: bill.total,
            ...(inquiryRow?.is_gig_job ? { gig_payout_amount: Math.max(0, bill.total - bill.gst - bill.platform) } : {}),
            bill_generated_at: new Date().toISOString().slice(0,19).replace('T',' '),
            device_type: overlay.querySelector('#device-type')?.value.trim() || null,
            device_serial_no: overlay.querySelector('#device-serial')?.value.trim() || null,
            company_name: compVal || null,
            employee_bill_lat: billLoc.lat,
            employee_bill_lng: billLoc.lng,
          }).eq('id', inqId);
          _hasLinkBeenGenerated = true;
          renderPayStatus();
          toast('Payment link generated! Waiting for client to pay...', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          genBtn.disabled = false; genBtn.innerHTML = `${ICONS.link}<span>Generate</span>`;
        }
      };
    }

    // ── Premium Bill modal (PDF + WhatsApp share) ─────────────────────────
    const openBillBtn = overlay.querySelector('#open-bill-modal');
    if (openBillBtn) {
      openBillBtn.onclick = async () => {
        if (bill.total <= 0) { toast('Add services or charges first to generate a bill', 'warning'); return; }
        if (!validateDiscount()) return;

        const originalHTML = openBillBtn.innerHTML;
        openBillBtn.disabled = true;
        openBillBtn.innerHTML = '<span class="btn-spinner"></span><span>Saving PDF...</span>';

        try {
          const compVal = getSelectedCompany();
          await ensureCompanyExists(compVal);

          const { data: latestInq } = inqId
            ? await supabase.from('inquiries').select('*').eq('id', inqId).single()
            : { data: inquiryRow };
          const customer = latestInq || inquiryRow || {};
          const billData = buildCurrentBillData(customer);
          const pdfUrl = await shareBillToPublicLink(billData, { inquiryId: inqId || null });
          billPdfUrl = pdfUrl;

          if (inqId) {
            await redeemCouponIfAny();
            await persistSelectedServices();
            const updates = {
              bill_amount: bill.servicesSubtotal + bill.extra,
              extra_cost: bill.extra,
              extra_cost_reason: overlay.querySelector('#extra-reason')?.value.trim() || null,
              transport_km: bill.km,
              transport_fee: bill.transport,
              platform_fee: bill.platform,
              discount_amount: bill.discount,
              discount_label: bill.discountLabel || null,
              discount_reason: bill.manualDiscount > 0 ? bill.discountReason : null,
              discount_preset_id: bill.discountPresetId || null,
              coupon_code: bill.couponCode || null,
              gst_amount: bill.gst,
              bill_total: bill.total,
              ...(inquiryRow?.is_gig_job ? { gig_payout_amount: Math.max(0, bill.total - bill.gst - bill.platform) } : {}),
              bill_generated_at: new Date().toISOString().slice(0,19).replace('T',' '),
              bill_pdf_url: pdfUrl,
              device_type: billData.customer.device_type || null,
              device_serial_no: billData.customer.device_serial || null,
              company_name: compVal || null,
              employee_bill_lat: billLoc.lat,
              employee_bill_lng: billLoc.lng,
            };
            const { error } = await supabase.from('inquiries').update(updates).eq('id', inqId);
            if (error) throw new Error(error.message);
            inquiryRow = { ...(inquiryRow || {}), ...updates };
          }

          updateBillPdfActions();
          toast('Bill PDF saved. You can download or send it from this tab.', 'success');
          openPremiumBillModal(billData, {
            inquiryId: inqId || null,
            existingPdfUrl: pdfUrl,
            onSent: async (sentUrl) => {
              if (sentUrl) {
                billPdfUrl = sentUrl;
                updateBillPdfActions();
              }
            },
          });
        } catch (err) {
          console.error(err);
          toast(err.message || 'Could not save bill PDF', 'error');
        } finally {
          openBillBtn.disabled = false;
          openBillBtn.innerHTML = originalHTML;
        }
      };
    }



    const billDetailsWhatsappBtn = overlay.querySelector('#bill-details-whatsapp');
    if (billDetailsWhatsappBtn) {
      billDetailsWhatsappBtn.onclick = () => {
        const data = buildCurrentBillData(inquiryRow || {});
        const phone = (data.customer?.phone || '').replace(/\D/g, '');
        if (!phone) { toast('Client phone number is missing on this inquiry', 'error'); return; }
        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(billShortCaption(data, null))}`;
        window.open(waUrl, '_blank');
      };
    }
    updateBillPdfActions();

    if (shareWaBtn) {
      shareWaBtn.onclick = () => {
        if (_payLink) window.open(`https://wa.me/?text=${encodeURIComponent('Please use this link to pay for your service: ' + _payLink)}`, '_blank');
      };
    }

    // ── Payment method toggle (Online ↔ Cash) ─────────────────────────────
    const payMethodToggle = overlay.querySelector('#pay-method-toggle');
    const cashSection = overlay.querySelector('#cash-section');
    const payLinkSection = overlay.querySelector('#emp-pay-link')?.closest('div[style*="background:var(--bg-soft)"]');
    const cashAmountDisplay = overlay.querySelector('#cash-amount-display');
    const cashBanner = overlay.querySelector('#cash-collected-banner');
    const markCashBtn = overlay.querySelector('#mark-cash-btn');
    // Gig workers are online-only — force it regardless of any stale value.
    let payMethod = (empProfile?.worker_type !== 'gig' && inquiryRow?.payment_method === 'cash') ? 'cash' : 'online';

    const renderPayMethod = () => {
      payMethodToggle.querySelectorAll('.pay-method-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.method === payMethod);
      });
      cashSection.style.display = payMethod === 'cash' ? 'block' : 'none';
      if (payLinkSection) payLinkSection.style.display = payMethod === 'cash' ? 'none' : 'block';
      if (cashAmountDisplay) cashAmountDisplay.textContent = `₹${Math.round(bill.total).toLocaleString('en-IN')}`;
      // If cash was already marked paid, show the banner + disable button.
      const alreadyCash = inquiryRow?.payment_method === 'cash' && inquiryRow?.payment_status === 'paid';
      if (alreadyCash && cashBanner) {
        cashBanner.style.display = 'block';
        if (markCashBtn) { markCashBtn.disabled = true; markCashBtn.style.opacity = '0.55'; }
      }
    };
    payMethodToggle.querySelectorAll('.pay-method-btn').forEach(btn => {
      btn.onclick = () => { payMethod = btn.dataset.method; renderPayMethod(); };
    });
    renderPayMethod();

    // Mark Cash Collected - sets payment_status=paid + payment_method=cash +
    // cash_collected_at=NOW so it shows up in the employee's My Cash tab as
    // pending submission. Also persists the full bill breakdown.
    if (markCashBtn) {
      markCashBtn.onclick = async () => {
        if (!inqId) { toast('Cannot mark cash on a task without an inquiry record', 'error'); return; }
        if (bill.total <= 0) { toast('Add services or charges first', 'warning'); return; }
        if (!validateDiscount()) return;
        const compVal = getSelectedCompany();
        markCashBtn.disabled = true;
        const orig = markCashBtn.innerHTML;
        markCashBtn.innerHTML = '<span>Saving...</span>';
        try {
          await ensureCompanyExists(compVal);
          await redeemCouponIfAny();
          await persistSelectedServices();
          const nowIso = new Date().toISOString().slice(0,19).replace('T',' ');
          const updates = {
            payment_method: 'cash',
            payment_status: 'paid',
            payment_received_at: nowIso,
            cash_collected_at: nowIso,
            bill_amount: bill.servicesSubtotal + bill.extra,
            extra_cost: bill.extra,
            extra_cost_reason: overlay.querySelector('#extra-reason')?.value.trim() || null,
            transport_km: bill.km,
            transport_fee: bill.transport,
            platform_fee: bill.platform,
            discount_amount: bill.discount,
            discount_label: bill.discountLabel || null,
            discount_reason: bill.manualDiscount > 0 ? bill.discountReason : null,
            discount_preset_id: bill.discountPresetId || null,
            coupon_code: bill.couponCode || null,
            gst_amount: bill.gst,
            bill_total: bill.total,
            ...(inquiryRow?.is_gig_job ? { gig_payout_amount: Math.max(0, bill.total - bill.gst - bill.platform) } : {}),
            bill_generated_at: nowIso,
            device_type: overlay.querySelector('#device-type')?.value.trim() || null,
            device_serial_no: overlay.querySelector('#device-serial')?.value.trim() || null,
            company_name: compVal || null,
            employee_bill_lat: billLoc.lat,
            employee_bill_lng: billLoc.lng,
          };
          const { error } = await supabase.from('inquiries').update(updates).eq('id', inqId);
          if (error) throw new Error(error.message);
          // Refresh local payment state so the save button unlocks.
          paymentState = { status: 'paid', received_at: nowIso };
          inquiryRow = { ...(inquiryRow || {}), ...updates };
          _paymentJustReceived = true;
          renderPayStatus();
          renderPayMethod();
          toast('✓ Cash recorded — finalising the ticket…', 'success');
          autoSaveOnPaid();
        } catch (err) {
          toast(err.message || 'Could not mark cash', 'error');
          markCashBtn.disabled = false;
          markCashBtn.innerHTML = orig;
        }
      };
    }

    const closeOverlay = () => { stopPolling(); try { supabase.removeChannel(channel); } catch {} overlay.remove(); };
    const cmBtn = overlay.querySelector('#cm');
    if (cmBtn) cmBtn.onclick = closeOverlay;
    const cm2Btn = overlay.querySelector('#cm2');
    if (cm2Btn) cm2Btn.onclick = closeOverlay;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });
    overlay.querySelector('#save-update').onclick = async () => {
      const newStatus = statusSel.value;
      const resolving = newStatus === 'resolved';
      // Wizard mode: if resolving, on Status / Device Info tabs this button advances to the next tab instead of saving.
      // If NOT resolving, we can save and close immediately.
      if (resolving && !isLastTab()) {
        const idx = TAB_ORDER.indexOf(getActiveTab());
        goToTab(TAB_ORDER[idx + 1]);
        return;
      }
      if (isResolvedReadOnly) {
        toast('Resolved tasks are read-only', 'info');
        return;
      }
      const detail = overlay.querySelector('#progress-detail').value.trim();
      const companyName = getSelectedCompany();
      const foc = newStatus === 'foc';
      const focBillNo = overlay.querySelector('#foc-bill-no')?.value.trim() || '';
      const resched = newStatus === 'reschedule';
      const reschedAt = overlay.querySelector('#reschedule-at')?.value || '';
      // Reschedule keeps the ticket active (In Progress) with a new visit time.
      const savedStatus = resched ? 'in_progress' : newStatus;

      if (resched && !reschedAt) { toast('Pick the new visit date & time', 'warning'); return; }
      if (!resched && !detail) { toast('Please provide details of your work', 'warning'); return; }
      if (foc) {
        if (!focBillNo) { toast('Enter the client\'s bill number for this FOC service', 'warning'); return; }
        if (deviceTicketOn && !deviceReturned) { toast('Mark the device as returned before closing this service', 'warning'); return; }
      }
      if (resolving) {
        if (!companyName) { toast('Please provide the company name', 'warning'); return; }
        if (!validateDiscount()) return;
      }

      const btn = overlay.querySelector('#save-update');
      btn.disabled = true; btn.textContent = 'Saving...';

      try {
        if (resolving && companyName) {
          await ensureCompanyExists(companyName);
        }
      } catch (err) {
        console.error('Failed to ensure company:', err);
      }

      const selectedServiceIds = [];
      if (resolving) {
        selectedServices.forEach(s => { selectedServiceIds.push(s.id); });
      }

      const { data: { user } } = await supabase.auth.getUser();
      const ops = [];
      if (taskId) ops.push(supabase.from('tickets').update({ status: savedStatus }).eq('id', taskId));

      const inqUpdates = {
        status: savedStatus,
        employee_update_detail: detail,
        employee_update_status: newStatus,
        employee_update_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };
      const deviceType = overlay.querySelector('#device-type')?.value.trim();
      const deviceSerial = overlay.querySelector('#device-serial')?.value.trim();
      if (companyName) inqUpdates.company_name = companyName;
      if (deviceType) inqUpdates.device_type = deviceType;
      if (deviceSerial) inqUpdates.device_serial_no = deviceSerial;
      // Reschedule: store the new visit time — server re-sends the SLA SMS.
      if (resched) inqUpdates.scheduled_at = reschedAt ? new Date(reschedAt).toISOString().slice(0, 19).replace('T', ' ') : null;
      // FOC: free service — no bill is generated, but record the client's bill number.
      if (foc) {
        inqUpdates.bill_no = focBillNo;
        inqUpdates.bill_total = 0;
        inqUpdates.bill_amount = 0;
        inqUpdates.payment_status = 'foc';
      }
      if (resolving && bill.total > 0) {
        inqUpdates.bill_amount = bill.servicesSubtotal + bill.extra;
        inqUpdates.extra_cost = bill.extra;
        inqUpdates.extra_cost_reason = overlay.querySelector('#extra-reason').value.trim() || null;
        inqUpdates.transport_km = bill.km;
        inqUpdates.transport_fee = bill.transport;
        inqUpdates.platform_fee = bill.platform;
        inqUpdates.discount_amount = bill.discount;
        inqUpdates.discount_label = bill.discountLabel || null;
        inqUpdates.discount_reason = bill.manualDiscount > 0 ? bill.discountReason : null;
        inqUpdates.discount_preset_id = bill.discountPresetId || null;
        inqUpdates.coupon_code = bill.couponCode || null;
        inqUpdates.gst_amount = bill.gst;
        inqUpdates.bill_total = bill.total;
        if (inquiryRow?.is_gig_job) {
          inqUpdates.gig_payout_amount = Math.max(0, bill.total - bill.gst - bill.platform);
        }
        inqUpdates.employee_bill_lat = billLoc.lat;
        inqUpdates.employee_bill_lng = billLoc.lng;
      }
      if (resolving && bill.total > 0) await redeemCouponIfAny();

      if (inqId) {
        ops.push(supabase.from('inquiries').update(inqUpdates).eq('id', inqId));
      } else if (taskId) {
        ops.push(supabase.from('inquiries').update(inqUpdates).eq('ticket_id', taskId));
      }

      // Add services linking (delete old ones first to prevent duplication)
      if (inqId) {
        await supabase.from('inquiry_services').delete().eq('inquiry_id', inqId);
        if (selectedServiceIds.length > 0) {
          ops.push(supabase.from('inquiry_services').insert(
            selectedServiceIds.map(sid => ({ inquiry_id: inqId, service_id: sid }))
          ));
        }
      }

      // Add progress detail as a comment when this service has a linked ticket.
      if (taskId) ops.push(supabase.from('ticket_comments').insert({
        ticket_id: taskId,
        user_id: user.id,
        content: `[Status: ${newStatus.replace('_', ' ')}] ${detail}${resolving && bill.total > 0 ? ` (Bill: ₹${bill.total})` : ''}`
      }));

      await Promise.all(ops);
      // Saved successfully — drop the local draft so it doesn't resurface later.
      try { sessionStorage.removeItem(_draftKey); } catch (_) {}
      toast('Task updated!', 'success');

      if (newStatus === 'resolved') {
        toast('Secure feedback link will be sent after payment is received', 'info');
      }

      closeOverlay();
      onDone();
    };
  })();
}

function openLeaveModal(employeeId, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:450px">
      <div class="modal-header">
        <span class="modal-title">Submit Leave Request</span>
        <button class="modal-close" id="cl">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
          <div class="form-group"><label>Start Date</label><input type="date" id="l-start" required/></div>
          <div class="form-group"><label>End Date</label><input type="date" id="l-end" required/></div>
        </div>
        <div class="form-group">
          <label>Reason for Leave</label>
          <textarea id="l-reason" rows="4" placeholder="Explain your reason..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cl2">Cancel</button>
        <button class="btn btn-primary" id="btn-submit-leave">Submit Request</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cl').onclick = overlay.querySelector('#cl2').onclick = () => overlay.remove();
  
  overlay.querySelector('#btn-submit-leave').onclick = async () => {
    const start = overlay.querySelector('#l-start').value;
    const end = overlay.querySelector('#l-end').value;
    const reason = overlay.querySelector('#l-reason').value.trim();

    if (!start || !end || !reason) { toast('Please fill in all fields', 'warning'); return; }

    const btn = overlay.querySelector('#btn-submit-leave');
    btn.disabled = true; btn.textContent = 'Submitting...';

    const { error } = await supabase.from('leave_requests').insert({
      employee_id: employeeId,
      start_date: start,
      end_date: end,
      reason,
      status: 'pending'
    });

    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = 'Submit Request'; }
    else { toast('Leave request submitted!', 'success'); overlay.remove(); onDone(); }
  };
}

export async function renderEmployeePricingTab(container) {
  showLoader(container);
  try {
    const { data: pricing, error } = await supabase.from('service_pricing').select('*').order('category');
    if (error) throw error;

    const list = pricing || [];
    const mainCategories = [...new Set(list.map(x => x.category || 'Service'))].sort();
    const subCategories = [...new Set(list.map(x => x.sub_category || '').filter(Boolean))].sort();

    const rowHtml = (rows) => rows.length === 0
      ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No services match this filter</td></tr>'
      : rows.map(x => `
          <tr data-main="${escapeAttr(x.category || 'Service')}" data-sub="${escapeAttr(x.sub_category || '')}" data-search="${escapeAttr(`${x.category || ''} ${x.sub_category || ''} ${x.sub_sub_category || ''} ${x.name || ''}`.toLowerCase())}">
            <td><input type="checkbox" class="service-checkbox" data-id="${x.id}"></td>
            <td><span class="badge badge-open">${escapeHtml(x.category || 'Service')}</span></td>
            <td>${x.sub_category ? escapeHtml(x.sub_category) : '<span style="color:var(--text-dim)">-</span>'}</td>
            <td><b>${escapeHtml(x.sub_sub_category || x.name || '')}</b></td>
            <td>${money(x.cost)}</td>
            <td style="display:flex;gap:6px;"><button class="btn btn-secondary btn-sm edit-price" data-id="${x.id}" title="Edit">${ICONS.edit || 'Edit'}</button><button class="btn btn-danger btn-sm del-price" data-id="${x.id}" title="Delete">${ICONS.close}</button></td>
          </tr>
        `).join('');

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div style="flex:1;min-width:250px;">
          <h1 style="display:flex;align-items:center;gap:12px;margin:0 0 8px;">
            <span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:1.4rem;flex-shrink:0;">${ICONS.receipt || ''}</span>
            <span>Service Pricing</span>
          </h1>
          <p style="margin:0;font-size:0.95rem;">Manage and filter service rates</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-secondary" id="dl-template" style="white-space:nowrap;">${ICONS.download || ''}<span>Template</span></button>
          <button class="btn btn-secondary" id="upload-price" style="white-space:nowrap;">${ICONS.upload || ''}<span>Upload</span></button>
          <button class="btn btn-primary" id="add-price" style="white-space:nowrap;">${ICONS.plus}<span>Add</span></button>
          <input type="file" id="upload-price-file" accept=".xlsx,.xls,.csv" style="display:none">
          <button class="btn btn-primary" id="emp-pricing-export" style="white-space:nowrap;">${ICONS.download || ''}<span>Export</span></button>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;padding:12px 16px;font-size:13px;color:var(--text-dim);">
        Excel/CSV columns: <b>Main Category</b>, <b>Sub Category</b>, <b>Sub-Sub Category</b>, <b>Price</b>. Sub Category is optional - a 3-column file is also accepted.
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label>Main Category</label>
            <select id="emp-price-main">
              <option value="all">All categories</option>
              ${mainCategories.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label>Sub Category</label>
            <select id="emp-price-sub">
              <option value="all">All sub categories</option>
              ${subCategories.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label>Search</label>
            <input id="emp-price-search" type="search" placeholder="Search service or issue"/>
          </div>
          <button class="btn btn-secondary" id="emp-price-reset">${ICONS.refresh || ''}<span>Reset</span></button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;" id="bulk-actions">
          <button class="btn btn-danger btn-sm" id="del-selected" style="display:none;">Delete Selected</button>
          <button class="btn btn-warning btn-sm" id="remove-dupes">Remove Duplicates</button>
        </div>
        <div class="card-header">
          <span class="card-title">Services</span>
          <span id="emp-price-count" style="font-size:0.82rem;color:var(--text-dim);font-weight:700;">${list.length} item${list.length === 1 ? '' : 's'}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th style="width:30px;"><input type="checkbox" id="select-all" title="Select all"></th><th>Main Category</th><th>Sub Category</th><th>Service / Issue</th><th>Price</th><th>Actions</th></tr>
            </thead>
            <tbody id="emp-price-body">${rowHtml(list)}</tbody>
          </table>
        </div>
      </div>
    `;

    const mainSel = container.querySelector('#emp-price-main');
    const subSel = container.querySelector('#emp-price-sub');
    const searchInput = container.querySelector('#emp-price-search');
    const body = container.querySelector('#emp-price-body');
    const count = container.querySelector('#emp-price-count');
    const selectAllCheckbox = container.querySelector('#select-all');
    const delSelectedBtn = container.querySelector('#del-selected');
    let visibleRows = [...list];

    const updateSubCategories = () => {
      const main = mainSel.value;
      const filteredSubs = main === 'all' 
        ? subCategories 
        : [...new Set(list.filter(x => x.category === main).map(x => x.sub_category || '').filter(Boolean))].sort();
      
      subSel.innerHTML = '<option value="all">All sub categories</option>' + 
        filteredSubs.map(c => `<option value="${c}">${c}</option>`).join('');
      subSel.value = 'all';
      applyFilters();
    };

    const applyFilters = () => {
      const main = mainSel.value;
      const sub = subSel.value;
      const query = searchInput.value.trim().toLowerCase();
      visibleRows = list.filter(x => {
        const mainValue = x.category || 'Service';
        const subValue = x.sub_category || '';
        const haystack = `${x.category || ''} ${x.sub_category || ''} ${x.sub_sub_category || ''} ${x.name || ''}`.toLowerCase();
        return (main === 'all' || mainValue === main)
          && (sub === 'all' || subValue === sub)
          && (!query || haystack.includes(query));
      });
      body.innerHTML = rowHtml(visibleRows);
      count.textContent = `${visibleRows.length} item${visibleRows.length === 1 ? '' : 's'}`;
      setupRowHandlers();
      updateBulkActions();
    };

    const updateBulkActions = () => {
      const checkedCount = container.querySelectorAll('.service-checkbox:checked').length;
      delSelectedBtn.style.display = checkedCount > 0 ? '' : 'none';
    };

    const setupRowHandlers = () => {
      container.querySelectorAll('.service-checkbox').forEach(cb => {
        cb.onchange = updateBulkActions;
      });
      container.querySelectorAll('.edit-price').forEach(btn => {
        btn.onclick = async () => {
          const service = list.find(x => x.id === btn.dataset.id);
          if (!service) return;
          const category = prompt('Main Category:', service.category || 'Service');
          if (category === null) return;
          const sub_category = prompt('Sub Category:', service.sub_category || '');
          if (sub_category === null) return;
          const sub_sub_category = prompt('Sub-Sub Category:', service.sub_sub_category || service.name || '');
          if (!sub_sub_category) return;
          const costStr = prompt('Price (₹):', String(service.cost || 0));
          const cost = parseFloat(costStr);
          if (!Number.isFinite(cost) || cost < 0) { toast('Invalid price', 'error'); return; }
          const { error } = await supabase.from('service_pricing').update({
            category: category || 'Uncategorized',
            sub_category: sub_category.trim() || null,
            sub_sub_category,
            name: sub_sub_category,
            cost,
          }).eq('id', service.id);
          if (error) toast(error.message, 'error');
          else { toast('Service updated', 'success'); renderEmployeePricingTab(container); }
        };
      });
      container.querySelectorAll('.del-price').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('Delete this service?')) return;
          const { error } = await supabase.from('service_pricing').delete().eq('id', btn.dataset.id);
          if (error) toast(error.message, 'error');
          else { toast('Service deleted', 'success'); renderEmployeePricingTab(container); }
        };
      });
    };

    mainSel.onchange = updateSubCategories;
    subSel.onchange = applyFilters;
    searchInput.oninput = applyFilters;
    selectAllCheckbox.onchange = () => {
      container.querySelectorAll('.service-checkbox').forEach(cb => cb.checked = selectAllCheckbox.checked);
      updateBulkActions();
    };

    container.querySelector('#emp-price-reset').onclick = () => {
      mainSel.value = 'all';
      subSel.value = 'all';
      searchInput.value = '';
      applyFilters();
    };

    delSelectedBtn.onclick = async () => {
      const selected = Array.from(container.querySelectorAll('.service-checkbox:checked')).map(cb => cb.dataset.id);
      if (!selected.length) return;
      if (!confirm(`Delete ${selected.length} service${selected.length === 1 ? '' : 's'}?`)) return;
      let deleted = 0;
      for (const id of selected) {
        const { error } = await supabase.from('service_pricing').delete().eq('id', id);
        if (!error) deleted++;
      }
      toast(`Deleted ${deleted} service${deleted === 1 ? '' : 's'}`, 'success');
      renderEmployeePricingTab(container);
    };

    container.querySelector('#remove-dupes').onclick = async () => {
      const seen = new Map();
      const dupeIds = [];
      list.forEach(item => {
        const key = `${item.category}||${item.sub_category}||${item.sub_sub_category}`;
        if (seen.has(key)) dupeIds.push(item.id);
        else seen.set(key, item.id);
      });
      if (!dupeIds.length) { toast('No duplicates found', 'info'); return; }
      if (!confirm(`Found ${dupeIds.length} duplicate service${dupeIds.length === 1 ? '' : 's'}. Delete them?`)) return;
      let deleted = 0;
      for (const id of dupeIds) {
        const { error } = await supabase.from('service_pricing').delete().eq('id', id);
        if (!error) deleted++;
      }
      toast(`Removed ${deleted} duplicate${deleted === 1 ? '' : 's'}`, 'success');
      renderEmployeePricingTab(container);
    };

    let addPriceLocked = false;
    container.querySelector('#add-price').onclick = () => {
      if (addPriceLocked) return;
      const category = prompt('Enter Main Category:');
      if (category === null) return;
      const sub_category = prompt('Enter Sub Category (optional):');
      if (sub_category === null) return;
      const sub_sub_category = prompt('Enter Sub-Sub Category (specific issue):');
      if (!sub_sub_category) return;
      const costStr = prompt('Enter Price (₹):');
      const cost = parseFloat(costStr);
      if (!Number.isFinite(cost) || cost < 0) { toast('Invalid price', 'error'); return; }
      addPriceLocked = true;
      (async () => {
        try {
          const { error } = await supabase.from('service_pricing').insert({
            id: crypto.randomUUID?.() || `svc-${Date.now()}`,
            category: category || 'Uncategorized',
            sub_category: sub_category.trim() || null,
            sub_sub_category,
            name: sub_sub_category,
            cost,
          });
          if (error?.status === 429) {
            toast('Server is busy - please try again in a few seconds', 'error');
          } else if (error) {
            toast(error.message || 'Failed to add service', 'error');
          } else {
            toast('Service added', 'success');
            renderEmployeePricingTab(container);
          }
        } finally {
          addPriceLocked = false;
        }
      })();
    };

    const fileInput = container.querySelector('#upload-price-file');
    let uploadLocked = false;
    container.querySelector('#upload-price').onclick = () => {
      if (uploadLocked) { toast('Upload in progress...', 'info'); return; }
      fileInput.click();
    };

    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (uploadLocked) { toast('Upload already in progress', 'warning'); return; }
      uploadLocked = true;
      fileInput.value = '';
      toast(`Reading ${file.name}...`, 'info');
      try {
        const rows = await readSheetAsRows(file);
        if (!rows.length) { toast('File is empty', 'warning'); return; }
        const { inserted, skipped } = await importServiceRows(rows);
        if (inserted) toast(`Imported ${inserted} service${inserted === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`, 'success');
        else toast(`No rows imported${skipped ? ` - ${skipped} skipped` : ''}`, 'warning');
        renderEmployeePricingTab(container);
      } catch (err) {
        console.error('[pricing import] failed', err);
        toast(err.message || 'Failed to read file', 'error');
      } finally {
        uploadLocked = false;
      }
    };

    container.querySelector('#dl-template').onclick = downloadTemplateCSV;
    container.querySelector('#emp-pricing-export').onclick = () => {
      if (!visibleRows.length) {
        toast('No services to export', 'warning');
        return;
      }
      const main = mainSel.value === 'all' ? 'all-main-categories' : mainSel.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      exportToCSV(`service-pricing-${main}.csv`, visibleRows.map(x => ({
        main_category: x.category || 'Service',
        sub_category: x.sub_category || '',
        service: x.sub_sub_category || x.name || '',
        price: Number(x.cost) || 0,
      })));
    };

    setupRowHandlers();
    updateBulkActions();
  } catch (err) {
    console.error('[employee pricing] initialization failed:', err);
    container.innerHTML = `
      <div class="card" style="padding:32px;text-align:center;">
        <p style="color:var(--danger);margin:0;font-weight:600;">Could not load service pricing</p>
        <small style="color:var(--text-dim);">${escapeHtml(err?.message || 'An unexpected error occurred')}</small>
      </div>
    `;
  }
}

async function ensureCompanyExists(companyName) {
  if (!companyName || !companyName.trim()) return;
  const nameTrim = companyName.trim();
  const { data, error } = await supabase.from('companies').select('id, name');
  if (error) {
    console.error('Error fetching companies in ensureCompanyExists:', error);
    return;
  }
  const exists = data.some(c => c.name.toLowerCase() === nameTrim.toLowerCase());
  if (!exists) {
    const id = (window.crypto?.randomUUID && window.crypto.randomUUID()) || `comp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const { error: insErr } = await supabase.from('companies').insert({ id, name: nameTrim });
    if (insErr) {
      console.error('Error inserting company in ensureCompanyExists:', insErr);
    }
  }
}

function generateEmployeeTicketNo() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `NE-${yy}${mm}${dd}-${rnd}`;
}

function optionFromCategory(category) {
  const label = String(category || '').trim();
  const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'service';
  return { value, label };
}

export async function openEmployeeRequestModal(authUser, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:550px">
      <div class="modal-body" style="text-align:center; padding:32px;">
        <span style="font-size:1.5rem;">Loading registration form...</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  try {
    const [compRes, priceRes] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('service_pricing').select('*').order('category')
    ]);
    if (compRes.error) throw compRes.error;
    if (priceRes.error) throw priceRes.error;
    
    const companyList = compRes.data || [];
    const pricingList = priceRes.data || [];
    
    const seen = new Map();
    pricingList.forEach(row => {
      const label = String(row.category || '').trim();
      if (!label || ['uncategorized', 'other'].includes(label.toLowerCase())) return;
      const opt = optionFromCategory(label);
      if (!seen.has(opt.value)) seen.set(opt.value, opt);
    });
    const issueOptions = seen.size
      ? [...seen.values()]
      : [
          { value: 'camera-offline', label: 'Camera offline' },
          { value: 'software-issue', label: 'Software issue' },
          { value: 'new-installation', label: 'New installation' },
        ];
        
    overlay.innerHTML = `
      <div class="modal" style="max-width:600px">
        <div class="modal-header">
          <span class="modal-title">Register Service Request</span>
          <button class="modal-close" id="req-close">✕</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
            <div class="form-group">
              <label>Customer Name <span style="color:var(--danger)">*</span></label>
              <input type="text" id="req-name" placeholder="Client's full name" required />
            </div>
            <div class="form-group">
              <label>Phone Number (10 digits) <span style="color:var(--danger)">*</span></label>
              <input type="tel" id="req-phone" placeholder="e.g. 9876543210" required />
            </div>
          </div>
          
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
            <div class="form-group">
              <label>Company <span style="color:var(--danger)">*</span></label>
              <select id="req-company-select" style="width:100%;">
                <option value="networking experts" selected>Networking Experts (Default)</option>
                ${companyList.filter(c => c.name.toLowerCase() !== 'networking experts').map(c => `
                  <option value="${c.name.replace(/"/g,'&quot;')}">${c.name}</option>
                `).join('')}
                <option value="Other">Other (Type manually)</option>
              </select>
              <input type="text" id="req-company-custom" placeholder="Type custom company name" style="display:none; margin-top:8px;" />
            </div>
            <div class="form-group">
              <label>Preferred Time</label>
              <select id="req-time" style="width:100%;">
                <option value="As soon as possible">As soon as possible</option>
                <option value="Morning (10 AM - 1 PM)">Morning (10 AM - 1 PM)</option>
                <option value="Afternoon (1 PM - 4 PM)">Afternoon (1 PM - 4 PM)</option>
                <option value="Evening (4 PM - 6 PM)">Evening (4 PM - 6 PM)</option>
                <option value="Tomorrow Morning">Tomorrow Morning</option>
                <option value="Flexible" selected>Flexible</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Issue Category <span style="color:var(--danger)">*</span></label>
            <select id="req-issue-select" style="width:100%;">
              <option value="">Select issue category...</option>
              ${issueOptions.map(o => `<option value="${o.value.replace(/"/g,'&quot;')}">${o.label}</option>`).join('')}
              <option value="Other">Other (Describe below)</option>
            </select>
            <input type="text" id="req-issue-custom" placeholder="Describe the custom issue category" style="display:none; margin-top:8px;" />
          </div>

          <div class="form-group">
            <label>Location <span style="color:var(--danger)">*</span></label>
            <div style="display:flex; gap:8px;">
              <textarea id="req-location" rows="2" placeholder="Full address / landmark" style="flex:1;" required></textarea>
              <button class="btn btn-secondary" id="req-detect-gps" title="Detect GPS location" style="padding:0 12px; display:flex; align-items:center; justify-content:center; height:38px; align-self:flex-start; margin-top:0;">
                📍
              </button>
            </div>
            <small id="req-coords-display" style="display:block; margin-top:4px; color:var(--text-dim); font-size:0.75rem;"></small>
          </div>

          <div class="form-group">
            <label>Description <span style="color:var(--text-dim)">(optional)</span></label>
            <textarea id="req-description" rows="3" placeholder="Provide extra details / model / serial no if any"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="req-cancel">Cancel</button>
          <button class="btn btn-primary" id="req-submit">Register & Accept</button>
        </div>
      </div>
    `;
    
    // Wire up events
    const close = () => overlay.remove();
    overlay.querySelector('#req-close').onclick = close;
    overlay.querySelector('#req-cancel').onclick = close;
    
    const companySelect = overlay.querySelector('#req-company-select');
    const companyCustom = overlay.querySelector('#req-company-custom');
    companySelect.onchange = () => {
      companyCustom.style.display = companySelect.value === 'Other' ? 'block' : 'none';
      if (companySelect.value === 'Other') companyCustom.focus();
    };
    
    const issueSelect = overlay.querySelector('#req-issue-select');
    const issueCustom = overlay.querySelector('#req-issue-custom');
    issueSelect.onchange = () => {
      issueCustom.style.display = issueSelect.value === 'Other' ? 'block' : 'none';
      if (issueSelect.value === 'Other') issueCustom.focus();
    };
    
    // Geolocation wiring
    let coords = null;
    const detectBtn = overlay.querySelector('#req-detect-gps');
    const locationInput = overlay.querySelector('#req-location');
    const coordsDisplay = overlay.querySelector('#req-coords-display');
    
    detectBtn.onclick = () => {
      if (!navigator.geolocation) {
        toast('Geolocation is not supported by your browser', 'error');
        return;
      }
      
      const origHtml = detectBtn.innerHTML;
      detectBtn.disabled = true;
      detectBtn.innerHTML = '⏳';
      
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          coords = { lat, lng };
          coordsDisplay.textContent = `GPS Coords: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const data = await res.json();
            if (data && data.display_name) {
              locationInput.value = data.display_name;
            } else {
              locationInput.value = `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            }
          } catch (err) {
            console.error('OSM Geocoding failed:', err);
            locationInput.value = `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          } finally {
            detectBtn.disabled = false;
            detectBtn.innerHTML = origHtml;
            toast('GPS location captured', 'success');
          }
        },
        (err) => {
          console.error('GPS error:', err);
          detectBtn.disabled = false;
          detectBtn.innerHTML = origHtml;
          toast('Could not detect location. Please type manually.', 'error');
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    };
    
    // Submit handler
    const submitBtn = overlay.querySelector('#req-submit');
    submitBtn.onclick = async () => {
      const name = overlay.querySelector('#req-name').value.trim();
      const phoneInput = overlay.querySelector('#req-phone').value.trim();
      const location = locationInput.value.trim();
      const description = overlay.querySelector('#req-description').value.trim();
      const preferredTime = overlay.querySelector('#req-time').value;
      
      // Validations
      if (!name) { toast('Customer name is required', 'warning'); return; }
      
      const digits = phoneInput.replace(/\D/g, '');
      if (digits.length !== 10) { toast('Please enter a valid 10-digit mobile number', 'warning'); return; }
      const normalizedPhone = '+91' + digits;
      
      let companyName = companySelect.value;
      if (companyName === 'Other') {
        companyName = companyCustom.value.trim();
        if (!companyName) { toast('Please type the custom company name', 'warning'); return; }
      }
      
      let serviceItem = '';
      if (issueSelect.value === 'Other') {
        serviceItem = issueCustom.value.trim();
        if (!serviceItem) { toast('Please describe the custom issue category', 'warning'); return; }
      } else {
        const selectedOpt = issueSelect.options[issueSelect.selectedIndex];
        serviceItem = selectedOpt ? selectedOpt.text : '';
      }
      if (!serviceItem || issueSelect.value === '') { toast('Please select or specify an issue category', 'warning'); return; }
      
      if (!location) { toast('Location address is required', 'warning'); return; }
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Registering...';
      
      try {
        // 1. Check/insert custom company
        await ensureCompanyExists(companyName);
        
        // 2. Check for existing client profile
        const { data: existingClient } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', normalizedPhone)
          .maybeSingle();
          
        // 3. Generate ticket number
        const ticketNo = generateEmployeeTicketNo();
        
        // 4. Create ticket assigned to self
        const ticketId = (window.crypto?.randomUUID && window.crypto.randomUUID()) || `tkt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const { data: ticket, error: tErr } = await supabase
          .from('tickets')
          .insert({
            id: ticketId,
            title: `Service: ${serviceItem.slice(0, 30)}`,
            description: description || `Registered by employee: ${serviceItem}`,
            assigned_to: authUser.id,
            client_id: existingClient ? existingClient.id : null,
            status: 'assigned',
            category: 'service_request'
          })
          .select()
          .single();
          
        if (tErr) throw tErr;
        
        // 5. Create inquiry linked to ticket and assigned to self
        const inquiryId = (window.crypto?.randomUUID && window.crypto.randomUUID()) || `inq-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const { error: iErr } = await supabase
          .from('inquiries')
          .insert({
            id: inquiryId,
            full_name: name,
            phone: normalizedPhone,
            location: location,
            customer_lat: coords?.lat || null,
            customer_lng: coords?.lng || null,
            service_item: serviceItem,
            description: description || null,
            ticket_no: ticketNo,
            preferred_time: preferredTime,
            assigned_employee_id: authUser.id,
            ticket_id: ticket.id,
            status: 'open',
            assignment_status: 'accepted',
            company_name: companyName
          });
          
        if (iErr) {
          // Attempt rollback of ticket
          await supabase.from('tickets').delete().eq('id', ticket.id);
          throw iErr;
        }
        
        // 6. Log status comment
        await supabase.from('ticket_comments').insert({
          ticket_id: ticket.id,
          user_id: authUser.id,
          content: `[Status: Assigned] Request self-registered and accepted by employee.`
        });
        
        toast(`✓ Request ${ticketNo} registered and accepted!`, 'success');
        overlay.remove();
        onDone();
      } catch (err) {
        console.error('Registration failed:', err);
        toast(err.message || 'Could not register request', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register & Accept';
      }
    };
    
  } catch (err) {
    console.error('Failed to initialize request modal:', err);
    toast('Error loading registration form', 'error');
    overlay.remove();
  }
}
