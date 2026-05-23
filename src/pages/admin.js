import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime, formatTime, exportToCSV, calculateSLA, formatTimeRemaining, showNotification, ensureNotifyPermission } from '../utils.js';
import { openPremiumBillModal, shareBillToPublicLink } from './employee.js';

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

async function openInquiryDetailWithLoader(btn, id, onDone) {
  const restore = setButtonLoading(btn, 'Loading');
  try {
    await openInquiryDetail(id, onDone);
  } catch (err) {
    console.error(err);
    toast('Could not open request details', 'error');
  } finally {
    restore();
  }
}

function generateAdminTicketNo() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `NE-${yy}${mm}${dd}-${rnd}`;
}

function normalizeAdminPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 ? `+91${ten}` : null;
}

function getHighAccuracyPosition({ desiredAccuracy = 25, maxWaitMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    let best = null;
    let settled = false;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= desiredAccuracy && !settled) {
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          clearTimeout(timer);
          resolve(best);
        }
      },
      (err) => {
        if (settled) return;
        settled = true;
        navigator.geolocation.clearWatch(watchId);
        clearTimeout(timer);
        if (best) resolve(best);
        else reject(err);
      },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
    );
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      if (best) resolve(best);
      else reject(new Error('Geolocation timed out'));
    }, maxWaitMs);
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

function optionFromCategory(category) {
  const label = String(category || '').trim();
  const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'service';
  return { value, label };
}

