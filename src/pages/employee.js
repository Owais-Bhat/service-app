import { supabase } from '../supabase.js';
import { toast, formatDate, formatTime } from '../utils.js';
import { ICONS } from '../icons.js';

export async function renderEmployeeDashboard(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const today = new Date().toLocaleDateString('en-CA');
  let attendance, tasks, eodReport, pendingInquiries = [], acceptedInquiries = [];

  try {
    const res = await Promise.all([
      supabase.from('attendance').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('tickets').select('*, inquiries(*)').eq('assigned_to', user.id).order('created_at', { ascending: false }),
      supabase.from('eod_reports').select('*').eq('employee_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('inquiries').select('*').eq('assigned_employee_id', user.id).in('assignment_status', ['pending', 'accepted']),
      supabase.from('profiles').select('phone,company'),
    ]);
    attendance = res[0].data; tasks = res[1].data; eodReport = res[2].data;
    const allInquiries = res[3].data || [];
    const profilesData = res[4].data || [];

    // Build phone → company map for labelling service jobs
    const phoneToCompany = new Map();
    profilesData.forEach(pr => { if (pr.phone) phoneToCompany.set(pr.phone, pr.company); });

    pendingInquiries = allInquiries.filter(x => x.assignment_status === 'pending');
    acceptedInquiries = allInquiries
      .filter(x => x.assignment_status === 'accepted')
      .map(x => ({ ...x, _company: phoneToCompany.get(x.phone) || null }));
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);display:inline-flex;align-items:center;gap:8px;">${ICONS.alert}<span>Error</span></h3><p>${err.message}</p></div></div>`;
    return;
  }

  const t = tasks || [];
  const activeTasks = t.filter(x => x.status !== 'closed' && x.status !== 'resolved');
  const isClockedIn = !!attendance?.clock_in;
  const isClockedOut = !!attendance?.clock_out;

  container.innerHTML = `
    <div class="page-header">
      <h1 style="display:flex; align-items:center; gap:12px;">
        <span style="width:32px; height:32px; display:flex; color:var(--primary);">${ICONS.staff}</span>
        <span>Employee Portal</span>
      </h1>
      <p>Today is ${new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
    </div>

    ${pendingInquiries.length > 0 ? `
      <div class="card" style="border: 2px solid var(--primary); background: rgba(16, 185, 129, 0.05);">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.alert}<span>New Assignments Pending</span></span></div>
        <div class="card-body">
          ${pendingInquiries.map(pi => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-soft); border-radius:12px; margin-bottom:10px; box-shadow:var(--neu-sm);">
              <div>
                <div style="font-weight:700">${pi.full_name} - ${pi.service_item}</div>
                <div style="font-size:0.8rem; color:var(--text-soft)">Preferred: ${pi.preferred_time || 'Flexible'}</div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-primary btn-sm accept-btn" data-id="${pi.id}">${ICONS.check} Accept</button>
                <button class="btn btn-danger btn-sm decline-btn" data-id="${pi.id}">${ICONS.close} Decline</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value stat-value-inline" style="color:${isClockedIn ? 'var(--success)' : 'var(--text-dim)'};">
          <span style="width:24px; height:24px; display:flex;">${isClockedIn ? ICONS.check : ICONS.pause}</span>
          <span>${isClockedIn ? 'Clocked In' : 'Not Started'}</span>
        </div>
        <div class="stat-label">${isClockedIn ? 'Since ' + formatTime(attendance.clock_in) : 'Tap Clock In to start'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-inline" style="color:var(--warning)">
          <span style="width:24px; height:24px; display:flex;">${ICONS.wrench}</span>
          <span>${activeTasks.length}</span>
        </div>
        <div class="stat-label">Active Tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-inline" style="color:var(--success)">
          <span style="width:24px; height:24px; display:flex;">${ICONS.check}</span>
          <span>${t.filter(x => x.status === 'resolved').length}</span>
        </div>
        <div class="stat-label">Completed</div>
      </div>
    </div>

    <div class="grid-2">
      <!-- Attendance Card -->
      <div class="card">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.clock}<span>Attendance</span></span></div>
        <div class="card-body" style="text-align:center;padding:32px">
          <div id="live-clock" style="font-size:2.8rem;font-weight:800;color:var(--primary);letter-spacing:-2px;margin-bottom:24px;font-variant-numeric:tabular-nums;">--:--:--</div>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-clock-in" ${isClockedIn ? 'disabled' : ''}>
              ${ICONS.play}<span>Clock In</span>
            </button>
            <button class="btn btn-secondary" id="btn-clock-out" ${(!isClockedIn || isClockedOut) ? 'disabled' : ''}>
              ${ICONS.pause}<span>Clock Out</span>
            </button>
          </div>
          ${attendance?.location ? `<p style="margin-top:16px;font-size:0.8rem;color:var(--text-dim);display:inline-flex;align-items:center;gap:6px;">${ICONS.pin}<span>${attendance.location}</span></p>` : ''}
          ${isClockedOut ? `<div style="margin-top:20px;padding:14px;border-radius:14px;box-shadow:var(--neu-in);background:var(--bg);font-size:.88rem;color:var(--success);font-weight:600;display:inline-flex;align-items:center;gap:8px;">
            ${ICONS.check}<span>Session: ${formatTime(attendance.clock_in)} → ${formatTime(attendance.clock_out)}</span>
          </div>` : ''}
        </div>
      </div>

      <!-- EOD Report Card -->
      <div class="card">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.clipboard}<span>End of Day Summary</span></span></div>
        <div class="card-body">
          ${eodReport ? `
            <div class="eod-done">
              <div class="eod-done-ring">${ICONS.check}</div>
              <h3 class="eod-done-title">All caught up!</h3>
              <p class="eod-done-sub">Your EOD report has been submitted.</p>
              <div class="eod-done-time">Submitted at ${formatTime(eodReport.created_at)}</div>
            </div>
          ` : `
            <div class="form-group">
              <label class="sr-icon-label">${ICONS.edit}<span>Today's progress</span></label>
              <textarea id="eod-content" rows="6"
                placeholder="What did you achieve today? Break it down briefly…"></textarea>
            </div>
            <button class="btn btn-primary btn-wide" id="btn-submit-eod" style="display:flex; align-items:center; justify-content:center; gap:10px;">
              <span>Submit Daily Report</span>
              <span style="width:18px; height:18px; display:flex;">${ICONS.arrowRight}</span>
            </button>
            <p class="eod-fineprint">Reports are visible to your manager immediately.</p>
          `}
        </div>
      </div>

      <!-- Leave Request Card -->
      <div class="card">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.clock}<span>Request Leave</span></span></div>
        <div class="card-body">
          <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:16px;">Need time off? Submit your request here for approval.</p>
          <button class="btn btn-secondary btn-wide" id="btn-open-leave-modal">
            ${ICONS.plus}<span>Submit Leave Request</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- Active Service Jobs -->
    <div class="card">
      <div class="card-header">
        <span class="card-title sr-icon-title" style="color:var(--primary)">${ICONS.users}<span>Active Service Jobs (Accepted)</span></span>
      </div>
      ${acceptedInquiries.length > 0 ? (() => {
        const companies = [...new Set(acceptedInquiries.map(x => x._company).filter(Boolean))];
        return companies.length > 0 ? `
          <div class="sr-filter-bar" style="padding:0 20px 12px" id="emp-company-tabs">
            <button class="sr-filter active" data-company="all">
              <span>All</span><span class="sr-filter-count">${acceptedInquiries.length}</span>
            </button>
            ${companies.map(c => `
              <button class="sr-filter" data-company="${c}">
                <span>${c}</span>
                <span class="sr-filter-count">${acceptedInquiries.filter(x => x._company === c).length}</span>
              </button>
            `).join('')}
          </div>` : '';
      })() : ''}
      <div class="card-body" id="emp-jobs-list">
        ${acceptedInquiries.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-dim)">No active jobs accepted yet.</div>' :
          acceptedInquiries.map(inq => `
            <div class="emp-job-card" data-company="${inq._company || ''}" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-in); margin-bottom:20px; border:1px solid var(--border);">
               <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                 <div>
                   <div style="font-weight:800; font-size:1.2rem; color:var(--primary)">${inq.full_name}</div>
                   ${inq._company ? `<div style="font-size:0.78rem;font-weight:700;color:var(--text-dim);margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">${inq._company}</div>` : ''}
                   <div style="font-size:0.9rem; color:var(--text-soft); margin-top:4px;"><b>Ticket:</b> ${inq.ticket_no || '—'}</div>
                   <div style="font-size:0.9rem; color:var(--text-soft); margin-top:4px;">${inq.service_item}</div>
                 </div>
                 <span class="badge badge-assigned" style="font-size:0.75rem">${inq.status.replace('_',' ')}</span>
               </div>

               <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-top:16px; padding-top:16px; border-top:1px solid rgba(16,185,129,0.1);">
                 <div>
                   <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Contact Info</div>
                   <div style="display:flex; align-items:center; gap:12px; margin-top:8px;">
                     <span style="font-weight:700; font-size:1rem">${inq.phone}</span>
                     <div style="display:flex; gap:8px;">
                       <a href="tel:${inq.phone}" style="display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:var(--primary); color:white; box-shadow:0 4px 10px rgba(16,185,129,0.2);">
                         <span style="width:18px;height:18px;display:flex;">${ICONS.phone}</span>
                       </a>
                       <a href="https://wa.me/${inq.phone.replace(/\D/g,'')}" target="_blank" style="display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:#25D366; color:white; box-shadow:0 4px 10px rgba(37,211,102,0.2);">
                         <span style="width:18px;height:18px;display:flex;">${ICONS.whatsapp}</span>
                       </a>
                     </div>
                   </div>
                 </div>
                 <div>
                   <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Service Location</div>
                   <div style="font-size:0.95rem; font-weight:600; margin-top:8px; display:flex; align-items:flex-start; gap:8px;">
                     <span style="width:20px;height:20px;display:flex;flex-shrink:0;color:var(--primary)">${ICONS.pin}</span>
                     <span style="line-height:1.4">${inq.location || '—'}</span>
                   </div>
                 </div>
                 <div>
                   <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Preferred Time</div>
                   <div style="font-size:0.95rem; font-weight:700; margin-top:8px; color:var(--primary)">${inq.preferred_time || 'Flexible'}</div>
                 </div>
               </div>

               <div style="margin-top:24px; display:flex; gap:12px;">
                 <button class="btn btn-secondary btn-sm task-btn" data-id="${inq.ticket_id}" data-inq-id="${inq.id}" data-status="${inq.status}" style="flex:1; height:44px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
                   <span style="width:18px;height:18px;display:flex;">${ICONS.edit}</span> Update Status
                 </button>
                 <button class="btn btn-primary btn-sm" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inq.location)}')" style="flex:1; height:44px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
                   <span style="width:18px;height:18px;display:flex;">${ICONS.pin}</span> Open Maps
                 </button>
               </div>
            </div>
          `).join('')}
      </div>
    </div>

    <!-- Tasks Section -->
    <div class="card">
      <div class="card-header">
        <span class="card-title sr-icon-title">${ICONS.ticket}<span>My Tasks & Details</span></span>
        <span class="badge badge-open">${activeTasks.length} active</span>
      </div>
      <div class="card-body">
        ${t.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-dim)">No tasks assigned yet.</div>' : 
          t.map(task => {
            const inq = task.inquiries?.[0]; // Get the linked inquiry if it exists
            return `
              <div style="padding:16px; border-radius:16px; background:var(--bg-soft); box-shadow:var(--neu-sm); margin-bottom:16px; border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div style="flex:1">
                    <div style="font-weight:800; font-size:1.05rem; color:var(--text)">${task.title}</div>
                    <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;">${task.description || 'No description provided.'}</div>
                  </div>
                  <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                    <span class="badge badge-${task.status}">${task.status.replace('_',' ')}</span>
                    <span class="badge badge-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
                  </div>
                </div>
                
                ${inq ? `
                  <div style="margin-top:16px; padding:12px; background:var(--bg); border-radius:12px; border:1px dashed var(--primary);">
                    <div style="font-size:0.75rem; color:var(--primary); font-weight:800; text-transform:uppercase; margin-bottom:8px;">Linked Service Request</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                      <div>
                        <div style="font-size:0.7rem; color:var(--text-dim)">Client</div>
                        <div style="font-size:0.85rem; font-weight:700">${inq.full_name}</div>
                      </div>
                      <div>
                        <div style="font-size:0.7rem; color:var(--text-dim)">Contact</div>
                        <div style="font-size:0.85rem; font-weight:700; display:flex; align-items:center; gap:6px;">
                          ${inq.phone}
                          <a href="tel:${inq.phone}" style="color:var(--primary); display:flex;"><span style="width:14px;height:14px;display:flex;">${ICONS.phone}</span></a>
                        </div>
                      </div>
                      <div style="grid-column: span 2">
                        <div style="font-size:0.7rem; color:var(--text-dim)">Location</div>
                        <div style="font-size:0.85rem; font-weight:600; display:flex; align-items:flex-start; gap:6px;">
                          <span style="width:14px;height:14px;display:flex;flex-shrink:0;color:var(--primary);margin-top:2px;">${ICONS.pin}</span>
                          ${inq.location || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                ` : ''}
                
                <div style="margin-top:16px; display:flex; gap:8px;">
                  <button class="btn btn-secondary btn-sm task-btn" data-id="${task.id}" data-inq-id="${inq ? inq.id : ''}" data-status="${task.status}" style="flex:1; height:38px; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <span style="width:14px;height:14px;display:flex;">${ICONS.edit}</span> Update Status
                  </button>
                  ${inq ? `
                    <button class="btn btn-primary btn-sm" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inq.location)}')" style="flex:1; height:38px; display:flex; align-items:center; justify-content:center; gap:6px;">
                      <span style="width:14px;height:14px;display:flex;">${ICONS.pin}</span> Route
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
      </div>
    </div>
  `;

  // Live clock
  const clockEl = container.querySelector('#live-clock');
  const tick = () => { if (clockEl) clockEl.textContent = new Date().toLocaleTimeString(); };
  tick(); setInterval(tick, 1000);

  // Company filter tabs for service jobs
  const tabBar = container.querySelector('#emp-company-tabs');
  if (tabBar) {
    tabBar.querySelectorAll('.sr-filter').forEach(btn => {
      btn.onclick = () => {
        tabBar.querySelectorAll('.sr-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const company = btn.dataset.company;
        container.querySelectorAll('.emp-job-card').forEach(card => {
          card.style.display = (company === 'all' || card.dataset.company === company) ? '' : 'none';
        });
      };
    });
  }

  const bind = (sel, cb) => {
    const el = container.querySelector(sel);
    if (el) el.onclick = cb;
  };

  // Clock In
  bind('#btn-clock-in', async () => {
    const btn = container.querySelector('#btn-clock-in');
    btn.disabled = true; btn.textContent = 'Getting location…';
    let locationStr = 'Unknown';
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await res.json();
        locationStr = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      } catch (err) {
        locationStr = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    } catch (_) {}

    const { error } = await supabase.from('attendance').insert({
      user_id: user.id, clock_in: new Date().toISOString(), date: today, location: locationStr, status: 'present'
    });
    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = '✅ Clock In'; }
    else { toast('Clocked in!', 'success'); renderEmployeeDashboard(container); }
  });

  // Clock Out
  bind('#btn-clock-out', async () => {
    const { error } = await supabase.from('attendance').update({ clock_out: new Date().toISOString() })
      .eq('user_id', user.id).eq('date', today);
    if (error) toast(error.message, 'error');
    else { toast('Clocked out!', 'success'); renderEmployeeDashboard(container); }
  });

  // EOD
  const eodBtn = container.querySelector('#btn-submit-eod');
  if (eodBtn) {
    bind('#btn-submit-eod', async () => {
      const content = container.querySelector('#eod-content').value.trim();
      if (!content) { toast('Please write your report', 'warning'); return; }
      const eodBtnActual = container.querySelector('#btn-submit-eod');
      eodBtnActual.disabled = true; eodBtnActual.textContent = 'Submitting…';
      const { error } = await supabase.from('eod_reports').insert({ employee_id: user.id, content, date: today });
      if (error) { toast(error.message, 'error'); eodBtnActual.disabled = false; eodBtnActual.textContent = 'Submit Report →'; }
      else { toast('EOD Report submitted!', 'success'); renderEmployeeDashboard(container); }
    });
  }

  // Leave Request
  bind('#btn-open-leave-modal', () => openLeaveModal(user.id, () => renderEmployeeDashboard(container)));

  // Task update buttons
  container.querySelectorAll('.task-btn').forEach(btn => {
    btn.onclick = () => openTaskModal(btn.dataset.id, btn.dataset.inqId, btn.dataset.status, () => renderEmployeeDashboard(container));
  });

  // Accept/Decline logic
  container.querySelectorAll('.accept-btn').forEach(btn => {
    btn.onclick = async () => {
      const { error } = await supabase.from('inquiries').update({ assignment_status: 'accepted' }).eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Task accepted!', 'success'); renderEmployeeDashboard(container); }
    };
  });

  container.querySelectorAll('.decline-btn').forEach(btn => {
    btn.onclick = () => {
      const reason = prompt('Please provide a reason for declining:');
      if (reason === null) return;
      if (!reason.trim()) { toast('Reason is required to decline', 'warning'); return; }
      
      (async () => {
        const { error } = await supabase.from('inquiries').update({ 
          assignment_status: 'declined', 
          decline_reason: reason.trim(),
          status: 'open' // Put back to open for re-assignment
        }).eq('id', btn.dataset.id);
        
        if (error) toast(error.message, 'error');
        else { toast('Task declined', 'info'); renderEmployeeDashboard(container); }
      })();
    };
  });

  // Real-time listener for new assignments
  const channel = supabase.channel(`employee-jobs-${user.id}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'inquiries',
      filter: `assigned_employee_id=eq.${user.id}`
    }, payload => {
      if (payload.eventType === 'INSERT' || (payload.eventType === 'UPDATE' && payload.new.assignment_status === 'pending')) {
        toast('New Job Assigned!', 'info');
        renderEmployeeDashboard(container);
      } else if (payload.eventType === 'UPDATE') {
        // Just refresh to update statuses etc.
        renderEmployeeDashboard(container);
      }
    })
    .subscribe();

  // Cleanup
  const checkRemoval = setInterval(() => {
    if (!document.body.contains(container)) {
      supabase.removeChannel(channel);
      clearInterval(checkRemoval);
    }
  }, 5000);
}

