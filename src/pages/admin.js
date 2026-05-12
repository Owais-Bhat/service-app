import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime, formatTime, exportToCSV, calculateSLA, formatTimeRemaining } from '../utils.js';

function hoursWorked(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const diff = new Date(clockOut) - new Date(clockIn);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}
import { ICONS } from '../icons.js';

const STATUS_LABEL = {
  pending: 'Received',
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

function statusBadge(status) {
  const cls = ['resolved', 'closed'].includes(status) ? 'badge-resolved'
    : status === 'in_progress' ? 'badge-in_progress'
    : status === 'assigned' ? 'badge-assigned'
    : 'badge-open';
  return `<span class="badge ${cls}">${STATUS_LABEL[status] || status}</span>`;
}

// ── ADMIN HUB ───────────────────────────────────────────
export async function renderAdminDashboard(container) {
  const today = new Date().toLocaleDateString('en-CA');
  let tickets, inquiries, attendance, stocks, profiles;
  
  try {
    const res = await Promise.all([
      supabase.from('tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('inquiries').select('*').in('status', ['pending', 'open', 'assigned', 'in_progress']).order('created_at', { ascending: false }),
      supabase.from('attendance').select('*, profiles(full_name)').order('clock_in', { ascending: false }),
      supabase.from('stocks').select('*'),
      supabase.from('profiles').select('*')
    ]);
    tickets = res[0].data; inquiries = res[1].data; attendance = res[2].data; stocks = res[3].data; profiles = res[4].data;
    const firstErr = res.find(r => r.error)?.error;
    if (firstErr) console.warn('[Admin] Partial load issue:', firstErr.message);
  } catch (err) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:40px;"><h2 style="color:var(--primary);">Initialization Error</h2><p>${err.message}</p></div>`;
    return;
  }

  const t = tickets || [], i = inquiries || [], all_a = attendance || [], s = stocks || [], p = profiles || [];
  const a = all_a.filter(x => x.date === today);
  const lowStock = s.filter(x => x.quantity <= x.min_stock).length;

  // Build phone → company map from profiles
  const phoneToCompany = new Map();
  p.forEach(pr => { if (pr.phone && pr.company) phoneToCompany.set(pr.phone, pr.company); });

  // Aggregate all inquiries by company
  const { data: allInquiries } = await supabase.from('inquiries').select('phone,status').order('created_at', { ascending: false });
  const companyMap = new Map();
  (allInquiries || []).forEach(inq => {
    const company = phoneToCompany.get(inq.phone) || 'Walk-in / Unregistered';
    if (!companyMap.has(company)) companyMap.set(company, { total: 0, active: 0, resolved: 0 });
    const entry = companyMap.get(company);
    entry.total++;
    if (['resolved', 'closed'].includes(inq.status)) entry.resolved++;
    else entry.active++;
  });
  const companyRows = [...companyMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Admin Hub</h1>
        <p>Real-time operations monitoring</p>
      </div>
      <button class="btn btn-secondary" id="admin-refresh">Refresh</button>
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

    <div class="grid-layout">
      <!-- Recent Tickets (From Clients) -->
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Client Tickets</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Status</th><th>Priority</th></tr></thead>
            <tbody>
              ${t.filter(x => x.status !== 'resolved' && x.status !== 'closed').length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text3)">No active tickets</td></tr>' : 
                t.filter(x => x.status !== 'resolved' && x.status !== 'closed').slice(0,5).map(x => `<tr>
                  <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${x.title}</b></td>
                  <td><span class="badge badge-${x.status}">${x.status.replace('_', ' ')}</span></td>
                  <td><span class="badge badge-${x.priority || 'medium'}">${x.priority || 'medium'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Service Requests Card (From Guests) -->
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Service Requests</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Ticket</th><th>Name</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${i.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-dim)">No active requests</td></tr>' :
                i.slice(0,5).map(x => `<tr>
                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || '—'}</code></td>
                  <td><b>${x.full_name}</b></td>
                  <td>${statusBadge(x.status)}</td>
                  <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-header"><span class="card-title">${ICONS.building}<span style="margin-left:8px">Services by Company</span></span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Company</th><th>Total</th><th>Active</th><th>Resolved</th></tr></thead>
          <tbody>
            ${companyRows.length === 0
              ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-dim)">No service data yet</td></tr>'
              : companyRows.map(([company, counts]) => `<tr>
                  <td><b>${company}</b></td>
                  <td><span class="badge badge-open">${counts.total}</span></td>
                  <td style="color:var(--warning)">${counts.active}</td>
                  <td style="color:var(--success)">${counts.resolved}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-header"><span class="card-title">Quick Actions & Reports</span></div>
      <div class="card-body" style="display:flex;gap:16px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="exp-attendance">Attendance CSV</button>
        <button class="btn btn-secondary" id="exp-clients">Client List CSV</button>
        <button class="btn btn-secondary" id="exp-stocks">Inventory CSV</button>
        <button class="btn btn-primary" id="view-eod">EOD Summaries</button>
        <button class="btn btn-primary" id="view-leaves" style="background:var(--warning); color:var(--text); border:none;">Leave Requests</button>
        <button class="btn btn-primary" id="view-payments" style="background:var(--primary); color:white;">💰 Payments</button>
        <button class="btn btn-secondary" id="view-pricing">⚙️ Service Pricing</button>
      </div>
    </div>
  `;

  // Bindings
  const bind = (sel, cb) => {
    const el = container.querySelector(sel);
    if (el) el.onclick = cb;
  };

  bind('#admin-refresh', () => renderAdminDashboard(container));
  bind('#exp-attendance', () => exportToCSV('attendance.csv', a));
  bind('#exp-clients', () => exportToCSV('clients.csv', p.filter(x=>x.role==='client')));
  bind('#exp-stocks', () => exportToCSV('stocks.csv', s));
  bind('#view-eod', () => renderEODReports(container));
  bind('#view-leaves', () => renderLeaveRequests(container));
  bind('#view-payments', () => renderPaymentsTab(container));
  bind('#view-pricing', () => renderPricingTab(container));
  
  container.querySelectorAll('.inq-btn').forEach(btn => {
    btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderAdminDashboard(container));
  });

  // Real-time listener for new inquiries
  const channel = supabase.channel('admin-inquiries')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inquiries' }, payload => {
      toast(`New Request: ${payload.new.full_name}`, 'info');
      // If the current container is still the dashboard, refresh counts
      if (document.getElementById('admin-refresh')) renderAdminDashboard(container);
    })
    .subscribe();

  // Cleanup channel on container removal (using a simple check)
  const checkRemoval = setInterval(() => {
    if (!document.body.contains(container)) {
      supabase.removeChannel(channel);
      clearInterval(checkRemoval);
    }
  }, 5000);
}