function hoursWorked(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const diff = new Date(clockOut) - new Date(clockIn);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
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
function money(value) {
  const val = Math.round(Number(value) || 0);
  return '₹' + val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
import { ICONS } from '../icons.js';

const AUTO_CLOCK_OUT_HOUR = 18;
const STRICT_CLOCKOUT_LIMIT = 4;

function isPastAutoClockOut(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setHours(AUTO_CLOCK_OUT_HOUR, 0, 0, 0);
  return now >= cutoff;
}

function attendanceDateKey(row) {
  return dateKey(row?.date || row?.clock_in);
}

function isValidActiveAttendance(row, today = new Date().toLocaleDateString('en-CA')) {
  return Boolean(row?.clock_in && !row?.clock_out && attendanceDateKey(row) === today && !isPastAutoClockOut());
}

function isForgottenClockOut(row, today = new Date().toLocaleDateString('en-CA')) {
  if (!row?.clock_in || row?.clock_out) return false;
  return attendanceDateKey(row) !== today || isPastAutoClockOut();
}

function groupedForgottenClockouts(rows = []) {
  const map = new Map();
  rows.filter(isForgottenClockOut).forEach(row => {
    const key = row.user_id || 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function resolvedClockOutFor(row) {
  const clockInMs = new Date(row?.clock_in || Date.now()).getTime();
  const today = new Date().toLocaleDateString('en-CA');
  const cutoff = new Date(`${row?.date || today}T00:00:00`);
  cutoff.setHours(AUTO_CLOCK_OUT_HOUR, 0, 0, 0);
  const cutoffMs = cutoff.getTime();
  const resolvedMs = row?.date === today
    ? Date.now()
    : Math.max(Number.isFinite(clockInMs) ? clockInMs : cutoffMs, cutoffMs);
  return new Date(resolvedMs).toISOString();
}

const STATUS_LABEL = {
  pending: 'Received',
  open: 'Received',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Resolved',
  issue_not_resolved: 'Issue Not Resolved',
};

function displayStatus(status) {
  return status === 'closed' ? 'resolved' : (status || 'open');
}

function statusBadge(status) {
  const shown = displayStatus(status);
  const cls = shown === 'resolved' ? 'badge-resolved'
    : shown === 'in_progress' ? 'badge-in_progress'
    : shown === 'assigned' ? 'badge-assigned'
    : shown === 'issue_not_resolved' ? 'badge-danger'
    : 'badge-open';
  return `<span class="badge ${cls}">${STATUS_LABEL[shown] || shown}</span>`;
}

function newestFirst(a, b) {
  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
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

function matchesServiceReportFilters(row, { from = '', to = '', status = 'all' } = {}) {
  const rowDate = dateKey(row.created_at);
  if (from && rowDate && rowDate < from) return false;
  if (to && rowDate && rowDate > to) return false;
  if (status === 'active') return !['resolved', 'closed'].includes(row.status);
  if (status === 'resolved') return ['resolved', 'closed'].includes(row.status);
  if (status === 'paid') return row.payment_status === 'paid';
  if (status === 'unpaid') return row.bill_amount && row.payment_status !== 'paid';
  return true;
}

function buildPaidUpdates(row, extra = {}) {
  const updates = {
    payment_status: 'paid',
    payment_received_at: row?.payment_received_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
    ...extra,
  };
  if (!['resolved', 'closed'].includes(row?.status)) updates.status = 'resolved';
  return updates;
}

async function markInquiryPaid(row, extra = {}) {
  const updates = buildPaidUpdates(row, extra);
  const ops = [supabase.from('inquiries').update(updates).eq('id', row.id)];
  if (row.ticket_id && updates.status === 'resolved') {
    ops.push(supabase.from('tickets').update({ status: 'resolved' }).eq('id', row.ticket_id));
  }
  const results = await Promise.all(ops);
  return results.find(r => r.error)?.error || null;
}

// ── ADMIN HUB ───────────────────────────────────────────
export async function renderAdminDashboard(container) {
  if (container._adminDashboardChannel) {
    supabase.removeChannel(container._adminDashboardChannel);
    container._adminDashboardChannel = null;
  }
  if (container._adminDashboardCleanup) {
    clearInterval(container._adminDashboardCleanup);
    container._adminDashboardCleanup = null;
  }

  const today = new Date().toLocaleDateString('en-CA');
  const reportFilters = {
    from: container.dataset.companyFrom || '',
    to: container.dataset.companyTo || '',
    status: container.dataset.companyStatus || 'all',
  };
  let tickets, inquiries, attendance, stocks, profiles, complaints;
  
  try {
    const res = await Promise.all([
      supabase.from('tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('inquiries').select('*').in('status', ['pending', 'open', 'assigned', 'in_progress']).order('created_at', { ascending: false }),
      supabase.from('attendance').select('*, profiles(full_name)').order('clock_in', { ascending: false }),
      supabase.from('stocks').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('complaints').select('*').order('created_at', { ascending: false })
    ]);
    tickets = res[0].data; inquiries = res[1].data; attendance = res[2].data; stocks = res[3].data; profiles = res[4].data; complaints = res[5].data;
    const firstErr = res.find(r => r.error)?.error;
    if (firstErr) console.warn('[Admin] Partial load issue:', firstErr.message);
  } catch (err) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:40px;"><h2 style="color:var(--primary);">Initialization Error</h2><p>${err.message}</p></div>`;
    return;
  }

  const t = tickets || [], i = inquiries || [], all_a = attendance || [], s = stocks || [], p = profiles || [], c = complaints || [];
  let a = all_a.filter(x => isValidActiveAttendance(x, today));
  const lowStock = s.filter(x => x.quantity <= x.min_stock).length;

  // Build phone → company map from profiles
  const phoneToCompany = new Map();
  const profileById = new Map();
  p.forEach(pr => { if (pr.phone && pr.company) phoneToCompany.set(pr.phone, pr.company); });
  p.forEach(pr => { if (pr.id) profileById.set(pr.id, pr); });
  const missedClockoutMap = groupedForgottenClockouts(all_a);
  const clockoutWarnings = [...missedClockoutMap.entries()]
    .map(([userId, rows]) => ({
      userId,
      count: rows.length,
      latest: rows.sort((x, y) => new Date(y.clock_in || 0) - new Date(x.clock_in || 0))[0],
      employee: profileById.get(userId),
    }))
    .sort((x, y) => y.count - x.count || new Date(y.latest?.clock_in || 0) - new Date(x.latest?.clock_in || 0));
  const strictClockoutUsers = new Set(clockoutWarnings
    .filter(x => x.count >= STRICT_CLOCKOUT_LIMIT)
    .map(x => x.userId));
  a = a.filter(row => !strictClockoutUsers.has(row.user_id));

  // Aggregate all inquiries by company
  const { data: allInquiries } = await supabase.from('inquiries').select('*').order('created_at', { ascending: false });
  const reportInquiries = (allInquiries || []).filter(inq => matchesServiceReportFilters(inq, reportFilters));
  const companyMap = new Map();
  reportInquiries.forEach(inq => {
    const company = inq.company_name || phoneToCompany.get(inq.phone) || 'Walk-in / Unregistered';
    if (!companyMap.has(company)) companyMap.set(company, { total: 0, active: 0, resolved: 0 });
    const entry = companyMap.get(company);
    entry.total++;
    if (['resolved', 'closed'].includes(inq.status)) entry.resolved++;
    else entry.active++;
  });
  const companyRows = [...companyMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);
  const activeInquiries = [...i].sort(newestFirst);
  const allRows = allInquiries || [];
  const resolvedInquiries = (allInquiries || [])
    .filter(x => ['resolved', 'closed'].includes(x.status))
    .sort(newestFirst);
  const newToday = allRows.filter(x => dateKey(x.created_at) === today).length;
  const pendingAssignment = allRows.filter(x => !x.assigned_employee_id && !['resolved', 'closed'].includes(x.status)).length;
  const inProgress = allRows.filter(x => displayStatus(x.status) === 'in_progress').length;
  const resolvedToday = allRows.filter(x => ['resolved', 'closed'].includes(x.status) && dateKey(x.updated_at || x.bill_generated_at || x.created_at) === today).length;
  const unpaidBills = allRows.filter(x => x.bill_amount && x.payment_status !== 'paid').length;
  const cashPending = allRows
    .filter(x => x.payment_method === 'cash' && x.payment_status === 'paid' && x.cash_collected_at && !x.cash_submitted_at)
    .reduce((sum, x) => sum + (Number(x.bill_total) || 0), 0);
  const openComplaints = c.filter(x => !['resolved', 'closed'].includes(String(x.status || '').toLowerCase()));
  const recentComplaints = [...c].sort(newestFirst).slice(0, 5);
  const attentionItems = activeInquiries
    .filter(x => !x.assigned_employee_id || ['pending', 'open'].includes(displayStatus(x.status)) || x.assignment_status === 'declined')
    .map(x => ({
      ...x,
      _reason: x.assignment_status === 'declined'
        ? 'Declined'
        : !x.assigned_employee_id
          ? 'Unassigned'
          : 'Needs update',
    }));

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Admin Hub</h1>
        <p>Real-time operations monitoring</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button class="btn btn-primary" id="admin-dashboard-register">${ICONS.plus}<span>Register Request</span></button>
        <button class="btn btn-secondary" id="admin-enable-alerts">Enable Alerts</button>
        <button class="btn btn-secondary" id="admin-refresh">Refresh</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--primary)">${a.length}</div>
        <div class="stat-label">Employees In</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning)">${i.length}</div>
        <div class="stat-label">Active Service Requests</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--danger)">${lowStock}</div>
        <div class="stat-label">Low Stock</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">${t.filter(x=>x.status==='open').length}</div>
        <div class="stat-label">Open Tasks</div>
      </div>
    </div>

    <div class="stats-grid" style="margin-top:18px">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--primary)">${newToday}</div>
        <div class="stat-label">New Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning)">${pendingAssignment}</div>
        <div class="stat-label">Pending Assignment</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--info)">${inProgress}</div>
        <div class="stat-label">In Progress</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">${resolvedToday}</div>
        <div class="stat-label">Resolved Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--danger)">${unpaidBills}</div>
        <div class="stat-label">Unpaid Bills</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning);font-size:1.7rem">${money(cashPending)}</div>
        <div class="stat-label">Cash Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--danger)">${openComplaints.length}</div>
        <div class="stat-label">Open Complaints</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:${clockoutWarnings.length ? 'var(--danger)' : 'var(--success)'}">${clockoutWarnings.length}</div>
        <div class="stat-label">Clock-out Warnings</div>
      </div>
    </div>

      ${clockoutWarnings.length ? `
      <div class="card">
        <div class="card-header"><span class="card-title">Clock-out Warnings</span></div>
        <div class="table-wrap recent-requests-scroll">
          <table>
            <thead><tr><th>Employee</th><th>Missed</th><th>Last Open Shift</th><th>Action</th></tr></thead>
            <tbody>
              ${clockoutWarnings.slice(0, 5).map(x => `<tr>
                <td><b>${escapeHtml(x.employee?.full_name || 'Employee')}</b></td>
                <td><span class="badge ${x.count >= STRICT_CLOCKOUT_LIMIT ? 'badge-danger' : 'badge-medium'}">${x.count} day${x.count === 1 ? '' : 's'}</span></td>
                <td><small>${formatDateTime(x.latest?.clock_in)}</small></td>
                <td>${x.count >= STRICT_CLOCKOUT_LIMIT
                  ? '<span class="badge badge-danger">Strict: block clock-in</span>'
                  : '<span class="badge badge-medium">Warn employee</span>'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
      <!-- Actionable service queue -->
      <div class="card">
        <div class="card-header"><span class="card-title">Needs Attention</span></div>
        <div class="table-wrap recent-requests-scroll">
          <table>
            <thead><tr><th>Ticket</th><th>Customer</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              ${attentionItems.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--text-dim)">No requests need attention</td></tr>' :
                attentionItems.map(x => `<tr>
                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || 'â€”'}</code><br/><small style="color:var(--text-dim)">${formatDateTime(x.created_at)}</small></td>
                  <td><b>${x.full_name}</b><br/><small style="color:var(--text-dim)">${x.company_name || x.service_item || 'Service request'}</small></td>
                  <td><span class="badge badge-${x._reason === 'Declined' ? 'danger' : 'medium'}">${x._reason}</span></td>
                  <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Service Requests Card (From Guests) -->
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Service Requests</span></div>
        <div class="table-wrap recent-requests-scroll">
          <table>
            <thead><tr><th>Ticket</th><th>Customer</th><th>Company</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${activeInquiries.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-dim)">No active requests</td></tr>' :
                activeInquiries.map(x => `<tr>
                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || '—'}</code><br/><small style="color:var(--text-dim)">${formatDateTime(x.created_at)}</small></td>
                  <td><b>${x.full_name}</b></td>
                  <td>${x.company_name ? `<b>${x.company_name}</b>` : '<span style="color:var(--text-dim)">—</span>'}</td>
                  <td>${statusBadge(x.status)}</td>
                  <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Recent Complaints</span></div>
        <div class="table-wrap recent-requests-scroll">
          <table>
            <thead><tr><th>Ticket</th><th>Phone</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${recentComplaints.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-dim)">No complaints yet</td></tr>' :
                recentComplaints.map(x => `<tr>
                  <td><code style="font-size:0.78rem;color:var(--primary)">${escapeHtml(x.ticket_no || '-')}</code><br/><small style="color:var(--text-dim)">${formatDateTime(x.created_at)}</small></td>
                  <td><b>${escapeHtml(x.phone || '-')}</b><br/><small style="color:var(--text-dim);display:block;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(x.complaint_text || 'Complaint')}</small></td>
                  <td>${statusBadge(x.status)}</td>
                  <td><button class="btn btn-primary btn-sm cmp-dash-btn" data-id="${escapeHtml(x.id)}">Respond</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top:24px">
        <div class="card-header"><span class="card-title">Resolved Services</span></div>
        <div class="table-wrap recent-requests-scroll">
        <table>
          <thead><tr><th>Ticket</th><th>Service Date</th><th>Company</th><th>Name</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${resolvedInquiries.length === 0
              ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-dim)">No resolved services yet</td></tr>'
              : resolvedInquiries.map(x => `<tr>
                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || 'â€”'}</code></td>
                  <td><small>${formatDateTime(x.created_at)}</small></td>
                  <td>${x.company_name ? `<b>${x.company_name}</b>` : '<span style="color:var(--text-dim)">â€”</span>'}</td>
                  <td><b>${x.full_name}</b></td>
                  <td>${statusBadge(x.status)}</td>
                  <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:24px" id="company-svc-card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span class="card-title">${ICONS.building}<span style="margin-left:8px">Services by Company</span></span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select id="company-status-filter" style="padding:8px 12px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-weight:700;">
            <option value="all" ${reportFilters.status === 'all' ? 'selected' : ''}>All</option>
            <option value="active" ${reportFilters.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="resolved" ${reportFilters.status === 'resolved' ? 'selected' : ''}>Resolved</option>
            <option value="paid" ${reportFilters.status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="unpaid" ${reportFilters.status === 'unpaid' ? 'selected' : ''}>Unpaid</option>
          </select>
          <input type="date" id="company-from" value="${reportFilters.from}" style="padding:8px 12px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);"/>
          <input type="date" id="company-to" value="${reportFilters.to}" style="padding:8px 12px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);"/>
        <div class="search-input-wrap" style="min-width:160px;max-width:260px;">
          <span>🔍</span>
          <input class="search-input" id="company-search" placeholder="Filter company…" style="padding:6px 10px;font-size:0.82rem;"/>
        </div>
        <button class="btn btn-secondary btn-sm" id="company-export">Export All</button>
        <button class="btn btn-secondary btn-sm" id="company-clear-filters">Clear</button>
        </div>
      </div>
      <div class="table-wrap" id="company-table-wrap">
        <table id="company-svc-table">
          <thead><tr><th>Company</th><th>Total</th><th>Active</th><th>Resolved</th><th></th></tr></thead>
          <tbody>
            ${companyRows.length === 0
              ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-dim)">No service data yet</td></tr>'
              : companyRows.map(([company, counts]) => `<tr data-company="${company}">
                  <td><b>${company}</b></td>
                  <td><span class="badge badge-open">${counts.total}</span></td>
                  <td style="color:var(--warning);font-weight:700">${counts.active}</td>
                  <td style="color:var(--success);font-weight:700">${counts.resolved}</td>
                  <td><button class="btn btn-secondary btn-sm view-company-btn" data-company="${company}" style="white-space:nowrap">View All</button></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

  `;

  // Bindings
  const bind = (sel, cb) => {
    const el = container.querySelector(sel);
    if (el) el.onclick = cb;
  };

  bind('#admin-refresh', () => renderAdminDashboard(container));
  bind('#admin-dashboard-register', () => openAdminRequestModal(() => renderAdminDashboard(container)));
  bind('#admin-enable-alerts', async () => {
    const permission = await ensureNotifyPermission();
    showNotification({
      title: 'Alerts enabled',
      body: permission === 'granted' ? 'Live admin alerts will show with sound.' : 'In-app alerts will show with sound after browser interaction.',
      type: 'success',
      tag: 'admin-alerts-test',
    });
  });

  // Services by Company: search filter
  const companySearch = container.querySelector('#company-search');
  if (companySearch) {
    companySearch.oninput = () => {
      const q = companySearch.value.toLowerCase();
      container.querySelectorAll('#company-svc-table tbody tr[data-company]').forEach(row => {
        row.style.display = row.dataset.company.toLowerCase().includes(q) ? '' : 'none';
      });
    };
  }
  const companyExport = container.querySelector('#company-export');
  if (companyExport) {
    companyExport.onclick = () => {
      const q = (companySearch?.value || '').toLowerCase();
      exportToCSV('services-by-company.csv', companyRows
        .filter(([company]) => !q || company.toLowerCase().includes(q))
        .map(([company, counts]) => ({
          company,
          total: counts.total,
          active: counts.active,
          resolved: counts.resolved,
        })));
    };
  }
  const companyStatus = container.querySelector('#company-status-filter');
  const companyFrom = container.querySelector('#company-from');
  const companyTo = container.querySelector('#company-to');
  const rerenderCompanyReport = () => {
    container.dataset.companyStatus = companyStatus?.value || 'all';
    container.dataset.companyFrom = companyFrom?.value || '';
    container.dataset.companyTo = companyTo?.value || '';
    renderAdminDashboard(container);
  };
  if (companyStatus) companyStatus.onchange = rerenderCompanyReport;
  if (companyFrom) companyFrom.onchange = rerenderCompanyReport;
  if (companyTo) companyTo.onchange = rerenderCompanyReport;
  const clearCompanyFilters = container.querySelector('#company-clear-filters');
  if (clearCompanyFilters) {
    clearCompanyFilters.onclick = () => {
      container.dataset.companyStatus = 'all';
      container.dataset.companyFrom = '';
      container.dataset.companyTo = '';
      renderAdminDashboard(container);
    };
  }

  // Build phone set per company for modal lookup
  const companyPhones = new Map();
  p.forEach(pr => { if (pr.phone && pr.company) { if (!companyPhones.has(pr.company)) companyPhones.set(pr.company, new Set()); companyPhones.get(pr.company).add(pr.phone); } });

  // Services by Company: "View All" opens a modal with that company's inquiries
  container.querySelectorAll('.view-company-btn').forEach(btn => {
    btn.onclick = async () => {
      const company = btn.dataset.company;
      const phones = company === 'Walk-in / Unregistered' ? null : [...(companyPhones.get(company) || [])];
      let companyInquiries;
      if (!phones) {
        // Walk-ins: inquiries whose phone doesn't match any profile
        const allPhones = [...phoneToCompany.keys()];
        const { data } = await supabase.from('inquiries').select('*').order('created_at', { ascending: false });
        companyInquiries = (data || []).filter(x => !allPhones.includes(x.phone));
      } else if (phones.length > 0) {
        const { data } = await supabase.from('inquiries').select('*').in('phone', phones).order('created_at', { ascending: false });
        companyInquiries = data || [];
      } else {
        companyInquiries = [];
      }
      companyInquiries = (allInquiries || [])
        .filter(x => (x.company_name || phoneToCompany.get(x.phone) || 'Walk-in / Unregistered') === company)
        .filter(x => matchesServiceReportFilters(x, reportFilters))
        .sort(newestFirst);

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:700px">
          <div class="modal-header">
            <span class="modal-title">${ICONS.building}<span style="margin-left:8px">${company}</span></span>
            <button class="modal-close" id="cm-co">✕</button>
          </div>
          <div class="modal-body" style="padding:0">
            <div class="table-wrap">
              <table>
                <thead><tr><th>Ticket</th><th>Service Date</th><th>Customer</th><th>Service</th><th>Status</th><th>Bill</th><th></th></tr></thead>
                <tbody>
                  ${companyInquiries.length === 0
                    ? '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No inquiries found</td></tr>'
                    : companyInquiries.map(x => `<tr>
                        <td><code style="font-size:0.75rem;color:var(--primary)">${x.ticket_no || '—'}</code></td>
                        <td><small>${formatDateTime(x.created_at)}</small></td>
                        <td><b>${x.full_name}</b><br/><small>${x.phone}</small></td>
                        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.service_item || '—'}</td>
                        <td>${statusBadge(x.status)}</td>
                        <td>${x.bill_amount ? '₹' + Number(x.bill_amount).toLocaleString('en-IN') : '—'}</td>
                        <td><button class="btn btn-primary btn-sm co-inq-btn" data-id="${x.id}">Manage</button></td>
                      </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="co-export">Export This Company</button>
            <button class="btn btn-secondary" id="cm-co2">Close</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#cm-co').onclick = overlay.querySelector('#cm-co2').onclick = () => overlay.remove();
      overlay.querySelector('#co-export').onclick = () => exportToCSV(`${company.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-services.csv`, companyInquiries.map(x => ({
        ticket: x.ticket_no || x.id,
        service_date: x.created_at || '',
        company,
        customer: x.full_name || '',
        phone: x.phone || '',
        service: x.service_item || '',
        status: x.status || '',
        bill_amount: x.bill_amount || '',
        payment_status: x.payment_status || '',
        location: x.location || '',
      })));
      overlay.querySelectorAll('.co-inq-btn').forEach(b => {
        b.onclick = () => { overlay.remove(); openInquiryDetailWithLoader(b, b.dataset.id, () => renderAdminDashboard(container)); };
      });
    };
  });

  
  container.querySelectorAll('.inq-btn').forEach(btn => {
    btn.onclick = () => openInquiryDetailWithLoader(btn, btn.dataset.id, () => renderAdminDashboard(container));
  });
  container.querySelectorAll('.cmp-dash-btn').forEach(btn => {
    btn.onclick = () => openComplaintResponder(c.find(r => String(r.id) === String(btn.dataset.id)), () => renderAdminDashboard(container));
  });

  const refreshDashboard = () => {
    if (document.getElementById('admin-refresh')) renderAdminDashboard(container);
  };

  // Real-time listener for dashboard changes.
  const channel = supabase.channel('admin-dashboard-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inquiries' }, payload => {
      const row = payload.new || {};
      showNotification({
        title: 'New service request',
        body: `${row.ticket_no || 'New ticket'} from ${row.full_name || 'client'}`,
        type: 'alert',
        tag: `new-request-${row.id || Date.now()}`,
      });
      refreshDashboard();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inquiries' }, payload => {
      const row = payload.new || {};
      if (row.payment_status === 'paid') {
        showNotification({
          title: '💰 Payment Received',
          body: `${row.full_name || 'Client'} paid ₹${row.bill_amount || ''} for ${row.ticket_no || ''}`,
          type: 'payment',
          tag: `pay-${row.id || ''}`,
        });
      } else if (row.feedback_rating != null) {
        showNotification({
          title: '⭐ New Feedback',
          body: `${row.full_name || 'Client'} rated ${row.feedback_rating}/5`,
          type: 'info',
          tag: `fb-${row.id || ''}`,
        });
      }
      refreshDashboard();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'complaints' }, payload => {
      const row = payload.new || {};
      showNotification({
        title: 'New complaint',
        body: `${row.ticket_no || 'Ticket'}: ${row.complaint_text || 'Customer complaint received'}`,
        type: 'alert',
        tag: `complaint-${row.id || Date.now()}`,
      });
      refreshDashboard();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'complaints' }, () => {
      refreshDashboard();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, payload => {
      const row = payload.new || {};
      const employee = profileById.get(row.user_id);
      showNotification({
        title: 'Employee online',
        body: `${employee?.full_name || 'Employee'} clocked in`,
        type: 'success',
        tag: `attendance-in-${row.id || row.user_id || Date.now()}`,
      });
      refreshDashboard();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attendance' }, payload => {
      const row = payload.new || {};
      const oldRow = payload.old || {};
      const employee = profileById.get(row.user_id);
      if (row.clock_out && !oldRow.clock_out) {
        showNotification({
          title: 'Employee offline',
          body: `${employee?.full_name || 'Employee'} clocked out`,
          type: 'info',
          tag: `attendance-out-${row.id || row.user_id || Date.now()}`,
        });
      } else if (row.clock_in && !row.clock_out) {
        showNotification({
          title: 'Employee online',
          body: `${employee?.full_name || 'Employee'} is online`,
          type: 'success',
          tag: `attendance-online-${row.id || row.user_id || Date.now()}`,
        });
      }
      refreshDashboard();
    })
    .subscribe();
  container._adminDashboardChannel = channel;

  // Cleanup channel on container removal (using a simple check)
  const checkRemoval = setInterval(() => {
    if (!document.body.contains(container)) {
      supabase.removeChannel(channel);
      if (container._adminDashboardChannel === channel) container._adminDashboardChannel = null;
      if (container._adminDashboardCleanup === checkRemoval) container._adminDashboardCleanup = null;
      clearInterval(checkRemoval);
    }
  }, 5000);
  container._adminDashboardCleanup = checkRemoval;
}

// ── SERVICE REQUEST DETAIL MODAL ────────────────────────
async function openInquiryDetail(id, onDone) {
  const { data: i } = await supabase.from('inquiries').select('*').eq('id', id).single();
  const { data: employees } = await supabase.from('profiles').select('*').eq('role', 'employee');
  const today = new Date().toLocaleDateString('en-CA');
  const { data: activeAttendance } = await supabase.from('attendance')
    .select('user_id,clock_in,clock_out,date');
  const missedByEmployee = groupedForgottenClockouts(activeAttendance || []);
  const restrictedEmployeeIds = new Set([...missedByEmployee.entries()]
    .filter(([, rows]) => rows.length >= STRICT_CLOCKOUT_LIMIT)
    .map(([userId]) => userId));
  const activeEmployeeIds = new Set((activeAttendance || [])
    .filter(row => isValidActiveAttendance(row, today) && !restrictedEmployeeIds.has(row.user_id))
    .map(row => row.user_id));
  const availableEmployees = (employees || []).map(e => ({
    ...e,
    _clockedIn: activeEmployeeIds.has(e.id),
  }));
  // Resolve technician name for the bill view, if assigned.
  const technicianName = (employees || []).find(e => e.id === i.assigned_employee_id)?.full_name || '';
  const assignmentAwaitingResponse = Boolean(i.assigned_employee_id && i.assignment_status === 'pending');
  const assignmentLocked = Boolean(i.assigned_employee_id && i.assignment_status !== 'declined');
  const assignmentLockText = assignmentAwaitingResponse
    ? `${technicianName || 'Assigned technician'} must accept or decline before admin can change this assignment.`
    : `${technicianName || 'This technician'} is already assigned. Reassignment is locked unless the employee declines.`;
  // Items used on the bill — fetched only if a bill has been generated.
  let billServices = [];
  if (i.bill_total) {
    const { data: links } = await supabase.from('inquiry_services')
      .select('service_id, service_pricing(name, category, sub_category, sub_sub_category, cost)')
      .eq('inquiry_id', i.id);
    billServices = (links || []).map(row => {
      const p = row.service_pricing || {};
      const parts = [p.category, p.sub_category, p.sub_sub_category || p.name].filter(Boolean);
      return { name: parts.join(' › '), cost: Number(p.cost) || 0 };
    });
  }
  const hasBill = Number(i.bill_total) > 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">${ICONS.ticket}<span style="margin-left:8px">Service Request</span></span>
        <button class="modal-close" id="ci">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div class="sr-meta">
          <div class="sr-meta-row">
            <div><div class="sr-meta-label">Ticket</div><div class="sr-meta-value sr-mono">${i.ticket_no || '—'}</div></div>
            <div><div class="sr-meta-label">Status</div><div>${statusBadge(i.status)}</div></div>
          </div>
          <div class="sr-meta-row">
            <div><div class="sr-meta-label">Service Created</div><div class="sr-meta-value">${formatDateTime(i.created_at)}</div></div>
            <div><div class="sr-meta-label">Last Updated</div><div class="sr-meta-value">${formatDateTime(i.updated_at || i.created_at)}</div></div>
          </div>
          <div class="sr-meta-row">
            <div><div class="sr-meta-label">Name</div><div class="sr-meta-value">${i.full_name}</div></div>
            <div><div class="sr-meta-label">Phone</div><div class="sr-meta-value">${i.phone}</div></div>
          </div>
          <div><div class="sr-meta-label">Service item</div><div class="sr-meta-value">${i.service_item || '—'}</div></div>
          ${i.description ? `<div><div class="sr-meta-label">Customer description</div><div class="sr-meta-value" style="white-space:pre-wrap;line-height:1.45;">${escapeHtml(i.description)}</div></div>` : ''}
          <div><div class="sr-meta-label">Location</div><div class="sr-meta-value">${i.location || '—'}</div></div>
          ${i.company_name ? `<div><div class="sr-meta-label">Company</div><div class="sr-meta-value">${i.company_name}</div></div>` : ''}
          ${(i.customer_lat != null && i.customer_lng != null) ? `
            <a href="${mapLink(i.customer_lat, i.customer_lng)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;text-decoration:none;">
              ${ICONS.pin}<span>Open exact client pin</span>
            </a>` : ''}
          ${(i.device_type || i.device_serial_no) ? `
            <div class="sr-meta-row">
              <div><div class="sr-meta-label">Device Type</div><div class="sr-meta-value">${i.device_type || '—'}</div></div>
              <div><div class="sr-meta-label">Serial No</div><div class="sr-meta-value sr-mono">${i.device_serial_no || '—'}</div></div>
            </div>` : ''}
          <div class="sr-meta-row">
            <div><div class="sr-meta-label">Preferred Time</div><div class="sr-meta-value" style="color:var(--primary)">${i.preferred_time || 'Flexible'}</div></div>
            <div><div class="sr-meta-label">SLA Timer</div><div class="sr-meta-value">${formatTimeRemaining(calculateSLA(i.created_at))}</div></div>
          </div>
          ${i.extra_cost > 0 ? `
            <div style="padding:12px; border-radius:12px; background:rgba(16,185,129,0.05); border:1px solid var(--primary); margin-top:10px;">
              <div class="sr-meta-label">Additional Charges</div>
              <div class="sr-meta-value">₹${i.extra_cost} - <span style="font-size:0.8rem">${i.extra_cost_reason || 'No reason'}</span></div>
            </div>` : ''}
          ${i.assignment_status === 'declined' ? `
            <div style="padding:12px;border-radius:12px;background:rgba(239,68,68,0.1);border:1px solid var(--danger);margin-top:10px;">
              <div class="sr-meta-label" style="color:var(--danger)">Employee Declined</div>
              <div class="sr-meta-value" style="font-size:0.85rem">${i.decline_reason || 'No reason provided'}</div>
            </div>` : ''}
          ${assignmentLocked ? `
            <div style="padding:12px;border-radius:12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);margin-top:10px;">
              <div class="sr-meta-label" style="color:var(--warning)">${assignmentAwaitingResponse ? 'Waiting for employee response' : 'Assignment locked'}</div>
              <div class="sr-meta-value" style="font-size:0.85rem">${assignmentLockText}</div>
            </div>` : ''}
          ${i.feedback_rating ? `
            <div class="sr-fb-shown">
              ${ICONS.star}
              <div>
                <div class="sr-meta-label">Customer feedback (${i.feedback_rating}/5)</div>
                <div class="sr-meta-value">${i.feedback_comment || 'No comment.'}</div>
              </div>
            </div>` : ''}
        </div>

        ${hasBill ? `
          <div class="bill-breakdown" style="margin-bottom:16px; background:#f8fafc; padding:15px; border-radius:12px; border:1px solid #eef2f7;">
            <div style="font-size:0.7rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px;">Generated Bill Detail</div>
            <div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;"><span>Services subtotal</span><b style="color:#0f172a;">${money(i.bill_amount)}</b></div>
            <div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;"><span>Platform fee</span><b style="color:#0f172a;">${money(i.platform_fee)}</b></div>
            <div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;"><span>Transport (${Number(i.transport_km || 0).toFixed(1)} km)</span><b style="color:#0f172a;">${money(i.transport_fee)}</b></div>
            ${Number(i.discount_amount) > 0 ? `<div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px; color:#059669;"><span>Loyalty discount</span><b>−${money(i.discount_amount)}</b></div>` : ''}
            <div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;"><span>GST (18%)</span><b style="color:#0f172a;">${money(i.gst_amount)}</b></div>
            <div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.95rem; margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0; font-weight:800; color:#10b981;"><span>Total Payable</span><b>${money(i.bill_total)}</b></div>
            <button type="button" class="btn btn-primary btn-wide" id="view-bill-btn" style="margin-top:12px; background:#10b981; border:none; box-shadow:0 4px 12px rgba(16,185,129,0.2);">📄 View & Download Premium Bill</button>
          </div>` : ''}

        <div class="form-group">
          <label>Assign to Technician</label>
          <select id="assign-to" ${assignmentLocked ? 'disabled' : ''}>
            <option value="">— None —</option>
            ${availableEmployees.map(e => `<option value="${e.id}" ${i.assigned_employee_id === e.id ? 'selected' : ''} ${e._clockedIn ? '' : 'disabled'}>${e._clockedIn ? 'Online' : (restrictedEmployeeIds.has(e.id) ? 'Restricted' : 'Offline')} - ${e.full_name}</option>`).join('')}
          </select>
          <small style="display:block;margin-top:8px;color:var(--text-dim);font-size:0.78rem;">${assignmentLocked ? 'Already assigned. Save is disabled to prevent duplicate assignment.' : 'Only currently clocked-in employees with no strict clock-out restriction can receive new assignments.'}</small>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ci2">Close</button>
        <button class="btn btn-primary" id="save-sr" ${assignmentLocked ? 'disabled' : ''}>${ICONS.check}<span>${assignmentLocked ? 'Already assigned' : 'Save assignment'}</span></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ci').onclick = overlay.querySelector('#ci2').onclick = () => overlay.remove();

  if (hasBill) {
    overlay.querySelector('#view-bill-btn').onclick = () => {
      const servicesSubtotal = Math.max(0, Number(i.bill_amount || 0) - Number(i.extra_cost || 0));
      openPremiumBillModal({
        customer: {
          name: i.full_name, phone: i.phone, location: i.location,
          company: i.company_name, device_type: i.device_type,
          device_serial: i.device_serial_no, service_item: i.service_item,
          ticket_no: i.ticket_no,
        },
        technician: technicianName,
        services: billServices,
        servicesSubtotal,
        extra: Number(i.extra_cost) || 0,
        extraReason: i.extra_cost_reason || '',
        platform: Number(i.platform_fee) || 0,
        km: Number(i.transport_km) || 0,
        transport: Number(i.transport_fee) || 0,
        discount: Number(i.discount_amount) || 0,
        taxable: (servicesSubtotal + Number(i.extra_cost || 0) + Number(i.platform_fee || 0) + Number(i.transport_fee || 0)) - Number(i.discount_amount || 0),
        gst: Number(i.gst_amount) || 0,
        total: Number(i.bill_total) || 0,
        paymentLink: i.payment_link || '',
      }, { allowShare: false, title: '📄 Bill (Sent to Client)' });
    };
  }

  overlay.querySelector('#save-sr').onclick = async () => {
    if (assignmentLocked) {
      toast('This request is already assigned. It can only be reassigned if the employee declines it.', 'warning');
      return;
    }
    const empId = overlay.querySelector('#assign-to').value;
    if (empId && !activeEmployeeIds.has(empId)) {
      toast('This employee is not clocked in. Please choose an active technician.', 'warning');
      return;
    }

    const btn = overlay.querySelector('#save-sr');
    btn.disabled = true;
    btn.innerHTML = `<span>Saving…</span>`;

    const updates = {
      assigned_employee_id: empId || null,
    };

    // Reassigning (or assigning fresh) resets the acceptance handshake.
    if (empId && i.assigned_employee_id !== empId) {
      updates.assignment_status = 'pending';
      updates.decline_reason = null;
    } else if (!empId) {
      updates.assignment_status = null;
    }

    // If newly assigned and no ticket exists yet, create a ticket and link it.
    if (empId && !i.ticket_id) {
      const { data: existingClient } = await supabase.from('profiles')
        .select('id').eq('phone', i.phone).maybeSingle();

      const { data: ticket, error: tErr } = await supabase.from('tickets').insert({
        title: `Service: ${(i.service_item || '').slice(0, 30)}`,
        description: `Ticket ${i.ticket_no || ''} from ${i.full_name} (${i.phone}). ${i.service_item || ''}${i.description ? `\n\nCustomer says: ${i.description}` : ''}`,
        assigned_to: empId,
        client_id: existingClient ? existingClient.id : null,
        status: 'assigned',
        category: 'service_request',
      }).select().single();

      if (tErr) {
        toast(tErr.message, 'error');
        btn.disabled = false;
        btn.innerHTML = `${ICONS.check}<span>Save assignment</span>`;
        return;
      }
      updates.ticket_id = ticket.id;
      updates.status = 'assigned';
    } else if (empId && i.ticket_id) {
      await supabase.from('tickets').update({ assigned_to: empId, status: 'assigned' }).eq('id', i.ticket_id);
      updates.status = 'assigned';
    }

    const { error } = await supabase.from('inquiries').update(updates).eq('id', i.id);
    if (error) {
      toast(error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `${ICONS.check}<span>Save assignment</span>`;
      return;
    }

    toast('Technician assigned', 'success');
    overlay.remove();
    onDone();
  };
}

// ── ATTENDANCE ────────────────────────────────────────
export async function renderAttendance(container) {
  const { data: logs } = await supabase.from('attendance').select('*, profiles(full_name)').order('date', { ascending: false });
  const list = logs || [];
  const today = new Date().toLocaleDateString('en-CA');

  const todayLogs = list.filter(x => x.date === today);
  const activeLogs = list.filter(x => isValidActiveAttendance(x, today));
  const forgottenLogs = list.filter(x => isForgottenClockOut(x, today));
  const forgottenByEmployee = groupedForgottenClockouts(list);
  const restrictedEmployees = [...forgottenByEmployee.entries()]
    .filter(([, rows]) => rows.length >= STRICT_CLOCKOUT_LIMIT)
    .map(([userId, rows]) => ({
      userId,
      rows: rows.sort((a, b) => new Date(b.clock_in || 0) - new Date(a.clock_in || 0)),
      name: rows[0]?.profiles?.full_name || 'Employee',
    }))
    .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
  const completedToday = todayLogs.filter(x => x.clock_in && x.clock_out);
  const avgMins = completedToday.length
    ? completedToday.reduce((sum, x) => sum + (new Date(x.clock_out) - new Date(x.clock_in)), 0) / completedToday.length / 60000
    : 0;
  const avgHours = avgMins ? `${Math.floor(avgMins / 60)}h ${Math.round(avgMins % 60)}m` : '—';

  const rowHtml = (items) => items.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No records found</td></tr>'
    : items.map(x => {
        const hw = hoursWorked(x.clock_in, x.clock_out);
        return `<tr>
          <td>${formatDate(x.date)}</td>
          <td><b>${x.profiles?.full_name || '—'}</b></td>
          <td><span class="badge badge-open">${formatTime(x.clock_in)}</span></td>
          <td>${x.clock_out
            ? `<span class="badge badge-resolved">${formatTime(x.clock_out)}</span>`
            : isForgottenClockOut(x, today)
              ? '<span class="badge badge-danger">Forgot clock-out</span>'
              : '<span class="badge badge-open">Active</span>'}</td>
          <td>${hw ? `<span style="font-weight:600;color:var(--primary)">${hw}</span>` : '<span style="color:var(--text-dim)">—</span>'}</td>
          <td><small>${x.location || '—'}</small></td>
        </tr>`;
      }).join('');

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Attendance Logs</h1>
        <p>Track employee check-ins and locations</p>
      </div>
      <button class="btn btn-secondary" id="att-export">${ICONS.clipboard}<span>Export CSV</span></button>
    </div>

    <div class="stats-grid" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--primary)">${todayLogs.length}</div>
        <div class="stat-label">Today's Attendance</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">${activeLogs.length}</div>
        <div class="stat-label">Currently Active</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:${forgottenLogs.length ? 'var(--danger)' : 'var(--success)'}">${forgottenLogs.length}</div>
        <div class="stat-label">Forgot Clock-out</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:${restrictedEmployees.length ? 'var(--danger)' : 'var(--success)'}">${restrictedEmployees.length}</div>
        <div class="stat-label">Restricted Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning);font-size:1.6rem">${avgHours}</div>
        <div class="stat-label">Avg Hours Today</div>
      </div>
    </div>

    ${restrictedEmployees.length ? `
      <div class="card" style="margin-bottom:24px;border:1px solid rgba(239,68,68,0.35);">
        <div class="card-header">
          <span class="card-title sr-icon-title">${ICONS.alert}<span>Clock-in Restrictions</span></span>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Missed Clock-outs</th><th>Latest Missed</th><th>Action</th></tr></thead>
              <tbody>
                ${restrictedEmployees.map(x => `
                  <tr>
                    <td><b>${escapeHtml(x.name)}</b></td>
                    <td><span class="badge badge-danger">${x.rows.length}</span></td>
                    <td><small>${formatDateTime(x.rows[0]?.clock_in)}</small></td>
                    <td><button class="btn btn-primary btn-sm resolve-attendance-restriction" data-user-id="${escapeHtml(x.userId)}">Resolve restriction</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="filter-bar" style="margin-bottom:24px; display:flex; gap:12px; flex-wrap:wrap;">
      <div class="search-input-wrap" style="flex:1; min-width:200px;">
        <span>🔍</span>
        <input class="search-input" id="att-search" placeholder="Filter by employee name..."/>
      </div>
      <input type="date" id="att-date" style="padding:10px 16px; border-radius:12px; border:1px solid var(--border); background:var(--bg3); color:var(--text);"/>
      <button class="btn btn-secondary" id="att-clear">Clear</button>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Hours Worked</th><th>Location</th></tr></thead>
          <tbody id="attendance-log-rows">${rowHtml(list)}</tbody>
        </table>
      </div>
    </div>
  `;

  const search = container.querySelector('#att-search');
  const date = container.querySelector('#att-date');

  const doFilter = () => {
    const q = search.value.toLowerCase();
    const d = date.value;
    const filtered = list.filter(x => {
      const matchesName = (x.profiles?.full_name || '').toLowerCase().includes(q);
      const matchesDate = !d || x.date === d;
      return matchesName && matchesDate;
    });
    container.querySelector('#attendance-log-rows').innerHTML = rowHtml(filtered);
  };

  search.oninput = doFilter;
  date.onchange = doFilter;
  container.querySelector('#att-clear').onclick = () => renderAttendance(container);
  container.querySelectorAll('.resolve-attendance-restriction').forEach(btn => {
    btn.onclick = async () => {
      const rows = forgottenByEmployee.get(btn.dataset.userId) || [];
      if (!rows.length) {
        toast('No unresolved missed clock-outs found', 'info');
        renderAttendance(container);
        return;
      }

      const restore = setButtonLoading(btn, 'Resolving');
      const updates = await Promise.all(rows.map(row => supabase.from('attendance')
        .update({ clock_out: resolvedClockOutFor(row) })
        .eq('id', row.id)));
      restore();

      const error = updates.find(result => result.error)?.error;
      if (error) {
        toast(error.message || 'Could not resolve restriction', 'error');
        return;
      }
      toast('Restriction resolved', 'success');
      renderAttendance(container);
    };
  });
  container.querySelector('#att-export').onclick = () => {
    const csvData = list.map(x => ({
      date: x.date,
      employee: x.profiles?.full_name || '',
      clock_in: formatTime(x.clock_in),
      clock_out: x.clock_out ? formatTime(x.clock_out) : 'Active',
      hours_worked: hoursWorked(x.clock_in, x.clock_out) || '',
      location: x.location || '',
    }));
    exportToCSV('attendance.csv', csvData);
  };
}

async function openAdminRequestModal(onDone) {
  const today = new Date().toLocaleDateString('en-CA');
  const [{ data: employees }, { data: pricing }, { data: activeAttendance }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, phone').eq('role', 'employee'),
    supabase.from('service_pricing').select('category').order('category'),
    supabase.from('attendance').select('user_id,clock_in,clock_out,date'),
  ]);
  const missedByEmployee = groupedForgottenClockouts(activeAttendance || []);
  const restrictedEmployeeIds = new Set([...missedByEmployee.entries()]
    .filter(([, rows]) => rows.length >= STRICT_CLOCKOUT_LIMIT)
    .map(([userId]) => userId));
  const onlineEmployeeIds = new Set((activeAttendance || [])
    .filter(row => isValidActiveAttendance(row, today) && !restrictedEmployeeIds.has(row.user_id))
    .map(row => row.user_id));
  const onlineEmployees = (employees || []).filter(e => onlineEmployeeIds.has(e.id));

  const seen = new Map();
  (pricing || []).forEach(row => {
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

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:620px">
      <div class="modal-header">
        <span class="modal-title">Register Service Request</span>
        <button class="modal-close" id="admin-request-close">×</button>
      </div>
      <div class="modal-body">
        <div style="padding:12px 14px;border-radius:12px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.18);color:var(--text-soft);font-size:0.84rem;line-height:1.45;margin-bottom:16px;">
          This creates the ticket directly. No OTP is sent. The customer will receive the ticket confirmation SMS, and the assigned employee will receive the job SMS if you assign one.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
          <div class="form-group">
            <label>Customer Name</label>
            <input id="ar-name" type="text" placeholder="Customer name" />
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input id="ar-phone" type="tel" placeholder="10 digit mobile number" />
          </div>
          <div class="form-group">
            <label>Company <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>
            <input id="ar-company" type="text" placeholder="Company / building name" />
          </div>
          <div class="form-group">
            <label>Preferred Time</label>
            <select id="ar-time">
              <option value="As soon as possible">As soon as possible</option>
              <option value="Morning (10 AM - 1 PM)">Morning (10 AM - 1 PM)</option>
              <option value="Afternoon (1 PM - 4 PM)">Afternoon (1 PM - 4 PM)</option>
              <option value="Evening (4 PM - 6 PM)">Evening (4 PM - 6 PM)</option>
              <option value="Tomorrow Morning">Tomorrow Morning</option>
              <option value="Flexible">Flexible</option>
            </select>
          </div>
          <div class="form-group">
            <label>Issue</label>
            <select id="ar-issue">
              <option value="">Select issue</option>
              ${issueOptions.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group" id="ar-other-wrap" style="display:none;">
            <label>Other Issue</label>
            <input id="ar-other" type="text" placeholder="Describe issue" />
          </div>
          <div class="form-group">
            <label>Assign Employee <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>
            <select id="ar-employee">
              <option value="">Create unassigned</option>
              ${onlineEmployees.length
                ? onlineEmployees.map(e => `<option value="${escapeHtml(e.id)}">Online - ${escapeHtml(e.full_name || 'Employee')}${e.phone ? ` - ${escapeHtml(e.phone)}` : ''}</option>`).join('')
                : '<option value="" disabled>No employees online</option>'}
            </select>
            <small style="display:block;margin-top:8px;color:var(--text-dim);font-size:0.78rem;">Only employees currently clocked in with no strict clock-out restriction can be assigned.</small>
          </div>
          <div class="form-group">
            <label>Device Bill No <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>
            <input id="ar-bill" type="text" placeholder="Invoice / bill no" />
          </div>
        </div>
        <div class="form-group">
          <label>Location</label>
          <div style="display:flex;gap:8px;align-items:flex-start;">
            <textarea id="ar-location" rows="3" placeholder="Customer address / landmark" style="flex:1;"></textarea>
            <button type="button" class="btn btn-secondary" id="ar-detect-gps" title="Detect exact client coordinates" style="height:42px;padding:0 12px;display:flex;align-items:center;justify-content:center;">
              ${ICONS.pin}
            </button>
          </div>
          <small id="ar-coords-display" style="display:block;margin-top:6px;color:var(--text-dim);font-size:0.78rem;"></small>
        </div>
        <div class="form-group">
          <label>Description <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>
          <textarea id="ar-description" rows="3" placeholder="Any extra details from the customer"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ar-cancel">Cancel</button>
        <button class="btn btn-primary" id="ar-submit">${ICONS.plus}<span>Create Request</span></button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#admin-request-close').onclick = close;
  overlay.querySelector('#ar-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const issueEl = overlay.querySelector('#ar-issue');
  const otherWrap = overlay.querySelector('#ar-other-wrap');
  issueEl.onchange = () => { otherWrap.style.display = issueEl.value === 'other' ? '' : 'none'; };

  let coords = null;
  const detectBtn = overlay.querySelector('#ar-detect-gps');
  const locationInput = overlay.querySelector('#ar-location');
  const coordsDisplay = overlay.querySelector('#ar-coords-display');
  detectBtn.onclick = async () => {
    const restore = setButtonLoading(detectBtn, 'GPS');
    try {
      const pos = await getHighAccuracyPosition();
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      coords = { lat, lng, accuracy };
      coordsDisplay.innerHTML = `Exact pin saved: <a href="${mapLink(lat, lng)}" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:none;">${lat.toFixed(6)}, ${lng.toFixed(6)}</a> (${Math.round(accuracy)}m accuracy)`;
      try {
        locationInput.value = await reverseGeocode(lat, lng) || `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } catch {
        locationInput.value = `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
      toast('Exact client coordinates captured', 'success');
    } catch (err) {
      console.error('Admin GPS capture failed:', err);
      toast('Could not detect GPS. Check browser location permission.', 'error');
    } finally {
      restore();
    }
  };

  overlay.querySelector('#ar-submit').onclick = async () => {
    const btn = overlay.querySelector('#ar-submit');
    const restore = setButtonLoading(btn, 'Creating');
    try {
      const full_name = overlay.querySelector('#ar-name').value.trim();
      const phone = normalizeAdminPhone(overlay.querySelector('#ar-phone').value);
      const company_name = overlay.querySelector('#ar-company').value.trim();
      const preferred_time = overlay.querySelector('#ar-time').value;
      const issueVal = issueEl.value;
      const issueLabel = issueOptions.find(o => o.value === issueVal)?.label || '';
      const otherText = overlay.querySelector('#ar-other')?.value.trim() || '';
      const assigned_employee_id = overlay.querySelector('#ar-employee').value;
      const location = overlay.querySelector('#ar-location').value.trim();
      const description = overlay.querySelector('#ar-description').value.trim();
      const bill_no = overlay.querySelector('#ar-bill').value.trim();

      if (!full_name) return toast('Customer name is required', 'error');
      if (!phone) return toast('Enter a valid 10 digit phone number', 'error');
      if (!location) return toast('Location is required', 'error');
      if (!issueVal) return toast('Select the issue', 'error');
      if (issueVal === 'other' && !otherText) return toast('Describe the issue', 'error');
      if (assigned_employee_id && !onlineEmployeeIds.has(assigned_employee_id)) {
        return toast('This employee is not online. Choose an online employee or create unassigned.', 'warning');
      }

      const id = crypto.randomUUID();
      const ticket_no = generateAdminTicketNo();
      const service_item = issueVal === 'other' ? `Other: ${otherText}` : issueLabel;

      const { error } = await supabase.from('inquiries').insert({
        id,
        full_name,
        phone,
        company_name: company_name || null,
        location,
        customer_lat: coords?.lat ?? null,
        customer_lng: coords?.lng ?? null,
        bill_no: bill_no || null,
        service_item,
        description: description || null,
        ticket_no,
        preferred_time,
        status: 'open',
        assignment_status: 'none',
      });
      if (error) throw new Error(error.message || 'Could not create request');

      if (assigned_employee_id) {
        const { error: assignError } = await supabase.from('inquiries')
          .update({
            assigned_employee_id,
            assignment_status: 'pending',
            decline_reason: null,
          })
          .eq('id', id);
        if (assignError) throw new Error(assignError.message || 'Request created, but assignment failed');
      }

      toast(`Request ${ticket_no} created`, 'success');
      close();
      if (onDone) onDone();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not create request', 'error');
    } finally {
      restore();
    }
  };
}

export async function renderInquiries(container) {
  const filterKey = container.dataset.srFilter === 'closed' ? 'resolved' : (container.dataset.srFilter || 'active');
  const companyFilter = container.dataset.srCompany || '';
  const [{ data: list, error }, { data: employees }] = await Promise.all([
    supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('role', 'employee'),
  ]);
  if (error) console.warn('[Admin] inquiries load:', error.message);
  const employeeNames = new Map((employees || []).map(e => [e.id, e.full_name]));

  const all = list || [];
  const counts = {
    all: all.length,
    active: all.filter(x => !['resolved','closed'].includes(x.status)).length,
    resolved: all.filter(x => ['resolved','closed'].includes(x.status)).length,
    paid: all.filter(x => x.payment_status === 'paid').length,
    unpaid: all.filter(x => x.bill_amount && x.payment_status !== 'paid').length,
  };
  const statusFiltered = all.filter(x => {
    if (filterKey === 'all') return true;
    if (filterKey === 'active') return !['resolved','closed'].includes(x.status);
    if (filterKey === 'resolved') return ['resolved','closed'].includes(x.status);
    if (filterKey === 'paid') return x.payment_status === 'paid';
    if (filterKey === 'unpaid') return x.bill_amount && x.payment_status !== 'paid';
    return true;
  });
  let filtered = statusFiltered.filter(x => (x.company_name || '').toLowerCase().includes(companyFilter.toLowerCase()));

  const tabs = [
    ['active', 'Active'],
    ['resolved', 'Resolved'],
    ['unpaid', 'Awaiting Payment'],
    ['paid', 'Paid'],
    ['all', 'All'],
  ];

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Service Requests</h1>
        <p>Manage customer service requests, billing and payments</p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="sr-new">${ICONS.plus}<span>Register Request</span></button>
        <button class="btn btn-secondary" id="sr-export">${ICONS.clipboard}<span>Export</span></button>
        <button class="btn btn-secondary" id="sr-refresh">${ICONS.refresh}<span>Refresh</span></button>
      </div>
    </div>

    <div class="sr-filter-bar">
      ${tabs.map(([k, label]) => `
        <button class="sr-filter ${k === filterKey ? 'active' : ''}" data-key="${k}">
          <span>${label}</span><span class="sr-filter-count">${counts[k]}</span>
        </button>
      `).join('')}
    </div>

    <div class="filter-bar" style="margin-bottom:24px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
      <div class="search-input-wrap" style="flex:1; min-width:220px;">
        <span>${ICONS.search}</span>
        <input class="search-input" id="sr-company-filter" placeholder="Filter by company..." value="${companyFilter}"/>
      </div>
      <button class="btn btn-secondary" id="sr-company-clear">Clear Company</button>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket</th><th>Service Date</th><th>Company</th><th>Customer</th><th>Phone</th><th>Service</th>
              <th>Assigned Employee</th><th>Status</th><th>Payment</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-dim)">No requests in this view</td></tr>`
              : filtered.map(x => `<tr>
                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || x.id.slice(0,8)}</code></td>
                  <td><small>${formatDateTime(x.created_at)}</small></td>
                  <td>${x.company_name ? `<b>${x.company_name}</b>` : '<span style="color:var(--text-dim)">—</span>'}</td>
                  <td><b>${x.full_name}</b></td>
                  <td><small style="color:var(--text-dim)">${x.phone || '—'}</small></td>
                  <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.service_item || '—'}</td>
                  <td>${x.assigned_employee_id ? `<b>${employeeNames.get(x.assigned_employee_id) || 'Assigned'}</b>` : '<span style="color:var(--text-dim)">Unassigned</span>'}</td>
                  <td>${statusBadge(x.status)}</td>
                  <td>${x.bill_amount
                      ? (x.payment_status === 'paid'
                          ? '<span class="badge badge-resolved">Paid</span>'
                          : '<span class="badge badge-medium">Unpaid</span>')
                      : '<span style="color:var(--text-dim)">—</span>'}</td>
                  <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#sr-refresh').onclick = () => renderInquiries(container);
  container.querySelector('#sr-new').onclick = () => openAdminRequestModal(() => renderInquiries(container));
  container.querySelector('#sr-company-filter').oninput = (e) => {
    container.dataset.srCompany = e.target.value.trim();
    renderInquiries(container);
  };
  container.querySelector('#sr-company-clear').onclick = () => {
    container.dataset.srCompany = '';
    renderInquiries(container);
  };
  container.querySelector('#sr-export').onclick = () => {
    exportToCSV('service-requests.csv', filtered.map(x => ({
      ticket: x.ticket_no || x.id,
      service_date: x.created_at,
      company: x.company_name || '',
      customer: x.full_name,
      phone: x.phone,
      service: x.service_item || '',
      assigned_employee: x.assigned_employee_id ? (employeeNames.get(x.assigned_employee_id) || 'Assigned') : 'Unassigned',
      status: x.status,
      bill_amount: x.bill_amount || '',
      payment_status: x.payment_status || '',
      location: x.location || '',
    })));
  };
  if (companyFilter) {
    const companyInput = container.querySelector('#sr-company-filter');
    companyInput.focus();
    companyInput.setSelectionRange(companyInput.value.length, companyInput.value.length);
  }
  container.querySelectorAll('.sr-filter').forEach(btn => {
    btn.onclick = () => {
      container.dataset.srFilter = btn.dataset.key;
      renderInquiries(container);
    };
  });
  container.querySelectorAll('.inq-btn').forEach(btn => {
    btn.onclick = () => openInquiryDetailWithLoader(btn, btn.dataset.id, () => renderInquiries(container));
  });
}

export async function renderStocks(container) {
  const { data: stocks } = await supabase.from('stocks').select('*').order('item_name');
  const list = stocks || [];
  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
      <h1>Inventory</h1>
      <button class="btn btn-secondary" id="stocks-export">Export CSV</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Stock</th><th>Status</th></tr></thead>
          <tbody>
            ${list.map(x => `<tr>
              <td>${x.item_name}</td>
              <td><b>${x.quantity}</b> ${x.unit||'pcs'}</td>
              <td><span class="badge badge-${x.quantity <= x.min_stock ? 'urgent' : 'resolved'}">${x.quantity <= x.min_stock ? 'Low' : 'OK'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelector('#stocks-export').onclick = () => exportToCSV('inventory.csv', list.map(x => ({
    item: x.item_name || '',
    quantity: x.quantity ?? '',
    unit: x.unit || '',
    min_stock: x.min_stock ?? '',
    status: (x.quantity <= x.min_stock) ? 'Low' : 'OK',
  })));
}

export async function renderEODReports(container) {
  const { data: reports } = await supabase.from('eod_reports').select('*, profiles(full_name)').order('date', { ascending: false });
  const list = reports || [];

  const render = (items) => {
    container.innerHTML = `
      <div class="page-header">
        <h1>Daily Summaries</h1>
        <p>End-of-day progress reports from staff</p>
      </div>

      <div class="filter-bar" style="margin-bottom:24px; display:flex; gap:12px; flex-wrap:wrap;">
        <div class="search-input-wrap" style="flex:1; min-width:200px;">
          <span>🔍</span>
          <input class="search-input" id="eod-search" placeholder="Filter by staff name..."/>
        </div>
        <input type="date" id="eod-date" style="padding:10px 16px; border-radius:12px; border:1px solid var(--border); background:var(--bg3); color:var(--text);"/>
        <button class="btn btn-secondary" id="eod-clear">Clear</button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Staff</th><th>Summary</th></tr></thead>
            <tbody>
              ${items.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-dim)">No reports found</td></tr>' : 
                items.map(x => `<tr>
                <td>${formatDate(x.date)}</td>
                <td><b>${x.profiles?.full_name || '—'}</b></td>
                <td style="max-width:400px;font-size:.9rem; line-height:1.5; padding:16px 8px;">${x.content}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const search = container.querySelector('#eod-search');
    const date = container.querySelector('#eod-date');
    
    const doFilter = () => {
      const q = search.value.toLowerCase();
      const d = date.value;
      const filtered = list.filter(x => {
        const matchesName = (x.profiles?.full_name || '').toLowerCase().includes(q);
        const matchesDate = !d || x.date === d;
        return matchesName && matchesDate;
      });
      renderItems(filtered);
    };

    search.oninput = doFilter;
    date.onchange = doFilter;
    container.querySelector('#eod-clear').onclick = () => renderEODReports(container);
  };

  const renderItems = (items) => {
    const tbody = container.querySelector('tbody');
    tbody.innerHTML = items.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-dim)">No reports found</td></tr>' : 
      items.map(x => `<tr>
      <td>${formatDate(x.date)}</td>
      <td><b>${x.profiles?.full_name || '—'}</b></td>
      <td style="max-width:400px;font-size:.9rem; line-height:1.5; padding:16px 8px;">${x.content}</td>
    </tr>`).join('');
  };

  render(list);
}

export async function renderAllTickets(container) {
  const { data: tickets } = await supabase.from('tickets').select('*, inquiries(*)').order('created_at', { ascending: false });
  const { data: profiles } = await supabase.from('profiles').select('id, full_name');
  const profileMap = (profiles || []).reduce((acc, p) => ({ ...acc, [p.id]: p.full_name }), {});
  const ticketRows = (tickets || []).map(t => {
    const inq = Array.isArray(t.inquiries) ? t.inquiries[0] : t.inquiries;
    const contact = inq
      ? `<small>${inq.phone || '—'}<br/>${inq.location ? inq.location.slice(0, 20) + '...' : '—'}</small>`
      : '—';
    const action = inq?.id
      ? `<button class="btn btn-primary btn-sm all-ticket-manage" data-id="${inq.id}">Manage</button>`
      : '<span style="color:var(--text-dim);font-size:0.8rem;">No request</span>';
    return `<tr>
      <td><code style="font-size:0.75rem;">#${t.id.slice(0,8)}</code></td>
      <td><b>${inq ? inq.full_name : 'Guest'}</b></td>
      <td>${contact}</td>
      <td>${t.assigned_to ? profileMap[t.assigned_to] || 'Staff' : '<span style="color:var(--text-dim)">Unassigned</span>'}</td>
      <td>${statusBadge(t.status)}</td>
      <td><small>${formatDate(t.created_at)}</small></td>
      <td>${action}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="page-header">
      <h1>All Tickets & Tasks</h1>
      <p>Master list of all service requests and internal tasks</p>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket ID</th>
              <th>Customer</th>
              <th>Contact</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${ticketRows || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No tickets found</td></tr>'}
            ${'' && (tickets||[]).map(t => {
              const inq = t.inquiries?.[0];
              return `<tr>
                <td><code style="font-size:0.75rem;">#${t.id.slice(0,8)}</code></td>
                <td><b>${inq ? inq.full_name : 'Guest'}</b></td>
                <td>${inq ? `<small>${inq.phone}<br/>${inq.location.slice(0,20)}...</small>` : '—'}</td>
                <td>${t.assigned_to ? profileMap[t.assigned_to] || 'Staff' : '<span style="color:var(--text-dim)">Unassigned</span>'}</td>
                <td>${statusBadge(t.status)}</td>
                <td><small>${formatDate(t.created_at)}</small></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelectorAll('.all-ticket-manage').forEach(btn => {
    btn.onclick = () => openInquiryDetailWithLoader(btn, btn.dataset.id, () => renderAllTickets(container));
  });
}

export async function renderLeaveRequests(container) {
  const { data: leaves } = await supabase.from('leave_requests').select('*, profiles(full_name)').order('created_at', { ascending: false });
  const list = leaves || [];

  container.innerHTML = `
    <div class="page-header">
      <h1>Leave Requests</h1>
      <p>Approve or reject employee time-off requests</p>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Dates</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-dim)">No leave requests found</td></tr>' : 
              list.map(x => `
              <tr>
                <td><b>${x.profiles?.full_name || '—'}</b></td>
                <td><small>${formatDate(x.start_date)} to ${formatDate(x.end_date)}</small></td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${x.reason}">${x.reason}</td>
                <td><span class="badge badge-${x.status}">${x.status}</span></td>
                <td>
                  ${x.status === 'pending' ? `
                    <div style="display:flex; gap:8px;">
                      <button class="btn btn-primary btn-sm leave-act" data-id="${x.id}" data-status="approved">Approve</button>
                      <button class="btn btn-danger btn-sm leave-act" data-id="${x.id}" data-status="rejected">Reject</button>
                    </div>
                  ` : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelectorAll('.leave-act').forEach(btn => {
    btn.onclick = async () => {
      const status = btn.dataset.status;
      const { error } = await supabase.from('leave_requests').update({ status }).eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast(`Request ${status}`, 'success'); renderLeaveRequests(container); }
    };
  });
}

// ── CONTACTS (from Service Requests) ────────────────────
export async function renderSalaryOverview(container) {
  const monthKey = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const [{ data: profiles }, { data: attendance }, { data: leaves }] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'employee').order('full_name', { ascending: true }),
    supabase.from('attendance').select('*').order('date', { ascending: false }),
    supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
  ]);

  const rows = (profiles || []).map(emp => {
    const monthAttendance = (attendance || []).filter(x => x.user_id === emp.id && String(x.date || '').startsWith(monthKey));
    const presentDays = new Set(monthAttendance.map(x => x.date)).size;
    const approvedLeaveDays = (leaves || [])
      .filter(x => x.employee_id === emp.id && x.status === 'approved' && String(x.start_date || '').startsWith(monthKey))
      .reduce((sum, x) => sum + daysBetweenInclusive(x.start_date, x.end_date), 0);
    const monthlySalary = Number(emp.salary) || 0;
    const payableDays = presentDays + approvedLeaveDays;
    return { ...emp, presentDays, approvedLeaveDays, payableDays, monthlySalary, estimated: (monthlySalary / daysInMonth) * payableDays };
  });

  const totalEstimated = rows.reduce((sum, x) => sum + x.estimated, 0);
  const totalMonthly = rows.reduce((sum, x) => sum + x.monthlySalary, 0);

  container.innerHTML = `
    <div class="page-header">
      <h1>Salary Overview</h1>
      <p>Attendance-based salary estimate for ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${rows.length}</div><div class="stat-label">Employees</div></div>
      <div class="stat-card"><div class="stat-value" style="font-size:1.8rem">${money(totalMonthly)}</div><div class="stat-label">Monthly Payroll</div></div>
      <div class="stat-card"><div class="stat-value" style="font-size:1.8rem;color:var(--warning)">${money(totalEstimated)}</div><div class="stat-label">Estimated Earned</div></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Monthly Salary</th><th>Present</th><th>Approved Leave</th><th>Payable Days</th><th>Estimated Earned</th></tr></thead>
          <tbody>
            ${rows.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No employees found</td></tr>' :
              rows.map(x => `<tr>
                <td><b>${x.full_name || '—'}</b></td>
                <td>${money(x.monthlySalary)}</td>
                <td><span class="badge badge-open">${x.presentDays}</span></td>
                <td><span class="badge badge-resolved">${x.approvedLeaveDays}</span></td>
                <td>${x.payableDays} / ${daysInMonth}</td>
                <td><b style="color:var(--primary)">${money(x.estimated)}</b></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function renderContacts(container) {
  const filterKey = container.dataset.contactFilter || 'all';

  const { data: list, error } = await supabase.from('inquiries')
    .select('*').order('created_at', { ascending: false });
  if (error) console.warn('[Admin] contacts load:', error.message);

  const all = list || [];
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfDay - now.getDay() * 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const inRange = (x, ms) => new Date(x.created_at).getTime() >= ms;

  const uniqueByPhone = (rows) => {
    const seen = new Map();
    rows.forEach(r => { if (r.phone && !seen.has(r.phone)) seen.set(r.phone, r); });
    return [...seen.values()];
  };

  const counts = {
    all: all.length,
    today: all.filter(x => inRange(x, startOfDay)).length,
    week: all.filter(x => inRange(x, startOfWeek)).length,
    month: all.filter(x => inRange(x, startOfMonth)).length,
    unique: uniqueByPhone(all).length,
  };

  let filtered;
  if (filterKey === 'today') filtered = all.filter(x => inRange(x, startOfDay));
  else if (filterKey === 'week') filtered = all.filter(x => inRange(x, startOfWeek));
  else if (filterKey === 'month') filtered = all.filter(x => inRange(x, startOfMonth));
  else if (filterKey === 'unique') filtered = uniqueByPhone(all);
  else filtered = all;

  const tabs = [
    ['all', 'All'],
    ['today', 'Today'],
    ['week', 'This Week'],
    ['month', 'This Month'],
    ['unique', 'Unique Customers'],
  ];

  const digits = (p) => String(p || '').replace(/\D/g, '');

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Contacts</h1>
        <p>Customer contact details collected from service requests</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary" id="contacts-export">Export CSV</button>
        <button class="btn btn-secondary" id="contacts-refresh">${ICONS.refresh}<span>Refresh</span></button>
      </div>
    </div>

    <div class="sr-filter-bar">
      ${tabs.map(([k, label]) => `
        <button class="sr-filter ${k === filterKey ? 'active' : ''}" data-key="${k}">
          <span>${label}</span><span class="sr-filter-count">${counts[k]}</span>
        </button>
      `).join('')}
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Phone</th><th>Location</th>
              <th>Service</th><th>Date</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No contacts in this view</td></tr>`
              : filtered.map(x => {
                  const d = digits(x.phone);
                  return `<tr>
                    <td><b>${x.full_name || '—'}</b></td>
                    <td><span class="sr-mono">${x.phone || '—'}</span></td>
                    <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(x.location||'').replace(/"/g,'&quot;')}">${x.location || '—'}</td>
                    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.service_item || '—'}</td>
                    <td>${formatDate(x.created_at)}</td>
                    <td>
                      <div class="contact-actions">
                        <a class="contact-act contact-call" href="tel:${d}" title="Call">${ICONS.phone}</a>
                        <a class="contact-act contact-wa" href="https://wa.me/${d}" target="_blank" rel="noopener" title="WhatsApp">${ICONS.whatsapp}</a>
                        <button class="contact-act contact-copy" data-phone="${x.phone || ''}" title="Copy number">${ICONS.clipboard}</button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#contacts-refresh').onclick = () => renderContacts(container);
  container.querySelector('#contacts-export').onclick = () => exportToCSV('contacts.csv',
    filtered.map(x => ({
      name: x.full_name, phone: x.phone, location: x.location,
      service: x.service_item, ticket_no: x.ticket_no, date: x.created_at,
    }))
  );

  container.querySelectorAll('.sr-filter').forEach(btn => {
    btn.onclick = () => {
      container.dataset.contactFilter = btn.dataset.key;
      renderContacts(container);
    };
  });

  container.querySelectorAll('.contact-copy').forEach(btn => {
    btn.onclick = async () => {
      const phone = btn.dataset.phone;
      if (!phone) return;
      try {
        await navigator.clipboard.writeText(phone);
        toast('Phone number copied', 'success');
      } catch {
        toast('Copy failed', 'error');
      }
    };
  });
}

export async function renderClients(container) {
  const { data: clients } = await supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false });
  const list = clients || [];
  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
      <h1>Clients</h1>
      <button class="btn btn-secondary" id="clients-export">Export CSV</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Company</th></tr></thead>
          <tbody>${list.map(c => `<tr>
            <td><b>${c.full_name||'—'}</b></td>
            <td>${c.email||'—'}</td>
            <td>${c.company||'—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
  container.querySelector('#clients-export').onclick = () => exportToCSV('clients.csv', list.map(c => ({
    name: c.full_name || '',
    email: c.email || '',
    phone: c.phone || '',
    company: c.company || '',
    address: c.address || '',
    created_at: c.created_at || '',
  })));
}

export async function renderUsers(container) {
  const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>User Management</h1></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Current Role</th><th>Change Role</th><th>SMS Phone</th><th>Service Access</th><th>Update</th></tr></thead>
          <tbody>${(users||[]).map(u => `<tr>
            <td><b>${u.full_name||'—'}</b></td>
            <td><span class="badge badge-open">${u.role||'client'}</span></td>
            <td>
              <select class="role-select" data-uid="${u.id}" style="width:auto;padding:4px 8px;border-radius:8px;box-shadow:var(--neu-inner);border:none;background:var(--bg);">
                <option ${u.role==='client'?'selected':''} value="client">Client</option>
                <option ${u.role==='employee'?'selected':''} value="employee">Staff</option>
                <option ${u.role==='admin'?'selected':''} value="admin">Admin</option>
              </select>
            </td>
            <td>
              <input class="employee-phone-input" data-uid="${u.id}" type="tel" inputmode="numeric" maxlength="14"
                     placeholder="9876543210" value="${escapeHtml((u.phone || '').replace(/^\\+91\\s*/, ''))}"
                     style="width:150px;padding:7px 10px;border-radius:8px;box-shadow:var(--neu-inner);border:none;background:var(--bg);"/>
              <small style="display:block;color:var(--text-dim);margin-top:4px;">Used for staff job SMS</small>
            </td>
            <td>
              ${u.role === 'employee' ? `
                <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" class="can-add-service-chk" data-uid="${u.id}" ${u.can_add_service ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
                  Add Service
                </label>
              ` : '<span style="color:var(--text-dim)">—</span>'}
            </td>
            <td>
              <button class="btn btn-secondary btn-sm save-user-phone" data-uid="${u.id}">Save Phone</button>
            </td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
  container.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      await supabase.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.uid);
      toast('Role updated', 'success');
      renderUsers(container);
    });
  });
  container.querySelectorAll('.can-add-service-chk').forEach(chk => {
    chk.addEventListener('change', async () => {
      const { error } = await supabase.from('profiles').update({ can_add_service: chk.checked ? 1 : 0 }).eq('id', chk.dataset.uid);
      if (error) {
        toast('Failed to update service access: ' + (error.message || ''), 'error');
        chk.checked = !chk.checked;
        return;
      }
      toast('Service access updated', 'success');
    });
  });
  container.querySelectorAll('.employee-phone-input').forEach(input => {
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '');
      if (v.length > 10 && v.startsWith('91')) v = v.slice(2);
      else if (v.length === 11 && v.startsWith('0')) v = v.slice(1);
      input.value = v.slice(0, 10);
    });
  });
  container.querySelectorAll('.save-user-phone').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = container.querySelector(`.employee-phone-input[data-uid="${btn.dataset.uid}"]`);
      const digits = (input?.value || '').replace(/\D/g, '');
      if (digits && !/^[6-9]\d{9}$/.test(digits)) {
        toast('Enter a valid 10-digit Indian mobile number', 'error');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving...';
      const { error } = await supabase.from('profiles').update({ phone: digits ? `+91${digits}` : null }).eq('id', btn.dataset.uid);
      btn.disabled = false;
      btn.textContent = 'Save Phone';
      if (error) {
        toast('Phone update failed: ' + (error.message || ''), 'error');
        return;
      }
      toast('Employee SMS phone saved', 'success');
    });
  });
}

export async function renderPaymentsTab(container) {
  const { data: payments } = await supabase.from('inquiries').select('*').order('created_at', { ascending: false });
  const list = (payments || []).filter(x => x.bill_amount != null && Number(x.bill_amount) > 0);

  const totalPaid = list.filter(x=>x.payment_status==='paid').reduce((acc,x)=>acc+(Number(x.bill_amount)||0), 0);
  const totalPending = list.filter(x=>x.payment_status!=='paid').reduce((acc,x)=>acc+(Number(x.bill_amount)||0), 0);

  const rowHtml = (items) => items.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No payment records yet</td></tr>'
    : items.map(x => `
      <tr>
        <td><code style="font-size:0.75rem;">${x.ticket_no || x.id.slice(0,8)}</code></td>
        <td><b>${x.full_name}</b><br/><small style="color:var(--text-dim)">${x.phone}</small></td>
        <td>₹${Number(x.bill_amount).toLocaleString('en-IN')}</td>
        <td><span class="badge badge-${x.payment_status === 'paid' ? 'resolved' : 'medium'}">${x.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</span></td>
        <td>${x.payment_link
          ? `<a href="${x.payment_link}" target="_blank" style="color:var(--primary);font-size:0.8rem;">View Link</a>`
          : '<span style="color:var(--text-dim);font-size:0.8rem;">No link</span>'}</td>
        <td>${x.payment_status !== 'paid'
          ? `<button class="btn btn-secondary btn-sm mark-paid-btn" data-id="${x.id}" style="white-space:nowrap">✓ Mark Paid</button>`
          : '<span style="color:var(--success);font-size:0.8rem;font-weight:700;">✓ Done</span>'}</td>
        <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Details</button></td>
      </tr>`).join('');

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Payment Tracker</h1>
        <p>Monitor revenue and billing status</p>
      </div>
      <button class="btn btn-secondary" id="pay-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>

    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">₹${totalPaid.toLocaleString('en-IN')}</div>
        <div class="stat-label">Total Received</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning)">₹${totalPending.toLocaleString('en-IN')}</div>
        <div class="stat-label">Pending Payments</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--primary)">${list.filter(x=>x.payment_status==='paid').length} / ${list.length}</div>
        <div class="stat-label">Paid / Total Bills</div>
      </div>
    </div>

    <div class="filter-bar" style="margin-bottom:16px; display:flex; gap:12px; flex-wrap:wrap;">
      <div class="search-input-wrap" style="flex:1; min-width:200px;">
        <span>🔍</span>
        <input class="search-input" id="pay-search" placeholder="Search by name or ticket…"/>
      </div>
      <div class="sr-filter-bar" id="pay-status-tabs">
        <button class="sr-filter active" data-status="all">All <span class="sr-filter-count">${list.length}</span></button>
        <button class="sr-filter" data-status="unpaid">Unpaid <span class="sr-filter-count">${list.filter(x=>x.payment_status!=='paid').length}</span></button>
        <button class="sr-filter" data-status="paid">Paid <span class="sr-filter-count">${list.filter(x=>x.payment_status==='paid').length}</span></button>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Ticket</th><th>Customer</th><th>Bill</th><th>Status</th><th>Link</th><th></th><th></th></tr>
          </thead>
          <tbody>${rowHtml(list)}</tbody>
        </table>
      </div>
    </div>
  `;

  let activeStatus = 'all';
  let searchQ = '';

  const filterAndRender = () => {
    const filtered = list.filter(x => {
      const matchStatus = activeStatus === 'all' ? true : activeStatus === 'paid' ? x.payment_status === 'paid' : x.payment_status !== 'paid';
      const matchSearch = !searchQ || x.full_name.toLowerCase().includes(searchQ) || (x.ticket_no || '').toLowerCase().includes(searchQ);
      return matchStatus && matchSearch;
    });
    container.querySelector('tbody').innerHTML = rowHtml(filtered);
    bindRowActions();
  };

  const bindRowActions = () => {
    container.querySelectorAll('.inq-btn').forEach(btn => {
      btn.onclick = () => openInquiryDetailWithLoader(btn, btn.dataset.id, () => renderPaymentsTab(container));
    });
    container.querySelectorAll('.mark-paid-btn').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = '…';
        const row = list.find(x => String(x.id) === String(btn.dataset.id));
        const error = row ? await markInquiryPaid(row) : { message: 'Payment row not found' };
        if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = '✓ Mark Paid'; }
        else { toast('Marked as paid and status updated', 'success'); renderPaymentsTab(container); }
      };
    });
  };

  container.querySelector('#pay-refresh').onclick = () => renderPaymentsTab(container);
  container.querySelector('#pay-search').oninput = (e) => { searchQ = e.target.value.toLowerCase(); filterAndRender(); };
  container.querySelectorAll('#pay-status-tabs .sr-filter').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('#pay-status-tabs .sr-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      filterAndRender();
    };
  });

  bindRowActions();
}

// ── BILLS ────────────────────────────────────────────────
// Lists every inquiry that has a generated bill (bill_total > 0). Admin
// can open the same premium template the employee sent, and download a
// PDF copy. Read-only — no edits, no re-share.
export async function renderBillsTab(container) {
  const { data: rows } = await supabase.from('inquiries').select('*').order('bill_generated_at', { ascending: false });
  const list = (rows || []).filter(x => Number(x.bill_total) > 0);

  const totalBilled = list.reduce((acc, x) => acc + (Number(x.bill_total) || 0), 0);
  const totalReceived = list.filter(x => x.payment_status === 'paid').reduce((acc, x) => acc + (Number(x.bill_total) || 0), 0);
  const totalPending = totalBilled - totalReceived;

  const dateOf = (x) => {
    const d = x.bill_generated_at || x.created_at;
    if (!d) return '—';
    try {
      const dt = new Date(d.replace(' ', 'T'));
      return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return d; }
  };

  const rowHtml = (items) => items.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim)">No bills generated yet</td></tr>'
    : items.map(x => `
      <tr>
        <td><small style="color:var(--text-dim)">${dateOf(x)}</small></td>
        <td><code style="font-size:0.75rem;">${x.ticket_no || (x.id || '').slice(0,8)}</code></td>
        <td><b>${x.full_name || '—'}</b><br/><small style="color:var(--text-dim)">${x.phone || ''}</small></td>
        <td>${x.device_type || '<span style="color:var(--text-dim)">—</span>'}<br/><small style="color:var(--text-dim)">${x.device_serial_no || ''}</small></td>
        <td><b>₹${Math.round(Number(x.bill_total)).toLocaleString('en-IN')}</b></td>
        <td><span class="badge badge-${x.payment_status === 'paid' ? 'resolved' : 'medium'}">${x.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</span></td>
        <td><button class="btn btn-primary btn-sm bill-view-btn" data-id="${x.id}">📄 View</button></td>
        <td><button class="btn btn-secondary btn-sm bill-share-btn" data-id="${x.id}" title="Get shareable PDF link">🔗 Share</button></td>
      </tr>`).join('');

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Bills</h1>
        <p>All invoices generated by technicians — open any bill to view or download the PDF</p>
      </div>
      <button class="btn btn-secondary" id="bills-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>

    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--primary)">${list.length}</div>
        <div class="stat-label">Total Bills</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">₹${Math.round(totalReceived).toLocaleString('en-IN')}</div>
        <div class="stat-label">Received</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning)">₹${Math.round(totalPending).toLocaleString('en-IN')}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size:1.7rem;">₹${Math.round(totalBilled).toLocaleString('en-IN')}</div>
        <div class="stat-label">Total Billed</div>
      </div>
    </div>

    <div class="filter-bar" style="margin-bottom:16px; display:flex; gap:12px; flex-wrap:wrap;">
      <div class="search-input-wrap" style="flex:1; min-width:200px;">
        <span>🔍</span>
        <input class="search-input" id="bills-search" placeholder="Search by name, ticket, device, serial…"/>
      </div>
      <div class="sr-filter-bar" id="bills-status-tabs">
        <button class="sr-filter active" data-status="all">All <span class="sr-filter-count">${list.length}</span></button>
        <button class="sr-filter" data-status="paid">Paid <span class="sr-filter-count">${list.filter(x=>x.payment_status==='paid').length}</span></button>
        <button class="sr-filter" data-status="unpaid">Unpaid <span class="sr-filter-count">${list.filter(x=>x.payment_status!=='paid').length}</span></button>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Device</th><th>Total</th><th>Payment</th><th></th><th></th></tr>
          </thead>
          <tbody>${rowHtml(list)}</tbody>
        </table>
      </div>
    </div>
  `;

  let activeStatus = 'all';
  let searchQ = '';

  const filterAndRender = () => {
    const filtered = list.filter(x => {
      const matchStatus = activeStatus === 'all' ? true
        : activeStatus === 'paid' ? x.payment_status === 'paid'
        : x.payment_status !== 'paid';
      const hay = `${x.full_name || ''} ${x.ticket_no || ''} ${x.device_type || ''} ${x.device_serial_no || ''}`.toLowerCase();
      return matchStatus && (!searchQ || hay.includes(searchQ));
    });
    container.querySelector('tbody').innerHTML = rowHtml(filtered);
    bindRowActions();
  };

  const buildBillData = async (row) => {
    const technicianName = row.assigned_employee_id
      ? ((await supabase.from('profiles').select('full_name').eq('id', row.assigned_employee_id).single()).data?.full_name || '')
      : '';
    const { data: links } = await supabase.from('inquiry_services')
      .select('service_id, service_pricing(name, category, sub_category, sub_sub_category, cost)')
      .eq('inquiry_id', row.id);
    const services = (links || []).map(r => {
      const p = r.service_pricing || {};
      const parts = [p.category, p.sub_category, p.sub_sub_category || p.name].filter(Boolean);
      return { name: parts.join(' › '), cost: Number(p.cost) || 0 };
    });
    const servicesSubtotal = Math.max(0, Number(row.bill_amount || 0) - Number(row.extra_cost || 0));
    return {
      customer: {
        name: row.full_name, phone: row.phone, location: row.location,
        company: row.company_name, device_type: row.device_type,
        device_serial: row.device_serial_no, service_item: row.service_item,
        ticket_no: row.ticket_no,
      },
      technician: technicianName,
      services,
      servicesSubtotal,
      extra: Number(row.extra_cost) || 0,
      extraReason: row.extra_cost_reason || '',
      platform: Number(row.platform_fee) || 0,
      km: Number(row.transport_km) || 0,
      transport: Number(row.transport_fee) || 0,
      discount: Number(row.discount_amount) || 0,
      taxable: (servicesSubtotal + Number(row.extra_cost || 0) + Number(row.platform_fee || 0) + Number(row.transport_fee || 0)) - Number(row.discount_amount || 0),
      gst: Number(row.gst_amount) || 0,
      total: Number(row.bill_total) || 0,
      paymentLink: row.payment_link || '',
    };
  };

  const bindRowActions = () => {
    container.querySelectorAll('.bill-view-btn').forEach(btn => {
      btn.onclick = async () => {
        const row = list.find(x => String(x.id) === String(btn.dataset.id));
        if (!row) return;
        const billData = await buildBillData(row);
        openPremiumBillModal(billData, { allowShare: false, title: '📄 Bill (Sent to Client)' });
      };
    });

    container.querySelectorAll('.bill-share-btn').forEach(btn => {
      btn.onclick = async () => {
        const row = list.find(x => String(x.id) === String(btn.dataset.id));
        if (!row) return;
        const restore = setButtonLoading(btn, 'Preparing…');
        let billData;
        try { billData = await buildBillData(row); } finally { restore(); }
        showBillShareModal(row, billData);
      };
    });
  };


  container.querySelector('#bills-refresh').onclick = () => renderBillsTab(container);
  container.querySelector('#bills-search').oninput = (e) => { searchQ = e.target.value.toLowerCase(); filterAndRender(); };
  container.querySelectorAll('#bills-status-tabs .sr-filter').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('#bills-status-tabs .sr-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      filterAndRender();
    };
  });

  bindRowActions();
}

// ── BILL SHARE MODAL ────────────────────────────────────
// Shows a copyable public PDF link for sharing with the client.
async function showBillShareModal(row, billData) {
  // Overlay with a spinner while we generate/upload the PDF
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:480px;width:100%;">
      <div class="modal-header">
        <h3>🔗 Share Bill with Client</h3>
        <button class="btn-icon" id="bsm-close">✕</button>
      </div>
      <div class="modal-body" style="padding:24px;">
        <div id="bsm-loading" style="text-align:center;padding:20px 0;">
          <div class="spinner" style="margin:0 auto 12px;"></div>
          <p style="color:var(--text-dim);font-size:14px;">Generating PDF…</p>
        </div>
        <div id="bsm-content" style="display:none;">
          <p style="font-size:13px;color:var(--text-dim);margin-bottom:12px;">Copy this public link and send it to the client — they can open and download the PDF without logging in.</p>
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="bsm-url" readonly style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text);" value="" />
            <button class="btn btn-primary" id="bsm-copy" style="white-space:nowrap;">📋 Copy</button>
          </div>
          <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
            <a id="bsm-open" target="_blank" rel="noopener" class="btn btn-secondary" style="text-decoration:none;">🌐 Open PDF</a>
            <button class="btn btn-secondary" id="bsm-whatsapp">📱 Send via WhatsApp</button>
          </div>
        </div>
        <div id="bsm-error" style="display:none;color:var(--danger);font-size:14px;"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#bsm-close').onclick = () => overlay.remove();

  try {
    const url = await shareBillToPublicLink(billData, {
      inquiryId: row.id,
      existingUrl: row.bill_pdf_url || null,
    });
    // Store the URL back on the row so next click is instant
    row.bill_pdf_url = url;

    overlay.querySelector('#bsm-loading').style.display = 'none';
    overlay.querySelector('#bsm-content').style.display = 'block';

    const urlInput = overlay.querySelector('#bsm-url');
    urlInput.value = url;

    overlay.querySelector('#bsm-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied to clipboard!', 'success');
      } catch {
        urlInput.select();
        document.execCommand('copy');
        toast('Link copied!', 'success');
      }
    };
    overlay.querySelector('#bsm-open').href = url;

    overlay.querySelector('#bsm-whatsapp').onclick = () => {
      const phone = (row.phone || '').replace(/\D/g, '');
      if (!phone) { toast('No phone number on this bill', 'error'); return; }
      const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
      const msg = [
        `Hi ${row.full_name || ''}! 👋`,
        `Your service invoice from *Networking Experts* is ready.`,
        `Ticket: *${row.ticket_no || '—'}* · Total: *${inr(row.bill_total)}*`,
        '',
        `📄 View / download bill PDF:`,
        url,
        '',
        '— Networking Experts',
      ].join('\n');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    };
  } catch (err) {
    console.error('[showBillShareModal]', err);
    overlay.querySelector('#bsm-loading').style.display = 'none';
    overlay.querySelector('#bsm-error').style.display = 'block';
    overlay.querySelector('#bsm-error').textContent = `Failed to generate PDF: ${err.message}`;
  }
}


