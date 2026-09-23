import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { toast, formatDate, formatTime, showLoader } from '../utils.js';

let currentDate = new Date();

export async function renderCalendarTab(container) {
  showLoader(container);

  let inquiries = [];
  let installations = [];

  try {
    const [inqRes, instRes] = await Promise.all([
      supabase.from('inquiries').select('id, full_name, ticket_no, service_item, preferred_time, created_at, status, location, assigned_employee_id'),
      supabase.from('installations').select('id, full_name, ticket_no, installation_type, preferred_date, preferred_time, status, address, assigned_employee_id')
    ]);
    
    if (inqRes.error) throw inqRes.error;
    if (instRes.error) throw instRes.error;
    
    inquiries = inqRes.data || [];
    installations = instRes.data || [];
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
            Schedule Calendar
          </h1>
          <p>View your scheduled visits, inquiries, and installations</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="btn btn-secondary" id="cal-prev" style="padding:8px 12px;">&lt; Prev</button>
          <h3 style="margin:0; min-width:150px; text-align:center;">${monthName}</h3>
          <button class="btn btn-secondary" id="cal-next" style="padding:8px 12px;">Next &gt;</button>
          <button class="btn btn-primary" id="cal-today" style="padding:8px 12px; margin-left:10px;">Today</button>
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
      
      // Filter events for this day
      const dayEvents = [];
      
      inquiries.forEach(inq => {
        const d = new Date(inq.created_at);
        if (d.toDateString() === cellDate.toDateString()) {
          dayEvents.push({ type: 'inquiry', data: inq });
        }
      });
      
      installations.forEach(inst => {
        const d = new Date(inst.preferred_date);
        if (d.toDateString() === cellDate.toDateString()) {
          dayEvents.push({ type: 'installation', data: inst });
        }
      });

      html += `
        <div style="min-height:120px; padding:8px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); background:${isToday ? 'var(--accent-soft)' : 'var(--bg)'}; display:flex; flex-direction:column; gap:6px;">
          <div style="text-align:right; font-weight:${isToday ? '800' : '600'}; color:${isToday ? 'var(--primary)' : 'var(--text)'}; font-size:1.1rem; margin-bottom:4px;">${day}</div>
          ${dayEvents.map(ev => {
            if (ev.type === 'inquiry') {
              return `<div style="background:var(--bg-soft); border-left:3px solid var(--info); padding:6px; border-radius:4px; font-size:0.75rem; box-shadow:var(--neu-sm); cursor:pointer;" title="${ev.data.full_name} - ${ev.data.service_item}">
                <div style="font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ev.data.full_name}</div>
                <div style="color:var(--text-dim); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ev.data.service_item}</div>
                ${ev.data.preferred_time ? `<div style="color:var(--info); font-weight:600; margin-top:2px;">🕒 ${ev.data.preferred_time}</div>` : ''}
              </div>`;
            } else {
              return `<div style="background:var(--bg-soft); border-left:3px solid var(--warning); padding:6px; border-radius:4px; font-size:0.75rem; box-shadow:var(--neu-sm); cursor:pointer;" title="${ev.data.full_name} - ${ev.data.installation_type}">
                <div style="font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ev.data.full_name}</div>
                <div style="color:var(--text-dim); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">⚙️ Install</div>
                ${ev.data.preferred_time ? `<div style="color:var(--warning); font-weight:600; margin-top:2px;">🕒 ${ev.data.preferred_time}</div>` : ''}
              </div>`;
            }
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
  };

  renderMonth();
}
