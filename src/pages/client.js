import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime } from '../utils.js';

function displayStatus(status) {
  return status === 'closed' ? 'resolved' : (status || 'open');
}

function statusText(status) {
  const shown = displayStatus(status);
  const labels = {
    open: 'received',
    assigned: 'assigned',
    in_progress: 'in progress',
    resolved: 'resolved',
  };
  return labels[shown] || shown.replace('_', ' ');
}

// ── CLIENT DASHBOARD (Inquiry First) ──────────────────
export async function renderClientDashboard(container) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  container.innerHTML = `
    <div class="page-header">
      <h1>Service Portal</h1>
      <p>Welcome back, ${profile?.full_name || 'Client'}</p>
    </div>

    <div class="grid-layout">
      <!-- Main Inquiry Form -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🚀 New Service Request</span>
        </div>
        <div class="card-body">
          <p style="color:var(--text2); margin-bottom:24px; font-size:0.95rem;">Fill in the details below. Our team will get back to you shortly.</p>
          
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="dash-i-name" value="${profile?.full_name || ''}" placeholder="John Doe">
            </div>
            <div class="form-group">
              <label>Phone Number</label>
              <input type="text" id="dash-i-phone" value="${profile?.phone || ''}" placeholder="9876543210">
            </div>
          </div>
          
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
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
            <textarea id="dash-i-service" rows="4" placeholder="Describe exactly what you need..."></textarea>
          </div>

          <button class="btn btn-primary" id="btn-submit-dash-inquiry">Submit Request</button>
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

        <div class="card" style="background:var(--gradient); border:none;">
          <div class="card-body" style="color:#fff;">
            <h3 style="margin-bottom:8px;">Need Tech Support?</h3>
            <p style="font-size:0.9rem; margin-bottom:20px; opacity:0.9;">Have a technical issue or hardware failure? Use our ticket system for deep tracking.</p>
            <button class="btn btn-secondary" style="width:100%; background:rgba(255,255,255,0.2); backdrop-filter:blur(10px); border:none; color:#fff;" id="goto-tickets">Go to My Tickets</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Handle Inquiry Submission
  const bind = (sel, cb) => {
    const el = container.querySelector(sel);
    if (el) el.onclick = cb;
  };

  bind('#btn-submit-dash-inquiry', async () => {
    const btn = container.querySelector('#btn-submit-dash-inquiry');
    const name = container.querySelector('#dash-i-name').value.trim();
    const phone = container.querySelector('#dash-i-phone').value.trim();
    const service = container.querySelector('#dash-i-service').value.trim();

    if (!name || !phone || !service) {
      toast('Please fill in Name, Phone, and Service', 'warning');
      return;
    }

    btn.disabled = true; btn.textContent = 'Submitting...';

    // DIRECT TICKET CREATION: Since they are logged in, create a ticket directly
    const { data: ticket, error } = await supabase.from('tickets').insert({
      client_id: user.id,
      title: `Service Request: ${service.slice(0, 30)}`,
      description: `Requirement: ${service}\n\nClient Contact: ${phone}\nLocation: ${container.querySelector('#dash-i-loc').value.trim()}`,
      category: 'service_request',
      status: 'open',
      priority: 'medium'
    }).select().single();

    if (error) {
      toast(error.message, 'error');
      btn.disabled = false; btn.textContent = 'Submit Request';
    } else {
      toast('Ticket created and assigned to our team!', 'success');
      container.querySelector('#dash-i-service').value = '';
      btn.disabled = false; btn.textContent = 'Submit Request';

      // Auto-navigate to tickets after a short delay
      setTimeout(() => {
        const navItem = document.querySelector('[data-nav="my-tickets"]');
        if (navItem) navItem.click();
      }, 1500);
    }
  });

  bind('#goto-tickets', () => {
    const navItem = document.querySelector('[data-nav="my-tickets"]');
    if (navItem) navItem.click();
  });

  loadMiniStats(container.querySelector('#client-mini-stats'), user.id);
}

async function loadMiniStats(el, userId) {
  const { data: t } = await supabase.from('tickets').select('status').eq('client_id', userId);
  const tickets = t || [];
  const open = tickets.filter(x => ['open', 'assigned', 'in_progress'].includes(displayStatus(x.status))).length;
  const resolved = tickets.filter(x => displayStatus(x.status) === 'resolved').length;

  el.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:var(--text2); font-weight:500;">Active Tasks</span>
        <span class="badge badge-open">${open}</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:var(--text2); font-weight:500;">Completed</span>
        <span class="badge badge-resolved">${resolved}</span>
      </div>
    </div>
  `;
}