// ── DEVICE TYPES (admin master list) ─────────────────────
// Simple CRUD. Employees see this list as a datalist on the Manage Service
// modal so they pick standard device types instead of typing free-form.
export async function renderDeviceTypesTab(container) {
  const [
    { data: rows },
    { data: compRows },
    { data: inqs }
  ] = await Promise.all([
    supabase.from('device_types').select('*').order('name'),
    supabase.from('companies').select('*').order('name'),
    supabase.from('inquiries').select('full_name, company_name, device_type, device_serial_no, ticket_no, created_at')
  ]);

  const list = Array.isArray(rows) ? rows : [];
  const compList = Array.isArray(compRows) ? compRows : [];
  const reportedDevices = (inqs || []).filter(x => (x.device_type && x.device_type.trim()) || (x.device_serial_no && x.device_serial_no.trim()));
  reportedDevices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const dtHtml = list.length === 0
    ? '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-dim)">No device types yet.</td></tr>'
    : list.map(x => `
      <tr data-id="${x.id}">
        <td><b>${escapeHtml(x.name)}</b></td>
        <td><small style="color:var(--text-dim)">${escapeHtml(x.description || '—')}</small></td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-secondary btn-sm dt-edit-btn" data-id="${x.id}" style="padding:2px 8px; font-size:0.75rem;">Edit</button>
          <button class="btn btn-danger btn-sm dt-del-btn" data-id="${x.id}" style="padding:2px 8px; font-size:0.75rem;">Delete</button>
        </td>
      </tr>`).join('');

  const compHtml = compList.length === 0
    ? '<tr><td colspan="2" style="text-align:center;padding:24px;color:var(--text-dim)">No companies yet.</td></tr>'
    : compList.map(x => {
        const isDefault = x.name.toLowerCase() === 'networking experts';
        return `
          <tr data-id="${x.id}">
            <td><b>${escapeHtml(x.name)}</b></td>
            <td style="text-align:right; white-space:nowrap;">
              ${isDefault ? '<span style="color:var(--text-dim); font-size:0.75rem; margin-right:8px; font-weight:600;">Default</span>' : `
                <button class="btn btn-secondary btn-sm comp-edit-btn" data-id="${x.id}" style="padding:2px 8px; font-size:0.75rem;">Edit</button>
                <button class="btn btn-danger btn-sm comp-del-btn" data-id="${x.id}" style="padding:2px 8px; font-size:0.75rem;">Delete</button>
              `}
            </td>
          </tr>
        `;
      }).join('');

  const deviceRowsHtml = reportedDevices.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No reported customer devices found.</td></tr>'
    : reportedDevices.map(x => `
      <tr>
        <td><b>${escapeHtml(x.full_name || '—')}</b></td>
        <td>${escapeHtml(x.company_name || '—')}</td>
        <td><span class="badge badge-open">${escapeHtml(x.device_type || '—')}</span></td>
        <td><code>${escapeHtml(x.device_serial_no || '—')}</code></td>
        <td><code>${escapeHtml(x.ticket_no || '—')}</code></td>
        <td>${x.created_at ? new Date(x.created_at).toLocaleDateString('en-IN') : '—'}</td>
      </tr>
    `).join('');

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
      <div>
        <h1>Devices & Companies Management</h1>
        <p>Manage device types, registered companies, and view reported customer devices.</p>
      </div>
      <button class="btn btn-secondary" id="dt-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap:20px; margin-bottom:20px;">
      <!-- Device Types CRUD -->
      <div class="card" style="margin:0; display:flex; flex-direction:column; justify-content:space-between;">
        <div class="card-body">
          <h2 style="font-size:1.2rem; margin-top:0; margin-bottom:12px;">Device Types CRUD</h2>
          <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:16px;">Pickable device types for technicians.</p>
          <div style="display:flex; gap:10px; margin-bottom:16px; align-items:flex-end;">
            <div class="form-group" style="margin:0; flex:1;">
              <label style="font-size:0.75rem;">Device Name</label>
              <input id="dt-name" placeholder="e.g. Video Door Phone" style="width:100%; padding:6px 10px; font-size:0.85rem;"/>
            </div>
            <div class="form-group" style="margin:0; flex:1.5;">
              <label style="font-size:0.75rem;">Description (optional)</label>
              <input id="dt-desc" placeholder="Short note" style="width:100%; padding:6px 10px; font-size:0.85rem;"/>
            </div>
            <button class="btn btn-primary" id="dt-add" style="padding:6px 12px; height:34px; font-size:0.85rem; display:flex; align-items:center; gap:4px;">
              ${ICONS.plus}<span>Add</span>
            </button>
          </div>
          <div class="table-wrap" style="max-height: 280px; overflow-y: auto;">
            <table>
              <thead><tr><th>Name</th><th>Description</th><th style="text-align:right;"></th></tr></thead>
              <tbody>${dtHtml}</tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Companies CRUD -->
      <div class="card" style="margin:0; display:flex; flex-direction:column; justify-content:space-between;">
        <div class="card-body">
          <h2 style="font-size:1.2rem; margin-top:0; margin-bottom:12px;">Companies Registry</h2>
          <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:16px;">Registered client companies.</p>
          <div style="display:flex; gap:10px; margin-bottom:16px; align-items:flex-end;">
            <div class="form-group" style="margin:0; flex:1;">
              <label style="font-size:0.75rem;">Company Name</label>
              <input id="comp-name" placeholder="e.g. ACME Corp" style="width:100%; padding:6px 10px; font-size:0.85rem;"/>
            </div>
            <button class="btn btn-primary" id="comp-add" style="padding:6px 12px; height:34px; font-size:0.85rem; display:flex; align-items:center; gap:4px;">
              ${ICONS.plus}<span>Add</span>
            </button>
          </div>
          <div class="table-wrap" style="max-height: 280px; overflow-y: auto;">
            <table>
              <thead><tr><th>Name</th><th style="text-align:right;"></th></tr></thead>
              <tbody>${compHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Reported Customer Devices Table Card -->
    <div class="card">
      <div class="card-body">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="font-size:1.25rem; margin:0;">Reported Customer Devices</h2>
            <p style="font-size:0.85rem; color:var(--text-dim); margin:4px 0 0 0;">
              List of all customer devices registered or reported in service inquiries.
            </p>
          </div>
          <button class="btn btn-secondary" id="export-devices-csv" style="display:flex; align-items:center; gap:6px; font-size:0.85rem; padding:8px 14px;">
            Export CSV
          </button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Company</th>
                <th>Device Type</th>
                <th>Serial Number</th>
                <th>Ticket Number</th>
                <th>Service Date</th>
              </tr>
            </thead>
            <tbody>${deviceRowsHtml}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#dt-refresh').onclick = () => renderDeviceTypesTab(container);

  // Device Add
  container.querySelector('#dt-add').onclick = async () => {
    const name = container.querySelector('#dt-name').value.trim();
    const description = container.querySelector('#dt-desc').value.trim();
    if (!name) { toast('Enter a device name', 'warning'); return; }
    if (list.some(x => x.name.toLowerCase() === name.toLowerCase())) {
      toast('That device type already exists', 'warning');
      return;
    }
    const id = (window.crypto?.randomUUID && window.crypto.randomUUID()) || `dt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const { error } = await supabase.from('device_types').insert({ id, name, description: description || null });
    if (error) { toast(error.message, 'error'); return; }
    toast('Device type added', 'success');
    renderDeviceTypesTab(container);
  };

  // Device Edit
  container.querySelectorAll('.dt-edit-btn').forEach(btn => {
    btn.onclick = async () => {
      const row = list.find(x => String(x.id) === btn.dataset.id);
      if (!row) return;
      const newName = prompt('Device name:', row.name);
      if (newName == null) return;
      const newDesc = prompt('Description (optional):', row.description || '');
      if (newDesc == null) return;
      const { error } = await supabase.from('device_types').update({
        name: newName.trim() || row.name,
        description: newDesc.trim() || null,
      }).eq('id', row.id);
      if (error) { toast(error.message, 'error'); return; }
      toast('Updated', 'success');
      renderDeviceTypesTab(container);
    };
  });

  // Device Delete
  container.querySelectorAll('.dt-del-btn').forEach(btn => {
    btn.onclick = async () => {
      const row = list.find(x => String(x.id) === btn.dataset.id);
      if (!row) return;
      if (!confirm(`Delete device type "${row.name}"?`)) return;
      const { error } = await supabase.from('device_types').delete().eq('id', row.id);
      if (error) { toast(error.message, 'error'); return; }
      toast('Deleted', 'success');
      renderDeviceTypesTab(container);
    };
  });

  // Company Add
  container.querySelector('#comp-add').onclick = async () => {
    const name = container.querySelector('#comp-name').value.trim();
    if (!name) { toast('Enter a company name', 'warning'); return; }
    if (compList.some(x => x.name.toLowerCase() === name.toLowerCase())) {
      toast('That company already exists', 'warning');
      return;
    }
    const id = (window.crypto?.randomUUID && window.crypto.randomUUID()) || `comp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const { error } = await supabase.from('companies').insert({ id, name });
    if (error) { toast(error.message, 'error'); return; }
    toast('Company added', 'success');
    renderDeviceTypesTab(container);
  };

  // Company Edit
  container.querySelectorAll('.comp-edit-btn').forEach(btn => {
    btn.onclick = async () => {
      const row = compList.find(x => String(x.id) === btn.dataset.id);
      if (!row) return;
      const isDefault = row.name.toLowerCase() === 'networking experts';
      if (isDefault) {
        toast('Cannot edit default company', 'error');
        return;
      }
      const newName = prompt('Company name:', row.name);
      if (!newName || !newName.trim()) return;
      if (compList.some(x => x.name.toLowerCase() === newName.trim().toLowerCase() && x.id !== row.id)) {
        toast('That company name already exists', 'warning');
        return;
      }
      const { error } = await supabase.from('companies').update({
        name: newName.trim(),
      }).eq('id', row.id);
      if (error) { toast(error.message, 'error'); return; }
      toast('Company updated', 'success');
      renderDeviceTypesTab(container);
    };
  });

  // Company Delete
  container.querySelectorAll('.comp-del-btn').forEach(btn => {
    btn.onclick = async () => {
      const row = compList.find(x => String(x.id) === btn.dataset.id);
      if (!row) return;
      const isDefault = row.name.toLowerCase() === 'networking experts';
      if (isDefault) {
        toast('Cannot delete default company', 'error');
        return;
      }
      if (!confirm(`Delete company "${row.name}"?`)) return;
      const { error } = await supabase.from('companies').delete().eq('id', row.id);
      if (error) { toast(error.message, 'error'); return; }
      toast('Company deleted', 'success');
      renderDeviceTypesTab(container);
    };
  });

  // Export CSV
  container.querySelector('#export-devices-csv').onclick = () => {
    const headers = ['Customer Name', 'Company', 'Device Type', 'Serial Number', 'Ticket Number', 'Service Date'];
    const csvRows = reportedDevices.map(x => [
      x.full_name || '',
      x.company_name || '',
      x.device_type || '',
      x.device_serial_no || '',
      x.ticket_no || '',
      x.created_at ? new Date(x.created_at).toLocaleDateString('en-IN') : ''
    ]);

    const csvData = [headers.join(','), ...csvRows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "reported-devices.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
}

// ── CASH COLLECTIONS (admin) ────────────────────────────
// One container per employee with pending cash. Admin checks the records
// they're receiving cash for, presses "Record Submission" → those rows
// get cash_submitted_at=NOW so the employee's pending balance clears.
export async function renderCashCollectionsTab(container) {
  const { data: rows } = await supabase.from('inquiries')
    .select('*')
    .eq('payment_method', 'cash')
    .eq('payment_status', 'paid')
    .order('cash_collected_at', { ascending: false });
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').eq('role', 'employee');

  const employees = profiles || [];
  const byEmp = new Map();
  (rows || []).forEach(r => {
    if (!r.assigned_employee_id || !r.cash_collected_at) return;
    if (!byEmp.has(r.assigned_employee_id)) byEmp.set(r.assigned_employee_id, []);
    byEmp.get(r.assigned_employee_id).push(r);
  });

  // Stats across all employees.
  const allPending = (rows || []).filter(r => r.cash_collected_at && !r.cash_submitted_at);
  const allSubmitted = (rows || []).filter(r => r.cash_submitted_at);
  const totalPending = allPending.reduce((a, r) => a + (Number(r.bill_total) || 0), 0);
  const totalSubmitted = allSubmitted.reduce((a, r) => a + (Number(r.bill_total) || 0), 0);

  const dateOf = (d) => {
    if (!d) return '—';
    try {
      const dt = new Date(String(d).replace(' ', 'T'));
      return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return d; }
  };

  const empCardHtml = (emp) => {
    const records = byEmp.get(emp.id) || [];
    const pending = records.filter(r => !r.cash_submitted_at);
    const submitted = records.filter(r => r.cash_submitted_at);
    const pendingTotal = pending.reduce((a, r) => a + (Number(r.bill_total) || 0), 0);
    const submittedTotal = submitted.reduce((a, r) => a + (Number(r.bill_total) || 0), 0);

    return `
      <div class="emp-cash-card" data-emp-id="${emp.id}">
        <div class="emp-cash-head">
          <div>
            <div class="emp-cash-name">${emp.full_name}</div>
            <div class="emp-cash-sub">${emp.phone || ''}</div>
          </div>
          <div class="emp-cash-totals">
            <div><span>Pending</span><b style="color:var(--warning)">₹${Math.round(pendingTotal).toLocaleString('en-IN')}</b></div>
            <div><span>Submitted</span><b style="color:var(--success)">₹${Math.round(submittedTotal).toLocaleString('en-IN')}</b></div>
          </div>
        </div>

        ${pending.length === 0
          ? '<div class="emp-cash-empty">No pending cash from this employee.</div>'
          : `
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th style="width:30px;"><input type="checkbox" class="cash-all-cb" checked title="Select all pending"/></th>
                <th>Date</th><th>Ticket</th><th>Customer</th><th>Service</th><th>Amount</th>
              </tr></thead>
              <tbody>
                ${pending.map(r => `
                  <tr>
                    <td><input type="checkbox" class="cash-cb" data-id="${r.id}" checked/></td>
                    <td><small style="color:var(--text-dim)">${dateOf(r.cash_collected_at)}</small></td>
                    <td><code style="font-size:0.75rem;">${r.ticket_no || (r.id || '').slice(0,8)}</code></td>
                    <td><b>${r.full_name || '—'}</b><br/><small style="color:var(--text-dim)">${r.phone || ''}</small></td>
                    <td><small>${r.service_item || '—'}</small></td>
                    <td><b>₹${Math.round(Number(r.bill_total) || 0).toLocaleString('en-IN')}</b></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="emp-cash-actions">
            <span class="emp-cash-selected">Selected: <b id="sel-total-${emp.id}">₹${Math.round(pendingTotal).toLocaleString('en-IN')}</b></span>
            <button class="btn btn-primary record-submit-btn" data-emp-id="${emp.id}">${ICONS.check}<span>Record Submission</span></button>
          </div>`}

        ${submitted.length > 0 ? `
          <details class="emp-cash-history">
            <summary>Past submissions (${submitted.length}) · ₹${Math.round(submittedTotal).toLocaleString('en-IN')}</summary>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Submitted</th><th>Ticket</th><th>Customer</th><th>Amount</th></tr></thead>
                <tbody>
                  ${submitted.map(r => `
                    <tr>
                      <td><small style="color:var(--text-dim)">${dateOf(r.cash_submitted_at)}</small></td>
                      <td><code style="font-size:0.75rem;">${r.ticket_no || (r.id || '').slice(0,8)}</code></td>
                      <td><b>${r.full_name || '—'}</b></td>
                      <td><b>₹${Math.round(Number(r.bill_total) || 0).toLocaleString('en-IN')}</b></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </details>` : ''}
      </div>`;
  };

  const empsWithCash = employees.filter(e => (byEmp.get(e.id) || []).length > 0);

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Cash Collections</h1>
        <p>Cash collected by technicians, grouped per employee. Tick the records you're receiving cash for, then press <b>Record Submission</b>.</p>
      </div>
      <button class="btn btn-secondary" id="cash-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>

    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning); font-size:1.9rem;">₹${Math.round(totalPending).toLocaleString('en-IN')}</div>
        <div class="stat-label">Total Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success); font-size:1.9rem;">₹${Math.round(totalSubmitted).toLocaleString('en-IN')}</div>
        <div class="stat-label">Total Submitted (All Time)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${empsWithCash.length}</div>
        <div class="stat-label">Employees With Records</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${allPending.length}</div>
        <div class="stat-label">Pending Records</div>
      </div>
    </div>

    ${empsWithCash.length === 0
      ? '<div class="card"><div class="card-body" style="text-align:center; padding:48px; color:var(--text-dim);">No cash collections recorded yet.</div></div>'
      : empsWithCash.map(empCardHtml).join('')}
  `;

  container.querySelector('#cash-refresh').onclick = () => renderCashCollectionsTab(container);

  const refreshSelectedTotal = (empId) => {
    const card = container.querySelector(`.emp-cash-card[data-emp-id="${empId}"]`);
    if (!card) return;
    const checked = Array.from(card.querySelectorAll('.cash-cb:checked')).map(c => c.dataset.id);
    const records = byEmp.get(empId) || [];
    const total = records.filter(r => checked.includes(String(r.id))).reduce((a, r) => a + (Number(r.bill_total) || 0), 0);
    const target = card.querySelector(`#sel-total-${empId}`);
    if (target) target.textContent = `₹${Math.round(total).toLocaleString('en-IN')}`;
  };

  // Per-card master-checkbox + row checkboxes
  container.querySelectorAll('.emp-cash-card').forEach(card => {
    const empId = card.dataset.empId;
    const allCb = card.querySelector('.cash-all-cb');
    const rowCbs = card.querySelectorAll('.cash-cb');
    if (allCb) {
      allCb.onclick = () => {
        rowCbs.forEach(cb => { cb.checked = allCb.checked; });
        refreshSelectedTotal(empId);
      };
    }
    rowCbs.forEach(cb => { cb.onchange = () => refreshSelectedTotal(empId); });
  });

  container.querySelectorAll('.record-submit-btn').forEach(btn => {
    btn.onclick = async () => {
      const empId = btn.dataset.empId;
      const card = container.querySelector(`.emp-cash-card[data-emp-id="${empId}"]`);
      const ids = Array.from(card.querySelectorAll('.cash-cb:checked')).map(c => c.dataset.id);
      if (ids.length === 0) { toast('Select at least one record', 'warning'); return; }

      btn.disabled = true; btn.innerHTML = '<span>Saving…</span>';
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const nowIso = new Date().toISOString().slice(0,19).replace('T',' ');
        // Update each selected inquiry — wrapper has no batch, so loop.
        for (const id of ids) {
          await supabase.from('inquiries').update({
            cash_submitted_at: nowIso,
            cash_submitted_by: user?.id || null,
          }).eq('id', id);
        }
        const total = (byEmp.get(empId) || [])
          .filter(r => ids.includes(String(r.id)))
          .reduce((a, r) => a + (Number(r.bill_total) || 0), 0);
        toast(`✓ Recorded ₹${Math.round(total).toLocaleString('en-IN')} from technician`, 'success');
        renderCashCollectionsTab(container);
      } catch (err) {
        toast(err.message || 'Could not record submission', 'error');
        btn.disabled = false; btn.innerHTML = `${ICONS.check}<span>Record Submission</span>`;
      }
    };
  });
}

// Lazy-load SheetJS from CDN only when an .xlsx upload happens.
let _xlsxLoader = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxLoader) return _xlsxLoader;
  _xlsxLoader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('xlsx failed to load'));
    s.onerror = () => reject(new Error('Could not fetch xlsx parser. Check your internet connection.'));
    document.head.appendChild(s);
  });
  return _xlsxLoader;
}

