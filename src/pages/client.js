import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime } from '../utils.js';

// ── CLIENT DASHBOARD (Inquiry First) ──────────────────
export async function renderClientDashboard(container) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  container.innerHTML = `
    <div class="page-header">
      <h1>Service Portal</h1>
      <p>Welcome, ${profile?.full_name || 'Client'}. How can we help you today?</p>
    </div>

    <div class="grid-layout" style="display:grid; grid-template-columns: 1.5fr 1fr; gap:24px;">
      <!-- Main Inquiry Form -->
      <div class="card" style="grid-column: span 1">
        <div class="card-header">
          <span class="card-title">🚀 New Service Request</span>
        </div>
        <div class="card-body">
          <p style="color:var(--text2); margin-bottom:20px; font-size:0.9rem;">Fill in the details below to request a service or item. Our team will get back to you shortly.</p>
          
          <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="dash-i-name" value="${profile?.full_name || ''}" placeholder="John Doe">
            </div>
            <div class="form-group">
              <label>Phone Number</label>
              <input type="text" id="dash-i-phone" value="${profile?.phone || ''}" placeholder="9876543210">
            </div>
          </div>
          
          <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div class="form-group">
              <label>Location / Address</label>
              <input type="text" id="dash-i-loc" value="${profile?.address || ''}" placeholder="Area, City">
            </div>
            <div class="form-group">
              <label>Bill Number (Optional)</label>
              <input type="text" id="dash-i-bill" placeholder="e.g. INV-1234">
            </div>
          </div>

          <div class="form-group">
            <label>Service or Item Needed</label>
            <textarea id="dash-i-service" rows="4" placeholder="Please describe exactly what you need..."></textarea>
          </div>

          <button class="btn btn-primary" id="btn-submit-dash-inquiry" style="margin-top:8px;">Submit Service Request</button>
        </div>
      </div>

      <!-- Side Column: Stats & Recent -->
      <div style="display:flex; flex-direction:column; gap:24px;">
        <div class="card">
          <div class="card-header"><span class="card-title">Your Activity</span></div>
          <div class="card-body">
            <div id="client-mini-stats">Loading...</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Need Technical Support?</span></div>
          <div class="card-body">
            <p style="color:var(--text2); font-size:0.85rem; margin-bottom:16px;">If you have an existing ticket or a complex technical issue, use our ticket system.</p>
            <button class="btn btn-secondary" style="width:100%" id="goto-tickets">View My Tickets</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Handle Inquiry Submission
  container.querySelector('#btn-submit-dash-inquiry').onclick = async () => {
    const btn = container.querySelector('#btn-submit-dash-inquiry');
    const name = container.querySelector('#dash-i-name').value.trim();
    const phone = container.querySelector('#dash-i-phone').value.trim();
    const service = container.querySelector('#dash-i-service').value.trim();

    if (!name || !phone || !service) {
      toast('Please fill in Name, Phone, and Service needed', 'warning');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';

    const { error } = await supabase.from('inquiries').insert({
      full_name: name,
      phone,
      location: container.querySelector('#dash-i-loc').value.trim(),
      bill_no: container.querySelector('#dash-i-bill').value.trim(),
      service_item: service
    });

    if (error) {
      toast(error.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Service Request';
    } else {
      toast('Request submitted! We will contact you soon.', 'success');
      container.querySelector('#dash-i-service').value = '';
      btn.disabled = false;
      btn.textContent = 'Submit Service Request';
      loadMiniStats(container.querySelector('#client-mini-stats'), user.id);
    }
  };

  container.querySelector('#goto-tickets').onclick = () => {
    const navItem = document.querySelector('[data-nav="my-tickets"]');
    if (navItem) navItem.click();
  };

  loadMiniStats(container.querySelector('#client-mini-stats'), user.id);
}

async function loadMiniStats(el, userId) {
  const { data: tickets } = await supabase.from('tickets').select('status').eq('client_id', userId);
  const t = tickets || [];
  const open = t.filter(x => x.status === 'open').length;
  const resolved = t.filter(x => x.status === 'resolved').length;

  el.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:var(--text2);">Open Tickets</span>
        <span class="badge badge-open">${open}</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:var(--text2);">Resolved</span>
        <span class="badge badge-resolved">${resolved}</span>
      </div>
    </div>
  `;
}

// ── CLIENT TICKETS PAGE ────────────────────────────────
export async function renderClientTickets(container) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: tickets } = await supabase.from('tickets').select('*').eq('client_id', user.id).order('created_at', { ascending: false });
  const list = tickets || [];

  container.innerHTML = `
    <div class="page-header"><h1>My Tickets</h1><p>View and manage your support requests</p></div>
    <div class="filter-bar">
      <div class="search-input-wrap"><span>🔍</span><input class="search-input" id="search" placeholder="Search tickets…"/></div>
      <select id="status-filter" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:.88rem;outline:none;">
        <option value="">All Statuses</option>
        <option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
      </select>
      <button class="btn btn-primary btn-sm" id="new-ticket-btn" style="width:auto">+ New Ticket</button>
    </div>
    <div id="tickets-list"></div>`;

  let filtered = [...list];
  const render = () => renderTicketList(container.querySelector('#tickets-list'), filtered, user.id, () => renderClientTickets(container));

  container.querySelector('#search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    filtered = list.filter(t => t.title.toLowerCase().includes(q));
    render();
  });
  container.querySelector('#status-filter').addEventListener('change', e => {
    const s = e.target.value;
    filtered = s ? list.filter(t => t.status === s) : [...list];
    render();
  });
  render();
  container.querySelector('#new-ticket-btn').onclick = () => openTicketModal(user.id, () => renderClientTickets(container));
}

