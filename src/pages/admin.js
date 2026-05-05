import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime, formatTime, exportToCSV } from '../utils.js';

// ── ADMIN HUB ───────────────────────────────────────────
export async function renderAdminDashboard(container) {
  const today = new Date().toLocaleDateString('en-CA');
  let tickets, inquiries, attendance, stocks, profiles;
  
  try {
    const res = await Promise.all([
      supabase.from('tickets').select('*'),
      supabase.from('inquiries').select('*').eq('status', 'pending'),
      supabase.from('attendance').select('*, profiles(full_name)').order('clock_in', { ascending: false }),
      supabase.from('stocks').select('*'),
      supabase.from('profiles').select('*')
    ]);
    tickets = res[0].data; inquiries = res[1].data; attendance = res[2].data; stocks = res[3].data; profiles = res[4].data;
  } catch (err) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:40px;"><h2 style="color:var(--primary);">Initialization Error</h2><p>${err.message}</p></div>`;
    return;
  }

  const t = tickets || [], i = inquiries || [], all_a = attendance || [], s = stocks || [], p = profiles || [];
  const a = all_a.filter(x => x.date === today);
  const lowStock = s.filter(x => x.quantity <= x.min_stock).length;

  container.innerHTML = `
    <div class="page-header">
      <h1>Admin Hub</h1>
      <p>Real-time operations monitoring</p>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--primary)">${a.length}</div>
        <div class="stat-label">Employees In</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning)">${i.length}</div>
        <div class="stat-label">New Queries</div>
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
      <!-- Attendance Card -->
      <div class="card">
        <div class="card-header"><span class="card-title">Live Attendance (Today)</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Clock In</th><th>Location</th></tr></thead>
            <tbody>
              ${all_a.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text3)">No records</td></tr>' : 
                all_a.slice(0,5).map(x => `<tr>
                  <td><b>${x.profiles?.full_name || '—'}</b></td>
                  <td><span class="badge badge-open">${formatTime(x.clock_in)}</span></td>
                  <td><small>${x.location || '—'}</small></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Inquiries Card -->
      <div class="card">
        <div class="card-header"><span class="card-title">Pending Inquiries</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Service</th><th>Action</th></tr></thead>
            <tbody>
              ${i.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text3)">No pending queries</td></tr>' : 
                i.slice(0,5).map(x => `<tr>
                  <td><b>${x.full_name}</b></td>
                  <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.service_item}</td>
                  <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-header"><span class="card-title">Quick Actions & Reports</span></div>
      <div class="card-body" style="display:flex;gap:16px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="exp-attendance">Attendance CSV</button>
        <button class="btn btn-secondary" id="exp-clients">Client List CSV</button>
        <button class="btn btn-secondary" id="exp-stocks">Inventory CSV</button>
        <button class="btn btn-primary" id="view-eod">EOD Summaries</button>
      </div>
    </div>
  `;

  // Bindings
  container.querySelector('#exp-attendance').onclick = () => exportToCSV('attendance.csv', a);
  container.querySelector('#exp-clients').onclick = () => exportToCSV('clients.csv', p.filter(x=>x.role==='client'));
  container.querySelector('#exp-stocks').onclick = () => exportToCSV('stocks.csv', s);
  container.querySelector('#view-eod').onclick = () => renderEODReports(container);
  
  container.querySelectorAll('.inq-btn').forEach(btn => {
    btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderAdminDashboard(container));
  });
}