// Minimal CSV parser — handles quoted fields, escaped quotes ("") and CRLF.
function parseCSV(text) {
  const rows = [];
  let cur = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); cur = ''; row = []; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(cell => String(cell ?? '').trim() !== ''));
}

async function readSheetAsRows(file) {
  const isCSV = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  if (isCSV) {
    const text = await file.text();
    return parseCSV(text);
  }
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
}

function parsePrice(v) {
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[₹$,\s]/g, '');
  return Number(cleaned);
}

// Map header cells to canonical columns. Returns null if the row doesn't look
// like a header — caller falls back to positional inference.
function detectHeader(row) {
  const labels = row.map(c => String(c ?? '').trim().toLowerCase());
  const map = { mainIdx: -1, subIdx: -1, subSubIdx: -1, priceIdx: -1 };
  let matched = 0;
  labels.forEach((label, i) => {
    if (!label) return;
    if (/(price|rate|cost|amount|charge)/.test(label)) { map.priceIdx = i; matched++; }
    else if (/sub[\s\-_]*sub/.test(label) || /level\s*3/.test(label) || /issue|defect|problem/.test(label)) { map.subSubIdx = i; matched++; }
    else if (/sub/.test(label) || /level\s*2/.test(label) || /group/.test(label)) { map.subIdx = i; matched++; }
    else if (/(main|category|type|service)/.test(label)) { map.mainIdx = i; matched++; }
  });
  return matched >= 2 ? map : null;
}

