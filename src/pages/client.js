import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime } from '../utils.js';

// ── CLIENT DASHBOARD ──────────────────────────────────
export async function renderClientDashboard(container) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: tickets } = await supabase.from('tickets').select('*').eq('client_id', user.id).order('created_at', { ascending: false });
  const list = tickets || [];
  const open = list.filter(t => t.status === 'open').length;
  const inprog = list.filter(t => t.status === 'in_progress').length;
  const resolved = list.filter(t => t.status === 'resolved').length;

  container.innerHTML = `
    <div class="page-header"><h1>My Dashboard</h1><p>Track your service requests and support tickets</p></div>
    <div class="stats-grid">
      <div class="stat-card" style="--card-color:#06B6D4">
        <div class="stat-value">${open}</div><div class="stat-label">Open Tickets</div><div class="stat-icon">🎫</div>
      </div>
      <div class="stat-card" style="--card-color:#F59E0B">
        <div class="stat-value">${inprog}</div><div class="stat-label">In Progress</div><div class="stat-icon">⚙️</div>
      </div>
      <div class="stat-card" style="--card-color:#10B981">
        <div class="stat-value">${resolved}</div><div class="stat-label">Resolved</div><div class="stat-icon">✅</div>
      </div>
      <div class="stat-card" style="--card-color:#1B4FD8">
        <div class="stat-value">${list.length}</div><div class="stat-label">Total Tickets</div><div class="stat-icon">📋</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Recent Tickets</span>
        <button class="btn btn-primary btn-sm" id="new-ticket-btn">+ New Ticket</button>
      </div>
      <div class="card-body" id="tickets-list"></div>
    </div>`;

  renderTicketList(container.querySelector('#tickets-list'), list);
  container.querySelector('#new-ticket-btn').addEventListener('click', () => openTicketModal(user.id, () => renderClientDashboard(container)));
}

// ── CLIENT TICKETS PAGE ────────────────────────────────
export async function renderClientTickets(container) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: tickets } = await supabase.from('tickets').select('*').eq('client_id', user.id).order('created_at', { ascending: false });
  const list = tickets || [];

  container.innerHTML = `
    <div class="page-header"><h1>My Tickets</h1><p>All your support requests</p></div>
    <div class="filter-bar">
      <div class="search-input-wrap"><span>🔍</span><input class="search-input" id="search" placeholder="Search tickets…"/></div>
      <select id="status-filter" class="form-group" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:.88rem;outline:none;">
        <option value="">All Statuses</option>
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>
      <button class="btn btn-primary btn-sm" id="new-ticket-btn">+ New Ticket</button>
    </div>
    <div id="tickets-list"></div>`;

  let filtered = [...list];
  const render = () => renderTicketList(container.querySelector('#tickets-list'), filtered, user.id, () => renderClientTickets(container));

  container.querySelector('#search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    filtered = list.filter(t => t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q));
    render();
  });
  container.querySelector('#status-filter').addEventListener('change', e => {
    const s = e.target.value;
    filtered = s ? list.filter(t => t.status === s) : [...list];
    render();
  });
  render();
  container.querySelector('#new-ticket-btn').addEventListener('click', () => openTicketModal(user.id, () => renderClientTickets(container)));
}