// ── SERVICE REQUEST DETAIL MODAL ────────────────────────
async function openInquiryDetail(id, onDone) {
  const { data: i } = await supabase.from('inquiries').select('*').eq('id', id).single();
  const { data: employees } = await supabase.from('profiles').select('*').eq('role', 'employee');

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
            <div><div class="sr-meta-label">Name</div><div class="sr-meta-value">${i.full_name}</div></div>
            <div><div class="sr-meta-label">Phone</div><div class="sr-meta-value">${i.phone}</div></div>
          </div>
          <div><div class="sr-meta-label">Service item</div><div class="sr-meta-value">${i.service_item || '—'}</div></div>
          <div><div class="sr-meta-label">Location</div><div class="sr-meta-value">${i.location || '—'}</div></div>
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
          ${i.feedback_rating ? `
            <div class="sr-fb-shown">
              ${ICONS.star}
              <div>
                <div class="sr-meta-label">Customer feedback (${i.feedback_rating}/5)</div>
                <div class="sr-meta-value">${i.feedback_comment || 'No comment.'}</div>
              </div>
            </div>` : ''}
        </div>

        <div class="form-group">
          <label>Status</label>
          <select id="sr-status">
            <option value="open" ${i.status==='open'||i.status==='pending'?'selected':''}>Open</option>
            <option value="assigned" ${i.status==='assigned'?'selected':''}>Assigned</option>
            <option value="in_progress" ${i.status==='in_progress'?'selected':''}>In Progress</option>
            <option value="resolved" ${i.status==='resolved'?'selected':''}>Resolved</option>
            <option value="closed" ${i.status==='closed'?'selected':''}>Closed</option>
          </select>
        </div>

        <div class="form-group">
          <label>Assign to Technician</label>
          <select id="assign-to" ${i.assignment_status === 'accepted' ? 'disabled' : ''}>
            <option value="">— None —</option>
            ${(employees||[]).map(e => `<option value="${e.id}" ${i.assigned_employee_id === e.id ? 'selected' : ''}>${e.full_name}</option>`).join('')}
          </select>
          ${i.assignment_status === 'accepted' ? '<small style="color:var(--success); font-weight:700;">✅ Job already accepted by technician.</small>' : ''}
        </div>

        <div class="form-group">
          <label>Bill amount (₹)</label>
          <input id="sr-bill" type="number" min="0" step="1" placeholder="0"
                 value="${i.bill_amount ?? ''}" />
        </div>

        <div class="form-group">
          <label>Razorpay Payment Link</label>
          <div style="display:flex; gap:8px;">
            <input id="sr-pay-link" type="url" placeholder="https://rzp.io/l/..."
                   value="${i.payment_link ?? ''}" style="flex:1" />
            <button class="btn btn-secondary" id="gen-pay-link" style="width:auto; white-space:nowrap; padding:0 12px;" title="Generate link via Razorpay">✨ Generate</button>
          </div>
          <small style="color:var(--text-dim);text-transform:none;font-weight:500;margin-top:4px;display:block;">Click Generate to create a link automatically based on the bill amount.</small>
        </div>

        <div class="form-group">
          <label>Payment status</label>
          <select id="sr-pay-status">
            <option value="unpaid" ${i.payment_status!=='paid'?'selected':''}>Unpaid</option>
            <option value="paid"   ${i.payment_status==='paid'?'selected':''}>Paid</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ci2">Close</button>
        <button class="btn btn-primary" id="save-sr">${ICONS.check}<span>Save changes</span></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ci').onclick = overlay.querySelector('#ci2').onclick = () => overlay.remove();
  
  // Razorpay Link Generation
  overlay.querySelector('#gen-pay-link').onclick = async () => {
    const amount = Number(overlay.querySelector('#sr-bill').value);
    if (!amount || amount <= 0) {
      toast('Please enter a valid bill amount first', 'warning');
      return;
    }

    const btn = overlay.querySelector('#gen-pay-link');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="srf-spin"></span>`;

    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/payments/create-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount,
          description: `Service Request: ${i.service_item}`,
          ticket_no: i.ticket_no,
          customer: {
            name: i.full_name,
            phone: i.phone
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate link');

      overlay.querySelector('#sr-pay-link').value = data.short_url;
      toast('Payment link generated!', 'success');
    } catch (err) {
      console.error(err);
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  };

  overlay.querySelector('#save-sr').onclick = async () => {
    const newStatus = overlay.querySelector('#sr-status').value;
    const empId = overlay.querySelector('#assign-to').value;
    const billRaw = overlay.querySelector('#sr-bill').value.trim();
    const payLink = overlay.querySelector('#sr-pay-link').value.trim();
    const payStatus = overlay.querySelector('#sr-pay-status').value;

    const btn = overlay.querySelector('#save-sr');
    btn.disabled = true;
    btn.innerHTML = `<span>Saving…</span>`;

    const updates = {
      status: newStatus,
      bill_amount: billRaw === '' ? null : Number(billRaw),
      payment_link: payLink || null,
      payment_status: payStatus,
      assigned_employee_id: empId || null,
    };

    // If assigned to an employee (even if same), ensure it stays or returns to 'pending' 
    // UNLESS it was already accepted and we are just changing other details.
    if (empId && i.assignment_status !== 'accepted') {
      updates.assignment_status = 'pending';
      updates.decline_reason = null;
    }

    // If newly assigned and no ticket exists yet, create a ticket and link it.
    if (empId && !i.ticket_id) {
      const { data: existingClient } = await supabase.from('profiles')
        .select('id').eq('phone', i.phone).maybeSingle();

      const { data: ticket, error: tErr } = await supabase.from('tickets').insert({
        title: `Service: ${(i.service_item || '').slice(0, 30)}`,
        description: `Ticket ${i.ticket_no || ''} from ${i.full_name} (${i.phone}). ${i.service_item || ''}`,
        assigned_to: empId,
        client_id: existingClient ? existingClient.id : null,
        status: 'open',
        category: 'service_request',
      }).select().single();

      if (tErr) {
        toast(tErr.message, 'error');
        btn.disabled = false;
        btn.innerHTML = `${ICONS.check}<span>Save changes</span>`;
        return;
      }
      updates.ticket_id = ticket.id;
      if (newStatus === 'open') updates.status = 'assigned';
    } else if (empId && i.ticket_id) {
      await supabase.from('tickets').update({ assigned_to: empId }).eq('id', i.ticket_id);
    }

    const { error } = await supabase.from('inquiries').update(updates).eq('id', i.id);
    if (error) {
      toast(error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `${ICONS.check}<span>Save changes</span>`;
      return;
    }

    toast('Service request updated', 'success');
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
  const activeLogs = list.filter(x => x.clock_in && !x.clock_out);
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
          <td>${x.clock_out ? `<span class="badge badge-resolved">${formatTime(x.clock_out)}</span>` : '<span style="color:var(--text-dim)">Active</span>'}</td>
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
        <div class="stat-value" style="color:var(--warning);font-size:1.6rem">${avgHours}</div>
        <div class="stat-label">Avg Hours Today</div>
      </div>
    </div>

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
          <tbody>${rowHtml(list)}</tbody>
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
    container.querySelector('tbody').innerHTML = rowHtml(filtered);
  };

  search.oninput = doFilter;
  date.onchange = doFilter;
  container.querySelector('#att-clear').onclick = () => renderAttendance(container);
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

export async function renderInquiries(container) {
  const filterKey = container.dataset.srFilter || 'active';
  const { data: list, error } = await supabase.from('inquiries')
    .select('*').order('created_at', { ascending: false });
  if (error) console.warn('[Admin] inquiries load:', error.message);

  const all = list || [];
  const counts = {
    all: all.length,
    active: all.filter(x => !['resolved','closed'].includes(x.status)).length,
    closed: all.filter(x => ['resolved','closed'].includes(x.status)).length,
    paid: all.filter(x => x.payment_status === 'paid').length,
    unpaid: all.filter(x => x.bill_amount && x.payment_status !== 'paid').length,
  };
  const filtered = all.filter(x => {
    if (filterKey === 'all') return true;
    if (filterKey === 'active') return !['resolved','closed'].includes(x.status);
    if (filterKey === 'closed') return ['resolved','closed'].includes(x.status);
    if (filterKey === 'paid') return x.payment_status === 'paid';
    if (filterKey === 'unpaid') return x.bill_amount && x.payment_status !== 'paid';
    return true;
  });

  const tabs = [
    ['active', 'Active'],
    ['closed', 'Closed'],
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
      <button class="btn btn-secondary" id="sr-refresh">${ICONS.refresh}<span>Refresh</span></button>
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
              <th>Ticket</th><th>Date</th><th>Customer</th><th>Service</th>
              <th>Status</th><th>Bill</th><th>Payment</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim)">No requests in this view</td></tr>`
              : filtered.map(x => `<tr>
                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || x.id.slice(0,8)}</code></td>
                  <td>${formatDate(x.created_at)}</td>
                  <td><b>${x.full_name}</b><br/><small style="color:var(--text-dim)">${x.phone}</small></td>
                  <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.service_item || '—'}</td>
                  <td>${statusBadge(x.status)}</td>
                  <td>${x.bill_amount ? '₹' + Number(x.bill_amount).toLocaleString('en-IN') : '—'}</td>
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
  container.querySelectorAll('.sr-filter').forEach(btn => {
    btn.onclick = () => {
      container.dataset.srFilter = btn.dataset.key;
      renderInquiries(container);
    };
  });
  container.querySelectorAll('.inq-btn').forEach(btn => {
    btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderInquiries(container));
  });
}

export async function renderStocks(container) {
  const { data: stocks } = await supabase.from('stocks').select('*').order('item_name');
  container.innerHTML = `
    <div class="page-header"><h1>Inventory</h1></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Stock</th><th>Status</th></tr></thead>
          <tbody>
            ${(stocks||[]).map(x => `<tr>
              <td>${x.item_name}</td>
              <td><b>${x.quantity}</b> ${x.unit||'pcs'}</td>
              <td><span class="badge badge-${x.quantity <= x.min_stock ? 'urgent' : 'resolved'}">${x.quantity <= x.min_stock ? 'Low' : 'OK'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
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
            </tr>
          </thead>
          <tbody>
            ${(tickets||[]).map(t => {
              const inq = t.inquiries?.[0];
              return `<tr>
                <td><code style="font-size:0.75rem;">#${t.id.slice(0,8)}</code></td>
                <td><b>${inq ? inq.full_name : 'Guest'}</b></td>
                <td>${inq ? `<small>${inq.phone}<br/>${inq.location.slice(0,20)}...</small>` : '—'}</td>
                <td>${t.assigned_to ? profileMap[t.assigned_to] || 'Staff' : '<span style="color:var(--text-dim)">Unassigned</span>'}</td>
                <td><span class="badge badge-${t.status}">${t.status.replace('_',' ')}</span></td>
                <td><small>${formatDate(t.created_at)}</small></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
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
  container.innerHTML = `
    <div class="page-header"><h1>Clients</h1></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Company</th></tr></thead>
          <tbody>${(clients||[]).map(c => `<tr>
            <td><b>${c.full_name||'—'}</b></td>
            <td>${c.email||'—'}</td>
            <td>${c.company||'—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

export async function renderUsers(container) {
  const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>User Management</h1></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Update</th></tr></thead>
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
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
  container.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      await supabase.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.uid);
      toast('Role updated', 'success');
    });
  });
}

export async function renderPaymentsTab(container) {
  const { data: payments } = await supabase.from('inquiries').select('*').not('bill_amount', 'is', null).order('created_at', { ascending: false });
  const list = payments || [];
  
  container.innerHTML = `
    <div class="page-header">
      <h1>Payment Tracker</h1>
      <p>Monitor revenue and billing status</p>
    </div>
    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">₹${list.filter(x=>x.payment_status==='paid').reduce((acc,x)=>acc+(Number(x.bill_amount)||0), 0).toLocaleString('en-IN')}</div>
        <div class="stat-label">Total Received</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning)">₹${list.filter(x=>x.payment_status!=='paid').reduce((acc,x)=>acc+(Number(x.bill_amount)||0), 0).toLocaleString('en-IN')}</div>
        <div class="stat-label">Pending Payments</div>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket</th><th>Customer</th><th>Total Bill</th><th>Status</th><th>Link</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No payment records yet</td></tr>' : 
              list.map(x => `
              <tr>
                <td><code style="font-size:0.75rem;">${x.ticket_no || x.id.slice(0,8)}</code></td>
                <td><b>${x.full_name}</b></td>
                <td>₹${Number(x.bill_amount).toLocaleString('en-IN')}</td>
                <td><span class="badge badge-${x.payment_status === 'paid' ? 'resolved' : 'medium'}">${x.payment_status || 'unpaid'}</span></td>
                <td>${x.payment_link ? `<a href="${x.payment_link}" target="_blank" style="color:var(--primary); font-size:0.8rem;">View Link</a>` : '—'}</td>
                <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Details</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelectorAll('.inq-btn').forEach(btn => {
    btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderPaymentsTab(container));
  });
}