// Without a header, infer from the position of the last numeric column.
// 4 cols → Main | Sub | Sub-Sub | Price
// 3 cols → Main | Sub-Sub | Price   (Sub-Sub is the leaf, per user choice)
// 2 cols → Sub-Sub | Price
function inferLayout(row) {
  let priceIdx = -1;
  for (let i = row.length - 1; i >= 0; i--) {
    if (Number.isFinite(parsePrice(row[i]))) { priceIdx = i; break; }
  }
  if (priceIdx <= 0) return { mainIdx: -1, subIdx: -1, subSubIdx: 0, priceIdx: priceIdx >= 0 ? priceIdx : 1 };
  if (priceIdx === 1) return { mainIdx: -1, subIdx: -1, subSubIdx: 0, priceIdx };
  if (priceIdx === 2) return { mainIdx: 0,  subIdx: -1, subSubIdx: 1, priceIdx };
  return { mainIdx: 0, subIdx: 1, subSubIdx: 2, priceIdx };
}

async function importServiceRows(rows) {
  let inserted = 0, skipped = 0;
  const errors = [];
  if (!rows.length) return { inserted, skipped, errors };

  let layout = detectHeader(rows[0]);
  const startIdx = layout ? 1 : 0;
  if (!layout) layout = inferLayout(rows[0]);

  let { mainIdx, subIdx, subSubIdx, priceIdx } = layout;

  // 3-column header case: Main + Sub + Price (no Sub-Sub label found). Per
  // user choice, treat the Sub column as the leaf — move it into Sub-Sub.
  if (subSubIdx === -1 && subIdx !== -1 && mainIdx !== -1) {
    subSubIdx = subIdx;
    subIdx = -1;
  }

  const batch = [];
  const batchMeta = [];
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    const get = (idx) => idx >= 0 ? String(r[idx] ?? '').trim() : '';

    const category        = get(mainIdx);
    const sub_category    = get(subIdx);
    const sub_sub_category = get(subSubIdx);
    const cost            = parsePrice(priceIdx >= 0 ? r[priceIdx] : null);

    if (!category && !sub_category && !sub_sub_category && !Number.isFinite(cost)) { skipped++; continue; }
    if (!sub_sub_category) { errors.push(`Row ${i + 1}: missing leaf service name`); skipped++; continue; }
    if (!Number.isFinite(cost) || cost < 0) { errors.push(`Row ${i + 1}: invalid price`); skipped++; continue; }

    batch.push({
      id: crypto.randomUUID(),
      category: category || 'Uncategorized',
      sub_category: sub_category || null,
      sub_sub_category,
      name: sub_sub_category,
      cost,
    });
    batchMeta.push({ rowIndex: i });
  }

  for (let j = 0; j < batch.length; j += 10) {
    const chunk = batch.slice(j, j + 10);
    const chunkMeta = batchMeta.slice(j, j + 10);
    let retries = 0;
    while (retries < 3) {
      const { error } = await supabase.from('service_pricing').insert(chunk);
      if (error?.status === 429) {
        retries++;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries)));
        continue;
      }
      if (error) {
        chunkMeta.forEach(meta => errors.push(`Row ${meta.rowIndex + 1}: ${error.message}`));
        skipped += chunk.length;
      } else {
        inserted += chunk.length;
      }
      break;
    }
    if (retries === 3) {
      chunkMeta.forEach(meta => errors.push(`Row ${meta.rowIndex + 1}: rate limited (too many requests)`));
      skipped += chunk.length;
    }
  }
  return { inserted, skipped, errors };
}