function renderTicketList(el, tickets, userId, refresh) {
  if (!tickets.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎫</div><div class="empty-title">No tickets yet</div><div class="empty-desc">Create a new ticket to get started</div></div>`;
    return;
  }
  el.innerHTML = tickets.map(t => `
    <div class="ticket-card priority-${t.priority||'medium'}" data-id="${t.id}">
      <div class="ticket-meta">
        <span class="ticket-id">#${t.id.slice(0,8)}</span>
        <span class="badge badge-${t.status}">${t.status.replace('_',' ')}</span>
        <span class="badge badge-${t.priority||'medium'}">${t.priority||'medium'}</span>
      </div>
      <div class="ticket-title">${t.title}</div>
      <div class="ticket-desc">${t.description||''}</div>
      <div class="ticket-footer">
        <span class="ticket-date">📅 ${formatDate(t.created_at)}</span>
        ${t.updated_at !== t.created_at ? `<span class="ticket-date">Updated ${formatDateTime(t.updated_at)}</span>` : ''}
      </div>
    </div>`).join('');
  el.querySelectorAll('.ticket-card').forEach(card => {
    card.addEventListener('click', () => openTicketDetail(card.dataset.id, refresh));
  });
}

function openTicketModal(clientId, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">New Support Ticket</span>
        <button class="modal-close" id="close-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Title</label><input type="text" id="t-title" placeholder="Brief description of issue" required/></div>
        <div class="form-group"><label>Category</label>
          <select id="t-category">
            <option value="network">Network Issue</option>
            <option value="cctv">CCTV / Camera</option>
            <option value="hardware">Hardware</option>
            <option value="software">Software</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group"><label>Priority</label>
          <select id="t-priority">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div class="form-group"><label>Description</label><textarea id="t-desc" placeholder="Describe the issue in detail…"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-modal">Cancel</button>
        <button class="btn btn-primary" id="submit-ticket" style="width:auto">Submit Ticket</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#close-modal').onclick = () => overlay.remove();
  overlay.querySelector('#cancel-modal').onclick = () => overlay.remove();
  overlay.querySelector('#submit-ticket').onclick = async () => {
    const title = overlay.querySelector('#t-title').value.trim();
    if (!title) { toast('Please enter a title', 'error'); return; }
    const { error } = await supabase.from('tickets').insert({
      client_id: clientId,
      title,
      category: overlay.querySelector('#t-category').value,
      priority: overlay.querySelector('#t-priority').value,
      description: overlay.querySelector('#t-desc').value.trim(),
      status: 'open'
    });
    if (error) { 
      console.error('Ticket Insert Error:', error);
      toast(error.message || 'Failed to submit ticket', 'error'); 
      return; 
    }
    toast('Ticket submitted!', 'success');
    overlay.remove();
    onSave && onSave();
  };
}

async function openTicketDetail(ticketId, onClose) {
  const { data: t } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
  const { data: comments } = await supabase.from('ticket_comments').select('*, profiles(full_name, role)').eq('ticket_id', ticketId).order('created_at');
  if (!t) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px">
      <div class="modal-header">
        <div>
          <div class="modal-title">${t.title}</div>
          <div style="font-size:.75rem;color:var(--text3);margin-top:2px">#${t.id.slice(0,8)} · ${t.category||'General'}</div>
        </div>
        <button class="modal-close" id="close-detail">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <span class="badge badge-${t.status}">${t.status.replace('_',' ')}</span>
          <span class="badge badge-${t.priority}">${t.priority}</span>
        </div>
        <p style="color:var(--text2);font-size:.9rem;margin-bottom:20px">${t.description||'No description.'}</p>
        <div style="font-size:.8rem;color:var(--text3);margin-bottom:20px">Created: ${formatDateTime(t.created_at)}</div>
        <div style="font-weight:600;margin-bottom:12px">💬 Comments</div>
        <div id="comments-list" style="margin-bottom:16px">
          ${(comments||[]).length === 0 ? '<div style="color:var(--text3);font-size:.88rem">No comments yet.</div>' :
            (comments||[]).map(c => `
              <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                  <span style="font-weight:600;font-size:.85rem">${c.profiles?.full_name||'User'} <span class="badge badge-${c.profiles?.role||'client'}" style="margin-left:4px">${c.profiles?.role||'client'}</span></span>
                  <span style="font-size:.75rem;color:var(--text3)">${formatDateTime(c.created_at)}</span>
                </div>
                <div style="font-size:.88rem;color:var(--text2)">${c.content}</div>
              </div>`).join('')
          }
        </div>
        <div class="form-group"><label>Add Comment</label><textarea id="new-comment" placeholder="Type your comment…"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="close-detail2">Close</button>
        <button class="btn btn-primary" style="width:auto" id="add-comment-btn">Add Comment</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); onClose && onClose(); };
  overlay.querySelector('#close-detail').onclick = close;
  overlay.querySelector('#close-detail2').onclick = close;
  overlay.querySelector('#add-comment-btn').onclick = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const content = overlay.querySelector('#new-comment').value.trim();
    if (!content) return;
    await supabase.from('ticket_comments').insert({ ticket_id: ticketId, user_id: user.id, content });
    toast('Comment added', 'success');
    overlay.remove();
    openTicketDetail(ticketId, onClose);
  };
}