function openTaskModal(taskId, inqId, currentStatus, onDone) {
  (async () => {
    const { data: pricing } = await supabase.from('service_pricing').select('*').order('name');
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:450px">
        <div class="modal-header">
          <span class="modal-title">Update Task Status</span>
          <button class="modal-close" id="cm">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>New Status</label>
            <select id="new-status">
              <option value="open" ${currentStatus==='open'?'selected':''}>Open</option>
              <option value="in_progress" ${currentStatus==='in_progress'?'selected':''}>In Progress</option>
              <option value="resolved" ${currentStatus==='resolved'?'selected':''}>Resolved</option>
              <option value="closed" ${currentStatus==='closed'?'selected':''}>Closed</option>
              <option value="issue_not_resolved" ${currentStatus==='issue_not_resolved'?'selected':''}>Issue Not Resolved</option>
            </select>
          </div>

          <div id="pricing-section" style="display:${currentStatus==='resolved'||currentStatus==='closed'?'block':'none'}; margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
            <label style="font-weight:700; margin-bottom:8px; display:block;">Select Services Performed</label>
            <div style="max-height:150px; overflow-y:auto; padding:10px; background:var(--bg-soft); border-radius:10px; margin-bottom:12px;">
              ${(pricing || []).map(p => `
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer;">
                  <input type="checkbox" class="service-chk" data-id="${p.id}" data-cost="${p.cost}" />
                  <span style="font-size:0.9rem;">${p.name} (₹${p.cost})</span>
                </label>
              `).join('')}
              ${(!pricing || pricing.length === 0) ? '<p style="font-size:0.8rem; color:var(--text-dim);">No standard services defined by Admin.</p>' : ''}
            </div>

            <div class="form-group">
              <label>Additional Charges (Optional)</label>
              <input type="number" id="extra-cost" placeholder="₹0" style="margin-bottom:8px;"/>
              <input type="text" id="extra-reason" placeholder="Reason for extra charge..."/>
            </div>

            <div style="padding:12px; background:var(--primary-soft); border-radius:10px; text-align:right; margin-bottom:16px;">
              <span style="font-size:0.85rem; color:var(--text-dim);">Total Estimated Bill:</span>
              <div style="font-size:1.4rem; font-weight:800; color:var(--primary);" id="total-bill-display">₹0</div>
            </div>

            <!-- Payment Link + QR -->
            <div style="padding:14px; background:var(--bg-soft); border-radius:14px; border:1px solid var(--border);">
              <div style="font-weight:700; font-size:0.85rem; margin-bottom:10px; color:var(--text)">💳 Payment Link & QR</div>
              <div style="display:flex; gap:8px; margin-bottom:10px;">
                <input id="emp-pay-link" type="url" placeholder="Payment link will appear here…" style="flex:1; font-size:0.82rem;" readonly/>
                <button class="btn btn-secondary btn-sm" id="emp-gen-link" style="white-space:nowrap">✨ Generate</button>
              </div>
              <div id="emp-qr-wrap" style="display:none; text-align:center; margin-bottom:10px;">
                <img id="emp-qr-img" src="" alt="QR Code" style="width:160px; height:160px; border-radius:12px; border:2px solid var(--primary);"/>
                <div style="font-size:0.75rem; color:var(--text-dim); margin-top:6px;">Client can scan to pay</div>
              </div>
              <button class="btn btn-primary btn-sm" id="emp-share-wa" style="width:100%; display:none; gap:8px; justify-content:center;">
                ${ICONS.whatsapp}<span>Share via WhatsApp</span>
              </button>
            </div>
          </div>

          <div class="form-group" style="margin-top:16px;">
            <label>Work Details / Progress Update <span style="color:var(--danger)">*</span></label>
            <textarea id="progress-detail" rows="4" placeholder="Describe what you did... (Mandatory)"></textarea>
          </div>

          <!-- Feedback link (shown after saving) -->
          <div id="feedback-link-box" style="display:none; margin-top:12px; padding:12px; border-radius:12px; background:rgba(16,185,129,0.07); border:1px solid var(--primary);">
            <div style="font-size:0.78rem; font-weight:700; color:var(--primary); margin-bottom:6px;">📋 Feedback Link for Client</div>
            <div style="display:flex; gap:8px;">
              <input id="feedback-url" type="text" readonly style="flex:1; font-size:0.78rem; background:var(--bg);"/>
              <button class="btn btn-secondary btn-sm" id="copy-feedback-url">Copy</button>
            </div>
            <button class="btn btn-primary btn-sm" id="share-feedback-wa" style="width:100%; margin-top:8px; justify-content:center; gap:8px;">
              ${ICONS.whatsapp}<span>Share Feedback Link via WhatsApp</span>
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cm2">Cancel</button>
          <button class="btn btn-primary" id="save-update">Save Changes</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const statusSel = overlay.querySelector('#new-status');
    const pricingSec = overlay.querySelector('#pricing-section');
    const totalDisplay = overlay.querySelector('#total-bill-display');
    const extraInput = overlay.querySelector('#extra-cost');
    const checkboxes = overlay.querySelectorAll('.service-chk');

    const calcTotal = () => {
      let total = Number(extraInput.value) || 0;
      checkboxes.forEach(chk => { if (chk.checked) total += Number(chk.dataset.cost); });
      totalDisplay.textContent = `₹${total.toLocaleString('en-IN')}`;
    };

    statusSel.onchange = () => {
      pricingSec.style.display = (statusSel.value === 'resolved' || statusSel.value === 'closed') ? 'block' : 'none';
    };
    extraInput.oninput = calcTotal;
    checkboxes.forEach(chk => chk.onchange = calcTotal);

    // Payment link generation + QR
    let _payLink = '';
    const genBtn = overlay.querySelector('#emp-gen-link');
    const payLinkInput = overlay.querySelector('#emp-pay-link');
    const qrWrap = overlay.querySelector('#emp-qr-wrap');
    const qrImg = overlay.querySelector('#emp-qr-img');
    const shareWaBtn = overlay.querySelector('#emp-share-wa');

    const showQR = (url) => {
      _payLink = url;
      payLinkInput.value = url;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
      qrWrap.style.display = 'block';
      shareWaBtn.style.display = 'flex';
    };

    if (genBtn) {
      genBtn.onclick = async () => {
        const total = Number(overlay.querySelector('#total-bill-display').textContent.replace(/[^\d]/g,''));
        if (!total) { toast('Select services or enter a bill amount first', 'warning'); return; }

        const { data: inqData } = await supabase.from('inquiries').select('full_name,phone,service_item,ticket_no').eq('id', inqId).single();
        if (!inqData) { toast('Could not load inquiry details', 'error'); return; }

        genBtn.disabled = true; genBtn.textContent = '…';
        try {
          const token = localStorage.getItem('auth_token') || (await supabase.auth.getSession()).data.session?.access_token;
          const res = await fetch('/api/payments/create-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              amount: total,
              description: `Service: ${inqData.service_item}`,
              ticket_no: inqData.ticket_no,
              customer: { name: inqData.full_name, phone: inqData.phone }
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed');
          showQR(data.short_url);
          // Save payment link back to the inquiry
          await supabase.from('inquiries').update({ payment_link: data.short_url, bill_amount: total }).eq('id', inqId);
          toast('Payment link generated!', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          genBtn.disabled = false; genBtn.textContent = '✨ Generate';
        }
      };
    }

    if (shareWaBtn) {
      shareWaBtn.onclick = () => {
        if (_payLink) window.open(`https://wa.me/?text=${encodeURIComponent('Please use this link to pay for your service: ' + _payLink)}`, '_blank');
      };
    }

    overlay.querySelector('#cm').onclick = overlay.querySelector('#cm2').onclick = () => overlay.remove();
    overlay.querySelector('#save-update').onclick = async () => {
      const newStatus = statusSel.value;
      const detail = overlay.querySelector('#progress-detail').value.trim();
      
      if (!detail) { toast('Please provide details of your work', 'warning'); return; }

      const btn = overlay.querySelector('#save-update');
      btn.disabled = true; btn.textContent = 'Saving...';

      let totalBill = 0;
      const selectedServiceIds = [];
      if (newStatus === 'resolved' || newStatus === 'closed') {
        totalBill = Number(extraInput.value) || 0;
        checkboxes.forEach(chk => {
          if (chk.checked) {
            totalBill += Number(chk.dataset.cost);
            selectedServiceIds.push(chk.dataset.id);
          }
        });
      }

      const { data: { user } } = await supabase.auth.getUser();
      const ops = [supabase.from('tickets').update({ status: newStatus }).eq('id', taskId)];
      
      const inqUpdates = { status: newStatus };
      if (totalBill > 0) {
        inqUpdates.bill_amount = totalBill;
        inqUpdates.extra_cost = Number(extraInput.value) || 0;
        inqUpdates.extra_cost_reason = overlay.querySelector('#extra-reason').value.trim() || null;
      }

      if (inqId) {
        ops.push(supabase.from('inquiries').update(inqUpdates).eq('id', inqId));
      } else {
        ops.push(supabase.from('inquiries').update(inqUpdates).eq('ticket_id', taskId));
      }

      // Add services linking
      if (inqId && selectedServiceIds.length > 0) {
        ops.push(supabase.from('inquiry_services').insert(
          selectedServiceIds.map(sid => ({ inquiry_id: inqId, service_id: sid }))
        ));
      }

      // Add progress detail as a comment
      ops.push(supabase.from('ticket_comments').insert({
        ticket_id: taskId,
        user_id: user.id,
        content: `[Status: ${newStatus.replace('_', ' ')}] ${detail}${totalBill > 0 ? ` (Bill: ₹${totalBill})` : ''}`
      }));

      await Promise.all(ops);
      toast('Task updated!', 'success');

      if (newStatus === 'resolved' || newStatus === 'closed') {
        // Show feedback link for the client to use
        const { data: inqRow } = inqId
          ? await supabase.from('inquiries').select('ticket_no,phone').eq('id', inqId).single()
          : await supabase.from('inquiries').select('ticket_no,phone').eq('ticket_id', taskId).single();

        if (inqRow?.ticket_no) {
          const feedbackUrl = `${window.location.origin}/?tab=track&ticket=${inqRow.ticket_no}&phone=${inqRow.phone || ''}`;
          const fbBox = overlay.querySelector('#feedback-link-box');
          const fbInput = overlay.querySelector('#feedback-url');
          const copyBtn = overlay.querySelector('#copy-feedback-url');
          const waBtn = overlay.querySelector('#share-feedback-wa');
          if (fbBox && fbInput) {
            fbInput.value = feedbackUrl;
            fbBox.style.display = 'block';
            copyBtn.onclick = () => { navigator.clipboard.writeText(feedbackUrl); toast('Copied!', 'success'); };
            waBtn.onclick = () => window.open(`https://wa.me/${(inqRow.phone || '').replace(/\D/g,'')}?text=${encodeURIComponent('Thank you for choosing our service! Please share your feedback here: ' + feedbackUrl)}`, '_blank');
            btn.disabled = false; btn.textContent = 'Done';
            return;
          }
        }
      }

      overlay.remove();
      onDone();
    };
  })();
}

function openLeaveModal(employeeId, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:450px">
      <div class="modal-header">
        <span class="modal-title">Submit Leave Request</span>
        <button class="modal-close" id="cl">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
          <div class="form-group"><label>Start Date</label><input type="date" id="l-start" required/></div>
          <div class="form-group"><label>End Date</label><input type="date" id="l-end" required/></div>
        </div>
        <div class="form-group">
          <label>Reason for Leave</label>
          <textarea id="l-reason" rows="4" placeholder="Explain your reason..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cl2">Cancel</button>
        <button class="btn btn-primary" id="btn-submit-leave">Submit Request</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cl').onclick = overlay.querySelector('#cl2').onclick = () => overlay.remove();
  
  overlay.querySelector('#btn-submit-leave').onclick = async () => {
    const start = overlay.querySelector('#l-start').value;
    const end = overlay.querySelector('#l-end').value;
    const reason = overlay.querySelector('#l-reason').value.trim();

    if (!start || !end || !reason) { toast('Please fill in all fields', 'warning'); return; }

    const btn = overlay.querySelector('#btn-submit-leave');
    btn.disabled = true; btn.textContent = 'Submitting...';

    const { error } = await supabase.from('leave_requests').insert({
      employee_id: employeeId,
      start_date: start,
      end_date: end,
      reason,
      status: 'pending'
    });

    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = 'Submit Request'; }
    else { toast('Leave request submitted!', 'success'); overlay.remove(); onDone(); }
  };
}