function downloadTemplateCSV() {
  const csv = [
    'Main Category,Sub Category,Sub-Sub Category,Price',
    'Video Door Phone,Power Issues,No power,200',
    'Video Door Phone,Power Issues,Adaptor failure,200',
    'Video Door Phone,Audio Issues,No audio,200',
    'CCTV Camera,Video Issues,No video,200',
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'service-pricing-template.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export async function renderPricingTab(container) {
  const { data: pricing } = await supabase.from('service_pricing').select('*').order('category');
  const list = pricing || [];

  container.innerHTML = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <h1>Service Pricing</h1>
        <p>Define standard costs for common services to prevent billing errors</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-secondary" id="dl-template">${ICONS.download || ''}<span>Download Template</span></button>
        <button class="btn btn-secondary" id="upload-price">${ICONS.upload || ''}<span>Upload Excel/CSV</span></button>
        <button class="btn btn-primary" id="add-price">${ICONS.plus}<span>Add New Service</span></button>
        <input type="file" id="upload-price-file" accept=".xlsx,.xls,.csv" style="display:none">
      </div>
    </div>
    <div class="card" style="margin-bottom:12px; padding:12px 16px; font-size:13px; color:var(--text-dim)">
      Excel/CSV columns: <b>Main Category</b>, <b>Sub Category</b>, <b>Sub-Sub Category</b>, <b>Price</b>. Sub Category is optional —
      a 3-column file (Main + Sub + Price) is also accepted; its "Sub" column will be treated as the leaf.
    </div>
    <div class="card">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;" id="bulk-actions">
        <button class="btn btn-danger btn-sm" id="del-selected" style="display:none">Delete Selected</button>
        <button class="btn btn-warning btn-sm" id="remove-dupes">Remove Duplicates</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:30px;"><input type="checkbox" id="select-all" title="Select all"></th>
              <th>Main Category</th><th>Sub Category</th><th>Sub-Sub Category</th><th>Price</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No services defined yet</td></tr>' :
              list.map(x => `
              <tr>
                <td><input type="checkbox" class="service-checkbox" data-id="${x.id}"></td>
                <td><span class="badge badge-open">${x.category || 'Service'}</span></td>
                <td>${x.sub_category || '<span style="color:var(--text-dim)">—</span>'}</td>
                <td><b>${x.sub_sub_category || x.name || ''}</b></td>
                <td>₹${Number(x.cost).toLocaleString('en-IN')}</td>
                <td style="display:flex; gap:6px;">
                  <button class="btn btn-secondary btn-sm edit-price" data-id="${x.id}" title="Edit">${ICONS.edit || 'Edit'}</button>
                  <button class="btn btn-danger btn-sm del-price" data-id="${x.id}" title="Delete">${ICONS.close}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  let addPriceLocked = false;
  container.querySelector('#add-price').onclick = () => {
    if (addPriceLocked) return;
    const category = prompt('Enter Main Category:');
    if (category === null) return;
    const sub_category = prompt('Enter Sub Category (optional — group/level 2):');
    if (sub_category === null) return;
    const sub_sub_category = prompt('Enter Sub-Sub Category (specific issue — this is what the employee picks):');
    if (!sub_sub_category) return;
    const costStr = prompt('Enter Price (₹):');
    const cost = parsePrice(costStr);
    if (!Number.isFinite(cost) || cost < 0) { toast('Invalid price', 'error'); return; }
    addPriceLocked = true;
    (async () => {
      try {
        const { error } = await supabase.from('service_pricing').insert({
          id: crypto.randomUUID(),
          category: category || 'Uncategorized',
          sub_category: sub_category.trim() || null,
          sub_sub_category,
          name: sub_sub_category,
          cost,
        });
        if (error?.status === 429) {
          toast('Server is busy — please try again in a few seconds', 'error');
        } else if (error) {
          toast(error.message || 'Failed to add service', 'error');
        } else {
          toast('Service added', 'success');
          renderPricingTab(container);
        }
      } finally {
        addPriceLocked = false;
      }
    })();
  };

  container.querySelector('#dl-template').onclick = downloadTemplateCSV;

  const fileInput = container.querySelector('#upload-price-file');
  let uploadLocked = false;
  container.querySelector('#upload-price').onclick = () => {
    if (uploadLocked) { toast('Upload in progress…', 'info'); return; }
    fileInput.click();
  };
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (uploadLocked) { toast('Upload already in progress', 'warning'); return; }
    uploadLocked = true;
    fileInput.value = '';
    toast(`Reading ${file.name}…`, 'info');
    try {
      const rows = await readSheetAsRows(file);
      if (!rows.length) { toast('File is empty', 'warning'); return; }
      const { inserted, skipped, errors } = await importServiceRows(rows);
      if (inserted) toast(`Imported ${inserted} service${inserted === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`, 'success');
      else toast(`No rows imported${skipped ? ` — ${skipped} skipped` : ''}`, 'warning');
      if (errors.length) console.warn('[pricing import] errors:', errors);
      renderPricingTab(container);
    } catch (err) {
      console.error('[pricing import] failed', err);
      toast(err.message || 'Failed to read file', 'error');
    } finally {
      uploadLocked = false;
    }
  };

  container.querySelectorAll('.del-price').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this service?')) return;
      const { error } = await supabase.from('service_pricing').delete().eq('id', btn.dataset.id);
      if (error) { toast(error.message || 'Delete failed', 'error'); return; }
      toast('Service deleted', 'success');
      renderPricingTab(container);
    };
  });

  container.querySelectorAll('.edit-price').forEach(btn => {
    btn.onclick = async () => {
      const row = list.find(r => r.id === btn.dataset.id);
      if (!row) return;
      const category = prompt('Main Category:', row.category || '');
      if (category === null) return;
      const sub_category = prompt('Sub Category (optional):', row.sub_category || '');
      if (sub_category === null) return;
      const sub_sub_category = prompt('Sub-Sub Category (specific issue):', row.sub_sub_category || row.name || '');
      if (sub_sub_category === null) return;
      if (!sub_sub_category.trim()) { toast('Sub-Sub Category is required', 'error'); return; }
      const costStr = prompt('Price (₹):', String(row.cost ?? ''));
      if (costStr === null) return;
      const cost = parsePrice(costStr);
      if (!Number.isFinite(cost) || cost < 0) { toast('Invalid price', 'error'); return; }

      const { error } = await supabase.from('service_pricing').update({
        category: category.trim() || 'Uncategorized',
        sub_category: sub_category.trim() || null,
        sub_sub_category: sub_sub_category.trim(),
        name: sub_sub_category.trim(),
        cost,
      }).eq('id', row.id);
      if (error) { toast(error.message || 'Update failed', 'error'); return; }
      toast('Service updated', 'success');
      renderPricingTab(container);
    };
  });

  const selectAllCheckbox = container.querySelector('#select-all');
  const serviceCheckboxes = container.querySelectorAll('.service-checkbox');
  const delSelectedBtn = container.querySelector('#del-selected');
  const removeDupesBtn = container.querySelector('#remove-dupes');

  const updateBulkActions = () => {
    const selected = container.querySelectorAll('.service-checkbox:checked').length;
    delSelectedBtn.style.display = selected > 0 ? 'block' : 'none';
    const allChecked = serviceCheckboxes.length > 0 && selected === serviceCheckboxes.length;
    selectAllCheckbox.checked = allChecked;
    selectAllCheckbox.indeterminate = selected > 0 && !allChecked;
  };

  selectAllCheckbox.onchange = () => {
    serviceCheckboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    updateBulkActions();
  };

  serviceCheckboxes.forEach(checkbox => {
    checkbox.onchange = updateBulkActions;
  });

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
    renderPricingTab(container);
  };

  removeDupesBtn.onclick = async () => {
    const seen = new Map();
    const dupeIds = [];

    list.forEach(item => {
      const key = `${item.category}||${item.sub_category}||${item.sub_sub_category}`;
      if (seen.has(key)) {
        dupeIds.push(item.id);
      } else {
        seen.set(key, item.id);
      }
    });

    if (!dupeIds.length) { toast('No duplicates found', 'info'); return; }
    if (!confirm(`Found ${dupeIds.length} duplicate service${dupeIds.length === 1 ? '' : 's'}. Delete them?`)) return;

    let deleted = 0;
    for (const id of dupeIds) {
      const { error } = await supabase.from('service_pricing').delete().eq('id', id);
      if (!error) deleted++;
    }
    toast(`Removed ${deleted} duplicate${deleted === 1 ? '' : 's'}`, 'success');
    renderPricingTab(container);
  };

  updateBulkActions();
}

// ── FEEDBACK TAB ───────────────────────────────────────
export async function renderFeedbackTab(container) {
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase.from('inquiries').select('*').order('feedback_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name,role'),
  ]);
  const all = (rows || []).filter(r => r.feedback_rating != null);
  const profileById = new Map((profiles || []).map(p => [p.id, p]));
  const monthKey = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const monthFeedback = all.filter(r => String(r.feedback_at || r.updated_at || '').startsWith(monthKey));

  // Per-employee aggregation: averages the explicit employee_rating column (falls back to overall rating).
  const empAgg = new Map();
  all.forEach(r => {
    const empId = r.feedback_employee_id || r.assigned_employee_id;
    if (!empId) return;
    const score = r.employee_rating || r.feedback_rating;
    if (!score) return;
    if (!empAgg.has(empId)) empAgg.set(empId, { total: 0, count: 0, fiveStars: 0 });
    const a = empAgg.get(empId);
    a.total += Number(score);
    a.count += 1;
    if (score >= 5) a.fiveStars += 1;
  });
  const empRows = [...empAgg.entries()]
    .map(([id, a]) => ({ id, name: profileById.get(id)?.full_name || '—', avg: a.total / a.count, count: a.count, fiveStars: a.fiveStars }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);

  const monthAgg = new Map();
  monthFeedback.forEach(r => {
    const empId = r.feedback_employee_id || r.assigned_employee_id;
    if (!empId) return;
    const score = r.employee_rating || r.feedback_rating;
    if (!score) return;
    if (!monthAgg.has(empId)) monthAgg.set(empId, { total: 0, count: 0, fiveStars: 0 });
    const a = monthAgg.get(empId);
    a.total += Number(score);
    a.count += 1;
    if (score >= 5) a.fiveStars += 1;
  });
  const monthEmpRows = [...monthAgg.entries()]
    .map(([id, a]) => ({ id, name: profileById.get(id)?.full_name || 'Employee', avg: a.total / a.count, count: a.count, fiveStars: a.fiveStars }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count || b.fiveStars - a.fiveStars);
  const employeeOfMonth = monthEmpRows[0] || null;

  const overallAvg = all.length ? (all.reduce((s, r) => s + Number(r.feedback_rating || 0), 0) / all.length) : 0;
  const fiveCount = all.filter(r => r.feedback_rating >= 5).length;

  const starsHtml = (n) => {
    const v = Math.round(Number(n) || 0);
    return Array.from({ length: 5 }, (_, i) =>
      `<span style="color:${i < v ? 'var(--warning)' : 'var(--border)'};display:inline-flex;width:14px;height:14px">${i < v ? ICONS.star : ICONS.starOutline}</span>`
    ).join('');
  };

  container.innerHTML = `
    <div class="page-header">
      <h1>Client Feedback</h1>
      <p>Ratings & comments submitted by clients after service completion</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${all.length}</div><div class="stat-label">Total Reviews</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${overallAvg.toFixed(2)} <span style="font-size:1rem">/ 5</span></div><div class="stat-label">Overall Average</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${fiveCount}</div><div class="stat-label">5-Star Reviews</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${empRows.length}</div><div class="stat-label">Employees Rated</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning);font-size:1.55rem">${employeeOfMonth ? escapeHtml(employeeOfMonth.name) : '-'}</div><div class="stat-label">Employee of Month</div></div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Employee Leaderboard</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Average</th><th>Reviews</th><th>5★</th></tr></thead>
          <tbody>
            ${empRows.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-dim)">No employee-specific ratings yet</td></tr>' :
              empRows.map(e => `<tr>
                <td><b>${e.name}</b></td>
                <td>${starsHtml(e.avg)} <span style="margin-left:6px;font-weight:700">${e.avg.toFixed(2)}</span></td>
                <td>${e.count}</td>
                <td><span class="badge badge-resolved">${e.fiveStars}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <span class="card-title">All Reviews</span>
        <div class="search-input-wrap" style="min-width:200px;max-width:320px;">
          <span>🔍</span>
          <input class="search-input" id="fb-search" placeholder="Filter by name or ticket…" style="padding:6px 10px;font-size:0.85rem;"/>
        </div>
      </div>
      <div class="table-wrap">
        <table id="fb-table">
          <thead><tr><th>Date</th><th>Ticket</th><th>Client</th><th>Employee</th><th>Overall</th><th>Employee</th><th>Comment</th></tr></thead>
          <tbody>
            ${all.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No feedback received yet</td></tr>' :
              all.map(r => {
                const empName = profileById.get(r.feedback_employee_id || r.assigned_employee_id)?.full_name || '—';
                const empStars = r.employee_rating ? `${starsHtml(r.employee_rating)} <b style="margin-left:4px">${r.employee_rating}</b>` : '<span style="color:var(--text-dim)">—</span>';
                return `<tr data-search="${(r.full_name + ' ' + (r.ticket_no || '') + ' ' + empName).toLowerCase()}">
                  <td><small>${r.feedback_at ? formatDate(r.feedback_at) : '—'}</small></td>
                  <td><code style="font-size:0.75rem;color:var(--primary)">${r.ticket_no || '—'}</code></td>
                  <td><b>${r.full_name}</b></td>
                  <td>${empName}</td>
                  <td>${starsHtml(r.feedback_rating)} <b style="margin-left:4px">${r.feedback_rating}</b></td>
                  <td>${empStars}</td>
                  <td style="max-width:340px;white-space:normal;font-size:.85rem;line-height:1.45;color:var(--text-soft)">${r.feedback_comment || '<span style="color:var(--text-dim)">—</span>'}</td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const search = container.querySelector('#fb-search');
  if (search) {
    search.oninput = () => {
      const q = search.value.toLowerCase();
      container.querySelectorAll('#fb-table tbody tr[data-search]').forEach(r => {
        r.style.display = r.dataset.search.includes(q) ? '' : 'none';
      });
    };
  }

  // Live refresh when a new feedback row lands.
  const channel = supabase.channel('admin-feedback')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inquiries' }, payload => {
      if (payload.new?.feedback_rating != null) renderFeedbackTab(container);
    })
    .subscribe();
  const cleanup = setInterval(() => {
    if (!document.body.contains(container)) {
      supabase.removeChannel(channel);
      clearInterval(cleanup);
    }
  }, 5000);
}

// ───────────────────────────────────────────────────────────
// COMPLAINTS — public-filed complaints linked to existing tickets
// ───────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export async function renderComplaintsTab(container) {
  container.innerHTML = `<div class="page-header"><h1>Complaints</h1><p>Loading…</p></div>`;
  const { data, error } = await supabase.from('complaints').select('*').order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="page-header"><h1>Complaints</h1><p style="color:var(--danger)">Could not load complaints: ${escapeHtml(error.message || '')}</p></div>`;
    return;
  }
  const rows = data || [];
  const open = rows.filter(r => r.status === 'open').length;
  const resolved = rows.filter(r => r.status === 'resolved').length;

  const statusBadgeFor = (s) =>
    s === 'resolved' ? `<span class="badge badge-resolved">Resolved</span>`
    : s === 'in_progress' ? `<span class="badge badge-in_progress">In Progress</span>`
    : `<span class="badge badge-danger">Open</span>`;

  container.innerHTML = `
    <div class="page-header">
      <h1>Complaints</h1>
      <p>Customer complaints filed against existing tickets via the public portal</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${rows.length}</div><div class="stat-label">Total Complaints</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${open}</div><div class="stat-label">Open</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${resolved}</div><div class="stat-label">Resolved</div></div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <span class="card-title">All Complaints</span>
        <div class="search-input-wrap" style="min-width:200px;max-width:320px;">
          <span>🔍</span>
          <input class="search-input" id="cmp-search" placeholder="Filter by ticket or phone…" style="padding:6px 10px;font-size:0.85rem;"/>
        </div>
      </div>
      <div class="table-wrap">
        <table id="cmp-table">
          <thead><tr><th>Filed</th><th>Ticket</th><th>Phone</th><th>Complaint</th><th>Status</th><th>Response</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No complaints filed yet</td></tr>` :
              rows.map(r => `
                <tr data-search="${escapeHtml(((r.ticket_no || '') + ' ' + (r.phone || '')).toLowerCase())}">
                  <td><small>${r.created_at ? formatDateTime(r.created_at) : '—'}</small></td>
                  <td><code style="font-size:0.75rem;color:var(--primary)">${escapeHtml(r.ticket_no || '—')}</code></td>
                  <td><small>${escapeHtml(r.phone || '—')}</small></td>
                  <td style="max-width:360px;white-space:normal;font-size:.85rem;line-height:1.45;color:var(--text-soft)">${escapeHtml(r.complaint_text || '')}</td>
                  <td>${statusBadgeFor(r.status)}</td>
                  <td style="max-width:260px;white-space:normal;font-size:.82rem;color:var(--text-soft)">${r.admin_response ? escapeHtml(r.admin_response) : '<span style="color:var(--text-dim)">—</span>'}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm cmp-respond-btn" data-id="${r.id}">${r.status === 'resolved' ? 'View' : 'Respond'}</button>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const search = container.querySelector('#cmp-search');
  if (search) {
    search.oninput = () => {
      const q = search.value.toLowerCase();
      container.querySelectorAll('#cmp-table tbody tr[data-search]').forEach(r => {
        r.style.display = r.dataset.search.includes(q) ? '' : 'none';
      });
    };
  }

  container.querySelectorAll('.cmp-respond-btn').forEach(btn => {
    btn.onclick = () => openComplaintResponder(rows.find(r => r.id === btn.dataset.id), () => renderComplaintsTab(container));
  });

  // Live refresh on new complaint inserts.
  const channel = supabase.channel('admin-complaints')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'complaints' }, () => renderComplaintsTab(container))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'complaints' }, () => renderComplaintsTab(container))
    .subscribe();
  const cleanup = setInterval(() => {
    if (!document.body.contains(container)) {
      supabase.removeChannel(channel);
      clearInterval(cleanup);
    }
  }, 5000);
}