export async function renderPricingTab(container) {
  const { data: pricing } = await supabase.from('service_pricing').select('*').order('name');
  const list = pricing || [];

  container.innerHTML = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h1>Service Pricing</h1>
        <p>Define standard costs for common services to prevent billing errors</p>
      </div>
      <button class="btn btn-primary" id="add-price">${ICONS.plus}<span>Add New Service</span></button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Service Name</th><th>Fixed Cost</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-dim)">No services defined yet</td></tr>' : 
              list.map(x => `
              <tr>
                <td><b>${x.name}</b></td>
                <td>₹${Number(x.cost).toLocaleString('en-IN')}</td>
                <td>
                  <button class="btn btn-danger btn-sm del-price" data-id="${x.id}">${ICONS.close}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#add-price').onclick = () => {
    const name = prompt('Enter service name:');
    const cost = prompt('Enter fixed cost (₹):');
    if (name && cost) {
      (async () => {
        await supabase.from('service_pricing').insert({ id: crypto.randomUUID(), name, cost: Number(cost) });
        renderPricingTab(container);
      })();
    }
  };

  container.querySelectorAll('.del-price').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Delete this service?')) {
        await supabase.from('service_pricing').delete().eq('id', btn.dataset.id);
        renderPricingTab(container);
      }
    };
  });
}