// ── CLIENT TICKETS PAGE (Responsive) ──────────────────
export async function renderClientTickets(container) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: tickets } = await supabase.from('tickets').select('*').eq('client_id', user.id).order('created_at', { ascending: false });
  const list = tickets || [];

  container.innerHTML = `
    <div class="page-header">
      <h1>My Tickets</h1>
      <p>Track your support requests</p>
    </div>
    
    <div class="filter-bar">
      <div class="search-input-wrap">
        <span>🔍</span>
        <input class="search-input" id="search" placeholder="Search by title..."/>
      </div>
      <div style="display:flex; gap:12px; flex:1; min-width:300px;">
        <select id="status-filter" style="flex:1; background:var(--bg3); border:1px solid var(--border); border-radius:12px;  border-color:#000; padding:0 16px; color:#000; outline:none;">
          <option value="">All Statuses</option>
          <option value="open">Received</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <button class="btn btn-primary" id="new-ticket-btn" style="width:auto; white-space:nowrap;">+ New Ticket</button>
      </div>
    </div>

    <div id="tickets-list" class="grid-layout" style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 350px), 1fr));"></div>
  `;

  let filtered = [...list];
  const render = () => renderTicketList(container.querySelector('#tickets-list'), filtered, user.id, () => renderClientTickets(container));

  container.querySelector('#search').oninput = e => {
    const q = e.target.value.toLowerCase();
    filtered = list.filter(t => t.title.toLowerCase().includes(q));
    render();
  };
  container.querySelector('#status-filter').onchange = e => {
    filtered = e.target.value ? list.filter(t => displayStatus(t.status) === e.target.value) : [...list];
    render();
  };

  render();
  bind('#new-ticket-btn', () => openTicketModal(user.id, () => renderClientTickets(container)));
}

function renderTicketList(el, tickets, userId, refresh) {
  if (!tickets.length) {
    el.innerHTML = `<div class="card" style="grid-column: 1/-1; text-align:center; padding:60px 20px;">
      <div style="font-size:3rem; margin-bottom:16px;">🎫</div>
      <h3 style="margin-bottom:8px;">No tickets found</h3>
      <p style="color:var(--text3);">Try changing your search or create a new ticket.</p>
    </div>`;
    return;
  }
  el.innerHTML = tickets.map(t => `
    <div class="ticket-card priority-${t.priority || 'medium'}" data-id="${t.id}" 
         style="background:var(--bg2); border:1px solid var(--border); border-radius:20px; padding:24px; cursor:pointer; transition:0.2s; position:relative; overflow:hidden;">
      <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:var(--primary);"></div>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
        <span style="font-size:0.75rem; color:var(--text3); font-family:monospace;">#${t.id.slice(0, 8)}</span>
        <span class="badge badge-${displayStatus(t.status)}">${statusText(t.status)}</span>
      </div>
      <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:12px; color:var(--text);">${t.title}</h3>
      <div style="font-size:0.85rem; color:var(--text2); display:flex; align-items:center; gap:8px; border-top:1px solid var(--border); padding-top:16px;">
        <span>📅 ${formatDate(t.created_at)}</span>
        <span style="margin-left:auto; color:var(--primary); font-weight:600;">View Details →</span>
      </div>
    </div>`).join('');

  el.querySelectorAll('.ticket-card').forEach(card => {
    card.onclick = () => openTicketDetail(card.dataset.id, refresh);
  });
}

