function escapeAttr(s) {
  return escapeHtml(s);
}
import { supabase } from "../supabase.js";
import {
  toast,
  formatDate,
  formatDateTime,
  formatTime,
  exportToCSV,
  calculateSLA,
  formatTimeRemaining,
  formatSLADeadline,
  showNotification,
  ensureNotifyPermission,
  showLoader,
} from "../utils.js";
import { openPremiumBillModal, shareBillToPublicLink } from "./employee.js";
const API_BASE =
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
    ? "/api"
    : "http://localhost:5000/api";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
});
function setButtonLoading(btn, label = "Loading...") {
  if (!btn) return () => {};
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add("is-loading");
  btn.innerHTML = `<span class="btn-spinner"></span><span>${label}</span>`;
  return () => {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    btn.innerHTML = originalHTML;
  };
}
async function openInquiryDetailWithLoader(btn, id, onDone) {
  const restore = setButtonLoading(btn, "Loading");
  try {
    await openInquiryDetail(id, onDone);
  } catch (err) {
    console.error(err);
    toast("Could not open request details", "error");
  } finally {
    restore();
  }
}
function generateAdminTicketNo() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `NE-${yy}${mm}${dd}-${rnd}`;
}
function normalizeAdminPhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 ? `+91${ten}` : null;
}
// Tries GPS first (enableHighAccuracy), falls back to network-based location
// (WiFi/cell) if GPS doesn't respond in time. The fallback is instant on
// iPhone and avoids the 12-second freeze from watchPosition on iOS Safari.
function getHighAccuracyPosition({ maxWaitMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error("Geolocation not supported"));
    let done = false;

    const tryLow = () => {
      navigator.geolocation.getCurrentPosition(
        pos => { if (!done) { done = true; resolve(pos); } },
        err => { if (!done) { done = true; reject(err); } },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 },
      );
    };

    const fallbackTimer = setTimeout(tryLow, maxWaitMs);

    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(fallbackTimer); if (!done) { done = true; resolve(pos); } },
      ()  => { clearTimeout(fallbackTimer); if (!done) tryLow(); },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 },
    );
  });
}
async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
  );
  const data = await res.json();
  return data.display_name || "";
}
function mapLink(lat, lng) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}
function optionFromCategory(category) {
  const label = String(category || "").trim();
  const value =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "service";
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
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate < startDate
  )
    return 0;
  return Math.floor((endDate - startDate) / 86400000) + 1;
}
function money(value) {
  const val = Math.round(Number(value) || 0);
  return "\u20B9" + val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
import { ICONS } from "../icons.js";
const AUTO_CLOCK_OUT_HOUR = 18;
const STRICT_EOD_LIMIT = 4;
function isPastAutoClockOut(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setHours(AUTO_CLOCK_OUT_HOUR, 0, 0, 0);
  return now >= cutoff;
}
function attendanceDateKey(row) {
  return dateKey(row?.date || row?.clock_in);
}
function isValidActiveAttendance(
  row,
  today = new Date().toLocaleDateString("en-CA"),
) {
  return Boolean(
    row?.clock_in &&
    !row?.clock_out &&
    attendanceDateKey(row) === today &&
    !isPastAutoClockOut(),
  );
}
function getMissedEodRows(
  attendanceRows = [],
  reports = [],
  today = new Date().toLocaleDateString("en-CA"),
) {
  const reportDatesByEmployee = new Map();
  (reports || []).forEach((report) => {
    const employeeId = report.employee_id;
    const reportDate = dateKey(report.date || report.created_at);
    if (!employeeId || !reportDate) return;
    if (!reportDatesByEmployee.has(employeeId))
      reportDatesByEmployee.set(employeeId, new Set());
    reportDatesByEmployee.get(employeeId).add(reportDate);
  });
  return (attendanceRows || []).filter((row) => {
    const userId = row?.user_id;
    const rowDate = attendanceDateKey(row);
    if (!row?.clock_in || !userId || !rowDate) return false;
    if (reportDatesByEmployee.get(userId)?.has(rowDate)) return false;
    return rowDate !== today || isPastAutoClockOut();
  });
}
function groupedMissedEods(
  attendanceRows = [],
  reports = [],
  today = new Date().toLocaleDateString("en-CA"),
) {
  const map = new Map();
  getMissedEodRows(attendanceRows, reports, today).forEach((row) => {
    const key = row.user_id || "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}
const STATUS_LABEL = {
  pending: "Received",
  open: "Received",
  assigned: "Assigned",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Resolved",
  issue_not_resolved: "Issue Not Resolved",
};
function displayStatus(status) {
  return status === "closed" ? "resolved" : status || "open";
}
function statusBadge(status) {
  const shown = displayStatus(status);
  const cls =
    shown === "resolved"
      ? "badge-resolved"
      : shown === "in_progress"
        ? "badge-in_progress"
        : shown === "assigned"
          ? "badge-assigned"
          : shown === "issue_not_resolved"
            ? "badge-danger"
            : "badge-open";
  return `<span class="badge ${cls}">${STATUS_LABEL[shown] || shown}</span>`;
}
function newestFirst(a, b) {
  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}
function dateKey(value) {
  if (!value) return "";
  if (value instanceof Date)
    return Number.isNaN(value.getTime())
      ? ""
      : value.toLocaleDateString("en-CA");
  const raw = String(value).trim();
  const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (dateOnly) return dateOnly[1];
  const d = new Date(raw.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA");
}
function matchesServiceReportFilters(
  row,
  { from = "", to = "", status = "all" } = {},
) {
  const rowDate = dateKey(row.created_at);
  if (from && rowDate && rowDate < from) return false;
  if (to && rowDate && rowDate > to) return false;
  if (status === "active") return !["resolved", "closed", "issue_not_resolved"].includes(row.status);
  if (status === "resolved") return ["resolved", "closed"].includes(row.status);
  if (status === "issues") return row.status === "issue_not_resolved";
  if (status === "paid") return row.payment_status === "paid";
  if (status === "unpaid")
    return row.bill_amount && row.payment_status !== "paid";
  return true;
}
function buildPaidUpdates(row, extra = {}) {
  const updates = {
    payment_status: "paid",
    // Manual "Mark Paid" records a cash collection unless told otherwise.
    payment_method: row?.payment_method || "cash",
    payment_received_at:
      row?.payment_received_at ||
      new Date().toISOString().slice(0, 19).replace("T", " "),
    ...extra,
  };
  if (!["resolved", "closed", "issue_not_resolved"].includes(row?.status))
    updates.status = "resolved";
  return updates;
}
async function markInquiryPaid(row, extra = {}) {
  const updates = buildPaidUpdates(row, extra);
  const ops = [supabase.from("inquiries").update(updates).eq("id", row.id)];
  if (row.ticket_id && updates.status === "resolved") {
    ops.push(
      supabase
        .from("tickets")
        .update({ status: "resolved" })
        .eq("id", row.ticket_id),
    );
  }
  const results = await Promise.all(ops);
  return results.find((r) => r.error)?.error || null;
}
export async function renderAdminDashboard(container) {
  showLoader(container);
  if (container._adminDashboardChannel) {
    supabase.removeChannel(container._adminDashboardChannel);
    container._adminDashboardChannel = null;
  }
  if (container._adminDashboardCleanup) {
    clearInterval(container._adminDashboardCleanup);
    container._adminDashboardCleanup = null;
  }
  const today = new Date().toLocaleDateString("en-CA");
  const reportFilters = {
    from: container.dataset.companyFrom || "",
    to: container.dataset.companyTo || "",
    status: container.dataset.companyStatus || "all",
  };
  const apiBase =
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
      ? "/api"
      : "http://localhost:5000/api";
  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
  });
  let tickets, inquiries, attendance, eodReports, stocks, profiles, complaints, autoAssignStatus;
  try {
    const res = await Promise.all([
      supabase
        .from("tickets")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("inquiries")
        .select("*")
        .in("status", ["pending", "open", "assigned", "in_progress"])
        .order("created_at", { ascending: false }),
      supabase
        .from("attendance")
        .select("*, profiles(full_name)")
        .order("clock_in", { ascending: false }),
      supabase.from("stocks").select("*"),
      supabase.from("profiles").select("*"),
      supabase
        .from("complaints")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("eod_reports")
        .select("*")
        .order("date", { ascending: false }),
      fetch(`${apiBase}/auto-assignment/status`, { headers: authHeaders() }).then(r => r.ok ? r.json() : { auto_assignment_enabled: false })
    ]);
    tickets = res[0].data;
    inquiries = res[1].data;
    attendance = res[2].data;
    stocks = res[3].data;
    profiles = res[4].data;
    complaints = res[5].data;
    eodReports = res[6].data;
    autoAssignStatus = res[7];
    const firstErr = res.slice(0, 7).find((r) => r.error)?.error;
    if (firstErr) console.warn("[Admin] Partial load issue:", firstErr.message);
  } catch (err) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:40px;"><h2 style="color:var(--primary);">Initialization Error</h2><p>${err.message}</p></div>`;
    return;
  }
  const t = tickets || [],
    i = inquiries || [],
    all_a = attendance || [],
    all_eod = eodReports || [],
    s = stocks || [],
    p = profiles || [],
    c = complaints || [];
  let a = all_a.filter((x) => isValidActiveAttendance(x, today));
  const lowStock = s.filter((x) => x.quantity <= x.min_stock).length;
  const phoneToCompany = new Map();
  const profileById = new Map();
  p.forEach((pr) => {
    if (pr.phone && pr.company) phoneToCompany.set(pr.phone, pr.company);
  });
  p.forEach((pr) => {
    if (pr.id) profileById.set(pr.id, pr);
  });
  const missedEodMap = groupedMissedEods(all_a, all_eod, today);
  const eodWarnings = [...missedEodMap.entries()]
    .map(([userId, rows]) => ({
      userId,
      count: rows.length,
      latest: rows.sort(
        (x, y) => new Date(y.clock_in || 0) - new Date(x.clock_in || 0),
      )[0],
      employee: profileById.get(userId),
    }))
    .sort(
      (x, y) =>
        y.count - x.count ||
        new Date(y.latest?.clock_in || 0) - new Date(x.latest?.clock_in || 0),
    );
  const strictEodUsers = new Set(
    eodWarnings.filter((x) => x.count >= STRICT_EOD_LIMIT).map((x) => x.userId),
  );
  a = a.filter((row) => !strictEodUsers.has(row.user_id));
  const { data: allInquiries } = await supabase
    .from("inquiries")
    .select("*")
    .order("created_at", { ascending: false });
  const reportInquiries = (allInquiries || []).filter((inq) =>
    matchesServiceReportFilters(inq, reportFilters),
  );
  const companyMap = new Map();
  reportInquiries.forEach((inq) => {
    const company =
      inq.company_name ||
      phoneToCompany.get(inq.phone) ||
      "Walk-in / Unregistered";
    if (!companyMap.has(company))
      companyMap.set(company, { total: 0, active: 0, resolved: 0 });
    const entry = companyMap.get(company);
    entry.total++;
    if (["resolved", "closed"].includes(inq.status)) entry.resolved++;
    else entry.active++;
  });
  const companyRows = [...companyMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);
  const activeInquiries = [...i].sort(newestFirst);
  const allRows = allInquiries || [];
  const resolvedInquiries = (allInquiries || [])
    .filter((x) => ["resolved", "closed"].includes(x.status))
    .sort(newestFirst);
  const newToday = allRows.filter(
    (x) => dateKey(x.created_at) === today,
  ).length;
  const pendingAssignment = allRows.filter(
    (x) =>
      !x.assigned_employee_id && !["resolved", "closed", "issue_not_resolved"].includes(x.status),
  ).length;
  const inProgress = allRows.filter(
    (x) => displayStatus(x.status) === "in_progress",
  ).length;
  const resolvedToday = allRows.filter(
    (x) =>
      ["resolved", "closed"].includes(x.status) &&
      dateKey(x.updated_at || x.bill_generated_at || x.created_at) === today,
  ).length;
  // On-time = resolved today AND completed before their SLA deadline
  const onTimeToday = allRows.filter((x) => {
    if (!["resolved", "closed"].includes(x.status)) return false;
    if (dateKey(x.updated_at || x.bill_generated_at || x.created_at) !== today) return false;
    const deadline = calculateSLA(x.created_at);
    const resolvedAt = new Date(x.updated_at || x.bill_generated_at || x.created_at);
    return resolvedAt <= deadline;
  }).length;
  const onTimeRate = resolvedToday > 0 ? Math.round((onTimeToday / resolvedToday) * 100) : 0;
  const todayTarget = Math.max(1, parseInt(localStorage.getItem("nest-daily-target") || "8", 10));
  const unpaidBills = allRows.filter(
    (x) => x.bill_amount && x.payment_status !== "paid",
  ).length;
  const cashPending = allRows
    .filter(
      (x) =>
        x.payment_method === "cash" &&
        x.payment_status === "paid" &&
        x.cash_collected_at &&
        !x.cash_submitted_at,
    )
    .reduce((sum, x) => sum + (Number(x.bill_total) || 0), 0);
  const openComplaints = c.filter(
    (x) =>
      !["resolved", "closed"].includes(String(x.status || "").toLowerCase()),
  );
  const recentComplaints = [...c].sort(newestFirst).slice(0, 5);
  const attentionItems = activeInquiries
    .filter(
      (x) =>
        !x.assigned_employee_id ||
        ["pending", "open"].includes(displayStatus(x.status)) ||
        x.assignment_status === "declined",
    )
    .map((x) => ({
      ...x,
      _reason:
        x.assignment_status === "declined"
          ? "Declined"
          : !x.assigned_employee_id
            ? "Unassigned"
            : "Needs update",
    }));
  // Employees currently online = active (clocked-in, not clocked-out) attendance.
  const onlineEmployees = [];
  const seenOnline = new Set();
  [...a]
    .sort((x, y) => new Date(y.clock_in || 0) - new Date(x.clock_in || 0))
    .forEach((row) => {
      const uid = row.user_id;
      if (uid && seenOnline.has(uid)) return;
      if (uid) seenOnline.add(uid);
      const prof = profileById.get(uid) || {};
      onlineEmployees.push({
        name: row.profiles?.full_name || prof.full_name || "Employee",
        role: prof.role || prof.company || "",
        clockIn: row.clock_in,
        location: row.location || "",
      });
    });
  const onlineCardHtml = `      <div class="card" id="online-now-card">        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">          <span class="card-title" data-card="online" style="display:inline-flex;align-items:center;gap:8px;"><span style="width:9px;height:9px;border-radius:50%;background:var(--success,#22c55e);box-shadow:0 0 0 0 rgba(34,197,94,0.6);animation:onlinePulse 1.8s infinite;"></span>Online Now</span>          <span class="badge badge-resolved">${onlineEmployees.length}</span>        </div>        <div class="table-wrap recent-requests-scroll">          <table>            <thead><tr><th>Employee</th><th>Since</th><th>Location</th></tr></thead>            <tbody>              ${onlineEmployees.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-dim)">No one is online right now</td></tr>' : onlineEmployees.map((e) => `<tr>                  <td><span style="display:inline-flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--success,#22c55e);flex:none;"></span><b>${escapeHtml(e.name)}</b></span>${e.role ? `<br/><small style="color:var(--text-dim);margin-left:16px">${escapeHtml(e.role)}</small>` : ""}</td>                  <td><span class="badge badge-open">${formatTime(e.clockIn)}</span></td>                  <td><small style="color:var(--text-dim)">${e.location ? escapeHtml(e.location) : "&mdash;"}</small></td>                </tr>`).join("")}            </tbody>          </table>        </div>      </div>`;
  container.innerHTML = `    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">      <div>        <h1>Admin Hub</h1>        <p>Real-time operations monitoring</p>      </div>      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">        <div style="display:inline-flex;align-items:center;gap:10px;padding:6px 14px;border-radius:100px;background:var(--panel-2,var(--bg-soft));border:1px solid var(--line,var(--border));">          <span style="font-size:0.82rem;font-weight:700;color:var(--text-dim);">Auto Assign:</span>          <label class="switch-container" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;">            <div class="switch-outer" id="dash-auto-assign-switch-outer" style="position:relative;width:44px;height:22px;background:${autoAssignStatus.auto_assignment_enabled ? "var(--success)" : "var(--border)"};border-radius:100px;transition:0.3s;box-shadow:inset 0 1px 3px rgba(0,0,0,0.15);">              <div class="switch-inner" id="dash-auto-assign-switch-inner" style="position:absolute;top:2px;left:${autoAssignStatus.auto_assignment_enabled ? "24px" : "2px"};width:18px;height:18px;background:#ffffff;border-radius:50%;transition:0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>            </div>            <span style="font-size:0.85rem;font-weight:700;color:${autoAssignStatus.auto_assignment_enabled ? "var(--success)" : "var(--text-dim)"};" id="dash-auto-assign-status-text">${autoAssignStatus.auto_assignment_enabled ? "ON" : "OFF"}</span>            <input type="checkbox" id="dash-auto-assign-toggle-input" style="display:none;" ${autoAssignStatus.auto_assignment_enabled ? "checked" : ""} />          </label>        </div>        <button class="btn btn-primary" id="admin-dashboard-register">${ICONS.plus}<span>Register Request</span></button>        <button class="btn btn-secondary" id="admin-refresh">Refresh</button>      </div>    </div>    ${onlineCardHtml}      ${
    eodWarnings.length
      ? `      <div class="card">        <div class="card-header"><span class="card-title" data-card="eod">EOD Warnings</span></div>        <div class="table-wrap recent-requests-scroll">          <table>            <thead><tr><th>Employee</th><th>Missed EOD</th><th>Last Attendance</th><th>Action</th></tr></thead>            <tbody>              ${eodWarnings
          .slice(0, 5)
          .map(
            (x) =>
              `<tr>                <td><b>${escapeHtml(x.employee?.full_name || "Employee")}</b></td>                <td><span class="badge ${x.count >= STRICT_EOD_LIMIT ? "badge-danger" : "badge-medium"}">${x.count} day${x.count === 1 ? "" : "s"}</span></td>                <td><small>${formatDateTime(x.latest?.clock_in)}</small></td>                <td>${x.count >= STRICT_EOD_LIMIT ? '<span class="badge badge-danger">Strict: block clock-in</span>' : '<span class="badge badge-medium">Warn employee</span>'}</td>              </tr>`,
          )
          .join(
            "",
          )}            </tbody>          </table>        </div>      </div>`
      : ""
  }      <!-- Actionable service queue -->      <div class="card">        <div class="card-header"><span class="card-title" data-card="attn">Needs Attention</span></div>        <div class="table-wrap recent-requests-scroll">          <table>            <thead><tr><th>Ticket</th><th>Customer</th><th>Reason</th><th></th></tr></thead>            <tbody>              ${attentionItems.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--text-dim)">No requests need attention</td></tr>' : attentionItems.map((x) => `<tr>                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || "â€”"}</code><br/><small style="color:var(--text-dim)">${formatDateTime(x.created_at)}</small></td>                  <td><b>${x.full_name}</b><br/><small style="color:var(--text-dim)">${x.company_name || x.service_item || "Service request"}</small></td>                  <td><span class="badge badge-${x._reason === "Declined" ? "danger" : "medium"}">${x._reason}</span></td>                  <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>                </tr>`).join("")}            </tbody>          </table>        </div>      </div>      <!-- Service Requests Card (From Guests) -->      <div class="card">        <div class="card-header"><span class="card-title" data-card="recent">Recent Service Requests</span></div>        <div class="table-wrap recent-requests-scroll">          <table>            <thead><tr><th>Ticket</th><th>Customer</th><th>Company</th><th>Status</th><th></th></tr></thead>            <tbody>              ${activeInquiries.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-dim)">No active requests</td></tr>' : activeInquiries.map((x) => `<tr>                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || "—"}</code><br/><small style="color:var(--text-dim)">${formatDateTime(x.created_at)}</small></td>                  <td><b>${x.full_name}</b></td>                  <td>${x.company_name ? `<b>${x.company_name}</b>` : '<span style="color:var(--text-dim)">—</span>'}</td>                  <td>${statusBadge(x.status)}</td>                  <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>                </tr>`).join("")}            </tbody>          </table>        </div>      </div>      <div class="card">        <div class="card-header"><span class="card-title" data-card="complaints">Recent Complaints</span></div>        <div class="table-wrap recent-requests-scroll">          <table>            <thead><tr><th>Ticket</th><th>Phone</th><th>Status</th><th></th></tr></thead>            <tbody>              ${recentComplaints.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-dim)">No complaints yet</td></tr>' : recentComplaints.map((x) => `<tr>                  <td><code style="font-size:0.78rem;color:var(--primary)">${escapeHtml(x.ticket_no || "-")}</code><br/><small style="color:var(--text-dim)">${formatDateTime(x.created_at)}</small></td>                  <td><b>${escapeHtml(x.phone || "-")}</b><br/><small style="color:var(--text-dim);display:block;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(x.complaint_text || "Complaint")}</small></td>                  <td>${statusBadge(x.status)}</td>                  <td><button class="btn btn-primary btn-sm cmp-dash-btn" data-id="${escapeHtml(x.id)}">Respond</button></td>                </tr>`).join("")}            </tbody>          </table>        </div>      </div>      <div class="card" style="margin-top:24px">        <div class="card-header"><span class="card-title" data-card="resolved">Resolved Services</span></div>        <div class="table-wrap recent-requests-scroll">        <table>          <thead><tr><th>Ticket</th><th>Service Date</th><th>Company</th><th>Name</th><th>Status</th><th></th></tr></thead>          <tbody>            ${resolvedInquiries.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-dim)">No resolved services yet</td></tr>' : resolvedInquiries.map((x) => `<tr>                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || "â€”"}</code></td>                  <td><small>${formatDateTime(x.created_at)}</small></td>                  <td>${x.company_name ? `<b>${x.company_name}</b>` : '<span style="color:var(--text-dim)">â€”</span>'}</td>                  <td><b>${x.full_name}</b></td>                  <td>${statusBadge(x.status)}</td>                  <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>                </tr>`).join("")}          </tbody>        </table>      </div>    </div>    <div class="card" style="margin-top:24px" id="company-svc-card">      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">        <span class="card-title">${ICONS.building}<span style="margin-left:8px">Services by Company</span></span>        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">          <select id="company-status-filter" style="padding:8px 12px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-weight:700;">            <option value="all" ${reportFilters.status === "all" ? "selected" : ""}>All</option>            <option value="active" ${reportFilters.status === "active" ? "selected" : ""}>Active</option>            <option value="resolved" ${reportFilters.status === "resolved" ? "selected" : ""}>Resolved</option>            <option value="paid" ${reportFilters.status === "paid" ? "selected" : ""}>Paid</option>            <option value="unpaid" ${reportFilters.status === "unpaid" ? "selected" : ""}>Unpaid</option>          </select>          <input type="date" id="company-from" value="${reportFilters.from}" style="padding:8px 12px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);"/>          <input type="date" id="company-to" value="${reportFilters.to}" style="padding:8px 12px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);"/>        <div class="search-input-wrap" style="min-width:160px;max-width:260px;">          <span>${ICONS.search}</span>          <input class="search-input" id="company-search" placeholder="Filter company…" style="padding:6px 10px;font-size:0.82rem;"/>        </div>        <button class="btn btn-secondary btn-sm" id="company-export">Export All</button>        <button class="btn btn-secondary btn-sm" id="company-clear-filters">Clear</button>        </div>      </div>      <div class="table-wrap" id="company-table-wrap">        <table id="company-svc-table">          <thead><tr><th>Company</th><th>Total</th><th>Active</th><th>Resolved</th><th></th></tr></thead>          <tbody>            ${companyRows.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-dim)">No service data yet</td></tr>' : companyRows.map(([company, counts]) => `<tr data-company="${company}">                  <td><b>${company}</b></td>                  <td><span class="badge badge-open">${counts.total}</span></td>                  <td style="color:var(--warning);font-weight:700">${counts.active}</td>                  <td style="color:var(--success);font-weight:700">${counts.resolved}</td>                  <td><button class="btn btn-secondary btn-sm view-company-btn" data-company="${company}" style="white-space:nowrap">View All</button></td>                </tr>`).join("")}          </tbody>        </table>      </div>    </div>  `;



  // ── Convert the dense record tables into design list-cards ───────
  const lrow = (icon, title, sub, badge, btnHtml) =>
    `<div class="lrow"><div class="lrow-ico">${icon}</div><div class="lrow-main"><b>${title}</b><span class="lsub">${sub}</span></div>${badge || ""}${btnHtml || ""}</div>`;
  const listCard = (icon, heading, count, rowsHtml) =>
    `<div class="card list-card"><div class="card-head"><h3>${icon} ${heading}</h3>${count ? `<span class="chip">${count}</span>` : ""}</div><div class="list list-scroll">${rowsHtml || `<div style="text-align:center;padding:28px;color:var(--text-dim)">Nothing here yet</div>`}</div></div>`;
  const swapCard = (key, html) => {
    const head = container.querySelector(`[data-card="${key}"]`);
    const card = head && head.closest(".card");
    if (card) card.outerHTML = html;
  };
  const inqRow = (x, icon) => lrow(
    icon,
    escapeHtml(x.full_name || "—"),
    `<em class="id-mono" style="font-style:normal">${escapeHtml(x.ticket_no || "—")}</em> · ${x.company_name ? escapeHtml(x.company_name) : x.service_item ? escapeHtml(x.service_item) : "—"} · ${formatDateTime(x.created_at)}`,
    statusBadge(x.status),
    `<button class="btn btn-secondary btn-sm inq-btn" data-id="${x.id}">Manage</button>`,
  );
  if (eodWarnings.length) swapCard("eod", listCard(ICONS.clipboard, "EOD Warnings", eodWarnings.length,
    eodWarnings.slice(0, 5).map((x) => lrow(ICONS.clipboard,
      escapeHtml(x.employee?.full_name || "Employee"),
      `${x.count} missed day${x.count === 1 ? "" : "s"} · last in ${formatDateTime(x.latest?.clock_in)}`,
      `<span class="badge ${x.count >= STRICT_EOD_LIMIT ? "badge-danger" : "badge-medium"}">${x.count >= STRICT_EOD_LIMIT ? "Strict: block clock-in" : "Warn employee"}</span>`)).join("")));
  swapCard("attn", listCard(ICONS.alert, "Needs Attention", attentionItems.length,
    attentionItems.map((x) => lrow(ICONS.ticket, escapeHtml(x.full_name || "—"),
      `<em class="id-mono" style="font-style:normal">${escapeHtml(x.ticket_no || "—")}</em> · ${escapeHtml(x.company_name || x.service_item || "Service request")} · ${formatDateTime(x.created_at)}`,
      `<span class="badge badge-${x._reason === "Declined" ? "danger" : "medium"}">${x._reason}</span>`,
      `<button class="btn btn-secondary btn-sm inq-btn" data-id="${x.id}">Manage</button>`)).join("")));
  swapCard("recent", listCard(ICONS.inbox, "Recent Service Requests", activeInquiries.length,
    activeInquiries.map((x) => inqRow(x, ICONS.ticket)).join("")));
  swapCard("complaints", listCard(ICONS.phone, "Recent Complaints", openComplaints.length,
    recentComplaints.map((x) => lrow(ICONS.alert, escapeHtml(x.phone || "—"),
      `<em class="id-mono" style="font-style:normal">${escapeHtml(x.ticket_no || "—")}</em> · ${escapeHtml((x.complaint_text || "Complaint").slice(0, 42))} · ${formatDateTime(x.created_at)}`,
      statusBadge(x.status),
      `<button class="btn btn-secondary btn-sm cmp-dash-btn" data-id="${escapeHtml(x.id)}">Respond</button>`)).join("")));
  swapCard("resolved", listCard(ICONS.check, "Resolved Services", resolvedInquiries.length,
    resolvedInquiries.map((x) => inqRow(x, ICONS.check)).join("")));

  // Pair list-cards into grid-2-1 rows matching design layout.
  // Cards in the same row stretch to equal height (grid default).
  {
    const _lc = [...container.querySelectorAll(".list-card")];
    for (let k = 0; k + 1 < _lc.length; k += 2) {
      const g = document.createElement("div");
      g.className = "grid-2-1";
      g.style.cssText = "margin-top:18px";
      _lc[k].before(g);
      g.appendChild(_lc[k]);
      g.appendChild(_lc[k + 1]);
    }
  }


  const bind = (sel, cb) => {
    const el = container.querySelector(sel);
    if (el) el.onclick = cb;
  };
  bind("#admin-refresh", () => renderAdminDashboard(container));
  bind("#admin-dashboard-register", () =>
    openAdminRequestModal(() => renderAdminDashboard(container)),
  );
  // Alerts + voice are always on now (no manual button). Make sure browser
  // notification permission is requested on load so live admin alerts work.
  ensureNotifyPermission();

  const dashToggleInput = container.querySelector("#dash-auto-assign-toggle-input");
  const dashSwitchOuter = container.querySelector("#dash-auto-assign-switch-outer");
  const dashSwitchInner = container.querySelector("#dash-auto-assign-switch-inner");
  const dashStatusText = container.querySelector("#dash-auto-assign-status-text");

  if (dashToggleInput && dashSwitchOuter && dashSwitchInner && dashStatusText) {
    dashToggleInput.onchange = async () => {
      const enabled = dashToggleInput.checked;
      dashSwitchOuter.style.background = enabled
        ? "var(--success)"
        : "var(--border)";
      dashSwitchInner.style.left = enabled ? "24px" : "2px";
      dashStatusText.textContent = enabled ? "ON" : "OFF";
      dashStatusText.style.color = enabled ? "var(--success)" : "var(--text-dim)";

      try {
        const res = await fetch(`${apiBase}/auto-assignment/status`, {
          method: "PUT",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            data.error || "Failed to update auto-assignment status",
          );

        toast(`Auto assignment turned ${enabled ? "on" : "off"}`, "success");
      } catch (err) {
        toast(err.message, "error");
        // Revert UI state on error
        dashToggleInput.checked = !enabled;
        dashSwitchOuter.style.background = !enabled
          ? "var(--success)"
          : "var(--border)";
        dashSwitchInner.style.left = !enabled ? "24px" : "2px";
        dashStatusText.textContent = !enabled ? "ON" : "OFF";
        dashStatusText.style.color = !enabled ? "var(--success)" : "var(--text-dim)";
      }
    };
  }
  const companySearch = container.querySelector("#company-search");
  if (companySearch) {
    companySearch.oninput = () => {
      const q = companySearch.value.toLowerCase();
      container
        .querySelectorAll("#company-svc-table tbody tr[data-company]")
        .forEach((row) => {
          row.style.display = row.dataset.company.toLowerCase().includes(q)
            ? ""
            : "none";
        });
    };
  }
  const companyExport = container.querySelector("#company-export");
  if (companyExport) {
    companyExport.onclick = () => {
      const q = (companySearch?.value || "").toLowerCase();
      exportToCSV(
        "services-by-company.csv",
        companyRows
          .filter(([company]) => !q || company.toLowerCase().includes(q))
          .map(([company, counts]) => ({
            company,
            total: counts.total,
            active: counts.active,
            resolved: counts.resolved,
          })),
      );
    };
  }
  const companyStatus = container.querySelector("#company-status-filter");
  const companyFrom = container.querySelector("#company-from");
  const companyTo = container.querySelector("#company-to");
  const rerenderCompanyReport = () => {
    container.dataset.companyStatus = companyStatus?.value || "all";
    container.dataset.companyFrom = companyFrom?.value || "";
    container.dataset.companyTo = companyTo?.value || "";
    renderAdminDashboard(container);
  };
  if (companyStatus) companyStatus.onchange = rerenderCompanyReport;
  if (companyFrom) companyFrom.onchange = rerenderCompanyReport;
  if (companyTo) companyTo.onchange = rerenderCompanyReport;
  const clearCompanyFilters = container.querySelector("#company-clear-filters");
  if (clearCompanyFilters) {
    clearCompanyFilters.onclick = () => {
      container.dataset.companyStatus = "all";
      container.dataset.companyFrom = "";
      container.dataset.companyTo = "";
      renderAdminDashboard(container);
    };
  }
  const companyPhones = new Map();
  p.forEach((pr) => {
    if (pr.phone && pr.company) {
      if (!companyPhones.has(pr.company))
        companyPhones.set(pr.company, new Set());
      companyPhones.get(pr.company).add(pr.phone);
    }
  });
  container.querySelectorAll(".view-company-btn").forEach((btn) => {
    btn.onclick = async () => {
      const company = btn.dataset.company;
      const phones =
        company === "Walk-in / Unregistered"
          ? null
          : [...(companyPhones.get(company) || [])];
      let companyInquiries;
      if (!phones) {
        const allPhones = [...phoneToCompany.keys()];
        const { data } = await supabase
          .from("inquiries")
          .select("*")
          .order("created_at", { ascending: false });
        companyInquiries = (data || []).filter(
          (x) => !allPhones.includes(x.phone),
        );
      } else if (phones.length > 0) {
        const { data } = await supabase
          .from("inquiries")
          .select("*")
          .in("phone", phones)
          .order("created_at", { ascending: false });
        companyInquiries = data || [];
      } else {
        companyInquiries = [];
      }
      companyInquiries = (allInquiries || [])
        .filter(
          (x) =>
            (x.company_name ||
              phoneToCompany.get(x.phone) ||
              "Walk-in / Unregistered") === company,
        )
        .filter((x) => matchesServiceReportFilters(x, reportFilters))
        .sort(newestFirst);
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `        <div class="modal" style="max-width:700px">          <div class="modal-header">            <span class="modal-title">${ICONS.building}<span style="margin-left:8px">${company}</span></span>            <button class="modal-close" id="cm-co">?</button>          </div>          <div class="modal-body" style="padding:0">            <div class="table-wrap">              <table>                <thead><tr><th>Ticket</th><th>Service Date</th><th>Customer</th><th>Service</th><th>Status</th><th>Bill</th><th></th></tr></thead>                <tbody>                  ${companyInquiries.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No inquiries found</td></tr>' : companyInquiries.map((x) => `<tr>                        <td><code style="font-size:0.75rem;color:var(--primary)">${x.ticket_no || "—"}</code></td>                        <td><small>${formatDateTime(x.created_at)}</small></td>                        <td><b>${x.full_name}</b><br/><small>${x.phone}</small></td>                        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.service_item || "—"}</td>                        <td>${statusBadge(x.status)}</td>                        <td>${x.bill_amount ? "?" + Number(x.bill_amount).toLocaleString("en-IN") : "—"}</td>                        <td><button class="btn btn-primary btn-sm co-inq-btn" data-id="${x.id}">Manage</button></td>                      </tr>`).join("")}                </tbody>              </table>            </div>          </div>          <div class="modal-footer">            <button class="btn btn-secondary" id="co-export">Export This Company</button>            <button class="btn btn-secondary" id="cm-co2">Close</button>          </div>        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector("#cm-co").onclick = overlay.querySelector(
        "#cm-co2",
      ).onclick = () => overlay.remove();
      overlay.querySelector("#co-export").onclick = () =>
        exportToCSV(
          `${company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-services.csv`,
          companyInquiries.map((x) => ({
            ticket: x.ticket_no || x.id,
            service_date: x.created_at || "",
            company,
            customer: x.full_name || "",
            phone: x.phone || "",
            service: x.service_item || "",
            status: x.status || "",
            bill_amount: x.bill_amount || "",
            payment_status: x.payment_status || "",
            location: x.location || "",
          })),
        );
      overlay.querySelectorAll(".co-inq-btn").forEach((b) => {
        b.onclick = () => {
          overlay.remove();
          openInquiryDetailWithLoader(b, b.dataset.id, () =>
            renderAdminDashboard(container),
          );
        };
      });
    };
  });
  container.querySelectorAll(".inq-btn").forEach((btn) => {
    btn.onclick = () =>
      openInquiryDetailWithLoader(btn, btn.dataset.id, () =>
        renderAdminDashboard(container),
      );
  });
  container.querySelectorAll(".cmp-dash-btn").forEach((btn) => {
    btn.onclick = () =>
      openComplaintResponder(
        c.find((r) => String(r.id) === String(btn.dataset.id)),
        () => renderAdminDashboard(container),
      );
  });
  const refreshDashboard = () => {
    if (document.getElementById("admin-refresh"))
      renderAdminDashboard(container);
  };
  const channel = supabase
    .channel("admin-dashboard-live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "inquiries" },
      (payload) => {
        const row = payload.new || {};
        showNotification({
          title: "New service request",
          body: `${row.ticket_no || "New ticket"} from ${row.full_name || "client"}`,
          type: "alert",
          tag: `new-request-${row.id || Date.now()}`,
        });
        refreshDashboard();
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "inquiries" },
      (payload) => {
        const row = payload.new || {};
        if (row.payment_status === "paid") {
          showNotification({
            title: "Payment Received",
            body: `${row.full_name || "Client"} paid \u20B9${row.bill_amount || ""} for ${row.ticket_no || ""}`,
            type: "payment",
            tag: `pay-${row.id || ""}`,
          });
        } else if (row.feedback_rating != null) {
          showNotification({
            title: "? New Feedback",
            body: `${row.full_name || "Client"} rated ${row.feedback_rating}/5`,
            type: "info",
            tag: `fb-${row.id || ""}`,
          });
        }
        refreshDashboard();
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "complaints" },
      (payload) => {
        const row = payload.new || {};
        showNotification({
          title: "New complaint",
          body: `${row.ticket_no || "Ticket"}: ${row.complaint_text || "Customer complaint received"}`,
          type: "alert",
          tag: `complaint-${row.id || Date.now()}`,
        });
        refreshDashboard();
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "complaints" },
      () => {
        refreshDashboard();
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "attendance" },
      (payload) => {
        const row = payload.new || {};
        const employee = profileById.get(row.user_id);
        showNotification({
          title: "Employee online",
          body: `${employee?.full_name || "Employee"} clocked in`,
          type: "success",
          tag: `attendance-in-${row.id || row.user_id || Date.now()}`,
        });
        refreshDashboard();
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "attendance" },
      (payload) => {
        const row = payload.new || {};
        const oldRow = payload.old || {};
        const employee = profileById.get(row.user_id);
        if (row.clock_out && !oldRow.clock_out) {
          showNotification({
            title: "Employee offline",
            body: `${employee?.full_name || "Employee"} clocked out`,
            type: "info",
            tag: `attendance-out-${row.id || row.user_id || Date.now()}`,
          });
        } else if (row.clock_in && !row.clock_out) {
          showNotification({
            title: "Employee online",
            body: `${employee?.full_name || "Employee"} is online`,
            type: "success",
            tag: `attendance-online-${row.id || row.user_id || Date.now()}`,
          });
        }
        refreshDashboard();
      },
    )
    .subscribe();
  container._adminDashboardChannel = channel;
  const checkRemoval = setInterval(() => {
    if (!document.body.contains(container)) {
      supabase.removeChannel(channel);
      if (container._adminDashboardChannel === channel)
        container._adminDashboardChannel = null;
      if (container._adminDashboardCleanup === checkRemoval)
        container._adminDashboardCleanup = null;
      clearInterval(checkRemoval);
    }
  }, 5000);
  container._adminDashboardCleanup = checkRemoval;
}
async function openInquiryDetail(id, onDone) {
  const contextRes = await fetch(
    `${API_BASE}/admin/inquiries/${encodeURIComponent(id)}/manage-context`,
    { headers: authHeaders() },
  );
  const context = await contextRes.json().catch(() => ({}));
  if (!contextRes.ok) {
    throw new Error(context.error || "Could not load service request");
  }
  const i = context.inquiry;
  const employees = Array.isArray(context.employees) ? context.employees : [];
  const restrictedEmployeeIds = new Set(
    employees.filter((employee) => employee.restricted).map((employee) => employee.id),
  );
  const availableEmployees = (employees || []).map((e) => ({
    ...e,
    _clockedIn: e.clockedIn && !e.restricted,
  }));
  const activeEmployeeIds = new Set(
    availableEmployees
      .filter((employee) => employee._clockedIn)
      .map((employee) => employee.id),
  );
  const technicianName =
    (employees || []).find((e) => e.id === i.assigned_employee_id)?.full_name ||
    "";
  const assignmentAwaitingResponse = Boolean(
    i.assigned_employee_id && i.assignment_status === "pending",
  );
  const assignmentLocked = Boolean(
    i.assigned_employee_id && i.assignment_status !== "declined",
  );
  const assignmentLockText = assignmentAwaitingResponse
    ? `${technicianName || "Assigned technician"} must accept or decline before admin can change this assignment.`
    : `${technicianName || "This technician"} is already assigned. Reassignment is locked unless the employee declines.`;
  let billServices = [];
  if (i.bill_total) {
    billServices = (context.billServices || []).map((p) => {
      const parts = [
        p.category,
        p.sub_category,
        p.sub_sub_category || p.name,
      ].filter(Boolean);
      return { name: parts.join(" › "), cost: Number(p.cost) || 0 };
    });
  }
  const hasBill = Number(i.bill_total) > 0;
  // Itemised "what service / what extra" rows for the Generated Bill Detail block.
  const billServicesSubtotal = Math.max(0, Number(i.bill_amount || 0) - Number(i.extra_cost || 0));
  const billItemRows = billServices.length
    ? billServices
        .map(
          (s) =>
            `<div class="bill-row" style="display:flex; justify-content:space-between; gap:10px; font-size:0.85rem; margin-bottom:4px;"><span style="color:#475569;">${escapeHtml(s.name)}</span><b style="color:#0f172a; white-space:nowrap;">${money(s.cost)}</b></div>`,
        )
        .join("")
    : `<div class="bill-row" style="display:flex; justify-content:space-between; gap:10px; font-size:0.85rem; margin-bottom:4px;"><span style="color:#475569;">${escapeHtml(i.service_item || "Service")}</span><b style="color:#0f172a; white-space:nowrap;">${money(billServicesSubtotal)}</b></div>`;
  const billExtraRow =
    Number(i.extra_cost) > 0
      ? `<div class="bill-row" style="display:flex; justify-content:space-between; gap:10px; font-size:0.85rem; margin-bottom:4px;"><span style="color:#475569;">Additional charges${i.extra_cost_reason ? ` <span style="color:#94a3b8;">(${escapeHtml(i.extra_cost_reason)})</span>` : ""}</span><b style="color:#0f172a; white-space:nowrap;">${money(i.extra_cost)}</b></div>`
      : "";
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const serviceDeadline = i.created_at ? calculateSLA(i.created_at) : null;
  const slaDisplayText = ["resolved", "closed", "issue_not_resolved"].includes(i.status)
    ? "Service Completed"
    : serviceDeadline
      ? formatSLADeadline(serviceDeadline)
      : "-";

  overlay.innerHTML = `    <div class="modal" style="max-width:560px">      <div class="modal-header">        <span class="modal-title">${ICONS.ticket}<span style="margin-left:8px">Service Request</span></span>        <button class="modal-close" id="ci">${ICONS.close}</button>      </div>      <div class="modal-body">        <div class="sr-meta">          <div class="sr-meta-row">            <div><div class="sr-meta-label">Ticket</div><div class="sr-meta-value sr-mono">${i.ticket_no || "—"}</div></div>            <div><div class="sr-meta-label">Status</div><div>${statusBadge(i.status)}</div></div>          </div>          <div class="sr-meta-row">            <div><div class="sr-meta-label">Service Created</div><div class="sr-meta-value">${formatDateTime(i.created_at)}</div></div>            <div><div class="sr-meta-label">Last Updated</div><div class="sr-meta-value">${formatDateTime(i.updated_at || i.created_at)}</div></div>          </div>          <div class="sr-meta-row">            <div><div class="sr-meta-label">Name</div><div class="sr-meta-value">${i.full_name}</div></div>            <div><div class="sr-meta-label">Phone</div><div class="sr-meta-value">${i.phone}</div></div>          </div>          <div><div class="sr-meta-label">Service item</div><div class="sr-meta-value">${i.service_item || "—"}</div></div>          ${i.description ? `<div><div class="sr-meta-label">Customer description</div><div class="sr-meta-value" style="white-space:pre-wrap;line-height:1.45;">${escapeHtml(i.description)}</div></div>` : ""}          <div><div class="sr-meta-label">Location</div><div class="sr-meta-value">${i.location || "—"}</div></div>          <div class="sr-meta-row">            <div><div class="sr-meta-label">Preferred Time</div><div class="sr-meta-value">${i.preferred_time || "Flexible"}</div></div>            <div><div class="sr-meta-label">SLA Deadline</div><div class="sr-meta-value">${slaDisplayText}</div></div>          </div>          ${i.company_name ? `<div><div class="sr-meta-label">Company</div><div class="sr-meta-value">${i.company_name}</div></div>` : ""}          ${i.customer_lat != null && i.customer_lng != null ? `            <a href="${mapLink(i.customer_lat, i.customer_lng)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;text-decoration:none;">              ${ICONS.pin}<span>Open exact client pin</span>            </a>` : ""}          ${i.device_type || i.device_serial_no ? `            <div class="sr-meta-row">              <div><div class="sr-meta-label">Device Type</div><div class="sr-meta-value">${i.device_type || "—"}</div></div>              <div><div class="sr-meta-label">Serial No</div><div class="sr-meta-value sr-mono">${i.device_serial_no || "—"}</div></div>            </div>` : ""}          <div class="sr-meta-row">            <div><div class="sr-meta-label">Preferred Time</div><div class="sr-meta-value" style="color:var(--primary)">${i.preferred_time || "Flexible"}</div></div>            <div><div class="sr-meta-label">SLA Timer</div><div class="sr-meta-value">${formatTimeRemaining(calculateSLA(i.created_at))}</div></div>          </div>          ${i.extra_cost > 0 ? `            <div style="padding:12px; border-radius:12px; background:rgba(16,185,129,0.05); border:1px solid var(--primary); margin-top:10px;">              <div class="sr-meta-label">Additional Charges</div>              <div class="sr-meta-value">\u20B9${i.extra_cost} - <span style="font-size:0.8rem">${i.extra_cost_reason || "No reason"}</span></div>            </div>` : ""}          ${i.assignment_status === "declined" ? `            <div style="padding:12px;border-radius:12px;background:rgba(239,68,68,0.1);border:1px solid var(--danger);margin-top:10px;">              <div class="sr-meta-label" style="color:var(--danger)">Employee Declined</div>              <div class="sr-meta-value" style="font-size:0.85rem">${i.decline_reason || "No reason provided"}</div>            </div>` : ""}          ${assignmentLocked ? `            <div style="padding:12px;border-radius:12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);margin-top:10px;">              <div class="sr-meta-label" style="color:var(--warning)">${assignmentAwaitingResponse ? "Waiting for employee response" : "Assignment locked"}</div>              <div class="sr-meta-value" style="font-size:0.85rem">${assignmentLockText}</div>            </div>` : ""}          ${i.feedback_rating ? `            <div class="sr-fb-shown">              ${ICONS.star}              <div>                <div class="sr-meta-label">Customer feedback (${i.feedback_rating}/5)</div>                <div class="sr-meta-value">${i.feedback_comment || "No comment."}</div>              </div>            </div>` : ""}        </div>        ${hasBill ? `          <div class="bill-breakdown" style="margin-bottom:16px; background:#f8fafc; padding:15px; border-radius:12px; border:1px solid #eef2f7;">            <div style="font-size:0.7rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px;">Generated Bill Detail</div>            ${billItemRows}${billExtraRow}            <div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px; margin-top:6px; padding-top:6px; border-top:1px dashed #e2e8f0;"><span>Platform fee</span><b style="color:#0f172a;">${money(i.platform_fee)}</b></div>            <div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;"><span>Transport (${Number(i.transport_km || 0).toFixed(1)} km)</span><b style="color:#0f172a;">${money(i.transport_fee)}</b></div>            ${Number(i.discount_amount) > 0 ? `<div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px; color:#059669;"><span>Loyalty discount</span><b>-${money(i.discount_amount)}</b></div>` : ""}            <div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;"><span>GST (18%)</span><b style="color:#0f172a;">${money(i.gst_amount)}</b></div>            <div class="bill-row" style="display:flex; justify-content:space-between; font-size:0.95rem; margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0; font-weight:800; color:#10b981;"><span>Total Payable</span><b>${money(i.bill_total)}</b></div>            <button type="button" class="btn btn-primary btn-wide" id="view-bill-btn" style="margin-top:12px; background:#10b981; border:none; box-shadow:0 4px 12px rgba(16,185,129,0.2);">${ICONS.receipt}<span>View & Download Premium Bill</span></button>          </div>` : ""}        <div class="form-group">          <label>Assign to Technician</label>          <select id="assign-to" ${assignmentLocked ? "disabled" : ""}>            <option value="">— None —</option>            ${availableEmployees
              .map((e) => {
                const isOfflineAllowed = !e._clockedIn && e.always_assign;
                const statusLabel = e._clockedIn
                  ? "Online"
                  : restrictedEmployeeIds.has(e.id)
                    ? "Restricted"
                    : isOfflineAllowed
                      ? "Offline ⭐ (Allowed)"
                      : "Offline";
                const disabledAttr =
                  e._clockedIn || isOfflineAllowed ? "" : "disabled";
                return `<option value="${e.id}" ${
                  i.assigned_employee_id === e.id ? "selected" : ""
                } ${disabledAttr}>${statusLabel} - ${e.full_name}</option>`;
              })
              .join("")}          </select>          <small style="display:block;margin-top:8px;color:var(--text-dim);font-size:0.78rem;">${assignmentLocked ? "Already assigned. Save is disabled to prevent duplicate assignment." : "Only currently clocked-in employees with no strict EOD restriction can receive new assignments."}</small>        </div>      </div>      <div class="modal-footer">        <button class="btn btn-secondary" id="ci2">Close</button>        <button class="btn btn-primary" id="save-sr" ${assignmentLocked ? "disabled" : ""}>${ICONS.check}<span>${assignmentLocked ? "Already assigned" : "Save assignment"}</span></button>      </div>    </div>`;
  document.body.appendChild(overlay);

  // Device Service photos (taken / returned) the technician uploaded — admins
  // couldn't see these before. Fetched on open and appended to the modal body.
  (async () => {
    try {
      const dRes = await fetch(`${API_BASE}/device-tracking/status/${encodeURIComponent(id)}`, { headers: authHeaders() });
      if (!dRes.ok) return;
      const d = await dRes.json();
      const taken = d.device_taken_logs;
      const returned = d.device_return_logs;
      const followups = d.device_follow_up_logs || [];
      if (!taken && !returned && !followups.length) return;
      const photo = (url, alt) => url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="${alt}" style="width:100%;max-height:260px;object-fit:cover;border-radius:8px;margin-top:8px;display:block;"/></a>`
        : '<div style="color:var(--text-dim);font-size:0.82rem;margin-top:4px;">No photo uploaded</div>';
      const box = document.createElement("div");
      box.style.cssText = "margin-top:14px;border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--bg-soft);";
      box.innerHTML = `
        <div class="sr-meta-label" style="margin-bottom:10px;">🔧 Device Service — uploaded by technician</div>
        ${taken ? `<div style="margin-bottom:14px;"><b style="font-size:0.86rem;">📸 Device Taken</b> · <small style="color:var(--text-dim)">${escapeHtml(taken.profiles?.full_name || '')}${taken.taken_at ? ' · ' + formatDateTime(taken.taken_at) : ''}</small>${photo(taken.device_image_url, 'Device taken')}${taken.device_description ? `<div style="font-size:0.82rem;margin-top:6px;">${escapeHtml(taken.device_description)}</div>` : ''}</div>` : ''}
        ${returned ? `<div style="margin-bottom:6px;"><b style="font-size:0.86rem;">✅ Device Returned</b> · <small style="color:var(--text-dim)">${escapeHtml((returned.device_condition || 'good').toUpperCase())}${returned.returned_at ? ' · ' + formatDateTime(returned.returned_at) : ''}</small>${photo(returned.return_image_url, 'Device returned')}${returned.return_notes ? `<div style="font-size:0.82rem;margin-top:6px;">${escapeHtml(returned.return_notes)}</div>` : ''}</div>` : ''}
        ${followups.length ? `<div style="margin-top:8px;"><div class="sr-meta-label">Follow-up updates</div>${followups.map(f => `<div style="font-size:0.82rem;margin-top:5px;"><b style="color:var(--primary)">${escapeHtml(String(f.status || '').replace(/_/g, ' '))}</b>${f.notes ? ' — ' + escapeHtml(f.notes) : ''} <small style="color:var(--text-dim)">${f.created_at ? formatDateTime(f.created_at) : ''}</small></div>`).join('')}</div>` : ''}
      `;
      const body = overlay.querySelector(".modal-body");
      if (body) body.appendChild(box);
    } catch { /* device tracking optional */ }
  })();

  if (i.employee_update_detail) {
    const updateBox = document.createElement("div");
    updateBox.style.cssText =
      "padding:12px;border-radius:12px;background:var(--bg-soft);border:1px solid var(--border);margin-top:10px;";
    const updateStatus = String(i.employee_update_status || i.status || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    updateBox.innerHTML = `<div class="sr-meta-label">Employee submitted detail</div><div class="sr-meta-value" style="white-space:pre-wrap;line-height:1.45;">${escapeHtml(i.employee_update_detail)}</div><small style="color:var(--text-dim)">Status: ${updateStatus}${i.employee_update_at ? ` - ${formatDateTime(i.employee_update_at)}` : ""}</small>`;
    overlay.querySelector(".sr-meta")?.appendChild(updateBox);
  }
  const ciBtn = overlay.querySelector("#ci");
  if (ciBtn) ciBtn.onclick = () => overlay.remove();
  const ci2Btn = overlay.querySelector("#ci2");
  if (ci2Btn) ci2Btn.onclick = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  if (hasBill) {
    overlay.querySelector("#view-bill-btn").onclick = () => {
      const servicesSubtotal = Math.max(
        0,
        Number(i.bill_amount || 0) - Number(i.extra_cost || 0),
      );
      openPremiumBillModal(
        {
          customer: {
            name: i.full_name,
            phone: i.phone,
            location: i.location,
            company: i.company_name,
            device_type: i.device_type,
            device_serial: i.device_serial_no,
            service_item: i.service_item,
            ticket_no: i.ticket_no,
          },
          technician: technicianName,
          services: billServices,
          servicesSubtotal,
          extra: Number(i.extra_cost) || 0,
          extraReason: i.extra_cost_reason || "",
          platform: Number(i.platform_fee) || 0,
          km: Number(i.transport_km) || 0,
          transport: Number(i.transport_fee) || 0,
          discount: Number(i.discount_amount) || 0,
          taxable:
            servicesSubtotal +
            Number(i.extra_cost || 0) +
            Number(i.platform_fee || 0) +
            Number(i.transport_fee || 0) -
            Number(i.discount_amount || 0),
          gst: Number(i.gst_amount) || 0,
          total: Number(i.bill_total) || 0,
          paymentLink: i.payment_link || "",
        },
        { allowShare: false, title: "Bill (Sent to Client)" },
      );
    };
  }
  overlay.querySelector("#save-sr").onclick = async () => {
    if (assignmentLocked) {
      toast(
        "This request is already assigned. It can only be reassigned if the employee declines it.",
        "warning",
      );
      return;
    }
    const empId = overlay.querySelector("#assign-to").value;
    if (empId && !activeEmployeeIds.has(empId)) {
      const emp = availableEmployees.find((e) => e.id === empId);
      if (!emp || !emp.always_assign) {
        toast(
          "This employee is not clocked in. Please choose an active technician.",
          "warning",
        );
        return;
      }
    }
    const btn = overlay.querySelector("#save-sr");
    btn.disabled = true;
    btn.innerHTML = `<span>Saving…</span>`;
    const updates = { assigned_employee_id: empId || null };
    if (empId && i.assigned_employee_id !== empId) {
      updates.assignment_status = "pending";
      updates.decline_reason = null;
    } else if (!empId) {
      updates.assignment_status = null;
    }
    if (empId && !i.ticket_id) {
      const { data: existingClient } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone", i.phone)
        .maybeSingle();
      const { data: ticket, error: tErr } = await supabase
        .from("tickets")
        .insert({
          title: `Service: ${(i.service_item || "").slice(0, 30)}`,
          description: `Ticket ${i.ticket_no || ""} from ${i.full_name} (${i.phone}). ${i.service_item || ""}${i.description ? `\n\nCustomer says: ${i.description}` : ""}`,
          assigned_to: empId,
          client_id: existingClient ? existingClient.id : null,
          status: "assigned",
          category: "service_request",
        })
        .select()
        .single();
      if (tErr) {
        toast(tErr.message, "error");
        btn.disabled = false;
        btn.innerHTML = `${ICONS.check}<span>Save assignment</span>`;
        return;
      }
      updates.ticket_id = ticket.id;
      updates.status = "assigned";
    } else if (empId && i.ticket_id) {
      await supabase
        .from("tickets")
        .update({ assigned_to: empId, status: "assigned" })
        .eq("id", i.ticket_id);
      updates.status = "assigned";
    }
    const { error } = await supabase
      .from("inquiries")
      .update(updates)
      .eq("id", i.id);
    if (error) {
      toast(error.message, "error");
      btn.disabled = false;
      btn.innerHTML = `${ICONS.check}<span>Save assignment</span>`;
      return;
    }
    toast("Technician assigned", "success");
    overlay.remove();
    onDone();
  };
}
export async function renderAttendance(container) {
  showLoader(container);
  const [{ data: logs }, { data: eodReports }] = await Promise.all([
    supabase
      .from("attendance")
      .select("*, profiles(full_name)")
      .order("date", { ascending: false }),
    supabase.from("eod_reports").select("employee_id,date,created_at"),
  ]);
  const list = logs || [];
  const today = new Date().toLocaleDateString("en-CA");
  const todayLogs = list.filter((x) => x.date === today);
  const activeLogs = list.filter((x) => isValidActiveAttendance(x, today));
  const forgottenLogs = getMissedEodRows(list, eodReports || [], today);
  const forgottenByEmployee = groupedMissedEods(list, eodReports || [], today);
  const hasMissedEod = (row) =>
    forgottenLogs.some(
      (x) =>
        (x.id && row.id && x.id === row.id) ||
        (x.user_id === row.user_id &&
          attendanceDateKey(x) === attendanceDateKey(row)),
    );
  const restrictedEmployees = [...forgottenByEmployee.entries()]
    .filter(([, rows]) => rows.length >= STRICT_EOD_LIMIT)
    .map(([userId, rows]) => ({
      userId,
      rows: rows.sort(
        (a, b) => new Date(b.clock_in || 0) - new Date(a.clock_in || 0),
      ),
      name: rows[0]?.profiles?.full_name || "Employee",
    }))
    .sort(
      (a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name),
    );
  const completedToday = todayLogs.filter((x) => x.clock_in && x.clock_out);
  const avgMins = completedToday.length
    ? completedToday.reduce(
        (sum, x) => sum + (new Date(x.clock_out) - new Date(x.clock_in)),
        0,
      ) /
      completedToday.length /
      60000
    : 0;
  const avgHours = avgMins
    ? `${Math.floor(avgMins / 60)}h ${Math.round(avgMins % 60)}m`
    : "—";
  const rowHtml = (items) =>
    items.length === 0
      ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No records found</td></tr>'
      : items
          .map((x) => {
            const hw = hoursWorked(x.clock_in, x.clock_out);
            return `<tr>          <td>${formatDate(x.date)}</td>          <td><b>${x.profiles?.full_name || "—"}</b></td>          <td><span class="badge badge-open">${formatTime(x.clock_in)}</span></td>          <td>${x.clock_out ? `<span class="badge badge-resolved">${formatTime(x.clock_out)}</span>` : hasMissedEod(x) ? '<span class="badge badge-danger">Missing EOD</span>' : '<span class="badge badge-open">Active</span>'}</td>          <td>${hw ? `<span style="font-weight:600;color:var(--primary)">${hw}</span>` : '<span style="color:var(--text-dim)">—</span>'}</td>          <td><small>${x.location || "—"}</small></td>        </tr>`;
          })
          .join("");
  container.innerHTML = `    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">      <div>        <h1>Attendance Logs</h1>        <p>Track employee check-ins and locations</p>      </div>      <button class="btn btn-secondary" id="att-export">${ICONS.clipboard}<span>Export CSV</span></button>    </div>    <div class="stats-grid" style="margin-bottom:24px">      <div class="stat-card">        <div class="stat-value" style="color:var(--primary)">${todayLogs.length}</div>        <div class="stat-label">Today's Attendance</div>      </div>      <div class="stat-card">        <div class="stat-value" style="color:var(--success)">${activeLogs.length}</div>        <div class="stat-label">Currently Active</div>      </div>      <div class="stat-card">        <div class="stat-value" style="color:${forgottenLogs.length ? "var(--danger)" : "var(--success)"}">${forgottenLogs.length}</div>        <div class="stat-label">Forgot EOD</div>      </div>      <div class="stat-card">        <div class="stat-value" style="color:${restrictedEmployees.length ? "var(--danger)" : "var(--success)"}">${restrictedEmployees.length}</div>        <div class="stat-label">Restricted Users</div>      </div>      <div class="stat-card">        <div class="stat-value" style="color:var(--warning);font-size:1.6rem">${avgHours}</div>        <div class="stat-label">Avg Hours Today</div>      </div>    </div>    ${restrictedEmployees.length ? `      <div class="card" style="margin-bottom:24px;border:1px solid rgba(239,68,68,0.35);">        <div class="card-header">          <span class="card-title sr-icon-title">${ICONS.alert}<span>Clock-in Restrictions</span></span>        </div>        <div class="card-body">          <div class="table-wrap">            <table>              <thead><tr><th>Employee</th><th>Missed EODs</th><th>Latest Missed</th><th>Action</th></tr></thead>              <tbody>                ${restrictedEmployees.map((x) => `                  <tr>                    <td><b>${escapeHtml(x.name)}</b></td>                    <td><span class="badge badge-danger">${x.rows.length}</span></td>                    <td><small>${formatDateTime(x.rows[0]?.clock_in)}</small></td>                    <td><button class="btn btn-primary btn-sm resolve-attendance-restriction" data-user-id="${escapeHtml(x.userId)}">Resolve restriction</button></td>                  </tr>                `).join("")}              </tbody>            </table>          </div>        </div>      </div>    ` : ""}    <div class="df-wrap" style="margin-bottom:24px;">      <button class="btn btn-secondary df-toggle" id="att-filter-btn">${ICONS.filter}<span>Filters</span><span class="df-badge" id="att-badge" style="display:none">0</span></button>      <div class="df-panel" id="att-panel" style="display:none">        <div class="df-field"><span class="df-label">Employee</span><input type="text" id="att-search" placeholder="Search by name…"/></div>        <div class="df-field"><span class="df-label">Date</span><input type="date" id="att-date"/></div>        <div class="df-footer"><button class="btn btn-ghost btn-sm" id="att-clear">Clear all</button></div>      </div>    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead><tr><th>Date</th><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Hours Worked</th><th>Location</th></tr></thead>          <tbody id="attendance-log-rows">${rowHtml(list)}</tbody>        </table>      </div>    </div>  `;
  const attSearch = container.querySelector("#att-search");
  const attDate = container.querySelector("#att-date");
  const attBadge = container.querySelector("#att-badge");
  const attPanel = container.querySelector("#att-panel");
  const attBtn = container.querySelector("#att-filter-btn");
  const updateAttBadge = () => {
    const n = (attSearch.value ? 1 : 0) + (attDate.value ? 1 : 0);
    attBadge.textContent = n;
    attBadge.style.display = n ? "" : "none";
  };
  const doFilter = () => {
    const q = attSearch.value.toLowerCase();
    const d = attDate.value;
    const filtered = list.filter((x) => {
      const matchesName = (x.profiles?.full_name || "")
        .toLowerCase()
        .includes(q);
      const matchesDate = !d || x.date === d;
      return matchesName && matchesDate;
    });
    container.querySelector("#attendance-log-rows").innerHTML =
      rowHtml(filtered);
    updateAttBadge();
  };
  attSearch.oninput = doFilter;
  attDate.onchange = doFilter;
  const attOutside = (e) => {
    if (!attBtn.closest(".df-wrap").contains(e.target)) {
      attPanel.style.display = "none";
      document.removeEventListener("click", attOutside);
    }
  };
  attBtn.onclick = (e) => {
    e.stopPropagation();
    if (attPanel.style.display === "none") {
      attPanel.style.display = "";
      setTimeout(() => document.addEventListener("click", attOutside), 0);
    } else {
      attPanel.style.display = "none";
      document.removeEventListener("click", attOutside);
    }
  };
  container.querySelector("#att-clear").onclick = () => {
    document.removeEventListener("click", attOutside);
    renderAttendance(container);
  };
  container
    .querySelectorAll(".resolve-attendance-restriction")
    .forEach((btn) => {
      btn.onclick = async () => {
        const rows = forgottenByEmployee.get(btn.dataset.userId) || [];
        if (!rows.length) {
          toast("No unresolved missed EOD reports found", "info");
          renderAttendance(container);
          return;
        }
        const restore = setButtonLoading(btn, "Resolving");
        const updates = await Promise.all(
          rows.map((row) =>
            supabase
              .from("eod_reports")
              .insert({
                employee_id: row.user_id,
                content: "Admin cleared missed EOD warning",
                date: attendanceDateKey(row),
              }),
          ),
        );
        restore();
        const error = updates.find((result) => result.error)?.error;
        if (error) {
          toast(error.message || "Could not resolve restriction", "error");
          return;
        }
        toast("Restriction resolved", "success");
        renderAttendance(container);
      };
    });
  container.querySelector("#att-export").onclick = () => {
    const csvData = list.map((x) => ({
      date: x.date,
      employee: x.profiles?.full_name || "",
      clock_in: formatTime(x.clock_in),
      clock_out: x.clock_out ? formatTime(x.clock_out) : "Active",
      hours_worked: hoursWorked(x.clock_in, x.clock_out) || "",
      location: x.location || "",
    }));
    exportToCSV("attendance.csv", csvData);
  };
}
async function openAdminRequestModal(onDone) {
  const today = new Date().toLocaleDateString("en-CA");
  const [
    { data: employees },
    { data: pricing },
    { data: activeAttendance },
    { data: eodReports },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("role", "employee"),
    supabase.from("service_pricing").select("category").order("category"),
    supabase.from("attendance").select("user_id,clock_in,clock_out,date"),
    supabase.from("eod_reports").select("employee_id,date,created_at"),
  ]);
  const missedByEmployee = groupedMissedEods(
    activeAttendance || [],
    eodReports || [],
  );
  const restrictedEmployeeIds = new Set(
    [...missedByEmployee.entries()]
      .filter(([, rows]) => rows.length >= STRICT_EOD_LIMIT)
      .map(([userId]) => userId),
  );
  const onlineEmployeeIds = new Set(
    (activeAttendance || [])
      .filter(
        (row) =>
          isValidActiveAttendance(row, today) &&
          !restrictedEmployeeIds.has(row.user_id),
      )
      .map((row) => row.user_id),
  );
  const onlineEmployees = (employees || []).filter((e) =>
    onlineEmployeeIds.has(e.id),
  );
  const seen = new Map();
  (pricing || []).forEach((row) => {
    const label = String(row.category || "").trim();
    if (!label || ["uncategorized", "other"].includes(label.toLowerCase()))
      return;
    const opt = optionFromCategory(label);
    if (!seen.has(opt.value)) seen.set(opt.value, opt);
  });
  const issueOptions = seen.size
    ? [...seen.values()]
    : [
        { value: "camera-offline", label: "Camera offline" },
        { value: "software-issue", label: "Software issue" },
        { value: "new-installation", label: "New installation" },
      ];
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `    <div class="modal" style="max-width:620px">      <div class="modal-header">        <span class="modal-title">Register Service Request</span>        <button class="modal-close" id="admin-request-close">×</button>      </div>      <div class="modal-body">        <div style="padding:12px 14px;border-radius:12px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.18);color:var(--text-soft);font-size:0.84rem;line-height:1.45;margin-bottom:16px;">          This creates the ticket directly. No OTP is sent. The customer will receive the ticket confirmation SMS, and the assigned employee will receive the job SMS if you assign one.        </div>        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">          <div class="form-group">            <label>Customer Name</label>            <input id="ar-name" type="text" placeholder="Customer name" />          </div>          <div class="form-group">            <label>Phone</label>            <input id="ar-phone" type="tel" placeholder="10 digit mobile number" />          </div>          <div class="form-group">            <label>Company <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>            <input id="ar-company" type="text" placeholder="Company / building name" />          </div>          <div class="form-group">            <label>Preferred Time</label>            <select id="ar-time">              <option value="As soon as possible">As soon as possible</option>              <option value="Morning (10 AM - 1 PM)">Morning (10 AM - 1 PM)</option>              <option value="Afternoon (1 PM - 4 PM)">Afternoon (1 PM - 4 PM)</option>              <option value="Evening (4 PM - 6 PM)">Evening (4 PM - 6 PM)</option>              <option value="Tomorrow Morning">Tomorrow Morning</option>              <option value="Flexible">Flexible</option>            </select>          </div>          <div class="form-group">            <label>Issue</label>            <select id="ar-issue">              <option value="">Select issue</option>              ${issueOptions.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}              <option value="other">Other</option>            </select>          </div>          <div class="form-group" id="ar-other-wrap" style="display:none;">            <label>Other Issue</label>            <input id="ar-other" type="text" placeholder="Describe issue" />          </div>          <div class="form-group">            <label>Assign Employee <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>            <select id="ar-employee">              <option value="">Create unassigned</option>              ${onlineEmployees.length ? onlineEmployees.map((e) => `<option value="${escapeHtml(e.id)}">Online - ${escapeHtml(e.full_name || "Employee")}${e.phone ? ` - ${escapeHtml(e.phone)}` : ""}</option>`).join("") : '<option value="" disabled>No employees online</option>'}            </select>            <small style="display:block;margin-top:8px;color:var(--text-dim);font-size:0.78rem;">Only employees currently clocked in with no strict EOD restriction can be assigned.</small>          </div>          <div class="form-group">            <label>Device Bill No <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>            <input id="ar-bill" type="text" placeholder="Invoice / bill no" />          </div>        </div>        <div class="form-group">          <label>Location</label>          <div style="display:flex;gap:8px;align-items:flex-start;">            <textarea id="ar-location" rows="3" placeholder="Customer address / landmark" style="flex:1;"></textarea>            <button type="button" class="btn btn-secondary" id="ar-detect-gps" title="Detect exact client coordinates" style="height:42px;padding:0 12px;display:flex;align-items:center;justify-content:center;">              ${ICONS.pin}            </button>          </div>          <small id="ar-coords-display" style="display:block;margin-top:6px;color:var(--text-dim);font-size:0.78rem;"></small>        </div>        <div class="form-group">          <label>Description <span style="color:var(--text-dim);font-weight:500;">(optional)</span></label>          <textarea id="ar-description" rows="3" placeholder="Any extra details from the customer"></textarea>        </div>      </div>      <div class="modal-footer">        <button class="btn btn-secondary" id="ar-cancel">Cancel</button>        <button class="btn btn-primary" id="ar-submit">${ICONS.plus}<span>Create Request</span></button>      </div>    </div>  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("#admin-request-close").onclick = close;
  overlay.querySelector("#ar-cancel").onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  const issueEl = overlay.querySelector("#ar-issue");
  const otherWrap = overlay.querySelector("#ar-other-wrap");
  issueEl.onchange = () => {
    otherWrap.style.display = issueEl.value === "other" ? "" : "none";
  };
  let coords = null;
  const detectBtn = overlay.querySelector("#ar-detect-gps");
  const locationInput = overlay.querySelector("#ar-location");
  const coordsDisplay = overlay.querySelector("#ar-coords-display");
  detectBtn.onclick = async () => {
    const restore = setButtonLoading(detectBtn, "GPS");
    try {
      const pos = await getHighAccuracyPosition();
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      coords = { lat, lng, accuracy };
      coordsDisplay.innerHTML = `Exact pin saved: <a href="${mapLink(lat, lng)}" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:none;">${lat.toFixed(6)}, ${lng.toFixed(6)}</a> (${Math.round(accuracy)}m accuracy)`;
      try {
        locationInput.value =
          (await reverseGeocode(lat, lng)) ||
          `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } catch {
        locationInput.value = `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
      toast("Exact client coordinates captured", "success");
    } catch (err) {
      console.error("Admin GPS capture failed:", err);
      toast(
        "Could not detect GPS. Check browser location permission.",
        "error",
      );
    } finally {
      restore();
    }
  };
  overlay.querySelector("#ar-submit").onclick = async () => {
    const btn = overlay.querySelector("#ar-submit");
    const restore = setButtonLoading(btn, "Creating");
    try {
      const full_name = overlay.querySelector("#ar-name").value.trim();
      const phone = normalizeAdminPhone(
        overlay.querySelector("#ar-phone").value,
      );
      const company_name = overlay.querySelector("#ar-company").value.trim();
      const preferred_time = overlay.querySelector("#ar-time").value;
      const issueVal = issueEl.value;
      const issueLabel =
        issueOptions.find((o) => o.value === issueVal)?.label || "";
      const otherText = overlay.querySelector("#ar-other")?.value.trim() || "";
      const assigned_employee_id = overlay.querySelector("#ar-employee").value;
      const location = overlay.querySelector("#ar-location").value.trim();
      const description = overlay.querySelector("#ar-description").value.trim();
      const bill_no = overlay.querySelector("#ar-bill").value.trim();
      if (!full_name) return toast("Customer name is required", "error");
      if (!phone) return toast("Enter a valid 10 digit phone number", "error");
      if (!location) return toast("Location is required", "error");
      if (!issueVal) return toast("Select the issue", "error");
      if (issueVal === "other" && !otherText)
        return toast("Describe the issue", "error");
      if (
        assigned_employee_id &&
        !onlineEmployeeIds.has(assigned_employee_id)
      ) {
        return toast(
          "This employee is not online. Choose an online employee or create unassigned.",
          "warning",
        );
      }
      const id = crypto.randomUUID();
      const ticket_no = generateAdminTicketNo();
      const service_item =
        issueVal === "other" ? `Other: ${otherText}` : issueLabel;
      const { error } = await supabase
        .from("inquiries")
        .insert({
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
          status: "open",
          assignment_status: "none",
        });
      if (error) throw new Error(error.message || "Could not create request");
      if (assigned_employee_id) {
        const { error: assignError } = await supabase
          .from("inquiries")
          .update({
            assigned_employee_id,
            assignment_status: "pending",
            decline_reason: null,
          })
          .eq("id", id);
        if (assignError)
          throw new Error(
            assignError.message || "Request created, but assignment failed",
          );
      }
      toast(`Request ${ticket_no} created`, "success");
      close();
      if (onDone) onDone();
    } catch (err) {
      console.error(err);
      toast(err.message || "Could not create request", "error");
    } finally {
      restore();
    }
  };
}
export async function renderInquiries(container) {
  showLoader(container);
  const filterKey =
    container.dataset.srFilter === "closed"
      ? "resolved"
      : container.dataset.srFilter || "active";
  const companyFilter = container.dataset.srCompany || "";
  const [{ data: list, error }, { data: employees }] = await Promise.all([
    supabase
      .from("inquiries")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("role", "employee"),
  ]);
  if (error) console.warn("[Admin] inquiries load:", error.message);
  const employeeNames = new Map(
    (employees || []).map((e) => [e.id, e.full_name]),
  );
  const all = list || [];
  const counts = {
    all: all.length,
    active: all.filter((x) => !["resolved", "closed", "issue_not_resolved"].includes(x.status))
      .length,
    resolved: all.filter((x) => ["resolved", "closed"].includes(x.status))
      .length,
    issues: all.filter((x) => x.status === "issue_not_resolved").length,
    paid: all.filter((x) => x.payment_status === "paid").length,
    unpaid: all.filter((x) => x.bill_amount && x.payment_status !== "paid")
      .length,
    reopened: all.filter((x) => Number(x.reopened) === 1).length,
  };
  const statusFiltered = all.filter((x) => {
    if (filterKey === "all") return true;
    if (filterKey === "active")
      return !["resolved", "closed", "issue_not_resolved"].includes(x.status);
    if (filterKey === "resolved")
      return ["resolved", "closed"].includes(x.status);
    if (filterKey === "issues") return x.status === "issue_not_resolved";
    if (filterKey === "reopened") return Number(x.reopened) === 1;
    if (filterKey === "paid") return x.payment_status === "paid";
    if (filterKey === "unpaid")
      return x.bill_amount && x.payment_status !== "paid";
    return true;
  });
  let filtered = statusFiltered.filter((x) =>
    (x.company_name || "").toLowerCase().includes(companyFilter.toLowerCase()),
  );
  const tabs = [
    ["active", "Active"],
    ["resolved", "Resolved"],
    ["issues", "Issue Not Resolved"],
    ...(counts.reopened ? [["reopened", "🔁 Reopened"]] : []),
    ["unpaid", "Awaiting Payment"],
    ["paid", "Paid"],
    ["all", "All"],
  ];
  container.innerHTML = `    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">      <div>        <h1>Service Requests</h1>        <p>Manage customer service requests, billing and payments</p>      </div>      <div style="display:flex;gap:10px;flex-wrap:wrap;">        <button class="btn btn-primary" id="sr-new">${ICONS.plus}<span>Register Request</span></button>        <button class="btn btn-secondary" id="sr-export">${ICONS.clipboard}<span>Export</span></button>        <button class="btn btn-secondary" id="sr-refresh">${ICONS.refresh}<span>Refresh</span></button>      </div>    </div>    <div class="df-wrap" style="margin-bottom:20px;">      <button class="btn btn-secondary df-toggle" id="sr-filter-btn">${ICONS.filter}<span>Filters</span>${((filterKey !== "all" ? 1 : 0) + (companyFilter ? 1 : 0)) > 0 ? `<span class="df-badge">${(filterKey !== "all" ? 1 : 0) + (companyFilter ? 1 : 0)}</span>` : ""}</button>      <div class="df-panel" id="sr-filter-panel" ${container.dataset.srDfOpen === "1" ? "" : 'style="display:none"'}>        <div class="df-field"><span class="df-label">Status</span><select id="sr-status-sel">${tabs.map(([k, label]) => `<option value="${k}" ${k === filterKey ? "selected" : ""}>${label} (${counts[k] !== undefined ? counts[k] : 0})</option>`).join("")}</select></div>        <div class="df-field"><span class="df-label">Company</span><input type="text" id="sr-company-filter" placeholder="Filter by company…" value="${companyFilter}"/></div>        <div class="df-footer"><button class="btn btn-ghost btn-sm" id="sr-filter-clear">Clear all</button></div>      </div>    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead>            <tr>              <th>Ticket</th><th>Service Date</th><th>Company</th><th>Customer</th><th>Phone</th><th>Service</th>              <th>Assigned Employee</th><th>Status</th><th>Payment</th><th></th>            </tr>          </thead>          <tbody>            ${filtered.length === 0 ? `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-dim)">No requests in this view</td></tr>` : filtered.map((x) => `<tr>                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || x.id.slice(0, 8)}</code>${Number(x.reopened) === 1 ? ' <span title="Reopened — free rework" style="color:var(--warning);font-weight:700;">🔁</span>' : ''}</td>                  <td><small>${formatDateTime(x.created_at)}</small></td>                  <td>${x.company_name ? `<b>${x.company_name}</b>` : '<span style="color:var(--text-dim)">—</span>'}</td>                  <td><b>${x.full_name}</b></td>                  <td><small style="color:var(--text-dim)">${x.phone || "—"}</small></td>                  <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.service_item || "—"}</td>                  <td>${x.assigned_employee_id ? `<b>${employeeNames.get(x.assigned_employee_id) || "Assigned"}</b>` : '<span style="color:var(--text-dim)">Unassigned</span>'}</td>                  <td>${statusBadge(x.status)}</td>                  <td>${x.bill_amount ? (x.payment_status === "paid" ? '<span class="badge badge-resolved">Paid</span>' : '<span class="badge badge-medium">Unpaid</span>') : '<span style="color:var(--text-dim)">—</span>'}</td>                  <td style="display:flex;gap:6px;white-space:nowrap;"><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button><button class="btn btn-danger btn-sm inq-del" data-id="${x.id}" title="Delete request">${ICONS.close}</button></td>                </tr>`).join("")}          </tbody>        </table>      </div>    </div>  `;
  container.querySelector("#sr-refresh").onclick = () =>
    renderInquiries(container);
  container.querySelector("#sr-new").onclick = () =>
    openAdminRequestModal(() => renderInquiries(container));
  const srPanel = container.querySelector("#sr-filter-panel");
  const srBtn = container.querySelector("#sr-filter-btn");
  const srOutside = (e) => {
    if (srBtn && !srBtn.closest(".df-wrap").contains(e.target)) {
      srPanel.style.display = "none";
      container.dataset.srDfOpen = "";
      document.removeEventListener("click", srOutside);
    }
  };
  srBtn.onclick = (e) => {
    e.stopPropagation();
    if (srPanel.style.display === "none") {
      srPanel.style.display = "";
      container.dataset.srDfOpen = "1";
      setTimeout(() => document.addEventListener("click", srOutside), 0);
    } else {
      srPanel.style.display = "none";
      container.dataset.srDfOpen = "";
      document.removeEventListener("click", srOutside);
    }
  };
  if (container.dataset.srDfOpen === "1") {
    setTimeout(() => document.addEventListener("click", srOutside), 0);
    const companyInput = container.querySelector("#sr-company-filter");
    if (companyInput) {
      companyInput.focus();
      companyInput.setSelectionRange(companyInput.value.length, companyInput.value.length);
    }
  }
  container.querySelector("#sr-status-sel").onchange = (e) => {
    container.dataset.srFilter = e.target.value;
    container.dataset.srDfOpen = "1";
    renderInquiries(container);
  };
  container.querySelector("#sr-company-filter").oninput = (e) => {
    container.dataset.srCompany = e.target.value.trim();
    container.dataset.srDfOpen = "1";
    renderInquiries(container);
  };
  container.querySelector("#sr-filter-clear").onclick = () => {
    container.dataset.srFilter = "active";
    container.dataset.srCompany = "";
    container.dataset.srDfOpen = "";
    document.removeEventListener("click", srOutside);
    renderInquiries(container);
  };
  container.querySelector("#sr-export").onclick = () => {
    exportToCSV(
      "service-requests.csv",
      filtered.map((x) => ({
        ticket: x.ticket_no || x.id,
        service_date: x.created_at,
        company: x.company_name || "",
        customer: x.full_name,
        phone: x.phone,
        service: x.service_item || "",
        assigned_employee: x.assigned_employee_id
          ? employeeNames.get(x.assigned_employee_id) || "Assigned"
          : "Unassigned",
        status: x.status,
        bill_amount: x.bill_amount || "",
        payment_status: x.payment_status || "",
        location: x.location || "",
      })),
    );
  };
  container.querySelectorAll(".inq-btn").forEach((btn) => {
    btn.onclick = () =>
      openInquiryDetailWithLoader(btn, btn.dataset.id, () =>
        renderInquiries(container),
      );
  });
  container.querySelectorAll(".inq-del").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const row = filtered.find((x) => x.id === id);
      const label = row?.ticket_no || (id ? id.slice(0, 8) : "this request");
      if (
        !confirm(
          `Delete service request ${label}? This permanently removes the request along with its bill, payment and feedback records, and cannot be undone.`,
        )
      )
        return;
      btn.disabled = true;
      // inquiry_services has no cascade FK — remove its rows first; feedback &
      // payments are removed automatically by ON DELETE CASCADE.
      await supabase.from("inquiry_services").delete().eq("inquiry_id", id);
      // Also remove the linked employee ticket (+ its comments) so the request
      // disappears from the employee's portal too — not just the admin list.
      if (row?.ticket_id) {
        await supabase.from("ticket_comments").delete().eq("ticket_id", row.ticket_id);
        await supabase.from("tickets").delete().eq("id", row.ticket_id);
      }
      const { error } = await supabase
        .from("inquiries")
        .delete()
        .eq("id", id);
      if (error) {
        toast(error.message || "Could not delete request", "error");
        btn.disabled = false;
      } else {
        toast("Service request deleted", "success");
        renderInquiries(container);
      }
    };
  });
}
export async function renderStocks(container) {
  showLoader(container);
  const { data: stocks } = await supabase
    .from("stocks")
    .select("*")
    .order("item_name");
  const list = stocks || [];
  container.innerHTML = `    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">      <h1>Inventory</h1>      <button class="btn btn-secondary" id="stocks-export">Export CSV</button>    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead><tr><th>Item</th><th>Stock</th><th>Status</th></tr></thead>          <tbody>            ${list.map((x) => `<tr>              <td>${x.item_name}</td>              <td><b>${x.quantity}</b> ${x.unit || "pcs"}</td>              <td><span class="badge badge-${x.quantity <= x.min_stock ? "urgent" : "resolved"}">${x.quantity <= x.min_stock ? "Low" : "OK"}</span></td>            </tr>`).join("")}          </tbody>        </table>      </div>    </div>  `;
  container.querySelector("#stocks-export").onclick = () =>
    exportToCSV(
      "inventory.csv",
      list.map((x) => ({
        item: x.item_name || "",
        quantity: x.quantity ?? "",
        unit: x.unit || "",
        min_stock: x.min_stock ?? "",
        status: x.quantity <= x.min_stock ? "Low" : "OK",
      })),
    );
}
export async function renderEODReports(container) {
  showLoader(container);
  const { data: reports } = await supabase
    .from("eod_reports")
    .select("*, profiles(full_name)")
    .order("date", { ascending: false });
  const list = reports || [];
  const render = (items) => {
    container.innerHTML = `      <div class="page-header">        <h1>Daily Summaries</h1>        <p>End-of-day progress reports from staff</p>      </div>      <div class="df-wrap" style="margin-bottom:24px;">        <button class="btn btn-secondary df-toggle" id="eod-filter-btn">${ICONS.filter}<span>Filters</span><span class="df-badge" id="eod-badge" style="display:none">0</span></button>        <div class="df-panel" id="eod-panel" style="display:none">          <div class="df-field"><span class="df-label">Staff</span><input type="text" id="eod-search" placeholder="Search by name…"/></div>          <div class="df-field"><span class="df-label">Date</span><input type="date" id="eod-date"/></div>          <div class="df-footer"><button class="btn btn-ghost btn-sm" id="eod-clear">Clear all</button></div>        </div>      </div>      <div class="card">        <div class="table-wrap">          <table>            <thead><tr><th>Date</th><th>Staff</th><th>Summary</th></tr></thead>            <tbody>              ${items.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-dim)">No reports found</td></tr>' : items.map((x) => `<tr>                <td>${formatDate(x.date)}</td>                <td><b>${x.profiles?.full_name || "—"}</b></td>                <td style="max-width:400px;font-size:.9rem; line-height:1.5; padding:16px 8px;">${x.content}</td>              </tr>`).join("")}            </tbody>          </table>        </div>      </div>    `;
    const eodSearch = container.querySelector("#eod-search");
    const eodDate = container.querySelector("#eod-date");
    const eodBadge = container.querySelector("#eod-badge");
    const eodPanel = container.querySelector("#eod-panel");
    const eodBtn = container.querySelector("#eod-filter-btn");
    const updateEodBadge = () => {
      const n = (eodSearch.value ? 1 : 0) + (eodDate.value ? 1 : 0);
      eodBadge.textContent = n;
      eodBadge.style.display = n ? "" : "none";
    };
    const doFilter = () => {
      const q = eodSearch.value.toLowerCase();
      const d = eodDate.value;
      const filtered = list.filter((x) => {
        const matchesName = (x.profiles?.full_name || "")
          .toLowerCase()
          .includes(q);
        const matchesDate = !d || x.date === d;
        return matchesName && matchesDate;
      });
      renderItems(filtered);
      updateEodBadge();
    };
    eodSearch.oninput = doFilter;
    eodDate.onchange = doFilter;
    const eodOutside = (e) => {
      if (!eodBtn.closest(".df-wrap").contains(e.target)) {
        eodPanel.style.display = "none";
        document.removeEventListener("click", eodOutside);
      }
    };
    eodBtn.onclick = (e) => {
      e.stopPropagation();
      if (eodPanel.style.display === "none") {
        eodPanel.style.display = "";
        setTimeout(() => document.addEventListener("click", eodOutside), 0);
      } else {
        eodPanel.style.display = "none";
        document.removeEventListener("click", eodOutside);
      }
    };
    container.querySelector("#eod-clear").onclick = () => {
      document.removeEventListener("click", eodOutside);
      renderEODReports(container);
    };
  };
  const renderItems = (items) => {
    const tbody = container.querySelector("tbody");
    tbody.innerHTML =
      items.length === 0
        ? '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-dim)">No reports found</td></tr>'
        : items
            .map(
              (x) =>
                `<tr>      <td>${formatDate(x.date)}</td>      <td><b>${x.profiles?.full_name || "—"}</b></td>      <td style="max-width:400px;font-size:.9rem; line-height:1.5; padding:16px 8px;">${x.content}</td>    </tr>`,
            )
            .join("");
  };
  render(list);
}
export async function renderAllTickets(container) {
  showLoader(container);
  const { data: tickets } = await supabase
    .from("tickets")
    .select("*, inquiries(*)")
    .order("created_at", { ascending: false });
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name");
  const profileMap = (profiles || []).reduce(
    (acc, p) => ({ ...acc, [p.id]: p.full_name }),
    {},
  );
  const ticketRows = (tickets || [])
    .map((t) => {
      const inq = Array.isArray(t.inquiries) ? t.inquiries[0] : t.inquiries;
      const contact = inq
        ? `<small>${inq.phone || "—"}<br/>${inq.location ? inq.location.slice(0, 20) + "..." : "—"}</small>`
        : "—";
      const action = inq?.id
        ? `<button class="btn btn-primary btn-sm all-ticket-manage" data-id="${inq.id}">Manage</button>`
        : '<span style="color:var(--text-dim);font-size:0.8rem;">No request</span>';
      return `<tr>      <td><code style="font-size:0.75rem;">#${t.id.slice(0, 8)}</code>${Number(inq?.reopened) === 1 ? ' <span title="Reopened — free rework" style="color:var(--warning);font-weight:700;">🔁</span>' : ''}</td>      <td><b>${inq ? inq.full_name : "Guest"}</b></td>      <td>${contact}</td>      <td>${t.assigned_to ? profileMap[t.assigned_to] || "Staff" : '<span style="color:var(--text-dim)">Unassigned</span>'}</td>      <td>${statusBadge(t.status)}</td>      <td><small>${formatDate(t.created_at)}</small></td>      <td>${action}</td>    </tr>`;
    })
    .join("");
  container.innerHTML = `    <div class="page-header">      <h1>All Tickets & Tasks</h1>      <p>Master list of all service requests and internal tasks</p>    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead>            <tr>              <th>Ticket ID</th>              <th>Customer</th>              <th>Contact</th>              <th>Assigned To</th>              <th>Status</th>              <th>Created</th>              <th>Action</th>            </tr>          </thead>          <tbody>            ${ticketRows || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No tickets found</td></tr>'}            ${
    "" &&
    (tickets || [])
      .map((t) => {
        const inq = t.inquiries?.[0];
        return `<tr>                <td><code style="font-size:0.75rem;">#${t.id.slice(0, 8)}</code></td>                <td><b>${inq ? inq.full_name : "Guest"}</b></td>                <td>${inq ? `<small>${inq.phone}<br/>${inq.location.slice(0, 20)}...</small>` : "—"}</td>                <td>${t.assigned_to ? profileMap[t.assigned_to] || "Staff" : '<span style="color:var(--text-dim)">Unassigned</span>'}</td>                <td>${statusBadge(t.status)}</td>                <td><small>${formatDate(t.created_at)}</small></td>              </tr>`;
      })
      .join("")
  }          </tbody>        </table>      </div>    </div>  `;
  container.querySelectorAll(".all-ticket-manage").forEach((btn) => {
    btn.onclick = () =>
      openInquiryDetailWithLoader(btn, btn.dataset.id, () =>
        renderAllTickets(container),
      );
  });
}
export async function renderLeaveRequests(container) {
  showLoader(container);
  const { data: leaves } = await supabase
    .from("leave_requests")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false });
  const list = leaves || [];
  container.innerHTML = `    <div class="page-header">      <h1>Leave Requests</h1>      <p>Approve or reject employee time-off requests</p>    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead>            <tr>              <th>Employee</th>              <th>Dates</th>              <th>Reason</th>              <th>Status</th>              <th>Actions</th>            </tr>          </thead>          <tbody>            ${list.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-dim)">No leave requests found</td></tr>' : list.map((x) => `              <tr>                <td><b>${x.profiles?.full_name || "—"}</b></td>                <td><small>${formatDate(x.start_date)} to ${formatDate(x.end_date)}</small></td>                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${x.reason}">${x.reason}</td>                <td><span class="badge badge-${x.status}">${x.status}</span></td>                <td>                  ${x.status === "pending" ? `                    <div style="display:flex; gap:8px;">                      <button class="btn btn-primary btn-sm leave-act" data-id="${x.id}" data-status="approved">Approve</button>                      <button class="btn btn-danger btn-sm leave-act" data-id="${x.id}" data-status="rejected">Reject</button>                    </div>                  ` : "—"}                </td>              </tr>            `).join("")}          </tbody>        </table>      </div>    </div>  `;
  container.querySelectorAll(".leave-act").forEach((btn) => {
    btn.onclick = async () => {
      const status = btn.dataset.status;
      const { error } = await supabase
        .from("leave_requests")
        .update({ status })
        .eq("id", btn.dataset.id);
      if (error) toast(error.message, "error");
      else {
        toast(`Request ${status}`, "success");
        renderLeaveRequests(container);
      }
    };
  });
}
export async function renderSalaryOverview(container) {
  showLoader(container);
  const monthKey = new Date().toLocaleDateString("en-CA").slice(0, 7);
  const daysInMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  ).getDate();
  const [{ data: profiles }, { data: attendance }, { data: leaves }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "employee")
        .order("full_name", { ascending: true }),
      supabase
        .from("attendance")
        .select("*")
        .order("date", { ascending: false }),
      supabase
        .from("leave_requests")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
  const rows = (profiles || []).map((emp) => {
    const monthAttendance = (attendance || []).filter(
      (x) => x.user_id === emp.id && String(x.date || "").startsWith(monthKey),
    );
    const presentDays = new Set(monthAttendance.map((x) => x.date)).size;
    const approvedLeaveDays = (leaves || [])
      .filter(
        (x) =>
          x.employee_id === emp.id &&
          x.status === "approved" &&
          String(x.start_date || "").startsWith(monthKey),
      )
      .reduce(
        (sum, x) => sum + daysBetweenInclusive(x.start_date, x.end_date),
        0,
      );
    const monthlySalary = Number(emp.salary) || 0;
    const payableDays = presentDays + approvedLeaveDays;
    return {
      ...emp,
      presentDays,
      approvedLeaveDays,
      payableDays,
      monthlySalary,
      estimated: (monthlySalary / daysInMonth) * payableDays,
    };
  });
  const totalEstimated = rows.reduce((sum, x) => sum + x.estimated, 0);
  const totalMonthly = rows.reduce((sum, x) => sum + x.monthlySalary, 0);
  container.innerHTML = `    <div class="page-header">      <h1>Salary Overview</h1>      <p>Attendance-based salary estimate for ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>    </div>    <div class="stats-grid">      <div class="stat-card"><div class="stat-value">${rows.length}</div><div class="stat-label">Employees</div></div>      <div class="stat-card"><div class="stat-value" style="font-size:1.8rem">${money(totalMonthly)}</div><div class="stat-label">Monthly Payroll</div></div>      <div class="stat-card"><div class="stat-value" style="font-size:1.8rem;color:var(--warning)">${money(totalEstimated)}</div><div class="stat-label">Estimated Earned</div></div>    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead><tr><th>Employee</th><th>Monthly Salary</th><th>Present</th><th>Approved Leave</th><th>Payable Days</th><th>Estimated Earned</th></tr></thead>          <tbody>            ${rows.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No employees found</td></tr>' : rows.map((x) => `<tr>                <td><b>${x.full_name || "—"}</b></td>                <td>${money(x.monthlySalary)}</td>                <td><span class="badge badge-open">${x.presentDays}</span></td>                <td><span class="badge badge-resolved">${x.approvedLeaveDays}</span></td>                <td>${x.payableDays} / ${daysInMonth}</td>                <td><b style="color:var(--primary)">${money(x.estimated)}</b></td>              </tr>`).join("")}          </tbody>        </table>      </div>    </div>  `;
}
export async function renderContacts(container) {
  showLoader(container);
  const filterKey = container.dataset.contactFilter || "all";
  const { data: list, error } = await supabase
    .from("inquiries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) console.warn("[Admin] contacts load:", error.message);
  const all = list || [];
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfWeek = startOfDay - now.getDay() * 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const inRange = (x, ms) => new Date(x.created_at).getTime() >= ms;
  const uniqueByPhone = (rows) => {
    const seen = new Map();
    rows.forEach((r) => {
      if (r.phone && !seen.has(r.phone)) seen.set(r.phone, r);
    });
    return [...seen.values()];
  };
  const counts = {
    all: all.length,
    today: all.filter((x) => inRange(x, startOfDay)).length,
    week: all.filter((x) => inRange(x, startOfWeek)).length,
    month: all.filter((x) => inRange(x, startOfMonth)).length,
    unique: uniqueByPhone(all).length,
  };
  let filtered;
  if (filterKey === "today")
    filtered = all.filter((x) => inRange(x, startOfDay));
  else if (filterKey === "week")
    filtered = all.filter((x) => inRange(x, startOfWeek));
  else if (filterKey === "month")
    filtered = all.filter((x) => inRange(x, startOfMonth));
  else if (filterKey === "unique") filtered = uniqueByPhone(all);
  else filtered = all;
  const tabs = [
    ["all", "All"],
    ["today", "Today"],
    ["week", "This Week"],
    ["month", "This Month"],
    ["unique", "Unique Customers"],
  ];
  const digits = (p) => String(p || "").replace(/\D/g, "");
  container.innerHTML = `    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">      <div>        <h1>Contacts</h1>        <p>Customer contact details collected from service requests</p>      </div>      <div style="display:flex;gap:8px;flex-wrap:wrap;">        <button class="btn btn-secondary" id="contacts-export">Export CSV</button>        <button class="btn btn-secondary" id="contacts-refresh">${ICONS.refresh}<span>Refresh</span></button>      </div>    </div>    <div class="sr-filter-bar">      ${tabs.map(([k, label]) => `        <button class="sr-filter ${k === filterKey ? "active" : ""}" data-key="${k}">          <span>${label}</span><span class="sr-filter-count">${counts[k]}</span>        </button>      `).join("")}    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead>            <tr>              <th>Name</th><th>Phone</th><th>Location</th>              <th>Service</th><th>Date</th><th>Actions</th>            </tr>          </thead>          <tbody>            ${
    filtered.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No contacts in this view</td></tr>`
      : filtered
          .map((x) => {
            const d = digits(x.phone);
            return `<tr>                    <td><b>${x.full_name || "—"}</b></td>                    <td><span class="sr-mono">${x.phone || "—"}</span></td>                    <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(x.location || "").replace(/"/g, "&quot;")}">${x.location || "—"}</td>                    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.service_item || "—"}</td>                    <td>${formatDate(x.created_at)}</td>                    <td>                      <div class="contact-actions">                        <a class="contact-act contact-call" href="tel:${d}" title="Call">${ICONS.phone}</a>                        <a class="contact-act contact-wa" href="https://wa.me/${d}" target="_blank" rel="noopener" title="WhatsApp">${ICONS.whatsapp}</a>                        <button class="contact-act contact-copy" data-phone="${x.phone || ""}" title="Copy number">${ICONS.clipboard}</button>                      </div>                    </td>                  </tr>`;
          })
          .join("")
  }          </tbody>        </table>      </div>    </div>  `;
  container.querySelector("#contacts-refresh").onclick = () =>
    renderContacts(container);
  container.querySelector("#contacts-export").onclick = () =>
    exportToCSV(
      "contacts.csv",
      filtered.map((x) => ({
        name: x.full_name,
        phone: x.phone,
        location: x.location,
        service: x.service_item,
        ticket_no: x.ticket_no,
        date: x.created_at,
      })),
    );
  container.querySelectorAll(".sr-filter").forEach((btn) => {
    btn.onclick = () => {
      container.dataset.contactFilter = btn.dataset.key;
      renderContacts(container);
    };
  });
  container.querySelectorAll(".contact-copy").forEach((btn) => {
    btn.onclick = async () => {
      const phone = btn.dataset.phone;
      if (!phone) return;
      try {
        await navigator.clipboard.writeText(phone);
        toast("Phone number copied", "success");
      } catch {
        toast("Copy failed", "error");
      }
    };
  });
}
export async function renderClients(container) {
  showLoader(container);
  const { data: clients } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "client")
    .order("created_at", { ascending: false });
  const list = clients || [];
  container.innerHTML = `    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">      <h1>Clients</h1>      <button class="btn btn-secondary" id="clients-export">Export CSV</button>    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead><tr><th>Name</th><th>Email</th><th>Company</th></tr></thead>          <tbody>${list.map((c) => `<tr>            <td><b>${c.full_name || "—"}</b></td>            <td>${c.email || "—"}</td>            <td>${c.company || "—"}</td>          </tr>`).join("")}</tbody>        </table>      </div>    </div>`;
  container.querySelector("#clients-export").onclick = () =>
    exportToCSV(
      "clients.csv",
      list.map((c) => ({
        name: c.full_name || "",
        email: c.email || "",
        phone: c.phone || "",
        company: c.company || "",
        address: c.address || "",
        created_at: c.created_at || "",
      })),
    );
}
export async function renderUsers(container) {
  showLoader(container);

  const apiBase =
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
      ? "/api"
      : "http://localhost:5000/api";
  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
  });

  let users = [];
  try {
    const res = await fetch(`${apiBase}/admin/users`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to load users");
    }
    users = await res.json();
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <h2 style="color:var(--danger);">Error loading users</h2>
        <p>${err.message}</p>
        <button class="btn btn-primary" id="retry-users" style="margin-top:16px;">Retry</button>
      </div>
    `;
    const retryBtn = container.querySelector("#retry-users");
    if (retryBtn) retryBtn.onclick = () => renderUsers(container);
    return;
  }

  const rows = users || [];

  const accessCell = (u) =>
    u.role === "employee"
      ? `
    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;">
      <input type="checkbox" class="can-add-service-chk" data-uid="${u.id}" ${u.can_add_service ? "checked" : ""} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
      Add Service
    </label>
  `
      : '<span style="color:var(--text-dim)">-</span>';

  const profileCell = (u) =>
    u.role === "employee"
      ? `
    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;">
      <input type="checkbox" class="can-update-profile-chk" data-uid="${u.id}" ${u.can_update_profile ? "checked" : ""} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
      Profile Edit
    </label>
  `
      : '<span style="color:var(--text-dim)">-</span>';

  const alwaysAssignCell = (u) =>
    u.role === "employee"
      ? `
    <div style="display:flex;align-items:center;gap:8px;">
      <div class="switch-outer always-assign-switch-outer" style="position:relative;width:38px;height:20px;background:${u.always_assign ? "var(--primary)" : "var(--border)"};border-radius:100px;transition:0.3s;box-shadow:inset 0 1px 3px rgba(0,0,0,0.15);cursor:pointer;">
        <div class="switch-inner" style="position:absolute;top:2px;left:${u.always_assign ? "20px" : "2px"};width:16px;height:16px;background:#ffffff;border-radius:50%;transition:0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
      </div>
      <span class="always-assign-status-text" style="font-size:0.8rem;font-weight:700;color:${u.always_assign ? "var(--primary)" : "var(--text-dim)"};">${u.always_assign ? "ON" : "OFF"}</span>
      <input type="checkbox" class="always-assign-chk" data-uid="${u.id}" ${u.always_assign ? "checked" : ""} style="display:none;" />
    </div>
  `
      : '<span style="color:var(--text-dim)">-</span>';

  // Per-employee tab ids (must match getNavItems('employee') in main.js).
  const EMPLOYEE_TAB_IDS = ["all-tickets","my-attendance","my-leaves","my-eod","my-cash","my-collections","my-salary","leaderboard","employee-training","my-training-courses","device-followup","estimator","service-pricing"];
  const parseAllowedTabs = (u) => {
    try {
      if (u.allowed_tabs) {
        const a = typeof u.allowed_tabs === "string" ? JSON.parse(u.allowed_tabs) : u.allowed_tabs;
        if (Array.isArray(a)) return a.map(String);
      }
    } catch { /* unparseable = full access */ }
    return null; // null = all tabs visible
  };
  const canSeeCollections = (u) => { const a = parseAllowedTabs(u); return a === null || a.includes("my-collections"); };

  // Inline "Collections" tab access toggle in the Users table.
  const collectionsCell = (u) =>
    u.role === "employee"
      ? `
    <div style="display:flex;align-items:center;gap:8px;">
      <div class="switch-outer coll-switch-outer" data-uid="${u.id}" style="position:relative;width:38px;height:20px;background:${canSeeCollections(u) ? "var(--primary)" : "var(--border)"};border-radius:100px;transition:0.3s;box-shadow:inset 0 1px 3px rgba(0,0,0,0.15);cursor:pointer;">
        <div class="switch-inner" style="position:absolute;top:2px;left:${canSeeCollections(u) ? "20px" : "2px"};width:16px;height:16px;background:#ffffff;border-radius:50%;transition:0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
      </div>
      <span class="coll-status-text" style="font-size:0.8rem;font-weight:700;color:${canSeeCollections(u) ? "var(--primary)" : "var(--text-dim)"};">${canSeeCollections(u) ? "ON" : "OFF"}</span>
      <input type="checkbox" class="coll-access-chk" data-uid="${u.id}" ${canSeeCollections(u) ? "checked" : ""} style="display:none;" />
    </div>
  `
      : '<span style="color:var(--text-dim)">-</span>';

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>User Management</h1>
        <p>Control roles, credentials, SMS phone numbers, and staff access permissions.</p>
      </div>
      <button class="btn btn-primary" id="create-user-btn">${ICONS.plus}<span>Create New User</span></button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name / Email</th>
              <th>Current Role</th>
              <th>SMS Phone</th>
              <th>Service Access</th>
              <th>Profile Access</th>
              <th>Always Assign</th>
              <th>Collections Tab</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (u) => `
              <tr>
                <td>
                  <b>${escapeHtml(u.full_name || "-")}</b>
                  <div style="font-size:0.78rem;color:var(--text-dim);margin-top:2px;">${escapeHtml(u.email || "-")}</div>
                </td>
                <td><span class="badge ${u.role === "admin" ? "badge-danger" : u.role === "employee" ? "badge-open" : "badge-resolved"}">${escapeHtml(u.role || "client")}</span></td>
                <td>
                  ${u.phone ? `<b>${escapeHtml(u.phone)}</b>` : '<span style="color:var(--text-dim)">—</span>'}
                </td>
                <td>${accessCell(u)}</td>
                <td>${profileCell(u)}</td>
                <td>${alwaysAssignCell(u)}</td>
                <td>${collectionsCell(u)}</td>
                <td>
                  <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary btn-sm edit-user-btn" data-uid="${u.id}">${ICONS.edit || "📝"}<span>Edit</span></button>
                    <button class="btn btn-danger btn-sm delete-user-btn" data-uid="${u.id}">${ICONS.close || "🗑️"}</button>
                  </div>
                </td>
              </tr>
            `,
                    )
                    .join("")
                : '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim)">No users found</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  const bindAccessToggle = (selector, column, label) => {
    container.querySelectorAll(selector).forEach((chk) => {
      chk.addEventListener("change", async () => {
        const { error } = await supabase
          .from("profiles")
          .update({ [column]: chk.checked ? 1 : 0 })
          .eq("id", chk.dataset.uid);
        if (error) {
          toast(`Failed to update ${label}: ` + (error.message || ""), "error");
          chk.checked = !chk.checked;
          return;
        }
        toast(`${label} updated`, "success");
        if (column === "always_assign") {
          const outer = chk.parentElement.querySelector(".always-assign-switch-outer");
          const inner = chk.parentElement.querySelector(".switch-inner");
          const text = chk.parentElement.querySelector(".always-assign-status-text");
          if (outer && inner && text) {
            outer.style.background = chk.checked ? "var(--primary)" : "var(--border)";
            inner.style.left = chk.checked ? "20px" : "2px";
            text.style.color = chk.checked ? "var(--primary)" : "var(--text-dim)";
            text.textContent = chk.checked ? "ON" : "OFF";
          }
        }
      });
    });
  };
  bindAccessToggle(".can-add-service-chk", "can_add_service", "Service access");
  bindAccessToggle(
    ".can-update-profile-chk",
    "can_update_profile",
    "Profile edit access",
  );
  bindAccessToggle(
    ".always-assign-chk",
    "always_assign",
    "Always Assign priority",
  );

  container.querySelectorAll(".always-assign-switch-outer").forEach((div) => {
    div.onclick = () => {
      const chk = div.parentElement.querySelector(".always-assign-chk");
      if (chk) {
        chk.checked = !chk.checked;
        chk.dispatchEvent(new Event("change"));
      }
    };
  });

  // Collections tab access toggle — flips 'my-collections' in the user's
  // allowed_tabs (the same per-user tab system used in the edit dialog).
  container.querySelectorAll(".coll-access-chk").forEach((chk) => {
    chk.addEventListener("change", async () => {
      const uid = chk.dataset.uid;
      const user = rows.find((u) => u.id === uid);
      if (!user) return;
      let a = parseAllowedTabs(user); // null (all) or array
      let newVal;
      if (chk.checked) {
        // Make Collections visible.
        if (a === null) newVal = null;
        else { if (!a.includes("my-collections")) a.push("my-collections"); newVal = a; }
      } else {
        // Hide Collections only — keep every other tab visible.
        if (a === null) newVal = EMPLOYEE_TAB_IDS.filter((id) => id !== "my-collections");
        else newVal = a.filter((id) => id !== "my-collections");
      }
      const stored = newVal === null ? null : JSON.stringify(newVal);
      const { error } = await supabase.from("profiles").update({ allowed_tabs: stored }).eq("id", uid);
      if (error) {
        toast("Failed to update Collections access: " + (error.message || ""), "error");
        chk.checked = !chk.checked;
        return;
      }
      user.allowed_tabs = stored; // keep local cache in sync
      const wrap = chk.parentElement;
      const outer = wrap.querySelector(".coll-switch-outer");
      const inner = wrap.querySelector(".switch-inner");
      const text = wrap.querySelector(".coll-status-text");
      if (outer && inner && text) {
        outer.style.background = chk.checked ? "var(--primary)" : "var(--border)";
        inner.style.left = chk.checked ? "20px" : "2px";
        text.style.color = chk.checked ? "var(--primary)" : "var(--text-dim)";
        text.textContent = chk.checked ? "ON" : "OFF";
      }
      toast(`Collections tab ${chk.checked ? "enabled" : "hidden"} for ${user.full_name || "staff"}`, "success");
    });
  });
  container.querySelectorAll(".coll-switch-outer").forEach((div) => {
    div.onclick = () => {
      const chk = div.parentElement.querySelector(".coll-access-chk");
      if (chk) { chk.checked = !chk.checked; chk.dispatchEvent(new Event("change")); }
    };
  });

  container.querySelectorAll(".delete-user-btn").forEach((btn) => {
    btn.onclick = async () => {
      const uid = btn.dataset.uid;
      const user = rows.find((u) => u.id === uid);
      if (!user) return;
      if (
        !confirm(
          `Are you sure you want to delete user "${user.full_name || user.email}"? This will permanently delete their profile and credentials.`,
        )
      )
        return;

      const restore = setButtonLoading(btn, "Deleting");
      try {
        const res = await fetch(`${apiBase}/admin/users/${uid}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to delete user");

        toast("User deleted successfully", "success");
        renderUsers(container);
      } catch (err) {
        toast(err.message, "error");
        restore();
      }
    };
  });

  container.querySelectorAll(".edit-user-btn").forEach((btn) => {
    btn.onclick = () => {
      const uid = btn.dataset.uid;
      const user = rows.find((u) => u.id === uid);
      if (user) openUserModal(user, () => renderUsers(container));
    };
  });

  const createBtn = container.querySelector("#create-user-btn");
  if (createBtn) {
    createBtn.onclick = () => openUserModal(null, () => renderUsers(container));
  }

  function openUserModal(user, onDone) {
    const isEdit = !!user;
    // Employee tab ids must match getNavItems('employee') in main.js. Always-on
    // tabs (dashboard/notifications/profile) are intentionally excluded.
    const EMP_TABS = [
      { id: "all-tickets", label: "My Tasks" },
      { id: "my-attendance", label: "Attendance Records" },
      { id: "my-leaves", label: "Leave Requests" },
      { id: "my-eod", label: "EOD Reports" },
      { id: "my-cash", label: "My Cash" },
      { id: "my-collections", label: "Collections" },
      { id: "my-salary", label: "Salary" },
      { id: "leaderboard", label: "Leaderboard" },
      { id: "employee-training", label: "Tutorials" },
      { id: "my-training-courses", label: "Training" },
      { id: "device-followup", label: "Device Follow-up" },
      { id: "estimator", label: "Estimator" },
      { id: "service-pricing", label: "Service Pricing" },
    ];
    let allowedSet = null;
    try {
      if (user && user.allowed_tabs) {
        const a = typeof user.allowed_tabs === "string" ? JSON.parse(user.allowed_tabs) : user.allowed_tabs;
        if (Array.isArray(a)) allowedSet = new Set(a.map(String));
      }
    } catch { /* treat unparseable as full access */ }
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:580px">
        <div class="modal-header">
          <span class="modal-title">${isEdit ? "Edit User Details" : "Create New User"}</span>
          <button class="modal-close" id="user-modal-close">${ICONS.close || "×"}</button>
        </div>
        <div class="modal-body">
          <form id="user-form" style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label>Full Name *</label>
                <input id="usr-name" type="text" placeholder="John Doe" value="${isEdit ? escapeHtml(user.full_name || "") : ""}" required />
              </div>
              <div class="form-group">
                <label>Email *</label>
                <input id="usr-email" type="email" placeholder="john@example.com" value="${isEdit ? escapeHtml(user.email || "") : ""}" required />
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label>Password ${isEdit ? "(leave blank to keep unchanged)" : "*"}</label>
                <input id="usr-password" type="password" placeholder="Min 8 characters" ${isEdit ? "" : "required"} />
              </div>
              <div class="form-group">
                <label>Role</label>
                <select id="usr-role">
                  <option value="client" ${isEdit && user.role === "client" ? "selected" : ""}>Client</option>
                  <option value="employee" ${isEdit && user.role === "employee" ? "selected" : ""}>Staff</option>
                  <option value="admin" ${isEdit && user.role === "admin" ? "selected" : ""}>Admin</option>
                </select>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label>Phone Number (10 digits)</label>
                <input id="usr-phone" type="tel" placeholder="9876543210" value="${isEdit ? escapeHtml((user.phone || "").replace(/^\\+91\\s*/, "")) : ""}" />
              </div>
              <div class="form-group">
                <label>Salary (Staff only)</label>
                <input id="usr-salary" type="number" step="0.01" placeholder="0.00" value="${isEdit ? user.salary || 0 : 0}" />
              </div>
            </div>
            <div class="form-group">
              <label>Company / Building Name</label>
              <input id="usr-company" type="text" placeholder="Company Name" value="${isEdit ? escapeHtml(user.company || "") : ""}" />
            </div>
            <div class="form-group">
              <label>Address</label>
              <textarea id="usr-address" rows="2" placeholder="Full Address">${isEdit ? escapeHtml(user.address || "") : ""}</textarea>
            </div>
            
            <div style="display:flex;gap:18px;margin-top:8px;flex-wrap:wrap;">
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="usr-add-service" ${isEdit && user.can_add_service ? "checked" : ""} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
                Add Service Access (Staff only)
              </label>
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="usr-edit-profile" ${isEdit && user.can_update_profile ? "checked" : ""} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
                Profile Edit Access (Staff only)
              </label>
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="usr-always-assign" ${isEdit && user.always_assign ? "checked" : ""} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
                Always Auto-Assign Service (Staff only)
              </label>
            </div>

            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px;">
              <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;">
                <input type="checkbox" id="usr-limit-tabs" ${isEdit && allowedSet ? "checked" : ""} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
                Limit which tabs this staff can see
              </label>
              <p style="font-size:.78rem;color:var(--text-dim);margin:6px 0 0;">Leave unchecked for full access. Dashboard, Notifications and Profile are always visible.</p>
              <div id="usr-tabs-list" style="display:${isEdit && allowedSet ? "grid" : "none"};grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
                ${EMP_TABS.map(t => `
                  <label style="display:inline-flex;align-items:center;gap:6px;font-size:.86rem;cursor:pointer;">
                    <input type="checkbox" class="usr-tab-chk" value="${t.id}" ${(allowedSet ? allowedSet.has(t.id) : true) ? "checked" : ""} style="cursor:pointer;width:15px;height:15px;margin:0;"/>
                    ${escapeHtml(t.label)}
                  </label>`).join("")}
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="user-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="user-modal-submit">${ICONS.check || "✓"}<span>${isEdit ? "Save Changes" : "Create User"}</span></button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector("#user-modal-close").onclick = close;
    overlay.querySelector("#user-modal-cancel").onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    // Show/hide the tab checklist with the "Limit tabs" switch.
    const limitChk = overlay.querySelector("#usr-limit-tabs");
    const tabsList = overlay.querySelector("#usr-tabs-list");
    if (limitChk && tabsList) {
      limitChk.onchange = () => { tabsList.style.display = limitChk.checked ? "grid" : "none"; };
    }

    const phoneInput = overlay.querySelector("#usr-phone");
    phoneInput.oninput = () => {
      let v = phoneInput.value.replace(/\\D/g, "");
      if (v.length > 10 && v.startsWith("91")) v = v.slice(2);
      else if (v.length === 11 && v.startsWith("0")) v = v.slice(1);
      phoneInput.value = v.slice(0, 10);
    };

    const submitBtn = overlay.querySelector("#user-modal-submit");
    submitBtn.onclick = async (e) => {
      e.preventDefault();

      const fullName = overlay.querySelector("#usr-name").value.trim();
      const email = overlay.querySelector("#usr-email").value.trim();
      const password = overlay.querySelector("#usr-password").value;
      const role = overlay.querySelector("#usr-role").value;
      const rawPhone = phoneInput.value;
      const salary = overlay.querySelector("#usr-salary").value;
      const company = overlay.querySelector("#usr-company").value.trim();
      const address = overlay.querySelector("#usr-address").value.trim();
      const can_add_service = overlay.querySelector("#usr-add-service").checked;
      const can_update_profile =
        overlay.querySelector("#usr-edit-profile").checked;
      const alwaysAssign = overlay.querySelector("#usr-always-assign").checked;

      if (!fullName) return toast("Full name is required", "warning");
      if (!email) return toast("Email is required", "warning");
      if (!isEdit && (!password || password.length < 8))
        return toast("Password must be at least 8 characters", "warning");
      if (isEdit && password && password.length < 8)
        return toast("Password must be at least 8 characters", "warning");
      if (rawPhone && !/^[6-9]\d{9}$/.test(rawPhone))
        return toast("Enter a valid 10-digit Indian mobile number", "warning");

      const payload = {
        fullName,
        email,
        role,
        phone: rawPhone ? `+91${rawPhone}` : null,
        salary: Number(salary) || 0,
        company: company || null,
        address: address || null,
        can_add_service: can_add_service ? 1 : 0,
        can_update_profile: can_update_profile ? 1 : 0,
        alwaysAssign: alwaysAssign ? 1 : 0,
      };

      // Tab access: unchecked "limit" = full access (null). Otherwise the
      // explicit list of tab ids this staff member may see.
      const limitTabs = overlay.querySelector("#usr-limit-tabs")?.checked;
      payload.allowed_tabs = limitTabs
        ? [...overlay.querySelectorAll(".usr-tab-chk:checked")].map((c) => c.value)
        : null;

      if (password) payload.password = password;

      const restore = setButtonLoading(
        submitBtn,
        isEdit ? "Saving" : "Creating",
      );
      try {
        const url = isEdit
          ? `${apiBase}/admin/users/${user.id}`
          : `${apiBase}/admin/users`;
        const method = isEdit ? "PATCH" : "POST";

        const res = await fetch(url, {
          method,
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to save user");

        toast(
          isEdit ? "User updated successfully" : "User created successfully",
          "success",
        );
        close();
        onDone();
      } catch (err) {
        toast(err.message, "error");
        restore();
      }
    };
  }
}

export async function renderPaymentsTab(container) {
  showLoader(container);
  const { data: payments } = await supabase
    .from("inquiries")
    .select("*")
    .order("created_at", { ascending: false });
  const list = (payments || []).filter(
    (x) => x.bill_amount != null && Number(x.bill_amount) > 0,
  );
  const totalPaid = list
    .filter((x) => x.payment_status === "paid")
    .reduce((acc, x) => acc + (Number(x.bill_amount) || 0), 0);
  const totalPending = list
    .filter((x) => x.payment_status !== "paid")
    .reduce((acc, x) => acc + (Number(x.bill_amount) || 0), 0);
  const rowHtml = (items) =>
    items.length === 0
      ? '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No payment records yet</td></tr>'
      : items
          .map(
            (x) =>
              `      <tr>        <td><code style="font-size:0.75rem;">${x.ticket_no || x.id.slice(0, 8)}</code></td>        <td><b>${x.full_name}</b><br/><small style="color:var(--text-dim)">${x.phone}</small></td>        <td>\u20B9${Number(x.bill_amount).toLocaleString("en-IN")}</td>        <td><span class="badge badge-${x.payment_status === "paid" ? "resolved" : "medium"}">${x.payment_status === "paid" ? "Paid" : "Unpaid"}</span></td>        <td>${x.payment_link ? `<a href="${x.payment_link}" target="_blank" style="color:var(--primary);font-size:0.8rem;">View Link</a>` : '<span style="color:var(--text-dim);font-size:0.8rem;">No link</span>'}</td>        <td>${x.payment_status !== "paid" ? `<button class="btn btn-secondary btn-sm mark-paid-btn" data-id="${x.id}" style="white-space:nowrap">${ICONS.check}<span>Mark Paid</span></button>` : '<span class="icon-text-success">${ICONS.check}<span>Done</span></span>'}</td>        <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Details</button></td>      </tr>`,
          )
          .join("");
  container.innerHTML = `    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">      <div>        <h1>Payment Tracker</h1>        <p>Monitor revenue and billing status</p>      </div>      <button class="btn btn-secondary" id="pay-refresh">${ICONS.refresh}<span>Refresh</span></button>    </div>    <div class="stats-grid" style="margin-bottom:24px;">      <div class="stat-card">        <div class="stat-value" style="color:var(--success)">\u20B9${totalPaid.toLocaleString("en-IN")}</div>        <div class="stat-label">Total Received</div>      </div>      <div class="stat-card">        <div class="stat-value" style="color:var(--warning)">\u20B9${totalPending.toLocaleString("en-IN")}</div>        <div class="stat-label">Pending Payments</div>      </div>      <div class="stat-card">        <div class="stat-value" style="color:var(--primary)">${list.filter((x) => x.payment_status === "paid").length} / ${list.length}</div>        <div class="stat-label">Paid / Total Bills</div>      </div>    </div>    <div class="filter-bar" style="margin-bottom:16px; display:flex; gap:12px; flex-wrap:wrap;">      <div class="search-input-wrap" style="flex:1; min-width:200px;">        <span>${ICONS.search}</span>        <input class="search-input" id="pay-search" placeholder="Search by name or ticket…"/>      </div>      <div class="sr-filter-bar" id="pay-status-tabs">        <button class="sr-filter active" data-status="all">All <span class="sr-filter-count">${list.length}</span></button>        <button class="sr-filter" data-status="unpaid">Unpaid <span class="sr-filter-count">${list.filter((x) => x.payment_status !== "paid").length}</span></button>        <button class="sr-filter" data-status="paid">Paid <span class="sr-filter-count">${list.filter((x) => x.payment_status === "paid").length}</span></button>      </div>    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead>            <tr><th>Ticket</th><th>Customer</th><th>Bill</th><th>Status</th><th>Link</th><th></th><th></th></tr>          </thead>          <tbody>${rowHtml(list)}</tbody>        </table>      </div>    </div>  `;
  let activeStatus = "all";
  let searchQ = "";
  const filterAndRender = () => {
    const filtered = list.filter((x) => {
      const matchStatus =
        activeStatus === "all"
          ? true
          : activeStatus === "paid"
            ? x.payment_status === "paid"
            : x.payment_status !== "paid";
      const matchSearch =
        !searchQ ||
        x.full_name.toLowerCase().includes(searchQ) ||
        (x.ticket_no || "").toLowerCase().includes(searchQ);
      return matchStatus && matchSearch;
    });
    container.querySelector("tbody").innerHTML = rowHtml(filtered);
    bindRowActions();
  };
  const bindRowActions = () => {
    container.querySelectorAll(".inq-btn").forEach((btn) => {
      btn.onclick = () =>
        openInquiryDetailWithLoader(btn, btn.dataset.id, () =>
          renderPaymentsTab(container),
        );
    });
    container.querySelectorAll(".mark-paid-btn").forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = "…";
        const row = list.find((x) => String(x.id) === String(btn.dataset.id));
        const error = row
          ? await markInquiryPaid(row)
          : { message: "Payment row not found" };
        if (error) {
          toast(error.message, "error");
          btn.disabled = false;
          btn.innerHTML = `${ICONS.check}<span>Mark Paid</span>`;
        } else {
          toast("Marked as paid and status updated", "success");
          renderPaymentsTab(container);
        }
      };
    });
  };
  container.querySelector("#pay-refresh").onclick = () =>
    renderPaymentsTab(container);
  container.querySelector("#pay-search").oninput = (e) => {
    searchQ = e.target.value.toLowerCase();
    filterAndRender();
  };
  container.querySelectorAll("#pay-status-tabs .sr-filter").forEach((btn) => {
    btn.onclick = () => {
      container
        .querySelectorAll("#pay-status-tabs .sr-filter")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeStatus = btn.dataset.status;
      filterAndRender();
    };
  });
  bindRowActions();
}
export async function renderBillsTab(container) {
  showLoader(container);
  const { data: rows } = await supabase
    .from("inquiries")
    .select("*")
    .order("bill_generated_at", { ascending: false });
  const list = (rows || []).filter((x) => Number(x.bill_total) > 0);
  const totalBilled = list.reduce(
    (acc, x) => acc + (Number(x.bill_total) || 0),
    0,
  );
  const totalReceived = list
    .filter((x) => x.payment_status === "paid")
    .reduce((acc, x) => acc + (Number(x.bill_total) || 0), 0);
  const totalPending = totalBilled - totalReceived;
  const dateOf = (x) => {
    const d = x.bill_generated_at || x.created_at;
    if (!d) return "—";
    try {
      const dt = new Date(d.replace(" ", "T"));
      return Number.isNaN(dt.getTime())
        ? d
        : dt.toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
          });
    } catch {
      return d;
    }
  };
  const rowHtml = (items) =>
    items.length === 0
      ? '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim)">No bills generated yet</td></tr>'
      : items
          .map(
            (x) =>
              `      <tr>        <td><small style="color:var(--text-dim)">${dateOf(x)}</small></td>        <td><code style="font-size:0.75rem;">${x.ticket_no || (x.id || "").slice(0, 8)}</code></td>        <td><b>${x.full_name || "—"}</b><br/><small style="color:var(--text-dim)">${x.phone || ""}</small></td>        <td>${x.device_type || '<span style="color:var(--text-dim)">—</span>'}<br/><small style="color:var(--text-dim)">${x.device_serial_no || ""}</small></td>        <td><b>\u20B9${Math.round(Number(x.bill_total)).toLocaleString("en-IN")}</b></td>        <td><span class="badge badge-${x.payment_status === "paid" ? "resolved" : "medium"}">${x.payment_status === "paid" ? "Paid" : "Unpaid"}</span></td>        <td><button class="btn btn-primary btn-sm bill-view-btn" data-id="${x.id}">${ICONS.eye}<span>View</span></button></td>        <td><button class="btn btn-secondary btn-sm bill-share-btn" data-id="${x.id}" title="Get shareable PDF link">${ICONS.link}<span>Share</span></button></td>      </tr>`,
          )
          .join("");
  container.innerHTML = `    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">      <div>        <h1>Bills</h1>        <p>All invoices generated by technicians — open any bill to view or download the PDF</p>      </div>      <button class="btn btn-secondary" id="bills-refresh">${ICONS.refresh}<span>Refresh</span></button>    </div>    <div class="stats-grid" style="margin-bottom:24px;">      <div class="stat-card">        <div class="stat-value" style="color:var(--primary)">${list.length}</div>        <div class="stat-label">Total Bills</div>      </div>      <div class="stat-card">        <div class="stat-value" style="color:var(--success)">\u20B9${Math.round(totalReceived).toLocaleString("en-IN")}</div>        <div class="stat-label">Received</div>      </div>      <div class="stat-card">        <div class="stat-value" style="color:var(--warning)">\u20B9${Math.round(totalPending).toLocaleString("en-IN")}</div>        <div class="stat-label">Pending</div>      </div>      <div class="stat-card">        <div class="stat-value" style="font-size:1.7rem;">\u20B9${Math.round(totalBilled).toLocaleString("en-IN")}</div>        <div class="stat-label">Total Billed</div>      </div>    </div>    <div class="filter-bar" style="margin-bottom:16px; display:flex; gap:12px; flex-wrap:wrap;">      <div class="search-input-wrap" style="flex:1; min-width:200px;">        <span>${ICONS.search}</span>        <input class="search-input" id="bills-search" placeholder="Search by name, ticket, device, serial…"/>      </div>      <div class="sr-filter-bar" id="bills-status-tabs">        <button class="sr-filter active" data-status="all">All <span class="sr-filter-count">${list.length}</span></button>        <button class="sr-filter" data-status="paid">Paid <span class="sr-filter-count">${list.filter((x) => x.payment_status === "paid").length}</span></button>        <button class="sr-filter" data-status="unpaid">Unpaid <span class="sr-filter-count">${list.filter((x) => x.payment_status !== "paid").length}</span></button>      </div>    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead>            <tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Device</th><th>Total</th><th>Payment</th><th></th><th></th></tr>          </thead>          <tbody>${rowHtml(list)}</tbody>        </table>      </div>    </div>  `;
  let activeStatus = "all";
  let searchQ = "";
  const filterAndRender = () => {
    const filtered = list.filter((x) => {
      const matchStatus =
        activeStatus === "all"
          ? true
          : activeStatus === "paid"
            ? x.payment_status === "paid"
            : x.payment_status !== "paid";
      const hay =
        `${x.full_name || ""} ${x.ticket_no || ""} ${x.device_type || ""} ${x.device_serial_no || ""}`.toLowerCase();
      return matchStatus && (!searchQ || hay.includes(searchQ));
    });
    container.querySelector("tbody").innerHTML = rowHtml(filtered);
    bindRowActions();
  };
  const buildBillData = async (row) => {
    const technicianName = row.assigned_employee_id
      ? (
          await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", row.assigned_employee_id)
            .single()
        ).data?.full_name || ""
      : "";
    const { data: links } = await supabase
      .from("inquiry_services")
      .select(
        "service_id, service_pricing(name, category, sub_category, sub_sub_category, cost)",
      )
      .eq("inquiry_id", row.id);
    const services = (links || []).map((r) => {
      const p = r.service_pricing || {};
      const parts = [
        p.category,
        p.sub_category,
        p.sub_sub_category || p.name,
      ].filter(Boolean);
      return { name: parts.join(" › "), cost: Number(p.cost) || 0 };
    });
    const servicesSubtotal = Math.max(
      0,
      Number(row.bill_amount || 0) - Number(row.extra_cost || 0),
    );
    return {
      customer: {
        name: row.full_name,
        phone: row.phone,
        location: row.location,
        company: row.company_name,
        device_type: row.device_type,
        device_serial: row.device_serial_no,
        service_item: row.service_item,
        ticket_no: row.ticket_no,
      },
      technician: technicianName,
      services,
      servicesSubtotal,
      extra: Number(row.extra_cost) || 0,
      extraReason: row.extra_cost_reason || "",
      platform: Number(row.platform_fee) || 0,
      km: Number(row.transport_km) || 0,
      transport: Number(row.transport_fee) || 0,
      discount: Number(row.discount_amount) || 0,
      taxable:
        servicesSubtotal +
        Number(row.extra_cost || 0) +
        Number(row.platform_fee || 0) +
        Number(row.transport_fee || 0) -
        Number(row.discount_amount || 0),
      gst: Number(row.gst_amount) || 0,
      total: Number(row.bill_total) || 0,
      paymentLink: row.payment_link || "",
    };
  };
  const bindRowActions = () => {
    container.querySelectorAll(".bill-view-btn").forEach((btn) => {
      btn.onclick = async () => {
        const row = list.find((x) => String(x.id) === String(btn.dataset.id));
        if (!row) return;
        const billData = await buildBillData(row);
        openPremiumBillModal(billData, {
          allowShare: false,
          title: "Bill (Sent to Client)",
        });
      };
    });
    container.querySelectorAll(".bill-share-btn").forEach((btn) => {
      btn.onclick = async () => {
        const row = list.find((x) => String(x.id) === String(btn.dataset.id));
        if (!row) return;
        const restore = setButtonLoading(btn, "Preparing…");
        let billData;
        try {
          billData = await buildBillData(row);
        } finally {
          restore();
        }
        showBillShareModal(row, billData);
      };
    });
  };
  container.querySelector("#bills-refresh").onclick = () =>
    renderBillsTab(container);
  container.querySelector("#bills-search").oninput = (e) => {
    searchQ = e.target.value.toLowerCase();
    filterAndRender();
  };
  container.querySelectorAll("#bills-status-tabs .sr-filter").forEach((btn) => {
    btn.onclick = () => {
      container
        .querySelectorAll("#bills-status-tabs .sr-filter")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeStatus = btn.dataset.status;
      filterAndRender();
    };
  });
  bindRowActions();
}
async function showBillShareModal(row, billData) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `    <div class="modal-card" style="max-width:480px;width:100%;">      <div class="modal-header">        <h3 class="modal-title-inline">${ICONS.link}<span>Share Bill with Client</span></h3>        <button type="button" class="modal-close" id="bsm-close" title="Close" aria-label="Close">${ICONS.close}</button>      </div>      <div class="modal-body" style="padding:24px;">        <div id="bsm-loading" style="text-align:center;padding:20px 0;">          <div class="spinner" style="margin:0 auto 12px;"></div>          <p style="color:var(--text-dim);font-size:14px;">Generating PDF…</p>        </div>        <div id="bsm-content" style="display:none;">          <p style="font-size:13px;color:var(--text-dim);margin-bottom:12px;">Copy this public link and send it to the client — they can open and download the PDF without logging in.</p>          <div style="display:flex;gap:8px;align-items:center;">            <input id="bsm-url" readonly style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text);" value="" />            <button class="btn btn-primary" id="bsm-copy" style="white-space:nowrap;">${ICONS.clipboard}<span>Copy</span></button>          </div>          <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">            <a id="bsm-open" target="_blank" rel="noopener" class="btn btn-secondary" style="text-decoration:none;">${ICONS.receipt}<span>Open PDF</span></a>            <button class="btn btn-secondary" id="bsm-whatsapp">${ICONS.whatsapp}<span>Send via WhatsApp</span></button>          </div>        </div>        <div id="bsm-error" style="display:none;color:var(--danger);font-size:14px;"></div>      </div>    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#bsm-close").onclick = () => overlay.remove();
  try {
    const url = await shareBillToPublicLink(billData, {
      inquiryId: row.id,
      existingUrl: row.bill_pdf_url || null,
    });
    row.bill_pdf_url = url;
    overlay.querySelector("#bsm-loading").style.display = "none";
    overlay.querySelector("#bsm-content").style.display = "block";
    const urlInput = overlay.querySelector("#bsm-url");
    urlInput.value = url;
    overlay.querySelector("#bsm-copy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copied to clipboard!", "success");
      } catch {
        urlInput.select();
        document.execCommand("copy");
        toast("Link copied!", "success");
      }
    };
    overlay.querySelector("#bsm-open").href = url;
    overlay.querySelector("#bsm-whatsapp").onclick = () => {
      const phone = (row.phone || "").replace(/\D/g, "");
      if (!phone) {
        toast("No phone number on this bill", "error");
        return;
      }
      const inr = (n) =>
        `\u20B9${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
      const b = billData || {};
      const billSvcs = b.services || [];
      const itemLines = [];
      if (billSvcs.length) {
        billSvcs.forEach((s, i) => itemLines.push(`${i + 1}. ${s.name}: *${inr(s.cost)}*`));
      } else {
        itemLines.push(`- Services Subtotal: *${inr(b.servicesSubtotal)}*`);
      }
      if (Number(b.extra) > 0) itemLines.push(`- Additional Charges: *${inr(b.extra)}*${b.extraReason ? ` (${b.extraReason})` : ""}`);
      itemLines.push(`- Platform Fee: *${inr(b.platform)}*`);
      if (Number(b.km) > 0) itemLines.push(`- Transport (${b.km} km): *${inr(b.transport)}*`);
      if (Number(b.discount) > 0) itemLines.push(`- Discount: *-${inr(b.discount)}*${b.discountLabel ? ` (${b.discountLabel})` : ""}`);
      itemLines.push(`- GST (18%): *${inr(b.gst)}*`, `------------------------------`);
      const msg = [
        `Hi ${row.full_name || ""}!`,
        `Your service invoice from *Networking Experts* is ready.`,
        `Ticket: *${row.ticket_no || "—"}*`,
        "",
        `*Bill details:*`,
        ...itemLines,
        `*Total Payable: ${inr(row.bill_total)}*`,
        "",
        `View / download bill PDF:`,
        url,
        "",
        "— Networking Experts",
      ].join("\n");
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
        "_blank",
      );
    };
  } catch (err) {
    console.error("[showBillShareModal]", err);
    overlay.querySelector("#bsm-loading").style.display = "none";
    overlay.querySelector("#bsm-error").style.display = "block";
    overlay.querySelector("#bsm-error").textContent =
      `Failed to generate PDF: ${err.message}`;
  }
}
export async function renderDeviceTypesTab(container) {
  showLoader(container);
  const [{ data: rows }, { data: compRows }, { data: inqs }] =
    await Promise.all([
      supabase.from("device_types").select("*").order("name"),
      supabase.from("companies").select("*").order("name"),
      supabase
        .from("inquiries")
        .select(
          "full_name, company_name, device_type, device_serial_no, ticket_no, created_at",
        ),
    ]);
  const list = Array.isArray(rows) ? rows : [];
  const compList = Array.isArray(compRows) ? compRows : [];
  const reportedDevices = (inqs || []).filter(
    (x) =>
      (x.device_type && x.device_type.trim()) ||
      (x.device_serial_no && x.device_serial_no.trim()),
  );
  reportedDevices.sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );
  const dtHtml =
    list.length === 0
      ? '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-dim)">No device types yet.</td></tr>'
      : list
          .map(
            (x) =>
              `      <tr data-id="${x.id}">        <td><b>${escapeHtml(x.name)}</b></td>        <td><small style="color:var(--text-dim)">${escapeHtml(x.description || "—")}</small></td>        <td style="text-align:right; white-space:nowrap;">          <button class="btn btn-secondary btn-sm dt-edit-btn" data-id="${x.id}" style="padding:2px 8px; font-size:0.75rem;">Edit</button>          <button class="btn btn-danger btn-sm dt-del-btn" data-id="${x.id}" style="padding:2px 8px; font-size:0.75rem;">Delete</button>        </td>      </tr>`,
          )
          .join("");
  const compHtml =
    compList.length === 0
      ? '<tr><td colspan="2" style="text-align:center;padding:24px;color:var(--text-dim)">No companies yet.</td></tr>'
      : compList
          .map((x) => {
            const isDefault = x.name.toLowerCase() === "networking experts";
            return `          <tr data-id="${x.id}">            <td><b>${escapeHtml(x.name)}</b></td>            <td style="text-align:right; white-space:nowrap;">              ${isDefault ? '<span style="color:var(--text-dim); font-size:0.75rem; margin-right:8px; font-weight:600;">Default</span>' : `                <button class="btn btn-secondary btn-sm comp-edit-btn" data-id="${x.id}" style="padding:2px 8px; font-size:0.75rem;">Edit</button>                <button class="btn btn-danger btn-sm comp-del-btn" data-id="${x.id}" style="padding:2px 8px; font-size:0.75rem;">Delete</button>              `}            </td>          </tr>        `;
          })
          .join("");
  const deviceRowsHtml =
    reportedDevices.length === 0
      ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No reported customer devices found.</td></tr>'
      : reportedDevices
          .map(
            (x) =>
              `      <tr>        <td><b>${escapeHtml(x.full_name || "—")}</b></td>        <td>${escapeHtml(x.company_name || "—")}</td>        <td><span class="badge badge-open">${escapeHtml(x.device_type || "—")}</span></td>        <td><code>${escapeHtml(x.device_serial_no || "—")}</code></td>        <td><code>${escapeHtml(x.ticket_no || "—")}</code></td>        <td>${x.created_at ? new Date(x.created_at).toLocaleDateString("en-IN") : "—"}</td>      </tr>    `,
          )
          .join("");
  container.innerHTML = `    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px;">      <div>        <h1>Devices & Companies Management</h1>        <p>Manage device types, registered companies, and view reported customer devices.</p>      </div>      <button class="btn btn-secondary" id="dt-refresh">${ICONS.refresh}<span>Refresh</span></button>    </div>    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap:20px; margin-bottom:20px;">      <!-- Device Types CRUD -->      <div class="card" style="margin:0; display:flex; flex-direction:column; justify-content:space-between;">        <div class="card-body">          <h2 style="font-size:1.2rem; margin-top:0; margin-bottom:12px;">Device Types CRUD</h2>          <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:16px;">Pickable device types for technicians.</p>          <div style="display:flex; gap:10px; margin-bottom:16px; align-items:flex-end;">            <div class="form-group" style="margin:0; flex:1;">              <label style="font-size:0.75rem;">Device Name</label>              <input id="dt-name" placeholder="e.g. Video Door Phone" style="width:100%; padding:6px 10px; font-size:0.85rem;"/>            </div>            <div class="form-group" style="margin:0; flex:1.5;">              <label style="font-size:0.75rem;">Description (optional)</label>              <input id="dt-desc" placeholder="Short note" style="width:100%; padding:6px 10px; font-size:0.85rem;"/>            </div>            <button class="btn btn-primary" id="dt-add" style="padding:6px 12px; height:34px; font-size:0.85rem; display:flex; align-items:center; gap:4px;">              ${ICONS.plus}<span>Add</span>            </button>          </div>          <div class="table-wrap" style="max-height: 280px; overflow-y: auto;">            <table>              <thead><tr><th>Name</th><th>Description</th><th style="text-align:right;"></th></tr></thead>              <tbody>${dtHtml}</tbody>            </table>          </div>        </div>      </div>      <!-- Companies CRUD -->      <div class="card" style="margin:0; display:flex; flex-direction:column; justify-content:space-between;">        <div class="card-body">          <h2 style="font-size:1.2rem; margin-top:0; margin-bottom:12px;">Companies Registry</h2>          <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:16px;">Registered client companies.</p>          <div style="display:flex; gap:10px; margin-bottom:16px; align-items:flex-end;">            <div class="form-group" style="margin:0; flex:1;">              <label style="font-size:0.75rem;">Company Name</label>              <input id="comp-name" placeholder="e.g. ACME Corp" style="width:100%; padding:6px 10px; font-size:0.85rem;"/>            </div>            <button class="btn btn-primary" id="comp-add" style="padding:6px 12px; height:34px; font-size:0.85rem; display:flex; align-items:center; gap:4px;">              ${ICONS.plus}<span>Add</span>            </button>          </div>          <div class="table-wrap" style="max-height: 280px; overflow-y: auto;">            <table>              <thead><tr><th>Name</th><th style="text-align:right;"></th></tr></thead>              <tbody>${compHtml}</tbody>            </table>          </div>        </div>      </div>    </div>    <!-- Reported Customer Devices Table Card -->    <div class="card">      <div class="card-body">        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:12px;">          <div>            <h2 style="font-size:1.25rem; margin:0;">Reported Customer Devices</h2>            <p style="font-size:0.85rem; color:var(--text-dim); margin:4px 0 0 0;">              List of all customer devices registered or reported in service inquiries.            </p>          </div>          <button class="btn btn-secondary" id="export-devices-csv" style="display:flex; align-items:center; gap:6px; font-size:0.85rem; padding:8px 14px;">            Export CSV          </button>        </div>        <div class="table-wrap">          <table>            <thead>              <tr>                <th>Customer Name</th>                <th>Company</th>                <th>Device Type</th>                <th>Serial Number</th>                <th>Ticket Number</th>                <th>Service Date</th>              </tr>            </thead>            <tbody>${deviceRowsHtml}</tbody>          </table>        </div>      </div>    </div>  `;
  container.querySelector("#dt-refresh").onclick = () =>
    renderDeviceTypesTab(container);
  container.querySelector("#dt-add").onclick = async () => {
    const name = container.querySelector("#dt-name").value.trim();
    const description = container.querySelector("#dt-desc").value.trim();
    if (!name) {
      toast("Enter a device name", "warning");
      return;
    }
    if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
      toast("That device type already exists", "warning");
      return;
    }
    const id =
      (window.crypto?.randomUUID && window.crypto.randomUUID()) ||
      `dt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await supabase
      .from("device_types")
      .insert({ id, name, description: description || null });
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Device type added", "success");
    renderDeviceTypesTab(container);
  };
  container.querySelectorAll(".dt-edit-btn").forEach((btn) => {
    btn.onclick = async () => {
      const row = list.find((x) => String(x.id) === btn.dataset.id);
      if (!row) return;
      const newName = prompt("Device name:", row.name);
      if (newName == null) return;
      const newDesc = prompt("Description (optional):", row.description || "");
      if (newDesc == null) return;
      const { error } = await supabase
        .from("device_types")
        .update({
          name: newName.trim() || row.name,
          description: newDesc.trim() || null,
        })
        .eq("id", row.id);
      if (error) {
        toast(error.message, "error");
        return;
      }
      toast("Updated", "success");
      renderDeviceTypesTab(container);
    };
  });
  container.querySelectorAll(".dt-del-btn").forEach((btn) => {
    btn.onclick = async () => {
      const row = list.find((x) => String(x.id) === btn.dataset.id);
      if (!row) return;
      if (!confirm(`Delete device type "${row.name}"?`)) return;
      const { error } = await supabase
        .from("device_types")
        .delete()
        .eq("id", row.id);
      if (error) {
        toast(error.message, "error");
        return;
      }
      toast("Deleted", "success");
      renderDeviceTypesTab(container);
    };
  });
  container.querySelector("#comp-add").onclick = async () => {
    const name = container.querySelector("#comp-name").value.trim();
    if (!name) {
      toast("Enter a company name", "warning");
      return;
    }
    if (compList.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
      toast("That company already exists", "warning");
      return;
    }
    const id =
      (window.crypto?.randomUUID && window.crypto.randomUUID()) ||
      `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await supabase.from("companies").insert({ id, name });
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Company added", "success");
    renderDeviceTypesTab(container);
  };
  container.querySelectorAll(".comp-edit-btn").forEach((btn) => {
    btn.onclick = async () => {
      const row = compList.find((x) => String(x.id) === btn.dataset.id);
      if (!row) return;
      const isDefault = row.name.toLowerCase() === "networking experts";
      if (isDefault) {
        toast("Cannot edit default company", "error");
        return;
      }
      const newName = prompt("Company name:", row.name);
      if (!newName || !newName.trim()) return;
      if (
        compList.some(
          (x) =>
            x.name.toLowerCase() === newName.trim().toLowerCase() &&
            x.id !== row.id,
        )
      ) {
        toast("That company name already exists", "warning");
        return;
      }
      const { error } = await supabase
        .from("companies")
        .update({ name: newName.trim() })
        .eq("id", row.id);
      if (error) {
        toast(error.message, "error");
        return;
      }
      toast("Company updated", "success");
      renderDeviceTypesTab(container);
    };
  });
  container.querySelectorAll(".comp-del-btn").forEach((btn) => {
    btn.onclick = async () => {
      const row = compList.find((x) => String(x.id) === btn.dataset.id);
      if (!row) return;
      const isDefault = row.name.toLowerCase() === "networking experts";
      if (isDefault) {
        toast("Cannot delete default company", "error");
        return;
      }
      if (!confirm(`Delete company "${row.name}"?`)) return;
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", row.id);
      if (error) {
        toast(error.message, "error");
        return;
      }
      toast("Company deleted", "success");
      renderDeviceTypesTab(container);
    };
  });
  container.querySelector("#export-devices-csv").onclick = () => {
    const headers = [
      "Customer Name",
      "Company",
      "Device Type",
      "Serial Number",
      "Ticket Number",
      "Service Date",
    ];
    const csvRows = reportedDevices.map((x) => [
      x.full_name || "",
      x.company_name || "",
      x.device_type || "",
      x.device_serial_no || "",
      x.ticket_no || "",
      x.created_at ? new Date(x.created_at).toLocaleDateString("en-IN") : "",
    ]);
    const csvData = [
      headers.join(","),
      ...csvRows.map((r) =>
        r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
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
export async function renderCashCollectionsTab(container) {
  showLoader(container);
  const { data: rows } = await supabase
    .from("inquiries")
    .select("*")
    .eq("payment_method", "cash")
    .eq("payment_status", "paid")
    .order("cash_collected_at", { ascending: false });
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("role", "employee");
  const employees = profiles || [];
  const byEmp = new Map();
  (rows || []).forEach((r) => {
    if (!r.assigned_employee_id || !r.cash_collected_at) return;
    if (!byEmp.has(r.assigned_employee_id))
      byEmp.set(r.assigned_employee_id, []);
    byEmp.get(r.assigned_employee_id).push(r);
  });
  const allPending = (rows || []).filter(
    (r) => r.cash_collected_at && !r.cash_submitted_at,
  );
  const allSubmitted = (rows || []).filter((r) => r.cash_submitted_at);
  const totalPending = allPending.reduce(
    (a, r) => a + (Number(r.bill_total) || 0),
    0,
  );
  const totalSubmitted = allSubmitted.reduce(
    (a, r) => a + (Number(r.bill_total) || 0),
    0,
  );
  const dateOf = (d) => {
    if (!d) return "—";
    try {
      const dt = new Date(String(d).replace(" ", "T"));
      return Number.isNaN(dt.getTime())
        ? d
        : dt.toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
          });
    } catch {
      return d;
    }
  };
  const empCardHtml = (emp) => {
    const records = byEmp.get(emp.id) || [];
    const pending = records.filter((r) => !r.cash_submitted_at);
    const submitted = records.filter((r) => r.cash_submitted_at);
    const pendingTotal = pending.reduce(
      (a, r) => a + (Number(r.bill_total) || 0),
      0,
    );
    const submittedTotal = submitted.reduce(
      (a, r) => a + (Number(r.bill_total) || 0),
      0,
    );
    return `      <div class="emp-cash-card" data-emp-id="${emp.id}">        <div class="emp-cash-head">          <div>            <div class="emp-cash-name">${emp.full_name}</div>            <div class="emp-cash-sub">${emp.phone || ""}</div>          </div>          <div class="emp-cash-totals">            <div><span>Pending</span><b style="color:var(--warning)">\u20B9${Math.round(pendingTotal).toLocaleString("en-IN")}</b></div>            <div><span>Submitted</span><b style="color:var(--success)">\u20B9${Math.round(submittedTotal).toLocaleString("en-IN")}</b></div>          </div>        </div>        ${pending.length === 0 ? '<div class="emp-cash-empty">No pending cash from this employee.</div>' : `          <div class="table-wrap">            <table>              <thead><tr>                <th style="width:30px;"><input type="checkbox" class="cash-all-cb" checked title="Select all pending"/></th>                <th>Date</th><th>Ticket</th><th>Customer</th><th>Service</th><th>Amount</th>              </tr></thead>              <tbody>                ${pending.map((r) => `                  <tr>                    <td><input type="checkbox" class="cash-cb" data-id="${r.id}" checked/></td>                    <td><small style="color:var(--text-dim)">${dateOf(r.cash_collected_at)}</small></td>                    <td><code style="font-size:0.75rem;">${r.ticket_no || (r.id || "").slice(0, 8)}</code></td>                    <td><b>${r.full_name || "—"}</b><br/><small style="color:var(--text-dim)">${r.phone || ""}</small></td>                    <td><small>${r.service_item || "—"}</small></td>                    <td><b>\u20B9${Math.round(Number(r.bill_total) || 0).toLocaleString("en-IN")}</b></td>                  </tr>`).join("")}              </tbody>            </table>          </div>          <div class="emp-cash-actions">            <span class="emp-cash-selected">Selected: <b id="sel-total-${emp.id}">\u20B9${Math.round(pendingTotal).toLocaleString("en-IN")}</b></span>            <button class="btn btn-primary record-submit-btn" data-emp-id="${emp.id}">${ICONS.check}<span>Record Submission</span></button>          </div>`}        ${submitted.length > 0 ? `          <details class="emp-cash-history">            <summary>Past submissions (${submitted.length}) · \u20B9${Math.round(submittedTotal).toLocaleString("en-IN")}</summary>            <div class="table-wrap">              <table>                <thead><tr><th>Submitted</th><th>Ticket</th><th>Customer</th><th>Amount</th></tr></thead>                <tbody>                  ${submitted.map((r) => `                    <tr>                      <td><small style="color:var(--text-dim)">${dateOf(r.cash_submitted_at)}</small></td>                      <td><code style="font-size:0.75rem;">${r.ticket_no || (r.id || "").slice(0, 8)}</code></td>                      <td><b>${r.full_name || "—"}</b></td>                      <td><b>\u20B9${Math.round(Number(r.bill_total) || 0).toLocaleString("en-IN")}</b></td>                    </tr>`).join("")}                </tbody>              </table>            </div>          </details>` : ""}      </div>`;
  };
  const empsWithCash = employees.filter(
    (e) => (byEmp.get(e.id) || []).length > 0,
  );
  container.innerHTML = `    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">      <div>        <h1>Cash Collections</h1>        <p>Cash collected by technicians, grouped per employee. Tick the records you're receiving cash for, then press <b>Record Submission</b>.</p>      </div>      <button class="btn btn-secondary" id="cash-refresh">${ICONS.refresh}<span>Refresh</span></button>    </div>    <div class="stats-grid" style="margin-bottom:24px;">      <div class="stat-card">        <div class="stat-value" style="color:var(--warning); font-size:1.9rem;">\u20B9${Math.round(totalPending).toLocaleString("en-IN")}</div>        <div class="stat-label">Total Pending</div>      </div>      <div class="stat-card">        <div class="stat-value" style="color:var(--success); font-size:1.9rem;">\u20B9${Math.round(totalSubmitted).toLocaleString("en-IN")}</div>        <div class="stat-label">Total Submitted (All Time)</div>      </div>      <div class="stat-card">        <div class="stat-value">${empsWithCash.length}</div>        <div class="stat-label">Employees With Records</div>      </div>      <div class="stat-card">        <div class="stat-value">${allPending.length}</div>        <div class="stat-label">Pending Records</div>      </div>    </div>    ${empsWithCash.length === 0 ? '<div class="card"><div class="card-body" style="text-align:center; padding:48px; color:var(--text-dim);">No cash collections recorded yet.</div></div>' : empsWithCash.map(empCardHtml).join("")}  `;
  container.querySelector("#cash-refresh").onclick = () =>
    renderCashCollectionsTab(container);
  const refreshSelectedTotal = (empId) => {
    const card = container.querySelector(
      `.emp-cash-card[data-emp-id="${empId}"]`,
    );
    if (!card) return;
    const checked = Array.from(card.querySelectorAll(".cash-cb:checked")).map(
      (c) => c.dataset.id,
    );
    const records = byEmp.get(empId) || [];
    const total = records
      .filter((r) => checked.includes(String(r.id)))
      .reduce((a, r) => a + (Number(r.bill_total) || 0), 0);
    const target = card.querySelector(`#sel-total-${empId}`);
    if (target)
      target.textContent = `\u20B9${Math.round(total).toLocaleString("en-IN")}`;
  };
  container.querySelectorAll(".emp-cash-card").forEach((card) => {
    const empId = card.dataset.empId;
    const allCb = card.querySelector(".cash-all-cb");
    const rowCbs = card.querySelectorAll(".cash-cb");
    if (allCb) {
      allCb.onclick = () => {
        rowCbs.forEach((cb) => {
          cb.checked = allCb.checked;
        });
        refreshSelectedTotal(empId);
      };
    }
    rowCbs.forEach((cb) => {
      cb.onchange = () => refreshSelectedTotal(empId);
    });
  });
  container.querySelectorAll(".record-submit-btn").forEach((btn) => {
    btn.onclick = async () => {
      const empId = btn.dataset.empId;
      const card = container.querySelector(
        `.emp-cash-card[data-emp-id="${empId}"]`,
      );
      const ids = Array.from(card.querySelectorAll(".cash-cb:checked")).map(
        (c) => c.dataset.id,
      );
      if (ids.length === 0) {
        toast("Select at least one record", "warning");
        return;
      }
      btn.disabled = true;
      btn.innerHTML = "<span>Saving…</span>";
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const nowIso = new Date().toISOString().slice(0, 19).replace("T", " ");
        for (const id of ids) {
          await supabase
            .from("inquiries")
            .update({
              cash_submitted_at: nowIso,
              cash_submitted_by: user?.id || null,
            })
            .eq("id", id);
        }
        const total = (byEmp.get(empId) || [])
          .filter((r) => ids.includes(String(r.id)))
          .reduce((a, r) => a + (Number(r.bill_total) || 0), 0);
        toast(
          `Recorded \u20B9${Math.round(total).toLocaleString("en-IN")} from technician`,
          "success",
        );
        renderCashCollectionsTab(container);
      } catch (err) {
        toast(err.message || "Could not record submission", "error");
        btn.disabled = false;
        btn.innerHTML = `${ICONS.check}<span>Record Submission</span>`;
      }
    };
  });
}
let _xlsxLoader = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxLoader) return _xlsxLoader;
  _xlsxLoader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () =>
      window.XLSX
        ? resolve(window.XLSX)
        : reject(new Error("xlsx failed to load"));
    s.onerror = () =>
      reject(
        new Error(
          "Could not fetch xlsx parser. Check your internet connection.",
        ),
      );
    document.head.appendChild(s);
  });
  return _xlsxLoader;
}
function parseCSV(text) {
  const rows = [];
  let cur = "",
    row = [],
    inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        cur = "";
        row = [];
      } else if (c === "\r") {
        /* skip */
      } else cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""));
}
async function readSheetAsRows(file) {
  const isCSV = /\.csv$/i.test(file.name) || file.type === "text/csv";
  if (isCSV) {
    const text = await file.text();
    return parseCSV(text);
  }
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });
}
function parsePrice(v) {
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[?$,\s]/g, "");
  return Number(cleaned);
}
function detectHeader(row) {
  const labels = row.map((c) =>
    String(c ?? "")
      .trim()
      .toLowerCase(),
  );
  const map = { mainIdx: -1, subIdx: -1, subSubIdx: -1, priceIdx: -1 };
  let matched = 0;
  labels.forEach((label, i) => {
    if (!label) return;
    if (/(price|rate|cost|amount|charge)/.test(label)) {
      map.priceIdx = i;
      matched++;
    } else if (
      /sub[\s\-_]*sub/.test(label) ||
      /level\s*3/.test(label) ||
      /issue|defect|problem/.test(label)
    ) {
      map.subSubIdx = i;
      matched++;
    } else if (
      /sub/.test(label) ||
      /level\s*2/.test(label) ||
      /group/.test(label)
    ) {
      map.subIdx = i;
      matched++;
    } else if (/(main|category|type|service)/.test(label)) {
      map.mainIdx = i;
      matched++;
    }
  });
  return matched >= 2 ? map : null;
}
function inferLayout(row) {
  let priceIdx = -1;
  for (let i = row.length - 1; i >= 0; i--) {
    if (Number.isFinite(parsePrice(row[i]))) {
      priceIdx = i;
      break;
    }
  }
  if (priceIdx <= 0)
    return {
      mainIdx: -1,
      subIdx: -1,
      subSubIdx: 0,
      priceIdx: priceIdx >= 0 ? priceIdx : 1,
    };
  if (priceIdx === 1)
    return { mainIdx: -1, subIdx: -1, subSubIdx: 0, priceIdx };
  if (priceIdx === 2) return { mainIdx: 0, subIdx: -1, subSubIdx: 1, priceIdx };
  return { mainIdx: 0, subIdx: 1, subSubIdx: 2, priceIdx };
}
async function importServiceRows(rows) {
  let inserted = 0,
    skipped = 0;
  const errors = [];
  if (!rows.length) return { inserted, skipped, errors };
  let layout = detectHeader(rows[0]);
  const startIdx = layout ? 1 : 0;
  if (!layout) layout = inferLayout(rows[0]);
  let { mainIdx, subIdx, subSubIdx, priceIdx } = layout;
  if (subSubIdx === -1 && subIdx !== -1 && mainIdx !== -1) {
    subSubIdx = subIdx;
    subIdx = -1;
  }
  const batch = [];
  const batchMeta = [];
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    const get = (idx) => (idx >= 0 ? String(r[idx] ?? "").trim() : "");
    const category = get(mainIdx);
    const sub_category = get(subIdx);
    const sub_sub_category = get(subSubIdx);
    const cost = parsePrice(priceIdx >= 0 ? r[priceIdx] : null);
    if (
      !category &&
      !sub_category &&
      !sub_sub_category &&
      !Number.isFinite(cost)
    ) {
      skipped++;
      continue;
    }
    if (!sub_sub_category) {
      errors.push(`Row ${i + 1}: missing leaf service name`);
      skipped++;
      continue;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      errors.push(`Row ${i + 1}: invalid price`);
      skipped++;
      continue;
    }
    batch.push({
      id: crypto.randomUUID(),
      category: category || "Uncategorized",
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
      const { error } = await supabase.from("service_pricing").insert(chunk);
      if (error?.status === 429) {
        retries++;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
        continue;
      }
      if (error) {
        chunkMeta.forEach((meta) =>
          errors.push(`Row ${meta.rowIndex + 1}: ${error.message}`),
        );
        skipped += chunk.length;
      } else {
        inserted += chunk.length;
      }
      break;
    }
    if (retries === 3) {
      chunkMeta.forEach((meta) =>
        errors.push(
          `Row ${meta.rowIndex + 1}: rate limited (too many requests)`,
        ),
      );
      skipped += chunk.length;
    }
  }
  return { inserted, skipped, errors };
}
function downloadTemplateCSV() {
  const csv = "Main Category,Sub Category,Sub-Sub Category,Price";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "service-pricing-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export async function renderPricingTab(container) {
  showLoader(container);
  try {
    const { data: pricing, error } = await supabase
      .from("service_pricing")
      .select("*")
      .order("category");
    if (error) throw error;

    const list = pricing || [];
    const mainCategories = [
      ...new Set(list.map((x) => x.category || "Service")),
    ].sort();
    const subCategories = [
      ...new Set(list.map((x) => x.sub_category || "").filter(Boolean)),
    ].sort();

    const rowHtml = (rows) =>
      rows.length === 0
        ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No services match this filter</td></tr>'
        : rows
            .map(
              (x) => `
          <tr data-main="${escapeAttr(x.category || "Service")}" data-sub="${escapeAttr(x.sub_category || "")}" data-search="${escapeAttr(`${x.category || ""} ${x.sub_category || ""} ${x.sub_sub_category || ""} ${x.name || ""}`.toLowerCase())}">
            <td><input type="checkbox" class="service-checkbox" data-id="${x.id}"></td>
            <td><span class="badge badge-open">${escapeHtml(x.category || "Service")}</span></td>
            <td>${x.sub_category ? escapeHtml(x.sub_category) : '<span style="color:var(--text-dim)">-</span>'}</td>
            <td><b>${escapeHtml(x.sub_sub_category || x.name || "")}</b></td>
            <td>${money(x.cost)}</td>
            <td style="display:flex;gap:6px;"><button class="btn btn-secondary btn-sm edit-price" data-id="${x.id}" title="Edit">${ICONS.edit || "Edit"}</button><button class="btn btn-danger btn-sm del-price" data-id="${x.id}" title="Delete">${ICONS.close}</button></td>
          </tr>
        `,
            )
            .join("");

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div style="flex:1;min-width:250px;">
          <h1 style="display:flex;align-items:center;gap:12px;margin:0 0 8px;">
            <span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:1.4rem;flex-shrink:0;">${ICONS.receipt || ""}</span>
            <span>Service Pricing</span>
          </h1>
          <p style="margin:0;font-size:0.95rem;">Manage and filter service rates</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-secondary" id="dl-template" style="white-space:nowrap;">${ICONS.download || ""}<span>Template</span></button>
          <button class="btn btn-secondary" id="upload-price" style="white-space:nowrap;">${ICONS.upload || ""}<span>Upload</span></button>
          <button class="btn btn-primary" id="add-price" style="white-space:nowrap;">${ICONS.plus}<span>Add</span></button>
          <input type="file" id="upload-price-file" accept=".xlsx,.xls,.csv" style="display:none">
          <button class="btn btn-primary" id="admin-pricing-export" style="white-space:nowrap;">${ICONS.download || ""}<span>Export</span></button>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;padding:12px 16px;font-size:13px;color:var(--text-dim);">
        Excel/CSV columns: <b>Main Category</b>, <b>Sub Category</b>, <b>Sub-Sub Category</b>, <b>Price</b>. Sub Category is optional — a 3-column file is also accepted.
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label>Main Category</label>
            <select id="admin-price-main">
              <option value="all">All categories</option>
              ${mainCategories.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label>Sub Category</label>
            <select id="admin-price-sub">
              <option value="all">All sub categories</option>
              ${subCategories.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label>Search</label>
            <input id="admin-price-search" type="search" placeholder="Search service or issue"/>
          </div>
          <button class="btn btn-secondary" id="admin-price-reset">${ICONS.refresh || ""}<span>Reset</span></button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;" id="bulk-actions">
          <button class="btn btn-danger btn-sm" id="del-selected" style="display:none;">Delete Selected</button>
          <button class="btn btn-warning btn-sm" id="remove-dupes">Remove Duplicates</button>
        </div>
        <div class="card-header">
          <span class="card-title">Services</span>
          <span id="admin-price-count" style="font-size:0.82rem;color:var(--text-dim);font-weight:700;">${list.length} item${list.length === 1 ? "" : "s"}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th style="width:30px;"><input type="checkbox" id="select-all" title="Select all"></th><th>Main Category</th><th>Sub Category</th><th>Service / Issue</th><th>Price</th><th>Actions</th></tr>
            </thead>
            <tbody id="admin-price-body">${rowHtml(list)}</tbody>
          </table>
        </div>
      </div>
    `;

    const mainSel = container.querySelector("#admin-price-main");
    const subSel = container.querySelector("#admin-price-sub");
    const searchInput = container.querySelector("#admin-price-search");
    const body = container.querySelector("#admin-price-body");
    const count = container.querySelector("#admin-price-count");
    const selectAllCheckbox = container.querySelector("#select-all");
    const delSelectedBtn = container.querySelector("#del-selected");
    let visibleRows = [...list];

    const updateSubCategories = () => {
      const main = mainSel.value;
      const filteredSubs =
        main === "all"
          ? subCategories
          : [
              ...new Set(
                list
                  .filter((x) => x.category === main)
                  .map((x) => x.sub_category || "")
                  .filter(Boolean),
              ),
            ].sort();

      subSel.innerHTML =
        '<option value="all">All sub categories</option>' +
        filteredSubs.map((c) => `<option value="${c}">${c}</option>`).join("");
      subSel.value = "all";
      applyFilters();
    };

    const applyFilters = () => {
      const main = mainSel.value;
      const sub = subSel.value;
      const query = searchInput.value.trim().toLowerCase();
      visibleRows = list.filter((x) => {
        const mainValue = x.category || "Service";
        const subValue = x.sub_category || "";
        const haystack =
          `${x.category || ""} ${x.sub_category || ""} ${x.sub_sub_category || ""} ${x.name || ""}`.toLowerCase();
        return (
          (main === "all" || mainValue === main) &&
          (sub === "all" || subValue === sub) &&
          (!query || haystack.includes(query))
        );
      });
      body.innerHTML = rowHtml(visibleRows);
      count.textContent = `${visibleRows.length} item${visibleRows.length === 1 ? "" : "s"}`;
      setupRowHandlers();
      updateBulkActions();
    };

    const updateBulkActions = () => {
      const checkedCount = container.querySelectorAll(
        ".service-checkbox:checked",
      ).length;
      delSelectedBtn.style.display = checkedCount > 0 ? "" : "none";
    };

    const setupRowHandlers = () => {
      container.querySelectorAll(".service-checkbox").forEach((cb) => {
        cb.onchange = updateBulkActions;
      });
      container.querySelectorAll(".edit-price").forEach((btn) => {
        btn.onclick = async () => {
          const service = list.find((x) => x.id === btn.dataset.id);
          if (!service) return;
          const category = prompt(
            "Main Category:",
            service.category || "Service",
          );
          if (category === null) return;
          const sub_category = prompt(
            "Sub Category:",
            service.sub_category || "",
          );
          if (sub_category === null) return;
          const sub_sub_category = prompt(
            "Sub-Sub Category:",
            service.sub_sub_category || service.name || "",
          );
          if (!sub_sub_category) return;
          const costStr = prompt("Price (?):", String(service.cost || 0));
          const cost = parseFloat(costStr);
          if (!Number.isFinite(cost) || cost < 0) {
            toast("Invalid price", "error");
            return;
          }
          const { error } = await supabase
            .from("service_pricing")
            .update({
              category: category || "Uncategorized",
              sub_category: sub_category.trim() || null,
              sub_sub_category,
              name: sub_sub_category,
              cost,
            })
            .eq("id", service.id);
          if (error) toast(error.message, "error");
          else {
            toast("Service updated", "success");
            renderPricingTab(container);
          }
        };
      });
      container.querySelectorAll(".del-price").forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm("Delete this service?")) return;
          const { error } = await supabase
            .from("service_pricing")
            .delete()
            .eq("id", btn.dataset.id);
          if (error) toast(error.message, "error");
          else {
            toast("Service deleted", "success");
            renderPricingTab(container);
          }
        };
      });
    };

    mainSel.onchange = updateSubCategories;
    subSel.onchange = applyFilters;
    searchInput.oninput = applyFilters;
    selectAllCheckbox.onchange = () => {
      container
        .querySelectorAll(".service-checkbox")
        .forEach((cb) => (cb.checked = selectAllCheckbox.checked));
      updateBulkActions();
    };

    container.querySelector("#admin-price-reset").onclick = () => {
      mainSel.value = "all";
      subSel.value = "all";
      searchInput.value = "";
      applyFilters();
    };

    delSelectedBtn.onclick = async () => {
      const selected = Array.from(
        container.querySelectorAll(".service-checkbox:checked"),
      ).map((cb) => cb.dataset.id);
      if (!selected.length) return;
      if (
        !confirm(
          `Delete ${selected.length} service${selected.length === 1 ? "" : "s"}?`,
        )
      )
        return;
      let deleted = 0;
      for (const id of selected) {
        const { error } = await supabase
          .from("service_pricing")
          .delete()
          .eq("id", id);
        if (!error) deleted++;
      }
      toast(`Deleted ${deleted} service${deleted === 1 ? "" : "s"}`, "success");
      renderPricingTab(container);
    };

    container.querySelector("#remove-dupes").onclick = async () => {
      const seen = new Map();
      const dupeIds = [];
      list.forEach((item) => {
        const key = `${item.category}||${item.sub_category}||${item.sub_sub_category}`;
        if (seen.has(key)) dupeIds.push(item.id);
        else seen.set(key, item.id);
      });
      if (!dupeIds.length) {
        toast("No duplicates found", "info");
        return;
      }
      if (
        !confirm(
          `Found ${dupeIds.length} duplicate service${dupeIds.length === 1 ? "" : "s"}. Delete them?`,
        )
      )
        return;
      let deleted = 0;
      for (const id of dupeIds) {
        const { error } = await supabase
          .from("service_pricing")
          .delete()
          .eq("id", id);
        if (!error) deleted++;
      }
      toast(
        `Removed ${deleted} duplicate${deleted === 1 ? "" : "s"}`,
        "success",
      );
      renderPricingTab(container);
    };

    let addPriceLocked = false;
    container.querySelector("#add-price").onclick = () => {
      if (addPriceLocked) return;
      const category = prompt("Enter Main Category:");
      if (category === null) return;
      const sub_category = prompt("Enter Sub Category (optional):");
      if (sub_category === null) return;
      const sub_sub_category = prompt(
        "Enter Sub-Sub Category (specific issue):",
      );
      if (!sub_sub_category) return;
      const costStr = prompt("Enter Price (?):");
      const cost = parseFloat(costStr);
      if (!Number.isFinite(cost) || cost < 0) {
        toast("Invalid price", "error");
        return;
      }
      addPriceLocked = true;
      (async () => {
        try {
          const { error } = await supabase.from("service_pricing").insert({
            id: crypto.randomUUID?.() || `svc-${Date.now()}`,
            category: category || "Uncategorized",
            sub_category: sub_category.trim() || null,
            sub_sub_category,
            name: sub_sub_category,
            cost,
          });
          if (error?.status === 429) {
            toast(
              "Server is busy — please try again in a few seconds",
              "error",
            );
          } else if (error) {
            toast(error.message || "Failed to add service", "error");
          } else {
            toast("Service added", "success");
            renderPricingTab(container);
          }
        } finally {
          addPriceLocked = false;
        }
      })();
    };

    const fileInput = container.querySelector("#upload-price-file");
    let uploadLocked = false;
    container.querySelector("#upload-price").onclick = () => {
      if (uploadLocked) {
        toast("Upload in progress...", "info");
        return;
      }
      fileInput.click();
    };

    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (uploadLocked) {
        toast("Upload already in progress", "warning");
        return;
      }
      uploadLocked = true;
      fileInput.value = "";
      toast(`Reading ${file.name}...`, "info");
      try {
        const rows = await readSheetAsRows(file);
        if (!rows.length) {
          toast("File is empty", "warning");
          return;
        }
        const { inserted, skipped } = await importServiceRows(rows);
        if (inserted)
          toast(
            `Imported ${inserted} service${inserted === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}`,
            "success",
          );
        else
          toast(
            `No rows imported${skipped ? ` — ${skipped} skipped` : ""}`,
            "warning",
          );
        renderPricingTab(container);
      } catch (err) {
        console.error("[pricing import] failed", err);
        toast(err.message || "Failed to read file", "error");
      } finally {
        uploadLocked = false;
      }
    };

    container.querySelector("#dl-template").onclick = downloadTemplateCSV;
    container.querySelector("#admin-pricing-export").onclick = () => {
      if (!visibleRows.length) {
        toast("No services to export", "warning");
        return;
      }
      const main =
        mainSel.value === "all"
          ? "all-main-categories"
          : mainSel.value
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
      exportToCSV(
        `service-pricing-${main}.csv`,
        visibleRows.map((x) => ({
          main_category: x.category || "Service",
          sub_category: x.sub_category || "",
          service: x.sub_sub_category || x.name || "",
          price: Number(x.cost) || 0,
        })),
      );
    };

    setupRowHandlers();
    updateBulkActions();
  } catch (err) {
    console.error("[employee pricing] initialization failed:", err);
    container.innerHTML = `
      <div class="card" style="padding:32px;text-align:center;">
        <p style="color:var(--danger);margin:0;font-weight:600;">Could not load service pricing</p>
        <small style="color:var(--text-dim);">${escapeHtml(err?.message || "An unexpected error occurred")}</small>
      </div>
    `;
  }
}

async function ensureCompanyExists(companyName) {
  if (!companyName || !companyName.trim()) return;
  const nameTrim = companyName.trim();
  const { data, error } = await supabase.from("companies").select("id, name");
  if (error) {
    console.error("Error fetching companies in ensureCompanyExists:", error);
    return;
  }
  const exists = data.some(
    (c) => c.name.toLowerCase() === nameTrim.toLowerCase(),
  );
  if (!exists) {
    const id =
      (window.crypto?.randomUUID && window.crypto.randomUUID()) ||
      `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { error: insErr } = await supabase
      .from("companies")
      .insert({ id, name: nameTrim });
    if (insErr) {
      console.error("Error inserting company in ensureCompanyExists:", insErr);
    }
  }
}

function generateEmployeeTicketNo() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `NE-${yy}${mm}${dd}-${rnd}`;
}

export async function renderFeedbackTab(container) {
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase
      .from("inquiries")
      .select("*")
      .order("feedback_at", { ascending: false }),
    supabase.from("profiles").select("id,full_name,role"),
  ]);
  const all = (rows || []).filter((r) => r.feedback_rating != null);
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));
  const monthKey = new Date().toLocaleDateString("en-CA").slice(0, 7);
  const monthFeedback = all.filter((r) =>
    String(r.feedback_at || r.updated_at || "").startsWith(monthKey),
  );
  const empAgg = new Map();
  all.forEach((r) => {
    const empId = r.feedback_employee_id || r.assigned_employee_id;
    if (!empId) return;
    const score = r.employee_rating || r.feedback_rating;
    if (!score) return;
    if (!empAgg.has(empId))
      empAgg.set(empId, { total: 0, count: 0, fiveStars: 0 });
    const a = empAgg.get(empId);
    a.total += Number(score);
    a.count += 1;
    if (score >= 5) a.fiveStars += 1;
  });
  const empRows = [...empAgg.entries()]
    .map(([id, a]) => ({
      id,
      name: profileById.get(id)?.full_name || "—",
      avg: a.total / a.count,
      count: a.count,
      fiveStars: a.fiveStars,
    }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);
  const monthAgg = new Map();
  monthFeedback.forEach((r) => {
    const empId = r.feedback_employee_id || r.assigned_employee_id;
    if (!empId) return;
    const score = r.employee_rating || r.feedback_rating;
    if (!score) return;
    if (!monthAgg.has(empId))
      monthAgg.set(empId, { total: 0, count: 0, fiveStars: 0 });
    const a = monthAgg.get(empId);
    a.total += Number(score);
    a.count += 1;
    if (score >= 5) a.fiveStars += 1;
  });
  const monthEmpRows = [...monthAgg.entries()]
    .map(([id, a]) => ({
      id,
      name: profileById.get(id)?.full_name || "Employee",
      avg: a.total / a.count,
      count: a.count,
      fiveStars: a.fiveStars,
    }))
    .sort(
      (a, b) => b.avg - a.avg || b.count - a.count || b.fiveStars - a.fiveStars,
    );
  const employeeOfMonth = monthEmpRows[0] || null;
  const overallAvg = all.length
    ? all.reduce((s, r) => s + Number(r.feedback_rating || 0), 0) / all.length
    : 0;
  const fiveCount = all.filter((r) => r.feedback_rating >= 5).length;
  const starsHtml = (n) => {
    const v = Math.round(Number(n) || 0);
    return Array.from(
      { length: 5 },
      (_, i) =>
        `<span style="color:${i < v ? "var(--warning)" : "var(--border)"};display:inline-flex;width:14px;height:14px">${i < v ? ICONS.star : ICONS.starOutline}</span>`,
    ).join("");
  };
  container.innerHTML = `    <div class="page-header">      <h1>Client Feedback</h1>      <p>Ratings & comments submitted by clients after service completion</p>    </div>    <div class="stats-grid">      <div class="stat-card"><div class="stat-value">${all.length}</div><div class="stat-label">Total Reviews</div></div>      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${overallAvg.toFixed(2)} <span style="font-size:1rem">/ 5</span></div><div class="stat-label">Overall Average</div></div>      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${fiveCount}</div><div class="stat-label">5-Star Reviews</div></div>      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${empRows.length}</div><div class="stat-label">Employees Rated</div></div>      <div class="stat-card"><div class="stat-value" style="color:var(--warning);font-size:1.55rem">${employeeOfMonth ? escapeHtml(employeeOfMonth.name) : "-"}</div><div class="stat-label">Employee of Month</div></div>    </div>    <div class="card">      <div class="card-header"><span class="card-title">Employee Leaderboard</span></div>      <div class="table-wrap">        <table>          <thead><tr><th>Employee</th><th>Average</th><th>Reviews</th><th>5?</th></tr></thead>          <tbody>            ${empRows.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-dim)">No employee-specific ratings yet</td></tr>' : empRows.map((e) => `<tr>                <td><b>${e.name}</b></td>                <td>${starsHtml(e.avg)} <span style="margin-left:6px;font-weight:700">${e.avg.toFixed(2)}</span></td>                <td>${e.count}</td>                <td><span class="badge badge-resolved">${e.fiveStars}</span></td>              </tr>`).join("")}          </tbody>        </table>      </div>    </div>    <div class="card" style="margin-top:24px">      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">        <span class="card-title">All Reviews</span>        <div class="search-input-wrap" style="min-width:200px;max-width:320px;">          <span>${ICONS.search}</span>          <input class="search-input" id="fb-search" placeholder="Filter by name or ticket…" style="padding:6px 10px;font-size:0.85rem;"/>        </div>      </div>      <div class="table-wrap">        <table id="fb-table">          <thead><tr><th>Date</th><th>Ticket</th><th>Client</th><th>Employee</th><th>Overall</th><th>Employee</th><th>Comment</th></tr></thead>          <tbody>            ${
    all.length === 0
      ? '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No feedback received yet</td></tr>'
      : all
          .map((r) => {
            const empName =
              profileById.get(r.feedback_employee_id || r.assigned_employee_id)
                ?.full_name || "—";
            const empStars = r.employee_rating
              ? `${starsHtml(r.employee_rating)} <b style="margin-left:4px">${r.employee_rating}</b>`
              : '<span style="color:var(--text-dim)">—</span>';
            return `<tr data-search="${(r.full_name + " " + (r.ticket_no || "") + " " + empName).toLowerCase()}">                  <td><small>${r.feedback_at ? formatDate(r.feedback_at) : "—"}</small></td>                  <td><code style="font-size:0.75rem;color:var(--primary)">${r.ticket_no || "—"}</code></td>                  <td><b>${r.full_name}</b></td>                  <td>${empName}</td>                  <td>${starsHtml(r.feedback_rating)} <b style="margin-left:4px">${r.feedback_rating}</b></td>                  <td>${empStars}</td>                  <td style="max-width:340px;white-space:normal;font-size:.85rem;line-height:1.45;color:var(--text-soft)">${r.feedback_comment || '<span style="color:var(--text-dim)">—</span>'}</td>                </tr>`;
          })
          .join("")
  }          </tbody>        </table>      </div>    </div>  `;
  const search = container.querySelector("#fb-search");
  if (search) {
    search.oninput = () => {
      const q = search.value.toLowerCase();
      container
        .querySelectorAll("#fb-table tbody tr[data-search]")
        .forEach((r) => {
          r.style.display = r.dataset.search.includes(q) ? "" : "none";
        });
    };
  }
  const channel = supabase
    .channel("admin-feedback")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "inquiries" },
      (payload) => {
        if (payload.new?.feedback_rating != null) renderFeedbackTab(container);
      },
    )
    .subscribe();
  const cleanup = setInterval(() => {
    if (!document.body.contains(container)) {
      supabase.removeChannel(channel);
      clearInterval(cleanup);
    }
  }, 5000);
}
function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export async function renderComplaintsTab(container) {
  container.innerHTML = `<div class="page-header"><h1>Complaints</h1><p>Loading…</p></div>`;
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    container.innerHTML = `<div class="page-header"><h1>Complaints</h1><p style="color:var(--danger)">Could not load complaints: ${escapeHtml(error.message || "")}</p></div>`;
    return;
  }
  const rows = data || [];
  const open = rows.filter((r) => r.status === "open").length;
  const resolved = rows.filter((r) => r.status === "resolved").length;
  const statusBadgeFor = (s) =>
    s === "resolved"
      ? `<span class="badge badge-resolved">Resolved</span>`
      : s === "in_progress"
        ? `<span class="badge badge-in_progress">In Progress</span>`
        : `<span class="badge badge-danger">Open</span>`;
  container.innerHTML = `    <div class="page-header">      <h1>Complaints</h1>      <p>Customer complaints filed against existing tickets via the public portal</p>    </div>    <div class="stats-grid">      <div class="stat-card"><div class="stat-value">${rows.length}</div><div class="stat-label">Total Complaints</div></div>      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${open}</div><div class="stat-label">Open</div></div>      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${resolved}</div><div class="stat-label">Resolved</div></div>    </div>    <div class="card" style="margin-top:24px">      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">        <span class="card-title">All Complaints</span>        <div class="search-input-wrap" style="min-width:200px;max-width:320px;">          <span>${ICONS.search}</span>          <input class="search-input" id="cmp-search" placeholder="Filter by ticket or phone…" style="padding:6px 10px;font-size:0.85rem;"/>        </div>      </div>      <div class="table-wrap">        <table id="cmp-table">          <thead><tr><th>Filed</th><th>Ticket</th><th>Phone</th><th>Complaint</th><th>Status</th><th>Response</th><th>Actions</th></tr></thead>          <tbody>            ${rows.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No complaints filed yet</td></tr>` : rows.map((r) => `                <tr data-search="${escapeHtml(((r.ticket_no || "") + " " + (r.phone || "")).toLowerCase())}">                  <td><small>${r.created_at ? formatDateTime(r.created_at) : "—"}</small></td>                  <td><code style="font-size:0.75rem;color:var(--primary)">${escapeHtml(r.ticket_no || "—")}</code></td>                  <td><small>${escapeHtml(r.phone || "—")}</small></td>                  <td style="max-width:360px;white-space:normal;font-size:.85rem;line-height:1.45;color:var(--text-soft)">${escapeHtml(r.complaint_text || "")}</td>                  <td>${statusBadgeFor(r.status)}</td>                  <td style="max-width:260px;white-space:normal;font-size:.82rem;color:var(--text-soft)">${r.admin_response ? escapeHtml(r.admin_response) : '<span style="color:var(--text-dim)">—</span>'}</td>                  <td>                    <button class="btn btn-secondary btn-sm cmp-respond-btn" data-id="${r.id}">${r.status === "resolved" ? "View" : "Respond"}</button>                  </td>                </tr>`).join("")}          </tbody>        </table>      </div>    </div>  `;
  const search = container.querySelector("#cmp-search");
  if (search) {
    search.oninput = () => {
      const q = search.value.toLowerCase();
      container
        .querySelectorAll("#cmp-table tbody tr[data-search]")
        .forEach((r) => {
          r.style.display = r.dataset.search.includes(q) ? "" : "none";
        });
    };
  }
  container.querySelectorAll(".cmp-respond-btn").forEach((btn) => {
    btn.onclick = () =>
      openComplaintResponder(
        rows.find((r) => r.id === btn.dataset.id),
        () => renderComplaintsTab(container),
      );
  });
  const channel = supabase
    .channel("admin-complaints")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "complaints" },
      () => renderComplaintsTab(container),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "complaints" },
      () => renderComplaintsTab(container),
    )
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
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `    <div class="modal" style="max-width:560px">      <div class="modal-header">        <span class="modal-title">Complaint on ${escapeHtml(complaint.ticket_no)}</span>        <button class="modal-close">×</button>      </div>      <div style="padding:0 24px 12px;color:var(--text-soft);font-size:0.85rem;">From ${escapeHtml(complaint.phone)} · ${formatDateTime(complaint.created_at)}</div>      <div class="modal-body">        <div style="background:var(--bg-soft);padding:14px;border-radius:12px;font-size:0.9rem;line-height:1.5;color:var(--text);margin-bottom:18px;">          ${escapeHtml(complaint.complaint_text)}        </div>        <label class="srf-label" style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Customer response (sent via SMS)</label>        <textarea id="cmp-response" rows="4" placeholder="What did we do or say in reply?" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;resize:vertical;">${escapeHtml(complaint.admin_response || "")}</textarea>        <div style="margin-top:6px;font-size:0.78rem;color:var(--text-dim);line-height:1.4;">          ${complaint.admin_response ? `SMS already delivered to <b>${escapeHtml(complaint.phone || "")}</b>. Editing the text and saving will re-send.` : `No SMS has been sent yet. The customer will receive an SMS the moment you save a non-empty response.`}        </div>        <label style="display:block;font-weight:700;font-size:0.85rem;margin:14px 0 6px;">Status</label>        <select id="cmp-status" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;">          <option value="open" ${complaint.status === "open" ? "selected" : ""}>Open</option>          <option value="in_progress" ${complaint.status === "in_progress" ? "selected" : ""}>In Progress</option>          <option value="resolved" ${complaint.status === "resolved" ? "selected" : ""}>Resolved</option>        </select>      </div>      <div class="modal-footer">        <button class="btn btn-secondary" id="cmp-cancel">Cancel</button>        <button class="btn btn-primary" id="cmp-save">Save</button>      </div>    </div>  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".modal-close").onclick = close;
  overlay.querySelector("#cmp-cancel").onclick = close;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector("#cmp-save").onclick = async () => {
    const response = overlay.querySelector("#cmp-response").value.trim();
    const status = overlay.querySelector("#cmp-status").value;
    const prevResponse = (complaint.admin_response || "").trim();
    const updates = { status };
    if (response !== prevResponse) {
      updates.admin_response = response || null;
    }
    if (status === "resolved" && !complaint.resolved_at) {
      updates.resolved_at = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
    }
    const saveBtn = overlay.querySelector("#cmp-save");
    const restore = setButtonLoading(saveBtn, "Saving");
    const { data, error } = await supabase
      .from("complaints")
      .update(updates)
      .eq("id", complaint.id);
    restore();
    if (error) {
      toast("Could not save: " + (error.message || ""), "error");
      return;
    }
    if (updates.admin_response && data?.sms?.ok === false) {
      toast(
        `Response saved, but SMS failed: ${data.sms.error || "provider rejected it"}`,
        "error",
      );
    } else {
      toast(
        updates.admin_response
          ? "Response saved and SMS sent"
          : "Complaint updated",
        "success",
      );
    }
    close();
    if (onChange) onChange();
  };
}
export async function renderAdsTab(container) {
  container.innerHTML = `<div class="page-header"><h1>Landing Page Ads</h1><p>Loading…</p></div>`;
  const { data, error } = await supabase
    .from("ads")
    .select("*")
    .order("position", { ascending: true });
  if (error) {
    container.innerHTML = `<div class="page-header"><h1>Landing Page Ads</h1><p style="color:var(--danger)">Could not load ads: ${escapeHtml(error.message || "")}</p></div>`;
    return;
  }
  const ads = (data || []).filter((a) => !a.placement || a.placement === "landing");
  const activeCount = ads.filter((a) => a.active).length;
  container.innerHTML = `    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;">      <div>        <h1>Landing Page Ads</h1>        <p>Slides shown in the rotating carousel on the public service portal</p>      </div>      <button class="btn btn-primary" id="ad-add-btn">+ Add slide</button>    </div>    <div class="stats-grid">      <div class="stat-card"><div class="stat-value">${ads.length}</div><div class="stat-label">Total Slides</div></div>      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${activeCount}</div><div class="stat-label">Active</div></div>      <div class="stat-card"><div class="stat-value" style="color:var(--text-dim)">${ads.length - activeCount}</div><div class="stat-label">Hidden</div></div>    </div>    <div class="card" style="margin-top:24px">      <div class="card-header"><span class="card-title">Slides (drag order via Position field)</span></div>      <div class="table-wrap">        <table>          <thead><tr><th style="width:60px">Pos</th><th>Preview</th><th>Kind</th><th>Caption</th><th>Duration</th><th>Status</th><th style="width:200px">Actions</th></tr></thead>          <tbody>            ${ads.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No ads yet — click "Add slide" to create your first one</td></tr>` : ads.map((a) => `                <tr>                  <td><b>${a.position ?? 0}</b></td>                  <td>                    ${a.kind === "video" ? `<video src="${escapeHtml(a.url)}" muted style="width:120px;height:68px;object-fit:cover;border-radius:8px;background:var(--bg-soft);" onmouseover="this.play()" onmouseout="this.pause()"></video>` : `<img src="${escapeHtml(a.url)}" alt="" style="width:120px;height:68px;object-fit:cover;border-radius:8px;background:var(--bg-soft);" loading="lazy"/>`}                  </td>                  <td><span class="badge ${a.kind === "video" ? "badge-in_progress" : "badge-resolved"}">${a.kind}</span></td>                  <td style="max-width:240px;white-space:normal;font-size:0.85rem;color:var(--text-soft)">${escapeHtml(a.caption || "")}</td>                  <td><small>${((Number(a.duration_ms) || 6000) / 1000).toFixed(1)}s</small></td>                  <td>                    <div style="font-size:0.75rem; color:var(--text-soft)">                      <div><b>Start:</b> ${a.starts_at ? new Date(a.starts_at).toLocaleString() : "Now"}</div>                      <div><b>End:</b> ${a.expires_at ? new Date(a.expires_at).toLocaleString() : "Never"}</div>                    </div>                  </td>                  <td>${a.active ? '<span class="badge badge-resolved">Active</span>' : '<span class="badge badge-danger">Hidden</span>'}</td>                  <td>                    <button class="btn btn-secondary btn-sm ad-edit-btn" data-id="${a.id}">Edit</button>                    <button class="btn btn-secondary btn-sm ad-toggle-btn" data-id="${a.id}">${a.active ? "Hide" : "Show"}</button>                    <button class="btn btn-secondary btn-sm ad-delete-btn" data-id="${a.id}" style="color:var(--danger)">Delete</button>                  </td>                </tr>`).join("")}          </tbody>        </table>      </div>    </div>  `;
  const guide = document.createElement("div");
  guide.className = "card";
  guide.style.margin = "0 0 24px";
  guide.innerHTML = `
    <div class="card-header"><span class="card-title">Required Resolution For Landing Ads</span></div>
    <div class="card-body">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;">
        <div style="padding:12px;border-radius:8px;background:var(--bg-soft);border:1px solid var(--border);">
          <div style="font-weight:800;color:var(--primary);">Desktop landing ad</div>
          <div style="font-size:1.05rem;font-weight:900;margin-top:4px;">1600px x 1200px</div>
          <small style="color:var(--text-dim);">Use for the larger desktop ad box beside the request form.</small>
        </div>
        <div style="padding:12px;border-radius:8px;background:var(--bg-soft);border:1px solid var(--border);">
          <div style="font-weight:800;color:var(--primary);">Mobile landing ad</div>
          <div style="font-size:1.05rem;font-weight:900;margin-top:4px;">1080px x 1350px</div>
          <small style="color:var(--text-dim);">Use for the mobile ad box below the request tabs.</small>
        </div>
        <div style="padding:12px;border-radius:8px;background:var(--bg-soft);border:1px solid var(--border);">
          <div style="font-weight:800;color:var(--primary);">Square logo/icon</div>
          <div style="font-size:1.05rem;font-weight:900;margin-top:4px;">512px x 512px</div>
          <small style="color:var(--text-dim);">Use for small logo or square popup images.</small>
        </div>
        <div style="padding:12px;border-radius:8px;background:var(--bg-soft);border:1px solid var(--border);">
          <div style="font-weight:800;color:var(--primary);">Popup ads</div>
          <div style="font-size:1.05rem;font-weight:900;margin-top:4px;">1200px x 800px</div>
          <small style="color:var(--text-dim);">Use Popup Ads tab for overlay images/videos.</small>
        </div>
      </div>
      <p style="margin:12px 0 0;color:var(--text-soft);font-size:0.9rem;">Desktop inline ads now use a taller 4:3 space. Keep important text, logo, and faces in the center area so cropping stays clean.</p>
    </div>
  `;
  container.querySelector(".stats-grid")?.before(guide);
  const refresh = () => renderAdsTab(container);
  container.querySelector("#ad-add-btn").onclick = () =>
    openAdEditor(null, refresh);
  container.querySelectorAll(".ad-edit-btn").forEach((btn) => {
    btn.onclick = () =>
      openAdEditor(
        ads.find((a) => a.id === btn.dataset.id),
        refresh,
      );
  });
  container.querySelectorAll(".ad-toggle-btn").forEach((btn) => {
    btn.onclick = async () => {
      const ad = ads.find((a) => a.id === btn.dataset.id);
      const { error } = await supabase
        .from("ads")
        .update({ active: ad.active ? 0 : 1 })
        .eq("id", ad.id);
      if (error)
        return toast("Could not update: " + (error.message || ""), "error");
      toast(ad.active ? "Slide hidden" : "Slide shown", "success");
      refresh();
    };
  });
  container.querySelectorAll(".ad-delete-btn").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Delete this slide? This cannot be undone.")) return;
      const { error } = await supabase
        .from("ads")
        .delete()
        .eq("id", btn.dataset.id);
      if (error)
        return toast("Could not delete: " + (error.message || ""), "error");
      toast("Slide deleted", "success");
      refresh();
    };
  });
}
function openAdEditor(ad, onChange) {
  const editing = !!ad;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `    <div class="modal" style="max-width:560px">      <div class="modal-header">        <span class="modal-title">${editing ? "Edit slide" : "Add slide"}</span>        <button class="modal-close">×</button>      </div>      <div class="modal-body">        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Slide type</label>        <div style="display:flex;gap:8px;margin-bottom:14px;">          <label style="flex:1;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;text-align:center;font-weight:700;">            <input type="radio" name="ad-kind" value="image" ${!ad || ad.kind === "image" ? "checked" : ""} style="margin-right:6px"/> Image          </label>          <label style="flex:1;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;text-align:center;font-weight:700;">            <input type="radio" name="ad-kind" value="video" ${ad?.kind === "video" ? "checked" : ""} style="margin-right:6px"/> Video          </label>        </div>        <div style="margin-bottom:14px;">          <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Media Source</label>          <div style="display:flex;gap:8px;margin-bottom:8px;">            <label style="font-size:0.85rem;cursor:pointer;"><input type="radio" name="media-source" value="upload" checked> Upload File</label>            <label style="font-size:0.85rem;cursor:pointer;"><input type="radio" name="media-source" value="url"> Enter URL</label>          </div>                    <div id="media-upload-div">            <input type="file" id="ad-file" accept="image/*,video/*" style="width:100%;padding:8px;border-radius:10px;border:1px dashed var(--border);background:var(--bg);font-size:0.9rem;" />          </div>          <div id="media-url-div" style="display:none;">            <input id="ad-url" type="url" placeholder="https://…/image.jpg or https://…/video.mp4"                   value="${escapeHtml(ad?.url || "")}"                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>          </div>          ${ad?.url ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;overflow:hidden;text-overflow:ellipsis;">Current URL: <a href="${escapeHtml(ad.url)}" target="_blank" style="color:var(--primary)">${escapeHtml(ad.url)}</a></div>` : ""}        </div>        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Caption <span style="color:var(--text-dim);font-weight:500">(optional, max 255 chars)</span></label>        <input id="ad-caption" type="text" maxlength="255" placeholder="Short overlay text"               value="${escapeHtml(ad?.caption || "")}"               style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;margin-bottom:14px;"/>        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Show on device</label>        <select id="ad-device-target" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;margin-bottom:14px;">          <option value="both" ${!ad?.device_target || ad.device_target === "both" ? "selected" : ""}>Both mobile and desktop</option>          <option value="desktop" ${ad?.device_target === "desktop" ? "selected" : ""}>Desktop only</option>          <option value="mobile" ${ad?.device_target === "mobile" ? "selected" : ""}>Mobile only</option>        </select>        <small style="display:block;margin-bottom:14px;color:var(--text-dim);font-size:0.8rem;">Landing ads auto-fit the visitor screen. Best uploads: desktop 1600 x 1200, mobile 1080 x 1350. Images and videos crop from the center if needed.</small>        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">          <div>            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Duration (seconds)</label>            <input id="ad-duration" type="number" min="2" max="60" step="0.5"                   value="${ad ? (Number(ad.duration_ms) || 6000) / 1000 : 6}"                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>          </div>          <div>            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Position</label>            <input id="ad-position" type="number" min="0" step="1"                   value="${ad?.position ?? 0}"                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>          </div>        </div>        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">          <div>            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Starts At (optional)</label>            <input id="ad-starts" type="datetime-local"                   value="${ad?.starts_at ? new Date(new Date(ad.starts_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}"                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>          </div>          <div>            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Expires At (optional)</label>            <input id="ad-expires" type="datetime-local"                   value="${ad?.expires_at ? new Date(new Date(ad.expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}"                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>          </div>        </div>        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.9rem;">          <input id="ad-active" type="checkbox" ${!ad || ad.active ? "checked" : ""}/>          Active (show on landing page)        </label>      </div>      <div class="modal-footer">        <button class="btn btn-secondary" id="ad-cancel">Cancel</button>        <button class="btn btn-primary" id="ad-save">${editing ? "Save" : "Add slide"}</button>      </div>    </div>  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".modal-close").onclick = close;
  overlay.querySelector("#ad-cancel").onclick = close;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll('input[name="media-source"]').forEach((r) => {
    r.onchange = () => {
      overlay.querySelector("#media-upload-div").style.display =
        r.value === "upload" ? "block" : "none";
      overlay.querySelector("#media-url-div").style.display =
        r.value === "url" ? "block" : "none";
    };
  });
  overlay.querySelector("#ad-save").onclick = async () => {
    const kind = overlay.querySelector('input[name="ad-kind"]:checked').value;
    const caption = overlay.querySelector("#ad-caption").value.trim();
    const durationSec = parseFloat(overlay.querySelector("#ad-duration").value);
    const position =
      parseInt(overlay.querySelector("#ad-position").value, 10) || 0;
    const startsAt = overlay.querySelector("#ad-starts").value;
    const expiresAt = overlay.querySelector("#ad-expires").value;
    const active = overlay.querySelector("#ad-active").checked ? 1 : 0;
    const deviceTarget = overlay.querySelector("#ad-device-target")?.value || "both";
    let url = overlay.querySelector("#ad-url").value.trim();
    const radioUpload = overlay.querySelector(
      'input[name="media-source"][value="upload"]',
    ).checked;
    const fileInput = overlay.querySelector("#ad-file");
    if (radioUpload && fileInput.files.length > 0) {
      const btn = overlay.querySelector("#ad-save");
      btn.disabled = true;
      btn.textContent = "Uploading...";
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      try {
        const isProd =
          window.location.hostname !== "localhost" &&
          window.location.hostname !== "127.0.0.1";
        const apiUrl = isProd
          ? "/api/upload"
          : "http://localhost:5000/api/upload";
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        url = data.url;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = editing ? "Save" : "Add slide";
        return toast(err.message, "error");
      }
    }
    if (!url) {
      if (ad?.url) {
        url = ad.url;
      } else {
        return toast("Media File or URL is required", "error");
      }
    }
    if (!/^https?:\/\//i.test(url) && !url.startsWith("/uploads/"))
      return toast("URL must start with http(s):// or /uploads/", "error");
    if (!Number.isFinite(durationSec) || durationSec < 2)
      return toast("Duration must be at least 2 seconds", "error");
    const payload = {
      kind,
      url,
      caption: caption || null,
      placement: "landing",
      device_target: deviceTarget,
      duration_ms: Math.round(durationSec * 1000),
      position,
      starts_at: startsAt
        ? new Date(startsAt).toISOString().slice(0, 19).replace("T", " ")
        : null,
      expires_at: expiresAt
        ? new Date(expiresAt).toISOString().slice(0, 19).replace("T", " ")
        : null,
      active,
    };
    let res;
    if (editing) {
      res = await supabase.from("ads").update(payload).eq("id", ad.id);
    } else {
      res = await supabase.from("ads").insert(payload);
    }
    if (res.error)
      return toast("Could not save: " + (res.error.message || ""), "error");
    toast(editing ? "Slide updated" : "Slide added", "success");
    close();
    if (onChange) onChange();
  };
}
export async function renderEmployeePricingTab(container) {
  try {
    const session = await supabase.auth.getSession();
    const user = session?.data?.session?.user;
    if (!user) {
      container.innerHTML =
        '<p style="color:var(--danger)">? Authentication required</p>';
      return;
    }
    const { data: pricing, error } = await supabase
      .from("service_pricing")
      .select("*")
      .order("category");
    if (error) {
      console.error("[employee pricing] fetch failed:", error);
      container.innerHTML = `        <div class="card" style="padding:32px;text-align:center;">          <p style="color:var(--danger);margin:0;font-weight:600;">Cannot load service pricing</p>          <small style="color:var(--text-dim);">${error.message || "Permission denied or server error"}</small>          <p style="margin-top:16px;font-size:0.9rem;color:var(--text-dim);">Please contact your admin if this persists</p>        </div>      `;
      return;
    }
    const list = pricing || [];
    const mainCategories = [
      ...new Set(list.map((x) => x.category || "Service")),
    ].sort();
    const subCategories = [
      ...new Set(list.map((x) => x.sub_category || "").filter(Boolean)),
    ].sort();
    container.innerHTML = `    <div class="page-header">      <div>        <h1>${ICONS.receipt} Service Pricing</h1>        <p>View and manage service pricing for your work</p>      </div>    </div>    <div class="card" style="margin-bottom:12px; padding:12px 16px; font-size:13px; border-left:4px solid var(--info);">      <b>Note:</b> You can only view pricing items assigned to you by your admin.    </div>    <div class="card">      <div class="table-wrap">        <table>          <thead>            <tr>              <th>Main Category</th><th>Sub Category</th><th>Sub-Sub Category</th><th>Price</th>            </tr>          </thead>          <tbody>            ${list.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-dim)">No services assigned yet</td></tr>' : list.map((x) => `              <tr>                <td><span class="badge badge-open">${x.category || "Service"}</span></td>                <td>${x.sub_category || '<span style="color:var(--text-dim)">—</span>'}</td>                <td><b>${x.sub_sub_category || x.name || ""}</b></td>                <td>\u20B9${Number(x.cost).toLocaleString("en-IN")}</td>              </tr>            `).join("")}          </tbody>        </table>      </div>    </div>  `;
  } catch (err) {
    console.error("[employee pricing] initialization failed:", err);
    container.innerHTML = `      <div class="card" style="padding:32px;text-align:center;">        <p style="color:var(--danger);margin:0;font-weight:600;">Error Loading Service Pricing</p>        <small style="color:var(--text-dim);">${err?.message || "An unexpected error occurred"}</small>      </div>    `;
  }
}
export async function renderSettingsTab(container) {
  const settingsApiBase =
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
      ? "/api"
      : "http://localhost:5000/api";
  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
  });
  let autoClockOutTime = "18:00";
  let registrationKeys = { admin: "", employee: "" };
  let popupEnabled = true;
  let deviceTrackingEnabled = true;
  let reopenLimit = 2;
  let reopenButtonEnabled = true;
  try {
    const [attendanceRes, keysRes, popupRes, deviceRes, reopenRes] = await Promise.all([
      fetch(`${settingsApiBase}/settings/attendance`, {
        headers: authHeaders(),
      }),
      fetch(`${settingsApiBase}/settings/registration-keys`, {
        headers: authHeaders(),
      }),
      fetch(`${settingsApiBase}/settings/popup`, {
        headers: authHeaders(),
      }),
      fetch(`${settingsApiBase}/settings/device-tracking`, {
        headers: authHeaders(),
      }),
      fetch(`${settingsApiBase}/settings/reopen`, {
        headers: authHeaders(),
      }),
    ]);
    if (attendanceRes.ok) {
      const data = await attendanceRes.json();
      autoClockOutTime = data.autoClockOutTime || autoClockOutTime;
    }
    if (keysRes.ok) {
      registrationKeys = await keysRes.json();
    }
    if (popupRes.ok) {
      const data = await popupRes.json();
      popupEnabled = data.enabled !== false;
    }
    if (deviceRes.ok) {
      const data = await deviceRes.json();
      deviceTrackingEnabled = data.enabled !== false;
    }
    if (reopenRes.ok) {
      const data = await reopenRes.json();
      if (typeof data.limit === "number") reopenLimit = data.limit;
      reopenButtonEnabled = data.button_enabled !== false;
    }
  } catch (err) {
    console.warn("[settings] could not load settings", err);
  }
  const [{ data: attendance }, { data: eodReports }] = await Promise.all([
    supabase.from("attendance").select("user_id,clock_in,clock_out,date"),
    supabase.from("eod_reports").select("employee_id,date,created_at"),
  ]);
  const missedByEmployee = groupedMissedEods(
    attendance || [],
    eodReports || [],
  );
  const restrictedEmployees = Array.from(missedByEmployee.entries())
    .filter(([, rows]) => rows.length >= STRICT_EOD_LIMIT)
    .map(([userId]) => userId);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,full_name,role")
    .eq("role", "employee");
  const restrictedProfiles = (profiles || []).filter((p) =>
    restrictedEmployees.includes(p.id),
  );
  container.innerHTML = `
    <div class="page-header settings-header">
      <div class="settings-title-wrap">
        <span class="settings-title-icon">${ICONS.settings}</span>
        <div>
          <h1>Settings</h1>
          <p>Configure system preferences and manage attendance restrictions.</p>
        </div>
      </div>
    </div>

    <div class="settings-grid">
      <div class="settings-card">
        <div class="settings-card-head">
          <span class="settings-card-icon">${ICONS.shield}</span>
          <div>
            <h3>Registration Secret Keys</h3>
            <p>Control who can create employee and admin accounts.</p>
          </div>
        </div>

        <div class="settings-alert settings-alert-info">
          <span>${ICONS.alert}</span>
          <small>Regenerating a key immediately invalidates the old key for new signups.</small>
        </div>

        <div class="reg-key-list">
          <div class="reg-key-row">
            <label>Employee signup key</label>
            <div class="reg-key-control">
              <input id="employee-reg-key" type="password" readonly value="${escapeAttr(registrationKeys.employee || "")}" placeholder="Not configured">
              <button class="btn btn-secondary btn-sm reg-key-toggle" data-target="employee-reg-key">${ICONS.eye}</button>
              <button class="btn btn-secondary btn-sm reg-key-copy" data-target="employee-reg-key">${ICONS.clipboard}<span>Copy</span></button>
              <button class="btn btn-primary btn-sm reg-key-regenerate" data-role="employee">${ICONS.refresh}<span>Regenerate</span></button>
            </div>
          </div>
          <div class="reg-key-row">
            <label>Admin signup key</label>
            <div class="reg-key-control">
              <input id="admin-reg-key" type="password" readonly value="${escapeAttr(registrationKeys.admin || "")}" placeholder="Not configured">
              <button class="btn btn-secondary btn-sm reg-key-toggle" data-target="admin-reg-key">${ICONS.eye}</button>
              <button class="btn btn-secondary btn-sm reg-key-copy" data-target="admin-reg-key">${ICONS.clipboard}<span>Copy</span></button>
              <button class="btn btn-primary btn-sm reg-key-regenerate" data-role="admin">${ICONS.refresh}<span>Regenerate</span></button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-head">
          <span class="settings-card-icon">${ICONS.clock}</span>
          <div>
            <h3>Auto Clock-Out Time</h3>
            <p>Set the daily fallback clock-out time for active employees.</p>
          </div>
        </div>

        <div class="settings-alert settings-alert-danger">
          <span>${ICONS.alert}</span>
          <small>Changing this affects all employees globally. Changes apply to the server job immediately.</small>
        </div>

        <div class="settings-form-row">
          <label class="sr-only" for="auto-clockout-time">Auto clock-out time</label>
          <input type="time" id="auto-clockout-time" value="${autoClockOutTime}" class="settings-time-input">
          <button class="btn btn-primary settings-save-btn" id="save-clockout-time">
            ${ICONS.check}
            <span>Save Time</span>
          </button>
        </div>

        <p class="settings-helper">
          Employees clocked in after this time will be auto-clocked out. Current: <b id="current-clockout-time">${autoClockOutTime}</b>
        </p>
      </div>

      <div class="settings-card">
        <div class="settings-card-head">
          <span class="settings-card-icon">${ICONS.alert}</span>
          <div>
            <h3>Landing Page Popup</h3>
            <p>Enable or disable the popup advertisements on the landing page.</p>
          </div>
        </div>

        <div class="settings-alert settings-alert-info">
          <span>${ICONS.alert}</span>
          <small>Toggle on to show popup ads, off to hide them.</small>
        </div>

        <div class="settings-form-row" style="align-items: center; gap: 16px;">
          <label style="margin: 0; display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="popup-toggle" ${popupEnabled ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
            <span>${popupEnabled ? 'Popup Enabled' : 'Popup Disabled'}</span>
          </label>
          <button class="btn btn-primary settings-save-btn" id="save-popup-toggle">
            ${ICONS.check}
            <span>Save Setting</span>
          </button>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-head">
          <span class="settings-card-icon">${ICONS.wrench}</span>
          <div>
            <h3>Device Service Tracking</h3>
            <p>Master switch for the device-to-service-center workflow (employee popup tab, follow-ups, and "Devices in Service" containers).</p>
          </div>
        </div>

        <div class="settings-alert settings-alert-info">
          <span>${ICONS.alert}</span>
          <small>When off, the device toggle, follow-up tab, and device containers are hidden for everyone.</small>
        </div>

        <div class="settings-form-row" style="align-items: center; gap: 16px;">
          <label style="margin: 0; display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="device-tracking-toggle" ${deviceTrackingEnabled ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
            <span>${deviceTrackingEnabled ? 'Device Tracking Enabled' : 'Device Tracking Disabled'}</span>
          </label>
          <button class="btn btn-primary settings-save-btn" id="save-device-tracking-toggle">
            ${ICONS.check}
            <span>Save Setting</span>
          </button>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-head">
          <span class="settings-card-icon">${ICONS.refresh}</span>
          <div>
            <h3>Ticket Reopen Policy</h3>
            <p>Control how many times a customer can reopen one ticket ("Issue not resolved"), and whether that button shows on the landing page.</p>
          </div>
        </div>

        <div class="settings-alert settings-alert-info">
          <span>${ICONS.alert}</span>
          <small>Limiting reopens avoids unnecessary repeat visits. Set the limit to 0 for unlimited reopens.</small>
        </div>

        <div class="settings-form-row" style="align-items:center; gap:16px; flex-wrap:wrap;">
          <label style="margin:0; display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="reopen-button-toggle" ${reopenButtonEnabled ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;">
            <span>${reopenButtonEnabled ? 'Reopen button visible' : 'Reopen button hidden'}</span>
          </label>
          <label style="margin:0; display:flex; align-items:center; gap:8px;">
            <span>Max reopens per ticket</span>
            <input type="number" id="reopen-limit-input" min="0" max="99" value="${Number(reopenLimit)}" class="settings-time-input" style="width:90px;">
          </label>
          <button class="btn btn-primary settings-save-btn" id="save-reopen-policy">
            ${ICONS.check}
            <span>Save Setting</span>
          </button>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-head">
          <span class="settings-card-icon settings-card-icon-danger">${ICONS.block}</span>
          <div>
            <h3>Restrictions (${restrictedProfiles.length})</h3>
            <p>Employees with repeated missed EOD reports are blocked from clocking in.</p>
          </div>
        </div>

        <div class="settings-alert settings-alert-info">
          <span>${ICONS.alert}</span>
          <small>Employees with 4+ missed EOD reports cannot clock in.</small>
        </div>

        ${
          restrictedProfiles.length === 0
            ? `<div class="settings-empty">
              <span>${ICONS.check}</span>
              <p>No restricted employees</p>
            </div>`
            : `<div class="settings-restriction-list">
              ${restrictedProfiles
                .map(
                  (p) => `
                <div class="settings-restriction-row">
                  <div class="settings-employee">
                    <span class="settings-employee-avatar">${(p.full_name || "E").trim().charAt(0).toUpperCase()}</span>
                    <div>
                      <b>${p.full_name}</b>
                      <small>${p.id.slice(0, 8)}...</small>
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-sm remove-restriction" data-id="${p.id}" data-name="${p.full_name}">
                    ${ICONS.refresh}
                    <span>Unlock</span>
                  </button>
                </div>
              `,
                )
                .join("")}
            </div>`
        }
      </div>
    </div>

    <div class="settings-notes">
      <span class="settings-notes-icon">${ICONS.alert}</span>
      <div>
        <b>Important Notes</b>
        <ul>
          <li>Auto clock-out time changes apply immediately on the server</li>
          <li>Unlocking employees clears the oldest missed EOD warning rows from the restriction count</li>
          <li>Changes are immediate but server must be running for them to apply</li>
        </ul>
      </div>
    </div>
  `;

  container.querySelector("#save-clockout-time").onclick = async () => {
    const timeInput = container.querySelector("#auto-clockout-time");
    const time = timeInput.value;
    if (!time) {
      toast("Please select a time", "warning");
      return;
    }
    const btn = container.querySelector("#save-clockout-time");
    const restore = setButtonLoading(btn, "Saving");
    try {
      const res = await fetch(`${settingsApiBase}/settings/attendance`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ autoClockOutTime: time }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || "Could not save clock-out time");
      autoClockOutTime = data.autoClockOutTime || time;
      timeInput.value = autoClockOutTime;
      const current = container.querySelector("#current-clockout-time");
      if (current) current.textContent = autoClockOutTime;
      toast(`Auto clock-out time saved: ${autoClockOutTime}`, "success");
    } catch (err) {
      toast(err.message || "Could not save clock-out time", "error");
    } finally {
      restore();
    }
  };

  container.querySelector("#save-popup-toggle").onclick = async () => {
    const toggle = container.querySelector("#popup-toggle");
    const enabled = toggle.checked;
    const btn = container.querySelector("#save-popup-toggle");
    const restore = setButtonLoading(btn, "Saving");
    try {
      const res = await fetch(`${settingsApiBase}/settings/popup`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || "Could not save popup setting");
      popupEnabled = enabled;
      toggle.checked = enabled;
      const label = toggle.parentElement;
      if (label) {
        const span = label.querySelector("span");
        if (span) span.textContent = enabled ? "Popup Enabled" : "Popup Disabled";
      }
      toast(`Popup ${enabled ? "enabled" : "disabled"}`, "success");
    } catch (err) {
      toast(err.message || "Could not save popup setting", "error");
      toggle.checked = popupEnabled;
    } finally {
      restore();
    }
  };

  container.querySelector("#save-device-tracking-toggle").onclick = async () => {
    const toggle = container.querySelector("#device-tracking-toggle");
    const enabled = toggle.checked;
    const btn = container.querySelector("#save-device-tracking-toggle");
    const restore = setButtonLoading(btn, "Saving");
    try {
      const res = await fetch(`${settingsApiBase}/settings/device-tracking`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || "Could not save device tracking setting");
      deviceTrackingEnabled = enabled;
      toggle.checked = enabled;
      const span = toggle.parentElement?.querySelector("span");
      if (span) span.textContent = enabled ? "Device Tracking Enabled" : "Device Tracking Disabled";
      toast(`Device tracking ${enabled ? "enabled" : "disabled"}`, "success");
    } catch (err) {
      toast(err.message || "Could not save device tracking setting", "error");
      toggle.checked = deviceTrackingEnabled;
    } finally {
      restore();
    }
  };

  container.querySelector("#save-reopen-policy").onclick = async () => {
    const toggle = container.querySelector("#reopen-button-toggle");
    const limitInput = container.querySelector("#reopen-limit-input");
    let limit = parseInt(limitInput.value, 10);
    if (!Number.isFinite(limit) || limit < 0) limit = 0;
    if (limit > 99) limit = 99;
    const button_enabled = toggle.checked;
    const btn = container.querySelector("#save-reopen-policy");
    const restore = setButtonLoading(btn, "Saving");
    try {
      const res = await fetch(`${settingsApiBase}/settings/reopen`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ limit, button_enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save reopen policy");
      reopenLimit = data.limit;
      reopenButtonEnabled = data.button_enabled !== false;
      limitInput.value = reopenLimit;
      const span = toggle.parentElement?.querySelector("span");
      if (span) span.textContent = reopenButtonEnabled ? "Reopen button visible" : "Reopen button hidden";
      toast("Reopen policy saved", "success");
    } catch (err) {
      toast(err.message || "Could not save reopen policy", "error");
    } finally {
      restore();
    }
  };

  container.querySelectorAll(".reg-key-toggle").forEach((btn) => {
    btn.onclick = () => {
      const input = container.querySelector(`#${btn.dataset.target}`);
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.innerHTML = showing ? ICONS.eye : ICONS.eyeOff;
    };
  });
  container.querySelectorAll(".reg-key-copy").forEach((btn) => {
    btn.onclick = async () => {
      const input = container.querySelector(`#${btn.dataset.target}`);
      if (!input?.value) return toast("Key is not configured", "warning");
      await navigator.clipboard.writeText(input.value);
      toast("Registration key copied", "success");
    };
  });
  container.querySelectorAll(".reg-key-regenerate").forEach((btn) => {
    btn.onclick = async () => {
      const role = btn.dataset.role;
      const label = role === "admin" ? "admin" : "employee";
      if (
        !confirm(
          `Regenerate ${label} signup key? The old key will stop working for new signups.`,
        )
      )
        return;
      const restore = setButtonLoading(btn, "Regenerating");
      try {
        const res = await fetch(
          `${settingsApiBase}/settings/registration-keys/regenerate`,
          {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ role }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not regenerate key");
        const input = container.querySelector(
          `#${role === "admin" ? "admin" : "employee"}-reg-key`,
        );
        if (input) {
          input.value = data.key || "";
          input.type = "text";
        }
        toast(
          `${label.charAt(0).toUpperCase() + label.slice(1)} signup key regenerated`,
          "success",
        );
      } catch (err) {
        toast(err.message || "Could not regenerate key", "error");
      } finally {
        restore();
      }
    };
  });
  container.querySelectorAll(".remove-restriction").forEach((btn) => {
    btn.onclick = async () => {
      const userId = btn.dataset.id;
      const name = btn.dataset.name;
      if (!confirm(`Remove EOD restriction for ${name}?`)) return;
      const attend = (attendance || []).filter((a) => a.user_id === userId);
      const missed = getMissedEodRows(attend, eodReports || []);
      if (missed.length >= STRICT_EOD_LIMIT) {
        const autoResolved = missed.slice(
          0,
          missed.length - STRICT_EOD_LIMIT + 1,
        );
        let fixed = 0;
        for (const row of autoResolved) {
          const { error } = await supabase
            .from("eod_reports")
            .insert({
              employee_id: userId,
              content: "Admin cleared missed EOD warning",
              date: attendanceDateKey(row),
            });
          if (!error) fixed++;
        }
        toast(
          `Cleared ${fixed} missed EOD warning${fixed === 1 ? "" : "s"} for ${name}`,
          "success",
        );
      } else {
        toast("Employee is not restricted", "info");
      }
      renderSettingsTab(container);
    };
  });
}
export async function renderAutoAssignmentTab(container) {
  showLoader(container);
  const apiBase =
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
      ? "/api"
      : "http://localhost:5000/api";
  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
  });
  const dateOf = (value) => {
    if (!value) return "-";
    const dt = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(dt.getTime())
      ? String(value)
      : dt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };

  try {
    const [statusRes, logsRes] = await Promise.all([
      fetch(`${apiBase}/auto-assignment/status`, { headers: authHeaders() }),
      fetch(`${apiBase}/auto-assignment/logs?limit=50`, {
        headers: authHeaders(),
      }),
    ]);
    const status = await statusRes.json();
    const logsData = await logsRes.json();
    if (!statusRes.ok)
      throw new Error(status.error || "Could not load auto-assignment status");
    if (!logsRes.ok)
      throw new Error(logsData.error || "Could not load auto-assignment logs");

    const queue = status.queue || [];
    const logs = logsData.logs || [];
    const queueHtml =
      queue.length === 0
        ? '<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--text-dim)">No employees are clocked in right now.</td></tr>'
        : queue
            .map(
              (emp) => `<tr>
          <td><span class="badge ${emp.is_next ? "badge-resolved" : "badge-open"}">#${emp.queue_position}</span></td>
          <td><b>${escapeHtml(emp.full_name || "Employee")}</b><br/><small style="color:var(--text-dim)">${escapeHtml(emp.id)}</small></td>
          <td>${emp.clock_in ? dateOf(emp.clock_in) : '<span style="color:var(--text-dim);font-style:italic;">Offline (Always Assign)</span>'}</td>
          <td><b>${emp.assignments_today || 0}</b></td>
          <td>
            ${emp.always_assign ? '<span class="badge" style="background:var(--primary);color:#fff;margin-right:6px;font-weight:700;">⭐ Priority</span>' : ""}
            ${emp.is_next ? '<span class="badge badge-resolved">Next</span>' : !emp.always_assign ? '<span style="color:var(--text-dim)">-</span>' : ""}
          </td>
        </tr>`,
            )
            .join("");
    const logsHtml =
      logs.length === 0
        ? '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-dim)">No auto-assignment history yet.</td></tr>'
        : logs
            .map(
              (log) => `<tr>
          <td><small style="color:var(--text-dim)">${dateOf(log.assigned_at)}</small></td>
          <td><code style="font-size:0.78rem;color:var(--primary)">${escapeHtml(log.ticket_no || (log.inquiry_id || "").slice(0, 8))}</code></td>
          <td><b>${escapeHtml(log.customer_name || "Customer")}</b><br/><small style="color:var(--text-dim)">${escapeHtml(log.service_item || "")}</small></td>
          <td>${escapeHtml(log.employee_name || "Employee")}</td>
          <td>#${log.queue_position}</td>
          <td><span class="badge badge-open">${escapeHtml(log.inquiry_status || "open")}</span></td>
        </tr>`,
            )
            .join("");

    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>Auto Assignment</h1>
          <p>Round-robin queue based on employees clocked in today</p>
        </div>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div style="display:inline-flex;align-items:center;gap:10px;padding:6px 14px;border-radius:100px;background:var(--bg-soft);box-shadow:var(--neu-sm);">
            <span style="font-size:0.82rem;font-weight:700;color:var(--text-dim);">Auto Assign:</span>
            <label class="switch-container" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;">
              <div class="switch-outer" id="auto-assign-switch-outer" style="position:relative;width:44px;height:22px;background:${status.auto_assignment_enabled ? "var(--success)" : "var(--border)"};border-radius:100px;transition:0.3s;box-shadow:inset 0 1px 3px rgba(0,0,0,0.15);">
                <div class="switch-inner" id="auto-assign-switch-inner" style="position:absolute;top:2px;left:${status.auto_assignment_enabled ? "24px" : "2px"};width:18px;height:18px;background:#ffffff;border-radius:50%;transition:0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
              </div>
              <span style="font-size:0.85rem;font-weight:700;color:${status.auto_assignment_enabled ? "var(--success)" : "var(--text-dim)"};" id="auto-assign-status-text">${status.auto_assignment_enabled ? "ON" : "OFF"}</span>
              <input type="checkbox" id="auto-assign-toggle-input" style="display:none;" ${status.auto_assignment_enabled ? "checked" : ""} />
            </label>
          </div>
          <button class="btn btn-secondary" id="auto-assign-refresh">${ICONS.refresh}<span>Refresh</span></button>
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom:24px;">
        <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${queue.length}</div><div class="stat-label">Clocked In</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--success)">${status.total_today || 0}</div><div class="stat-label">Assigned Today</div></div>
        <div class="stat-card"><div class="stat-value" style="font-size:1.5rem;color:var(--warning)">${escapeHtml(queue.find((e) => e.is_next)?.full_name || "-")}</div><div class="stat-label">Next Employee</div></div>
      </div>
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><span class="card-title">Current Queue</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Position</th><th>Employee</th><th>Clock In</th><th>Assignments Today</th><th>Status</th></tr></thead>
            <tbody>${queueHtml}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Assignments</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Assigned</th><th>Ticket</th><th>Customer</th><th>Employee</th><th>Queue Pos</th><th>Status</th></tr></thead>
            <tbody>${logsHtml}</tbody>
          </table>
        </div>
      </div>
    `;

    const toggleInput = container.querySelector("#auto-assign-toggle-input");
    const switchOuter = container.querySelector("#auto-assign-switch-outer");
    const switchInner = container.querySelector("#auto-assign-switch-inner");
    const statusText = container.querySelector("#auto-assign-status-text");

    if (toggleInput && switchOuter && switchInner && statusText) {
      toggleInput.onchange = async () => {
        const enabled = toggleInput.checked;
        switchOuter.style.background = enabled
          ? "var(--success)"
          : "var(--border)";
        switchInner.style.left = enabled ? "24px" : "2px";
        statusText.textContent = enabled ? "ON" : "OFF";
        statusText.style.color = enabled ? "var(--success)" : "var(--text-dim)";

        try {
          const res = await fetch(`${apiBase}/auto-assignment/status`, {
            method: "PUT",
            headers: {
              ...authHeaders(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ enabled }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok)
            throw new Error(
              data.error || "Failed to update auto-assignment status",
            );

          toast(`Auto assignment turned ${enabled ? "on" : "off"}`, "success");
        } catch (err) {
          toast(err.message || "Could not update status", "error");
          toggleInput.checked = !enabled;
          switchOuter.style.background = !enabled
            ? "var(--success)"
            : "var(--border)";
          switchInner.style.left = !enabled ? "24px" : "2px";
          statusText.textContent = !enabled ? "ON" : "OFF";
          statusText.style.color = !enabled
            ? "var(--success)"
            : "var(--text-dim)";
        }
      };

      switchOuter.onclick = (e) => {
        e.preventDefault();
        toggleInput.checked = !toggleInput.checked;
        toggleInput.dispatchEvent(new Event("change"));
      };
    }

    container.querySelector("#auto-assign-refresh").onclick = () =>
      renderAutoAssignmentTab(container);
  } catch (err) {
    container.innerHTML = `<div class="page-header"><h1>Auto Assignment</h1><p style="color:var(--danger)">${escapeHtml(err.message || "Could not load auto assignment")}</p></div>`;
    toast(err.message || "Could not load auto assignment", "error");
  }
}