function renderTicketList(el, tickets, userId, refresh) {
  if (!tickets.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎫</div><div class="empty-title">No tickets yet</div></div>`;
    return;
  }
  el.innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:20px;">
      ${tickets.map(t => `
        <div class="ticket-card priority-${t.priority||'medium'}" data-id="${t.id}" style="background:var(--bg2); border:1px solid var(--border); border-radius:16px; padding:20px; cursor:pointer; transition:0.2s;">
          <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
            <span style="font-size:0.75rem; color:var(--text3);">#${t.id.slice(0,8)}</span>
            <span class="badge badge-${t.status}">${t.status}</span>
          </div>
          <div style="font-weight:700; margin-bottom:16px; font-size:1.1rem;">${t.title}</div>
          <div style="font-size:0.8rem; color:var(--text3); border-top:1px solid var(--border); padding-top:12px;">
            📅 ${formatDate(t.created_at)}
          </div>
        </div>`).join('')}
    </div>`;
  el.querySelectorAll('.ticket-card').forEach(card => {
    card.onclick = () => openTicketDetail(card.dataset.id, refresh);
    card.onmouseover = () => card.style.borderColor = 'var(--primary)';
    card.onmouseout = () => card.style.borderColor = 'var(--border)';
  });
}

function openTicketModal(clientId, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header"><span class="modal-title">New Support Ticket</span><button class="modal-close" id="close-modal">✕</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Title</label><input type="text" id="t-title" placeholder="Brief description of issue" required/></div>
        <div class="form-group"><label>Category</label>
          <select id="t-category">
            <option value="network">Network Issue</option><option value="hardware">Hardware</option><option value="other">Other</option>
          </select>
        </div>
        <div class="form-group"><label>Priority</label>
          <select id="t-priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select>
        </div>
        <div class="form-group"><label>Description</label><textarea id="t-desc" placeholder="Describe the issue in detail…"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-modal">Cancel</button>
        <button class="btn btn-primary" id="submit-ticket" style="width:auto">Submit Ticket</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#close-modal').onclick = overlay.querySelector('#cancel-modal').onclick = () => overlay.remove();
  overlay.querySelector('#submit-ticket').onclick = async () => {
    const title = overlay.querySelector('#t-title').value.trim();
    if (!title) { toast('Please enter a title', 'error'); return; }
    await supabase.from('tickets').insert({
      client_id: clientId, title,
      category: overlay.querySelector('#t-category').value,
      priority: overlay.querySelector('#t-priority').value,
      description: overlay.querySelector('#t-desc').value.trim()
    });
    toast('Ticket submitted!', 'success');
    overlay.remove();
    onSave && onSave();
  };
}

async function openTicketDetail(ticketId, onClose) {
  const { data: t } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
  const { data: comments } = await supabase.from('ticket_comments').select('*, profiles(full_name)').eq('ticket_id', ticketId).order('created_at');
  if (!t) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px">
      <div class="modal-header">
        <div><div class="modal-title">${t.title}</div><div style="font-size:.75rem;color:var(--text3);">#${t.id.slice(0,8)}</div></div>
        <button class="modal-close" id="cd">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:8px;margin-bottom:16px"><span class="badge badge-${t.status}">${t.status}</span><span class="badge badge-${t.priority}">${t.priority}</span></div>
        <p style="color:var(--text2);font-size:.9rem;margin-bottom:20px">${t.description||'No description.'}</p>
        
        <div style="font-weight:600;margin-bottom:12px">💬 Comments</div>
        <div id="comments-list" style="margin-bottom:16px; max-height:200px; overflow-y:auto;">
          ${(comments||[]).map(c => `
            <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-weight:600;font-size:.85rem">${c.profiles?.full_name||'User'}</span><span style="font-size:.75rem;color:var(--text3)">${formatDateTime(c.created_at)}</span></div>
              <div style="font-size:.88rem;color:var(--text2)">${c.content}</div>
            </div>`).join('')}
        </div>
        <div class="form-group"><textarea id="new-comment" placeholder="Add a comment…"></textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="cd2">Close</button><button class="btn btn-primary" style="width:auto" id="add-c">Add Comment</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cd').onclick = overlay.querySelector('#cd2').onclick = () => { overlay.remove(); onClose && onClose(); };
  
  overlay.querySelector('#add-c').onclick = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const content = overlay.querySelector('#new-comment').value.trim();
    if (!content) return;
    await supabase.from('ticket_comments').insert({ ticket_id: ticketId, user_id: user.id, content });
    toast('Comment added', 'success');
    overlay.remove();
    openTicketDetail(ticketId, onClose);
  };
}
