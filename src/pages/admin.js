import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime, initials } from '../utils.js';

// ── ADMIN / EMPLOYEE DASHBOARD ────────────────────────
export async function renderAdminDashboard(container) {
  const [{ data: tickets }, { data: clients }, { data: profiles }] = await Promise.all([
    supabase.from('tickets').select('*'),
    supabase.from('profiles').select('*').eq('role', 'client'),
    supabase.from('profiles').select('*')
  ]);
  const t = tickets || [], c = clients || [], p = profiles || [];
  const open = t.filter(x => x.status === 'open').length;
  const inprog = t.filter(x => x.status === 'in_progress').length;
  const resolved = t.filter(x => x.status === 'resolved').length;

  container.innerHTML = `
    <div class="page-header"><h1>Command Center</h1><p>Overview of all operations</p></div>
    <div class="stats-grid">
      <div class="stat-card" style="--card-color:#06B6D4"><div class="stat-value">${open}</div><div class="stat-label">Open Tickets</div><div class="stat-icon">🎫</div></div>
      <div class="stat-card" style="--card-color:#F59E0B"><div class="stat-value">${inprog}</div><div class="stat-label">In Progress</div><div class="stat-icon">⚙️</div></div>
      <div class="stat-card" style="--card-color:#10B981"><div class="stat-value">${resolved}</div><div class="stat-label">Resolved</div><div class="stat-icon">✅</div></div>
      <div class="stat-card" style="--card-color:#1B4FD8"><div class="stat-value">${c.length}</div><div class="stat-label">Clients</div><div class="stat-icon">👥</div></div>
      <div class="stat-card" style="--card-color:#8B5CF6"><div class="stat-value">${p.length}</div><div class="stat-label">Users</div><div class="stat-icon">👤</div></div>
      <div class="stat-card" style="--card-color:#EC4899"><div class="stat-value">${t.length}</div><div class="stat-label">Total Tickets</div><div class="stat-icon">📋</div></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Recent Tickets</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Priority</th><th>Created</th></tr></thead>
          <tbody>
            ${t.slice(0,10).map(x => `<tr>
              <td style="font-family:monospace;font-size:.75rem;color:var(--text3)">#${x.id.slice(0,8)}</td>
              <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.title}</td>
              <td><span class="badge badge-${x.status}">${x.status.replace('_',' ')}</span></td>
              <td><span class="badge badge-${x.priority}">${x.priority||'—'}</span></td>
              <td style="color:var(--text2)">${formatDate(x.created_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── ALL TICKETS (admin/employee) ───────────────────────
export async function renderAllTickets(container) {
  const { data: tickets } = await supabase.from('tickets').select('*, profiles!tickets_client_id_fkey(full_name)').order('created_at', { ascending: false });
  const list = tickets || [];

  container.innerHTML = `
    <div class="page-header"><h1>All Tickets</h1><p>Manage and respond to all support requests</p></div>
    <div class="filter-bar">
      <div class="search-input-wrap"><span>🔍</span><input class="search-input" id="search" placeholder="Search…"/></div>
      <select id="sf" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:.88rem;outline:none">
        <option value="">All Statuses</option>
        <option value="open">Open</option><option value="in_progress">In Progress</option>
        <option value="resolved">Resolved</option><option value="closed">Closed</option>
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
  if (!tickets.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎫</div><div class="empty-title">No tickets found</div></div>`;
    return;
  }
  el.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>ID</th><th>Client</th><th>Title</th><th>Status</th><th>Priority</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${tickets.map(t => `<tr>
      <td style="font-family:monospace;font-size:.75rem;color:var(--text3)">#${t.id.slice(0,8)}</td>
      <td>${t.profiles?.full_name||'Unknown'}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</td>
      <td><span class="badge badge-${t.status}">${t.status.replace('_',' ')}</span></td>
      <td><span class="badge badge-${t.priority||'medium'}">${t.priority||'medium'}</span></td>
      <td style="color:var(--text2)">${formatDate(t.created_at)}</td>
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
        <div class="form-group"><label>Add Comment</label><textarea id="staff-comment" placeholder="Add a note (optional)…"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cm2">Cancel</button>
        <button class="btn btn-primary" style="width:auto" id="save-update">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#cm').onclick = close;
  overlay.querySelector('#cm2').onclick = close;
  overlay.querySelector('#save-update').onclick = async () => {
    const status = overlay.querySelector('#new-status').value;
    const comment = overlay.querySelector('#staff-comment').value.trim();
    await supabase.from('tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', ticketId);
    if (comment) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('ticket_comments').insert({ ticket_id: ticketId, user_id: user.id, content: comment });
    }
    toast('Ticket updated!', 'success');
    close();
    onDone && onDone();
  };
}

// ── CLIENTS MANAGEMENT (admin only) ───────────────────
export async function renderClients(container) {
  const { data: clients } = await supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false });
  const list = clients || [];

  container.innerHTML = `
    <div class="page-header"><h1>Clients</h1><p>Manage client accounts</p></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Joined</th></tr></thead>
          <tbody>${list.map(c => `<tr>
            <td><div style="display:flex;align-items:center;gap:8px">
              <div class="user-avatar" style="width:28px;height:28px;font-size:.75rem">${initials(c.full_name||c.email)}</div>
              ${c.full_name||'—'}
            </div></td>
            <td style="color:var(--text2)">${c.email||'—'}</td>
            <td style="color:var(--text2)">${c.phone||'—'}</td>
            <td style="color:var(--text2)">${c.company||'—'}</td>
            <td style="color:var(--text2)">${formatDate(c.created_at)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

// ── USER MANAGEMENT (admin only) ──────────────────────
export async function renderUsers(container) {
  const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  const list = users || [];

  container.innerHTML = `
    <div class="page-header"><h1>Users</h1><p>Manage all user accounts and roles</p></div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">All Users</span>
        <button class="btn btn-primary btn-sm" id="invite-btn">+ Invite User</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>${list.map(u => `<tr>
            <td><div style="display:flex;align-items:center;gap:8px">
              <div class="user-avatar" style="width:28px;height:28px;font-size:.75rem">${initials(u.full_name||u.email)}</div>
              ${u.full_name||'—'}
            </div></td>
            <td style="color:var(--text2)">${u.email||'—'}</td>
            <td><span class="badge badge-${u.role||'client'}">${u.role||'client'}</span></td>
            <td style="color:var(--text2)">${formatDate(u.created_at)}</td>
            <td>
              <select class="role-select" data-uid="${u.id}" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text);font-size:.8rem;outline:none">
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
  container.querySelector('#invite-btn').onclick = () => openInviteModal(() => renderUsers(container));
}

function openInviteModal(onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header"><span class="modal-title">Invite User</span><button class="modal-close" id="cm">✕</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Email</label><input type="email" id="inv-email" placeholder="user@example.com"/></div>
        <div class="form-group"><label>Role</label>
          <select id="inv-role"><option value="client">Client</option><option value="employee">Employee</option><option value="admin">Admin</option></select>
        </div>
        <p style="font-size:.82rem;color:var(--text3);margin-top:8px">⚠️ Use Supabase Auth to send invite emails, or create accounts via Supabase dashboard.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cm2">Cancel</button>
        <button class="btn btn-primary" style="width:auto" id="do-invite">Send Invite</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cm').onclick = overlay.querySelector('#cm2').onclick = () => overlay.remove();
  overlay.querySelector('#do-invite').onclick = async () => {
    const email = overlay.querySelector('#inv-email').value.trim();
    if (!email) { toast('Enter an email', 'error'); return; }
    toast('Invite feature requires Supabase admin SDK. Add user via Supabase dashboard.', 'info', 5000);
    overlay.remove();
  };
}