function openComplaintResponder(complaint, onChange) {
  if (!complaint) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">Complaint on ${escapeHtml(complaint.ticket_no)}</span>
        <button class="modal-close">×</button>
      </div>
      <div style="padding:0 24px 12px;color:var(--text-soft);font-size:0.85rem;">From ${escapeHtml(complaint.phone)} · ${formatDateTime(complaint.created_at)}</div>
      <div class="modal-body">
        <div style="background:var(--bg-soft);padding:14px;border-radius:12px;font-size:0.9rem;line-height:1.5;color:var(--text);margin-bottom:18px;">
          ${escapeHtml(complaint.complaint_text)}
        </div>
        <label class="srf-label" style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Customer response (sent via SMS)</label>
        <textarea id="cmp-response" rows="4" placeholder="What did we do or say in reply?" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;resize:vertical;">${escapeHtml(complaint.admin_response || '')}</textarea>
        <div style="margin-top:6px;font-size:0.78rem;color:var(--text-dim);line-height:1.4;">
          ${complaint.admin_response
            ? `SMS already delivered to <b>${escapeHtml(complaint.phone || '')}</b>. Editing the text and saving will re-send.`
            : `No SMS has been sent yet. The customer will receive an SMS the moment you save a non-empty response.`}
        </div>
        <label style="display:block;font-weight:700;font-size:0.85rem;margin:14px 0 6px;">Status</label>
        <select id="cmp-status" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;">
          <option value="open" ${complaint.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="in_progress" ${complaint.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
          <option value="resolved" ${complaint.status === 'resolved' ? 'selected' : ''}>Resolved</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cmp-cancel">Cancel</button>
        <button class="btn btn-primary" id="cmp-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#cmp-cancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#cmp-save').onclick = async () => {
    const response = overlay.querySelector('#cmp-response').value.trim();
    const status = overlay.querySelector('#cmp-status').value;
    const prevResponse = (complaint.admin_response || '').trim();

    // Build the patch. Only include admin_response if it actually changed —
    // this keeps the server-side SMS trigger (which fires on `data.admin_response`)
    // from re-sending the same reply on a status-only update.
    const updates = { status };
    if (response !== prevResponse) {
      updates.admin_response = response || null;
    }
    if (status === 'resolved' && !complaint.resolved_at) {
      updates.resolved_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    const saveBtn = overlay.querySelector('#cmp-save');
    const restore = setButtonLoading(saveBtn, 'Saving');
    const { data, error } = await supabase.from('complaints').update(updates).eq('id', complaint.id);
    restore();
    if (error) { toast('Could not save: ' + (error.message || ''), 'error'); return; }
    if (updates.admin_response && data?.sms?.ok === false) {
      toast(`Response saved, but SMS failed: ${data.sms.error || 'provider rejected it'}`, 'error');
    } else {
      toast(updates.admin_response ? 'Response saved and SMS sent' : 'Complaint updated', 'success');
    }
    close();
    if (onChange) onChange();
  };
}

// ───────────────────────────────────────────────────────────
// ADS — landing-page carousel content (admin-managed)
// ───────────────────────────────────────────────────────────
export async function renderAdsTab(container) {
  container.innerHTML = `<div class="page-header"><h1>Landing Page Ads</h1><p>Loading…</p></div>`;
  const { data, error } = await supabase.from('ads')
    .select('*')
    .order('position', { ascending: true });
  if (error) {
    container.innerHTML = `<div class="page-header"><h1>Landing Page Ads</h1><p style="color:var(--danger)">Could not load ads: ${escapeHtml(error.message || '')}</p></div>`;
    return;
  }
  const ads = data || [];
  const activeCount = ads.filter(a => a.active).length;

  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;">
      <div>
        <h1>Landing Page Ads</h1>
        <p>Slides shown in the rotating carousel on the public service portal</p>
      </div>
      <button class="btn btn-primary" id="ad-add-btn">+ Add slide</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${ads.length}</div><div class="stat-label">Total Slides</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${activeCount}</div><div class="stat-label">Active</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--text-dim)">${ads.length - activeCount}</div><div class="stat-label">Hidden</div></div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-header"><span class="card-title">Slides (drag order via Position field)</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th style="width:60px">Pos</th><th>Preview</th><th>Kind</th><th>Caption</th><th>Duration</th><th>Status</th><th style="width:200px">Actions</th></tr></thead>
          <tbody>
            ${ads.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No ads yet — click "Add slide" to create your first one</td></tr>` :
              ads.map(a => `
                <tr>
                  <td><b>${a.position ?? 0}</b></td>
                  <td>
                    ${a.kind === 'video'
                      ? `<video src="${escapeHtml(a.url)}" muted style="width:120px;height:68px;object-fit:cover;border-radius:8px;background:var(--bg-soft);" onmouseover="this.play()" onmouseout="this.pause()"></video>`
                      : `<img src="${escapeHtml(a.url)}" alt="" style="width:120px;height:68px;object-fit:cover;border-radius:8px;background:var(--bg-soft);" loading="lazy"/>`}
                  </td>
                  <td><span class="badge ${a.kind === 'video' ? 'badge-in_progress' : 'badge-resolved'}">${a.kind}</span></td>
                  <td style="max-width:240px;white-space:normal;font-size:0.85rem;color:var(--text-soft)">${escapeHtml(a.caption || '')}</td>
                  <td><small>${((Number(a.duration_ms) || 6000) / 1000).toFixed(1)}s</small></td>
                  <td>
                    <div style="font-size:0.75rem; color:var(--text-soft)">
                      <div><b>Start:</b> ${a.starts_at ? new Date(a.starts_at).toLocaleString() : 'Now'}</div>
                      <div><b>End:</b> ${a.expires_at ? new Date(a.expires_at).toLocaleString() : 'Never'}</div>
                    </div>
                  </td>
                  <td>${a.active ? '<span class="badge badge-resolved">Active</span>' : '<span class="badge badge-danger">Hidden</span>'}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm ad-edit-btn" data-id="${a.id}">Edit</button>
                    <button class="btn btn-secondary btn-sm ad-toggle-btn" data-id="${a.id}">${a.active ? 'Hide' : 'Show'}</button>
                    <button class="btn btn-secondary btn-sm ad-delete-btn" data-id="${a.id}" style="color:var(--danger)">Delete</button>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const refresh = () => renderAdsTab(container);

  container.querySelector('#ad-add-btn').onclick = () => openAdEditor(null, refresh);
  container.querySelectorAll('.ad-edit-btn').forEach(btn => {
    btn.onclick = () => openAdEditor(ads.find(a => a.id === btn.dataset.id), refresh);
  });
  container.querySelectorAll('.ad-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const ad = ads.find(a => a.id === btn.dataset.id);
      const { error } = await supabase.from('ads').update({ active: ad.active ? 0 : 1 }).eq('id', ad.id);
      if (error) return toast('Could not update: ' + (error.message || ''), 'error');
      toast(ad.active ? 'Slide hidden' : 'Slide shown', 'success');
      refresh();
    };
  });
  container.querySelectorAll('.ad-delete-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this slide? This cannot be undone.')) return;
      const { error } = await supabase.from('ads').delete().eq('id', btn.dataset.id);
      if (error) return toast('Could not delete: ' + (error.message || ''), 'error');
      toast('Slide deleted', 'success');
      refresh();
    };
  });
}

