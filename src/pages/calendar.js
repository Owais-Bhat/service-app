import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { toast, formatDate, formatTime, showLoader } from '../utils.js';

let currentDate = new Date();

export async function renderCalendarTab(container) {
  showLoader(container);

  let installations = [];
  let profiles = [];

  try {
    const [instRes, profRes] = await Promise.all([
      supabase.from('installations').select('id, full_name, ticket_no, installation_type, preferred_date, preferred_time, status, address, assigned_employee_id'),
      supabase.from('profiles').select('id, full_name').eq('role', 'employee')
    ]);
    
    if (instRes.error) throw instRes.error;
    if (profRes.error) throw profRes.error;
    
    installations = instRes.data || [];
    profiles = profRes.data || [];
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    toast('Failed to load calendar data', 'error');
    container.innerHTML = `<div class="card"><div class="card-body"><h3>Error loading calendar</h3></div></div>`;
    return;
  }

  const renderMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    let html = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div>
          <h1 style="display:flex; align-items:center; gap:12px;">
            <span style="color:var(--primary);">${ICONS.clock}</span>
            Installation Calendar
          </h1>
          <p>View and manage scheduled installations</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="btn btn-secondary" id="cal-prev" style="padding:8px 12px;">&lt; Prev</button>
          <h3 style="margin:0; min-width:150px; text-align:center;">${monthName}</h3>
          <button class="btn btn-secondary" id="cal-next" style="padding:8px 12px;">Next &gt;</button>
          <button class="btn btn-primary" id="cal-today" style="padding:8px 12px; margin-left:10px;">Today</button>
          <button class="btn btn-success" id="cal-add" style="padding:8px 12px; margin-left:10px;">+ Add Installation</button>
        </div>
      </div>
      
      <div class="card" style="overflow:hidden;">
        <div style="display:grid; grid-template-columns: repeat(7, 1fr); background:var(--bg-soft); border-bottom:1px solid var(--border);">
          ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => 
            `<div style="padding:15px 10px; text-align:center; font-weight:700; color:var(--text-soft); border-right:1px solid var(--border);">${d}</div>`
          ).join('')}
        </div>
        <div style="display:grid; grid-template-columns: repeat(7, 1fr); background:var(--bg);">
    `;

    // Fill empty days at start
    for (let i = 0; i < firstDay; i++) {
      html += `<div style="min-height:120px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); background:var(--bg-soft); opacity:0.5;"></div>`;
    }

    // Fill days
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      const isToday = new Date().toDateString() === cellDate.toDateString();
      
      const dayEvents = [];
      installations.forEach(inst => {
        const d = new Date(inst.preferred_date);
        if (d.toDateString() === cellDate.toDateString()) {
          dayEvents.push(inst);
        }
      });

      html += `
        <div style="min-height:120px; padding:8px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); background:${isToday ? 'var(--accent-soft)' : 'var(--bg)'}; display:flex; flex-direction:column; gap:6px;">
          <div style="text-align:right; font-weight:${isToday ? '800' : '600'}; color:${isToday ? 'var(--primary)' : 'var(--text)'}; font-size:1.1rem; margin-bottom:4px;">${day}</div>
          ${dayEvents.map(ev => {
              const empName = profiles.find(p => p.id === ev.assigned_employee_id)?.full_name || 'Unassigned';
              return `<div style="background:var(--bg-soft); border-left:3px solid var(--warning); padding:6px; border-radius:4px; font-size:0.75rem; box-shadow:var(--neu-sm); cursor:pointer;" title="${ev.full_name} - ${ev.installation_type}">
                <div style="font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ev.full_name}</div>
                <div style="color:var(--text-dim); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ev.installation_type} (${empName})</div>
                ${ev.preferred_time ? `<div style="color:var(--warning); font-weight:600; margin-top:2px;">🕒 ${ev.preferred_time}</div>` : ''}
              </div>`;
          }).join('')}
        </div>
      `;
    }

    // Fill empty days at end
    const totalCells = firstDay + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      html += `<div style="min-height:120px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); background:var(--bg-soft); opacity:0.5;"></div>`;
    }

    html += `
        </div>
      </div>
      
      <!-- Modal for Adding Installation -->
      <div id="add-inst-modal" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">
        <div class="card" style="width:100%; max-width:500px; margin:20px; max-height:90vh; overflow-y:auto;">
            <div class="card-body">
                <h3>Add New Installation</h3>
                <form id="add-inst-form" style="display:flex; flex-direction:column; gap:15px; margin-top:15px;">
                    <div>
                        <label>Customer Name *</label>
                        <input type="text" id="inst-name" required class="form-control" />
                    </div>
                    <div>
                        <label>Phone Number *</label>
                        <input type="text" id="inst-phone" required class="form-control" />
                    </div>
                    <div>
                        <label>Location (City/Area) *</label>
                        <input type="text" id="inst-location" required class="form-control" />
                    </div>
                    <div>
                        <label>Address *</label>
                        <textarea id="inst-address" required class="form-control" rows="2"></textarea>
                    </div>
                    <div>
                        <label>Installation Type * (e.g., 4 Camera CCTV)</label>
                        <input type="text" id="inst-type" required class="form-control" />
                    </div>
                    <div style="display:flex; gap:10px;">
                        <div style="flex:1;">
                            <label>Date *</label>
                            <input type="date" id="inst-date" required class="form-control" />
                        </div>
                        <div style="flex:1;">
                            <label>Time</label>
                            <input type="time" id="inst-time" class="form-control" />
                        </div>
                    </div>
                    <div>
                        <label>Assign Employee</label>
                        <select id="inst-employee" class="form-control">
                            <option value="">-- Unassigned --</option>
                            ${profiles.map(p => `<option value="${p.id}">${p.full_name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label>Description / Details</label>
                        <textarea id="inst-desc" class="form-control" rows="2"></textarea>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <button type="submit" class="btn btn-primary" style="flex:1;">Save Installation</button>
                        <button type="button" id="close-inst-modal" class="btn btn-secondary" style="flex:1;">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    container.querySelector('#cal-prev').onclick = () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      renderMonth();
    };
    container.querySelector('#cal-next').onclick = () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      renderMonth();
    };
    container.querySelector('#cal-today').onclick = () => {
      currentDate = new Date();
      renderMonth();
    };
    
    const modal = container.querySelector('#add-inst-modal');
    container.querySelector('#cal-add').onclick = () => {
        modal.style.display = 'flex';
        // Pre-fill date if current view is this month? Default to today
        container.querySelector('#inst-date').value = new Date().toISOString().split('T')[0];
    };
    container.querySelector('#close-inst-modal').onclick = () => {
        modal.style.display = 'none';
    };
    
    container.querySelector('#add-inst-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        
        try {
            const ticketNo = 'INST-' + Math.floor(Math.random() * 1000000);
            
            const payload = {
                id: crypto.randomUUID(),
                ticket_no: ticketNo,
                full_name: document.getElementById('inst-name').value,
                phone: document.getElementById('inst-phone').value,
                location: document.getElementById('inst-location').value,
                address: document.getElementById('inst-address').value,
                installation_type: document.getElementById('inst-type').value,
                preferred_date: document.getElementById('inst-date').value,
                preferred_time: document.getElementById('inst-time').value || 'Anytime',
                assigned_employee_id: document.getElementById('inst-employee').value || null,
                description: document.getElementById('inst-desc').value || null,
                status: 'pending'
            };
            
            const { error } = await supabase.from('installations').insert([payload]);
            if (error) throw error;
            
            toast('Installation added successfully!', 'success');
            modal.style.display = 'none';
            // Refresh calendar tab
            renderCalendarTab(container);
        } catch (err) {
            console.error(err);
            toast(err.message || 'Error saving installation', 'error');
            btn.disabled = false;
            btn.textContent = 'Save Installation';
        }
    };
  };

  renderMonth();
}
