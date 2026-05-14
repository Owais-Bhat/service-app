import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime, formatTime, exportToCSV, calculateSLA, formatTimeRemaining, showNotification } from '../utils.js';

function hoursWorked(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const diff = new Date(clockOut) - new Date(clockIn);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}
function daysBetweenInclusive(start, end) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}
function money(value) {
  return `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}
import { ICONS } from '../icons.js';

const STATUS_LABEL = {
  pending: 'Received',
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  issue_not_resolved: 'Issue Not Resolved',
};

function statusBadge(status) {
  const cls = ['resolved', 'closed'].includes(status) ? 'badge-resolved'
    : status === 'in_progress' ? 'badge-in_progress'
    : status === 'assigned' ? 'badge-assigned'
    : status === 'issue_not_resolved' ? 'badge-danger'
    : 'badge-open';
  return `<span class="badge ${cls}">${STATUS_LABEL[status] || status}</span>`;
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
  const { data: allInquiries } = await supabase.from('inquiries').select('phone,status,company_name').order('created_at', { ascending: false });
  const companyMap = new Map();
  (allInquiries || []).forEach(inq => {
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

    <div class="card" style="margin-top:24px" id="company-svc-card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span class="card-title">${ICONS.building}<span style="margin-left:8px">Services by Company</span></span>
        <div class="search-input-wrap" style="min-width:160px;max-width:260px;">
          <span>🔍</span>
          <input class="search-input" id="company-search" placeholder="Filter company…" style="padding:6px 10px;font-size:0.82rem;"/>
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
                <thead><tr><th>Ticket</th><th>Customer</th><th>Service</th><th>Status</th><th>Bill</th><th></th></tr></thead>
                <tbody>
                  ${companyInquiries.length === 0
                    ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No inquiries found</td></tr>'
                    : companyInquiries.map(x => `<tr>
                        <td><code style="font-size:0.75rem;color:var(--primary)">${x.ticket_no || '—'}</code></td>
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
          <div class="modal-footer"><button class="btn btn-secondary" id="cm-co2">Close</button></div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#cm-co').onclick = overlay.querySelector('#cm-co2').onclick = () => overlay.remove();
      overlay.querySelectorAll('.co-inq-btn').forEach(b => {
        b.onclick = () => { overlay.remove(); openInquiryDetail(b.dataset.id, () => renderAdminDashboard(container)); };
      });
    };
  });

  
  container.querySelectorAll('.inq-btn').forEach(btn => {
    btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderAdminDashboard(container));
  });

  // Real-time listener for new inquiries
  const channel = supabase.channel('admin-inquiries')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inquiries' }, payload => {
      if (document.getElementById('admin-refresh')) renderAdminDashboard(container);
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
            <option value="issue_not_resolved" ${i.status==='issue_not_resolved'?'selected':''}>Issue Not Resolved</option>
          </select>
        </div>

        <div class="form-group">
          <label>Company <span style="font-weight:400;color:var(--text-dim)">(optional)</span></label>
          <input id="sr-company" type="text" placeholder="Company name"
                 value="${i.company_name ?? ''}" />
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
          <label>Bill amount (₹) <span style="font-weight:400;color:var(--text-dim)">(optional)</span></label>
          <input id="sr-bill" type="number" min="0" step="1" placeholder="0"
                 value="${i.bill_amount ?? ''}" />
        </div>

        <div class="form-group">
          <label>Payment method</label>
          <select id="sr-pay-method">
            <option value="none" ${!i.payment_method?'selected':''}>— No payment yet —</option>
            <option value="cash" ${i.payment_method==='cash'?'selected':''}>Cash</option>
            <option value="upi"  ${i.payment_method==='upi'?'selected':''}>UPI / QR</option>
            <option value="online" ${i.payment_method==='online'?'selected':''}>Online (Razorpay)</option>
            <option value="bank" ${i.payment_method==='bank'?'selected':''}>Bank Transfer</option>
          </select>
        </div>

        <div id="sr-pay-link-wrap" style="display:${i.payment_method==='online'||i.payment_link?'block':'none'}">
          <div class="form-group">
            <label>Razorpay Payment Link <span style="font-weight:400;color:var(--text-dim)">(optional)</span></label>
            <div style="display:flex; gap:8px;">
              <input id="sr-pay-link" type="url" placeholder="https://rzp.io/l/..."
                     value="${i.payment_link ?? ''}" style="flex:1" />
              <input id="sr-pay-link-id" type="hidden" value="${i.payment_link_id ?? ''}" />
              <button class="btn btn-secondary" id="gen-pay-link" style="width:auto; white-space:nowrap; padding:0 12px;" title="Generate link via Razorpay">✨ Generate</button>
            </div>
          </div>
        </div>

        <div id="sr-cash-wrap" style="display:${i.payment_method==='cash'||i.payment_method==='upi'||i.payment_method==='bank'?'flex':'none'}; align-items:center; gap:12px; margin-bottom:18px; padding:14px; border-radius:14px; background:rgba(16,185,129,0.06); border:1px solid var(--primary);">
          <div style="flex:1; font-size:0.9rem; color:var(--text)">
            <b>Mark payment as received?</b><br/>
            <small style="color:var(--text-dim)">Payment collected offline — mark it as paid now.</small>
          </div>
          <button class="btn btn-primary btn-sm" id="mark-cash-paid" ${i.payment_status==='paid'?'disabled':''}>
            ${i.payment_status==='paid'?'✓ Already Paid':'✓ Mark Paid'}
          </button>
        </div>

        <div class="form-group">
          <label>Payment status</label>
          <select id="sr-pay-status">
            <option value="unpaid" ${i.payment_status!=='paid'?'selected':''}>Unpaid</option>
            <option value="paid"   ${i.payment_status==='paid'?'selected':''}>Paid ✓</option>
          </select>
        </div>

        ${i.feedback_rating ? `
        <div style="padding:14px; border-radius:14px; background:rgba(245,158,11,0.06); border:1px solid var(--warning); margin-bottom:16px;">
          <div style="font-size:0.75rem; font-weight:800; color:var(--warning); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px;">Customer Feedback</div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="font-size:1.3rem; font-weight:800; color:var(--warning)">${'★'.repeat(i.feedback_rating)}${'☆'.repeat(5-i.feedback_rating)}</span>
            <span style="font-weight:700; color:var(--text)">${i.feedback_rating}/5</span>
          </div>
          ${i.feedback_comment ? `<div style="font-size:0.88rem; color:var(--text-soft); font-style:italic">"${i.feedback_comment}"</div>` : ''}
          <button class="btn btn-secondary btn-sm" id="wa-feedback-reply" style="margin-top:10px; width:100%; justify-content:center; gap:8px; background:#25D366; color:white; border:none;">
            ${ICONS.whatsapp}<span>Reply via WhatsApp</span>
          </button>
        </div>` : ''}

        <div style="padding:14px; border-radius:14px; background:var(--bg-soft); border:1px solid var(--border); margin-bottom:4px;">
          <div style="font-size:0.75rem; font-weight:800; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:10px;">📱 WhatsApp Templates</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <button class="btn btn-secondary btn-sm wa-tpl" data-tpl="status" style="background:#25D366;color:white;border:none;">${ICONS.whatsapp}<span>Status Update</span></button>
            <button class="btn btn-secondary btn-sm wa-tpl" data-tpl="payment" style="background:#25D366;color:white;border:none;">${ICONS.whatsapp}<span>Payment Request</span></button>
            <button class="btn btn-secondary btn-sm wa-tpl" data-tpl="feedback" style="background:#25D366;color:white;border:none;">${ICONS.whatsapp}<span>Request Feedback</span></button>
            <button class="btn btn-secondary btn-sm wa-tpl" data-tpl="resolve" style="background:#25D366;color:white;border:none;">${ICONS.whatsapp}<span>Resolved ✓</span></button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ci2">Close</button>
        <button class="btn btn-primary" id="save-sr">${ICONS.check}<span>Save changes</span></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ci').onclick = overlay.querySelector('#ci2').onclick = () => overlay.remove();

  // Payment method toggle: show/hide Razorpay link and cash sections
  overlay.querySelector('#sr-pay-method').onchange = (e) => {
    const method = e.target.value;
    overlay.querySelector('#sr-pay-link-wrap').style.display = method === 'online' ? 'block' : 'none';
    overlay.querySelector('#sr-cash-wrap').style.display = ['cash','upi','bank'].includes(method) ? 'flex' : 'none';
  };

  // Mark cash paid button
  const cashPaidBtn = overlay.querySelector('#mark-cash-paid');
  if (cashPaidBtn) {
    cashPaidBtn.onclick = async () => {
      cashPaidBtn.disabled = true; cashPaidBtn.textContent = '…';
      const error = await markInquiryPaid(i, { payment_method: overlay.querySelector('#sr-pay-method').value });
      if (error) { toast(error.message, 'error'); cashPaidBtn.disabled = false; cashPaidBtn.textContent = '✓ Mark Paid'; }
      else {
        overlay.querySelector('#sr-pay-status').value = 'paid';
        overlay.querySelector('#sr-status').value = ['resolved', 'closed'].includes(i.status) ? i.status : 'resolved';
        cashPaidBtn.textContent = '✓ Paid';
        toast('Payment marked as received and status updated!', 'success');
      }
    };
  }

  // WhatsApp template buttons
  const wa = (phone, text) => window.open(`https://wa.me/91${phone.replace(/\D/g,'')}?text=${encodeURIComponent(text)}`, '_blank');
  const feedbackUrl = `${window.location.origin}/?tab=track&ticket=${i.ticket_no}&phone=${i.phone}`;
  const templates = {
    status: `Hi ${i.full_name}! 👋 This is an update regarding your service request *${i.ticket_no || ''}*.\n\nCurrent Status: *${STATUS_LABEL[i.status] || i.status}*\nService: ${i.service_item || ''}\n\nFor any queries, feel free to reply here. Thank you! 🙏\n— Networking Experts`,
    payment: `Hi ${i.full_name}! 👋 Your service request *${i.ticket_no || ''}* has been completed.\n\n💰 Bill Amount: *₹${i.bill_amount || '0'}*${i.payment_link ? `\n🔗 Pay here: ${i.payment_link}` : ''}\n\nPlease make the payment at your earliest convenience. Thank you! 🙏\n— Networking Experts`,
    feedback: `Hi ${i.full_name}! 😊 Hope your service is complete and working well!\n\nWe'd love to hear your experience. Please take a moment to rate us:\n👉 ${feedbackUrl}\n\nYour feedback helps us serve you better. Thank you! 🙏\n— Networking Experts`,
    resolve: `Hi ${i.full_name}! ✅ Great news! Your service request *${i.ticket_no || ''}* has been successfully resolved.\n\nService: ${i.service_item || ''}\nStatus: *Resolved*\n\nThank you for choosing Networking Experts! 🙏`,
  };
  if (i.feedback_rating) {
    const fbReplyBtn = overlay.querySelector('#wa-feedback-reply');
    if (fbReplyBtn) fbReplyBtn.onclick = () => wa(i.phone, `Hi ${i.full_name}! 🙏 Thank you so much for your *${i.feedback_rating}/5 star* rating! We really appreciate your feedback${i.feedback_comment ? `: "${i.feedback_comment}"` : ''}. We look forward to serving you again! — Networking Experts`);
  }
  overlay.querySelectorAll('.wa-tpl').forEach(btn => {
    btn.onclick = () => wa(i.phone, templates[btn.dataset.tpl] || '');
  });

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
      overlay.querySelector('#sr-pay-link-id').value = data.id || '';
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
    const payLinkEl = overlay.querySelector('#sr-pay-link');
    const payLink = payLinkEl ? payLinkEl.value.trim() : '';
    const payLinkId = overlay.querySelector('#sr-pay-link-id')?.value.trim() || '';
    const payStatus = overlay.querySelector('#sr-pay-status').value;
    const payMethod = overlay.querySelector('#sr-pay-method').value;
    const companyName = overlay.querySelector('#sr-company').value.trim();

    const btn = overlay.querySelector('#save-sr');
    btn.disabled = true;
    btn.innerHTML = `<span>Saving…</span>`;

    const updates = {
      status: newStatus,
      bill_amount: billRaw === '' ? null : Number(billRaw),
      payment_link: payLink || null,
      payment_link_id: payLinkId || null,
      payment_status: payStatus,
      payment_method: payMethod === 'none' ? null : payMethod,
      company_name: companyName || null,
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

    const shouldResolveOnPaid = payStatus === 'paid' && !['resolved', 'closed'].includes(updates.status);
    if (shouldResolveOnPaid) {
      updates.status = 'resolved';
      updates.payment_received_at = i.payment_received_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    const { error } = await supabase.from('inquiries').update(updates).eq('id', i.id);
    if (error) {
      toast(error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `${ICONS.check}<span>Save changes</span>`;
      return;
    }

    if (shouldResolveOnPaid && (updates.ticket_id || i.ticket_id)) {
      await supabase.from('tickets').update({ status: 'resolved' }).eq('id', updates.ticket_id || i.ticket_id);
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
  const companyFilter = container.dataset.srCompany || '';
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
  const statusFiltered = all.filter(x => {
    if (filterKey === 'all') return true;
    if (filterKey === 'active') return !['resolved','closed'].includes(x.status);
    if (filterKey === 'closed') return ['resolved','closed'].includes(x.status);
    if (filterKey === 'paid') return x.payment_status === 'paid';
    if (filterKey === 'unpaid') return x.bill_amount && x.payment_status !== 'paid';
    return true;
  });
  let filtered = statusFiltered.filter(x => (x.company_name || '').toLowerCase().includes(companyFilter.toLowerCase()));

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
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
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
              <th>Ticket</th><th>Date</th><th>Company</th><th>Customer</th><th>Service</th>
              <th>Status</th><th>Bill</th><th>Payment</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-dim)">No requests in this view</td></tr>`
              : filtered.map(x => `<tr>
                  <td><code style="font-size:0.78rem;color:var(--primary)">${x.ticket_no || x.id.slice(0,8)}</code></td>
                  <td>${formatDate(x.created_at)}</td>
                  <td>${x.company_name ? `<b>${x.company_name}</b>` : '<span style="color:var(--text-dim)">—</span>'}</td>
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
      date: x.created_at,
      company: x.company_name || '',
      customer: x.full_name,
      phone: x.phone,
      service: x.service_item || '',
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
    btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderInquiries(container));
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
      btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderPaymentsTab(container));
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

    const { error } = await supabase.from('service_pricing').insert({
      id: crypto.randomUUID(),
      category: category || 'Uncategorized',
      sub_category: sub_category || null,
      sub_sub_category,
      name: sub_sub_category, // legacy NOT NULL `name` column = leaf
      cost,
    });
    if (error) { errors.push(`Row ${i + 1}: ${error.message}`); skipped++; }
    else inserted++;
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
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Main Category</th><th>Sub Category</th><th>Sub-Sub Category</th><th>Price</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-dim)">No services defined yet</td></tr>' :
              list.map(x => `
              <tr>
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

  container.querySelector('#add-price').onclick = () => {
    const category = prompt('Enter Main Category:');
    if (category === null) return;
    const sub_category = prompt('Enter Sub Category (optional — group/level 2):');
    if (sub_category === null) return;
    const sub_sub_category = prompt('Enter Sub-Sub Category (specific issue — this is what the employee picks):');
    if (!sub_sub_category) return;
    const costStr = prompt('Enter Price (₹):');
    const cost = parsePrice(costStr);
    if (!Number.isFinite(cost) || cost < 0) { toast('Invalid price', 'error'); return; }
    (async () => {
      await supabase.from('service_pricing').insert({
        id: crypto.randomUUID(),
        category: category || 'Uncategorized',
        sub_category: sub_category.trim() || null,
        sub_sub_category,
        name: sub_sub_category,
        cost,
      });
      toast('Service added', 'success');
      renderPricingTab(container);
    })();
  };

  container.querySelector('#dl-template').onclick = downloadTemplateCSV;

  const fileInput = container.querySelector('#upload-price-file');
  container.querySelector('#upload-price').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
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
}

// ── FEEDBACK TAB ───────────────────────────────────────
export async function renderFeedbackTab(container) {
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase.from('inquiries').select('*').order('feedback_at', { ascending: false }),
    supabase.from('profiles').select('id,full_name,role'),
  ]);
  const all = (rows || []).filter(r => r.feedback_rating != null);
  const profileById = new Map((profiles || []).map(p => [p.id, p]));

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
