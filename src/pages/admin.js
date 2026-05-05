import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime, formatTime, initials, exportToCSV } from '../utils.js';

// ── ADMIN COMMAND CENTER ───────────────────────────────
export async function renderAdminDashboard(container) {
  const today = new Date().toLocaleDateString('en-CA');
  let tickets, inquiries, attendance, stocks, profiles;
  try {
    console.log('Fetching Admin Dashboard data for today:', today);
    const res = await Promise.all([
      supabase.from('tickets').select('*'),
      supabase.from('inquiries').select('*').eq('status', 'pending'),
      supabase.from('attendance').select('*, profiles(full_name)').order('clock_in', { ascending: false }),
      supabase.from('stocks').select('*'),
      supabase.from('profiles').select('*')
    ]);
    console.log('Admin Data raw results:', res);
    tickets = res[0].data; inquiries = res[1].data; attendance = res[2].data; stocks = res[3].data; profiles = res[4].data;
    if (res.some(r => r.error)) {
      console.error('Database error in Admin Hub:', res.find(r => r.error).error);
      throw new Error("Database tables missing or connection error. Please run migrations.");
    }
    console.log('Processed Attendance for today:', attendance);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Initialization Error</div><div class="empty-desc">${err.message}</div></div>`;
    return;
  }

  const t = tickets || [], i = inquiries || [], all_a = attendance || [], s = stocks || [], p = profiles || [];
  
  // Filter for today in JS for the counter, but show all in table for now
  const a = all_a.filter(x => x.date === today);
  const lowStock = s.filter(x => x.quantity <= x.min_stock).length;

  container.innerHTML = `
    <div class="page-header"><h1>Admin Hub</h1><p>Real-time operations monitoring</p></div>
    
    <div class="stats-grid">
      <div class="stat-card" style="--card-color:#06B6D4"><div class="stat-value">${a.length}</div><div class="stat-label">Employees Clocked In</div><div class="stat-icon">🕒</div></div>
      <div class="stat-card" style="--card-color:#F59E0B"><div class="stat-value">${i.length}</div><div class="stat-label">New Inquiries</div><div class="stat-icon">📩</div></div>
      <div class="stat-card" style="--card-color:#EF4444"><div class="stat-value">${lowStock}</div><div class="stat-label">Low Stock Items</div><div class="stat-icon">📦</div></div>
      <div class="stat-card" style="--card-color:#10B981"><div class="stat-value">${t.filter(x=>x.status==='open').length}</div><div class="stat-label">Open Tickets</div><div class="stat-icon">🎫</div></div>
    </div>

    <div class="grid-2" style="margin-top:24px">
      <div class="card">
        <div class="card-header"><span class="card-title">Live Attendance (Today)</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Location</th></tr></thead>
            <tbody>
              ${all_a.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text3)">No attendance records found</td></tr>' : 
                all_a.map(x => `<tr>
                  <td>${x.profiles?.full_name || 'Unknown'}</td>
                  <td><span class="badge badge-open">${formatTime(x.clock_in)}</span></td>
                  <td>${x.clock_out ? `<span class="badge badge-closed">${formatTime(x.clock_out)}</span>` : '—'}</td>
                  <td><small>${x.location || '—'}</small></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Pending Inquiries</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Service</th><th>Actions</th></tr></thead>
            <tbody>
              ${i.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text3)">No pending inquiries</td></tr>' : 
                i.slice(0,5).map(x => `<tr>
                  <td>${x.full_name}</td>
                  <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.service_item}</td>
                  <td><button class="btn btn-secondary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-header"><span class="card-title">Quick Actions & Reports</span></div>
      <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-primary" id="exp-attendance">Export Attendance</button>
        <button class="btn btn-primary" id="exp-clients">Export Clients</button>
        <button class="btn btn-primary" id="exp-stocks">Export Stocks</button>
        <button class="btn btn-secondary" id="view-eod">View EOD Reports</button>
        <button class="btn btn-danger" id="test-db">Test Database Connection</button>
      </div>
    </div>
  `;

  container.querySelector('#exp-attendance').onclick = () => exportToCSV('attendance.csv', a);
  container.querySelector('#exp-clients').onclick = () => exportToCSV('clients.csv', p.filter(x=>x.role==='client'));
  container.querySelector('#exp-stocks').onclick = () => exportToCSV('stocks.csv', s);
  container.querySelector('#view-eod').onclick = () => renderEODReports(container);
  
  container.querySelector('#test-db').onclick = async () => {
    toast('Testing connection...', 'info');
    const { data, error } = await supabase.from('stocks').insert({ item_name: 'TEST_ITEM', quantity: 99 }).select();
    if (error) {
      console.error('Test failed:', error);
      alert('DATABASE ERROR: ' + error.message);
    } else {
      console.log('Test success:', data);
      alert('SUCCESS! Database is connected and working. You can now delete the TEST_ITEM from Stocks.');
      renderAdminDashboard(container);
    }
  };
  container.querySelectorAll('.inq-btn').forEach(btn => {
    btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderAdminDashboard(container));
  });
}

// ── ATTENDANCE MONITOR ────────────────────────────────
export async function renderAttendance(container) {
  const { data: logs } = await supabase.from('attendance').select('*, profiles(full_name)').order('date', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>Attendance Logs</h1><p>Full history of employee work hours</p></div>
    <div class="card">
      <div class="card-header"><span class="card-title">All Records</span><button class="btn btn-primary btn-sm" id="exp-all-att">Export All</button></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Employee</th><th>Clock In</th><th>Location</th><th>Clock Out</th></tr></thead>
          <tbody>
            ${(logs||[]).map(x => `<tr>
              <td>${formatDate(x.date)}</td>
              <td>${x.profiles?.full_name || '—'}</td>
              <td>${formatDateTime(x.clock_in)}</td>
              <td><small>${x.location || '—'}</small></td>
              <td>${x.clock_out ? formatDateTime(x.clock_out) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelector('#exp-all-att').onclick = () => exportToCSV('all_attendance.csv', logs);
}

// ── INQUIRY MANAGEMENT ────────────────────────────────
export async function renderInquiries(container) {
  const { data: list } = await supabase.from('inquiries').select('*').order('created_at', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>Inquiries</h1><p>Manage potential clients and service requests</p></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Name</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${(list||[]).map(x => `<tr>
              <td>${formatDate(x.created_at)}</td>
              <td>${x.full_name}</td>
              <td>${x.phone}</td>
              <td><span class="badge badge-${x.status}">${x.status}</span></td>
              <td><button class="btn btn-secondary btn-sm inq-btn" data-id="${x.id}">Manage</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelectorAll('.inq-btn').forEach(btn => {
    btn.onclick = () => openInquiryDetail(btn.dataset.id, () => renderInquiries(container));
  });
}

async function openInquiryDetail(id, onDone) {
  const { data: i } = await supabase.from('inquiries').select('*').eq('id', id).single();
  const { data: employees } = await supabase.from('profiles').select('*').eq('role', 'employee');
  
  let linkedTicket = null;
  let comments = [];
  if (i.ticket_id) {
    const res = await Promise.all([
      supabase.from('tickets').select('*, profiles!tickets_assigned_to_fkey(full_name)').eq('id', i.ticket_id).single(),
      supabase.from('ticket_comments').select('*, profiles(full_name)').eq('ticket_id', i.ticket_id).order('created_at')
    ]);
    linkedTicket = res[0].data;
    comments = res[1].data || [];
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <span class="modal-title">Query Management</span>
        <button class="modal-close" id="ci">✕</button>
      </div>
      <div class="modal-body">
        <!-- Inquiry Info -->
        <div class="card" style="background:var(--bg3); padding:16px; margin-bottom:20px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label style="font-size:.7rem;color:var(--text3);text-transform:uppercase">Name</label><div style="font-weight:600">${i.full_name}</div></div>
            <div><label style="font-size:.7rem;color:var(--text3);text-transform:uppercase">Phone</label><div style="font-weight:600">${i.phone}</div></div>
            <div><label style="font-size:.7rem;color:var(--text3);text-transform:uppercase">Location</label><div>${i.location||'—'}</div></div>
            <div><label style="font-size:.7rem;color:var(--text3);text-transform:uppercase">Status</label><div><span class="badge badge-${i.status}">${i.status}</span></div></div>
          </div>
          <label style="font-size:.7rem;color:var(--text3);text-transform:uppercase">Requirement</label>
          <p style="color:var(--text2);font-size:.9rem;margin-top:4px">${i.service_item}</p>
        </div>

        ${linkedTicket ? `
          <!-- Live Progress Section -->
          <div style="border-top:1px solid var(--border); padding-top:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div style="font-weight:700; color:var(--primary);">📡 Live Progress Tracking</div>
              <span class="badge badge-${linkedTicket.status}">${linkedTicket.status.replace('_',' ')}</span>
            </div>
            
            <div style="background:rgba(255,255,255,0.03); padding:12px; border-radius:12px; margin-bottom:16px;">
              <div style="font-size:.85rem; color:var(--text2); margin-bottom:4px;">Assigned To: <b>${linkedTicket.profiles?.full_name || 'Staff'}</b></div>
              <div style="font-size:.85rem; color:var(--text2);">Last Update: ${formatDateTime(linkedTicket.updated_at || linkedTicket.created_at)}</div>
            </div>

            <div style="font-size:.9rem; font-weight:600; margin-bottom:8px;">Progress Timeline</div>
            <div style="max-height:150px; overflow-y:auto; border-left:2px solid var(--primary); padding-left:16px; margin-left:8px;">
              ${comments.length === 0 ? '<div style="color:var(--text3); font-size:.85rem;">No progress notes yet...</div>' : 
                comments.map(c => `
                  <div style="margin-bottom:12px; position:relative;">
                    <div style="font-size:.7rem; color:var(--text3);">${formatDateTime(c.created_at)}</div>
                    <div style="font-size:.85rem; color:var(--text2);">${c.content}</div>
                  </div>
                `).join('')}
            </div>
          </div>
        ` : `
          <!-- Assignment Form -->
          <div class="form-group" style="margin-top:20px;">
            <label>Assign to Employee for Service</label>
            <select id="assign-to">
              <option value="">-- Select Staff Member --</option>
              ${(employees||[]).map(e => `<option value="${e.id}">${e.full_name}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary" id="assign-btn" style="width:100%">Assign & Start Tracking</button>
        `}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ci2">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ci').onclick = overlay.querySelector('#ci2').onclick = () => overlay.remove();
  
  const assignBtn = overlay.querySelector('#assign-btn');
  if (assignBtn) {
    assignBtn.onclick = async () => {
      const empId = overlay.querySelector('#assign-to').value;
      if (!empId) { toast('Select an employee', 'warning'); return; }
      
      assignBtn.disabled = true;
      assignBtn.textContent = 'Assigning...';

      // 1. Create a ticket
      const { data: ticket, error: tErr } = await supabase.from('tickets').insert({
        title: `Service: ${i.service_item.slice(0,30)}...`,
        description: `Inquiry from ${i.full_name} (${i.phone}). Requirement: ${i.service_item}`,
        assigned_to: empId,
        client_id: null, // Allow null for new leads
        status: 'open',
        priority: 'medium',
        category: 'service_request'
      }).select().single();
      
      if (tErr) { toast(tErr.message, 'error'); assignBtn.disabled = false; return; }

      // 2. Update inquiry status and link ticket
      await supabase.from('inquiries').update({ status: 'assigned', ticket_id: ticket.id }).eq('id', i.id);
      
      toast('Query assigned successfully!', 'success');
      overlay.remove();
      onDone();
    };
  }
}

// ── STOCK MANAGEMENT ───────────────────────────────────
export async function renderStocks(container) {
  const { data: stocks } = await supabase.from('stocks').select('*').order('item_name');
  container.innerHTML = `
    <div class="page-header"><h1>Stock Inventory</h1><p>Monitor and manage day-to-day stock details</p></div>
    <div class="card">
      <div class="card-header"><span class="card-title">Inventory List</span><button class="btn btn-primary btn-sm" id="add-stock-btn">+ Add Item</button></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Item Name</th><th>Quantity</th><th>Min Stock</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${(stocks||[]).map(x => `<tr>
              <td>${x.item_name}</td>
              <td><b>${x.quantity}</b> ${x.unit}</td>
              <td>${x.min_stock}</td>
              <td><span class="badge badge-${x.quantity <= x.min_stock ? 'error' : 'success'}">${x.quantity <= x.min_stock ? 'Low' : 'OK'}</span></td>
              <td><button class="btn btn-secondary btn-sm edit-stock" data-id="${x.id}">Update</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  container.querySelector('#add-stock-btn').onclick = () => openStockModal(null, () => renderStocks(container));
  container.querySelectorAll('.edit-stock').forEach(btn => {
    btn.onclick = () => openStockModal(btn.dataset.id, () => renderStocks(container));
  });
}

function openStockModal(id, onDone) {
  const itemName = prompt('Item Name');
  if (!itemName) return;
  const qty = parseInt(prompt('Quantity'));
  if (isNaN(qty)) return;
  
  (async () => {
    let res;
    if (id) {
      res = await supabase.from('stocks').update({ item_name: itemName, quantity: qty }).eq('id', id);
    } else {
      res = await supabase.from('stocks').insert({ item_name: itemName, quantity: qty, unit: 'pcs', min_stock: 5 });
    }
    
    if (res.error) {
      console.error('Error updating stock:', res.error);
      toast('Error: ' + res.error.message, 'error');
    } else {
      toast('Stock updated', 'success');
      onDone();
    }
  })();
}

// ── EOD REPORTS ───────────────────────────────────────
export async function renderEODReports(container) {
  const { data: reports } = await supabase.from('eod_reports').select('*, profiles(full_name)').order('date', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>Employee EOD Reports</h1><p>Daily summaries of employee work</p></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Employee</th><th>Report Content</th></tr></thead>
          <tbody>
            ${(reports||[]).map(x => `<tr>
              <td>${formatDate(x.date)}</td>
              <td>${x.profiles?.full_name || '—'}</td>
              <td style="max-width:400px;white-space:pre-wrap;font-size:.88rem">${x.content}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <button class="btn btn-secondary" style="margin-top:16px" id="back-dash">Back to Hub</button>
  `;
  container.querySelector('#back-dash').onclick = () => renderAdminDashboard(container);
}

// ── REUSING EXISTING TICKET/USER LOGIC ────────────────
export async function renderAllTickets(container) {
  const { data: tickets } = await supabase.from('tickets').select('*, profiles!tickets_client_id_fkey(full_name)').order('created_at', { ascending: false });
  const list = tickets || [];

  container.innerHTML = `
    <div class="page-header"><h1>All Tickets</h1><p>Manage support requests</p></div>
    <div class="filter-bar">
      <div class="search-input-wrap"><span>🔍</span><input class="search-input" id="search" placeholder="Search…"/></div>
      <select id="sf" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:.88rem;outline:none">
        <option value="">All Statuses</option>
        <option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
      </select>
    </div>
    <div id="ticket-table-wrap"></div>`;

  let filtered = [...list];
  const render = () => renderTicketTable(container.querySelector('#ticket-table-wrap'), filtered, () => renderAllTickets(container));
  container.querySelector('#search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    filtered = list.filter(t => t.title.toLowerCase().includes(q));
    render();
  });
  container.querySelector('#sf').addEventListener('change', e => {
    filtered = e.target.value ? list.filter(t => t.status === e.target.value) : [...list];
    render();
  });
  render();
}

function renderTicketTable(el, tickets, refresh) {
  el.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Client</th><th>Title</th><th>Status</th><th>Priority</th><th>Actions</th></tr></thead>
    <tbody>${tickets.map(t => `<tr>
      <td>${t.profiles?.full_name||'Inquiry'}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</td>
      <td><span class="badge badge-${t.status}">${t.status}</span></td>
      <td><span class="badge badge-${t.priority||'medium'}">${t.priority||'medium'}</span></td>
      <td><button class="btn btn-secondary btn-sm update-btn" data-id="${t.id}" data-status="${t.status}">Update</button></td>
    </tr>`).join('')}</tbody>
  </table></div></div>`;
  el.querySelectorAll('.update-btn').forEach(btn => {
    btn.addEventListener('click', () => openUpdateModal(btn.dataset.id, btn.dataset.status, refresh));
  });
}

function openUpdateModal(ticketId, currentStatus, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header"><span class="modal-title">Update Ticket</span><button class="modal-close" id="cm">✕</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Status</label>
          <select id="new-status">
            <option value="open" ${currentStatus==='open'?'selected':''}>Open</option>
            <option value="in_progress" ${currentStatus==='in_progress'?'selected':''}>In Progress</option>
            <option value="resolved" ${currentStatus==='resolved'?'selected':''}>Resolved</option>
            <option value="closed" ${currentStatus==='closed'?'selected':''}>Closed</option>
          </select>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="cm2">Cancel</button><button class="btn btn-primary" style="width:auto" id="save-update">Save</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cm').onclick = overlay.querySelector('#cm2').onclick = () => overlay.remove();
  overlay.querySelector('#save-update').onclick = async () => {
    await supabase.from('tickets').update({ status: overlay.querySelector('#new-status').value, updated_at: new Date().toISOString() }).eq('id', ticketId);
    toast('Ticket updated!', 'success');
    overlay.remove();
    onDone();
  };
}

export async function renderClients(container) {
  const { data: clients } = await supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>Clients</h1><p>Manage client accounts</p></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th></tr></thead>
          <tbody>${(clients||[]).map(c => `<tr>
            <td>${c.full_name||'—'}</td>
            <td>${c.email||'—'}</td>
            <td>${c.phone||'—'}</td>
            <td>${c.company||'—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

export async function renderUsers(container) {
  const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  container.innerHTML = `
    <div class="page-header"><h1>Users</h1><p>Manage all accounts and roles</p></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
          <tbody>${(users||[]).map(u => `<tr>
            <td>${u.full_name||'—'}</td>
            <td>${u.email||'—'}</td>
            <td><span class="badge badge-${u.role||'client'}">${u.role||'client'}</span></td>
            <td>
              <select class="role-select" data-uid="${u.id}">
                <option ${u.role==='client'?'selected':''} value="client">Client</option>
                <option ${u.role==='employee'?'selected':''} value="employee">Employee</option>
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