function openTicketModal(clientId, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header"><span class="modal-title">New Support Ticket</span><button class="modal-close" id="close-modal">✕</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Issue Title</label><input type="text" id="t-title" placeholder="e.g. CCTV Camera 4 is offline" required/></div>
        <div class="grid-layout" style="grid-template-columns: 1fr 1fr; gap:16px;">
          <div class="form-group"><label>Category</label>
            <select id="t-category">
              <option value="network">Network Issue</option><option value="hardware">Hardware</option><option value="software">Software</option><option value="other">Other</option>
            </select>
          </div>
          <div class="form-group"><label>Priority</label>
            <select id="t-priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select>
          </div>
        </div>
        <div class="form-group"><label>Detailed Description</label><textarea id="t-desc" rows="5" placeholder="Please provide as much detail as possible..."></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-modal">Cancel</button>
        <button class="btn btn-primary" id="submit-ticket">Submit Ticket</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#close-modal').onclick = overlay.querySelector('#cancel-modal').onclick = () => overlay.remove();
  overlay.querySelector('#submit-ticket').onclick = async () => {
    const title = overlay.querySelector('#t-title').value.trim();
    if (!title) { toast('Please enter a title', 'error'); return; }
    const btn = overlay.querySelector('#submit-ticket');
    btn.disabled = true; btn.textContent = 'Submitting...';

    const { error } = await supabase.from('tickets').insert({
      client_id: clientId, title,
      category: overlay.querySelector('#t-category').value,
      priority: overlay.querySelector('#t-priority').value,
      description: overlay.querySelector('#t-desc').value.trim()
    });

    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = 'Submit Ticket'; }
    else { toast('Ticket created!', 'success'); overlay.remove(); onSave(); }
  };
}

async function openTicketDetail(ticketId, onClose) {
  const { data: t } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
  const { data: comments } = await supabase.from('ticket_comments').select('*, profiles(full_name)').eq('ticket_id', ticketId).order('created_at');
  if (!t) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:700px">
      <div class="modal-header">
        <div><div class="modal-title">${t.title}</div><div style="font-size:.75rem;color:var(--text3);">#${t.id.slice(0, 8)}</div></div>
        <button class="modal-close" id="cd">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex; gap:8px; margin-bottom:20px;">
          <span class="badge badge-${displayStatus(t.status)}">${statusText(t.status)}</span>
          <span class="badge badge-urgent">${t.priority} priority</span>
        </div>
        <div style="background:rgba(255,255,255,0.03); padding:20px; border-radius:16px; margin-bottom:32px; border:1px solid var(--border);">
          <p style="color:var(--text); line-height:1.6; white-space:pre-wrap;">${t.description || 'No description provided.'}</p>
        </div>
        
        <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:16px;">💬 Communication History</h3>
        <div id="comments-list" style="margin-bottom:24px; max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
          ${(comments || []).length === 0 ? '<p style="color:var(--text3); font-style:italic;">No comments yet.</p>' :
      comments.map(c => `
            <div style="background:var(--bg3); border-radius:12px; padding:16px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="font-weight:700; font-size:.85rem; color:var(--primary);">${c.profiles?.full_name || 'User'}</span>
                <span style="font-size:.75rem; color:var(--text3)">${formatDateTime(c.created_at)}</span>
              </div>
              <div style="font-size:.95rem; color:var(--text); line-height:1.5;">${c.content}</div>
            </div>`).join('')}
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <textarea id="new-comment" rows="3" placeholder="Add a message or update..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cd2">Close</button>
        <button class="btn btn-primary" id="add-c" style="width:auto;">Send Message</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const cdBtn = overlay.querySelector('#cd');
  if (cdBtn) cdBtn.onclick = () => { overlay.remove(); onClose && onClose(); };
  const cd2Btn = overlay.querySelector('#cd2');
  if (cd2Btn) cd2Btn.onclick = () => { overlay.remove(); onClose && onClose(); };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { overlay.remove(); onClose && onClose(); }
  });

  overlay.querySelector('#add-c').onclick = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const content = overlay.querySelector('#new-comment').value.trim();
    if (!content) return;
    const btn = overlay.querySelector('#add-c');
    btn.disabled = true; btn.textContent = 'Sending...';

    await supabase.from('ticket_comments').insert({ ticket_id: ticketId, user_id: user.id, content });
    toast('Message sent', 'success');
    overlay.remove();
    openTicketDetail(ticketId, onClose);
  };
}