// ── INQUIRY MANAGEMENT (Neumorphic Modal) ────────────────
async function openInquiryDetail(id, onDone) {
  const { data: i } = await supabase.from('inquiries').select('*').eq('id', id).single();
  const { data: employees } = await supabase.from('profiles').select('*').eq('role', 'employee');
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Query Detail</span>
        <button class="modal-close" id="ci">✕</button>
      </div>
      <div class="modal-body">
        <div style="padding:20px; border-radius:20px; box-shadow:var(--neu-inner); background:var(--bg-soft); margin-bottom:24px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
            <div><label style="font-size:.75rem; color:var(--text3);">Name</label><div style="font-weight:700">${i.full_name}</div></div>
            <div><label style="font-size:.75rem; color:var(--text3);">Phone</label><div style="font-weight:700">${i.phone}</div></div>
          </div>
          <label style="font-size:.75rem; color:var(--text3);">Requirement</label>
          <p style="margin-top:4px; line-height:1.6;">${i.service_item}</p>
        </div>

        <div class="form-group">
          <label>Assign to Technician</label>
          <select id="assign-to">
            <option value="">-- Choose Staff --</option>
            ${(employees||[]).map(e => `<option value="${e.id}">${e.full_name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ci2">Close</button>
        <button class="btn btn-primary" id="assign-btn">Assign & Track</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ci').onclick = overlay.querySelector('#ci2').onclick = () => overlay.remove();
  
    overlay.querySelector('#assign-btn').onclick = async () => {
    const empId = overlay.querySelector('#assign-to').value;
    if (!empId) { toast('Please select staff', 'warning'); return; }
    
    const btn = overlay.querySelector('#assign-btn');
    btn.disabled = true; btn.textContent = 'Processing...';

    // SMART LINKING: Try to find an existing client by phone number
    const { data: existingClient } = await supabase.from('profiles')
      .select('id')
      .eq('phone', i.phone)
      .single();

    const { data: ticket, error: tErr } = await supabase.from('tickets').insert({
      title: `Service: ${i.service_item.slice(0,30)}`,
      description: `Inquiry from ${i.full_name}. Phone: ${i.phone}. Requirement: ${i.service_item}`,
      assigned_to: empId,
      client_id: existingClient ? existingClient.id : null,
      status: 'open',
      category: 'service_request'
    }).select().single();
    
    if (!tErr) {
      await supabase.from('inquiries').update({ 
        status: 'assigned', 
        ticket_id: ticket.id 
      }).eq('id', i.id);
      
      toast(existingClient ? 'Technician assigned & linked to client!' : 'Technician assigned!', 'success');
      overlay.remove();
      onDone();
    } else {
      toast(tErr.message, 'error');
      btn.disabled = false; btn.textContent = 'Assign & Track';
    }
  };
}

// ── OTHER PAGES ───────────────────────────────────────
export async function renderAttendance(container) {
  const { data: logs } = await supabase.from('attendance').select('*, profiles(full_name)').order('date', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>Attendance logs</h1></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Employee</th><th>Clock In</th><th>Location</th></tr></thead>
          <tbody>
            ${(logs||[]).map(x => `<tr>
              <td>${formatDate(x.date)}</td>
              <td><b>${x.profiles?.full_name || '—'}</b></td>
              <td><span class="badge badge-open">${formatTime(x.clock_in)}</span></td>
              <td><small>${x.location || '—'}</small></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function renderInquiries(container) {
  const { data: list } = await supabase.from('inquiries').select('*').order('created_at', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>Inquiries</h1></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Name</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${(list||[]).map(x => `<tr>
              <td>${formatDate(x.created_at)}</td>
              <td><b>${x.full_name}</b></td>
              <td><span class="badge badge-${x.status}">${x.status}</span></td>
              <td><button class="btn btn-primary btn-sm inq-btn" data-id="${x.id}">View</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelectorAll('.inq-btn').forEach(btn => btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderInquiries(container)));
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
  container.innerHTML = `
    <div class="page-header"><h1>Daily Summaries</h1></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Staff</th><th>Summary</th></tr></thead>
          <tbody>
            ${(reports||[]).map(x => `<tr>
              <td>${formatDate(x.date)}</td>
              <td><b>${x.profiles?.full_name || '—'}</b></td>
              <td style="max-width:300px;font-size:.85rem">${x.content}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function renderAllTickets(container) {
  const { data: tickets } = await supabase.from('tickets').select('*, profiles!tickets_client_id_fkey(full_name)').order('created_at', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>Tickets & Tasks</h1></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Client</th><th>Title</th><th>Status</th></tr></thead>
          <tbody>
            ${(tickets||[]).map(t => `<tr>
              <td>${t.profiles?.full_name||'Inquiry'}</td>
              <td>${t.title}</td>
              <td><span class="badge badge-${t.status}">${t.status}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
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