function openAdEditor(ad, onChange) {
  const editing = !!ad;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">${editing ? 'Edit slide' : 'Add slide'}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Slide type</label>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <label style="flex:1;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;text-align:center;font-weight:700;">
            <input type="radio" name="ad-kind" value="image" ${(!ad || ad.kind === 'image') ? 'checked' : ''} style="margin-right:6px"/> Image
          </label>
          <label style="flex:1;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;text-align:center;font-weight:700;">
            <input type="radio" name="ad-kind" value="video" ${ad?.kind === 'video' ? 'checked' : ''} style="margin-right:6px"/> Video
          </label>
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Media Source</label>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <label style="font-size:0.85rem;cursor:pointer;"><input type="radio" name="media-source" value="upload" checked> Upload File</label>
            <label style="font-size:0.85rem;cursor:pointer;"><input type="radio" name="media-source" value="url"> Enter URL</label>
          </div>
          
          <div id="media-upload-div">
            <input type="file" id="ad-file" accept="image/*,video/*" style="width:100%;padding:8px;border-radius:10px;border:1px dashed var(--border);background:var(--bg);font-size:0.9rem;" />
          </div>
          <div id="media-url-div" style="display:none;">
            <input id="ad-url" type="url" placeholder="https://…/image.jpg or https://…/video.mp4"
                   value="${escapeHtml(ad?.url || '')}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
          ${ad?.url ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;overflow:hidden;text-overflow:ellipsis;">Current URL: <a href="${escapeHtml(ad.url)}" target="_blank" style="color:var(--primary)">${escapeHtml(ad.url)}</a></div>` : ''}
        </div>

        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Caption <span style="color:var(--text-dim);font-weight:500">(optional, max 255 chars)</span></label>
        <input id="ad-caption" type="text" maxlength="255" placeholder="Short overlay text"
               value="${escapeHtml(ad?.caption || '')}"
               style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;margin-bottom:14px;"/>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div>
            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Duration (seconds)</label>
            <input id="ad-duration" type="number" min="2" max="60" step="0.5"
                   value="${ad ? ((Number(ad.duration_ms) || 6000) / 1000) : 6}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
          <div>
            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Position</label>
            <input id="ad-position" type="number" min="0" step="1"
                   value="${ad?.position ?? 0}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div>
            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Starts At (optional)</label>
            <input id="ad-starts" type="datetime-local"
                   value="${ad?.starts_at ? new Date(new Date(ad.starts_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
          <div>
            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Expires At (optional)</label>
            <input id="ad-expires" type="datetime-local"
                   value="${ad?.expires_at ? new Date(new Date(ad.expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.9rem;">
          <input id="ad-active" type="checkbox" ${(!ad || ad.active) ? 'checked' : ''}/>
          Active (show on landing page)
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ad-cancel">Cancel</button>
        <button class="btn btn-primary" id="ad-save">${editing ? 'Save' : 'Add slide'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#ad-cancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelectorAll('input[name="media-source"]').forEach(r => {
    r.onchange = () => {
      overlay.querySelector('#media-upload-div').style.display = r.value === 'upload' ? 'block' : 'none';
      overlay.querySelector('#media-url-div').style.display = r.value === 'url' ? 'block' : 'none';
    };
  });

  overlay.querySelector('#ad-save').onclick = async () => {
    const kind = overlay.querySelector('input[name="ad-kind"]:checked').value;
    const caption = overlay.querySelector('#ad-caption').value.trim();
    const durationSec = parseFloat(overlay.querySelector('#ad-duration').value);
    const position = parseInt(overlay.querySelector('#ad-position').value, 10) || 0;
    const startsAt = overlay.querySelector('#ad-starts').value;
    const expiresAt = overlay.querySelector('#ad-expires').value;
    const active = overlay.querySelector('#ad-active').checked ? 1 : 0;

    let url = overlay.querySelector('#ad-url').value.trim();
    const radioUpload = overlay.querySelector('input[name="media-source"][value="upload"]').checked;
    const fileInput = overlay.querySelector('#ad-file');

    if (radioUpload && fileInput.files.length > 0) {
      const btn = overlay.querySelector('#ad-save');
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      
      try {
        const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        const apiUrl = isProd ? '/api/upload' : 'http://localhost:5000/api/upload';
        
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        url = data.url;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = editing ? 'Save' : 'Add slide';
        return toast(err.message, 'error');
      }
    }

    if (!url) {
      if (ad?.url) {
        url = ad.url;
      } else {
        return toast('Media File or URL is required', 'error');
      }
    }

    if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) return toast('URL must start with http(s):// or /uploads/', 'error');
    if (!Number.isFinite(durationSec) || durationSec < 2) return toast('Duration must be at least 2 seconds', 'error');

    const payload = {
      kind,
      url,
      caption: caption || null,
      duration_ms: Math.round(durationSec * 1000),
      position,
      starts_at: startsAt ? new Date(startsAt).toISOString().slice(0, 19).replace('T', ' ') : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString().slice(0, 19).replace('T', ' ') : null,
      active,
    };

    let res;
    if (editing) {
      res = await supabase.from('ads').update(payload).eq('id', ad.id);
    } else {
      res = await supabase.from('ads').insert(payload);
    }
    if (res.error) return toast('Could not save: ' + (res.error.message || ''), 'error');
    toast(editing ? 'Slide updated' : 'Slide added', 'success');
    close();
    if (onChange) onChange();
  };
}

// ── EMPLOYEE SERVICE PRICING TAB ────────────────────────
export async function renderEmployeePricingTab(container) {
  const user = (await supabase.auth.getSession()).data.session?.user;
  if (!user) { container.innerHTML = '<p style="color:var(--danger)">Authentication required</p>'; return; }

  const { data: pricing } = await supabase.from('service_pricing').select('*').order('category');
  const list = pricing || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>📋 Service Pricing</h1>
        <p>View and manage service pricing for your work</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px; padding:12px 16px; font-size:13px; border-left:4px solid var(--warning);">
      <b>ℹ️ Note:</b> You can only view pricing items assigned to you by your admin.
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Main Category</th><th>Sub Category</th><th>Sub-Sub Category</th><th>Price</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-dim)">No services assigned yet</td></tr>' :
              list.map(x => `
              <tr>
                <td><span class="badge badge-open">${x.category || 'Service'}</span></td>
                <td>${x.sub_category || '<span style="color:var(--text-dim)">—</span>'}</td>
                <td><b>${x.sub_sub_category || x.name || ''}</b></td>
                <td>₹${Number(x.cost).toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── SETTINGS TAB ───────────────────────────────────────
export async function renderSettingsTab(container) {
  const { data: attendance } = await supabase.from('attendance').select('user_id,clock_in,clock_out,date');
  const missedByEmployee = groupedForgottenClockouts(attendance || []);
  const restrictedEmployees = Array.from(missedByEmployee.entries())
    .filter(([, rows]) => rows.length >= STRICT_CLOCKOUT_LIMIT)
    .map(([userId]) => userId);

  const { data: profiles } = await supabase.from('profiles').select('id,full_name,role').eq('role', 'employee');
  const restrictedProfiles = (profiles || []).filter(p => restrictedEmployees.includes(p.id));

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>⚙️ Settings</h1>
        <p>Configure system preferences and manage restrictions</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:20px;">
      <!-- Auto Clock-Out Time Card -->
      <div class="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="font-size:1.5rem;">⏰</span>
          <h3 style="margin:0;">Auto Clock-Out Time</h3>
        </div>

        <div style="background:var(--bg-secondary);padding:12px;border-radius:6px;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:1.2rem;">⚠️</span>
          <small style="color:var(--text-dim);">Changing this affects all employees globally. Server restart required.</small>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <input type="time" id="auto-clockout-time" value="18:00" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.95rem;flex:1;min-width:120px;">
          <button class="btn btn-primary" id="save-clockout-time" style="white-space:nowrap;">Save Time</button>
        </div>

        <small style="display:block;color:var(--text-dim);line-height:1.5;">
          Employees clocked in after this time will be auto-clocked out. Current: <b>18:00 (6 PM)</b>
        </small>
      </div>

      <!-- Restricted Employees Card -->
      <div class="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="font-size:1.5rem;">🚫</span>
          <h3 style="margin:0;">Restrictions (${restrictedProfiles.length})</h3>
        </div>

        <div style="background:var(--bg-secondary);padding:12px;border-radius:6px;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:1.2rem;">ℹ️</span>
          <small style="color:var(--text-dim);">Employees with 4+ missed clock-outs cannot clock in.</small>
        </div>

        ${restrictedProfiles.length === 0
          ? '<p style="text-align:center;padding:24px 0;color:var(--text-dim);font-size:0.95rem;">✓ No restricted employees</p>'
          : `<div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;">
              ${restrictedProfiles.map(p => `
                <div style="padding:10px 12px;border-radius:6px;background:var(--danger);color:white;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                  <div style="min-width:150px;">
                    <b style="display:block;">${p.full_name}</b>
                    <small style="opacity:0.9;">${p.id.slice(0,8)}...</small>
                  </div>
                  <button class="btn btn-light btn-sm remove-restriction" data-id="${p.id}" data-name="${p.full_name}" style="white-space:nowrap;flex-shrink:0;">
                    Unlock
                  </button>
                </div>
              `).join('')}
            </div>`
        }
      </div>
    </div>

    <!-- Bottom Info Section -->
    <div style="margin-top:20px;padding:16px;background:var(--bg-secondary);border-radius:8px;border-left:4px solid var(--warning);">
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <span style="font-size:1.3rem;flex-shrink:0;">⚠️</span>
        <div>
          <b style="display:block;margin-bottom:4px;">Important Notes</b>
          <ul style="margin:8px 0;padding-left:20px;color:var(--text-dim);font-size:0.9rem;">
            <li>Auto clock-out time changes require server restart to take effect</li>
            <li>Unlocking employees automatically fixes their oldest missed clock-outs</li>
            <li>Changes are immediate but server must be running for them to apply</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#save-clockout-time').onclick = async () => {
    const timeInput = container.querySelector('#auto-clockout-time');
    const time = timeInput.value;
    if (!time) { toast('Please select a time', 'warning'); return; }

    const [hours, mins] = time.split(':');
    const envValue = `AUTO_CLOCK_OUT_TIME=${hours}:${mins}`;

    const msg = `✓ To set auto clock-out to ${time}:\n\n1. Edit server/.env file\n2. Change: ${envValue}\n3. Restart the server\n\nCopied to clipboard!`;
    toast('Configuration copied to clipboard', 'success');

    navigator.clipboard.writeText(envValue).catch(() => {
      toast(`Update server/.env: ${envValue}`, 'info');
    });
  };

  container.querySelectorAll('.remove-restriction').forEach(btn => {
    btn.onclick = async () => {
      const userId = btn.dataset.id;
      const name = btn.dataset.name;
      if (!confirm(`Remove clock-out restriction for ${name}?`)) return;

      const attend = (attendance || []).filter(a => a.user_id === userId);
      const missed = attend.filter(row => isForgottenClockOut(row));

      if (missed.length >= STRICT_CLOCKOUT_LIMIT) {
        const autoResolved = missed.slice(0, missed.length - STRICT_CLOCKOUT_LIMIT + 1);
        let fixed = 0;
        for (const row of autoResolved) {
          const { error } = await supabase.from('attendance')
            .update({ clock_out: resolvedClockOutFor(row) })
            .eq('id', row.id);
          if (!error) fixed++;
        }
        toast(`Fixed ${fixed} clock-out record${fixed === 1 ? '' : 's'} for ${name}`, 'success');
      } else {
        toast('Employee is not restricted', 'info');
      }
      renderSettingsTab(container);
    };
  });
}
